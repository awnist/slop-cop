import type { Violation } from '../types'
import { RULES } from '../rules'

export type LLMProvider = 'anthropic' | 'openai' | 'local'

export interface LocalConfig {
  baseUrl: string
  model: string
}

const SYSTEM_PROMPT = `You are an expert editor analyzing text for LLM-generated prose patterns.
You will be given a passage and asked to identify specific rhetorical and structural tells.
Be conservative — only flag clear, unambiguous instances.`

function buildLLMRulesPrompt(): string {
  const rules = RULES.filter(r => r.llmTier === 'sentence')
  const numbered = rules.map((r, i) =>
    `${i + 1}. "${r.id}": ${r.llmDetectionHint ?? r.description}`
  ).join('\n\n')
  return `Identify these patterns:\n\n${numbered}\n\nFor suggestedChange: rewrite only the matched span. Make it direct and concrete.`
}

// ── Document-level prompt (Sonnet / GPT-4.5) ────────────────────────────────

const DOCUMENT_SYSTEM_PROMPT = `You are an experienced editor reading a complete piece of writing to identify structural and compositional problems that only become visible at document scale — patterns that emerge across paragraphs rather than within a single sentence.
Be conservative — only flag clear, unambiguous cases.`

function buildDocumentRulesPrompt(): string {
  const rules = RULES.filter(r => r.llmTier === 'document')
  const numbered = rules.map((r, i) =>
    `${i + 1}. "${r.id}": ${r.llmDetectionHint ?? r.description}`
  ).join('\n\n')
  return `Read the entire piece as an editor. Identify these document-level patterns:\n\n${numbered}\n\nReturn only clear cases. If the piece is short, tight, or well-structured, return [].`
}

// ── Shared types and helpers ─────────────────────────────────────────────────

interface LLMResult {
  ruleId: string
  matchedText: string
  explanation: string
  suggestedChange: string
}

// Detect when the model wrote instructions instead of replacement text (used for inline suggestions)
const INSTRUCTION_PREFIX = /^(remove|delete|cut|eliminate|omit|replace|rewrite|revise|change|consider|rephrase)\b/i

function sanitizeSuggestedChange(suggestion: string, matchedText: string): string {
  if (!suggestion) return suggestion
  // If the suggestion is longer than the matched text by a large factor and starts
  // with an action verb, the model wrote instructions rather than replacement text.
  if (
    INSTRUCTION_PREFIX.test(suggestion.trim()) &&
    suggestion.length > matchedText.length * 1.5
  ) {
    return ''
  }
  return suggestion
}

function processViolations(text: string, items: LLMResult[]): Violation[] {
  const violations: Violation[] = []
  for (const item of items) {
    if (typeof item.ruleId !== 'string' || typeof item.matchedText !== 'string') continue
    if (!item.matchedText) continue
    const suggestion = sanitizeSuggestedChange(item.suggestedChange ?? '', item.matchedText)
    const idx = text.indexOf(item.matchedText)
    if (idx === -1) {
      const lower = text.toLowerCase()
      const fallbackIdx = lower.indexOf(item.matchedText.toLowerCase())
      if (fallbackIdx === -1) continue
      violations.push({
        ruleId: item.ruleId,
        startIndex: fallbackIdx,
        endIndex: fallbackIdx + item.matchedText.length,
        matchedText: text.slice(fallbackIdx, fallbackIdx + item.matchedText.length),
        explanation: item.explanation,
        suggestedChange: suggestion,
      })
    } else {
      violations.push({
        ruleId: item.ruleId,
        startIndex: idx,
        endIndex: idx + item.matchedText.length,
        matchedText: item.matchedText,
        explanation: item.explanation,
        suggestedChange: suggestion,
      })
    }
  }
  return violations
}

// ── Shared violation tool schema ─────────────────────────────────────────────

const VIOLATION_TOOL_NAME = 'submit_violations'
const VIOLATION_TOOL_DESCRIPTION = 'Submit all detected violations. Use an empty array if none found.'
const VIOLATION_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    violations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ruleId: { type: 'string', description: 'The rule ID being violated.' },
          matchedText: { type: 'string', description: 'The EXACT substring from the text, character-for-character.' },
          explanation: { type: 'string', description: 'One sentence explaining why this is a violation.' },
          suggestedChange: { type: 'string', description: 'Literal replacement text inserted verbatim, or "" to delete. Never write instructions.' },
        },
        required: ['ruleId', 'matchedText', 'explanation', 'suggestedChange'],
      },
    },
  },
  required: ['violations'],
}

