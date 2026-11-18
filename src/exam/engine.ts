/**
 * The examination state machine.
 *
 * Pure functions over a plain, JSON-serialisable `ExamState`. No DOM, storage or React here,
 * so the same logic can later run behind a real-time sync service (or on a server) unchanged.
 * Mutating functions edit the state object passed in; `store.ts` takes care of reading the latest
 * persisted copy, applying the change and broadcasting it.
 */
import { EXAM_DEFAULTS } from '../config.ts'
import {
  COUNTED_EVENTS,
  type DeviceKind,
  type DeviceStatus,
  type ExamConfigInput,
  type ExamDisplayStatus,
  type ExamStatus,
  type PupilPhase,
  type PupilState,
  type SecurityEventType,
  type TeacherAlert,
  type TeacherSnapshot,
} from '../shared/types.ts'

export interface ExamSession {
  id: string
  status: ExamStatus
  admissionOpen: boolean
  createdAt: number
  openedAt: number | null
  endedAt: number | null
  endReason: 'teacher' | 'time' | null
  durationMinutes: number
  admissionWindowMinutes: number
  scheduledOpenAt: number | null
  endsAt: number | null
  admissionClosesAt: number | null
}

export interface Device {
  id: string
  label: string
  kind: DeviceKind
  sessionId: string
  status: DeviceStatus
  joinedAt: number
  admittedAt: number | null
  violations: number
  lastEventAt: number | null
  lastCountedAt: number | null
}

export interface StoredEvent {
  id: string
  sessionId: string
  deviceId: string
  type: SecurityEventType
  at: number
  violations: number
}

export interface ExamState {
  version: 2
  exam: ExamSession
  devices: Device[]
  events: StoredEvent[]
}

export class ExamError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

const MAX_EVENTS = 500
/** Focus-loss events this close together (blur + tab hidden) count as one violation. */
const VIOLATION_DEBOUNCE_MS = 2500

// ------------------------------------------------------------------ ids

