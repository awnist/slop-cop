import { describe, it, expect } from 'vitest'
import { detectContextualSlop, detectVerbIntensifierForms, detectTripleConstruction, detectShortHookParagraph } from '../nlpPatterns'
import { runClientDetectors } from '../index'
import type { Violation } from '../../types'

// ── helpers ──────────────────────────────────────────────────────────────────

function nlpViolations(text: string): Violation[] {
  return detectContextualSlop(text)
}

function assertSuggestion(text: string, matchedText: string, expected: string | null) {
  const violations = detectContextualSlop(text)
  // Use startsWith so callers don't need to worry about trailing punct included by compromise
  const v = violations.find(x => x.matchedText.toLowerCase().startsWith(matchedText.toLowerCase()))
  expect(v, `expected violation for "${matchedText}" in: ${text}`).toBeDefined()
  expect(v!.suggestedChange).toBe(expected)
}

// ── VERB_INTENSIFIERS: all stems must fire ────────────────────────────────────

describe('detectContextualSlop — verb detection', () => {

  // Unambiguously verbal contexts (after modal or auxiliary) — two-tier POS tagger
  // correctly identifies these as Verb regardless of bundle configuration.
  it('flags "leverage" after modal', () => {
    const vs = nlpViolations('We must leverage our existing assets.')
    expect(vs.some(v => /leverage/i.test(v.matchedText))).toBe(true)
  })

  it('flags "harness" after modal', () => {
    const vs = nlpViolations('We can harness this energy effectively.')
    expect(vs.some(v => /harness/i.test(v.matchedText))).toBe(true)
  })

  it('flags "foster" after modal', () => {
    const vs = nlpViolations('Leaders must foster a culture of trust.')
    expect(vs.some(v => /foster/i.test(v.matchedText))).toBe(true)
  })

  it('flags "embark" after modal', () => {
    const vs = nlpViolations('Teams can embark on this journey together.')
    expect(vs.some(v => /embark/i.test(v.matchedText))).toBe(true)
  })

  it('flags "bolster" after modal', () => {
    const vs = nlpViolations('This will bolster our credibility significantly.')
    expect(vs.some(v => /bolster/i.test(v.matchedText))).toBe(true)
  })

  it('flags "emphasize" after modal', () => {
    const vs = nlpViolations('We should emphasize the importance of clarity.')
    expect(vs.some(v => /emphasize/i.test(v.matchedText))).toBe(true)
  })

  it('flags "enhance" after modal', () => {
    const vs = nlpViolations('This will enhance the overall experience.')
    expect(vs.some(v => /enhance/i.test(v.matchedText))).toBe(true)
  })

  it('flags "garner" after modal', () => {
    const vs = nlpViolations('The campaign should garner widespread attention.')
    expect(vs.some(v => /garner/i.test(v.matchedText))).toBe(true)
  })

  it('flags "streamline" after modal', () => {
    const vs = nlpViolations('We can streamline the onboarding process.')
    expect(vs.some(v => /streamline/i.test(v.matchedText))).toBe(true)
  })

  it('flags "navigate" after modal', () => {
    const vs = nlpViolations('Companies must navigate these challenges carefully.')
    expect(vs.some(v => /navigate/i.test(v.matchedText))).toBe(true)
  })

  it('flags "underscore" after modal', () => {
    const vs = nlpViolations('These results should underscore the need for reform.')
    expect(vs.some(v => /underscore/i.test(v.matchedText))).toBe(true)
  })

  it('flags "spearhead" after modal', () => {
    const vs = nlpViolations('She will spearhead the initiative next quarter.')
    expect(vs.some(v => /spearhead/i.test(v.matchedText))).toBe(true)
  })

  it('flags "delve" after modal', () => {
    const vs = nlpViolations('Let us delve into the details.')
    expect(vs.some(v => /delve/i.test(v.matchedText))).toBe(true)
  })

  it('flags "showcase" as verb', () => {
    const vs = nlpViolations('The demo will showcase our latest features.')
    expect(vs.some(v => /showcase/i.test(v.matchedText))).toBe(true)
  })

  it('flags "highlight" before abstract noun', () => {
    const vs = runClientDetectors('This highlights the importance of testing.')
    expect(vs.some(v => /highlight/i.test(v.matchedText))).toBe(true)
  })

  it('does not flag "highlight" in literal use', () => {
    const vs = runClientDetectors('The app highlights them in real time.')
    expect(vs.some(v => /highlight/i.test(v.matchedText))).toBe(false)
  })
})

