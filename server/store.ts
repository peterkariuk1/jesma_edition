import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.ts'
import {
  COUNTED_EVENTS,
  type DeviceKind,
  type DeviceStatus,
  type ExamConfigInput,
  type ExamStatus,
  type PupilState,
  type SecurityEventType,
  type TeacherAlert,
  type TeacherSnapshot,
} from '../src/shared/types.ts'

interface ExamSession {
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

interface Device {
  id: string
  label: string
  kind: DeviceKind
  tokenHash: string
  sessionId: string
  status: DeviceStatus
  joinedAt: number
  admittedAt: number | null
  violations: number
  lastEventAt: number | null
  lastCountedAt: number | null
}

interface StoredEvent {
  id: string
  sessionId: string
  deviceId: string
  type: SecurityEventType
  at: number
  violations: number
}

interface TeacherSession {
  tokenHash: string
  expiresAt: number
}

interface PersistedState {
  version: 1
  exam: ExamSession
  devices: Device[]
  events: StoredEvent[]
  teacherSessions: TeacherSession[]
}

export class ExamError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, message: string, status = 409) {
    super(message)
    this.code = code
    this.status = status
  }
}

const MAX_EVENTS = 1000
/** Repeated focus-loss events within this window count as a single violation. */
const VIOLATION_DEBOUNCE_MS = 2500

export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex')
const randomToken = () => crypto.randomBytes(32).toString('base64url')
const randomId = () => crypto.randomUUID()

function newSession(prev?: ExamSession): ExamSession {
  return {
    id: randomId(),
    status: 'not_started',
    admissionOpen: false,
    createdAt: Date.now(),
    openedAt: null,
    endedAt: null,
    endReason: null,
    durationMinutes: prev?.durationMinutes ?? config.defaultDurationMinutes,
    admissionWindowMinutes: prev?.admissionWindowMinutes ?? config.defaultAdmissionWindowMinutes,
    scheduledOpenAt: null,
    endsAt: null,
    admissionClosesAt: null,
  }
}

export function deviceKindFromUserAgent(ua: string | undefined): DeviceKind {
  const s = (ua ?? '').toLowerCase()
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(s)) return 'tablet'
  if (/mobi|iphone|ipod|android/.test(s)) return 'mobile'
  return 'desktop'
}

export class ExamStore {
  private state: PersistedState
  private saveTimer: NodeJS.Timeout | null = null
  /** deviceId -> number of live socket connections (runtime only). */
  private connections = new Map<string, number>()
  private listeners = new Set<() => void>()

  constructor() {
    this.state = this.load()
    this.pruneTeacherSessions()
  }

  // ---------------------------------------------------------------- persistence

  private load(): PersistedState {
    try {
      const raw = JSON.parse(fs.readFileSync(config.dataFile, 'utf8')) as PersistedState
      if (raw?.version === 1 && raw.exam && Array.isArray(raw.devices)) return raw
    } catch {
      /* first run or unreadable file */
    }
    return { version: 1, exam: newSession(), devices: [], events: [], teacherSessions: [] }
  }

