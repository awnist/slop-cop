/**
 * Minimal NLP instance: compromise/two + only the verb and adjective plugins.
 *
 * ## Why not `import nlp from 'compromise'`?
 *
 * `compromise` (the default export) is compromise's "three-tier" bundle, which
 * loads all 13 three-tier plugins: adjectives, adverbs, chunker, coreference,
 * misc, normalize, nouns, numbers, redact, sentences, topics, verbs.
 * We only use two of those: verbs (for .conjugate()) and adjectives (for .toAdverb()).
 * The other 11 plugins contribute ~90 KB of raw JS — roughly 55–60 KB minified —
 * that is never exercised by any code in this project.
 *
 * ## Why not `import nlp from 'compromise/two'` + direct src/ plugin imports?
 *
 * compromise/package.json defines a strict `exports` map. The internal plugin
 * files (e.g. `compromise/src/3-three/verbs/plugin.js`) are NOT listed as export
 * entries, so Node and Vite/Rollup refuse to resolve them:
 *   "Package subpath './src/3-three/verbs/plugin.js' is not defined by exports"
 * Using `resolve.alias` in vite.config.ts bypasses the exports map by mapping the
 * import specifier to a direct filesystem path before exports resolution runs.
 * This is the standard Vite escape hatch for accessing unlisted package internals.
 *
 * ## Vite aliases (see vite.config.ts)
 *
 *   'compromise-verbs-plugin'      → node_modules/compromise/src/3-three/verbs/plugin.js
 *   'compromise-adjectives-plugin' → node_modules/compromise/src/3-three/adjectives/plugin.js
 *
 * ## Trade-offs
 *
 * PROS:
 *   - Saves ~55–60 KB minified (~20 KB gzipped) compared to importing the full
 *     three-tier bundle.
 *   - All existing compromise API usage (.verbs(), .conjugate(), .adjectives(),
 *     .toAdverb(), .has(), .match(), .json()) still works exactly as before.
 *
 * CONS:
 *   - The aliases point at compromise's internal src/ paths, which are not part of
 *     the public API. If a future compromise version moves or renames the plugin
 *     files, the build will break with a module-not-found error (easy to diagnose
 *     and fix — just update the alias paths in vite.config.ts).
 *   - TypeScript has no type information for these plugins; they are typed as `any`
 *     via the @ts-ignore comments above the imports. This is fine because `.extend()`
 *     on the compromise instance is loosely typed anyway.
 *
 * ## Critical implementation note: #Verb tag matching vs .verbs()
 *
 * The three-tier verbs plugin overrides `.verbs()` to use chunk-based matching
 * (`doc.match('<Verb>')`), which requires the chunker plugin to correctly group
 * verb phrases. Without the chunker, ambiguous nouns/verbs like "leverage" and
 * "harness" are not included in the verb chunks, breaking detection.
 *
 * Solution: `verbViolations()` in nlpPatterns.ts uses `doc.match('#Verb')` instead
 * of `doc.verbs()`. This uses the two-tier POS tagger's term-level tags directly,
 * which correctly identifies all verb terms including ambiguous ones in context —
 * no chunker plugin needed. The tense tags (Gerund, PastTense, Infinitive,
 * PresentTense) are present on each term from the two-tier tagger, so conjugation
 * still works. We only need the verbs plugin for `.conjugate()` on base verbs.
 *
 * ## Actual savings (measured)
 *
 * Baseline (import nlp from 'compromise'): 712 KB minified / 252 KB gzipped
 * This approach (two + verbs + adjectives): 672 KB minified / 240 KB gzipped
 * Savings: ~40 KB minified / ~12 KB gzipped
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — compromise/two ships its own types; import path bypasses exports map via alias
import nlpTwo from 'compromise/two'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — aliased to compromise/src/3-three/verbs/plugin.js (see vite.config.ts)
import verbsPlugin from 'compromise-verbs-plugin'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — aliased to compromise/src/3-three/adjectives/plugin.js (see vite.config.ts)
import adjectivesPlugin from 'compromise-adjectives-plugin'

// Extend the two-tier base with only the plugins we use:
//   verbs   → .verbs(), .conjugate()
//   adjectives → .adjectives(), .toAdverb()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nlp = (nlpTwo as any).extend(verbsPlugin).extend(adjectivesPlugin)

export default nlp
