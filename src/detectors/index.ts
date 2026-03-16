import { retext } from 'retext'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — retext-indefinite-article ships its own types but path varies by bundler
import retextIndefiniteArticle from 'retext-indefinite-article'
import nlp from './nlpInstance'
import type { Violation } from '../types'

// Pre-built processor — reused across all calls
const articleProcessor = retext().use(retextIndefiniteArticle)
import { detectContextualSlop, detectVerbIntensifierForms, detectTripleConstruction } from './nlpPatterns'
import {
  detectHighlightSlop,
  detectOverusedIntensifiers,
  detectElevatedRegister,
  detectFillerAdverbs,
  detectAlmostHedge,
  detectEraOpener,
  detectMetaphorCrutch,
  detectImportantToNote,
  detectBroaderImplications,
  detectFalseConclusion,
  detectConnectorAddiction,
  detectUnnecessaryContrast,
  detectEmDashPivot,
  detectNegationPivot,
  detectColonElaboration,
  detectParentheticalQualifier,
  detectQuestionThenAnswer,
  detectHedgeStack,
  detectStaccatoBurst,
  detectListicleInstinct,
  detectServesAs,
  detectNegationCountdown,
  detectAnaphoraAbuse,
  detectGerundLitany,
  detectHeresTheKicker,
  detectPedagogicalAside,
  detectImagineWorld,
  detectListicleTrenchCoat,
  detectVagueAttribution,
  detectBoldFirstBullets,
  detectUnicodeArrows,
  detectDespiteChallenges,
  detectConceptLabel,
  detectDramaticFragment,
  detectSuperficialAnalysis,
  detectFalseRange,
} from './wordPatterns'

export function runClientDetectors(text: string): Violation[] {
  const all: Violation[] = [
    ...detectHighlightSlop(text),
    ...detectOverusedIntensifiers(text),
    ...detectElevatedRegister(text),
    ...detectFillerAdverbs(text),
    ...detectAlmostHedge(text),
    ...detectEraOpener(text),
    ...detectMetaphorCrutch(text),
    ...detectImportantToNote(text),
    ...detectBroaderImplications(text),
    ...detectFalseConclusion(text),
    ...detectConnectorAddiction(text),
    ...detectUnnecessaryContrast(text),
    ...detectEmDashPivot(text),
    ...detectNegationPivot(text),
    ...detectColonElaboration(text),
    ...detectParentheticalQualifier(text),
    ...detectQuestionThenAnswer(text),
    ...detectHedgeStack(text),
    ...detectStaccatoBurst(text),
    ...detectListicleInstinct(text),
    ...detectServesAs(text),
    ...detectNegationCountdown(text),
    ...detectAnaphoraAbuse(text),
    ...detectGerundLitany(text),
    ...detectHeresTheKicker(text),
    ...detectPedagogicalAside(text),
    ...detectImagineWorld(text),
    ...detectListicleTrenchCoat(text),
    ...detectVagueAttribution(text),
    ...detectBoldFirstBullets(text),
    ...detectUnicodeArrows(text),
    ...detectDespiteChallenges(text),
    ...detectConceptLabel(text),
    ...detectDramaticFragment(text),
    ...detectSuperficialAnalysis(text),
    ...detectFalseRange(text),
    ...detectVerbIntensifierForms(text),
    ...detectTripleConstruction(text),
    ...detectContextualSlop(text),
  ]
  const deduped = deduplicateViolations(all)
  return fixArticleContext(suppressUnsafeDeletions(deduped, text), text)
}

// Linking verbs that introduce a predicate adjective. Deleting the adjective
// directly after one of these leaves a broken sentence: "X is for Y" is not
// what the author wrote — "X is [adj] for Y" was. Both copulative and
// semi-copulative verbs are included (become, remain, seem, appear, look, feel).
const LINKING_VERB_RE = /\b(is|was|are|were|am|be|been|being|becomes?|became|remains?|remained|seems?|appeared?|appears?|looks?|felt|feels?|sounds?|gets?|got)\s+$/i

