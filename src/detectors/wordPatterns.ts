import type { Violation } from '../types'

// Helper: find all case-insensitive matches of a word/phrase in text
function findAll(text: string, pattern: RegExp, ruleId: string): Violation[] {
  const violations: Violation[] = []
  let m: RegExpExecArray | null
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g')
  while ((m = re.exec(text)) !== null) {
    violations.push({
      ruleId,
      startIndex: m.index,
      endIndex: m.index + m[0].length,
      matchedText: m[0],
    })
  }
  return violations
}

const INTENSIFIERS = [
  'crucial', 'vital', 'robust', 'comprehensive', 'fundamental',
  'arguably', 'straightforward', 'noteworthy', 'realm', 'landscape',
  'leverage', 'delve', 'tapestry', 'multifaceted', 'nuanced', 'pivotal',
  'unprecedented', 'navigate', 'foster', 'underscore', 'resonate',
  'embark', 'streamline', 'spearhead', 'paradigm', 'synergy',
  'holistic', 'transformative', 'cutting-edge', 'innovative', 'dynamic',
  'harness',
]

const ELEVATED_REGISTER: [string, string][] = [
  ['utilize', 'use'],
  ['utilise', 'use'],
  ['utilization', 'use'],
  ['commence', 'start'],
  ['commencement', 'start'],
  ['facilitate', 'help'],
  ['endeavor', 'try'],
  ['endeavour', 'try'],
  ['demonstrate', 'show'],
  ['ascertain', 'find out'],
  ['ameliorate', 'improve'],
  ['elucidate', 'explain'],
  ['promulgate', 'spread'],
  ['cognizant', 'aware'],
  ['craft', 'make'],
  ['pertaining to', 'about'],
  ['in regards to', 'about'],
  ['with regards to', 'about'],
  ['in the context of', 'in'],
  ['at this juncture', 'now'],
  ['going forward', 'in future'],
  ['moving forward', 'in future'],
  ['in terms of', ''],
  ['it is worth noting', ''],
  ['it should be noted', ''],
  ['one must consider', ''],
  ['in light of', 'given'],
  ['in the realm of', 'in'],
]

const FILLER_ADVERBS = [
  'importantly', 'essentially', 'fundamentally', 'ultimately',
  'inherently', 'particularly', 'increasingly', 'certainly',
  'undoubtedly', 'obviously', 'clearly', 'simply', 'basically',
  'quite', 'rather', 'very', 'really', 'truly', 'genuinely',
  'quietly', 'deeply', 'remarkably',
]

const METAPHOR_CRUTCHES = [
  'double-edged sword', 'tip of the iceberg', 'north star',
  'building blocks', 'elephant in the room', 'perfect storm',
  'game.changer', 'game changer', 'low.hanging fruit', 'low hanging fruit',
  'move the needle', 'think outside the box', 'at the end of the day',
  'paradigm shift', 'silver bullet', 'boiling the ocean',
  'drinking the kool.aid', 'drinking the kool aid',
  'put it on the back burner', 'circle back', 'deep dive',
  'level up', 'hit the ground running', 'move fast and break things',
  'the devil is in the details', 'on the same page',
  'reinvent the wheel', 'touch base', 'bandwidth',
  'bleeding edge', 'best of breed', 'boil down',
]

const FALSE_CONCLUSION_PHRASES = [
  'in conclusion', 'to conclude', 'in summary', 'to summarize',
  'to sum up', 'in closing', 'overall,', 'all in all',
  'at the end of the day', 'when all is said and done',
  'taking everything into account', 'taking everything into consideration',
  'all things considered', 'moving forward', 'going forward',
]

const CONNECTOR_WORDS = [
  'furthermore', 'moreover', 'additionally', 'however', 'nevertheless',
  'nonetheless', 'consequently', 'therefore', 'thus', 'hence',
  'in addition', 'as a result', 'for instance', 'for example',
  'in contrast', 'on the other hand', 'on the contrary', 'that said',
  'having said that', 'with that in mind', 'it follows that',
  'interestingly', 'notably', 'significantly',
]

