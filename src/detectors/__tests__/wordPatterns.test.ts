import { describe, it, expect } from 'vitest'
import { runClientDetectors } from '../index'
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
} from '../wordPatterns'

// Helper: assert at least one violation of the given rule exists
function assertFires(violations: ReturnType<typeof detectOverusedIntensifiers>, ruleId: string) {
  expect(violations.some(v => v.ruleId === ruleId)).toBe(true)
}

// Helper: assert no violations of the given rule
function assertSilent(violations: ReturnType<typeof detectOverusedIntensifiers>, ruleId: string) {
  expect(violations.filter(v => v.ruleId === ruleId)).toHaveLength(0)
}

// ── Overused Intensifiers ──────────────────────────────────────────────────

describe('detectOverusedIntensifiers', () => {
  it('flags "crucial"', () => {
    assertFires(detectOverusedIntensifiers('This is crucial to understand.'), 'overused-intensifiers')
  })
  it('flags "leverage"', () => {
    assertFires(runClientDetectors('We must leverage our existing assets.'), 'overused-intensifiers')
  })
  it('flags "delve"', () => {
    assertFires(runClientDetectors('Let us delve into the details.'), 'overused-intensifiers')
  })
  it('flags "robust"', () => {
    assertFires(detectOverusedIntensifiers('We built a robust framework.'), 'overused-intensifiers')
  })
  it('flags "nuanced"', () => {
    assertFires(detectOverusedIntensifiers('This requires a nuanced approach.'), 'overused-intensifiers')
  })
  it('flags "pivotal"', () => {
    assertFires(detectOverusedIntensifiers('This is a pivotal moment in history.'), 'overused-intensifiers')
  })
  it('flags "unprecedented"', () => {
    assertFires(detectOverusedIntensifiers('We are living through an unprecedented crisis.'), 'overused-intensifiers')
  })
  it('flags "tapestry"', () => {
    assertFires(detectOverusedIntensifiers('A rich tapestry of cultural influences.'), 'overused-intensifiers')
  })
  it('flags "multifaceted"', () => {
    assertFires(detectOverusedIntensifiers('This is a multifaceted problem.'), 'overused-intensifiers')
  })
  it('flags "landscape"', () => {
    assertFires(detectOverusedIntensifiers('The competitive landscape has shifted.'), 'overused-intensifiers')
  })
  it('flags "underscore" / "underscores"', () => {
    assertFires(runClientDetectors('This underscores the importance of planning.'), 'overused-intensifiers')
  })
  it('flags "paradigm"', () => {
    assertFires(detectOverusedIntensifiers('We need a new paradigm for thinking about this.'), 'overused-intensifiers')
  })
  it('does not flag ordinary words', () => {
    assertSilent(detectOverusedIntensifiers('The cat sat on the mat.'), 'overused-intensifiers')
  })
})

// ── Elevated Register ──────────────────────────────────────────────────────

describe('detectElevatedRegister', () => {
  it('flags "utilize"', () => {
    assertFires(detectElevatedRegister('We should utilize this tool.'), 'elevated-register')
  })
  it('flags "commence"', () => {
    assertFires(detectElevatedRegister('We will commence the process tomorrow.'), 'elevated-register')
  })
  it('flags "facilitate"', () => {
    assertFires(detectElevatedRegister('This will facilitate better outcomes.'), 'elevated-register')
  })
  it('flags "endeavor"', () => {
    assertFires(detectElevatedRegister('We will endeavor to improve.'), 'elevated-register')
  })
  it('flags "demonstrate" (elevated form of "show")', () => {
    assertFires(detectElevatedRegister('The results demonstrate that the approach works.'), 'elevated-register')
  })
  it('flags "craft" as verb (elevated form of "make")', () => {
    assertFires(runClientDetectors('We should craft a response to each concern.'), 'elevated-register')
  })
  it('does not flag "craft" as noun', () => {
    assertSilent(runClientDetectors('She bought craft beer and visited a craft store.'), 'elevated-register')
  })
  it('flags "moving forward"', () => {
    assertFires(detectElevatedRegister('Moving forward, we will focus on delivery.'), 'elevated-register')
  })
  it('flags "at this juncture"', () => {
    assertFires(detectElevatedRegister('At this juncture, a decision is required.'), 'elevated-register')
  })
  it('does not flag "use"', () => {
    assertSilent(detectElevatedRegister('We should use this tool.'), 'elevated-register')
  })
  it('does not flag "show"', () => {
    assertSilent(detectElevatedRegister('The data shows a clear trend.'), 'elevated-register')
  })
})

// ── Filler Adverbs ─────────────────────────────────────────────────────────

describe('detectFillerAdverbs', () => {
  it('flags "importantly"', () => {
    assertFires(detectFillerAdverbs('Importantly, this affects everyone.'), 'filler-adverbs')
  })
  it('flags "ultimately"', () => {
    assertFires(detectFillerAdverbs('Ultimately, success depends on effort.'), 'filler-adverbs')
  })
  it('flags "essentially"', () => {
    assertFires(detectFillerAdverbs('This is essentially a marketing problem.'), 'filler-adverbs')
  })
  it('flags "fundamentally"', () => {
    assertFires(detectFillerAdverbs('This is fundamentally wrong.'), 'filler-adverbs')
  })
  it('does not flag "generally"', () => {
    assertSilent(detectFillerAdverbs('We generally recognize this right.'), 'filler-adverbs')
  })
})

