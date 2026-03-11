import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { RULES, RULES_BY_ID } from './rules'
import type { Violation } from './types'
import { runClientDetectors } from './detectors/index'
import { runLLMDetectors, runDocumentDetectors, rewriteParagraph, buildRewriteSystemPrompt } from './detectors/llmDetectors'
import { buildHighlightedHTML } from './utils/buildHighlightedHTML'
import Sidebar from './components/Sidebar'
import Toolbar from './components/Toolbar'
import Popover, { type PopoverState } from './components/Popover'
import ParaRewritePopover from './components/ParaRewritePopover'
import { useHashText } from './hooks/useHashText'
import { SAMPLE_TEXT } from './data/sampleText'
import SAMPLE_VIOLATIONS from './data/sampleViolations.json'

const DEBOUNCE_MS = 350

export default function App() {
  const [text, setText] = useState(() => {
    const hash = window.location.hash.slice(1)
    if (!hash) return SAMPLE_TEXT
    try { return decodeURIComponent(hash) } catch { return SAMPLE_TEXT }
  })
  useHashText(text)
  const isDefaultText = text === SAMPLE_TEXT
  const [clientViolations, setClientViolations] = useState<Violation[]>([])
  const [llmViolations, setLlmViolations] = useState<Violation[]>(
    isDefaultText ? (SAMPLE_VIOLATIONS as Violation[]) : []
  )
  const [hiddenRules, setHiddenRules] = useState<Set<string>>(new Set())
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('anthropic-api-key') ?? '')
  const [llmStatus, setLlmStatus] = useState<'idle' | 'loading' | 'done' | 'stale' | 'error'>(
    isDefaultText ? 'done' : 'idle'
  )
  const [llmError, setLlmError] = useState('')
  const [popover, setPopover] = useState<PopoverState | null>(null)
  const [hoveredRuleId, setHoveredRuleId] = useState<string | null>(null)
  const [hintVisible, setHintVisible] = useState(true)

  const editorRef = useRef<HTMLDivElement>(null)
  const editorWrapperRef = useRef<HTMLDivElement>(null)
  const editorScrollRef = useRef<HTMLDivElement>(null)
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
  const lastAnalyzedTextRef = useRef<string>(isDefaultText ? SAMPLE_TEXT : '')
  // Custom undo/redo stacks — needed because innerHTML replacement kills native undo history
  const undoStackRef = useRef<string[]>([])
  const redoStackRef = useRef<string[]>([])
  const lastPushedRef = useRef<string>('')

  // Paragraph rewrite state
  const [hoveredPara, setHoveredPara] = useState<{
    idx: number; text: string; start: number; end: number
    buttonLeft: number; buttonTop: number
  } | null>(null)
  const [rewritePopover, setRewritePopover] = useState<{
    paraText: string; paraStart: number; paraEnd: number
    buttonLeft: number; buttonTop: number
    rewritten: string | null; error: string | null; loading: boolean
    debugPrompt: string
    noApiKey?: boolean
  } | null>(null)
  const sparkleButtonRef = useRef<HTMLDivElement>(null)
  const hintRef = useRef<HTMLDivElement>(null)
  const [hintDimmed, setHintDimmed] = useState(false)
  const mouseMoveThrottleRef = useRef<number>(0)

  // Re-resolve LLM violation positions from matchedText on every text change.
  // Violations whose text was edited away vanish naturally; others track correctly.
  const allViolations = useMemo(() => {
    const resolved = llmViolations.flatMap(v => {
      if (!v.matchedText) return [v]
      const hint = Math.max(0, v.startIndex - 200)
      let idx = text.indexOf(v.matchedText, hint)
      if (idx === -1) idx = text.indexOf(v.matchedText)
      if (idx !== -1) return [{ ...v, startIndex: idx, endIndex: idx + v.matchedText.length }]

      // // Fuzzy fallback: tolerate small edits within or near the matched span.
      // const mLen = v.matchedText.length
      // const maxDist = Math.max(3, Math.floor(mLen * 0.05))
      // const windowStart = Math.max(0, v.startIndex - 50)
      // const windowEnd = Math.min(text.length - mLen, v.startIndex + 50)
      // if (windowEnd < windowStart) return []
      // let bestIdx = -1, bestDist = maxDist + 1
      // const candidates = [v.startIndex, ...Array.from(
      //   { length: windowEnd - windowStart + 1 }, (_, i) => windowStart + i
      // )].filter(i => i >= 0 && i + mLen <= text.length)
      // for (const i of candidates) {
      //   const dist = boundedLevenshtein(text.slice(i, i + mLen), v.matchedText, bestDist - 1)
      //   if (dist < bestDist) { bestDist = dist; bestIdx = i }
      //   if (bestDist === 0) break
      // }
      // if (bestIdx === -1) return []
      // return [{ ...v, startIndex: bestIdx, endIndex: bestIdx + mLen }]

      return []
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
    const hadFocus = document.activeElement === editor
    const saved = saveCaretPosition(editor)
    editor.innerHTML = buildHighlightedHTML(text, allViolations, activeRules)
    if (saved !== null) restoreCaretPosition(editor, saved)
    if (hadFocus) editor.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allViolations, hiddenRules, idleCount])

  // Sync editor on mount
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    editor.innerHTML = buildHighlightedHTML(text, allViolations, activeRules)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const markTyping = useCallback(() => {
    isTypingRef.current = true
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(() => {
      isTypingRef.current = false
      setIdleCount(c => c + 1)
    }, 800)
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
    setHintVisible(false)
    markTyping()
  }, [markTyping])

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

    // Find the matching violation for each rule — use containment so large spans
    // (e.g. throat-clearing opener covering a whole paragraph) are found correctly
    const violations = ruleIds.map(ruleId => {
      const v = violationsRef.current.find(
        v2 => v2.ruleId === ruleId && v2.startIndex <= startIndex && v2.endIndex >= endIndex
      ) ?? violationsRef.current.find(
        v2 => v2.ruleId === ruleId && Math.abs(v2.startIndex - startIndex) < 20
      )
      return {
        startIndex: v?.startIndex ?? startIndex,
        endIndex: v?.endIndex ?? endIndex,
        matchedText: v?.matchedText ?? matchedText,
        explanation: v?.explanation,
        suggestedChange: v?.suggestedChange,
      }
    })

    setPopover({
      rules,
      violations,
      anchorRect: mark.getBoundingClientRect(),
      ruleIndex: 0,
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
    setHintVisible(false)
    setLlmStatus(s => (s === 'done' || s === 'error') ? 'stale' : s)
    const editor = editorRef.current
    if (editor) editor.innerText = newText
  }, [])


  const runLLM = useCallback(async () => {
    if (!apiKey || !text.trim()) return
    lastAnalyzedTextRef.current = text
    setLlmStatus('loading')
    setLlmError('')

    const collected: Violation[] = []
    let pending = 2
    const errors: string[] = []

    const oneDone = () => {
      pending--
      if (pending === 0) {
        // Replace violations only when both calls are complete so existing
        // highlights stay visible during the entire re-analysis run
        setLlmViolations(collected)
        setLlmStatus(errors.length > 0 ? 'error' : 'done')
        if (errors.length > 0) setLlmError(errors.join(' | '))
      }
    }

    // Fragment call — Haiku, fast (~3–5s), sentence/paragraph patterns
    runLLMDetectors(text, apiKey)
      .then(results => { collected.push(...results) })
      .catch(e => { errors.push(e instanceof Error ? e.message : String(e)) })
      .finally(oneDone)

    // Document call — Sonnet, slower (~8–15s), structural/compositional patterns
    runDocumentDetectors(text, apiKey)
      .then(results => { collected.push(...results) })
      .catch(e => { errors.push(e instanceof Error ? e.message : String(e)) })
      .finally(oneDone)
  }, [apiKey, text])

  // Dim all text and non-matching marks when hovering a sidebar rule;
  // override color of matching marks to show only the hovered rule's color
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    if (!hoveredRuleId) {
      editor.style.color = ''
      editor.querySelectorAll<HTMLElement>('mark').forEach(m => {
        m.style.opacity = ''
        m.style.color = ''
        if (m.dataset.hoverOverridden) {
          m.style.background = m.dataset.origBg ?? ''
          m.style.borderBottom = m.dataset.origBorderBottom ?? ''
          delete m.dataset.hoverOverridden
          delete m.dataset.origBg
          delete m.dataset.origBorderBottom
        }
      })
      return
    }
    const hoveredRule = RULES_BY_ID[hoveredRuleId]
    editor.style.color = 'rgba(26,26,26,0.15)'
    editor.querySelectorAll<HTMLElement>('mark').forEach(m => {
      const rules = (m.getAttribute('data-rules') ?? '').split(',')
      if (rules.includes(hoveredRuleId)) {
        m.style.opacity = '1'
        m.style.color = '#1a1a1a'
        if (hoveredRule && !m.dataset.hoverOverridden) {
          m.dataset.hoverOverridden = '1'
          m.dataset.origBg = m.style.background
          m.dataset.origBorderBottom = m.style.borderBottom
          m.style.background = hoveredRule.bgColor
          m.style.borderBottom = `2px solid ${hoveredRule.color}`
        }
      } else {
        m.style.opacity = '0.15'
        m.style.color = ''
      }
    })

    // Scroll a matching mark into view if none are currently visible
    const scroll = editorScrollRef.current
    if (!scroll) return
    const matchingMarks = Array.from(
      editor.querySelectorAll<HTMLElement>('mark')
    ).filter(m => (m.getAttribute('data-rules') ?? '').split(',').includes(hoveredRuleId))
    if (matchingMarks.length === 0) return
    const scrollRect = scroll.getBoundingClientRect()
    const anyVisible = matchingMarks.some(m => {
      const r = m.getBoundingClientRect()
      return r.bottom > scrollRect.top && r.top < scrollRect.bottom
    })
    if (!anyVisible) {
      matchingMarks[0].scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [hoveredRuleId])

  // Dim the hint callout when the rewrite button overlaps it vertically
  useEffect(() => {
    if (!hoveredPara || !hintRef.current) { setHintDimmed(false); return }
    const hintRect = hintRef.current.getBoundingClientRect()
    const overlapsY = hoveredPara.buttonTop < hintRect.bottom + 4 && hoveredPara.buttonTop + 30 > hintRect.top - 4
    setHintDimmed(overlapsY)
  }, [hoveredPara])

  const handleClear = useCallback(() => {
    const editor = editorRef.current
    undoStackRef.current.push(lastPushedRef.current)
    redoStackRef.current = []
    lastPushedRef.current = ''
    setText('')
    setClientViolations([])
    setLlmViolations([])
    setLlmStatus('idle')
    setPopover(null)
    setHintVisible(false)
    if (editor) { editor.innerText = ''; editor.focus() }
  }, [])

  const handleEditorMouseMove = useCallback((e: React.MouseEvent) => {
    if (rewritePopover) return
    const now = Date.now()
    if (now - mouseMoveThrottleRef.current < 60) return
    mouseMoveThrottleRef.current = now
    const editor = editorRef.current
    if (!editor || !textRef.current.trim()) { setHoveredPara(null); return }

    const target = e.target as Node
    // Mouse is over the sparkle button — keep current para, don't recalculate
    if (sparkleButtonRef.current?.contains(target)) return
    // Mouse is outside the editor content area — clear sparkle
    if (!editor.contains(target)) { setHoveredPara(null); return }

    const caretRange = document.caretRangeFromPoint(e.clientX, e.clientY)
    if (!caretRange) { setHoveredPara(null); return }

    const charOffset = getCharOffsetFromPoint(editor, caretRange.startContainer, caretRange.startOffset)
    const para = findParagraphAtOffset(textRef.current, charOffset)
    const paraTopY = getParagraphTopY(editor, para.start)
    if (paraTopY === 0) { setHoveredPara(null); return }
    // If the cursor is visually above this paragraph's first line, caretRangeFromPoint snapped
    // to the wrong paragraph (e.g. cursor is in a blank gap above it, or past all content).
    if (e.clientY < paraTopY - 5) { setHoveredPara(null); return }

    // Button right edge (before arrow) anchors at the text start; arrow tip touches the text.
    // paddingLeft on the editor is 52px, so text starts at editorRect.left + 52.
    // Arrow is 8px wide, so button right edge at editorRect.left + 44.
    // translateX(-100%) in the button JSX makes it extend leftward from this anchor.
    const editorRect = editor.getBoundingClientRect()
    const buttonLeft = editorRect.left + 44

    setHoveredPara(prev => {
      if (prev?.idx === para.idx && Math.abs(prev.buttonTop - paraTopY) < 2) return prev
      return { idx: para.idx, text: para.text, start: para.start, end: para.end, buttonLeft, buttonTop: paraTopY }
    })
  }, [apiKey, rewritePopover])

  const handleEditorMouseLeave = useCallback(() => {
    setHoveredPara(null)
  }, [])

  const handleSparkleClick = useCallback(async () => {
    if (!hoveredPara) return
    const { text: paraText, start: paraStart, end: paraEnd, buttonLeft, buttonTop } = hoveredPara

    if (!apiKey) {
      setRewritePopover({ paraText, paraStart, paraEnd, buttonLeft, buttonTop, rewritten: null, error: null, loading: false, debugPrompt: '', noApiKey: true })
      setHoveredPara(null)
      return
    }

    // Collect rule-specific hints, citing the exact flagged text from this paragraph
    const paraViolations = violationsRef.current.filter(
      v => v.startIndex >= paraStart && v.endIndex <= paraEnd + 2
    )
    // Group by ruleId so we can list all matched instances per rule
    const byRule = new Map<string, string[]>()
    for (const v of paraViolations) {
      if (!byRule.has(v.ruleId)) byRule.set(v.ruleId, [])
      byRule.get(v.ruleId)!.push(v.matchedText.trim())
    }
    const ruleHints: string[] = []
    for (const [ruleId, matches] of byRule) {
      const hint = RULES_BY_ID[ruleId]?.rewriteHint
      if (!hint) continue
      const directive = RULES_BY_ID[ruleId]?.llmDirective ?? hint
      const cited = matches
        .slice(0, 4)
        .map(m => `"${m.length > 70 ? m.slice(0, 70) + '…' : m}"`)
        .join(', ')
      ruleHints.push(`${directive} — flagged in this paragraph: ${cited}`)
    }

    const debugPrompt = buildRewriteSystemPrompt(ruleHints)
    setRewritePopover({ paraText, paraStart, paraEnd, buttonLeft, buttonTop, rewritten: null, error: null, loading: true, debugPrompt })
    setHoveredPara(null)

    try {
      const result = await rewriteParagraph(paraText, ruleHints, apiKey)
      setRewritePopover(prev => prev ? { ...prev, rewritten: result, loading: false } : null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setRewritePopover(prev => prev ? { ...prev, error: msg, loading: false } : null)
    }
  }, [hoveredPara, apiKey])

  const applyRewrite = useCallback(() => {
    if (!rewritePopover || rewritePopover.rewritten === null) return
    const { paraStart, paraEnd, rewritten } = rewritePopover
    applyTextChange(paraStart, paraEnd, rewritten)
    setRewritePopover(null)
  }, [rewritePopover, applyTextChange])

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
  const stalePct = llmStatus === 'stale' ? stalePercent(lastAnalyzedTextRef.current, text) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f5f5f0' }}>
      <Toolbar
        apiKey={apiKey}
        onApiKeyChange={key => { setApiKey(key); localStorage.setItem('anthropic-api-key', key) }}
        onApiKeyRemove={() => { setApiKey(''); localStorage.removeItem('anthropic-api-key') }}
        onRunLLM={runLLM}
        llmStatus={llmStatus}
        stalePct={stalePct}
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Main editor */}
        <div
          ref={editorScrollRef}
          className="editor-scroll"
          style={{ flex: 1, overflowY: 'auto', padding: '48px 64px 80px', position: 'relative' }}
          onMouseMove={handleEditorMouseMove}
          onMouseLeave={handleEditorMouseLeave}
        >
          <div ref={editorWrapperRef} style={{ maxWidth: '680px', margin: '0 auto', position: 'relative' }}>
            {/* Callout box — sits in left margin, arrow points right at the text */}
            {hintVisible !== undefined && (
              <div ref={hintRef} className="hint-callout" style={{ position: 'absolute', right: 'calc(100% - 39px)', top: '6px', width: '158px', opacity: !hintVisible ? 0 : hintDimmed ? 0.15 : 1, transition: 'opacity 0.3s ease', pointerEvents: hintVisible && !hintDimmed ? 'auto' : 'none' }}>
                <div style={{
                  background: '#fff',
                  border: '1px solid #e0dbd4',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', fontFamily: 'sans-serif', color: '#888', marginBottom: '2px' }}>
                    ✎ Text is editable
                  </div>
                  <div style={{ fontSize: '11px', fontFamily: 'sans-serif', color: '#aaa', lineHeight: '1.5' }}>
                    Paste or type your own text to analyse it. The sample shows what detections look like.
                  </div>
                  {text.trim() && <button
                    onClick={handleClear}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      fontSize: '11px',
                      fontFamily: 'sans-serif',
                      color: '#bbb',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      textUnderlineOffset: '2px',
                      display: 'block',
                      textAlign: 'left',
                    }}
                  >
                    Clear text
                  </button>}
                </div>
                {/* Arrow pointing right */}
                <div style={{ position: 'absolute', right: '-8px', top: '18px', width: 0, height: 0, borderTop: '7px solid transparent', borderBottom: '7px solid transparent', borderLeft: '8px solid #e0dbd4' }} />
                <div style={{ position: 'absolute', right: '-7px', top: '18px', width: 0, height: 0, borderTop: '7px solid transparent', borderBottom: '7px solid transparent', borderLeft: '8px solid #fff' }} />
              </div>
            )}
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
            {!text.trim() && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                pointerEvents: 'none',
                fontSize: '18px',
                lineHeight: '1.9',
                fontFamily: "'Georgia', 'Times New Roman', serif",
                color: '#ccc',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <span style={{ fontSize: '22px', opacity: 0.4 }}>✏</span>
                Write here…
              </div>
            )}
            <div
              ref={editorRef}
              className="editor-content"
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
                paddingLeft: '52px', // left padding houses the sparkle button; overridden to 8px on mobile via .editor-content
              }}
            />
          </div>

          {/* Sparkle button — child of scroll container so moving to it doesn't fire onMouseLeave */}
          {hoveredPara && !rewritePopover && (
            <div
              ref={sparkleButtonRef}
              style={{
                position: 'fixed',
                left: hoveredPara.buttonLeft,
                top: hoveredPara.buttonTop,
                transform: 'translateX(-100%)',
                zIndex: 50,
              }}
            >
              <button
                onMouseDown={handleSparkleClick}
                title="Rewrite this paragraph with AI"
                style={{
                  position: 'relative',
                  background: '#fff',
                  border: '1px solid #e0dbd4',
                  borderRadius: '8px',
                  padding: '4px 10px 4px 9px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '11px',
                  fontFamily: 'sans-serif',
                  color: '#666',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ fontSize: '12px', lineHeight: 1 }}>✨</span>
                <span>Rewrite</span>
                {/* Arrow pointing right toward text, matching the hint callout style */}
                <div style={{ position: 'absolute', right: '-8px', top: '50%', marginTop: '-6px', width: 0, height: 0, borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderLeft: '8px solid #e0dbd4' }} />
                <div style={{ position: 'absolute', right: '-7px', top: '50%', marginTop: '-6px', width: 0, height: 0, borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderLeft: '8px solid #fff' }} />
              </button>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <Sidebar
          violations={allViolations}
          hiddenRules={hiddenRules}
          onToggleRule={toggleRule}
          onRuleHover={setHoveredRuleId}
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

      {/* Paragraph rewrite popover */}
      {rewritePopover && (
        <ParaRewritePopover
          original={rewritePopover.paraText}
          rewritten={rewritePopover.rewritten}
          error={rewritePopover.error}
          debugPrompt={rewritePopover.debugPrompt}
          buttonPos={{ left: rewritePopover.buttonLeft, top: rewritePopover.buttonTop }}
          noApiKey={rewritePopover.noApiKey}
          onApply={applyRewrite}
          onDismiss={() => { setRewritePopover(null); setHoveredPara(null) }}
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

  // Walk the tree counting chars+BRs until we reach startContainer,
  // then add the offset within it. Handles both text-node and element containers.
  let count = 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (node === startContainer) {
      if (node.nodeType === Node.TEXT_NODE) return count + startOffset
      // Element container (e.g. caret in a <div> or <mark>): count children before offset
      for (let i = 0; i < startOffset; i++) count += nodeCharLen(startContainer.childNodes[i])
      return count
    }
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

// Levenshtein distance with early exit once distance exceeds maxDist
// @ts-expect-error — kept for future fuzzy matching (see commented block above)
function boundedLevenshtein(a: string, b: string, maxDist: number): number {
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1
  const n = a.length, m = b.length
  const row = Array.from({ length: m + 1 }, (_, i) => i)
  for (let i = 1; i <= n; i++) {
    let prev = i
    let rowMin = prev
    for (let j = 1; j <= m; j++) {
      const val = a[i - 1] === b[j - 1] ? row[j - 1] : Math.min(row[j - 1], row[j], prev) + 1
      row[j - 1] = prev
      prev = val
      rowMin = Math.min(rowMin, val)
    }
    row[m] = prev
    if (rowMin > maxDist) return maxDist + 1
  }
  return row[m]
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

// ── Paragraph hover helpers ───────────────────────────────────────────────────

// Like saveCaretPosition but works on an arbitrary range (not just current selection)
function getCharOffsetFromPoint(editor: HTMLElement, container: Node, offset: number): number {
  let count = 0
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (node === container) {
      if (node.nodeType === Node.TEXT_NODE) return count + offset
      for (let i = 0; i < offset; i++) count += nodeCharLen(container.childNodes[i])
      return count
    }
    if (node.nodeType === Node.TEXT_NODE) count += (node.textContent ?? '').length
    else if ((node as Element).tagName === 'BR') count += 1
  }
  return count
}

// Given a char offset into text, return which paragraph it falls in
function findParagraphAtOffset(text: string, offset: number): {
  idx: number; start: number; end: number; text: string
} {
  const paras = text.split('\n\n')
  let pos = 0
  for (let i = 0; i < paras.length; i++) {
    const end = pos + paras[i].length
    if (offset <= end || i === paras.length - 1) {
      return { idx: i, start: pos, end, text: paras[i] }
    }
    pos = end + 2 // skip the \n\n separator
  }
  return { idx: 0, start: 0, end: text.length, text }
}

// Walk the editor DOM to get the viewport Y of the first character of a paragraph
function getParagraphTopY(editor: HTMLElement, paraStart: number): number {
  let count = 0
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.textContent ?? '').length
      if (count + len >= paraStart) {
        try {
          const range = document.createRange()
          range.setStart(node, Math.max(0, Math.min(paraStart - count, len)))
          range.collapse(true)
          const rect = range.getBoundingClientRect()
          return rect.top
        } catch { return 0 }
      }
      count += len
    } else if ((node as Element).tagName === 'BR') {
      count += 1
      if (count > paraStart) {
        try {
          const range = document.createRange()
          range.setStartAfter(node)
          range.collapse(true)
          return range.getBoundingClientRect().top
        } catch { return 0 }
      }
    }
  }
  return 0
}

// Percent of text that has changed since last LLM run (0–100), rounded to nearest 5
function stalePercent(a: string, b: string): number {
  if (a === b) return 0
  const maxLen = Math.max(a.length, b.length, 1)
  const lenDiff = Math.abs(a.length - b.length)
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length - 1, endB = b.length - 1
  while (endA > start && endB > start && a[endA] === b[endB]) { endA--; endB-- }
  const changed = Math.max(lenDiff, Math.min(endA - start + 1, endB - start + 1, maxLen))
  return Math.min(100, Math.round(changed / maxLen * 20) * 5)
}
