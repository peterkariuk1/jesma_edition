import { useSyncExternalStore } from 'react'
import * as bus from './bus.ts'
import { createInitialState, isValidState, tick, tickDue, type ExamState } from './engine.ts'

/**
 * Persisted, cross-tab examination state.
 *
 * The state lives in localStorage so every tab of this browser shares it and it survives
 * refreshes. Each change re-reads the latest copy, applies the mutation and writes it back,
 * then notifies this tab directly and other tabs via the bus (plus native `storage` events).
 */
const STATE_KEY = 'examsecure.state.v2'

let memoryRaw: string | null = null // used when localStorage is unavailable
let cachedRaw: string | null | undefined
let cached: ExamState = createInitialState()
const listeners = new Set<() => void>()

function readRaw(): string | null {
  try {
    return localStorage.getItem(STATE_KEY)
  } catch {
    return memoryRaw
  }
}

function writeRaw(raw: string) {
  try {
    localStorage.setItem(STATE_KEY, raw)
  } catch {
    memoryRaw = raw
  }
}

/** Latest state (stable object identity until the stored value changes). */
export function getExamState(): ExamState {
  const raw = readRaw()
  if (raw === cachedRaw) return cached
  cachedRaw = raw
  let parsed: unknown
  try {
    parsed = raw ? JSON.parse(raw) : null
  } catch {
    parsed = null
  }
  if (isValidState(parsed)) {
    cached = parsed
  } else {
    cached = createInitialState()
    const fresh = JSON.stringify(cached)
    writeRaw(fresh)
    cachedRaw = fresh
  }
  return cached
}

function notify() {
  for (const l of listeners) l()
}

/** Apply a change to the latest state, persist it and broadcast it. Errors leave the state untouched. */
export function mutate<T>(fn: (state: ExamState) => T): T {
  const draft = JSON.parse(JSON.stringify(getExamState())) as ExamState
  const result = fn(draft)
  const raw = JSON.stringify(draft)
  if (raw !== cachedRaw) {
    writeRaw(raw)
    cachedRaw = raw
    cached = draft
    notify()
    bus.post({ type: 'state' })
  }
  return result
}

export function subscribeExamState(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Changes made in other tabs.
if (typeof window !== 'undefined') {
  bus.subscribe((m) => {
    if (m.type === 'state') notify()
  })
  window.addEventListener('storage', (e) => {
    if (e.key === STATE_KEY || e.key === null) notify()
  })
  // Mobile browsers may freeze background tabs; re-read when the page comes back.
  window.addEventListener('pageshow', notify)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) notify()
  })
}

export function useExamState(): ExamState {
  return useSyncExternalStore(subscribeExamState, getExamState, getExamState)
}

/**
 * Applies time-based transitions (scheduled opening, admission window, time limit).
 * Runs in every open tab; it only writes when a transition is actually due.
 */
export function startExamClock() {
  const run = () => {
    const now = Date.now()
    if (tickDue(getExamState(), now)) mutate((s) => tick(s, now))
  }
  run()
  const id = window.setInterval(run, 1000)
  return () => window.clearInterval(id)
}