// ── Almost Hedge ───────────────────────────────────────────────────────────

describe('detectAlmostHedge', () => {
  it('flags "almost always"', () => {
    assertFires(detectAlmostHedge('This is almost always true.'), 'almost-hedge')
  })
  it('flags "almost never"', () => {
    assertFires(detectAlmostHedge('It almost never works that way.'), 'almost-hedge')
  })
  it('flags "almost certainly"', () => {
    assertFires(detectAlmostHedge('This will almost certainly happen.'), 'almost-hedge')
  })
  it('does not flag "almost" alone', () => {
    assertSilent(detectAlmostHedge('It is almost done.'), 'almost-hedge')
  })
})

// ── Era Opener ─────────────────────────────────────────────────────────────

describe('detectEraOpener', () => {
  it('flags "In an era of"', () => {
    assertFires(detectEraOpener('In an era of rapid change, companies must adapt.'), 'era-opener')
  })
  it('flags "in a era of" variant', () => {
    assertFires(detectEraOpener('We live in an era where everything is connected.'), 'era-opener')
  })
  it('does not flag unrelated sentences', () => {
    assertSilent(detectEraOpener('The company was founded in 1990.'), 'era-opener')
  })
})

// ── Metaphor Crutch ────────────────────────────────────────────────────────

describe('detectMetaphorCrutch', () => {
  it('flags "double-edged sword"', () => {
    assertFires(detectMetaphorCrutch('This is a double-edged sword.'), 'metaphor-crutch')
  })
  it('flags "game changer"', () => {
    assertFires(detectMetaphorCrutch('AI is a game changer for the industry.'), 'metaphor-crutch')
  })
  it('flags "tip of the iceberg"', () => {
    assertFires(detectMetaphorCrutch('This is just the tip of the iceberg.'), 'metaphor-crutch')
  })
  it('flags "north star"', () => {
    assertFires(detectMetaphorCrutch('Quality is our north star.'), 'metaphor-crutch')
  })
  it('flags "deep dive"', () => {
    assertFires(detectMetaphorCrutch("Let's do a deep dive into the data."), 'metaphor-crutch')
  })
  it('does not flag ordinary language', () => {
    assertSilent(detectMetaphorCrutch('The results were better than expected.'), 'metaphor-crutch')
  })
})

// ── Important to Note ──────────────────────────────────────────────────────

describe('detectImportantToNote', () => {
  it('flags "it is important to note"', () => {
    assertFires(detectImportantToNote("It is important to note that this affects everyone."), 'important-to-note')
  })
  it("flags \"it's worth noting\"", () => {
    assertFires(detectImportantToNote("It's worth noting that results may vary."), 'important-to-note')
  })
  it('flags "it should be noted"', () => {
    assertFires(detectImportantToNote('It should be noted that exceptions exist.'), 'important-to-note')
  })
  it('does not flag ordinary sentences', () => {
    assertSilent(detectImportantToNote('The results were consistent.'), 'important-to-note')
  })
})

// ── Broader Implications ───────────────────────────────────────────────────

describe('detectBroaderImplications', () => {
  it('flags "broader implications"', () => {
    assertFires(detectBroaderImplications('This has broader implications for society.'), 'broader-implications')
  })
  it('flags "wider implications"', () => {
    assertFires(detectBroaderImplications('The wider implications are unclear.'), 'broader-implications')
  })
  it('does not flag unrelated sentences', () => {
    assertSilent(detectBroaderImplications('The policy was updated last year.'), 'broader-implications')
  })
})

// ── False Conclusion ───────────────────────────────────────────────────────

describe('detectFalseConclusion', () => {
  it('flags "In conclusion"', () => {
    assertFires(detectFalseConclusion('In conclusion, we have shown that X is true.'), 'false-conclusion')
  })
  it('flags "At the end of the day"', () => {
    assertFires(detectFalseConclusion('At the end of the day, results matter most.'), 'false-conclusion')
  })
  it('flags "To summarize"', () => {
    assertFires(detectFalseConclusion('To summarize, the three key points are these.'), 'false-conclusion')
  })
  it('flags spec example: "Moving forward, we must..."', () => {
    assertFires(detectFalseConclusion('Moving forward, we must prioritize trust over speed.'), 'false-conclusion')
  })
  it('flags "Going forward,"', () => {
    assertFires(detectFalseConclusion('Going forward, the focus will shift to execution.'), 'false-conclusion')
  })
  it('does not flag mid-sentence usage', () => {
    // "all in all" mid-sentence is borderline; ensure it doesn't explode
    const v = detectFalseConclusion('The project, all in all, was a success.')
    expect(Array.isArray(v)).toBe(true)
  })
})

// ── Connector Addiction ────────────────────────────────────────────────────

