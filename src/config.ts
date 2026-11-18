/**
 * ExamSecure application configuration.
 *
 * NOTE: this is a frontend-only application. Everything here — including the teacher
 * access code — ships inside the public JavaScript bundle and can be read by anyone who
 * inspects it. The code keeps casual users out of the dashboard; it is NOT strong authentication.
 */

/** Teacher access code (case-sensitive). */
export const TEACHER_ACCESS_CODE = '12345678bcd#'

/** How long a teacher stays signed in on a browser tab. */
export const TEACHER_SESSION_HOURS = 12

/**
 * Optional examination title. When null, the title is derived from the PDF file name in /docs.
 * Example: 'CSOK Jesma Edition — Standard 8 Paper 1'
 */
export const EXAM_TITLE: string | null = null

export const EXAM_DEFAULTS = {
  /** Default time limit in minutes (0 = none). The teacher can change it before opening. */
  durationMinutes: 0,
  /** Default automatic close of new-device admission after opening, in minutes (0 = manual only). */
  admissionWindowMinutes: 0,
  /** Violations at which pupils see the serious warning and the teacher is alerted prominently. */
  escalationThreshold: 3,
} as const
