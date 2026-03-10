import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { RULES, RULES_BY_ID } from './rules'
import type { Violation } from './types'
import { runClientDetectors } from './detectors/index'
import { runLLMDetectors, runDocumentDetectors } from './detectors/llmDetectors'
import { buildHighlightedHTML } from './utils/buildHighlightedHTML'
import Sidebar from './components/Sidebar'
import Toolbar from './components/Toolbar'
import Popover, { type PopoverState } from './components/Popover'
import { useHashText } from './hooks/useHashText'

const SAMPLE_TEXT = `In an era of unprecedented digital transformation, it is crucial to understand the multifaceted landscape of modern technology. This comprehensive overview will delve into the robust frameworks that fundamentally shape how we navigate these complex systems.

Artificial intelligence is changing everything. It affects jobs. It reshapes industries. It alters daily life. The implications are vast.

The technology offers numerous benefits: it streamlines operations, fosters collaboration, and leverages existing infrastructure to deliver paradigm-shifting results. Furthermore, it is worth noting that these innovations are not without their challenges—but the opportunities far outweigh the risks.

What does this mean for the future? It means we must adapt. Companies that utilize these tools will thrive; those that fail to commence their digital transformation journey will struggle. At the end of the day, success depends on embracing change.

This analysis has broader implications for how we think about technology, society, and the human condition. It is important to note that these are merely observations, and the actual outcomes may vary. Perhaps, arguably, one might say that we are, seemingly, at a pivotal moment in history.`

const DEBOUNCE_MS = 350