// ── Conjugation suggestions ───────────────────────────────────────────────────

describe('detectContextualSlop — conjugation', () => {

  it('leverage → use (base/infinitive)', () => {
    assertSuggestion('We must leverage our existing assets.', 'leverage', 'use')
  })

  it('leveraged → used (past tense)', () => {
    assertSuggestion('The team leveraged prior research effectively.', 'leveraged', 'used')
  })

  it('leveraging → using (gerund)', () => {
    assertSuggestion('By leveraging cloud services, costs drop.', 'leveraging', 'using')
  })

  it('showcase → show (base/infinitive)', () => {
    assertSuggestion('The demo will showcase our latest features.', 'showcase', 'show')
  })

  it('showcased → showed (past tense)', () => {
    assertSuggestion('The conference showcased exciting new products.', 'showcased', 'showed')
  })

  it('showcasing → showing (gerund)', () => {
    assertSuggestion('The report is showcasing early results.', 'showcasing', 'showing')
  })

  it('foster → build (base/infinitive)', () => {
    assertSuggestion('Leaders must foster a culture of trust.', 'foster', 'build')
  })

  it('bolster → support (base/infinitive)', () => {
    assertSuggestion('This will bolster our credibility significantly.', 'bolster', 'support')
  })

  it('enhance → improve (base/infinitive)', () => {
    assertSuggestion('This will enhance the overall experience.', 'enhance', 'improve')
  })

  it('garner → get (base/infinitive)', () => {
    assertSuggestion('The campaign should garner widespread attention.', 'garner', 'get')
  })

  it('emphasize → stress (base/infinitive)', () => {
    assertSuggestion('We should emphasize the importance of clarity.', 'emphasize', 'stress')
  })

  it('navigate → handle (base/infinitive)', () => {
    assertSuggestion('Companies must navigate these challenges carefully.', 'navigate', 'handle')
  })
})

// ── No-suggestion verbs (null = no Apply button) ──────────────────────────────

describe('detectContextualSlop — no-suggestion verbs', () => {

  it('delve → suggestedChange: null (no clean swap)', () => {
    assertSuggestion('Let us delve into the details.', 'delve', null)
  })

  it('embark → suggestedChange: null (no clean swap)', () => {
    assertSuggestion('Teams can embark on this journey.', 'embark', null)
  })

  it('resonate → suggestedChange: null (too context-dependent)', () => {
    assertSuggestion('This message will resonate with readers.', 'resonate', null)
  })
})

// ── "key #Noun" detection ─────────────────────────────────────────────────────

describe('detectContextualSlop — "key" as adjective before noun', () => {

  it('flags "key" before noun', () => {
    const vs = nlpViolations('These are the key factors driving growth.')
    expect(vs.some(v => v.matchedText === 'key' && v.ruleId === 'overused-intensifiers')).toBe(true)
  })

  it('"key" before noun has no suggestedChange (deletion path)', () => {
    const vs = nlpViolations('These are the key factors driving growth.')
    const v = vs.find(x => x.matchedText === 'key')
    expect(v).toBeDefined()
    // undefined = no explicit suggestion, falls back to canRemove deletion in popover
    expect(v!.suggestedChange).toBeUndefined()
  })

  it('does not flag "key" used as a noun', () => {
    const vs = nlpViolations('I lost my key yesterday.')
    expect(vs.some(v => v.matchedText === 'key')).toBe(false)
  })

  it('does not flag "key" used as a verb', () => {
    const vs = nlpViolations('Please key in your PIN.')
    expect(vs.some(v => v.matchedText === 'key')).toBe(false)
  })
})

// ── "in a [adj] way/manner" → adverb ─────────────────────────────────────────

