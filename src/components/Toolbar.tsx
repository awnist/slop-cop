import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import logoUrl from '/logo-sm.png'
import type { LLMProvider, LocalConfig } from '../detectors/llmDetectors'

interface Props {
  provider: LLMProvider
  localConfig: LocalConfig | null
  apiKey: string
  onCredentialsSave: (provider: LLMProvider, key: string, localConfig?: LocalConfig) => void
  onApiKeyRemove: () => void
  onRunLLM: () => void
  llmStatus: 'idle' | 'loading' | 'done' | 'stale' | 'error'
  stalePct: number
}

function providerLabel(provider: LLMProvider): string {
  if (provider === 'openai') return 'OpenAI'
  if (provider === 'local') return 'Local'
  return 'Anthropic'
}

function removeLabel(provider: LLMProvider): string {
  if (provider === 'local') return 'Disconnect local'
  return `Remove ${providerLabel(provider)} key`
}

function providerHost(provider: LLMProvider, baseUrl?: string): string {
  if (provider === 'local') return baseUrl ? new URL(baseUrl).host : 'localhost'
  return provider === 'openai' ? 'api.openai.com' : 'api.anthropic.com'
}

function keyPlaceholder(provider: LLMProvider): string {
  if (provider === 'local') return 'optional'
  return provider === 'openai' ? 'sk-proj-… / sk-…' : 'sk-ant-…'
}

function usePopover() {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleMouseDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (popoverRef.current?.contains(t)) return
      if (btnRef.current?.contains(t)) return
      setOpen(false)
    }
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return { open, setOpen, btnRef, popoverRef }
}

function InfoBtn({ open, setOpen, btnRef }: {
  open: boolean
  setOpen: (v: (p: boolean) => boolean) => void
  btnRef: React.RefObject<HTMLButtonElement | null>
}) {
  return (
    <button
      ref={btnRef}
      onClick={() => setOpen(v => !v)}
      style={{
        background: open ? '#f0f0eb' : 'transparent',
        border: '1px solid #e0e0e0', borderRadius: '5px',
        padding: '4px 7px', cursor: 'pointer', fontSize: '12px',
        fontFamily: 'sans-serif', color: '#aaa', lineHeight: 1,
      }}
    >?</button>
  )
}

function PopoverBox({ popoverRef, btnRef, children }: {
  popoverRef: React.RefObject<HTMLDivElement | null>
  btnRef: React.RefObject<HTMLButtonElement | null>
  children: React.ReactNode
}) {
  const rect = btnRef.current?.getBoundingClientRect()
  return createPortal(
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        top: (rect?.bottom ?? 0) + 8,
        right: window.innerWidth - (rect?.right ?? 0),
        width: '300px',
        background: '#fff', border: '1px solid #e0e0e0',
        borderRadius: '8px', padding: '14px 16px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        fontSize: '12px', fontFamily: 'sans-serif', color: '#444',
        lineHeight: '1.6', zIndex: 9999,
      }}
    >
      {children}
    </div>,
    document.body,
  )
}

const DEFAULT_LOCAL_URL = 'http://localhost:11434/v1'
const DEFAULT_LOCAL_MODEL = 'llama3.1'

