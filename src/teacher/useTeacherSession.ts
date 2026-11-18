import { useCallback, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { api, ApiError } from '../lib/api.ts'
import type { TeacherAlert, TeacherSnapshot } from '../shared/types.ts'

export interface Toast extends TeacherAlert {
  key: number
}

export function useTeacherSession() {
  const [auth, setAuth] = useState<'checking' | 'signed_out' | 'signed_in'>('checking')
  const [snapshot, setSnapshot] = useState<TeacherSnapshot | null>(null)
  const [connected, setConnected] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastKey = useRef(0)

  useEffect(() => {
    api<{ authenticated: boolean }>('/api/teacher/session')
      .then((r) => setAuth(r.authenticated ? 'signed_in' : 'signed_out'))
      .catch(() => setAuth('signed_out'))
  }, [])

  const dismissToast = useCallback((key: number) => setToasts((t) => t.filter((x) => x.key !== key)), [])

  useEffect(() => {
    if (auth !== 'signed_in') return
    const socket = io({ auth: { role: 'teacher' }, withCredentials: true })
    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('teacher:state', (s: TeacherSnapshot) => setSnapshot(s))
    socket.on('teacher:unauthorized', () => {
      setSnapshot(null)
      setAuth('signed_out')
    })
    socket.on('teacher:alert', (alert: TeacherAlert) => {
      if (alert.type === 'blocked_shortcut') return // recorded, but not worth interrupting the teacher
      const key = ++toastKey.current
      setToasts((t) => [...t.slice(-3), { ...alert, key }])
      window.setTimeout(() => setToasts((t) => t.filter((x) => x.key !== key)), alert.serious ? 12000 : 6000)
    })
    return () => {
      socket.disconnect()
    }
  }, [auth])

  const login = useCallback(async (code: string) => {
    await api('/api/teacher/login', { method: 'POST', body: { code } })
    setAuth('signed_in')
  }, [])

  const logout = useCallback(async () => {
    await api('/api/teacher/logout', { method: 'POST' }).catch(() => {})
    setSnapshot(null)
    setAuth('signed_out')
  }, [])

  const action = useCallback(async (name: string, path: string, body?: unknown) => {
    setBusy(name)
    setActionError(null)
    try {
      const s = await api<TeacherSnapshot>(path, { method: 'POST', body: body ?? {} })
      setSnapshot(s)
      return true
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setSnapshot(null)
        setAuth('signed_out')
      } else {
        setActionError(err instanceof Error ? err.message : 'Something went wrong.')
      }
      return false
    } finally {
      setBusy(null)
    }
  }, [])

  return { auth, snapshot, connected, busy, actionError, setActionError, toasts, dismissToast, login, logout, action }
}

export type TeacherSession = ReturnType<typeof useTeacherSession>
