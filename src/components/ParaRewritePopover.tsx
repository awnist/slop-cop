import { useState } from 'react'
import { diffWords } from 'diff'

interface Props {
  original: string
  rewritten: string | null   // null = still loading
  error: string | null
  debugPrompt: string
  buttonPos: { left: number; top: number }
  noApiKey?: boolean
  onApply: () => void
  onDismiss: () => void
}

export default function ParaRewritePopover({ original, rewritten, error, debugPrompt, buttonPos, noApiKey, onApply, onDismiss }: Props) {
  const [showDebug, setShowDebug] = useState(false)

  // Anchor at the sparkle button, shifted right so it doesn't overlap
  // Clamp so the popover never overflows the viewport (16px margin)
  const POPOVER_W = 440
  const POPOVER_MAX_H = 520
  const MARGIN = 16
  const left = Math.min(buttonPos.left + 36, window.innerWidth - POPOVER_W - MARGIN)
  const top = Math.min(buttonPos.top - 4, window.innerHeight - POPOVER_MAX_H - MARGIN)

  return (
    <div
      style={{
        position: 'fixed',
        top,
        left,
        width: '440px',
        maxHeight: '520px',
        background: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: '10px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '14px' }}>✨</span>
        <span style={{ fontSize: '12px', fontWeight: '600', fontFamily: 'sans-serif', color: '#444' }}>
          Paragraph Rewrite
        </span>
        <button
          onClick={onDismiss}
          style={{
            marginLeft: 'auto',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '18px',
            color: '#bbb',
            lineHeight: 1,
            padding: '0 2px',
          }}
        >×</button>
      </div>

      {/* Body */}
      <div style={{ padding: '12px 14px', overflowY: 'auto', flex: 1 }}>
        {noApiKey ? (
          <div style={{ fontFamily: 'sans-serif' }}>
            <p style={{ fontSize: '13px', color: '#444', margin: '0 0 12px', lineHeight: '1.5' }}>
              <mark style={{ background: '#fef08a', borderRadius: '2px', padding: '0 2px' }}>Enter an Anthropic API key in the toolbar</mark> to enable AI features:
            </p>
            <ul style={{ margin: '0 0 12px', padding: '0 0 0 16px', fontSize: '12px', color: '#555', lineHeight: '1.8' }}>
              <li><strong>Paragraph rewrite</strong> — rewrites a paragraph to remove detected patterns</li>
              <li><strong>Semantic analysis</strong> — detects 13 additional LLM patterns that require language understanding</li>
            </ul>
            <p style={{ fontSize: '11px', color: '#999', margin: 0, lineHeight: '1.5' }}>
              Your key is stored only in your browser. Requests go directly from your browser to Anthropic's API — nothing passes through any server of ours.
            </p>
          </div>
        ) : showDebug ? (
          <div>
            <div style={{
              fontSize: '10px', fontFamily: 'sans-serif', textTransform: 'uppercase',
              letterSpacing: '0.08em', color: '#bbb', marginBottom: '6px',
            }}>System Prompt</div>
            <pre style={{
              fontSize: '11px',
              fontFamily: 'monospace',
              color: '#555',
              background: '#f8f8f8',
              border: '1px solid #eee',
              borderRadius: '5px',
              padding: '10px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
              lineHeight: '1.5',
            }}>{debugPrompt}</pre>
            <div style={{
              fontSize: '10px', fontFamily: 'sans-serif', textTransform: 'uppercase',
              letterSpacing: '0.08em', color: '#bbb', margin: '10px 0 6px',
            }}>User Message</div>
            <pre style={{
              fontSize: '11px',
              fontFamily: 'monospace',
              color: '#555',
              background: '#f8f8f8',
              border: '1px solid #eee',
              borderRadius: '5px',
              padding: '10px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
              lineHeight: '1.5',
            }}>{original}</pre>
          </div>
        ) : (
          <>
            {error && (
              <div style={{ color: '#dc2626', fontSize: '12px', fontFamily: 'sans-serif', lineHeight: '1.5' }}>
                Error: {error}
              </div>
            )}

            {!error && rewritten === null && (
              <div style={{
                color: '#999',
                fontSize: '12px',
                fontFamily: 'sans-serif',
                textAlign: 'center',
                padding: '20px 0',
              }}>
                Rewriting…
              </div>
            )}

            {rewritten !== null && (
              <>
                {rewritten === '' ? (
                  /* Delete suggestion */
                  <div style={{
                    fontSize: '12px', fontFamily: 'sans-serif', color: '#dc2626',
                    background: '#fff5f5', border: '1px solid #fecaca',
                    borderRadius: '5px', padding: '8px 10px', lineHeight: '1.5',
                  }}>
                    Delete this paragraph.
                  </div>
                ) : (
                  <>
                    {/* Top panel: inline word diff */}
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{
                        fontSize: '10px', fontFamily: 'sans-serif', textTransform: 'uppercase',
                        letterSpacing: '0.08em', color: '#bbb', marginBottom: '5px',
                      }}>Difference</div>
                      <div style={{ fontSize: '13px', fontFamily: "'Georgia', serif", lineHeight: '1.65', whiteSpace: 'pre-wrap' }}>
                        {diffWords(original, rewritten).map((part, i) =>
                          part.removed ? (
                            <span key={i} style={{ color: '#dc2626', textDecoration: 'line-through', textDecorationColor: '#fca5a5' }}>{part.value}</span>
                          ) : part.added ? (
                            <span key={i} style={{ color: '#16a34a' }}>{part.value}</span>
                          ) : (
                            <span key={i} style={{ color: '#999' }}>{part.value}</span>
                          )
                        )}
                      </div>
                    </div>

                    {/* Divider */}
                    <div style={{ height: '1px', background: '#f0f0f0', margin: '10px 0' }} />

                    {/* Bottom panel: clean rewritten text */}
                    <div>
                      <div style={{
                        fontSize: '10px', fontFamily: 'sans-serif', textTransform: 'uppercase',
                        letterSpacing: '0.08em', color: '#bbb', marginBottom: '5px',
                      }}>Rewritten</div>
                      <div style={{
                        fontSize: '13px',
                        fontFamily: "'Georgia', serif",
                        lineHeight: '1.65',
                        color: '#166534',
                        background: '#f0fdf4',
                        borderRadius: '5px',
                        padding: '8px 10px',
                        whiteSpace: 'pre-wrap',
                      }}>
                        {rewritten}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 14px',
        borderTop: '1px solid #f0f0f0',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexShrink: 0,
      }}>
        {noApiKey ? (
          <>
            <div style={{ flex: 1 }} />
            <button
              onClick={onDismiss}
              style={{ padding: '6px 14px', background: 'none', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', fontFamily: 'sans-serif', cursor: 'pointer', color: '#666' }}
            >Close</button>
          </>
        ) : (
        <>
        {/* Debug toggle — bottom left */}
        <button
          onClick={() => setShowDebug(s => !s)}
          title="Show prompt used for this rewrite"
          style={{
            background: 'none',
            border: '1px solid #eee',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '10px',
            fontFamily: 'monospace',
            color: showDebug ? '#555' : '#ccc',
            padding: '2px 6px',
            lineHeight: 1.4,
          }}
        >{showDebug ? 'prompt ▲' : 'prompt'}</button>

        <div style={{ flex: 1 }} />

        {!showDebug && rewritten !== null && (
          <>
            <button
              onClick={onDismiss}
              style={{
                padding: '6px 14px',
                background: 'none',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '12px',
                fontFamily: 'sans-serif',
                cursor: 'pointer',
                color: '#666',
              }}
            >Dismiss</button>
            <button
              onClick={onApply}
              style={{
                padding: '6px 14px',
                background: rewritten === '' ? '#dc2626' : '#16a34a',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontFamily: 'sans-serif',
                cursor: 'pointer',
                color: '#fff',
                fontWeight: '600',
              }}
            >{rewritten === '' ? 'Delete' : 'Apply'}</button>
          </>
        )}
        {!showDebug && rewritten === null && !error && (
          <button
            onClick={onDismiss}
            style={{
              padding: '6px 14px',
              background: 'none',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '12px',
              fontFamily: 'sans-serif',
              cursor: 'pointer',
              color: '#666',
            }}
          >Cancel</button>
        )}
        {showDebug && (
          <button
            onClick={onDismiss}
            style={{
              padding: '6px 14px',
              background: 'none',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '12px',
              fontFamily: 'sans-serif',
              cursor: 'pointer',
              color: '#666',
            }}
          >Close</button>
        )}
        </>
        )}
      </div>
    </div>
  )
}
