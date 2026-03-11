import type { Violation } from '../types'
import { RULES } from '../rules'

const SYSTEM_PROMPT = `You are an expert editor analyzing text for LLM-generated prose patterns.
You will be given a passage and asked to identify specific rhetorical and structural tells.

Respond ONLY with a valid JSON array. Each element must have:
- ruleId: string (one of the rule IDs listed below)
- matchedText: string (copy the EXACT substring from the text, character-for-character — this is used to locate the span, so it must match precisely)
- explanation: string (one sentence explaining why this is a violation)
- suggestedChange: string — CRITICAL: this field is inserted VERBATIM into the document to replace matchedText. It must be the actual replacement text, not instructions. If the fix is to delete the matched text entirely, use an empty string "". Never write "Remove this...", "Delete...", "Replace with...", or any other editorial instruction — only the literal new text (or "" for deletion).

If no violations are found, respond with an empty array [].
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

Respond ONLY with a valid JSON array. Each element must have:
- ruleId: string (one of the rule IDs listed below)
- matchedText: string (copy the EXACT substring from the text, character-for-character — used to locate the span, so it must match precisely)
- explanation: string (one sentence explaining the problem)
- suggestedChange: string — CRITICAL: this field is inserted VERBATIM into the document to replace matchedText. It must be the actual replacement text, not instructions. If the fix is to delete the matched text entirely, use an empty string "". Never write "Remove this...", "Delete...", "Replace with...", or any editorial instruction — only the literal new text (or "" for deletion).

If no violations are found, return [].
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

// Detect when the model wrote instructions instead of replacement text
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

function parseViolations(text: string, rawText: string): Violation[] {
  const jsonMatch = rawText.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return []
  let parsed: LLMResult[]
  try { parsed = JSON.parse(jsonMatch[0]) as LLMResult[] } catch { return [] }

  const violations: Violation[] = []
  for (const item of parsed) {
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

async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userContent: string,
  timeoutMs: number,
): Promise<string> {
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
        messages: [{ role: 'user', content: userContent }],
      }),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s.`)
    }
    throw new Error(
      'Network error — could not reach api.anthropic.com. ' +
      'Try opening the browser console Network tab to see the blocked preflight request.'
    )
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
  const data = await response.json() as { content: Array<{ type: string; text: string }> }
  return data.content.find(b => b.type === 'text')?.text ?? '[]'
}

// ── Chunking for large documents ─────────────────────────────────────────────
// Haiku misses patterns when given very long texts. Above CHUNK_THRESHOLD we
// split on paragraph boundaries, run chunks in parallel, then merge results.
// parseViolations always receives the full text so indexOf finds correct offsets.

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
    const raw = await callAnthropic(
      apiKey,
      'claude-haiku-4-5-20251001',
      SYSTEM_PROMPT,
      `${buildLLMRulesPrompt()}\n\nText to analyze:\n\n${text}`,
      30_000,
    )
    return parseViolations(text, raw)
  }
  const results = await Promise.all(
    chunks.map(chunk =>
      callAnthropic(
        apiKey,
        'claude-haiku-4-5-20251001',
        SYSTEM_PROMPT,
        `${buildLLMRulesPrompt()}\n\nText to analyze:\n\n${chunk}`,
        30_000,
      )
        .then(raw => parseViolations(text, raw))
        .catch(() => [] as Violation[])
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
    ? `\n\nThis paragraph has specific problems to fix:\n${violatedRuleHints.map(h => `- ${h}`).join('\n')}`
    : ''
  return `You are an expert editor. Rewrite the given paragraph to read like natural, direct human prose. Apply all of these principles:\n${buildDefaultPrinciples()}${ruleSection}\n\nRespond with ONLY the rewritten paragraph text — no labels, no commentary, no quotation marks.`
}

export async function rewriteParagraph(
  paragraph: string,
  violatedRuleHints: string[],
  apiKey: string,
): Promise<string> {
  const raw = await callAnthropic(
    apiKey,
    'claude-haiku-4-5-20251001',
    buildRewriteSystemPrompt(violatedRuleHints),
    paragraph,
    20_000,
  )
  const result = raw.trim()
  // If the model returned an editorial instruction instead of replacement prose, treat as delete
  if (INSTRUCTION_PREFIX.test(result)) return ''
  return result
}

// Document-level patterns — deeper, uses Sonnet
export async function runDocumentDetectors(
  text: string,
  apiKey: string,
  onProgress?: (msg: string) => void,
): Promise<Violation[]> {
  onProgress?.('Analyzing with Claude Sonnet (document structure)...')
  const raw = await callAnthropic(
    apiKey,
    'claude-sonnet-4-6',
    DOCUMENT_SYSTEM_PROMPT,
    `${buildDocumentRulesPrompt()}\n\nFull text:\n\n${text}`,
    60_000,
  )
  return parseViolations(text, raw)
}