export default function Toolbar({
  provider, localConfig, apiKey, onCredentialsSave, onApiKeyRemove, onRunLLM, llmStatus, stalePct,
}: Props) {
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')
  const [providerDraft, setProviderDraft] = useState<LLMProvider>(provider)
  const [baseUrlDraft, setBaseUrlDraft] = useState(localConfig?.baseUrl ?? DEFAULT_LOCAL_URL)
  const [modelDraft, setModelDraft] = useState(localConfig?.model ?? DEFAULT_LOCAL_MODEL)
  const privacy = usePopover()
  const features = usePopover()

  useEffect(() => {
    setProviderDraft(provider)
    if (provider === 'local' && localConfig) {
      setBaseUrlDraft(localConfig.baseUrl)
      setModelDraft(localConfig.model)
    }
  }, [provider, localConfig])

  const canSave = providerDraft === 'local'
    ? modelDraft.trim().length > 0
    : keyDraft.trim().length > 0

  const saveKey = () => {
    if (providerDraft === 'local') {
      onCredentialsSave('local', keyDraft.trim(), {
        baseUrl: baseUrlDraft.trim() || DEFAULT_LOCAL_URL,
        model: modelDraft.trim(),
      })
    } else {
      onCredentialsSave(providerDraft, keyDraft.trim())
    }
    setShowKeyInput(false)
    setKeyDraft('')
  }

  const openKeyInput = () => {
    setProviderDraft(provider)
    if (provider === 'local' && localConfig) {
      setBaseUrlDraft(localConfig.baseUrl)
      setModelDraft(localConfig.model)
    } else {
      setBaseUrlDraft(DEFAULT_LOCAL_URL)
      setModelDraft(DEFAULT_LOCAL_MODEL)
    }
    setShowKeyInput(true)
  }

  const cancelKeyInput = () => {
    setShowKeyInput(false)
    setKeyDraft('')
    setProviderDraft(provider)
    privacy.setOpen(() => false)
  }

  return (
    <div style={{
      height: '44px',
      borderBottom: '1px solid #ddd',
      background: '#fff',
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      gap: '4px',
      flexShrink: 0,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: '700', color: '#1a1a1a', marginRight: '12px' }}>
        <img src={logoUrl} alt="" style={{ width: '28px', height: '28px' }} />
        <span style={{ fontFamily: 'Menlo, Consolas, Monaco, "Adwaita Mono", "Liberation Mono", "Lucida Console", monospace' }}>Slop Cop</span>
      </span>

      <div style={{ flex: 1 }} />

      {/* API key / LLM area */}
      {apiKey ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {llmStatus === 'loading' ? (
            <span style={{ fontSize: '12px', color: '#888', fontFamily: 'sans-serif' }}>Analyzing…</span>
          ) : llmStatus === 'stale' ? (
            <button onClick={onRunLLM} style={{
              background: '#fffbeb', border: '1px solid #fcd34d',
              borderRadius: '5px', padding: '4px 12px', cursor: 'pointer',
              fontSize: '12px', fontFamily: 'sans-serif', color: '#92400e', fontWeight: '500',
            }}>
              Re-analyze{stalePct > 0 && <span style={{ fontWeight: '400', opacity: 0.75 }}> (~{stalePct}% changed)</span>}
            </button>
          ) : llmStatus === 'done' ? (
            <span style={{ fontSize: '12px', color: '#16a34a', fontFamily: 'sans-serif' }}>Semantic analysis done</span>
          ) : (
            <button onClick={onRunLLM} style={{
              background: '#f0fdf4', border: '1px solid #86efac',
              borderRadius: '5px', padding: '4px 12px', cursor: 'pointer',
              fontSize: '12px', fontFamily: 'sans-serif', color: '#16a34a', fontWeight: '500',
            }}>
              Run semantic analysis
            </button>
          )}
          <button onClick={onApiKeyRemove} style={{
            background: 'transparent', border: '1px solid #e0e0e0',
            borderRadius: '5px', padding: '4px 10px', cursor: 'pointer',
            fontSize: '11px', fontFamily: 'sans-serif', color: '#999',
          }}>
            {removeLabel(provider)}
          </button>
        </div>
      ) : showKeyInput ? (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <select
            value={providerDraft}
            onChange={e => setProviderDraft(e.target.value as LLMProvider)}
            style={{
              border: '1px solid #ccc', borderRadius: '5px',
              padding: '4px 8px', fontSize: '12px',
              fontFamily: 'sans-serif', background: '#fff',
            }}
          >
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI</option>
            <option value="local">Local (Ollama…)</option>
          </select>
          {providerDraft === 'local' ? (
            <>
              <input
                type="text"
                placeholder={DEFAULT_LOCAL_URL}
                value={baseUrlDraft}
                onChange={e => setBaseUrlDraft(e.target.value)}
                style={{
                  border: '1px solid #ccc', borderRadius: '5px',
                  padding: '4px 10px', fontSize: '12px', fontFamily: 'monospace',
                  width: '200px', outline: 'none',
                }}
              />
              <input
                type="text"
                placeholder={DEFAULT_LOCAL_MODEL}
                value={modelDraft}
                onChange={e => setModelDraft(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && canSave && saveKey()}
                autoFocus
                style={{
                  border: '1px solid #ccc', borderRadius: '5px',
                  padding: '4px 10px', fontSize: '12px', fontFamily: 'monospace',
                  width: '130px', outline: 'none',
                }}
              />
            </>
          ) : (
            <input
              type="password"
              placeholder={keyPlaceholder(providerDraft)}
              value={keyDraft}
              onChange={e => setKeyDraft(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && canSave && saveKey()}
              autoFocus
              style={{
                border: '1px solid #ccc', borderRadius: '5px',
                padding: '4px 10px', fontSize: '12px', fontFamily: 'monospace',
                width: '220px', outline: 'none',
              }}
            />
          )}
          <InfoBtn open={privacy.open} setOpen={privacy.setOpen} btnRef={privacy.btnRef} />
          {privacy.open && (
            <PopoverBox popoverRef={privacy.popoverRef} btnRef={privacy.btnRef}>
              {providerDraft === 'local' ? (
                <>
                  <div style={{ fontWeight: '600', marginBottom: '6px', color: '#1a1a1a' }}>Local inference</div>
                  <p style={{ margin: '0 0 8px' }}>Requests go from your browser directly to <strong>{providerHost('local', baseUrlDraft.trim() || DEFAULT_LOCAL_URL)}</strong> — no server involved, nothing leaves your machine.</p>
                  <p style={{ margin: '0 0 8px' }}>Works with <strong>Ollama</strong> and any other server with an OpenAI-compatible <code style={{ background: '#f5f5f0', padding: '1px 4px', borderRadius: '3px' }}>/v1/chat/completions</code> endpoint.</p>
                  <p style={{ margin: 0, color: '#888' }}>Use a model with tool-calling support for best results: <code style={{ background: '#f5f5f0', padding: '1px 4px', borderRadius: '3px' }}>llama3.1</code>, <code style={{ background: '#f5f5f0', padding: '1px 4px', borderRadius: '3px' }}>mistral-nemo</code>, etc.</p>
                </>
              ) : (
                <>
                  <div style={{ fontWeight: '600', marginBottom: '6px', color: '#1a1a1a' }}>Your key stays in your browser</div>
                  <p style={{ margin: '0 0 8px' }}>API calls go directly from your browser to <strong>{providerHost(providerDraft)}</strong> — there is no server on our end. Your key never leaves your machine.</p>
                  <p style={{ margin: '0 0 8px' }}>The key is stored only in your browser&apos;s <code style={{ background: '#f5f5f0', padding: '1px 4px', borderRadius: '3px' }}>localStorage</code> and is never sent anywhere except the provider you selected.</p>
                  <p style={{ margin: 0, color: '#888' }}>You can remove it at any time with the &quot;Remove key&quot; button.</p>
                </>
              )}
            </PopoverBox>
          )}
          <button onClick={saveKey} disabled={!canSave} style={{
            background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '5px',
            padding: '4px 10px', fontSize: '12px',
            fontFamily: 'sans-serif', color: '#16a34a',
            cursor: canSave ? 'pointer' : 'not-allowed',
            opacity: canSave ? 1 : 0.45,
          }}>Save</button>
          <button onClick={cancelKeyInput} style={{
            background: 'transparent', border: '1px solid #e0e0e0', borderRadius: '5px',
            padding: '4px 10px', cursor: 'pointer', fontSize: '12px',
            fontFamily: 'sans-serif', color: '#999',
          }}>Cancel</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <InfoBtn open={features.open} setOpen={features.setOpen} btnRef={features.btnRef} />
          {features.open && (
            <PopoverBox popoverRef={features.popoverRef} btnRef={features.btnRef}>
              <div style={{ fontWeight: '600', marginBottom: '8px', color: '#1a1a1a' }}>Deeper analysis with AI</div>
              <p style={{ margin: '0 0 10px', color: '#555' }}>
                The built-in rules catch word-level and structural tells instantly. An API key (Anthropic, OpenAI, or local Ollama) unlocks two additional passes that require language understanding:
              </p>
              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontWeight: '600', color: '#1a1a1a', marginBottom: '3px' }}>Fast pass — sentence patterns <span style={{ fontWeight: '400', color: '#888' }}>(~5s)</span></div>
                <div style={{ color: '#555' }}>Triple construction · Throat-clearing · Sycophantic framing · Balanced-take hedging · Unnecessary elaboration · Empathy performance · Pivot paragraphs · Grandiose stakes · Historical analogy · False vulnerability</div>
              </div>
              <div style={{ borderTop: '1px solid #eee', paddingTop: '8px' }}>
                <div style={{ fontWeight: '600', color: '#1a1a1a', marginBottom: '3px' }}>Deep pass — document structure <span style={{ fontWeight: '400', color: '#888' }}>(~15s)</span></div>
                <div style={{ color: '#555' }}>Dead metaphor · One-point dilution · Fractal summaries — patterns that only appear when reading the piece as a whole.</div>
              </div>
            </PopoverBox>
          )}
          <button onClick={openKeyInput} className="btn-throb" style={{
            background: '#1a1a1a', border: '1px solid #1a1a1a',
            borderRadius: '5px', padding: '5px 14px', cursor: 'pointer',
            fontSize: '13px', fontFamily: 'sans-serif', color: '#fff', fontWeight: '600',
          }}>
            + Add API key
          </button>
        </div>
      )}
    </div>
  )
}