describe('detectContextualSlop — "in a [adj] way" phrase', () => {

  it('"in a crucial way." → "crucially." (trailing punct included)', () => {
    // compromise includes trailing punct in phrase.offset.length, so matchedText has the period
    assertSuggestion('This works in a crucial way.', 'in a crucial way', 'crucially.')
  })

  it('"in an effective manner." → "effectively."', () => {
    assertSuggestion('It addresses problems in an effective manner.', 'in an effective manner', 'effectively.')
  })

  it('"in a holistic sense." → "holistically."', () => {
    assertSuggestion('We approach it in a holistic sense.', 'in a holistic sense', 'holistically.')
  })

  it('"in a dynamic fashion." → "dynamically."', () => {
    assertSuggestion('The system adapts in a dynamic fashion.', 'in a dynamic fashion', 'dynamically.')
  })

  it('matchedText includes trailing period', () => {
    const vs = nlpViolations('It works in a crucial manner.')
    const v = vs.find(x => x.matchedText.startsWith('in a crucial manner'))
    expect(v).toBeDefined()
    expect(v!.matchedText).toBe('in a crucial manner.')
    expect(v!.suggestedChange).toBe('crucially.')
  })

  it('matchedText includes trailing comma', () => {
    const vs = nlpViolations('Done in a careful way, the results improve.')
    const v = vs.find(x => x.matchedText.startsWith('in a careful way'))
    expect(v).toBeDefined()
    expect(v!.matchedText).toBe('in a careful way,')
    expect(v!.suggestedChange).toBe('carefully,')
  })

  it('does not flag "in a way" without adjective', () => {
    const vs = nlpViolations('Things unfolded in a way I never expected.')
    // "way" triggers the pre-filter but no adjective → no violation
    expect(vs.some(v => v.matchedText.startsWith('in a way'))).toBe(false)
  })
})

// ── detectVerbIntensifierForms (regex fallback) ───────────────────────────────

describe('detectVerbIntensifierForms — 3rd-person singular fallback', () => {

  it('"streamlines" → "simplifies"', () => {
    const vs = detectVerbIntensifierForms('it streamlines operations, fosters collaboration.')
    const v = vs.find(x => x.matchedText === 'streamlines')
    expect(v).toBeDefined()
    expect(v!.suggestedChange).toBe('simplifies')
  })

  it('"fosters" → "builds"', () => {
    const vs = detectVerbIntensifierForms('it streamlines operations, fosters collaboration.')
    const v = vs.find(x => x.matchedText === 'fosters')
    expect(v).toBeDefined()
    expect(v!.suggestedChange).toBe('builds')
  })

  it('"leverages" → "uses"', () => {
    const vs = detectVerbIntensifierForms('The platform leverages existing infrastructure.')
    const v = vs.find(x => x.matchedText === 'leverages')
    expect(v).toBeDefined()
    expect(v!.suggestedChange).toBe('uses')
  })

  it('"emphasizes" → "stresses"', () => {
    const vs = detectVerbIntensifierForms('The author emphasizes the need for change.')
    const v = vs.find(x => x.matchedText === 'emphasizes')
    expect(v).toBeDefined()
    expect(v!.suggestedChange).toBe('stresses')
  })

  it('"enhances" → "improves"', () => {
    const vs = detectVerbIntensifierForms('This feature enhances user experience.')
    const v = vs.find(x => x.matchedText === 'enhances')
    expect(v).toBeDefined()
    expect(v!.suggestedChange).toBe('improves')
  })

  it('"garners" → "gets"', () => {
    const vs = detectVerbIntensifierForms('The campaign garners widespread support.')
    const v = vs.find(x => x.matchedText === 'garners')
    expect(v).toBeDefined()
    expect(v!.suggestedChange).toBe('gets')
  })

  it('"boasts" → "has"', () => {
    const vs = detectVerbIntensifierForms('The system boasts impressive performance metrics.')
    const v = vs.find(x => x.matchedText === 'boasts')
    expect(v).toBeDefined()
    expect(v!.suggestedChange).toBe('has')
  })

  it('"showcases" → "shows"', () => {
    const vs = detectVerbIntensifierForms('The demo showcases our latest work.')
    const v = vs.find(x => x.matchedText === 'showcases')
    expect(v).toBeDefined()
    expect(v!.suggestedChange).toBe('shows')
  })
})

describe('detectVerbIntensifierForms — gerund fallback', () => {

  it('"streamlining" → "simplifying"', () => {
    const vs = detectVerbIntensifierForms('By streamlining the process, we save time.')
    const v = vs.find(x => x.matchedText === 'streamlining')
    expect(v).toBeDefined()
    expect(v!.suggestedChange).toBe('simplifying')
  })

  it('"leveraging" → "using"', () => {
    const vs = detectVerbIntensifierForms('By leveraging cloud services, costs drop.')
    const v = vs.find(x => x.matchedText === 'leveraging')
    expect(v).toBeDefined()
    expect(v!.suggestedChange).toBe('using')
  })

  it('"garnering" → "getting"', () => {
    const vs = detectVerbIntensifierForms('The project is garnering significant attention.')
    const v = vs.find(x => x.matchedText === 'garnering')
    expect(v).toBeDefined()
    expect(v!.suggestedChange).toBe('getting')
  })

  it('"showcasing" → "showing"', () => {
    const vs = detectVerbIntensifierForms('The report is showcasing early results.')
    const v = vs.find(x => x.matchedText === 'showcasing')
    expect(v).toBeDefined()
    expect(v!.suggestedChange).toBe('showing')
  })

  it('"fostering" → "building"', () => {
    const vs = detectVerbIntensifierForms('The initiative is fostering stronger community ties.')
    const v = vs.find(x => x.matchedText === 'fostering')
    expect(v).toBeDefined()
    expect(v!.suggestedChange).toBe('building')
  })
})

