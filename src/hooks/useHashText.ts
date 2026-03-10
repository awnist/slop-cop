import { useEffect, useRef } from 'react'

const HASH_DEBOUNCE_MS = 600

/**
 * Syncs `text` into the URL hash via replaceState (no history entries added).
 * Debounced so rapid typing doesn't spam the history stack.
 */
export function useHashText(text: string): void {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirstRender = useRef(true)

  useEffect(() => {
    // Skip first render to avoid immediately overwriting a hash that was
    // just read as the initial text value.
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      history.replaceState(null, '', '#' + encodeURIComponent(text))
    }, HASH_DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [text])
}
