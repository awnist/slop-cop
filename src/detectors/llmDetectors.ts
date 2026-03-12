import type { Violation } from '../types'
import { RULES } from '../rules'

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

// ── Document-level prompt (Sonnet) ───────────────────────────────────────────

const DOCUMENT_SYSTEM_PROMPT = `You are an experienced editor reading a complete piece of writing to identify structural and compositional problems that only become visible at document scale — patterns that emerge across paragraphs rather than within a single sentence.
Be conservative — only flag clear, unambiguous cases.`

function buildDocumentRulesPrompt(): string {
  const rules = RULES.filter(r => r.llmTier === 'document')
  const numbered = rules.map((r, i) =>
    `${i + 1}. "${r.id}": ${r.llmDetectionHint ?? r.description}`
  ).join('\n\n')
  return `Read the entire piece as an editor. Identify these document-level patterns:\n\n${numbered}\n\nReturn only clear cases. If the piece is short, tight, or well-structured, return [].`
}

// ── Shared types and helpers ──────────────────────────────────────────────────

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
          ruleId:        { type: 'string', description: 'The rule ID being violated.' },
          matchedText:   { type: 'string', description: 'The EXACT substring from the text, character-for-character.' },
          explanation:   { type: 'string', description: 'One sentence explaining why this is a violation.' },
          suggestedChange: { type: 'string', description: 'Literal replacement text inserted verbatim, or "" to delete. Never write instructions.' },
        },
        required: ['ruleId', 'matchedText', 'explanation', 'suggestedChange'],
      },
    },
  },
  required: ['violations'],
}

async function callViolationDetector(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userContent: string,
  fullText: string,
  timeoutMs: number,
): Promise<Violation[]> {
  const result = await callAnthropicTool<{ violations: LLMResult[] }>(
    apiKey, model, systemPrompt, userContent,
    VIOLATION_TOOL_NAME, VIOLATION_TOOL_DESCRIPTION, VIOLATION_TOOL_SCHEMA,
    timeoutMs,
  )
  return processViolations(fullText, result.violations ?? [])
}

// ── Chunking for large documents ─────────────────────────────────────────────
// Haiku misses patterns when given very long texts. Above CHUNK_THRESHOLD we
// split on paragraph boundaries, run chunks in parallel, then merge results.
// processViolations always receives the full text so indexOf finds correct offsets.

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

// Fragment-level patterns — fast, uses Haiku
export async function runLLMDetectors(
  text: string,
  apiKey: string,
  onProgress?: (msg: string) => void,
): Promise<Violation[]> {
  onProgress?.('Analyzing with Claude Haiku (sentence patterns)...')
  const chunks = chunkText(text)
  if (chunks.length === 1) {
    return callViolationDetector(
      apiKey, 'claude-haiku-4-5-20251001', SYSTEM_PROMPT,
      `${buildLLMRulesPrompt()}\n\nText to analyze:\n\n${text}`,
      text, 30_000,
    )
  }
  const results = await Promise.all(
    chunks.map(chunk =>
      callViolationDetector(
        apiKey, 'claude-haiku-4-5-20251001', SYSTEM_PROMPT,
        `${buildLLMRulesPrompt()}\n\nText to analyze:\n\n${chunk}`,
        text, 30_000,
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
  'triple-construction',    // avoid rule of three
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

export async function rewriteParagraph(
  paragraph: string,
  violatedRuleHints: string[],
  apiKey: string,
): Promise<string> {
  const result = await callAnthropicTool<{ rewritten: string }>(
    apiKey,
    'claude-haiku-4-5-20251001',
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
    20_000,
  )
  return result.rewritten.trim()
}

// Document-level patterns — deeper, uses Sonnet
export async function runDocumentDetectors(
  text: string,
  apiKey: string,
  onProgress?: (msg: string) => void,
): Promise<Violation[]> {
  onProgress?.('Analyzing with Claude Sonnet (document structure)...')
  return callViolationDetector(
    apiKey, 'claude-sonnet-4-6', DOCUMENT_SYSTEM_PROMPT,
    `${buildDocumentRulesPrompt()}\n\nFull text:\n\n${text}`,
    text, 60_000,
  )
}
