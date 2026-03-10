import type { Violation } from '../types'

const SYSTEM_PROMPT = `You are an expert editor analyzing text for LLM-generated prose patterns.
You will be given a passage and asked to identify specific rhetorical and structural tells.

Respond ONLY with a valid JSON array. Each element must have:
- ruleId: string (one of the rule IDs listed below)
- matchedText: string (copy the EXACT substring from the text, character-for-character — this is used to locate the span, so it must match precisely)
- explanation: string (one sentence explaining why this is a violation)
- suggestedChange: string — CRITICAL: this field is inserted VERBATIM into the document to replace matchedText. It must be the actual replacement text, not instructions. If the fix is to delete the matched text entirely, use an empty string "". Never write "Remove this...", "Delete...", "Replace with...", or any other editorial instruction — only the literal new text (or "" for deletion).

If no violations are found, respond with an empty array [].
Be conservative — only flag clear, unambiguous instances.`

const LLM_RULES_PROMPT = `Identify these patterns:

1. "triple-construction": Exactly 3 parallel grammatical items ("X, Y, and Z") where X/Y/Z are parallel phrases. Do not flag 2-item or 4+ item lists.

2. "throat-clearing": An opening paragraph that adds zero information and could be deleted without any loss of meaning. Flag only if it's the very first paragraph.

3. "sycophantic-frame": Text that opens by complimenting the question, assignment, or topic ("Great question," "This is a fascinating topic," etc.).

4. "balanced-take": A sentence that makes a point then immediately softens it into nothing — reflexive RLHF-style hedging that negates the original claim.

5. "unnecessary-elaboration": A sentence that continues past the point where it was already finished, restating its own point in slightly different words within the same sentence or immediately adjacent clause. Example: "The reform failed. It did not succeed, and the attempt to change things did not work out as intended." — the second sentence adds nothing the first didn't already say. This is strictly a within-sentence or single-sentence pattern. Do NOT flag cross-paragraph patterns (that is one-point-dilution, a separate rule). Do NOT flag an analogy or concept introduced in one paragraph being purposefully extended or applied to a new domain in a subsequent paragraph — that is development, not elaboration.

6. "empathy-performance": Generic emotional language applicable to any situation ("I understand this can be difficult," "Your feelings are valid," etc.).

7. "pivot-paragraph": A one-sentence paragraph containing zero new information — only transitions between surrounding paragraphs.

8. "false-range": A "from X to Y" construction where X and Y are not on any meaningful spectrum or scale — used as a fancy way to list two loosely related things rather than express a genuine range. Also flag hollow idioms like "doesn't come from nowhere" / "doesn't emerge from nowhere" that use "from" as clichéd filler. Flag only clear cases. For matchedText, capture the full verb phrase containing the hollow construction (e.g. "doesn't emerge from nowhere"), not just the prepositional fragment.

9. "grandiose-stakes": Inflating the significance of an ordinary point to world-historical importance ("will fundamentally reshape how we think about everything", "will define the next era of computing", "has implications for the future of humanity") without substantiation.

10. "historical-analogy": Rapid-fire listing of famous companies or tech revolutions stacked together to build false authority by association ("Apple didn't build Uber. Facebook didn't build Spotify..."; "the web, mobile, social, cloud, AI"). Flag when the historical references are decorative rather than analytically necessary.

11. "false-vulnerability": Performative self-awareness or simulated honesty that reads as staged rather than genuine ("And yes, I'll admit...", "I'll be honest with you", "Let's be real:", "And yes, since we're being honest"). Real vulnerability is specific and uncomfortable; flag when it sounds polished and risk-free.

For suggestedChange: rewrite only the matched span. Make it direct and concrete.`

// ── Document-level prompt (Sonnet) ───────────────────────────────────────────

const DOCUMENT_SYSTEM_PROMPT = `You are an experienced editor reading a complete piece of writing to identify structural and compositional problems that only become visible at document scale — patterns that emerge across paragraphs rather than within a single sentence.

Respond ONLY with a valid JSON array. Each element must have:
- ruleId: string (one of the rule IDs listed below)
- matchedText: string (copy the EXACT substring from the text, character-for-character — used to locate the span, so it must match precisely)
- explanation: string (one sentence explaining the problem)
- suggestedChange: string — CRITICAL: this field is inserted VERBATIM into the document to replace matchedText. It must be the actual replacement text, not instructions. If the fix is to delete the matched text entirely, use an empty string "". Never write "Remove this...", "Delete...", "Replace with...", or any editorial instruction — only the literal new text (or "" for deletion).

If no violations are found, return [].
Be conservative — only flag clear, unambiguous cases.`

const DOCUMENT_RULES_PROMPT = `Read the entire piece as an editor. Identify these document-level patterns:

1. "dead-metaphor": The same metaphor, image, or conceptual frame recurs 3 or more times across the piece mechanically rather than intentionally. A single metaphor is a choice; the same one appearing every few paragraphs is a crutch. Flag a later instance (not the first), since repetition is the problem.

2. "one-point-dilution": The same core claim or argument appears across multiple paragraphs restated with different words, examples, or metaphors, but adding no new information. The piece pads a simple thesis. Flag the most redundant restatement — a sentence or clause that says something already said.

3. "fractal-summaries": Meta-commentary that previews or recaps content rather than delivering it: "In this section, we will explore...", "As we have seen...", "To summarize what we have covered...", "What follows is an examination of...". Flag only genuine content-free structural signposting, not substantive transitions.

Return only clear cases. If the piece is short, tight, or well-structured, return [].`

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

// Fragment-level patterns — fast, uses Haiku
export async function runLLMDetectors(
  text: string,
  apiKey: string,
  onProgress?: (msg: string) => void,
): Promise<Violation[]> {
  onProgress?.('Analyzing with Claude Haiku (sentence patterns)...')
  const raw = await callAnthropic(
    apiKey,
    'claude-haiku-4-5-20251001',
    SYSTEM_PROMPT,
    `${LLM_RULES_PROMPT}\n\nText to analyze:\n\n${text}`,
    30_000,
  )
  return parseViolations(text, raw)
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
    `${DOCUMENT_RULES_PROMPT}\n\nFull text:\n\n${text}`,
    60_000,
  )
  return parseViolations(text, raw)
}
