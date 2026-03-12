/**
 * NLP-assisted detectors using compromise for context-sensitive slop words —
 * cases where simple word matching produces too many false positives.
 *
 * Performance: a trigger-word pre-filter (fast regex) identifies sentences that
 * contain any candidate word, then compromise runs only on those small chunks
 * rather than the full document. For a large document with few slop words, NLP
 * may run on 5–10 sentences instead of thousands of words.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — compromise ships its own types but the import path varies by bundler
import nlp from 'compromise'
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
  highlight:  'show',
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

// All stems that can trigger an NLP violation. Any sentence containing one of
// these words is a candidate; sentences without them are skipped entirely.
const TRIGGER_STEMS = [
  'key',
  'highlight', 'showcase', 'boast', 'craft',
  ...VERB_INTENSIFIERS,
  // "in a [adj] way/manner/sense" phrase detector
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
 * e.g. "crucial" → "crucially", "holistic" → "holistically", "notable" → "notably"
 */
function toAdverb(adj: string): string {
  const lower = adj.toLowerCase()
  if (lower.endsWith('ic')) return adj + 'ally'             // holistic → holistically
  if (lower.endsWith('le')) return adj.slice(0, -1) + 'y'  // notable → notably
  if (lower.endsWith('y') && lower.length > 2) return adj.slice(0, -1) + 'ily'  // noteworthy → noteworthily
  return adj + 'ly'                                         // crucial → crucially
}

/**
 * Find the slop verb term within each verb chunk (which may be "is showcasing",
 * "has boasted", etc.), extract its tense, and suggest a simpler conjugated synonym.
 */
function verbViolations(doc: NlpDoc, stem: RegExp, ruleId: string): Violation[] {
  const violations: Violation[] = []
  doc.verbs().forEach((v: NlpDoc) => {
    const chunkMatches = v.json({ offset: true, tags: true }) as MatchJson[]
    if (!chunkMatches.length) return
    // Search terms within the chunk for the flagged verb (may be preceded by auxiliary)
    for (const term of chunkMatches[0].terms ?? []) {
      if (!stem.test(term.text)) continue
      if (!term.offset) continue
      const { start, length } = term.offset
      // Find the base replacement and conjugate to match the detected tense
      const base = Object.keys(VERB_REPLACEMENTS).find(k => term.text.toLowerCase().startsWith(k))
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
      break
    }
  })
  return violations
}

/**
 * Detect "in a [adj] way/manner/sense/fashion/regard" constructions.
 * Flags the WHOLE phrase and suggests collapsing to an adverb
 * (e.g. "in a crucial way" → "crucially").
 */
function inAWayViolations(doc: NlpDoc, chunkText: string, ruleId: string): Violation[] {
  const violations: Violation[] = []
  doc.match('in (a|an) #Adjective (way|manner|sense|fashion|regard)').forEach((m: NlpDoc) => {
    const matches = m.json({ offset: true, tags: true }) as MatchJson[]
    if (!matches.length) return
    const phrase = matches[0]
    if (!phrase.offset) return
    const { start, length } = phrase.offset
    const adjTerm = (phrase.terms ?? []).find((t: TermJson) => t.tags.includes('Adjective'))
    if (!adjTerm) return
    // Carry trailing punctuation into the replacement so it isn't lost
    const charAfter = chunkText[start + length] ?? ''
    const punct = /[.!?,;:]/.test(charAfter) ? charAfter : ''
    violations.push({
      ruleId,
      startIndex: start,
      endIndex: start + length + punct.length,
      matchedText: phrase.text + punct,
      suggestedChange: toAdverb(adjTerm.text) + punct,
    })
  })
  return violations
}

// All verb stems flagged as overused-intensifiers, combined for a single regex pass
const OVERUSED_VERB_RE = new RegExp(
  `^(highlight|showcase|boast|${VERB_INTENSIFIERS.join('|')})`,
  'i',
)

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