function sentenceModelFor(provider: LLMProvider, localConfig?: LocalConfig): string {
  if (provider === 'local') return localConfig?.model ?? 'llama3.1'
  return provider === 'openai' ? 'gpt-4.1-mini' : 'claude-haiku-4-5-20251001'
}

function documentModelFor(provider: LLMProvider, localConfig?: LocalConfig): string {
  if (provider === 'local') return localConfig?.model ?? 'llama3.1'
  return provider === 'openai' ? 'gpt-4.1' : 'claude-sonnet-4-6'
}

function rewriteModelFor(provider: LLMProvider, localConfig?: LocalConfig): string {
  if (provider === 'local') return localConfig?.model ?? 'llama3.1'
  return provider === 'openai' ? 'gpt-4.1-mini' : 'claude-haiku-4-5-20251001'
}

function sentenceProgressFor(provider: LLMProvider, localConfig?: LocalConfig): string {
  if (provider === 'local') return `Analyzing with ${localConfig?.model ?? 'local model'} (sentence patterns)...`
  return provider === 'openai'
    ? 'Analyzing with OpenAI GPT-4.1 mini (sentence patterns)...'
    : 'Analyzing with Claude Haiku (sentence patterns)...'
}

function documentProgressFor(provider: LLMProvider, localConfig?: LocalConfig): string {
  if (provider === 'local') return `Analyzing with ${localConfig?.model ?? 'local model'} (document structure)...`
  return provider === 'openai'
    ? 'Analyzing with OpenAI GPT-4.1 (document structure)...'
    : 'Analyzing with Claude Sonnet (document structure)...'
}

async function callViolationDetector(
  provider: LLMProvider,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userContent: string,
  fullText: string,
  timeoutMs: number,
  localConfig?: LocalConfig,
): Promise<Violation[]> {
  const result = await callProviderTool<{ violations: LLMResult[] }>(
    provider,
    apiKey, model, systemPrompt, userContent,
    VIOLATION_TOOL_NAME, VIOLATION_TOOL_DESCRIPTION, VIOLATION_TOOL_SCHEMA,
    timeoutMs,
    localConfig,
  )
  return processViolations(fullText, result.violations ?? [])
}

// ── Chunking for large documents ─────────────────────────────────────────────
// Haiku / GPT-4.5 mini miss patterns when given very long texts. Above
// CHUNK_THRESHOLD we split on paragraph boundaries, run chunks in parallel,
// then merge results. processViolations always receives the full text so
// indexOf finds correct offsets.

const CHUNK_THRESHOLD = 4000 // chars; below this, single call
const CHUNK_SIZE = 3500      // target chars per chunk

function chunkText(text: string): string[] {
  if (text.length <= CHUNK_THRESHOLD) return [text]
  const paragraphs = text.split(/\n\n+/)
  const chunks: string[] = []
  let current: string[] = []
  let len = 0
  for (let i = 0; i < paragraphs.length; i++) {
    current.push(paragraphs[i])
    len += paragraphs[i].length + 2
    if (len >= CHUNK_SIZE && i < paragraphs.length - 1) {
      chunks.push(current.join('\n\n'))
      // Overlap: repeat last paragraph at start of next chunk so patterns
      // at the boundary aren't missed
      current = [paragraphs[i]]
      len = paragraphs[i].length + 2
    }
  }
  if (current.length) chunks.push(current.join('\n\n'))
  return chunks
}

