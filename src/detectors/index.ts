import type { Violation } from '../types'
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
  ]
  return deduplicateViolations(all)
}

// Remove exact duplicates; for overlapping spans keep both (different rules)
function deduplicateViolations(violations: Violation[]): Violation[] {
  const seen = new Set<string>()
  return violations.filter(v => {
    const key = `${v.ruleId}:${v.startIndex}:${v.endIndex}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
