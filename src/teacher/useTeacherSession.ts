import { useCallback, useEffect, useRef, useState } from 'react'
import { TEACHER_ACCESS_CODE, TEACHER_SESSION_HOURS } from '../config.ts'
import * as bus from '../exam/bus.ts'
import { EXAM_DOCUMENT_TITLE, EXAM_PDF_NAME } from '../exam/document.ts'
import { teacherSnapshot, type ExamState } from '../exam/engine.ts'
import { mutate, useExamState } from '../exam/store.ts'
import { useNow } from '../lib/useNow.ts'
import type { TeacherAlert } from '../shared/types.ts'

const SESSION_KEY = 'examsecure.teacher'
/** A device counts as online if it announced itself within this window (background tabs are throttled). */
const ONLINE_WINDOW_MS = 75_000

export interface Toast extends TeacherAlert {
  key: number
}

/** Signed-in flag for this tab only. The code itself is never stored. */
function readSignedIn(): boolean {
  try {
    return Number(sessionStorage.getItem(SESSION_KEY)) > Date.now()
  } catch {
    return false
  }
}

function writeSignedIn(on: boolean) {
  try {
    if (on) sessionStorage.setItem(SESSION_KEY, String(Date.now() + TEACHER_SESSION_HOURS * 3600_000))
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* storage unavailable — stays signed in until the page is closed */
  }
}

export function useTeacherSession() {
  const [signedIn, setSignedIn] = useState(readSignedIn)
  const examState = useExamState()
  const [lastSeen, setLastSeen] = useState<Record<string, number>>({})
  const [actionError, setActionError] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastKey = useRef(0)
  const now = useNow(5000, signedIn)

  const dismissToast = useCallback((key: number) => setToasts((t) => t.filter((x) => x.key !== key)), [])

  useEffect(() => {
    if (!signedIn) return
    const unsubscribe = bus.subscribe((m) => {
      if (m.type === 'presence') {
        setLastSeen((p) => ({ ...p, [m.deviceId]: Date.now() }))
      } else if (m.type === 'bye') {
        setLastSeen((p) => {
          const next = { ...p }
          delete next[m.deviceId]
          return next
        })
      } else if (m.type === 'alert' && m.alert.type !== 'blocked_shortcut') {
        const key = ++toastKey.current
        setToasts((t) => [...t.slice(-3), { ...m.alert, key }])
        window.setTimeout(() => setToasts((t) => t.filter((x) => x.key !== key)), m.alert.serious ? 12000 : 6000)
      }
    })
    bus.post({ type: 'ping' }) // ask open pupil tabs to announce themselves now
    return unsubscribe
  }, [signedIn])

  const snapshot = signedIn
    ? teacherSnapshot(examState, (id) => (lastSeen[id] ?? 0) >= now - ONLINE_WINDOW_MS, {
        title: EXAM_DOCUMENT_TITLE,
        documentName: EXAM_PDF_NAME,
      })
    : null

  /** Case-sensitive check against the configured code. Frontend-only: not strong authentication. */
  const login = useCallback((code: string) => {
    if (code !== TEACHER_ACCESS_CODE) throw new Error('That access code is not correct.')
    writeSignedIn(true)
    setSignedIn(true)
  }, [])

  const logout = useCallback(() => {
    writeSignedIn(false)
    setSignedIn(false)
  }, [])

  const action = useCallback((change: (state: ExamState) => void) => {
    try {
      mutate(change)
      setActionError(null)
      return true
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong.')
      return false
    }
  }, [])

  return {
    auth: signedIn ? ('signed_in' as const) : ('signed_out' as const),
    snapshot,
    actionError,
    setActionError,
    toasts,
    dismissToast,
    login,
    logout,
    action,
  }
}

export type TeacherSession = ReturnType<typeof useTeacherSession>