const UNNECESSARY_CONTRAST_PHRASES = [
  'whereas', 'as opposed to', 'unlike', 'in contrast to',
  'contrary to', 'conversely',
]

const HEDGE_WORDS = [
  'perhaps', 'arguably', 'seemingly', 'apparently', 'ostensibly',
  'possibly', 'potentially', 'conceivably', 'presumably', 'supposedly',
  'it could be argued', 'it might be', 'it may be', 'it seems',
  'it appears', 'one might', 'some would say', 'in some ways',
  'to some extent', 'in a sense', 'sort of',
  // "kind of" only as a filler qualifier, not as a classifier ("a kind of X")
  'is kind of', 'are kind of', 'was kind of', 'were kind of',
  'feels kind of', 'seems kind of', 'sounds kind of', 'looks kind of',
]

export function detectOverusedIntensifiers(text: string): Violation[] {
  const violations: Violation[] = []
  for (const word of INTENSIFIERS) {
    const re = new RegExp(`\\b${word}s?\\b`, 'gi')
    violations.push(...findAll(text, re, 'overused-intensifiers'))
  }
  return violations
}

export function detectElevatedRegister(text: string): Violation[] {
  const violations: Violation[] = []
  for (const [elevated] of ELEVATED_REGISTER) {
    const escaped = elevated.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`\\b${escaped}\\b`, 'gi')
    violations.push(...findAll(text, re, 'elevated-register'))
  }
  return violations
}

export function detectFillerAdverbs(text: string): Violation[] {
  const violations: Violation[] = []
  for (const word of FILLER_ADVERBS) {
    const re = new RegExp(`\\b${word}\\b`, 'gi')
    violations.push(...findAll(text, re, 'filler-adverbs'))
  }
  return violations
}

export function detectAlmostHedge(text: string): Violation[] {
  const re = /\balmost\s+(always|never|certainly|exclusively|entirely|completely|always|invariably|universally)\b/gi
  return findAll(text, re, 'almost-hedge')
}

export function detectEraOpener(text: string): Violation[] {
  const re = /\bin\s+an?\s+era\s+(of|where|when|in\s+which)\b/gi
  return findAll(text, re, 'era-opener')
}

export function detectMetaphorCrutch(text: string): Violation[] {
  const violations: Violation[] = []
  for (const phrase of METAPHOR_CRUTCHES) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\./g, '[- ]?')
    const re = new RegExp(`\\b${escaped}\\b`, 'gi')
    violations.push(...findAll(text, re, 'metaphor-crutch'))
  }
  return violations
}

export function detectImportantToNote(text: string): Violation[] {
  const re = /\b(it('s| is)\s+important\s+to\s+note|it('s| is)\s+worth\s+noting|notably|note\s+that|it\s+should\s+be\s+noted)\b/gi
  return findAll(text, re, 'important-to-note')
}

export function detectBroaderImplications(text: string): Violation[] {
  const re = /\b(broader\s+implications?|wider\s+implications?|implications?\s+(for|of|on)\s+the\s+(broader|wider|larger))\b/gi
  return findAll(text, re, 'broader-implications')
}

export function detectFalseConclusion(text: string): Violation[] {
  const violations: Violation[] = []
  for (const phrase of FALSE_CONCLUSION_PHRASES) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Flag when used to open a sentence/paragraph
    const re = new RegExp(`(^|[.!?]\\s+|\\n\\s*)${escaped}\\b`, 'gi')
    violations.push(...findAll(text, re, 'false-conclusion'))
  }
  return violations
}

