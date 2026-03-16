/**
 * NLP-assisted detectors using compromise for context-sensitive slop words —
 * cases where simple word matching produces too many false positives.
 *
 * Performance: a trigger-word pre-filter (fast regex) identifies sentences that
 * contain any candidate word, then compromise runs only on those small chunks
 * rather than the full document. For a large document with few slop words, NLP
 * may run on 5–10 sentences instead of thousands of words.
 */

import nlp from './nlpInstance'
import type { Violation } from '../types'
import { VERB_INTENSIFIERS } from './wordPatterns'

// compromise .json({offset:true, tags:true}) shapes
interface TermJson {
  text: string
  tags: string[]
  offset: { start: number; length: number }
}
interface MatchJson {
  text: string
  offset: { start: number; length: number }
  terms: TermJson[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NlpDoc = any

// Simpler synonyms to suggest when flagging a slop verb, keyed by stem.
// undefined = no suggestion (verb is too context-dependent to auto-replace)
const VERB_REPLACEMENTS: Record<string, string | undefined> = {
  showcase:   'show',
  boast:      'have',
  // Moved from INTENSIFIERS — verb deletion breaks sentences
  leverage:   'use',
  harness:    'use',
  foster:     'build',
  underscore: 'show',
  navigate:   'handle',
  streamline: 'simplify',
  spearhead:  'lead',
  craft:      'make',
  bolster:    'support',
  emphasize:  'stress',
  enhance:    'improve',
  garner:     'get',
  delve:      undefined,  // "delve into" → no clean single-word swap
  embark:     undefined,  // "embark on" → no clean single-word swap
  resonate:   undefined,  // too context-dependent
}

// Strip trailing 'e' from a verb stem so the prefix matches all conjugated forms.
// Verbs ending in 'e' drop the 'e' before '-ing' (leverage→leveraging, not leverageing),
// so the stem prefix must be truncated to match all forms:
//   leverage  → leverag  matches leverage, leverages, leveraged, leveraging  ✓
//   showcase  → showcas  matches showcase, showcases, showcased, showcasing  ✓
//   streamline → streamlin matches all forms ✓
// Stems NOT ending in 'e' work as-is (foster → foster matches fostering etc.).
function toStemPrefix(s: string): string {
  return s.endsWith('e') ? s.slice(0, -1) : s
}

// All stems that can trigger an NLP violation. Any sentence containing one of
// these words is a candidate; sentences without them are skipped entirely.
// Verb stems are mapped through toStemPrefix so that gerunds and -s forms
// (e.g. "leveraging", "showcasing") are caught by the pre-filter.
const TRIGGER_STEMS = [
  'key',
  ...['highlight', 'showcase', 'boast', 'craft'].map(toStemPrefix),
  ...VERB_INTENSIFIERS.map(toStemPrefix),
  // "in a [adj] way/manner/sense" phrase detector (exact words, no conjugation)
  'way', 'manner', 'sense', 'fashion', 'regard',
]

// Single fast regex used to pre-filter text before any NLP work
const TRIGGER_RE = new RegExp(`\\b(${TRIGGER_STEMS.join('|')})`, 'i')

/**
 * Given a character position in text, return the containing sentence —
 * the run of text bounded by .!?\n or document edges — with its start offset.
 */
function extractSentenceAt(text: string, pos: number): { text: string; offset: number } {
  let start = pos
  while (start > 0 && !/[.!?\n]/.test(text[start - 1])) start--
  while (start < pos && /\s/.test(text[start])) start++  // skip leading whitespace

  let end = pos
  while (end < text.length && !/[.!?\n]/.test(text[end])) end++
  if (end < text.length) end++  // include the terminating punctuation/newline

  return { text: text.slice(start, end), offset: start }
}

/** Conjugate baseVerb to match the tense tags of a detected verb term */
function conjugate(baseVerb: string, tags: string[]): string {
  const conj = nlp(baseVerb).verbs().conjugate()[0] as Record<string, string> | undefined
  if (!conj) return baseVerb
  if (tags.includes('Gerund'))       return conj['Gerund']       ?? baseVerb
  if (tags.includes('PastTense'))    return conj['PastTense']    ?? baseVerb
  // Infinitive must be checked before PresentTense — compromise tags both as PresentTense,
  // but adds Infinitive only for "to verb" / base form (not 3rd-person singular "verbs")
  if (tags.includes('Infinitive'))   return conj['Infinitive']   ?? baseVerb
  if (tags.includes('PresentTense')) return conj['PresentTense'] ?? baseVerb
  return conj['Infinitive'] ?? baseVerb
}

/**
 * Flag only the first term of a phrase match.
 * e.g. "key #Noun" → flags only "key", not "key challenge"
 * No suggestedChange — deletion of an adjective is usually safe.
 */
function firstTermViolations(doc: NlpDoc, pattern: string, ruleId: string): Violation[] {
  const violations: Violation[] = []
  doc.match(pattern).forEach((m: NlpDoc) => {
    const matches = m.json({ offset: true }) as MatchJson[]
    if (!matches.length) return
    const term = matches[0].terms?.[0]
    if (!term?.offset) return
    const { start, length } = term.offset
    violations.push({ ruleId, startIndex: start, endIndex: start + length, matchedText: term.text })
  })
  return violations
}

/**
 * Convert an adjective to its adverb form for phrase-collapse suggestions.
 * Uses compromise's built-in adjective→adverb derivation (handles irregular forms,
 * suffix rules, lexicon lookups). Falls back to simple suffix rules if compromise
 * doesn't recognise the word as an adjective in isolation.
 */
function toAdverb(adj: string): string {
  const result = nlp(adj).adjectives().toAdverb().text()
  if (result) return result
  // Fallback suffix rules for words compromise doesn't tag as adjectives in isolation
  const lower = adj.toLowerCase()
  if (lower.endsWith('ic')) return adj + 'ally'
  if (lower.endsWith('le')) return adj.slice(0, -1) + 'y'
  if (lower.endsWith('y') && lower.length > 2) return adj.slice(0, -1) + 'ily'
  return adj + 'ly'
}

/**
 * Find slop verbs among all #Verb-tagged terms and suggest simpler conjugated synonyms.
 *
 * Uses `doc.match('#Verb')` rather than `doc.verbs()` to avoid depending on the
 * three-tier chunker plugin. The chunker redefines how verb phrases are grouped
 * (changing `.verbs()` to use chunk-based matching via `<Verb>`), which requires
 * ALL three-tier plugins to be loaded for correct context-dependent tagging of
 * ambiguous nouns/verbs like "leverage" or "harness". The two-tier POS tagger
 * already tags each term with tense (Gerund, PastTense, Infinitive, PresentTense),
 * so we get the tense info we need without the chunk-level machinery.
 */
function verbViolations(doc: NlpDoc, stem: RegExp, ruleId: string): Violation[] {
  const violations: Violation[] = []
  const json = doc.match('#Verb').json({ offset: true, tags: true }) as MatchJson[]
  for (const phrase of json) {
    // Each phrase is a single term when matching #Verb (not a chunk)
    const term = phrase.terms?.[0]
    if (!term?.offset) continue
    if (!stem.test(term.text)) continue
    const { start, length } = term.offset
    // Find the base replacement and conjugate to match the detected tense
    const base = Object.keys(VERB_REPLACEMENTS).find(k => term.text.toLowerCase().startsWith(toStemPrefix(k)))
    const baseReplacement = base ? VERB_REPLACEMENTS[base] : undefined
    // null = explicitly no action (verb with no clean synonym — deletion would break the sentence)
    const suggestedChange = baseReplacement ? conjugate(baseReplacement, term.tags) : null
    violations.push({
      ruleId,
      startIndex: start,
      endIndex: start + length,
      matchedText: term.text,
      suggestedChange,
    })
  }
  return violations
}

/**
 * Detect "in a [adj] way/manner/sense/fashion/regard" constructions.
 * Flags the WHOLE phrase and suggests collapsing to an adverb
 * (e.g. "in a crucial way" → "crucially").
 */
function inAWayViolations(doc: NlpDoc, _chunkText: string, ruleId: string): Violation[] {
  const violations: Violation[] = []
  doc.match('in (a|an) #Adjective (way|manner|sense|fashion|regard)').forEach((m: NlpDoc) => {
    const matches = m.json({ offset: true, tags: true }) as MatchJson[]
    if (!matches.length) return
    const phrase = matches[0]
    if (!phrase.offset) return
    const { start, length } = phrase.offset
    const adjTerm = (phrase.terms ?? []).find((t: TermJson) => t.tags.includes('Adjective'))
    if (!adjTerm) return
    // compromise's phrase offset already includes trailing punctuation in `length`
    // (e.g. "in a crucial way." has length=17, spanning the period).
    // Check phrase.text's last character — NOT chunkText[start+length] which is
    // always the character AFTER the match (undefined at sentence end).
    const lastChar = phrase.text.slice(-1)
    const punct = /[.!?,;:]/.test(lastChar) ? lastChar : ''
    violations.push({
      ruleId,
      startIndex: start,
      endIndex: start + length,  // already includes punct
      matchedText: phrase.text,  // already includes punct
      suggestedChange: toAdverb(adjTerm.text) + punct,
    })
  })
  return violations
}

// All verb stems flagged as overused-intensifiers, combined for a single regex pass
const OVERUSED_VERB_STEMS = ['showcase', 'boast', ...VERB_INTENSIFIERS]
const OVERUSED_VERB_RE = new RegExp(
  `^(${OVERUSED_VERB_STEMS.map(toStemPrefix).join('|')})`,
  'i',
)

// ── Regex fallback for verb conjugation ──────────────────────────────────────
//
// The NLP path (verbViolations) requires the POS tagger to tag the word as #Verb.
// For ambiguous words like "streamlines" / "fosters", the two-tier tagger sometimes
// tags them as Noun (especially 3rd-person singular forms, which look like plurals).
// This regex fallback catches -s/-es and -ing forms directly and provides the
// correctly conjugated replacement, covering the gap.
//
// Past tense (-ed/-d) is intentionally excluded: the NLP tagger correctly handles
// past tense forms (they're unambiguous), and past-tense substitutions for
// irregular replacements (get→got, build→built) would require a separate lookup.
// Base forms are also excluded: the NLP path handles them correctly.
//
// Deduplication in index.ts ensures no double-flagging when both paths fire.

function addS(verb: string): string {
  if (verb === 'have') return 'has'   // irregular: boast → have → has
  if (verb.endsWith('y') && !/[aeiou]y$/i.test(verb)) return verb.slice(0, -1) + 'ies'
  if (/([sxz]|[sc]h)$/i.test(verb)) return verb + 'es'
  return verb + 's'
}

function addIng(verb: string): string {
  if (verb === 'get') return 'getting'  // irregular: garner → get → getting
  if (verb.endsWith('e')) return verb.slice(0, -1) + 'ing'
  return verb + 'ing'
}

/**
 * Regex fallback: detect 3rd-person singular and gerund forms of VERB_INTENSIFIERS
 * that the NLP POS tagger misclassifies as nouns. Provides the conjugated replacement.
 */
export function detectVerbIntensifierForms(text: string): Violation[] {
  const violations: Violation[] = []
  for (const stem of OVERUSED_VERB_STEMS) {
    const replacement = VERB_REPLACEMENTS[stem]
    if (replacement === undefined) continue  // no clean swap (delve, embark, resonate)
    const prefix = toStemPrefix(stem)
    const sForm = stem.endsWith('e') ? prefix + 'es' : prefix + 's'
    const ingForm = prefix + 'ing'
    for (const [form, suggestion] of [[sForm, addS(replacement)], [ingForm, addIng(replacement)]] as [string, string][]) {
      const re = new RegExp(`\\b${form}\\b`, 'gi')
      let m: RegExpExecArray | null
      while ((m = re.exec(text)) !== null) {
        violations.push({
          ruleId: 'overused-intensifiers',
          startIndex: m.index,
          endIndex: m.index + m[0].length,
          matchedText: m[0],
          suggestedChange: suggestion,
        })
      }
    }
  }
  return violations
}

/** Run all NLP sub-detectors on a pre-parsed doc; positions are chunk-relative */
function runNlpDetectors(doc: NlpDoc, chunkText: string): Violation[] {
  const v: Violation[] = []
  v.push(...firstTermViolations(doc, 'key #Noun', 'overused-intensifiers'))
  v.push(...verbViolations(doc, OVERUSED_VERB_RE, 'overused-intensifiers'))
  v.push(...verbViolations(doc, /^craft/i, 'elevated-register'))
  v.push(...inAWayViolations(doc, chunkText, 'overused-intensifiers'))
  return v
}

export function detectContextualSlop(text: string): Violation[] {
  // Fast pre-check: bail immediately if no trigger words exist anywhere in the text
  if (!TRIGGER_RE.test(text)) return []

  // Scan for all trigger positions and collect the containing sentence for each.
  // Map key = sentence start offset → each sentence is parsed at most once.
  const triggerRe = new RegExp(TRIGGER_RE.source, 'gi')
  const windows = new Map<number, { text: string; offset: number }>()
  let m: RegExpExecArray | null
  while ((m = triggerRe.exec(text)) !== null) {
    const sentence = extractSentenceAt(text, m.index)
    windows.set(sentence.offset, sentence)
  }

  // Run NLP only on triggered sentences, then offset results back to document positions
  const violations: Violation[] = []
  for (const { text: chunk, offset } of windows.values()) {
    const doc = nlp(chunk)
    for (const v of runNlpDetectors(doc, chunk)) {
      violations.push({ ...v, startIndex: v.startIndex + offset, endIndex: v.endIndex + offset })
    }
  }
  return violations
}

// ── Triple construction ───────────────────────────────────────────────────────


export function detectTripleConstruction(text: string): Violation[] {
  if (!text.includes(',')) return []

  // Collect one sentence window per comma position (same pattern as detectContextualSlop)
  const windows = new Map<number, { text: string; offset: number }>()
  let pos = text.indexOf(',')
  while (pos !== -1) {
    const sentence = extractSentenceAt(text, pos)
    windows.set(sentence.offset, sentence)
    pos = text.indexOf(',', pos + 1)
  }

  const violations: Violation[] = []
  for (const { text: chunk, offset } of windows.values()) {
    let m: RegExpExecArray | null

    // "A, B, and C" — Oxford comma form; all items up to 70 chars
    const oxfordRe = /([^,\n]{3,70}),\s+([^,\n]{3,70}),\s+(?:and|or)\s+([^,.!?\n]{3,70})/gi
    while ((m = oxfordRe.exec(chunk)) !== null) {
      violations.push({ ruleId: 'triple-construction', startIndex: offset + m.index, endIndex: offset + m.index + m[0].length, matchedText: m[0] })
    }

    // "A, B and C" — no Oxford comma; B must be short (1–3 words) to avoid matching
    // clause-internal "and" like "you absorb morale damage and replacement costs"
    const noOxfordRe = /([^,\n]{3,70}),\s+([\w-]+(?:\s+[\w-]+){0,2})\s+(?:and|or)\s+([^,.!?\n]{3,70})/gi
    while ((m = noOxfordRe.exec(chunk)) !== null) {
      violations.push({ ruleId: 'triple-construction', startIndex: offset + m.index, endIndex: offset + m.index + m[0].length, matchedText: m[0] })
    }
  }
  return violations
}