export default function App() {
  const [text, setText] = useState(() => {
    const hash = window.location.hash.slice(1)
    if (!hash) return SAMPLE_TEXT
    try { return decodeURIComponent(hash) } catch { return SAMPLE_TEXT }
  })
  useHashText(text)
  const [clientViolations, setClientViolations] = useState<Violation[]>([])
  const [llmViolations, setLlmViolations] = useState<Violation[]>([])
  const [hiddenRules, setHiddenRules] = useState<Set<string>>(new Set())
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('anthropic-api-key') ?? '')
  const [llmStatus, setLlmStatus] = useState<'idle' | 'loading' | 'done' | 'stale' | 'error'>('idle')
  const [llmError, setLlmError] = useState('')
  const [popover, setPopover] = useState<PopoverState | null>(null)

  const editorRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isComposingRef = useRef(false)
  const isTypingRef = useRef(false)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [idleCount, setIdleCount] = useState(0)
  // Track text ref so click handler always has current value without stale closure
  const textRef = useRef(text)
  textRef.current = text
  const violationsRef = useRef<Violation[]>([])
  // Snapshot of text at the time of last LLM run, for stale delta display
  const lastAnalyzedTextRef = useRef<string>('')
  // Custom undo/redo stacks — needed because innerHTML replacement kills native undo history
  const undoStackRef = useRef<string[]>([])
  const redoStackRef = useRef<string[]>([])
  const lastPushedRef = useRef<string>('')

  // Re-resolve LLM violation positions from matchedText on every text change.
  // Violations whose text was edited away vanish naturally; others track correctly.
  const allViolations = useMemo(() => {
    const resolved = llmViolations.flatMap(v => {
      if (!v.matchedText) return [v]
      const hint = Math.max(0, v.startIndex - 200)
      let idx = text.indexOf(v.matchedText, hint)
      if (idx === -1) idx = text.indexOf(v.matchedText)
      if (idx === -1) return []
      return [{ ...v, startIndex: idx, endIndex: idx + v.matchedText.length }]
    })
    return [...clientViolations, ...resolved]
  }, [clientViolations, llmViolations, text])

  violationsRef.current = allViolations

  const activeRules = new Set(RULES.filter(r => !hiddenRules.has(r.id)).map(r => r.id))

  // Initialise undo tracking with the starting text
  if (lastPushedRef.current === '') lastPushedRef.current = text

  // Run client detectors on text change (debounced) — LLM violations are separate
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setClientViolations(text.trim() ? runClientDetectors(text) : [])
    }, DEBOUNCE_MS)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [text])

  // Rebuild editor HTML when violations/hidden rules change, but skip while typing
  useEffect(() => {
    if (isTypingRef.current) return
    const editor = editorRef.current
    if (!editor) return
    const saved = saveCaretPosition(editor)
    editor.innerHTML = buildHighlightedHTML(text, allViolations, activeRules)
    if (saved !== null) restoreCaretPosition(editor, saved)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allViolations, hiddenRules, idleCount])

  // Sync editor on mount
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    editor.innerHTML = buildHighlightedHTML(text, allViolations, activeRules)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const restoreText = useCallback((value: string) => {
    setText(value)
    setPopover(null)
    setLlmStatus(s => (s === 'done' || s === 'error') ? 'stale' : s)
    const editor = editorRef.current
    if (editor) editor.innerText = value
  }, [])

  const handleInput = useCallback(() => {
    if (isComposingRef.current) return
    const editor = editorRef.current
    if (!editor) return
    const value = editor.innerText
    // Push previous value onto undo stack when text actually changes
    if (value !== lastPushedRef.current) {
      undoStackRef.current.push(lastPushedRef.current)
      redoStackRef.current = []
      lastPushedRef.current = value
    }
    setText(value)
    setPopover(null)
    setLlmStatus(s => (s === 'done' || s === 'error') ? 'stale' : s)
    // Track typing state to defer highlight rebuilds until user pauses
    isTypingRef.current = true
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(() => {
      isTypingRef.current = false
      setIdleCount(c => c + 1)
    }, 800)
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const mod = e.metaKey || e.ctrlKey
    if (!mod) return
    if (e.key === 'z' && !e.shiftKey) {
      const prev = undoStackRef.current.pop()
      if (prev === undefined) return
      e.preventDefault()
      redoStackRef.current.push(lastPushedRef.current)
      lastPushedRef.current = prev
      restoreText(prev)
    } else if (e.key === 'z' && e.shiftKey || e.key === 'y') {
      const next = redoStackRef.current.pop()
      if (next === undefined) return
      e.preventDefault()
      undoStackRef.current.push(lastPushedRef.current)
      lastPushedRef.current = next
      restoreText(next)
    }
  }, [restoreText])

  // Click delegation: detect clicks on <mark> elements
  const handleEditorClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const mark = target.tagName === 'MARK' ? target : target.closest('mark')
    if (!mark) { setPopover(null); return }

    const ruleIds = (mark.getAttribute('data-rules') ?? '').split(',').filter(Boolean)
    const startIndex = parseInt(mark.getAttribute('data-start') ?? '0', 10)
    const endIndex = parseInt(mark.getAttribute('data-end') ?? '0', 10)
    const matchedText = mark.textContent ?? ''

    const rules = ruleIds
      .map(id => RULES_BY_ID[id])
      .filter((r): r is NonNullable<typeof r> => !!r)

    if (rules.length === 0) return

    // Find the most specific matching violation for accurate indices
    const v = violationsRef.current.find(
      v2 => ruleIds.includes(v2.ruleId) && Math.abs(v2.startIndex - startIndex) < 5
    )

    setPopover({
      rules,
      anchorRect: mark.getBoundingClientRect(),
      ruleIndex: 0,
      startIndex: v?.startIndex ?? startIndex,
      endIndex: v?.endIndex ?? endIndex,
      matchedText: v?.matchedText ?? matchedText,
      explanation: v?.explanation,
      suggestedChange: v?.suggestedChange,
    })
  }, [])

  const applyTextChange = useCallback((startIndex: number, endIndex: number, replacement: string) => {
    const current = textRef.current
    const newText = cleanupAfterEdit(current.slice(0, startIndex) + replacement + current.slice(endIndex))
    undoStackRef.current.push(lastPushedRef.current)
    redoStackRef.current = []
    lastPushedRef.current = newText
    setText(newText)
    setPopover(null)
    const editor = editorRef.current
    if (editor) editor.innerText = newText
  }, [])


  const runLLM = useCallback(async () => {
    if (!apiKey || !text.trim()) return
    lastAnalyzedTextRef.current = text
    setLlmStatus('loading')
    setLlmError('')
    // Clear previous LLM violations before both calls start
    setLlmViolations([])

    let pending = 2
    const errors: string[] = []

    const oneDone = () => {
      pending--
      if (pending === 0) {
        setLlmStatus(errors.length > 0 ? 'error' : 'done')
        if (errors.length > 0) setLlmError(errors.join(' | '))
      }
    }

    const appendResults = (results: Violation[]) => {
      setLlmViolations(prev => [...prev, ...results])
    }

    // Fragment call — Haiku, fast (~3–5s), sentence/paragraph patterns
    runLLMDetectors(text, apiKey)
      .then(appendResults)
      .catch(e => { errors.push(e instanceof Error ? e.message : String(e)) })
      .finally(oneDone)

    // Document call — Sonnet, slower (~8–15s), structural/compositional patterns
    runDocumentDetectors(text, apiKey)
      .then(appendResults)
      .catch(e => { errors.push(e instanceof Error ? e.message : String(e)) })
      .finally(oneDone)
  }, [apiKey, text])

  const toggleRule = (ruleId: string) => {
    setHiddenRules(prev => {
      const next = new Set(prev)
      if (next.has(ruleId)) next.delete(ruleId)
      else next.add(ruleId)
      return next
    })
    setPopover(null)
  }

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length
  const staleDelta = llmStatus === 'stale' ? roughCharDiff(lastAnalyzedTextRef.current, text) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f5f5f0' }}>
      <Toolbar
        apiKey={apiKey}
        onApiKeyChange={key => { setApiKey(key); localStorage.setItem('anthropic-api-key', key) }}
        onApiKeyRemove={() => { setApiKey(''); localStorage.removeItem('anthropic-api-key') }}
        onRunLLM={runLLM}
        llmStatus={llmStatus}
        staleDelta={staleDelta}
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Main editor */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '48px 64px 80px' }}>
          <div style={{ maxWidth: '680px', margin: '0 auto' }}>
            {llmError && (
              <div style={{
                marginBottom: '16px', padding: '10px 14px',
                background: '#fff0f0', border: '1px solid #fca5a5',
                borderRadius: '6px', fontSize: '13px', color: '#dc2626',
                fontFamily: 'sans-serif',
              }}>
                API error: {llmError}
              </div>
            )}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              onClick={handleEditorClick}
              onCompositionStart={() => { isComposingRef.current = true }}
              onCompositionEnd={() => { isComposingRef.current = false; handleInput() }}
              spellCheck
              style={{
                outline: 'none',
                fontSize: '18px',
                lineHeight: '1.9',
                fontFamily: "'Georgia', 'Times New Roman', serif",
                color: '#1a1a1a',
                minHeight: '400px',
                caretColor: '#1a1a1a',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            />
          </div>
        </div>

        {/* Right sidebar */}
        <Sidebar
          violations={allViolations}
          hiddenRules={hiddenRules}
          onToggleRule={toggleRule}
          wordCount={wordCount}
          hasApiKey={!!apiKey}
          llmStatus={llmStatus}
        />
      </div>

      {/* Popover */}
      {popover && (
        <Popover
          state={popover}
          onClose={() => setPopover(null)}
          onApply={applyTextChange}
          onNextRule={() => setPopover(p => p ? { ...p, ruleIndex: (p.ruleIndex + 1) % p.rules.length } : p)}
          onPrevRule={() => setPopover(p => p ? { ...p, ruleIndex: (p.ruleIndex - 1 + p.rules.length) % p.rules.length } : p)}
        />
      )}
    </div>
  )
}

