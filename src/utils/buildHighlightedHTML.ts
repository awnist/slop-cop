import { RULES_BY_ID } from '../rules'
import type { Violation } from '../types'

export function buildHighlightedHTML(
  text: string,
  violations: Violation[],
  activeRules: Set<string>,
): string {
  const active = violations.filter(v => activeRules.has(v.ruleId))
  if (active.length === 0) return escapeHtml(text)

  const events = new Set<number>([0, text.length])
  for (const v of active) {
    events.add(Math.max(0, v.startIndex))
    events.add(Math.min(text.length, v.endIndex))
  }

  const sorted = Array.from(events).sort((a, b) => a - b)
  let html = ''

  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i]
    const end = sorted[i + 1]
    const chunk = text.slice(start, end)
    if (!chunk) continue

    const matching = active.filter(v => v.startIndex <= start && v.endIndex >= end)

    if (matching.length === 0) {
      html += escapeHtml(chunk)
    } else {
      // Use shortest-span violation as primary (most specific)
      const primary = matching.reduce((a, b) =>
        (a.endIndex - a.startIndex) <= (b.endIndex - b.startIndex) ? a : b
      )
      const rule = RULES_BY_ID[primary.ruleId]
      const ruleIds = matching.map(v => v.ruleId).join(',')

      html += `<mark data-rules="${escapeAttr(ruleIds)}" data-start="${start}" data-end="${end}" style="background:${rule?.bgColor ?? 'rgba(255,220,0,0.35)'};border-bottom:2px solid ${rule?.color ?? '#f59e0b'};border-radius:2px;cursor:pointer;padding:0 1px;">${escapeHtml(chunk)}</mark>`
    }
  }

  return html
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}

function escapeAttr(str: string): string {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