export function detectConnectorAddiction(text: string): Violation[] {
  // Flag connectors at start of paragraphs/sentences
  const violations: Violation[] = []
  for (const word of CONNECTOR_WORDS) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(^|\\n\\s*|[.!?]\\s+)${escaped}[,\\s]`, 'gi')
    violations.push(...findAll(text, re, 'connector-addiction'))
  }
  return violations
}

export function detectUnnecessaryContrast(text: string): Violation[] {
  const violations: Violation[] = []
  for (const phrase of UNNECESSARY_CONTRAST_PHRASES) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`\\b${escaped}\\b`, 'gi')
    violations.push(...findAll(text, re, 'unnecessary-contrast'))
  }
  return violations
}

export function detectEmDashPivot(text: string): Violation[] {
  const violations: Violation[] = []

  // Find each em-dash or en-dash, but skip ones used as a standalone line separator
  const re = /[—–]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const lineStart = text.lastIndexOf('\n', m.index - 1) + 1
    const lineEnd = text.indexOf('\n', m.index)
    const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd)
    if (line.trim().replace(/[—–]/g, '').trim() === '') continue
    violations.push({
      ruleId: 'em-dash-pivot',
      startIndex: m.index,
      endIndex: m.index + 1,
      matchedText: m[0],
    })
  }

  return violations
}

export function detectNegationPivot(text: string): Violation[] {
  const violations: Violation[] = []
  const NEGATIONS = `not|don[\u2019']?t|doesn[\u2019']?t|isn[\u2019']?t|wasn[\u2019']?t|aren[\u2019']?t|do not|does not|is not|was not|never|no longer`
  // "not X, but Y" / "not X but Y" (comma optional)
  const commaButRe = new RegExp(`\\b(${NEGATIONS})\\b[^.!?\\n]{3,80},?\\s+but\\b`, 'gi')
  // "not X—Y" or "not X–Y" (em/en-dash pivot without "but") — capture one word after dash for clarity
  const emDashRe = new RegExp(`\\b(${NEGATIONS})\\b[^.!?\\n\u2014\u2013]{3,60}[\u2014\u2013]\\s*\\w+`, 'gi')
  let m: RegExpExecArray | null
  for (const re of [commaButRe, emDashRe]) {
    while ((m = re.exec(text)) !== null) {
      violations.push({
        ruleId: 'negation-pivot',
        startIndex: m.index,
        endIndex: m.index + m[0].length,
        matchedText: m[0],
      })
    }
  }

  // Two-sentence variant: "It doesn't X. It does Y."
  // Same subject opens both sentences; first negates, second affirms.
  const NEG = `(?:doesn[\u2019']?t|isn[\u2019']?t|won[\u2019']?t|can[\u2019']?t|don[\u2019']?t|does\\s+not|is\\s+not|was\\s+not|did\\s+not|will\\s+not)`
  const twoSentenceRe = new RegExp(
    `(([A-Z][\\w\u2019']*)\\s+${NEG}\\b[^.!?\\n]{5,120}[.!?])[ \\t]+(\\2\\b[^.!?\\n]{5,120}[.!?])`,
    'g'
  )
  while ((m = twoSentenceRe.exec(text)) !== null) {
    violations.push({
      ruleId: 'negation-pivot',
      startIndex: m.index,
      endIndex: m.index + m[0].length,
      matchedText: m[0],
    })
  }

  return violations
}

export function detectColonElaboration(text: string): Violation[] {
  // Short clause (< 60 chars) followed by colon then longer explanation
  const re = /[^.!?\n]{5,50}:[^:\n]{20,}/g
  const violations: Violation[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const colonPos = m[0].indexOf(':')
    violations.push({
      ruleId: 'colon-elaboration',
      startIndex: m.index + colonPos,
      endIndex: m.index + colonPos + 1,
      matchedText: ':',
    })
  }
  return violations
}

const COMMA_QUALIFIERS = [
  'of course', 'to be fair', 'it should be said', 'needless to say',
  'in fairness', 'admittedly', 'to be sure', 'it must be said',
  'after all', 'as we know', 'as everyone knows',
]

export function detectParentheticalQualifier(text: string): Violation[] {
  // Paren-delimited qualifiers: (which has been widely discussed...)
  const violations = findAll(text, /\([^)]{20,}\)/g, 'parenthetical-qualifier')
  // Comma-offset qualifiers: "This is, of course, a simplification."
  for (const phrase of COMMA_QUALIFIERS) {
    const re = new RegExp(`,\\s*${phrase}\\s*,`, 'gi')
    violations.push(...findAll(text, re, 'parenthetical-qualifier'))
  }
  return violations
}

