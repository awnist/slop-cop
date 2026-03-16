# Slop Cop

Web app that detects LLM-generated prose patterns in text and highlights them with color-coded annotations.

## Stack

- **Vite + React 19 + TypeScript** — frontend only, no backend
- **pnpm** — use pnpm for all package operations, never npm or yarn
- `pnpm dev` — dev server on localhost:5173
- `pnpm build` — type-check + build to `dist/`
- `pnpm test` — Vitest unit tests (285 tests, all client-side detectors)

## Architecture

All detection runs client-side. No server required.

```
src/
  App.tsx                    # Root: state, editor, popover, apply-change wiring
  rules.ts                   # All rule definitions (id, name, tip, color, canRemove, requiresLLM)
  types.ts                   # ViolationRule, Violation, ViolationCategory
  detectors/
    index.ts                 # runClientDetectors() — calls all regex/structural detectors
    wordPatterns.ts          # All client-side detectors (word lists, regex, sentence analysis)
    nlpPatterns.ts           # NLP-assisted detectors using compromise (context-sensitive, sentence-chunked)
    llmDetectors.ts          # Claude API calls for semantic detections (two-tier)
  components/
    Toolbar.tsx              # Top bar: branding, API key management, LLM run button
    Sidebar.tsx              # Right panel: violation cards with counts and eye toggles
    Popover.tsx              # Click popover: rule name, explanation, inline diff, Apply button
  hooks/
    useHashText.ts           # Syncs text to URL hash via replaceState (debounced 600ms)
  utils/
    buildHighlightedHTML.ts  # Converts text + violations → HTML string with <mark> spans
```

## Detection tiers

**Client-side (instant):** regex and structural analysis in `wordPatterns.ts`. Fire on every keystroke after a 350ms debounce.

**Semantic (optional):** requires an Anthropic API key entered in the toolbar. Two parallel API calls fire when the user clicks "Run semantic analysis":

1. **Fast pass** — `claude-haiku-4-5-20251001`, 30s timeout. Sentence and paragraph-level patterns (10 rules): throat-clearing, sycophantic frame, balanced take, unnecessary elaboration, empathy performance, pivot paragraph, grandiose stakes, historical analogy, false vulnerability, false range (subtle cases).
2. **Deep pass** — `claude-sonnet-4-6`, 60s timeout. Document-level structural patterns (3 rules): dead metaphor, one-point dilution, fractal summaries.

Both calls use `anthropic-dangerous-direct-browser-access: true` to enable CORS directly from the browser. No proxy needed. Results from the fast pass appear first; deep pass results merge in when Sonnet finishes. Status: `idle → loading → done/error`. Editing after analysis sets status to `stale`, showing a "Re-analyze" button.

## Rules

Each rule in `src/rules.ts` has:
- `id` — used as the key everywhere
- `name` — short display name
- `category` — `word-choice | sentence-structure | rhetorical | structural | framing`
- `description` — what the pattern is
- `tip` — actionable advice shown in the popover (italic, serif)
- `canRemove` — if true, Apply with empty replacement is offered (deletion)
- `color` / `bgColor` — highlight colors
- `requiresLLM` — if true, only detected via the API call; sidebar hides the rule when no API key

## Rules count

- **Client-side rules:** 36
- **LLM-required rules:** 12 (9 sentence-level + 3 document-level)
- **Total:** 48

## Adding a new rule

1. Add a `ViolationRule` entry to `src/rules.ts`
2. If client-side: write `detectXxx(text: string): Violation[]` in `wordPatterns.ts`, export it, add it to `runClientDetectors()` in `detectors/index.ts`
3. If LLM sentence-level: add the pattern description to `LLM_RULES_PROMPT` in `llmDetectors.ts`
4. If LLM document-level: add to `DOCUMENT_RULES_PROMPT` in `llmDetectors.ts`

## False positive risks

- **`dramatic-fragment`**: Any paragraph with ≤4 words fires, including intentional short paragraphs in prose. High-precision but accept occasional FPs in minimalist writing.
- **`concept-label`**: Matches any `[word] + (paradox|trap|creep|vacuum|inversion|chasm)` — will flag real established terms. Accept these FPs; the rule targets LLM prose inflation.
- **`superficial-analysis`**: The `, [participle] its/the/their/this [noun]` pattern can occasionally match legitimate summarizing phrases. `canRemove: true` lets users dismiss easily.

## Key constraints on detectors

- **Paragraph boundaries matter.** Detectors that operate on sentence pairs must use `splitParagraphs()` first, then split by sentence within each paragraph. Never pair sentences across `\n\n` boundaries.
- **Q→A: answer must be short.** The question-then-answer detector requires the answer sentence to be ≤120 chars.
- **Modal verbs `should`/`would` are not hedges.** Only `might`, `could`, `may` count as hedging modals in the hedge stack detector.
- **"Kind of" as classifier is not a hedge.** "a kind of X" is precise categorization. Only match in filler positions.
- **Unicode apostrophes.** User text from contenteditable uses curly quotes (`'` U+2019). Any regex matching contractions must use `[\u2019']` not just `'`. Verified via byte inspection — `['']` written in source looks identical but may contain two straight quotes if editor normalizes them.
- **Avoid greedy cross-sentence regex.** `[^.!?]*` patterns cross paragraph and sentence boundaries silently. Work sentence-by-sentence or paragraph-by-paragraph.
- **LLM detectors: use matchedText, not offsets.** The model returns `matchedText` as an exact substring copy; we locate it with `text.indexOf()`. Do not ask the LLM for character offsets — it miscounts them.
- **LLM suggestedChange must be literal replacement text.** Both system prompts instruct the model explicitly. A `sanitizeSuggestedChange()` guard also catches instruction-prefixed suggestions (e.g. "Remove this…") and converts them to `""`.

## Editor model

The main editor is a `contenteditable` div. React does not control it directly:
- `onInput` reads `editor.innerText` and updates `text` state
- A `useEffect` rebuilds `editor.innerHTML` (via `buildHighlightedHTML`) when violations or hidden rules change
- Caret position is saved (character offset) before innerHTML replacement and restored after
- Custom undo/redo stack via refs — `innerHTML` replacement destroys native browser undo history. `handleKeyDown` intercepts Cmd+Z / Cmd+Shift+Z.

## Applying changes

`applyTextChange(startIndex, endIndex, replacement)` in App.tsx:
- Splices `replacement` into the text at the given character range
- Runs `cleanupAfterEdit()` to fix artifacts: space before punctuation, double spaces, space at line start, space before closing quote+punctuation
- Used for both "remove" (replacement = `""`) and "apply suggestion" flows

## Popover

Clicking a `<mark>` element opens a popover anchored below it. The popover shows:
1. Rule name + color swatch
2. Explanation (from LLM) or tip (from rule definition) in italic serif
3. Inline diff (`InlineDiff` component): common prefix/suffix in grey, removed text struck through in red, added text in green
4. Apply button (green) — calls `applyTextChange` with the suggestion or `""` for removal
5. Dismiss button

For `canRemove` rules with no LLM suggestion, `suggestedChange` defaults to `""` so the diff shows the full matched text struck through.

## URL sharing

Text is stored in the URL hash as `encodeURIComponent(text)`. On load, `useState` lazy initializer reads `window.location.hash` to restore it. The `useHashText` hook syncs changes back with a 600ms debounce via `history.replaceState` (no history entries added).

## Reference

- Source rules: https://git.eeqj.de/sneak/prompts/src/branch/main/prompts/LLM_PROSE_TELLS.md