function deduplicateViolations(violations: Violation[]): Violation[] {
  const seen = new Set<string>()
  return violations.filter(v => {
    const key = `${v.ruleId}:${v.matchedText}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// Fragment-level patterns — fast, uses Haiku / GPT-4.1 mini / local
export async function runLLMDetectors(
  text: string,
  apiKey: string,
  onProgress?: (msg: string) => void,
  provider: LLMProvider = 'anthropic',
  localConfig?: LocalConfig,
): Promise<Violation[]> {
  onProgress?.(sentenceProgressFor(provider, localConfig))
  const chunks = chunkText(text)
  const sentenceTimeout = provider === 'local' ? 0 : 30_000
  if (chunks.length === 1) {
    return callViolationDetector(
      provider,
      apiKey,
      sentenceModelFor(provider, localConfig),
      SYSTEM_PROMPT,
      `${buildLLMRulesPrompt()}\n\nText to analyze:\n\n${text}`,
      text,
      sentenceTimeout,
      localConfig,
    )
  }
  const results = await Promise.all(
    chunks.map(chunk =>
      callViolationDetector(
        provider,
        apiKey,
        sentenceModelFor(provider, localConfig),
        SYSTEM_PROMPT,
        `${buildLLMRulesPrompt()}\n\nText to analyze:\n\n${chunk}`,
        text,
        sentenceTimeout,
        localConfig,
      ).catch(() => [] as Violation[])
    )
  )
  return deduplicateViolations(results.flat())
}

// ── Paragraph rewrite ─────────────────────────────────────────────────────────

// Rules whose llmDirective is always included in every rewrite prompt
const REWRITE_DEFAULT_RULE_IDS = [
  'elevated-register',      // utilize→use, commence→start, etc.
  'filler-adverbs',         // cut importantly/essentially/fundamentally
  'hedge-stack',            // remove stacked hedges
  'unnecessary-elaboration',// stop when the sentence is done
  'grandiose-stakes',       // scale claims to evidence
  'em-dash-pivot',          // replace em-dashes with correct punctuation
  'balanced-take',          // remove balanced take
]

// Meta-instructions not captured by any individual rule
const REWRITE_META_PRINCIPLES = [
  '- Write directly. Cut preamble and throat-clearing.',
  "- Don't add explanations or transitions the original didn't have.",
  '- Preserve the paragraph\'s factual content and core meaning exactly.',
]

function buildDefaultPrinciples(): string {
  const ruleDirectives = REWRITE_DEFAULT_RULE_IDS
    .flatMap(id => {
      const directive = RULES.find(r => r.id === id)?.llmDirective
      return directive ? [`- ${directive}`] : []
    })
  return [...ruleDirectives, ...REWRITE_META_PRINCIPLES].join('\n')
}

export function buildRewriteSystemPrompt(violatedRuleHints: string[]): string {
  const ruleSection = violatedRuleHints.length > 0
    ? `\n\nThis text has specific problems to fix:\n${violatedRuleHints.map(h => `- ${h}`).join('\n')}`
    : ''
  return `You are an expert editor. Rewrite the given text to read like natural, direct human prose. Apply all of these principles:\n${buildDefaultPrinciples()}${ruleSection}`
}

async function callProviderTool<T>(
  provider: LLMProvider,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userContent: string,
  toolName: string,
  toolDescription: string,
  inputSchema: Record<string, unknown>,
  timeoutMs: number,
  localConfig?: LocalConfig,
): Promise<T> {
  if (provider === 'openai') {
    return callOpenAITool<T>(
      apiKey, model, systemPrompt, userContent,
      toolName, toolDescription, inputSchema, timeoutMs,
    )
  }

  if (provider === 'local') {
    const baseUrl = (localConfig?.baseUrl ?? 'http://localhost:11434/v1').replace(/\/$/, '')
    return callOpenAITool<T>(
      apiKey || 'local', model, systemPrompt, userContent,
      toolName, toolDescription, inputSchema, timeoutMs,
      baseUrl, false,
    )
  }

  return callAnthropicTool<T>(
    apiKey, model, systemPrompt, userContent,
    toolName, toolDescription, inputSchema, timeoutMs,
  )
}

async function callAnthropicTool<T>(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userContent: string,
  toolName: string,
  toolDescription: string,
  inputSchema: Record<string, unknown>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        tools: [{ name: toolName, description: toolDescription, input_schema: inputSchema }],
        tool_choice: { type: 'tool', name: toolName },
        messages: [{ role: 'user', content: userContent }],
      }),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw new Error(`Request timed out after ${timeoutMs / 1000}s.`)
    throw new Error('Network error — could not reach api.anthropic.com.')
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    let detail = ''
    try { detail = await response.text() } catch { /* ignore */ }
    if (response.status === 401) throw new Error(`Invalid API key (401): ${detail}`)
    if (response.status === 429) throw new Error('Rate limited (429). Wait a moment and try again.')
    throw new Error(`Anthropic API ${response.status}: ${detail.slice(0, 200)}`)
  }

  const data = await response.json() as { content: Array<{ type: string; name?: string; input?: unknown }> }
  const toolBlock = data.content.find(b => b.type === 'tool_use' && b.name === toolName)
  if (!toolBlock?.input) throw new Error('No tool response from model.')
  return toolBlock.input as T
}

async function callOpenAITool<T>(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userContent: string,
  toolName: string,
  toolDescription: string,
  inputSchema: Record<string, unknown>,
  timeoutMs: number,
  baseUrl = 'https://api.openai.com/v1',
  forceToolChoice = true,
): Promise<T> {
  const isLocal = baseUrl !== 'https://api.openai.com/v1'
  const controller = timeoutMs > 0 ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
  let response: Response
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      ...(controller ? { signal: controller.signal } : {}),
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        // Ollama uses max_tokens; OpenAI accepts max_completion_tokens
        ...(isLocal ? { max_tokens: 4096 } : { max_completion_tokens: 4096 }),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        tools: [{
          type: 'function',
          function: {
            name: toolName,
            description: toolDescription,
            parameters: inputSchema,
          },
        }],
        // Ollama does not support tool_choice forcing — omit it for local.
        // Use response_format json_object so models without tool-call support
        // still return parseable JSON (Ollama structured outputs).
        ...(forceToolChoice
          ? { tool_choice: { type: 'function', function: { name: toolName } } }
          : { response_format: { type: 'json_object' } }),
      }),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw new Error(`Request timed out after ${timeoutMs / 1000}s.`)
    const host = new URL(baseUrl).host
    throw new Error(`Network error — could not reach ${host}.`)
  } finally {
    if (timer) clearTimeout(timer)
  }

  if (!response.ok) {
    let detail = ''
    try { detail = await response.text() } catch { /* ignore */ }
    if (response.status === 401) throw new Error(`Invalid API key (401): ${detail}`)
    if (response.status === 429) throw new Error('Rate limited (429). Wait a moment and try again.')
    if (isLocal && response.status === 400 && detail.includes('does not support tools')) {
      throw new Error(`This model doesn't support tool calling. Switch to a compatible model: llama3.1, mistral-nemo, qwen2.5, etc.`)
    }
    const label = isLocal ? 'Local model' : 'OpenAI'
    throw new Error(`${label} API ${response.status}: ${detail.slice(0, 200)}`)
  }

  const data = await response.json() as {
    choices?: Array<{
      message?: {
        content?: string | null
        tool_calls?: Array<{
          function?: {
            name?: string
            arguments?: string
          }
        }>
      }
    }>
  }

  const args = data.choices?.[0]?.message?.tool_calls?.find(
    call => call.function?.name === toolName,
  )?.function?.arguments

  if (args) {
    try {
      return JSON.parse(args) as T
    } catch {
      throw new Error('Model returned invalid tool arguments JSON.')
    }
  }

  // Local models sometimes respond with plain JSON text instead of a tool call
  if (isLocal) {
    const content = data.choices?.[0]?.message?.content
    if (content) {
      const match = content.match(/\{[\s\S]*\}/)
      if (match) {
        try {
          return JSON.parse(match[0]) as T
        } catch { /* fall through to error */ }
      }
    }
    throw new Error('Local model did not use the tool. Try a model with tool-calling support (llama3.1, mistral-nemo, etc.).')
  }

  throw new Error('No tool response from model.')
}