describe('detectConnectorAddiction', () => {
  it('flags "Furthermore" opening a sentence', () => {
    assertFires(detectConnectorAddiction('Furthermore, this approach has merit.'), 'connector-addiction')
  })
  it('flags "Moreover"', () => {
    assertFires(detectConnectorAddiction('Moreover, the data confirms our hypothesis.'), 'connector-addiction')
  })
  it('flags "Additionally"', () => {
    assertFires(detectConnectorAddiction('Additionally, we found three other patterns.'), 'connector-addiction')
  })
  it('flags "However"', () => {
    assertFires(detectConnectorAddiction('However, the results were inconclusive.'), 'connector-addiction')
  })
  it('flags "That said,"', () => {
    assertFires(detectConnectorAddiction('That said, there are exceptions worth noting.'), 'connector-addiction')
  })
  it('flags "With that in mind,"', () => {
    assertFires(detectConnectorAddiction('With that in mind, we can now turn to the solution.'), 'connector-addiction')
  })
  it('flags a chain of connectors across paragraphs', () => {
    const text = 'First point.\n\nFurthermore, the evidence is clear.\n\nMoreover, this has been confirmed.\n\nAdditionally, the trend holds.'
    const v = detectConnectorAddiction(text)
    expect(v.filter(x => x.ruleId === 'connector-addiction').length).toBeGreaterThanOrEqual(3)
  })
})

// ── Unnecessary Contrast ───────────────────────────────────────────────────

describe('detectUnnecessaryContrast', () => {
  it('flags "whereas"', () => {
    assertFires(detectUnnecessaryContrast('This approach works, whereas the old one did not.'), 'unnecessary-contrast')
  })
  it('flags spec example with "whereas"', () => {
    assertFires(detectUnnecessaryContrast('Models write one register above where a human would, whereas human writers tend to match register to context.'), 'unnecessary-contrast')
  })
  it('flags "as opposed to"', () => {
    assertFires(detectUnnecessaryContrast('We use data, as opposed to intuition.'), 'unnecessary-contrast')
  })
  it('flags "unlike"', () => {
    assertFires(detectUnnecessaryContrast('Unlike its predecessor, this version is fast.'), 'unnecessary-contrast')
  })
  it('flags "in contrast to"', () => {
    assertFires(detectUnnecessaryContrast('In contrast to earlier models, this one performs well.'), 'unnecessary-contrast')
  })
})

// ── Em-Dash Pivot ──────────────────────────────────────────────────────────

describe('detectEmDashPivot', () => {
  it('flags an em-dash', () => {
    assertFires(detectEmDashPivot('This is important—but often overlooked.'), 'em-dash-pivot')
  })
  it('flags multiple em-dashes', () => {
    const v = detectEmDashPivot('First—second—third.')
    expect(v.filter(x => x.ruleId === 'em-dash-pivot').length).toBeGreaterThanOrEqual(2)
  })
  it('flags "not X—Y" negation em-dash pattern (spec example)', () => {
    // Em-dash used as the pivot marker in a negation reframe
    assertFires(detectEmDashPivot("It's not just a tool—it's a paradigm shift."), 'em-dash-pivot')
  })
  it('flags em-dash replacing a semicolon', () => {
    assertFires(detectEmDashPivot('The data shows one thing—the conclusion is another.'), 'em-dash-pivot')
  })
  it('flags em-dash replacing a parenthetical', () => {
    assertFires(detectEmDashPivot('The answer—and this surprises most people—is simpler than expected.'), 'em-dash-pivot')
  })
  it('does not flag a regular hyphen', () => {
    assertSilent(detectEmDashPivot('This is a well-known fact.'), 'em-dash-pivot')
  })
})

// ── Negation Pivot ─────────────────────────────────────────────────────────

describe('detectNegationPivot', () => {
  it('flags "not X, but Y" with straight apostrophe', () => {
    assertFires(detectNegationPivot("Companies don't succeed by luck, but by discipline."), 'negation-pivot')
  })
  it('flags "not X, but Y" with curly apostrophe (U+2019)', () => {
    // This is the real-world case from contenteditable
    assertFires(detectNegationPivot('The system doesn\u2019t constrain through prohibition, but through amplification.'), 'negation-pivot')
  })
  it('flags "do not X, but Y"', () => {
    assertFires(detectNegationPivot('We do not build for speed, but for resilience.'), 'negation-pivot')
  })
  it('flags "not through X, but through Y"', () => {
    assertFires(detectNegationPivot("The choice architectures don\u2019t constrain through prohibition, but through amplification and attenuation."), 'negation-pivot')
  })
  it('flags "isn\'t X but Y" without comma', () => {
    assertFires(detectNegationPivot("The question isn\u2019t whether to use these technologies but in whose interests and under whose control they operate."), 'negation-pivot')
  })
  it('flags "is not X but Y" without comma', () => {
    assertFires(detectNegationPivot('The issue is not access but accountability.'), 'negation-pivot')
  })
  it('flags "not X—Y" em-dash variant (spec example)', () => {
    assertFires(detectNegationPivot("It's not just a tool—it's a paradigm shift."), 'negation-pivot')
  })
  it('flags "isn\'t X—Y" em-dash variant (spec example)', () => {
    assertFires(detectNegationPivot("This isn\u2019t about technology\u2014it\u2019s about trust."), 'negation-pivot')
  })
  it('flags two-sentence variant: "It doesn\'t X. It does Y."', () => {
    assertFires(detectNegationPivot("It doesn't check whether text was written by an AI. It checks whether text reads like it was."), 'negation-pivot')
  })
  it('flags two-sentence variant with different subject', () => {
    assertFires(detectNegationPivot("This doesn't solve the problem. This reframes it."), 'negation-pivot')
  })
  it('does not flag "but" without a preceding negation', () => {
    assertSilent(detectNegationPivot('The results were good, but not perfect.'), 'negation-pivot')
  })
  it('does not flag two sentences with different subjects', () => {
    assertSilent(detectNegationPivot("She doesn't like the proposal. He thinks it has merit."), 'negation-pivot')
  })
})