export function detectQuestionThenAnswer(text: string): Violation[] {
  const violations: Violation[] = []
  // Process each paragraph independently — cross-paragraph pairs are never the tell.
  const paragraphs = splitParagraphs(text)

  for (const para of paragraphs) {
    const sentenceRe = /[^.!?]*[.!?]+/g
    const sentences: Array<{ text: string; start: number }> = []
    let m: RegExpExecArray | null
    while ((m = sentenceRe.exec(para.text)) !== null) {
      sentences.push({ text: m[0], start: para.start + m.index })
    }
    for (let i = 0; i < sentences.length - 1; i++) {
      const s = sentences[i].text.trim()
      const next = sentences[i + 1].text.trim()
      // The answer must be short — a long sentence after a question is just the
      // next thought, not the LLM pat-answer tell ("What does this mean? It means X.")
      if (s.endsWith('?') && !next.endsWith('?') && next.length <= 120) {
        const start = sentences[i].start
        const end = sentences[i + 1].start + sentences[i + 1].text.length
        violations.push({
          ruleId: 'question-then-answer',
          startIndex: start,
          endIndex: end,
          matchedText: text.slice(start, end),
        })
      }
    }
  }
  return violations
}

// Detect hedge stacks: sentences with 2+ hedge words
export function detectHedgeStack(text: string): Violation[] {
  const sentences = splitSentences(text)
  const violations: Violation[] = []
  let offset = 0

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase()
    const found: string[] = []
    for (const hedge of HEDGE_WORDS) {
      if (lower.includes(hedge)) found.push(hedge)
    }
    // Also check modal verbs
    // Only genuinely hedging modals; "should"/"would" are normative/conditional, not hedges
    const modals = ['might', 'could', 'may']
    for (const m of modals) {
      if (new RegExp(`\\b${m}\\b`).test(lower)) found.push(m)
    }
    if (found.length >= 2) {
      violations.push({
        ruleId: 'hedge-stack',
        startIndex: offset,
        endIndex: offset + sentence.length,
        matchedText: sentence,
        explanation: `Contains ${found.length} hedges: ${found.slice(0, 4).join(', ')}`,
      })
    }
    offset += sentence.length
  }
  return violations
}

// Detect staccato burst: 3+ consecutive short sentences
export function detectStaccatoBurst(text: string): Violation[] {
  const violations: Violation[] = []
  const paragraphs = splitParagraphs(text)

  for (const para of paragraphs) {
    const sentences = splitSentences(para.text)
    const offsets: number[] = []
    let offset = 0
    for (const s of sentences) {
      offsets.push(para.start + offset)
      offset += s.length
    }

    const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length
    let i = 0
    while (i < sentences.length) {
      if (wordCount(sentences[i]) <= 8) {
        let j = i + 1
        while (j < sentences.length && wordCount(sentences[j]) <= 8) j++
        if (j - i >= 3) {
          const start = offsets[i]
          const end = offsets[j - 1] + sentences[j - 1].length
          violations.push({
            ruleId: 'staccato-burst',
            startIndex: start,
            endIndex: end,
            matchedText: text.slice(start, end),
            explanation: `${j - i} consecutive short sentences`,
          })
          i = j
          continue
        }
      }
      i++
    }
  }
  return violations
}

// Detect listicle instinct: lists with exactly 3, 5, 7, or 10 items
export function detectListicleInstinct(text: string): Violation[] {
  const violations: Violation[] = []
  const MAGIC_COUNTS = new Set([3, 5, 7, 10])

  // Numbered lists
  const numberedListRe = /(?:^|\n)(\s*\d+[.)]\s+[^\n]+)(\n\s*\d+[.)]\s+[^\n]+){2,}/gm
  let m: RegExpExecArray | null
  const re1 = new RegExp(numberedListRe.source, 'gm')
  while ((m = re1.exec(text)) !== null) {
    const items = m[0].trim().split('\n').filter(l => /^\s*\d+[.)]\s/.test(l))
    if (MAGIC_COUNTS.has(items.length)) {
      violations.push({
        ruleId: 'listicle-instinct',
        startIndex: m.index,
        endIndex: m.index + m[0].length,
        matchedText: m[0],
        explanation: `Numbered list with exactly ${items.length} items`,
      })
    }
  }

  // Bulleted lists
  const bulletRe = /(?:^|\n)(\s*[-*•]\s+[^\n]+)(\n\s*[-*•]\s+[^\n]+){2,}/gm
  const re2 = new RegExp(bulletRe.source, 'gm')
  while ((m = re2.exec(text)) !== null) {
    const items = m[0].trim().split('\n').filter(l => /^\s*[-*•]\s/.test(l))
    if (MAGIC_COUNTS.has(items.length)) {
      violations.push({
        ruleId: 'listicle-instinct',
        startIndex: m.index,
        endIndex: m.index + m[0].length,
        matchedText: m[0],
        explanation: `Bullet list with exactly ${items.length} items`,
      })
    }
  }

  return violations
}