/**
 * Suppress unsafe deletions for adjective-position violations. Two cases:
 *
 * 1. Predicate adjective ("distinction is vital for X"):
 *    Deleting "vital" leaves "distinction is for X" — broken.
 *    Detected by a linking verb immediately before the violation.
 *
 * 2. Dangling modifier ("most comprehensive overview"):
 *    Deleting "comprehensive" leaves "most overview" — nonsensical.
 *    Detected by a degree modifier or adverb immediately before.
 *
 * Both cases set suggestedChange: null so the popover shows the tip but
 * no Apply button — the user must rewrite the sentence.
 */
function suppressUnsafeDeletions(violations: Violation[], text: string): Violation[] {
  return violations.map(v => {
    if (v.suggestedChange !== undefined && v.suggestedChange !== '') return v
    const before = text.slice(0, v.startIndex)
    // Case 1: predicate adjective position
    if (LINKING_VERB_RE.test(before)) return { ...v, suggestedChange: null }
    // Case 2: preceded by degree modifier or adverb
    const precedingWord = before.match(/\b(\w+)\s+$/)?.[1]
    if (!precedingWord) return v
    const isModifier =
      /^(most|more|least|less)$/i.test(precedingWord) ||
      nlp(precedingWord).has('#Adverb')
    return isModifier ? { ...v, suggestedChange: null } : v
  })
}

/**
 * For violations where applying the change would leave a wrong article ("a"/"an"),
 * expand the span backwards to include the article and set the correct one as the
 * suggestion. Uses retext-indefinite-article for phoneme-aware correction — handles
 * "an hour", "a uniform", "an API", "a one-time" etc. that letter-checking misses.
 */
function fixArticleContext(violations: Violation[], text: string): Violation[] {
  return violations.map(v => {
    if (v.suggestedChange === null) return v  // no action — skip
    const replacement = v.suggestedChange ?? ''

    // What precedes the violation? Look for "a " or "an " immediately before it.
    const before = text.slice(0, v.startIndex)
    const articleMatch = before.match(/\b(a|an) $/i)
    if (!articleMatch) return v

    // What is the first word that will appear after the article post-change?
    const afterChange = replacement + text.slice(v.endIndex)
    const firstWord = afterChange.trimStart().match(/^[^\s,;.!?]+/)?.[0]
    if (!firstWord) return v

    // Ask retext: is "currentArticle firstWord" correct?
    // processSync is synchronous — no async needed.
    const file = articleProcessor.processSync(`${articleMatch[1]} ${firstWord}.`)
    if (!file.messages.length) return v  // article is already correct

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const correctArticle = (file.messages[0] as any).expected?.[0]
    if (!correctArticle) return v

    const articleStart = v.startIndex - articleMatch[0].length
    return {
      ...v,
      startIndex: articleStart,
      endIndex: v.endIndex,
      matchedText: text.slice(articleStart, v.endIndex),
      suggestedChange: replacement ? `${correctArticle} ${replacement}` : correctArticle,
    }
  })
}

// Remove exact duplicates; suppress word-level violations fully contained within a
// larger phrase violation of the same rule (e.g. "crucial" inside "in a crucial way").
function deduplicateViolations(violations: Violation[]): Violation[] {
  const seen = new Set<string>()
  return violations.filter(v => {
    const key = `${v.ruleId}:${v.startIndex}:${v.endIndex}`
    if (seen.has(key)) return false
    seen.add(key)
    // Suppress if a larger same-rule violation strictly contains this one
    const containedByLarger = violations.some(
      other =>
        other !== v &&
        other.ruleId === v.ruleId &&
        other.startIndex <= v.startIndex &&
        other.endIndex >= v.endIndex &&
        (other.endIndex - other.startIndex) > (v.endIndex - v.startIndex),
    )
    return !containedByLarger
  })
}