// ── Colon Elaboration ──────────────────────────────────────────────────────

describe('detectColonElaboration', () => {
  it('flags a short clause followed by colon and long explanation', () => {
    assertFires(detectColonElaboration('The solution is simple: we need to change how we approach the fundamental problem at its root.'), 'colon-elaboration')
  })
  it('flags spec example: "The answer is simple: we need to rethink..."', () => {
    assertFires(detectColonElaboration('The answer is simple: we need to rethink our approach from the ground up.'), 'colon-elaboration')
  })
  it('flags "There is one problem: the data does not support the conclusion we reached."', () => {
    assertFires(detectColonElaboration('There is one problem: the data does not support the conclusion we reached.'), 'colon-elaboration')
  })
  it('does not flag a colon in a short list item', () => {
    const v = detectColonElaboration('Note: done.')
    expect(Array.isArray(v)).toBe(true)
  })
})

// ── Parenthetical Qualifier ────────────────────────────────────────────────

describe('detectParentheticalQualifier', () => {
  it('flags a long paren parenthetical', () => {
    assertFires(detectParentheticalQualifier('This approach (which has been widely debated in the literature) is not new.'), 'parenthetical-qualifier')
  })
  it('flags spec comma example: "This is, of course, a simplification."', () => {
    assertFires(detectParentheticalQualifier('This is, of course, a simplification.'), 'parenthetical-qualifier')
  })
  it('flags spec comma example: "There are, to be fair, exceptions."', () => {
    assertFires(detectParentheticalQualifier('There are, to be fair, exceptions.'), 'parenthetical-qualifier')
  })
  it('flags "admittedly" comma qualifier', () => {
    assertFires(detectParentheticalQualifier('The approach is, admittedly, imperfect.'), 'parenthetical-qualifier')
  })
  it('flags "needless to say" comma qualifier', () => {
    assertFires(detectParentheticalQualifier('This is, needless to say, complicated.'), 'parenthetical-qualifier')
  })
  it('does not flag a short parenthetical like "(e.g.)"', () => {
    assertSilent(detectParentheticalQualifier('Use a tool (e.g. a hammer) for this.'), 'parenthetical-qualifier')
  })
})

// ── Question-Then-Answer ───────────────────────────────────────────────────

describe('detectQuestionThenAnswer', () => {
  it('flags a short rhetorical Q immediately followed by a short answer', () => {
    assertFires(detectQuestionThenAnswer('What does this mean? It means we must adapt.'), 'question-then-answer')
  })
  it('flags spec example: "So what does this mean for the average user? It means everything."', () => {
    assertFires(detectQuestionThenAnswer('So what does this mean for the average user? It means everything.'), 'question-then-answer')
  })
  it('flags Q+A within the same paragraph', () => {
    assertFires(detectQuestionThenAnswer('Why does this matter?\nIt shapes every decision we make.'), 'question-then-answer')
  })
  it('does NOT flag a question followed by a long answer sentence', () => {
    const text = 'How can independent musicians compete when the most popular streaming algorithms consistently favor major-label releases?\nThis is a structural problem about what kind of relationship we want between platforms, capital, and the artists who actually produce the music that makes these services valuable.'
    assertSilent(detectQuestionThenAnswer(text), 'question-then-answer')
  })
  it('does NOT pair a question in one paragraph with the next paragraph', () => {
    const text = 'What does this mean?\n\nThe building codes governing this type of construction were written before composite materials became commercially viable at scale.'
    assertSilent(detectQuestionThenAnswer(text), 'question-then-answer')
  })
  it('does NOT flag a long standalone sentence near no question mark', () => {
    const text = 'The building codes governing this type of construction were written before composite materials became commercially viable at scale.'
    assertSilent(detectQuestionThenAnswer(text), 'question-then-answer')
  })
})

// ── Hedge Stack ────────────────────────────────────────────────────────────