// ── Caret helpers ──────────────────────────────────────────────────────────
// Count text chars + BRs (each = 1) up to a given container:offset position.
// Handles both text-node containers and element containers (offset = child index).

function saveCaretPosition(root: Node): number | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const { startContainer, startOffset } = sel.getRangeAt(0)

  // Element container: count content of first startOffset children
  if (startContainer.nodeType !== Node.TEXT_NODE) {
    let count = 0
    for (let i = 0; i < startOffset; i++) {
      count += nodeCharLen(startContainer.childNodes[i])
    }
    return count
  }

  // Text node container: walk tree counting chars+BRs until we hit it
  let count = 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (node === startContainer) return count + startOffset
    if (node.nodeType === Node.TEXT_NODE) count += (node.textContent ?? '').length
    else if ((node as Element).tagName === 'BR') count += 1
  }
  return count
}

function nodeCharLen(node: Node | undefined): number {
  if (!node) return 0
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').length
  if ((node as Element).tagName === 'BR') return 1
  let len = 0
  for (const child of node.childNodes) len += nodeCharLen(child)
  return len
}

function restoreCaretPosition(root: Node, offset: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  let count = 0
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.textContent ?? '').length
      if (count + len >= offset) {
        const sel = window.getSelection()
        if (!sel) return
        const range = document.createRange()
        range.setStart(node, offset - count)
        range.collapse(true)
        sel.removeAllRanges()
        sel.addRange(range)
        return
      }
      count += len
    } else if ((node as Element).tagName === 'BR') {
      count += 1
      if (count >= offset) {
        const sel = window.getSelection()
        if (!sel) return
        const range = document.createRange()
        range.setStartAfter(node)
        range.collapse(true)
        sel.removeAllRanges()
        sel.addRange(range)
        return
      }
    }
  }
  // Offset past all content — place at end
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  range.selectNodeContents(root)
  range.collapse(false)
  sel.removeAllRanges()
  sel.addRange(range)
}

function cleanupAfterEdit(text: string): string {
  return text
    // space(s) before sentence-ending punctuation
    .replace(/ +([.,;:!?])/g, '$1')
    // space before closing quote/bracket when followed by punctuation: `" .` → `".`
    .replace(/ +(["\u201d\u2019\)\]])\s*([.,;:!?])/g, '$1$2')
    // multiple spaces → single space
    .replace(/  +/g, ' ')
    // space at start of a line
    .replace(/\n /g, '\n')
}

// Rough size of the changed region between two strings — O(n) start/end scan
function roughCharDiff(a: string, b: string): number {
  if (a === b) return 0
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length - 1
  let endB = b.length - 1
  while (endA >= start && endB >= start && a[endA] === b[endB]) { endA--; endB-- }
  return Math.max(endA - start + 1, endB - start + 1)
}