function randomHex(bytes: number) {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** crypto.randomUUID is unavailable on plain-http LAN origins, so use getRandomValues. */
export const randomId = () => randomHex(16)

// ------------------------------------------------------------------ construction

function newSession(prev?: ExamSession, now = Date.now()): ExamSession {
  return {
    id: randomId(),
    status: 'not_started',
    admissionOpen: false,
    createdAt: now,
    openedAt: null,
    endedAt: null,
    endReason: null,
    durationMinutes: prev?.durationMinutes ?? EXAM_DEFAULTS.durationMinutes,
    admissionWindowMinutes: prev?.admissionWindowMinutes ?? EXAM_DEFAULTS.admissionWindowMinutes,
    scheduledOpenAt: null,
    endsAt: null,
    admissionClosesAt: null,
  }
}

export function createInitialState(): ExamState {
  return { version: 2, exam: newSession(), devices: [], events: [] }
}

export function isValidState(value: unknown): value is ExamState {
  const s = value as ExamState
  return Boolean(s && s.version === 2 && s.exam && typeof s.exam.id === 'string' && Array.isArray(s.devices) && Array.isArray(s.events))
}

export function deviceKindFromUserAgent(ua: string): DeviceKind {
  const s = ua.toLowerCase()
  // iPadOS reports itself as Macintosh; touch points give it away.
  const touchMac = /macintosh/.test(s) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1
  if (touchMac || /ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(s)) return 'tablet'
  if (/mobi|iphone|ipod|android/.test(s)) return 'mobile'
  return 'desktop'
}

// ------------------------------------------------------------------ queries

const currentDevices = (s: ExamState) => s.devices.filter((d) => d.sessionId === s.exam.id)
export const findDevice = (s: ExamState, id: string | null | undefined) => (id ? (s.devices.find((d) => d.id === id) ?? null) : null)

export function pupilPhase(s: ExamState, device: Device | null): PupilPhase {
  const exam = s.exam
  if (!device) return 'invalid'
  if (device.sessionId !== exam.id || exam.status === 'ended') return 'ended'
  if (device.status === 'removed') return 'removed'
  if (device.status === 'admitted' && exam.status === 'active') return 'admitted'
  if (exam.status === 'active' && !exam.admissionOpen) return 'access_closed'
  return 'waiting'
}

/** Whether a brand-new device may register right now. */
export function isJoinable(s: ExamState) {
  return s.exam.status === 'not_started' || (s.exam.status === 'active' && s.exam.admissionOpen)
}

export function pupilState(s: ExamState, deviceId: string | null, title: string): PupilState {
  const device = findDevice(s, deviceId)
  const exam = s.exam
  return {
    phase: pupilPhase(s, device),
    device: device ? { id: device.id, label: device.label, violations: device.violations, admittedAt: device.admittedAt } : null,
    exam: {
      title,
      status: exam.status,
      admissionOpen: exam.admissionOpen,
      scheduledOpenAt: exam.status === 'not_started' ? exam.scheduledOpenAt : null,
      endsAt: exam.endsAt,
    },
    escalationThreshold: EXAM_DEFAULTS.escalationThreshold,
  }
}

function displayStatus(exam: ExamSession): ExamDisplayStatus {
  if (exam.status === 'ended') return 'ended'
  if (exam.status === 'active') return exam.admissionOpen ? 'active' : 'access_closed'
  return exam.scheduledOpenAt ? 'scheduled' : 'not_started'
}

export function teacherSnapshot(
  s: ExamState,
  isOnline: (deviceId: string) => boolean,
  doc: { title: string; documentName: string },
): TeacherSnapshot {
  const exam = s.exam
  const threshold = EXAM_DEFAULTS.escalationThreshold
  const devices = currentDevices(s)
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map((d) => ({
      id: d.id,
      label: d.label,
      kind: d.kind,
      status: d.status,
      connected: d.status !== 'removed' && isOnline(d.id),
      joinedAt: d.joinedAt,
      admittedAt: d.admittedAt,
      violations: d.violations,
      lastEventAt: d.lastEventAt,
    }))
  const labels = new Map(devices.map((d) => [d.id, d.label]))
  const events = s.events
    .filter((e) => e.sessionId === exam.id)
    .slice(-40)
    .reverse()
    .map((e) => ({
      id: e.id,
      deviceId: e.deviceId,
      deviceLabel: labels.get(e.deviceId) ?? 'Unknown',
      type: e.type,
      at: e.at,
      violations: e.violations,
    }))
  return {
    exam: {
      id: exam.id,
      title: doc.title,
      documentName: doc.documentName,
      status: exam.status,
      displayStatus: displayStatus(exam),
      admissionOpen: exam.admissionOpen,
      createdAt: exam.createdAt,
      openedAt: exam.openedAt,
      endedAt: exam.endedAt,
      endReason: exam.endReason,
      durationMinutes: exam.durationMinutes,
      admissionWindowMinutes: exam.admissionWindowMinutes,
      scheduledOpenAt: exam.scheduledOpenAt,
      endsAt: exam.endsAt,
      admissionClosesAt: exam.admissionClosesAt,
    },
    devices,
    events,
    counts: {
      waiting: devices.filter((d) => d.status === 'waiting').length,
      admitted: devices.filter((d) => d.status === 'admitted').length,
      connected: devices.filter((d) => d.connected).length,
      flagged: devices.filter((d) => d.violations >= threshold).length,
    },
    escalationThreshold: threshold,
  }
}

// ------------------------------------------------------------------ pupil mutations

function uniqueLabel(s: ExamState) {
  const taken = new Set(currentDevices(s).map((d) => d.label))
  for (let i = 0; i < 50; i++) {
    const label = `PUPIL-${randomHex(2).toUpperCase()}`
    if (!taken.has(label)) return label
  }
  return `PUPIL-${randomHex(4).toUpperCase()}`
}

/** Admit a waiting device if the examination currently accepts devices. Returns true if it changed. */
export function revalidate(s: ExamState, deviceId: string, now = Date.now()): boolean {
  const device = findDevice(s, deviceId)
  const exam = s.exam
  if (device && device.status === 'waiting' && device.sessionId === exam.id && exam.status === 'active' && exam.admissionOpen) {
    device.status = 'admitted'
    device.admittedAt = now
    return true
  }
  return false
}

/** Pupil pressed START EXAM. */
export function registerDevice(s: ExamState, userAgent: string, now = Date.now()): Device {
  const exam = s.exam
  if (exam.status === 'ended') throw new ExamError('exam_ended', 'This examination has ended.')
  if (exam.status === 'active' && !exam.admissionOpen) {
    throw new ExamError('admission_closed', 'New devices can no longer join this examination.')
  }
  const device: Device = {
    id: randomId(),
    label: uniqueLabel(s),
    kind: deviceKindFromUserAgent(userAgent),
    sessionId: exam.id,
    status: 'waiting',
    joinedAt: now,
    admittedAt: null,
    violations: 0,
    lastEventAt: null,
    lastCountedAt: null,
  }
  s.devices.push(device)
  revalidate(s, device.id, now)
  return device
}

/** A waiting pupil leaves voluntarily (admitted devices stay on record). */
export function leave(s: ExamState, deviceId: string) {
  const device = findDevice(s, deviceId)
  if (device?.status === 'waiting') s.devices = s.devices.filter((d) => d.id !== deviceId)
}

export function recordEvent(s: ExamState, deviceId: string, type: SecurityEventType, now = Date.now()): TeacherAlert | null {
  const device = findDevice(s, deviceId)
  if (!device || pupilPhase(s, device) !== 'admitted') return null
  const counted = COUNTED_EVENTS.has(type)
  if (counted) {
    if (device.lastCountedAt && now - device.lastCountedAt < VIOLATION_DEBOUNCE_MS) return null
    device.violations += 1
    device.lastCountedAt = now
  }
  device.lastEventAt = now
  s.events.push({ id: randomId(), sessionId: device.sessionId, deviceId, type, at: now, violations: device.violations })
  if (s.events.length > MAX_EVENTS) s.events.splice(0, s.events.length - MAX_EVENTS)
  return {
    deviceId,
    deviceLabel: device.label,
    type,
    violations: device.violations,
    serious: counted && device.violations >= EXAM_DEFAULTS.escalationThreshold,
  }
}

// ------------------------------------------------------------------ teacher mutations

export function configure(s: ExamState, input: ExamConfigInput, now = Date.now()) {
  const exam = s.exam
  if (exam.status !== 'not_started') {
    throw new ExamError('not_editable', 'Settings can only be changed before the examination opens.')
  }
  const minutes = (v: unknown) => {
    const n = Number(v)
    if (!Number.isInteger(n) || n < 0 || n > 24 * 60) throw new ExamError('invalid_input', 'Invalid minutes value.')
    return n
  }
  if (input.durationMinutes !== undefined) exam.durationMinutes = minutes(input.durationMinutes)
  if (input.admissionWindowMinutes !== undefined) exam.admissionWindowMinutes = minutes(input.admissionWindowMinutes)
  if (input.scheduledOpenAt !== undefined) {
    if (input.scheduledOpenAt === null) {
      exam.scheduledOpenAt = null
    } else {
      const t = Number(input.scheduledOpenAt)
      if (!Number.isFinite(t) || t <= now || t > now + 7 * 24 * 3600_000) {
        throw new ExamError('invalid_input', 'Choose an opening time in the future.')
      }
      exam.scheduledOpenAt = t
    }
  }
}

export function reopenAccess(s: ExamState) {
  const exam = s.exam
  if (exam.status !== 'active') throw new ExamError('not_active', 'The examination is not active.')
  exam.admissionOpen = true
  exam.admissionClosesAt = null // a manual reopen overrides any automatic window
}

/** Open the examination. Waiting devices admit themselves when they see the change (see `revalidate`). */
export function openExam(s: ExamState, now = Date.now()) {
  const exam = s.exam
  if (exam.status === 'ended') throw new ExamError('exam_ended', 'This examination has ended. Start a new session first.')
  if (exam.status === 'active') {
    reopenAccess(s)
    return
  }
  exam.status = 'active'
  exam.admissionOpen = true
  exam.openedAt = now
  exam.scheduledOpenAt = null
  exam.endsAt = exam.durationMinutes > 0 ? now + exam.durationMinutes * 60_000 : null
  exam.admissionClosesAt = exam.admissionWindowMinutes > 0 ? now + exam.admissionWindowMinutes * 60_000 : null
}

export function closeAccess(s: ExamState) {
  const exam = s.exam
  if (exam.status !== 'active') throw new ExamError('not_active', 'The examination is not active.')
  exam.admissionOpen = false
  exam.admissionClosesAt = null
}

export function endExam(s: ExamState, reason: 'teacher' | 'time' = 'teacher', now = Date.now()) {
  const exam = s.exam
  if (exam.status === 'ended') return
  exam.status = 'ended'
  exam.admissionOpen = false
  exam.endedAt = now
  exam.endReason = reason
  exam.scheduledOpenAt = null
  exam.admissionClosesAt = null
}

export function startNewSession(s: ExamState, now = Date.now()) {
  if (s.exam.status !== 'ended') throw new ExamError('not_ended', 'End the current examination before starting a new session.')
  const prevId = s.exam.id
  s.exam = newSession(s.exam, now)
  // Keep the previous session's devices so their screens keep showing "ended"; drop anything older.
  s.devices = s.devices.filter((d) => d.sessionId === prevId)
  s.events = []
}

export function removeDevice(s: ExamState, deviceId: string) {
  const device = currentDevices(s).find((d) => d.id === deviceId)
  if (!device) throw new ExamError('not_found', 'Device not found.')
  device.status = 'removed'
}

// ------------------------------------------------------------------ time-based transitions

/** True when `tick` would change something at `now` (cheap check, so tabs only write when needed). */
export function tickDue(s: ExamState, now: number) {
  const exam = s.exam
  if (exam.status === 'not_started') return Boolean(exam.scheduledOpenAt && now >= exam.scheduledOpenAt)
  if (exam.status === 'active') {
    return Boolean((exam.endsAt && now >= exam.endsAt) || (exam.admissionOpen && exam.admissionClosesAt && now >= exam.admissionClosesAt))
  }
  return false
}

/** Applies scheduled opening, automatic admission close and the time limit. */
export function tick(s: ExamState, now = Date.now()) {
  const exam = s.exam
  if (exam.status === 'not_started' && exam.scheduledOpenAt && now >= exam.scheduledOpenAt) {
    openExam(s, exam.scheduledOpenAt)
  } else if (exam.status === 'active') {
    if (exam.endsAt && now >= exam.endsAt) endExam(s, 'time', now)
    else if (exam.admissionOpen && exam.admissionClosesAt && now >= exam.admissionClosesAt) closeAccess(s)
  }
}
