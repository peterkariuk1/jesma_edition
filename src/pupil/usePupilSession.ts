import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { api, ApiError } from '../lib/api.ts'
import type { PublicExamInfo, PupilState, SecurityEventType } from '../shared/types.ts'

const TOKEN_KEY = 'examsecure.device'

/** Why registering a new device was refused (no device session exists in that case). */
export type JoinRefusal = 'admission_closed' | 'exam_ended' | null

function readToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function writeToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token)
    else window.localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage unavailable (private mode) – session lasts for this page only */
  }
}

export function usePupilSession() {
  const [token, setToken] = useState<string | null>(readToken)
  const [state, setState] = useState<PupilState | null>(null)
  const [connected, setConnected] = useState(false)
  const [everConnected, setEverConnected] = useState(false)
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<JoinRefusal>(null)
  const [publicExam, setPublicExam] = useState<PublicExamInfo | null>(null)
  /** Brief 'paper released' moment between the waiting room and the viewer. */
  const [releasing, setReleasing] = useState(false)
  const lastPhase = useRef<PupilState['phase'] | null>(null)
  /** Server clock offset so countdowns are correct even if the device clock is wrong. */
  const [clockOffset, setClockOffset] = useState(0)

  const applyState = useCallback((s: PupilState) => {
    setClockOffset(s.serverTime - Date.now())
    if (s.phase === 'invalid') {
      writeToken(null)
      setToken(null)
      setState(null)
      return
    }
    if (s.phase === 'admitted' && (lastPhase.current === 'waiting' || lastPhase.current === 'access_closed')) {
      setReleasing(true)
      window.setTimeout(() => setReleasing(false), 1600)
    }
    lastPhase.current = s.phase
    setState(s)
  }, [])

  // Real-time connection for registered devices.
  useEffect(() => {
    if (!token) return
    const socket: Socket = io({
      auth: { role: 'pupil', token },
      transports: ['websocket', 'polling'],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    })
    socket.on('connect', () => {
      setConnected(true)
      setEverConnected(true)
    })
    socket.on('disconnect', () => setConnected(false))
    socket.on('connect_error', () => setConnected(false))
    socket.on('pupil:state', applyState)
    return () => {
      socket.disconnect()
    }
  }, [token, applyState])

  // Devices refused at registration poll the public status and re-try automatically.
  const register = useCallback(async () => {
    setJoining(true)
    setJoinError(null)
    try {
      const res = await api<{ token: string; state: PupilState }>('/api/pupil/register', { method: 'POST' })
      writeToken(res.token)
      setRefusal(null)
      applyState(res.state)
      setToken(res.token)
      return true
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'admission_closed' || err.code === 'exam_ended')) {
        setRefusal(err.code)
        return true
      }
      setJoinError(err instanceof Error ? err.message : 'Unable to start. Please try again.')
      return false
    } finally {
      setJoining(false)
    }
  }, [applyState])

  useEffect(() => {
    if (!refusal) return
    let cancelled = false
    const poll = async () => {
      try {
        const exam = await api<PublicExamInfo>('/api/exam/public')
        if (cancelled) return
        setPublicExam(exam)
        const joinable = exam.status === 'not_started' || (exam.status === 'active' && exam.admissionOpen)
        if (joinable) await register()
      } catch {
        /* offline – keep polling */
      }
    }
    const id = window.setInterval(poll, 4000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [refusal, register])

  /** Leave the waiting room (only meaningful before admission) or clear an ended session. */
  const reset = useCallback(async () => {
    const t = token
    writeToken(null)
    setToken(null)
    setState(null)
    setRefusal(null)
    setPublicExam(null)
    setEverConnected(false)
    if (t) await api('/api/pupil/leave', { method: 'POST', token: t }).catch(() => {})
  }, [token])

  const reportEvent = useCallback(
    (type: SecurityEventType) => {
      if (!token) return
      api('/api/pupil/events', { method: 'POST', body: { type }, token, keepalive: true }).catch(() => {})
    },
    [token],
  )

  return {
    token,
    state,
    releasing,
    connected,
    everConnected,
    joining,
    joinError,
    refusal,
    publicExam,
    register,
    reset,
    reportEvent,
    clockOffset,
  }
}

export type PupilSession = ReturnType<typeof usePupilSession>
