import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  MdBlock,
  MdChevronLeft,
  MdChevronRight,
  MdFitScreen,
  MdFullscreen,
  MdFullscreenExit,
  MdGppBad,
  MdTimer,
  MdVisibilityOff,
  MdWarningAmber,
  MdZoomIn,
  MdZoomOut,
} from 'react-icons/md'
import { BrandMark, Modal, ModalButton } from '../components/ui.tsx'
import { cx, formatCountdown } from '../lib/format.ts'
import { useNow } from '../lib/useNow.ts'
import { COUNTED_EVENTS, type SecurityEventType } from '../shared/types.ts'
import { PdfDocument } from './PdfDocument.tsx'
import { useExamSecurity } from './useExamSecurity.ts'
import type { PupilSession } from './usePupilSession.ts'

const ZOOM_STEPS = [0.6, 0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2, 2.5]
/** iPhone Safari has no element full-screen API, so the button is hidden there. */
const CAN_FULLSCREEN = typeof document !== 'undefined' && Boolean(document.fullscreenEnabled)

export function ExamViewer({ session }: { session: PupilSession }) {
  const { state, deviceId, reportEvent } = session
  const scrollRef = useRef<HTMLDivElement>(null)
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [zoomIndex, setZoomIndex] = useState(ZOOM_STEPS.indexOf(1))
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [localViolations, setLocalViolations] = useState(0)

  const onSecurityEvent = useCallback(
    (type: SecurityEventType) => {
      if (COUNTED_EVENTS.has(type)) setLocalViolations((n) => n + 1)
      reportEvent(type)
    },
    [reportEvent],
  )
  const security = useExamSecurity(onSecurityEvent, true)

  const violations = Math.max(state?.device?.violations ?? 0, localViolations)
  const threshold = state?.escalationThreshold ?? 3
  const serious = violations >= threshold

  // ---- timer --------------------------------------------------------------------------
  const endsAt = state?.exam.endsAt ?? null
  const now = useNow(1000, endsAt !== null)
  const remaining = endsAt !== null ? endsAt - now : null

  // ---- page tracking ------------------------------------------------------------------
  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const marker = el.scrollTop + el.clientHeight * 0.35
    let page = 1
    for (const node of el.querySelectorAll<HTMLElement>('[data-page]')) {
      if (node.offsetTop <= marker) page = Number(node.dataset.page)
      else break
    }
    setCurrentPage(page)
  }, [])

  const goToPage = useCallback((page: number) => {
    const el = scrollRef.current
    const target = el?.querySelector<HTMLElement>(`[data-page="${page}"]`)
    if (el && target) el.scrollTo({ top: target.offsetTop - 24, behavior: 'smooth' })
  }, [])

  // Keep the reading position (page) stable when zooming.
  const changeZoom = (nextIndex: number) => {
    const page = currentPage
    setZoomIndex(Math.max(0, Math.min(ZOOM_STEPS.length - 1, nextIndex)))
    requestAnimationFrame(() => requestAnimationFrame(() => goToPage(page)))
  }

  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void document.documentElement.requestFullscreen?.().catch(() => {})
  }

  const hidePaper = security.away
  const timeLow = remaining !== null && remaining <= 5 * 60_000

  if (!deviceId || !state?.device) return null

  return (
    <div className="exam-locked flex h-dvh flex-col overflow-hidden bg-ink" onContextMenu={(e) => e.preventDefault()}>
      {/* ------------------------------------------------------------------ top bar */}
      <header className="relative z-30 flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2.5 border-b border-outline bg-surface px-3 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] shadow-md sm:px-6 sm:py-3">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex items-center gap-2.5">
            <BrandMark size="sm" />
            <span className="hidden text-title-md font-semibold tracking-tight text-on-surface sm:inline">ExamSecure</span>
          </div>
          <div className="hidden h-4 w-px bg-outline md:block" />
          <span className="hidden max-w-[28ch] truncate text-label-sm font-semibold text-on-surface lg:inline" title={state.exam.title}>
            {state.exam.title}
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-label-sm font-medium text-success">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
            <span className="hidden sm:inline">Secure session</span>
            <span className="sm:hidden">Secure</span>
          </span>
        </div>

        {/* page & zoom controls (own row on small screens) */}
        <div className="order-last flex w-full justify-center lg:order-none lg:w-auto">
        <div className="flex items-center gap-1 rounded-full border border-outline bg-ink px-2 py-1 sm:gap-2 sm:px-3 sm:py-1.5">
          <IconButton label="Previous page" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}>
            <MdChevronLeft className="text-[18px]" />
          </IconButton>
          <div className="px-1 font-code text-code-sm font-medium tabular-nums text-on-surface sm:px-2" aria-live="polite">
            Page <span className="font-semibold text-accent">{currentPage}</span> of {numPages || '–'}
          </div>
          <IconButton label="Next page" disabled={numPages === 0 || currentPage >= numPages} onClick={() => goToPage(currentPage + 1)}>
            <MdChevronRight className="text-[18px]" />
          </IconButton>
          <div className="mx-1 h-3 w-px bg-outline" />
          <IconButton label="Zoom out" disabled={zoomIndex === 0} onClick={() => changeZoom(zoomIndex - 1)}>
            <MdZoomOut className="text-[17px]" />
          </IconButton>
          <button
            type="button"
            onClick={() => changeZoom(ZOOM_STEPS.indexOf(1))}
            title="Fit to width"
            className="flex min-w-[52px] items-center justify-center gap-1 rounded-full px-1.5 py-1 font-code text-code-sm tabular-nums text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
          >
            {ZOOM_STEPS[zoomIndex] === 1 ? <MdFitScreen className="text-[15px]" /> : null}
            {Math.round(ZOOM_STEPS[zoomIndex] * 100)}%
          </button>
          <IconButton label="Zoom in" disabled={zoomIndex === ZOOM_STEPS.length - 1} onClick={() => changeZoom(zoomIndex + 1)}>
            <MdZoomIn className="text-[17px]" />
          </IconButton>
        </div>
        </div>

        <div className="flex items-center gap-3">
          {remaining !== null && (
            <div
              className={cx(
                'flex items-center gap-2 rounded-full border bg-surface-container px-3.5 py-1.5',
                timeLow ? 'border-warning/50 text-warning' : 'border-accent/30 text-accent',
              )}
              title="Time remaining"
            >
              <MdTimer className="text-[17px]" aria-hidden="true" />
              <span className="font-code text-code-sm font-semibold tabular-nums tracking-wider">{formatCountdown(remaining)}</span>
            </div>
          )}
          {CAN_FULLSCREEN && (
            <IconButton label={isFullscreen ? 'Exit full screen' : 'Full screen'} onClick={toggleFullscreen} bordered>
              {isFullscreen ? <MdFullscreenExit className="text-[18px]" /> : <MdFullscreen className="text-[18px]" />}
            </IconButton>
          )}
        </div>
      </header>

      {/* ------------------------------------------------------------------ document */}
      <main
        ref={scrollRef}
        onScroll={onScroll}
        className="relative flex-1 overflow-auto overscroll-contain bg-ink px-2 py-4 [-webkit-overflow-scrolling:touch] sm:px-8 sm:py-8"
      >
        <PdfDocument
          zoom={ZOOM_STEPS[zoomIndex]}
          watermark={state.device.label}
          hidden={hidePaper}
          scrollRef={scrollRef}
          onLoaded={setNumPages}
        />
        {numPages > 0 && (
          <p className="mx-auto mt-8 max-w-md pb-4 text-center text-label-sm text-on-surface-variant">
            End of paper · Write all answers on your separate answer sheet.
          </p>
        )}
      </main>

      {/* privacy shield while the pupil is away */}
      {hidePaper && !security.prompt && (
        <div className="pointer-events-none fixed inset-x-0 bottom-12 top-16 z-20 flex items-center justify-center p-6">
          <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-outline bg-surface-container/95 p-6 text-center shadow-2xl animate-surface-enter">
            <MdVisibilityOff className="text-[28px] text-warning" aria-hidden="true" />
            <p className="text-title-md font-semibold text-on-surface">Paper hidden</p>
            <p className="text-body-sm text-on-surface-variant">Return to this window to continue your examination.</p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ status strip */}
      <footer className="relative z-30 flex shrink-0 items-center justify-between gap-4 border-t border-outline bg-surface px-4 py-2 font-code text-code-sm text-on-surface-variant sm:px-6">
        <div className="flex items-center gap-3 overflow-hidden whitespace-nowrap sm:gap-4">
          <span className={cx('flex items-center gap-1.5', security.away ? 'text-warning' : 'text-success')}>
            <span className={cx('h-1.5 w-1.5 rounded-full', security.away ? 'bg-warning' : 'bg-success')} />
            FOCUS MONITOR: ACTIVE
          </span>
          <span className="hidden md:inline">•</span>
          <span className="hidden md:inline">COPYING: DISABLED</span>
          <span className="hidden md:inline">•</span>
          <span className="hidden md:inline">PRINTING: DISABLED</span>
        </div>
        <div className="flex items-center gap-3 whitespace-nowrap">
          <span>
            VIOLATIONS: <span className={cx('font-bold', violations > 0 ? (serious ? 'text-error' : 'text-warning') : 'text-on-surface')}>{violations}</span>
          </span>
          <span className="hidden sm:inline">•</span>
          <span className="hidden sm:inline">{state.device.label}</span>
        </div>
      </footer>

      {/* transient notice for blocked shortcuts */}
      {security.notice && (
        <div className="pointer-events-none fixed bottom-14 left-1/2 z-40 -translate-x-1/2 animate-surface-enter">
          <div className="flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container px-4 py-2 text-label-sm text-on-surface shadow-xl">
            <MdBlock className="text-[16px] text-warning" aria-hidden="true" />
            {security.notice}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ warnings */}
      <Modal
        open={security.prompt === 'focus' && !serious}
        tone="warning"
        icon={<MdWarningAmber />}
        eyebrow="Security alert"
        title="Stay in your examination."
        actions={
          <ModalButton tone="warning" data-autofocus onClick={security.dismiss}>
            Return to examination
          </ModalButton>
        }
        footnote={`Warning ${violations} of ${threshold} · recorded for your teacher`}
      >
        You have left the examination environment. This activity has been recorded. Repeated violations may result in
        removal.
      </Modal>

      <Modal
        open={(security.prompt === 'focus' || security.prompt === 'screenshot') && serious}
        tone="error"
        icon={<MdGppBad />}
        eyebrow="Serious warning"
        title="Your teacher has been notified."
        actions={
          <ModalButton tone="error" data-autofocus onClick={security.dismiss}>
            Return to examination
          </ModalButton>
        }
        footnote={`${violations} violations recorded · ${state.device.label}`}
      >
        You have repeatedly left the examination environment. Your teacher has been alerted and may remove you from the
        examination. Stay on this screen until you have finished.
      </Modal>

      <Modal
        open={security.prompt === 'screenshot' && !serious}
        tone="warning"
        icon={<MdWarningAmber />}
        eyebrow="Security alert"
        title="Screenshots are not permitted."
        actions={
          <ModalButton tone="warning" data-autofocus onClick={security.dismiss}>
            Return to examination
          </ModalButton>
        }
        footnote="Recorded for your teacher"
      >
        Capturing the examination paper is not allowed. This attempt has been recorded.
      </Modal>

      <Modal
        open={security.prompt === 'back'}
        tone={serious ? 'error' : 'warning'}
        icon={<MdBlock />}
        eyebrow="Navigation restricted"
        title="You can’t leave the examination."
        actions={
          <ModalButton tone={serious ? 'error' : 'warning'} data-autofocus onClick={security.dismiss}>
            Return to examination
          </ModalButton>
        }
        footnote="This attempt has been recorded"
      >
        Leaving the examination environment is restricted while your examination is in progress. Your paper stays open
        until your teacher ends the session.
      </Modal>
    </div>
  )
}

function IconButton({
  label,
  onClick,
  disabled,
  bordered,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  bordered?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'flex items-center justify-center rounded-full text-on-surface-variant transition-colors duration-150 hover:text-on-surface disabled:pointer-events-none disabled:opacity-30',
        bordered ? 'h-8 w-8 border border-outline bg-ink hover:border-outline-variant' : 'h-7 w-7 hover:bg-surface-container',
      )}
    >
      {children}
    </button>
  )
}