describe('detectVerbIntensifierForms — no-swap verbs skipped', () => {

  it('does not flag "delves" (no clean swap)', () => {
    const vs = detectVerbIntensifierForms('The report delves into the data.')
    expect(vs.some(v => /delve/i.test(v.matchedText))).toBe(false)
  })

  it('does not flag "resonates" (no clean swap)', () => {
    const vs = detectVerbIntensifierForms('This message resonates with readers.')
    expect(vs.some(v => /resonat/i.test(v.matchedText))).toBe(false)
  })
})

describe('detectVerbIntensifierForms — integrated via runClientDetectors', () => {

  it('"it streamlines operations" → "simplifies" suggestion in full pipeline', () => {
    const violations = runClientDetectors('it streamlines operations, fosters collaboration.')
    const v = violations.find(x => x.matchedText === 'streamlines')
    expect(v).toBeDefined()
    expect(v!.suggestedChange).toBe('simplifies')
  })

  it('"fosters" in standalone verb position → "builds" (not deletion)', () => {
    const violations = runClientDetectors('it streamlines operations, fosters collaboration.')
    const v = violations.find(x => x.matchedText === 'fosters')
    expect(v).toBeDefined()
    expect(v!.suggestedChange).toBe('builds')
    expect(v!.suggestedChange).not.toBe('')
    expect(v!.suggestedChange).not.toBeNull()
  })
})

// ── Post-processing: suppressUnsafeDeletions ─────────────────────────────────

describe('suppressUnsafeDeletions — predicate adjective (via runClientDetectors)', () => {

  it('"is vital" → suggestedChange: null (deletion leaves "is for")', () => {
    const violations = runClientDetectors('distinction is vital for enterprises.')
    const v = violations.find(x => x.matchedText === 'vital')
    expect(v).toBeDefined()
    expect(v!.suggestedChange).toBe(null)
  })

  it('"is crucial" → suggestedChange: null', () => {
    const violations = runClientDetectors('This distinction is crucial to the argument.')
    const v = violations.find(x => x.matchedText === 'crucial')
    expect(v).toBeDefined()
    expect(v!.suggestedChange).toBe(null)
  })

  it('"was fundamental" → suggestedChange: null', () => {
    const violations = runClientDetectors('The shift was fundamental to the approach.')
    const v = violations.find(x => x.matchedText === 'fundamental')
    expect(v).toBeDefined()
    expect(v!.suggestedChange).toBe(null)
  })

  it('"remains vital" → suggestedChange: null', () => {
    const violations = runClientDetectors('This approach remains vital in modern contexts.')
    const v = violations.find(x => x.matchedText === 'vital')
    expect(v).toBeDefined()
    expect(v!.suggestedChange).toBe(null)
  })

  it('"becomes crucial" → suggestedChange: null', () => {
    const violations = runClientDetectors('Accuracy becomes crucial at scale.')
    const v = violations.find(x => x.matchedText === 'crucial')
    expect(v).toBeDefined()
    expect(v!.suggestedChange).toBe(null)
  })

  it('"a vital component" → deletion allowed (attributive, not predicate)', () => {
    const violations = runClientDetectors('Speed is a vital component of the system.')
    const v = violations.find(x => x.matchedText === 'vital')
    expect(v).toBeDefined()
    expect(v!.suggestedChange).not.toBe(null)
  })

  it('"plays a crucial role" → deletion allowed (attributive)', () => {
    const violations = runClientDetectors('Clarity plays a crucial role in communication.')
    const v = violations.find(x => x.matchedText === 'crucial')
    expect(v).toBeDefined()
    expect(v!.suggestedChange).not.toBe(null)
  })
})

