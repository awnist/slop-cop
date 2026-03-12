import type { Violation } from '../types'
import { detectContextualSlop } from './nlpPatterns'
import {
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
    ...detectContextualSlop(text),
  ]
  const deduped = deduplicateViolations(all)
  return fixArticleContext(suppressDanglingModifiers(deduped, text), text)
}

/**
 * Suppress deletion for violations preceded by a degree modifier (most/more/least/less).
 * Deleting the adjective in "most comprehensive map" leaves "most map" — nonsensical.
 * Sets suggestedChange: null so the popover shows the tip but no Apply button.
 */
function suppressDanglingModifiers(violations: Violation[], text: string): Violation[] {
  const degreeModifiers = /\b(most|more|least|less|very|quite|so|too|as|truly|highly|extremely|deeply|utterly|remarkably|particularly|especially|increasingly|genuinely|incredibly|immensely|exceedingly|notably)\s+$/i
  return violations.map(v => {
    if (v.suggestedChange !== undefined && v.suggestedChange !== '') return v  // has a real suggestion — leave it
    const before = text.slice(0, v.startIndex)
    if (!degreeModifiers.test(before)) return v
    return { ...v, suggestedChange: null }
  })
}

/**
 * For violations where applying the change would leave a wrong article ("a"/"an"),
 * expand the span backwards to include the article and set the correct one as the
 * suggestion. E.g. "a dynamic" (delete "dynamic") → expand to "a dynamic" → "an".
 * Works for any rule — deletions, replacements, and canRemove fallbacks.
 */
function fixArticleContext(violations: Violation[], text: string): Violation[] {
  return violations.map(v => {
    if (v.suggestedChange === null) return v  // no action — skip
    const replacement = v.suggestedChange ?? ''

    // What precedes the violation? Look for "a " or "an " immediately before it.
    const before = text.slice(0, v.startIndex)
    const articleMatch = before.match(/\b(a|an) $/i)
    if (!articleMatch) return v

    // What is the first character of the text that will follow the article?
    const afterReplacement = replacement + text.slice(v.endIndex)
    const firstChar = afterReplacement.trimStart()[0]?.toLowerCase() ?? ''
    const needsAn = 'aeiou'.includes(firstChar)
    const currentArticle = articleMatch[1].toLowerCase()
    const correctArticle = needsAn ? 'an' : 'a'
    if (currentArticle === correctArticle) return v  // already correct

    // Expand the violation to include the article
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
