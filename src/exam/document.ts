import { EXAM_TITLE } from '../config.ts'

/**
 * The examination paper is the single PDF in the project's /docs folder (or /Docs).
 * Vite bundles it as a hashed static asset at build time — nothing is uploaded or modified.
 */
const found = import.meta.glob(['/docs/*.pdf', '/Docs/*.pdf'], {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const paths = [...new Set(Object.keys(found))].sort()

if (paths.length === 0) {
  throw new Error('No examination PDF found. Place exactly one PDF in the /docs folder.')
}
if (paths.length > 1) {
  console.warn(`[ExamSecure] ${paths.length} PDFs found in /docs; using ${paths[0]}.`)
}

export const EXAM_PDF_URL: string = found[paths[0]]
export const EXAM_PDF_NAME: string = paths[0].split('/').pop() ?? 'exam.pdf'

export const EXAM_DOCUMENT_TITLE: string =
  EXAM_TITLE ??
  EXAM_PDF_NAME.replace(/\.pdf$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