export async function rewriteParagraph(
  paragraph: string,
  violatedRuleHints: string[],
  apiKey: string,
  provider: LLMProvider = 'anthropic',
  localConfig?: LocalConfig,
): Promise<string> {
  const result = await callProviderTool<{ rewritten: string }>(
    provider,
    apiKey,
    rewriteModelFor(provider, localConfig),
    buildRewriteSystemPrompt(violatedRuleHints),
    paragraph,
    'submit_rewrite',
    'Submit the rewritten text. Use an empty string to suggest deletion.',
    {
      type: 'object',
      properties: {
        rewritten: { type: 'string', description: 'The rewritten text, preserving all factual content. Empty string to suggest deletion.' },
      },
      required: ['rewritten'],
    },
    provider === 'local' ? 0 : 20_000,
    localConfig,
  )
  return result.rewritten.trim()
}

// Document-level patterns — deeper, uses Sonnet / GPT-4.1 / local
export async function runDocumentDetectors(
  text: string,
  apiKey: string,
  onProgress?: (msg: string) => void,
  provider: LLMProvider = 'anthropic',
  localConfig?: LocalConfig,
): Promise<Violation[]> {
  onProgress?.(documentProgressFor(provider, localConfig))
  return callViolationDetector(
    provider,
    apiKey,
    documentModelFor(provider, localConfig),
    DOCUMENT_SYSTEM_PROMPT,
    `${buildDocumentRulesPrompt()}\n\nFull text:\n\n${text}`,
    text,
    provider === 'local' ? 0 : 60_000,
    localConfig,
  )
}