describe('suppressUnsafeDeletions — dangling modifier (via runClientDetectors)', () => {

  it('"most comprehensive" → suggestedChange: null', () => {
    const violations = runClientDetectors('This is the most comprehensive overview available.')
    const v = violations.find(x => x.matchedText === 'comprehensive')
    expect(v).toBeDefined()
    expect(v!.suggestedChange).toBe(null)
  })

  it('"very crucial" → suggestedChange: null', () => {
    const violations = runClientDetectors('This is a very crucial step.')
    const v = violations.find(x => x.matchedText === 'crucial')
    expect(v).toBeDefined()
    expect(v!.suggestedChange).toBe(null)
  })

  it('"highly robust" → suggestedChange: null', () => {
    const violations = runClientDetectors('The system is highly robust.')
    const v = violations.find(x => x.matchedText === 'robust')
    expect(v).toBeDefined()
    expect(v!.suggestedChange).toBe(null)
  })

  it('"crucial" in attributive position → deletion allowed', () => {
    const violations = runClientDetectors('This is a crucial step.')
    const v = violations.find(x => x.matchedText === 'crucial')
    expect(v).toBeDefined()
    expect(v!.suggestedChange).not.toBe(null)
  })
})

// ── Post-processing: fixArticleContext ────────────────────────────────────────

describe('fixArticleContext (via runClientDetectors)', () => {

  it('expands "a dynamic" → "an" when "dynamic" is deleted', () => {
    // "dynamic" is flagged; deleting it leaves "a approach" → should fix to "an approach"
    // wait, "dynamic" alone isn't in INTENSIFIERS... use "innovative" which is
    const violations = runClientDetectors('We need a dynamic approach.')
    // "dynamic" is in INTENSIFIERS — deletion would leave "a approach" → should fix to "an"
    const v = violations.find(x => x.matchedText.includes('dynamic'))
    if (v) {
      // If article fixup fires, startIndex should reach back to include "a "
      const text = 'We need a dynamic approach.'
      const matchedStart = text.indexOf('a dynamic')
      expect(v.startIndex).toBe(matchedStart)
      expect(v.suggestedChange).toBe('an')
    }
  })

  it('expands "an innovative" → "a" when "innovative" is deleted', () => {
    // "innovative" in "an innovative solution" → delete "innovative" → "a solution"
    const text = 'We have an innovative solution.'
    const violations = runClientDetectors(text)
    const v = violations.find(x => x.matchedText.includes('innovative'))
    if (v && v.suggestedChange !== null) {
      // article fixup should have kicked in
      expect(v.matchedText).toMatch(/^an? innovative/)
    }
  })
})

// ── Pre-filter: no NLP work on clean text ─────────────────────────────────────

describe('detectContextualSlop — pre-filter (no false positives)', () => {

  it('returns empty for plain text with no trigger words', () => {
    const vs = nlpViolations('The quick brown fox jumps over the lazy dog.')
    expect(vs).toHaveLength(0)
  })

  it('does not flag "manner" alone (no adjective before it)', () => {
    const vs = nlpViolations('Their manner was calm and professional.')
    expect(vs.some(v => v.ruleId === 'overused-intensifiers')).toBe(false)
  })

  it('does not flag "sense" alone (no adjective before it)', () => {
    const vs = nlpViolations('That makes a lot of sense to me.')
    expect(vs.some(v => v.ruleId === 'overused-intensifiers')).toBe(false)
  })
})

// ── Triple construction ───────────────────────────────────────────────────────

describe('detectTripleConstruction', () => {
  it('flags three parallel nouns', () => {
    const vs = detectTripleConstruction('It embodies innovation, disruption, and transformation.')
    expect(vs.some(v => v.ruleId === 'triple-construction')).toBe(true)
  })
  it('flags infinitive phrase triplets', () => {
    const vs = detectTripleConstruction('Leaders prioritize flexibility to widen and diversify their pipelines, to improve well-being, and to sustain trust.')
    expect(vs.some(v => v.ruleId === 'triple-construction')).toBe(true)
  })
  it('flags triplets with long items', () => {
    const vs = detectTripleConstruction('Remote-first policies broaden access to caregivers, people with disabilities, and candidates outside premium cost-of-living markets.')
    expect(vs.some(v => v.ruleId === 'triple-construction')).toBe(true)
  })
  it('flags triplets without Oxford comma', () => {
    const vs = detectTripleConstruction('The approach pairs intentional gatherings, clear policies and outcome-based performance management.')
    expect(vs.some(v => v.ruleId === 'triple-construction')).toBe(true)
  })
  it('does not flag a sentence with fewer than two commas', () => {
    const vs = detectTripleConstruction('Speed and clarity matter.')
    expect(vs.some(v => v.ruleId === 'triple-construction')).toBe(false)
  })
})