  private persist() {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.flush()
    }, 150)
  }

  flush() {
    try {
      fs.mkdirSync(path.dirname(config.dataFile), { recursive: true })
      const tmp = `${config.dataFile}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2))
      fs.renameSync(tmp, config.dataFile)
    } catch (err) {
      console.error('[store] Failed to persist state', err)
    }
  }

  onChange(fn: () => void) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private changed() {
    this.persist()
    for (const fn of this.listeners) fn()
  }

  // ---------------------------------------------------------------- helpers

  get exam(): Readonly<ExamSession> {
    return this.state.exam
  }

  private currentDevices() {
    return this.state.devices.filter((d) => d.sessionId === this.state.exam.id)
  }

  findDeviceByToken(token: string | undefined | null): Device | null {
    if (!token || typeof token !== 'string' || token.length > 200) return null
    const h = hashToken(token)
    return this.state.devices.find((d) => d.tokenHash === h) ?? null
  }

  isConnected(deviceId: string) {
    return (this.connections.get(deviceId) ?? 0) > 0
  }

  connectedDeviceIds() {
    return [...this.connections.entries()].filter(([, n]) => n > 0).map(([id]) => id)
  }

  private uniqueLabel(): string {
    const taken = new Set(this.currentDevices().map((d) => d.label))
    for (let i = 0; i < 50; i++) {
      const label = `PUPIL-${crypto.randomBytes(2).toString('hex').toUpperCase()}`
      if (!taken.has(label)) return label
    }
    return `PUPIL-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
  }

  /** Admit a waiting device if the examination currently accepts devices. */
  private tryAdmit(device: Device): boolean {
    const exam = this.state.exam
    if (
      device.status === 'waiting' &&
      device.sessionId === exam.id &&
      exam.status === 'active' &&
      exam.admissionOpen
    ) {
      device.status = 'admitted'
      device.admittedAt = Date.now()
      return true
    }
    return false
  }

  private admitConnectedWaiting() {
    for (const d of this.currentDevices()) {
      if (this.isConnected(d.id)) this.tryAdmit(d)
    }
  }

  // ---------------------------------------------------------------- pupil side

  /** Register a new device for the current session (pupil pressed START EXAM). */
  registerDevice(userAgent: string | undefined): { token: string; device: Device } {
    const exam = this.state.exam
    if (exam.status === 'ended') {
      throw new ExamError('exam_ended', 'This examination has ended.', 403)
    }
    if (exam.status === 'active' && !exam.admissionOpen) {
      throw new ExamError('admission_closed', 'New devices can no longer join this examination.', 403)
    }
    const token = randomToken()
    const device: Device = {
      id: randomId(),
      label: this.uniqueLabel(),
      kind: deviceKindFromUserAgent(userAgent),
      tokenHash: hashToken(token),
      sessionId: exam.id,
      status: 'waiting',
      joinedAt: Date.now(),
      admittedAt: null,
      violations: 0,
      lastEventAt: null,
      lastCountedAt: null,
    }
    this.state.devices.push(device)
    this.tryAdmit(device)
    this.changed()
    return { token, device }
  }

  /** A waiting pupil leaves the waiting room voluntarily. */
  leave(device: Device) {
    if (device.status !== 'waiting') return
    this.state.devices = this.state.devices.filter((d) => d.id !== device.id)
    this.changed()
  }

  /** Re-validate a device (e.g. on reconnect) and admit it if allowed. */
  revalidate(device: Device) {
    if (this.tryAdmit(device)) this.changed()
  }

  deviceConnected(deviceId: string) {
    this.connections.set(deviceId, (this.connections.get(deviceId) ?? 0) + 1)
    const device = this.state.devices.find((d) => d.id === deviceId)
    if (device) this.tryAdmit(device)
    this.changed()
  }

  deviceDisconnected(deviceId: string) {
    const n = (this.connections.get(deviceId) ?? 1) - 1
    if (n <= 0) this.connections.delete(deviceId)
    else this.connections.set(deviceId, n)
    this.changed()
  }

  pupilPhase(device: Device | null) {
    const exam = this.state.exam
    if (!device) return 'invalid' as const
    if (device.sessionId !== exam.id || exam.status === 'ended') return 'ended' as const
    if (device.status === 'removed') return 'removed' as const
    if (device.status === 'admitted' && exam.status === 'active') return 'admitted' as const
    if (exam.status === 'active' && !exam.admissionOpen) return 'access_closed' as const
    return 'waiting' as const
  }

  /** True only when the device may receive the examination document right now. */
  canViewDocument(device: Device | null): boolean {
    return this.pupilPhase(device) === 'admitted'
  }

  pupilState(device: Device | null): PupilState {
    const exam = this.state.exam
    return {
      phase: this.pupilPhase(device),
      device: device ? { id: device.id, label: device.label, violations: device.violations } : null,
      exam: {
        title: config.examTitle,
        status: exam.status,
        admissionOpen: exam.admissionOpen,
        scheduledOpenAt: exam.status === 'not_started' ? exam.scheduledOpenAt : null,
        endsAt: exam.endsAt,
      },
      escalationThreshold: config.escalationThreshold,
      serverTime: Date.now(),
    }
  }

  /** Record a security event. Returns an alert for the teacher, or null if ignored. */
  recordEvent(device: Device, type: SecurityEventType): TeacherAlert | null {
    if (this.pupilPhase(device) !== 'admitted') return null
    const now = Date.now()
    const counted = COUNTED_EVENTS.has(type)
    if (counted) {
      if (device.lastCountedAt && now - device.lastCountedAt < VIOLATION_DEBOUNCE_MS) return null
      device.violations += 1
      device.lastCountedAt = now
    }
    device.lastEventAt = now
    this.state.events.push({
      id: randomId(),
      sessionId: device.sessionId,
      deviceId: device.id,
      type,
      at: now,
      violations: device.violations,
    })
    if (this.state.events.length > MAX_EVENTS) {
      this.state.events.splice(0, this.state.events.length - MAX_EVENTS)
    }
    this.changed()
    return {
      deviceId: device.id,
      deviceLabel: device.label,
      type,
      violations: device.violations,
      serious: counted && device.violations >= config.escalationThreshold,
    }
  }

  // ---------------------------------------------------------------- teacher side

  createTeacherSession(): { token: string; expiresAt: number } {
    const token = randomToken()
    const expiresAt = Date.now() + config.teacherSessionHours * 3600_000
    this.pruneTeacherSessions()
    this.state.teacherSessions.push({ tokenHash: hashToken(token), expiresAt })
    this.persist()
    return { token, expiresAt }
  }

  isTeacher(token: string | undefined | null): boolean {
    if (!token || token.length > 200) return false
    const h = hashToken(token)
    return this.state.teacherSessions.some((s) => s.tokenHash === h && s.expiresAt > Date.now())
  }

  endTeacherSession(token: string | undefined | null) {
    if (!token) return
    const h = hashToken(token)
    this.state.teacherSessions = this.state.teacherSessions.filter((s) => s.tokenHash !== h)
    this.persist()
  }

  private pruneTeacherSessions() {
    const now = Date.now()
    this.state.teacherSessions = this.state.teacherSessions.filter((s) => s.expiresAt > now)
  }

  configure(input: ExamConfigInput) {
    const exam = this.state.exam
    if (exam.status !== 'not_started') {
      throw new ExamError('not_editable', 'Settings can only be changed before the examination opens.')
    }
    const clampMinutes = (v: unknown) => {
      const n = Number(v)
      if (!Number.isInteger(n) || n < 0 || n > 24 * 60) throw new ExamError('invalid_input', 'Invalid minutes value.', 400)
      return n
    }
    if (input.durationMinutes !== undefined) exam.durationMinutes = clampMinutes(input.durationMinutes)
    if (input.admissionWindowMinutes !== undefined) exam.admissionWindowMinutes = clampMinutes(input.admissionWindowMinutes)
    if (input.scheduledOpenAt !== undefined) {
      if (input.scheduledOpenAt === null) {
        exam.scheduledOpenAt = null
      } else {
        const t = Number(input.scheduledOpenAt)
        if (!Number.isFinite(t) || t <= Date.now() || t > Date.now() + 7 * 24 * 3600_000) {
          throw new ExamError('invalid_input', 'Choose an opening time in the future.', 400)
        }
        exam.scheduledOpenAt = t
      }
    }
    this.changed()
  }

  open() {
    const exam = this.state.exam
    if (exam.status === 'ended') {
      throw new ExamError('exam_ended', 'This examination has ended. Start a new session first.')
    }
    if (exam.status === 'active') {
      // Opening an already active examination simply re-opens admission.
      this.reopenAccess()
      return
    }
    const now = Date.now()
    exam.status = 'active'
    exam.admissionOpen = true
    exam.openedAt = now
    exam.scheduledOpenAt = null
    exam.endsAt = exam.durationMinutes > 0 ? now + exam.durationMinutes * 60_000 : null
    exam.admissionClosesAt = exam.admissionWindowMinutes > 0 ? now + exam.admissionWindowMinutes * 60_000 : null
    this.admitConnectedWaiting()
    this.changed()
  }

  closeAccess() {
    const exam = this.state.exam
    if (exam.status !== 'active') throw new ExamError('not_active', 'The examination is not active.')
    if (!exam.admissionOpen) return
    exam.admissionOpen = false
    exam.admissionClosesAt = null
    this.changed()
  }

  reopenAccess() {
    const exam = this.state.exam
    if (exam.status !== 'active') throw new ExamError('not_active', 'The examination is not active.')
    exam.admissionOpen = true
    exam.admissionClosesAt = null // manual reopen overrides any automatic window
    this.admitConnectedWaiting()
    this.changed()
  }

  end(reason: 'teacher' | 'time' = 'teacher') {
    const exam = this.state.exam
    if (exam.status === 'ended') return
    exam.status = 'ended'
    exam.admissionOpen = false
    exam.endedAt = Date.now()
    exam.endReason = reason
    exam.scheduledOpenAt = null
    exam.admissionClosesAt = null
    this.changed()
  }

  startNewSession() {
    if (this.state.exam.status !== 'ended') {
      throw new ExamError('not_ended', 'End the current examination before starting a new session.')
    }
    const prevId = this.state.exam.id
    this.state.exam = newSession(this.state.exam)
    // Keep the previous session's devices (so their screens still show "ended"); drop anything older.
    this.state.devices = this.state.devices.filter((d) => d.sessionId === prevId || this.isConnected(d.id))
    this.state.events = this.state.events.filter((e) => e.sessionId === prevId)
    this.changed()
  }

  removeDevice(deviceId: string) {
    const device = this.currentDevices().find((d) => d.id === deviceId)
    if (!device) throw new ExamError('not_found', 'Device not found.', 404)
    device.status = 'removed'
    this.changed()
  }

  /** Called every second: applies scheduled opening, automatic admission close and time limit. */
  tick() {
    const exam = this.state.exam
    const now = Date.now()
    if (exam.status === 'not_started' && exam.scheduledOpenAt && now >= exam.scheduledOpenAt) {
      this.open()
    } else if (exam.status === 'active') {
      if (exam.endsAt && now >= exam.endsAt) {
        this.end('time')
      } else if (exam.admissionOpen && exam.admissionClosesAt && now >= exam.admissionClosesAt) {
        this.closeAccess()
      }
    }
  }

  teacherSnapshot(): TeacherSnapshot {
    const exam = this.state.exam
    const devices = this.currentDevices()
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((d) => ({
        id: d.id,
        label: d.label,
        kind: d.kind,
        status: d.status,
        connected: this.isConnected(d.id),
        joinedAt: d.joinedAt,
        admittedAt: d.admittedAt,
        violations: d.violations,
        lastEventAt: d.lastEventAt,
      }))
    const labels = new Map(devices.map((d) => [d.id, d.label]))
    const events = this.state.events
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
    const displayStatus =
      exam.status === 'ended'
        ? 'ended'
        : exam.status === 'active'
          ? exam.admissionOpen
            ? 'active'
            : 'access_closed'
          : exam.scheduledOpenAt
            ? 'scheduled'
            : 'not_started'
    return {
      exam: {
        id: exam.id,
        title: config.examTitle,
        documentName: config.pdfFileName,
        status: exam.status,
        displayStatus,
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
        flagged: devices.filter((d) => d.violations >= config.escalationThreshold).length,
      },
      escalationThreshold: config.escalationThreshold,
      serverTime: Date.now(),
    }
  }
}