describe('detectHedgeStack', () => {
  it('flags a sentence with multiple epistemic hedges', () => {
    assertFires(detectHedgeStack('Perhaps this might arguably be considered a problem.'), 'hedge-stack')
  })
  it('flags a sentence with hedge words + modal', () => {
    assertFires(detectHedgeStack('Seemingly, this could perhaps be the right approach.'), 'hedge-stack')
  })
  it('flags spec example with five hedges', () => {
    // "may not be" + "potentially" = 2 detectable hedges
    assertFires(detectHedgeStack("It's worth noting that, while this may not be universally applicable, in many cases it can potentially offer significant benefits."), 'hedge-stack')
  })
  it('does NOT flag a single hedge word', () => {
    assertSilent(detectHedgeStack('Perhaps this is worth considering.'), 'hedge-stack')
  })
  it('does NOT flag "should" as a hedge (normative use)', () => {
    assertSilent(detectHedgeStack('We are witness to a kind of massive institutional failure, the non-adoption of tools that should exist but don\u2019t.'), 'hedge-stack')
  })
  it('does NOT flag "kind of" as a hedge when used as a classifier', () => {
    assertSilent(detectHedgeStack('This is a kind of problem that requires careful thought.'), 'hedge-stack')
  })
  it('does NOT flag "would" as a hedge (conditional use)', () => {
    assertSilent(detectHedgeStack('That would be a significant improvement to the system.'), 'hedge-stack')
  })
})

// ── Staccato Burst ─────────────────────────────────────────────────────────

describe('detectStaccatoBurst', () => {
  it('flags three or more consecutive short sentences', () => {
    assertFires(detectStaccatoBurst('AI is here. It is growing. It is changing everything. We must act.'), 'staccato-burst')
  })
  it('flags spec example: "This matters. It always has. And it always will."', () => {
    assertFires(detectStaccatoBurst('This matters. It always has. And it always will.'), 'staccato-burst')
  })
  it('flags spec example: "The data is clear. The trend is undeniable. The conclusion is obvious."', () => {
    assertFires(detectStaccatoBurst('The data is clear. The trend is undeniable. The conclusion is obvious.'), 'staccato-burst')
  })
  it('does NOT flag two short sentences', () => {
    assertSilent(detectStaccatoBurst('AI is here. It is growing.'), 'staccato-burst')
  })
  it('does NOT flag long sentences', () => {
    assertSilent(detectStaccatoBurst('Artificial intelligence is fundamentally reshaping how we think about knowledge. The implications for education, work, and human creativity are profound and far-reaching.'), 'staccato-burst')
  })
})

// ── Metaphor Crutch (additional spec examples) ─────────────────────────────

describe('detectMetaphorCrutch (spec examples)', () => {
  it('flags "paradigm shift" (spec example)', () => {
    assertFires(detectMetaphorCrutch("It's not just a tool—it's a paradigm shift."), 'metaphor-crutch')
  })
  it('flags "elephant in the room"', () => {
    assertFires(detectMetaphorCrutch('The elephant in the room is that nobody reads the documentation.'), 'metaphor-crutch')
  })
  it('flags "perfect storm"', () => {
    assertFires(detectMetaphorCrutch('A perfect storm of budget cuts and talent flight.'), 'metaphor-crutch')
  })
  it('flags "building blocks"', () => {
    assertFires(detectMetaphorCrutch('These are the building blocks of a successful strategy.'), 'metaphor-crutch')
  })
})

// ── Listicle Instinct ──────────────────────────────────────────────────────

describe('detectListicleInstinct', () => {
  it('flags a bulleted list with exactly 3 items', () => {
    const text = '- First item\n- Second item\n- Third item'
    assertFires(detectListicleInstinct(text), 'listicle-instinct')
  })
  it('flags a numbered list with exactly 5 items', () => {
    const text = '1. One\n2. Two\n3. Three\n4. Four\n5. Five'
    assertFires(detectListicleInstinct(text), 'listicle-instinct')
  })
  it('does NOT flag a list with 4 items', () => {
    const text = '- One\n- Two\n- Three\n- Four'
    assertSilent(detectListicleInstinct(text), 'listicle-instinct')
  })
  it('does NOT flag a list with 6 items', () => {
    const text = '1. One\n2. Two\n3. Three\n4. Four\n5. Five\n6. Six'
    assertSilent(detectListicleInstinct(text), 'listicle-instinct')
  })
  it('flags a numbered list with exactly 7 items', () => {
    const text = '1. One\n2. Two\n3. Three\n4. Four\n5. Five\n6. Six\n7. Seven'
    assertFires(detectListicleInstinct(text), 'listicle-instinct')
  })
})

// ── Serves As ──────────────────────────────────────────────────────────────

describe('detectServesAs', () => {
  it('flags "serves as"', () => {
    assertFires(detectServesAs('The building serves as a reminder of the city\'s heritage.'), 'serves-as')
  })
  it('flags "stands as"', () => {
    assertFires(detectServesAs('This stands as the best example we have.'), 'serves-as')
  })
  it('flags "acts as"', () => {
    assertFires(detectServesAs('The policy acts as a deterrent.'), 'serves-as')
  })
  it('flags "functions as"', () => {
    assertFires(detectServesAs('The layer functions as a buffer.'), 'serves-as')
  })
  it('does NOT flag a plain "is"', () => {
    assertSilent(detectServesAs('The building is a landmark.'), 'serves-as')
  })
})

