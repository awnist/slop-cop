/**
 * Runs LLM analysis on SAMPLE_TEXT and writes the results to
 * src/data/sampleViolations.json. Re-run whenever SAMPLE_TEXT changes:
 *
 *   pnpm run seed
 *
 * Requires ANTHROPIC_API_KEY in .env
 */

import { writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../.env') })

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  console.error('ANTHROPIC_API_KEY not set in .env')
  process.exit(1)
}

// Import shared text and detector logic
const { SAMPLE_TEXT } = await import('../src/data/sampleText.ts')
const { runLLMDetectors, runDocumentDetectors } = await import('../src/detectors/llmDetectors.ts')

console.log('Running fast pass (Haiku)...')
const fast = await runLLMDetectors(SAMPLE_TEXT, apiKey)
console.log(`  ${fast.length} violations`)

console.log('Running deep pass (Sonnet)...')
const deep = await runDocumentDetectors(SAMPLE_TEXT, apiKey)
console.log(`  ${deep.length} violations`)

const all = [...fast, ...deep]
const outPath = resolve(__dirname, '../src/data/sampleViolations.json')
writeFileSync(outPath, JSON.stringify(all, null, 2))
console.log(`\nWrote ${all.length} violations to src/data/sampleViolations.json`)