export function splitParagraphs(text: string): Array<{ text: string; start: number }> {
  const results: Array<{ text: string; start: number }> = []
  const re = /\n\s*\n/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const chunk = text.slice(last, m.index)
    if (chunk.trim()) results.push({ text: chunk, start: last })
    last = m.index + m[0].length
  }
  if (last < text.length && text.slice(last).trim()) {
    results.push({ text: text.slice(last), start: last })
  }
  return results
}

function splitSentences(text: string): string[] {
  // Simple sentence splitter - preserves whitespace/punctuation
  const results: string[] = []
  let last = 0
  const re = /[.!?]+\s+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    results.push(text.slice(last, m.index + m[0].length))
    last = m.index + m[0].length
  }
  if (last < text.length) results.push(text.slice(last))
  return results.filter(s => s.trim().length > 0)
}

// ── New detectors ─────────────────────────────────────────────────────────

export function detectServesAs(text: string): Violation[] {
  const re = /\b(serves|stands|acts|functions)\s+as\b/gi
  return findAll(text, re, 'serves-as')
}

export function detectNegationCountdown(text: string): Violation[] {
  const violations: Violation[] = []
  const sentences = splitSentences(text)
  let offset = 0
  const offsets: number[] = []
  for (const s of sentences) { offsets.push(offset); offset += s.length }

  let i = 0
  while (i < sentences.length) {
    if (/^\s*not\s+/i.test(sentences[i].trim())) {
      let j = i + 1
      while (j < sentences.length && /^\s*not\s+/i.test(sentences[j].trim())) j++
      if (j - i >= 2) {
        const start = offsets[i]
        const end = offsets[j - 1] + sentences[j - 1].length
        violations.push({ ruleId: 'negation-countdown', startIndex: start, endIndex: end, matchedText: text.slice(start, end) })
        i = j; continue
      }
    }
    i++
  }
  return violations
}

// Function words too generic to flag as anaphora — anything else repeated 3+ times is suspicious
const ANAPHORA_SINGLE_WORD_SKIP = new Set([
  'a', 'an', 'the',
  'in', 'on', 'at', 'to', 'of', 'for', 'with', 'by', 'from',
  'is', 'are', 'was', 'were',
])

