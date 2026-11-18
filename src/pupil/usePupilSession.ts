import { useCallback, useEffect, useState } from 'react'
import * as bus from '../exam/bus.ts'
import { EXAM_DOCUMENT_TITLE } from '../exam/document.ts'
import { ExamError, isJoinable, leave, pupilState, recordEvent, registerDevice, revalidate } from '../exam/engine.ts'
import { getExamState, mutate, subscribeExamState, useExamState } from '../exam/store.ts'
import type { SecurityEventType } from '../shared/types.ts'

/** Per-tab device identity: survives refreshes, but each tab is its own device. */
const DEVICE_KEY = 'examsecure.device'
/** Length of the "paper released" moment between the waiting room and the viewer. */
const RELEASE_MS = 1600
/** How often a pupil tab announces itself to teacher tabs. */
const PRESENCE_INTERVAL_MS = 10_000

/** Why starting was refused (no device record exists in that case). */
export type JoinRefusal = 'admission_closed' | 'exam_ended' | null

function readDeviceId(): string | null {
  try {
    return sessionStorage.getItem(DEVICE_KEY)
  } catch {
    return null
  }
}

function writeDeviceId(id: string | null) {
  try {
    if (id) sessionStorage.setItem(DEVICE_KEY, id)
    else sessionStorage.removeItem(DEVICE_KEY)
  } catch {
    /* storage unavailable — the session lasts for this page only */
  }
}

export function usePupilSession() {
  const examState = useExamState()
  const [storedId, setStoredId] = useState<string | null>(readDeviceId)
  const [refusal, setRefusal] = useState<JoinRefusal>(null)
  const [joinError, setJoinError] = useState<string | null>(null)

  const lookup = storedId ? pupilState(examState, storedId, EXAM_DOCUMENT_TITLE) : null
  // A stored id the shared state doesn't know (e.g. browser data cleared) is simply forgotten.
  const deviceId = lookup && lookup.phase !== 'invalid' ? storedId : null
  const state = deviceId ? lookup : null
  const exam = pupilState(examState, null, EXAM_DOCUMENT_TITLE).exam
  const phase = state?.phase ?? null

  useEffect(() => {
    if (storedId && !deviceId) writeDeviceId(null)
  }, [storedId, deviceId])

  // Waiting devices admit themselves as soon as the examination accepts them (opened / access reopened).
  const examStatus = examState.exam.status
  const admissionOpen = examState.exam.admissionOpen
  useEffect(() => {
    if (deviceId && phase === 'waiting' && examStatus === 'active' && admissionOpen) {
      mutate((s) => revalidate(s, deviceId))
    }
  }, [deviceId, phase, examStatus, admissionOpen])

  const register = useCallback(() => {
    setJoinError(null)
    try {
      const device = mutate((s) => registerDevice(s, navigator.userAgent))
      writeDeviceId(device.id)
      setStoredId(device.id)
      setRefusal(null)
    } catch (err) {
      if (err instanceof ExamError && (err.code === 'admission_closed' || err.code === 'exam_ended')) {
        setRefusal(err.code)
      } else {
        setJoinError('Unable to start on this browser. Please check that it is not in private mode and try again.')
      }
    }
  }, [])

  // A refused device joins automatically when the teacher reopens access or starts a new session.
  // One-shot: registering changes the state, which re-notifies this very listener synchronously.
  useEffect(() => {
    if (!refusal || deviceId) return
    let done = false
    const unsubscribe = subscribeExamState(() => {
      if (done || !isJoinable(getExamState())) return
      done = true
      unsubscribe()
      register()
    })
    return () => {
      done = true
      unsubscribe()
    }
  }, [refusal, deviceId, register])

  // Presence: lets teacher tabs show this device as online.
  useEffect(() => {
    if (!deviceId) return
    const announce = () => bus.post({ type: 'presence', deviceId })
    const bye = () => bus.post({ type: 'bye', deviceId })
    announce()
    const timer = window.setInterval(announce, PRESENCE_INTERVAL_MS)
    const unsubscribe = bus.subscribe((m) => {
      if (m.type === 'ping') announce()
    })
    document.addEventListener('visibilitychange', announce)
    window.addEventListener('pageshow', announce)
    window.addEventListener('pagehide', bye)
    return () => {
      window.clearInterval(timer)
      unsubscribe()
      document.removeEventListener('visibilitychange', announce)
      window.removeEventListener('pageshow', announce)
      window.removeEventListener('pagehide', bye)
    }
  }, [deviceId])

  // Brief "paper released" moment right after admission.
  const admittedAt = state?.device?.admittedAt ?? null
  const [now, setNow] = useState(() => Date.now())
  const inRelease = phase === 'admitted' && admittedAt !== null && now - admittedAt < RELEASE_MS
  useEffect(() => {
    if (!inRelease) return
    const id = window.setInterval(() => setNow(Date.now()), 150)
    return () => window.clearInterval(id)
  }, [inRelease])
  const releasing = inRelease

  /** Leave the waiting room (only before admission) or clear an ended session. */
  const reset = useCallback(() => {
    if (deviceId) mutate((s) => leave(s, deviceId))
    writeDeviceId(null)
    setStoredId(null)
    setRefusal(null)
  }, [deviceId])

  const reportEvent = useCallback(
    (type: SecurityEventType) => {
      if (!deviceId) return
      const alert = mutate((s) => recordEvent(s, deviceId, type))
      if (alert) bus.post({ type: 'alert', alert })
    },
    [deviceId],
  )

  return { deviceId, state, exam, releasing, joinError, refusal, register, reset, reportEvent }
}

export type PupilSession = ReturnType<typeof usePupilSession>
