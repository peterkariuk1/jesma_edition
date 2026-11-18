import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Load .env if present (Node >= 20.12 / 22). Real environment variables take precedence.
try {
  process.loadEnvFile(path.join(ROOT, '.env'))
} catch {
  /* no .env file – defaults apply */
}

const env = process.env

function intFromEnv(name: string, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const raw = env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < min || n > max) {
    console.warn(`[config] Ignoring invalid ${name}="${raw}", using ${fallback}`)
    return fallback
  }
  return n
}

/** Find a top-level folder case-insensitively (e.g. "Docs" or "docs"). */
function findFolder(name: string): string | null {
  const match = fs
    .readdirSync(ROOT, { withFileTypes: true })
    .find((e) => e.isDirectory() && e.name.toLowerCase() === name.toLowerCase())
  return match ? path.join(ROOT, match.name) : null
}

/** Locate the single examination PDF inside the Docs folder. */
function findExamPdf(): { filePath: string; fileName: string } {
  const docsDir = findFolder('docs')
  if (!docsDir) {
    throw new Error('No "Docs" folder found in the project root. Place the examination PDF inside Docs/.')
  }
  const pdfs = fs
    .readdirSync(docsDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.pdf'))
    .map((e) => e.name)
    .sort()
  if (pdfs.length === 0) {
    throw new Error(`No PDF found in ${docsDir}. Place the examination PDF there.`)
  }
  if (pdfs.length > 1) {
    console.warn(`[config] ${pdfs.length} PDFs found in Docs/, expected one. Using "${pdfs[0]}".`)
  }
  return { filePath: path.join(docsDir, pdfs[0]), fileName: pdfs[0] }
}

function titleFromFileName(fileName: string): string {
  return fileName
    .replace(/\.pdf$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const pdf = findExamPdf()

export const config = {
  port: intFromEnv('PORT', 3001, 1, 65535),
  host: env.HOST || '0.0.0.0',
  /** Teacher access code. Verified on the server only; never sent to the browser. */
  teacherCode: env.TEACHER_ACCESS_CODE || '12345678abcd#',
  teacherSessionHours: intFromEnv('TEACHER_SESSION_HOURS', 12, 1, 24 * 7),
  examTitle: env.EXAM_TITLE?.trim() || titleFromFileName(pdf.fileName),
  pdfPath: pdf.filePath,
  pdfFileName: pdf.fileName,
  /** Default examination time limit in minutes (0 = no limit). Teacher can change it before opening. */
  defaultDurationMinutes: intFromEnv('EXAM_DURATION_MINUTES', 0, 0, 24 * 60),
  /** Default automatic close of new-device admission after opening, in minutes (0 = manual only). */
  defaultAdmissionWindowMinutes: intFromEnv('ADMISSION_WINDOW_MINUTES', 0, 0, 24 * 60),
  /** Violations at which pupils see the serious warning and the teacher is alerted prominently. */
  escalationThreshold: intFromEnv('VIOLATION_ESCALATION_THRESHOLD', 3, 1, 100),
  cookieSecure: env.COOKIE_SECURE === 'true',
  dataFile: path.join(ROOT, 'server', 'data', 'state.json'),
  distDir: path.join(ROOT, 'dist'),
  pdfjsDir: path.join(ROOT, 'node_modules', 'pdfjs-dist'),
  serveClient: process.argv.includes('--prod') || env.NODE_ENV === 'production',
}

if (!env.TEACHER_ACCESS_CODE) {
  console.warn('[config] TEACHER_ACCESS_CODE not set – using the development default. Set it in .env before a real examination.')
}
