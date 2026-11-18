/**
 * Types shared by the examination engine and the UI.
 * Keep this file free of runtime imports.
 */

export type ExamStatus = 'not_started' | 'active' | 'ended'

/** What the teacher dashboard shows as the headline examination status. */
export type ExamDisplayStatus = 'not_started' | 'scheduled' | 'active' | 'access_closed' | 'ended'

export type DeviceStatus = 'waiting' | 'admitted' | 'removed'

export type DeviceKind = 'desktop' | 'tablet' | 'mobile'

/**
 * The phase a pupil device is in, derived on the server.
 * - waiting:       registered, examination not open yet
 * - admitted:      allowed to view the paper
 * - access_closed: registered but new-device admission closed before it was admitted
 * - removed:       removed by the teacher
 * - ended:         examination ended / session no longer valid
 * - invalid:       unknown device token
 */
export type PupilPhase = 'waiting' | 'admitted' | 'access_closed' | 'removed' | 'ended' | 'invalid'

export type SecurityEventType =
  | 'tab_hidden'
  | 'window_blur'
  | 'back_navigation'
  | 'screenshot_key'
  | 'blocked_shortcut'
  | 'fullscreen_exit'

export const SECURITY_EVENT_LABELS: Record<SecurityEventType, string> = {
  tab_hidden: 'Switched tab or app',
  window_blur: 'Left the exam window',
  back_navigation: 'Tried to navigate away',
  screenshot_key: 'Screenshot key pressed',
  blocked_shortcut: 'Blocked shortcut',
  fullscreen_exit: 'Exited full screen',
}

/** Event types that count towards the violation total. */
export const COUNTED_EVENTS: ReadonlySet<SecurityEventType> = new Set<SecurityEventType>([
  'tab_hidden',
  'window_blur',
  'back_navigation',
  'screenshot_key',
])

export interface PublicExamInfo {
  title: string
  status: ExamStatus
  admissionOpen: boolean
  scheduledOpenAt: number | null
  endsAt: number | null
}

export interface PupilState {
  phase: PupilPhase
  device: { id: string; label: string; violations: number; admittedAt: number | null } | null
  exam: PublicExamInfo
  escalationThreshold: number
}

export interface TeacherDevice {
  id: string
  label: string
  kind: DeviceKind
  status: DeviceStatus
  connected: boolean
  joinedAt: number
  admittedAt: number | null
  violations: number
  lastEventAt: number | null
}

export interface TeacherEvent {
  id: string
  deviceId: string
  deviceLabel: string
  type: SecurityEventType
  at: number
  violations: number
}

export interface TeacherExamInfo {
  id: string
  title: string
  documentName: string
  status: ExamStatus
  displayStatus: ExamDisplayStatus
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

export interface TeacherSnapshot {
  exam: TeacherExamInfo
  devices: TeacherDevice[]
  events: TeacherEvent[]
  counts: { waiting: number; admitted: number; connected: number; flagged: number }
  escalationThreshold: number
}

export interface TeacherAlert {
  deviceId: string
  deviceLabel: string
  type: SecurityEventType
  violations: number
  serious: boolean
}

export interface ExamConfigInput {
  durationMinutes?: number
  admissionWindowMinutes?: number
  scheduledOpenAt?: number | null
}
