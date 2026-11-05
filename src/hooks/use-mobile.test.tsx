import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useIsMobile } from './use-mobile'

it('reads initial viewport state, follows changes, and unsubscribes', () => {
  let matches = true
  const listeners = new Set<() => void>()
  vi.stubGlobal('matchMedia', () => ({
    get matches() { return matches },
    addEventListener: (_event: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_event: string, fn: () => void) => listeners.delete(fn),
  }))
  try {
    const { result, unmount } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
    act(() => { matches = false; listeners.forEach(fn => fn()) })
    expect(result.current).toBe(false)
    unmount()
    expect(listeners.size).toBe(0)
  } finally { vi.unstubAllGlobals() }
})