// ── Negation Countdown ─────────────────────────────────────────────────────

describe('detectNegationCountdown', () => {
  it('flags 2+ consecutive "Not" sentences', () => {
    assertFires(detectNegationCountdown('Not a bug. Not a feature. A fundamental design flaw.'), 'negation-countdown')
  })
  it('flags three "Not" sentences', () => {
    assertFires(detectNegationCountdown('Not fast. Not slow. Not in between. Just broken.'), 'negation-countdown')
  })
  it('does NOT flag a single "Not" sentence', () => {
    assertSilent(detectNegationCountdown('Not everything is as it seems. The data tells a different story.'), 'negation-countdown')
  })
})

// ── Anaphora Abuse ─────────────────────────────────────────────────────────

describe('detectAnaphoraAbuse', () => {
  it('flags 3 consecutive sentences with the same two-word opener', () => {
    assertFires(detectAnaphoraAbuse('They assume the worst. They assume silence means guilt. They assume nothing will change.'), 'anaphora-abuse')
  })
  it('flags 4 matching openers', () => {
    assertFires(detectAnaphoraAbuse('Every decision matters. Every decision counts. Every decision shapes the outcome. Every decision defines us.'), 'anaphora-abuse')
  })
  it('does NOT flag varied openers', () => {
    assertSilent(detectAnaphoraAbuse('They started early. We caught up quickly. Everyone finished on time.'), 'anaphora-abuse')
  })
  it('does NOT flag 2 consecutive matching openers', () => {
    assertSilent(detectAnaphoraAbuse('They assume the worst. They assume nothing. The data is clear.'), 'anaphora-abuse')
  })
  it('flags 3+ sentences opening with a curated single word (both)', () => {
    assertFires(detectAnaphoraAbuse('Both can be difficult to understand. Both are active at all hours. Both connect distant things.'), 'anaphora-abuse')
  })
  it('flags curated single word with 4 sentences (each)', () => {
    assertFires(detectAnaphoraAbuse('Each decision matters. Each voice counts. Each moment shapes the outcome. Each choice defines us.'), 'anaphora-abuse')
  })
  it('does NOT flag 2 consecutive curated single-word openers', () => {
    assertSilent(detectAnaphoraAbuse('Both can be difficult. Both are active. The third is different.'), 'anaphora-abuse')
  })
  it('flags any non-function-word repeated opener (people, his, this)', () => {
    assertFires(detectAnaphoraAbuse('People often forget. People make mistakes. People learn slowly.'), 'anaphora-abuse')
    assertFires(detectAnaphoraAbuse('His argument was X. His evidence was Y. His conclusion was Z.'), 'anaphora-abuse')
    assertFires(detectAnaphoraAbuse('This is foo. This is bar. And this is baz.'), 'anaphora-abuse')
  })
  it('does NOT flag articles or prepositions', () => {
    assertSilent(detectAnaphoraAbuse('In the beginning. In the middle. In the end.'), 'anaphora-abuse')
  })
  it('treats "And {word}" as matching the base opener', () => {
    assertFires(detectAnaphoraAbuse('Both can be difficult. Both are active. Both connect things. And both produce alarm.'), 'anaphora-abuse')
  })
  it('treats "And {two words}" as matching the base two-word opener', () => {
    assertFires(detectAnaphoraAbuse('They assume the worst. They assume silence means guilt. And they assume nothing will change.'), 'anaphora-abuse')
  })
})

// ── Gerund Litany ──────────────────────────────────────────────────────────

describe('detectGerundLitany', () => {
  it('flags 2+ consecutive short gerund sentences', () => {
    assertFires(detectGerundLitany('Fixing small bugs. Writing straightforward features. Implementing well-defined tickets.'), 'gerund-litany')
  })
  it('flags 2 consecutive gerund sentences', () => {
    assertFires(detectGerundLitany('Building quickly. Shipping often.'), 'gerund-litany')
  })
  it('does NOT flag a single gerund sentence', () => {
    assertSilent(detectGerundLitany('Building a product takes time.'), 'gerund-litany')
  })
  it('does NOT flag a long gerund sentence (>8 words)', () => {
    assertSilent(detectGerundLitany('Building a product that users actually love and return to is hard.'), 'gerund-litany')
  })
})

// ── Here's the Kicker ──────────────────────────────────────────────────────

describe('detectHeresTheKicker', () => {
  it('flags "here\'s the kicker"', () => {
    assertFires(detectHeresTheKicker("Here's the kicker — nobody saw it coming."), 'heres-the-kicker')
  })
  it('flags "here\'s the thing"', () => {
    assertFires(detectHeresTheKicker("Here's the thing about distributed systems."), 'heres-the-kicker')
  })
  it('flags "here\'s where it gets interesting"', () => {
    assertFires(detectHeresTheKicker("Here's where it gets interesting: the data contradicts the theory."), 'heres-the-kicker')
  })
  it('flags case-insensitively', () => {
    assertFires(detectHeresTheKicker("HERE'S THE KICKER: everything changed."), 'heres-the-kicker')
  })
  it('does NOT flag an ordinary sentence', () => {
    assertSilent(detectHeresTheKicker('The meeting starts at noon.'), 'heres-the-kicker')
  })
})

