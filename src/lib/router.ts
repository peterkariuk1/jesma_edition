import { useSyncExternalStore } from 'react'

/** Minimal path router built on the History API (the app only has a handful of screens). */
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', notify)
}

export function navigate(path: string, { replace = false } = {}) {
  if (window.location.pathname === path) return
  if (replace) window.history.replaceState(null, '', path)
  else window.history.pushState(null, '', path)
  notify()
}

export function usePath(): string {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => window.location.pathname,
  )
}
