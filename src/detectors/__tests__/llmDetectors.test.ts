/**
 * LLM detector integration tests.
 *
 * These tests make real API calls to Anthropic. They require the env var:
 *   ANTHROPIC_API_KEY=sk-ant-...
 *
 * Run with:
 *   ANTHROPIC_API_KEY=... pnpm test:llm
 *
 * They are excluded from the default `pnpm test` run (which covers client-side
 * detectors only) because they are slow and require a key.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { runLLMDetectors } from '../llmDetectors'
import type { Violation } from '../../types'

const API_KEY = process.env.ANTHROPIC_API_KEY ?? ''

beforeAll(() => {
  if (!API_KEY) {
    throw new Error('ANTHROPIC_API_KEY env var required to run LLM detector tests.')
  }
})

// Helper: assert at least one violation of the given rule
function hasFired(violations: Violation[], ruleId: string) {
  return violations.some(v => v.ruleId === ruleId)
}

// ── Triple Construction ────────────────────────────────────────────────────

describe('triple-construction', () => {
  it('flags a classic X, Y, and Z parallel construction', async () => {
    const text = 'The platform helps users discover, share, and monetize their creative work.'
    const v = await runLLMDetectors(text, API_KEY)
    expect(hasFired(v, 'triple-construction')).toBe(true)
  }, 20_000)

  it('does NOT flag a two-item list', async () => {
    const text = 'The system supports reading and writing.'
    const v = await runLLMDetectors(text, API_KEY)
    expect(hasFired(v, 'triple-construction')).toBe(false)
  }, 20_000)

  it('does NOT flag a four-item list', async () => {
    const text = 'The report covers privacy, security, compliance, and governance.'
    const v = await runLLMDetectors(text, API_KEY)
    expect(hasFired(v, 'triple-construction')).toBe(false)
  }, 20_000)
})

// ── Throat-Clearing Opener ─────────────────────────────────────────────────

describe('throat-clearing', () => {
  it('flags an opening paragraph that adds no information', async () => {
    const text = `In today's rapidly evolving landscape, it is more important than ever to understand the forces shaping our world. This essay will explore these themes in depth.\n\nPrivacy is a fundamental right.`
    const v = await runLLMDetectors(text, API_KEY)
    expect(hasFired(v, 'throat-clearing')).toBe(true)
  }, 20_000)

  it('does NOT flag an opening paragraph that leads with substance', async () => {
    const text = `Privacy law has failed to keep pace with the data economy. The gap between what companies collect and what users understand is now measured in decades.\n\nThe consequences are concrete.`
    const v = await runLLMDetectors(text, API_KEY)
    expect(hasFired(v, 'throat-clearing')).toBe(false)
  }, 20_000)
})

// ── Sycophantic Frame ──────────────────────────────────────────────────────

describe('sycophantic-frame', () => {
  it('flags an opening that compliments the question', async () => {
    const text = "That's a great question. The history of data privacy is long and complex."
    const v = await runLLMDetectors(text, API_KEY)
    expect(hasFired(v, 'sycophantic-frame')).toBe(true)
  }, 20_000)

  it('flags "This is a fascinating topic"', async () => {
    const text = 'This is a fascinating topic that deserves careful consideration. Data rights are important.'
    const v = await runLLMDetectors(text, API_KEY)
    expect(hasFired(v, 'sycophantic-frame')).toBe(true)
  }, 20_000)

  it('does NOT flag a direct opening statement', async () => {
    const text = 'Data brokers profit from information asymmetry. The fix is mandatory disclosure.'
    const v = await runLLMDetectors(text, API_KEY)
    expect(hasFired(v, 'sycophantic-frame')).toBe(false)
  }, 20_000)
})

// ── Balanced Take ──────────────────────────────────────────────────────────

describe('balanced-take', () => {
  it('flags a claim immediately softened into nothing', async () => {
    const text = 'Surveillance capitalism is deeply harmful to human autonomy. Of course, data-driven systems also provide genuine value and it would be unfair to dismiss their benefits entirely.'
    const v = await runLLMDetectors(text, API_KEY)
    expect(hasFired(v, 'balanced-take')).toBe(true)
  }, 20_000)

  it('does NOT flag a genuine, specific concession', async () => {
    const text = 'High-frequency trading does distort price discovery in small-cap stocks. The distortion is worst in the fifteen minutes after a major index rebalancing, when bid-ask spreads widen by roughly 40 basis points.'
    const v = await runLLMDetectors(text, API_KEY)
    expect(hasFired(v, 'balanced-take')).toBe(false)
  }, 20_000)
})

// ── Unnecessary Elaboration ────────────────────────────────────────────────

describe('unnecessary-elaboration', () => {
  it('flags a sentence that restates its own point', async () => {
    const text = 'The reform failed. It did not succeed, and the attempt to change things did not work out as intended.'
    const v = await runLLMDetectors(text, API_KEY)
    expect(hasFired(v, 'unnecessary-elaboration')).toBe(true)
  }, 20_000)

  it('does NOT flag a sentence that adds new information', async () => {
    const text = 'The reform failed. Three senators who had co-sponsored the bill switched their votes after a closed-door meeting with industry lobbyists.'
    const v = await runLLMDetectors(text, API_KEY)
    expect(hasFired(v, 'unnecessary-elaboration')).toBe(false)
  }, 20_000)
})

// ── Empathy Performance ────────────────────────────────────────────────────

describe('empathy-performance', () => {
  it('flags generic emotional language applicable to anything', async () => {
    const text = "I understand this can be a difficult and emotional topic. Your concerns are completely valid and it's okay to feel overwhelmed."
    const v = await runLLMDetectors(text, API_KEY)
    expect(hasFired(v, 'empathy-performance')).toBe(true)
  }, 20_000)

  it('does NOT flag specific, grounded emotional acknowledgment', async () => {
    const text = 'Getting laid off at 55 is not the same as getting laid off at 25. Your network is smaller, your skills are assumed to be outdated, and the recruiter who takes your call is half your age and has no idea what to do with you.'
    const v = await runLLMDetectors(text, API_KEY)
    expect(hasFired(v, 'empathy-performance')).toBe(false)
  }, 20_000)
})

// ── Pivot Paragraph ────────────────────────────────────────────────────────

describe('pivot-paragraph', () => {
  it('flags a one-sentence paragraph that only transitions', async () => {
    const text = `Remote work has changed how teams collaborate.\n\nWith this background established, we can now turn to the question of productivity measurement.\n\nProductivity is notoriously difficult to measure for knowledge workers.`
    const v = await runLLMDetectors(text, API_KEY)
    expect(hasFired(v, 'pivot-paragraph')).toBe(true)
  }, 20_000)

  it('does NOT flag a one-sentence paragraph that contains a real claim', async () => {
    const text = `Remote work has changed how teams collaborate.\n\nCompanies that went fully remote in 2020 saw attrition drop by 18% in the first year before rebounding sharply in year three.\n\nRetention is now the central challenge.`
    const v = await runLLMDetectors(text, API_KEY)
    expect(hasFired(v, 'pivot-paragraph')).toBe(false)
  }, 20_000)
})

// ── False Range ────────────────────────────────────────────────────────────

describe('false-range', () => {
  it('flags a hollow "from X to Y" range', async () => {
    const text = 'From innovation to cultural transformation, the impact has been significant.'
    const v = await runLLMDetectors(text, API_KEY)
    expect(hasFired(v, 'false-range')).toBe(true)
  }, 20_000)
})

// ── Grandiose Stakes ───────────────────────────────────────────────────────

describe('grandiose-stakes', () => {
  it('flags inflated world-historical significance', async () => {
    const text = 'This will fundamentally reshape how we think about everything.'
    const v = await runLLMDetectors(text, API_KEY)
    expect(hasFired(v, 'grandiose-stakes')).toBe(true)
  }, 20_000)
})

// ── Historical Analogy Stack ───────────────────────────────────────────────

describe('historical-analogy', () => {
  it('flags rapid-fire company name stacking', async () => {
    const text = "Apple didn't build Uber. Facebook didn't build Spotify. Stripe didn't build Shopify."
    const v = await runLLMDetectors(text, API_KEY)
    expect(hasFired(v, 'historical-analogy')).toBe(true)
  }, 20_000)
})

// ── False Vulnerability ────────────────────────────────────────────────────

describe('false-vulnerability', () => {
  it('flags performative honesty', async () => {
    const text = "And yes, I'll be honest — I'm openly in love with this platform."
    const v = await runLLMDetectors(text, API_KEY)
    expect(hasFired(v, 'false-vulnerability')).toBe(true)
  }, 20_000)
})

// ── suggestedChange ────────────────────────────────────────────────────────

describe('suggestedChange', () => {
  it('returns a suggestedChange that differs from the matched text', async () => {
    const text = 'That is a great question. The answer involves several considerations.'
    const v = await runLLMDetectors(text, API_KEY)
    const sycophantic = v.find(x => x.ruleId === 'sycophantic-frame')
    expect(sycophantic).toBeDefined()
    expect(sycophantic?.suggestedChange).toBeDefined()
    expect(sycophantic?.suggestedChange).not.toBe(sycophantic?.matchedText)
  }, 20_000)

  it('returns a matchedText that exists verbatim in the source', async () => {
    const text = 'The platform helps users discover, share, and monetize their creative work.'
    const v = await runLLMDetectors(text, API_KEY)
    for (const violation of v) {
      expect(text.includes(violation.matchedText)).toBe(true)
    }
  }, 20_000)
})