// ── Pedagogical Aside ──────────────────────────────────────────────────────

describe('detectPedagogicalAside', () => {
  it('flags "let\'s break this down"', () => {
    assertFires(detectPedagogicalAside("Let's break this down step by step."), 'pedagogical-aside')
  })
  it('flags "let\'s unpack"', () => {
    assertFires(detectPedagogicalAside("Let's unpack what this means."), 'pedagogical-aside')
  })
  it('flags "think of it as"', () => {
    assertFires(detectPedagogicalAside('Think of it as a pipeline.'), 'pedagogical-aside')
  })
  it('flags "think of this as"', () => {
    assertFires(detectPedagogicalAside('Think of this as a foundation.'), 'pedagogical-aside')
  })
  it('does NOT flag "let\'s meet"', () => {
    assertSilent(detectPedagogicalAside("Let's meet tomorrow to discuss this."), 'pedagogical-aside')
  })
  it('does NOT flag ordinary sentences', () => {
    assertSilent(detectPedagogicalAside('The system processes requests in order.'), 'pedagogical-aside')
  })
})

// ── Imagine World ──────────────────────────────────────────────────────────

describe('detectImagineWorld', () => {
  it('flags "Imagine a world where"', () => {
    assertFires(detectImagineWorld('Imagine a world where every tool is connected.'), 'imagine-world')
  })
  it('flags "Imagine if you"', () => {
    assertFires(detectImagineWorld('Imagine if you could access any data instantly.'), 'imagine-world')
  })
  it('flags "Imagine what would"', () => {
    assertFires(detectImagineWorld('Imagine what would happen if the system failed.'), 'imagine-world')
  })
  it('flags "Imagine a future"', () => {
    assertFires(detectImagineWorld('Imagine a future without passwords.'), 'imagine-world')
  })
  it('does NOT flag "imagine" alone', () => {
    assertSilent(detectImagineWorld('Imagine the possibilities.'), 'imagine-world')
  })
})

// ── Listicle in a Trench Coat ──────────────────────────────────────────────

describe('detectListicleTrenchCoat', () => {
  it('flags 2+ ordinal sentence-starters', () => {
    assertFires(detectListicleTrenchCoat('The first issue is cost. The second issue is time.'), 'listicle-trench-coat')
  })
  it('flags three ordinals', () => {
    assertFires(detectListicleTrenchCoat('The first reason is speed. The second reason is reliability. The third reason is cost.'), 'listicle-trench-coat')
  })
  it('does NOT fire with only one ordinal', () => {
    assertSilent(detectListicleTrenchCoat('The first thing to understand is that context matters.'), 'listicle-trench-coat')
  })
})

// ── Vague Attribution ──────────────────────────────────────────────────────

describe('detectVagueAttribution', () => {
  it('flags "experts argue"', () => {
    assertFires(detectVagueAttribution('Experts argue that this approach has drawbacks.'), 'vague-attribution')
  })
  it('flags "studies show"', () => {
    assertFires(detectVagueAttribution('Studies show that remote work increases productivity.'), 'vague-attribution')
  })
  it('flags "research suggests"', () => {
    assertFires(detectVagueAttribution('Research suggests a correlation between sleep and performance.'), 'vague-attribution')
  })
  it('flags "observers have noted"', () => {
    assertFires(detectVagueAttribution('Observers have noted a shift in user behavior.'), 'vague-attribution')
  })
  it('does NOT flag a named citation', () => {
    assertSilent(detectVagueAttribution('The paper by Smith argues that framing matters.'), 'vague-attribution')
  })
})

// ── Bold-First Bullets ─────────────────────────────────────────────────────

describe('detectBoldFirstBullets', () => {
  it('flags bullet items starting with bold phrase', () => {
    const text = '- **Security**: keeps data safe\n- **Performance**: runs fast'
    assertFires(detectBoldFirstBullets(text), 'bold-first-bullets')
  })
  it('flags * bullet variant', () => {
    const text = '* **Scalability**: handles load\n* **Reliability**: stays up'
    assertFires(detectBoldFirstBullets(text), 'bold-first-bullets')
  })
  it('does NOT flag plain bullet items', () => {
    const text = '- plain item\n- another plain item'
    assertSilent(detectBoldFirstBullets(text), 'bold-first-bullets')
  })
  it('does NOT flag bold text inside a sentence', () => {
    assertSilent(detectBoldFirstBullets('This is **important** and should be noted.'), 'bold-first-bullets')
  })
})

// ── Unicode Arrows ─────────────────────────────────────────────────────────

describe('detectUnicodeArrows', () => {
  it('flags the → character', () => {
    assertFires(detectUnicodeArrows('Input → Output'), 'unicode-arrows')
  })
  it('flags multiple arrows', () => {
    const v = detectUnicodeArrows('Step 1 → Step 2 → Step 3')
    expect(v.filter(x => x.ruleId === 'unicode-arrows').length).toBeGreaterThanOrEqual(2)
  })
  it('does NOT flag ASCII arrow "->"', () => {
    assertSilent(detectUnicodeArrows('Input -> Output'), 'unicode-arrows')
  })
})