export function detectAnaphoraAbuse(text: string): Violation[] {
  const violations: Violation[] = []
  const sentences = splitSentences(text)
  let offset = 0
  const offsets: number[] = []
  for (const s of sentences) { offsets.push(offset); offset += s.length }

  const CONJUNCTIONS = new Set(['and', 'but', 'or'])

  function normalize(s: string): string[] {
    const words = s.trim().split(/\s+/).filter(Boolean)
    // Strip a leading conjunction ("And both..." → ["both", ...])
    if (words.length > 1 && CONJUNCTIONS.has(words[0].toLowerCase().replace(/[^a-z]/g, ''))) {
      return words.slice(1)
    }
    return words
  }

  function twoWordOpener(s: string): string {
    const words = normalize(s)
    if (words.length < 2) return ''
    const first = words[0].toLowerCase().replace(/[^a-z]/g, '')
    const skip = new Set(['the', 'a', 'an', 'it', 'is', 'in', 'on', 'at', 'to', 'of', 'and', 'but', 'i', 'we', 'he', 'she'])
    if (skip.has(first) || first.length < 2) return ''
    return `${first} ${words[1].toLowerCase().replace(/[^a-z]/g, '')}`
  }

  function singleWordOpener(s: string): string {
    const words = normalize(s)
    if (words.length < 2) return ''
    const first = words[0].toLowerCase().replace(/[^a-z]/g, '')
    if (first.length < 2 || ANAPHORA_SINGLE_WORD_SKIP.has(first)) return ''
    return first
  }

  function flagRun(i: number, j: number, opener: string) {
    const start = offsets[i]
    const end = offsets[j - 1] + sentences[j - 1].length
    violations.push({
      ruleId: 'anaphora-abuse', startIndex: start, endIndex: end,
      matchedText: text.slice(start, end), explanation: `"${opener}..." repeated ${j - i} times`,
    })
  }

  let i = 0
  while (i < sentences.length) {
    // Two-word opener (more specific — try first)
    const two = twoWordOpener(sentences[i])
    if (two) {
      let j = i + 1
      while (j < sentences.length && twoWordOpener(sentences[j]) === two) j++
      if (j - i >= 3) { flagRun(i, j, two); i = j; continue }
    }
    // Single-word opener from curated slop-indicative list
    const one = singleWordOpener(sentences[i])
    if (one) {
      let j = i + 1
      while (j < sentences.length && singleWordOpener(sentences[j]) === one) j++
      if (j - i >= 3) { flagRun(i, j, one); i = j; continue }
    }
    i++
  }
  return violations
}

export function detectGerundLitany(text: string): Violation[] {
  const violations: Violation[] = []
  const sentences = splitSentences(text)
  let offset = 0
  const offsets: number[] = []
  for (const s of sentences) { offsets.push(offset); offset += s.length }

  const isGerund = (s: string) => {
    const trimmed = s.trim()
    const words = trimmed.split(/\s+/).filter(Boolean)
    return words.length <= 8 && /^[A-Z][a-z]+ing\b/.test(trimmed)
  }

  let i = 0
  while (i < sentences.length) {
    if (isGerund(sentences[i])) {
      let j = i + 1
      while (j < sentences.length && isGerund(sentences[j])) j++
      if (j - i >= 2) {
        const start = offsets[i]
        const end = offsets[j - 1] + sentences[j - 1].length
        violations.push({ ruleId: 'gerund-litany', startIndex: start, endIndex: end, matchedText: text.slice(start, end) })
        i = j; continue
      }
    }
    i++
  }
  return violations
}

const HERES_THE_KICKER_PHRASES = [
  "here's the kicker",
  "here's the thing",
  "here's where it gets interesting",
  "here's what most people miss",
  "here's the real",
]

export function detectHeresTheKicker(text: string): Violation[] {
  const violations: Violation[] = []
  const lower = text.toLowerCase()
  for (const phrase of HERES_THE_KICKER_PHRASES) {
    let idx = lower.indexOf(phrase)
    while (idx !== -1) {
      violations.push({
        ruleId: 'heres-the-kicker',
        startIndex: idx,
        endIndex: idx + phrase.length,
        matchedText: text.slice(idx, idx + phrase.length),
      })
      idx = lower.indexOf(phrase, idx + 1)
    }
  }
  return violations
}

const PEDAGOGICAL_PHRASES = [
  "let's break this down",
  "let's unpack",
  "let's explore",
  "let's dive in",
  "let's examine",
  "think of it as",
  "think of it like",
  "think of this as",
]

export function detectPedagogicalAside(text: string): Violation[] {
  const violations: Violation[] = []
  const lower = text.toLowerCase()
  for (const phrase of PEDAGOGICAL_PHRASES) {
    let idx = lower.indexOf(phrase)
    while (idx !== -1) {
      violations.push({
        ruleId: 'pedagogical-aside',
        startIndex: idx,
        endIndex: idx + phrase.length,
        matchedText: text.slice(idx, idx + phrase.length),
      })
      idx = lower.indexOf(phrase, idx + 1)
    }
  }
  return violations
}

export function detectImagineWorld(text: string): Violation[] {
  const re = /\bImagine\s+(a world|if you|what would|a future)/gi
  return findAll(text, re, 'imagine-world')
}