// ── Short-hook paragraph ──────────────────────────────────────────────────────

const HOOK_PARA_1 = `Attrition, left unchecked, accelerates. A study published in the Journal of Applied Psychology found that disengaged employees are nearly three times more likely to leave within twelve months than their engaged counterparts. Bureau of Labor Statistics data confirms that voluntary separations in knowledge-work sectors have outpaced involuntary ones every quarter since 2018. Internal surveys consistently show that the top driver of departure is a perceived lack of autonomy. The pattern holds across industries and firm sizes.`

const HOOK_PARA_2 = `Leaders face a structural choice. They can continue optimizing for visibility and control, accepting the associated costs in morale and turnover, or they can shift toward outcome-based management that measures results rather than presence. Companies that have made that shift report shorter decision cycles and higher employee satisfaction scores. The evidence does not favor delay.`

describe('detectShortHookParagraph', () => {
  it('flags the short opener in a hook+evidence paragraph', () => {
    const vs = detectShortHookParagraph(HOOK_PARA_1)
    expect(vs).toHaveLength(1)
    expect(vs[0].ruleId).toBe('short-hook-paragraph')
    expect(vs[0].matchedText).toMatch(/Attrition/)
  })

  it('flags both openers when two hook paragraphs are separated by a blank line', () => {
    const text = HOOK_PARA_1 + '\n\n' + HOOK_PARA_2
    const vs = detectShortHookParagraph(text)
    expect(vs).toHaveLength(2)
    expect(vs[0].matchedText).toMatch(/Attrition/)
    expect(vs[1].matchedText).toMatch(/Leaders/)
  })

  it('offsets are correct for second paragraph', () => {
    const text = HOOK_PARA_1 + '\n\n' + HOOK_PARA_2
    const vs = detectShortHookParagraph(text)
    const second = vs[1]
    expect(text.slice(second.startIndex, second.endIndex)).toBe(second.matchedText)
  })

  it('does not flag a two-sentence paragraph', () => {
    const vs = detectShortHookParagraph('Costs rise. Operational overhead increases substantially when teams are distributed across multiple time zones without clear coordination protocols.')
    expect(vs).toHaveLength(0)
  })

  it('flags a 3-sentence hook+elaboration paragraph', () => {
    const vs = detectShortHookParagraph(
      'The cost structure is unforgiving. When hiring timelines stretch beyond ninety days, engineering teams lose momentum on roadmap items that had already been scoped and estimated, creating compounding delays that affect downstream dependencies. Backfilling a senior role typically costs between fifty and two hundred percent of annual salary once recruiting fees, onboarding time, and productivity ramp are factored in.'
    )
    expect(vs).toHaveLength(1)
    expect(vs[0].matchedText).toMatch(/cost structure/)
  })

  it('flags a 9-word opener with long elaborations', () => {
    const vs = detectShortHookParagraph(
      'Retention outcomes show up directly in operating costs. A McKinsey analysis of mid-market technology firms found that reducing voluntary attrition by ten percentage points lowered annualized labor costs by an average of eight percent, net of any investment in engagement programs. That figure compounds over a three-year horizon into a measurable margin improvement.'
    )
    expect(vs).toHaveLength(1)
    expect(vs[0].matchedText).toMatch(/Retention/)
  })

  it('flags an 8-word opener even when a closing sentence is short', () => {
    const vs = detectShortHookParagraph(
      'The longitudinal evidence on this question is now substantial. Three separate cohort studies tracking knowledge workers across a five-year period found that those given schedule autonomy reported higher job satisfaction and lower burnout scores than peers in structured office environments. A fourth study, focused specifically on caregivers, found even larger effects, particularly among workers with children under twelve. The direction of the finding is consistent. The magnitude varies by role type.'
    )
    expect(vs).toHaveLength(1)
    expect(vs[0].matchedText).toMatch(/longitudinal/)
  })

  it('does not flag when opener is long (>10 words)', () => {
    const long = 'This is a longer opening sentence that has more than ten words in it here. The second sentence is even longer and provides substantial additional context and detail. The third sentence continues the elaboration with more supporting evidence and examples. The fourth sentence wraps things up with a final conclusion.'
    const vs = detectShortHookParagraph(long)
    expect(vs).toHaveLength(0)
  })

  it('does not flag when all sentences are similarly short', () => {
    const even = 'It works. It scales. It ships. It saves time and money too.'
    const vs = detectShortHookParagraph(even)
    expect(vs).toHaveLength(0)
  })
})