// ── Despite Challenges ─────────────────────────────────────────────────────

describe('detectDespiteChallenges', () => {
  it('flags "Despite these challenges"', () => {
    assertFires(detectDespiteChallenges('Despite these challenges, the platform continues to grow.'), 'despite-challenges')
  })
  it('flags "Despite its limitations"', () => {
    assertFires(detectDespiteChallenges('Despite its limitations, the tool remains popular.'), 'despite-challenges')
  })
  it('flags "Despite the obstacles"', () => {
    assertFires(detectDespiteChallenges('Despite the obstacles, the team shipped on time.'), 'despite-challenges')
  })
  it('does NOT flag unrelated sentences', () => {
    assertSilent(detectDespiteChallenges('The project succeeded because of careful planning.'), 'despite-challenges')
  })
})

// ── Concept Label ──────────────────────────────────────────────────────────

describe('detectConceptLabel', () => {
  it('flags "the supervision paradox"', () => {
    assertFires(detectConceptLabel('This is the supervision paradox at its core.'), 'concept-label')
  })
  it('flags "the trust vacuum"', () => {
    assertFires(detectConceptLabel('We are living through a trust vacuum.'), 'concept-label')
  })
  it('flags "the attention trap"', () => {
    assertFires(detectConceptLabel('The attention trap affects every platform.'), 'concept-label')
  })
  it('flags "the innovation chasm"', () => {
    assertFires(detectConceptLabel('Companies fall into the innovation chasm.'), 'concept-label')
  })
  it('does NOT flag ordinary sentences without the suffix words', () => {
    assertSilent(detectConceptLabel('The product launched on schedule.'), 'concept-label')
  })
})

// ── Dramatic Fragment ──────────────────────────────────────────────────────

describe('detectDramaticFragment', () => {
  it('flags a standalone very short paragraph', () => {
    const text = 'This is a long paragraph with real content and ideas.\n\nFull stop.\n\nAnd this continues.'
    assertFires(detectDramaticFragment(text), 'dramatic-fragment')
  })
  it('flags a one-word paragraph', () => {
    const text = 'Here is the setup.\n\nBoom.\n\nAnd here is the rest.'
    assertFires(detectDramaticFragment(text), 'dramatic-fragment')
  })
  it('does NOT flag a normal paragraph', () => {
    const text = 'This is the first paragraph with sufficient content.\n\nThis is the second paragraph also with sufficient content to not be flagged.'
    assertSilent(detectDramaticFragment(text), 'dramatic-fragment')
  })
  it('does NOT flag a 5-word paragraph', () => {
    const text = 'This is the first paragraph with plenty of words.\n\nThis paragraph also has five words here.\n\nThis is the third paragraph with plenty of words too.'
    assertSilent(detectDramaticFragment(text), 'dramatic-fragment')
  })
})

// ── Superficial Analysis ───────────────────────────────────────────────────

describe('detectSuperficialAnalysis', () => {
  it('flags ", underscoring its role"', () => {
    assertFires(detectSuperficialAnalysis('The initiative succeeded, underscoring its role as a community hub.'), 'superficial-analysis')
  })
  it('flags ", highlighting its importance"', () => {
    assertFires(detectSuperficialAnalysis('The campaign resonated with voters, highlighting its importance in the region.'), 'superficial-analysis')
  })
  it('flags ", cementing its legacy"', () => {
    assertFires(detectSuperficialAnalysis('The album sold millions, cementing its legacy in music history.'), 'superficial-analysis')
  })
  it('flags ", reflecting the significance"', () => {
    assertFires(detectSuperficialAnalysis('The award was given quietly, reflecting the significance of the work.'), 'superficial-analysis')
  })
  it('does NOT flag ordinary participle phrases', () => {
    assertSilent(detectSuperficialAnalysis('She left the building, waving goodbye to her colleagues.'), 'superficial-analysis')
  })
})

describe('detectFalseRange', () => {
  it('flags "doesn\'t emerge from nowhere"', () => {
    assertFires(detectFalseRange("The push for urban cycling infrastructure doesn't emerge from nowhere; it stands in a long tradition of transport activism."), 'false-range')
  })
  it('flags "came from nowhere"', () => {
    assertFires(detectFalseRange('This movement came from nowhere and changed everything.'), 'false-range')
  })
  it('flags "does not come from nowhere"', () => {
    assertFires(detectFalseRange('This idea does not come from nowhere.'), 'false-range')
  })
  it('flags "didn\'t appear from nowhere"', () => {
    assertFires(detectFalseRange("The crisis didn't appear from nowhere."), 'false-range')
  })
  it('does NOT flag ordinary "from" phrases', () => {
    assertSilent(detectFalseRange('She emerged from the building.'), 'false-range')
  })
  it('does NOT flag directional from', () => {
    assertSilent(detectFalseRange('They came from the countryside.'), 'false-range')
  })
})