export function detectListicleTrenchCoat(text: string): Violation[] {
  const violations: Violation[] = []
  const re = /(^|[.!?]\s+|\n\s*)the\s+(first|second|third|fourth|fifth)\b/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const offset = m[1]?.length ?? 0
    violations.push({
      ruleId: 'listicle-trench-coat',
      startIndex: m.index + offset,
      endIndex: m.index + m[0].length,
      matchedText: m[0].slice(offset),
    })
  }
  if (violations.length < 2) return []
  return violations
}

const VAGUE_ATTRIBUTION_PHRASES = [
  'experts argue', 'experts say', 'experts suggest', 'experts believe', 'experts note',
  'industry analysts', 'observers have noted', 'observers have cited', 'observers argue',
  'analysts note', 'analysts suggest', 'many experts', 'several experts', 'some experts',
  'according to experts', 'studies show', 'research suggests',
]

export function detectVagueAttribution(text: string): Violation[] {
  const violations: Violation[] = []
  const lower = text.toLowerCase()
  for (const phrase of VAGUE_ATTRIBUTION_PHRASES) {
    let idx = lower.indexOf(phrase)
    while (idx !== -1) {
      violations.push({
        ruleId: 'vague-attribution',
        startIndex: idx,
        endIndex: idx + phrase.length,
        matchedText: text.slice(idx, idx + phrase.length),
      })
      idx = lower.indexOf(phrase, idx + 1)
    }
  }
  return violations
}

export function detectBoldFirstBullets(text: string): Violation[] {
  const re = /^[ \t]*[-*•][ \t]+\*\*[^*\n]+\*\*/gm
  return findAll(text, re, 'bold-first-bullets')
}

export function detectUnicodeArrows(text: string): Violation[] {
  return findAll(text, /→/g, 'unicode-arrows')
}

export function detectDespiteChallenges(text: string): Violation[] {
  const re = /\bDespite (these|its|the|their|all|such)\b[^.!?]{0,80}\b(challenge|obstacle|limitation|difficult|drawback|shortcoming)/gi
  return findAll(text, re, 'despite-challenges')
}

export function detectConceptLabel(text: string): Violation[] {
  const re = /\b[a-z]+\s+(paradox|trap|creep|vacuum|inversion|chasm)\b/gi
  return findAll(text, re, 'concept-label')
}

export function detectDramaticFragment(text: string): Violation[] {
  const violations: Violation[] = []
  for (const para of splitParagraphs(text)) {
    const trimmed = para.text.trim()
    const wordCount = trimmed.split(/\s+/).filter(Boolean).length
    if (wordCount >= 1 && wordCount <= 4 && !trimmed.endsWith(':')) {
      violations.push({
        ruleId: 'dramatic-fragment',
        startIndex: para.start,
        endIndex: para.start + para.text.length,
        matchedText: trimmed,
      })
    }
  }
  return violations
}

export function detectSuperficialAnalysis(text: string): Violation[] {
  const re = /,\s+(highlighting|underscoring|showcasing|reflecting|cementing|embodying|encapsulating)\s+(its|the|their|this)\s+(importance|role|significance|legacy|power|spirit|nature|value)\b/gi
  return findAll(text, re, 'superficial-analysis')
}

export function detectFalseRange(text: string): Violation[] {
  const violations: Violation[] = []

  // "from nowhere" hollow idiom — e.g. "doesn't emerge from nowhere", "came from nowhere"
  // Match: optional negation + motion/emergence verb + "from nowhere"
  const negation = `(?:doesn[\u2019']?t|didn[\u2019']?t|don[\u2019']?t|does\\s+not|did\\s+not|isn[\u2019']?t|wasn[\u2019']?t|aren[\u2019']?t|is\\s+not|was\\s+not)\\s+`
  const verb = `(?:emerge[sd]?|comes?|came|appear[sed]*|spring[s]?|sprung|arose?|arise[s]?|materialize[sd]?|happen[sed]*|develop[sed]*|exist[sed]*)`
  const re = new RegExp(`(?:${negation})?${verb}\\s+from\\s+nowhere`, 'gi')

  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    violations.push({
      ruleId: 'false-range',
      startIndex: m.index,
      endIndex: m.index + m[0].length,
      matchedText: m[0],
    })
  }

  return violations
}
