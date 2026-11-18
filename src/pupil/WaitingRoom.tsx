import type { ReactNode } from 'react'
import {
  MdArrowBack,
  MdBlock,
  MdDoneAll,
  MdGppBad,
  MdHourglassTop,
  MdInfoOutline,
  MdLock,
  MdLockOpen,
} from 'react-icons/md'
import { Ambient, BrandMark, StatusChip, SiteFooter, type Tone } from '../components/ui.tsx'
import { cx, formatShortTime } from '../lib/format.ts'
import type { PupilSession } from './usePupilSession.ts'

type View = 'waiting' | 'released' | 'closed' | 'ended' | 'removed'

interface ViewConfig {
  tone: Tone
  icon: ReactNode
  chip: string
  line1: string
  line2: string
  line2Class: string
  body: string
  badgeClass: string
}

const VIEWS: Record<View, ViewConfig> = {
  waiting: {
    tone: 'accent',
    icon: <MdHourglassTop />,
    chip: 'Session standby',
    line1: 'You’re in.',
    line2: 'Just waiting for your teacher.',
    line2Class: 'text-editorial-cream',
    body: 'The examination has not been opened yet. Please remain on this page. Your examination paper will become available automatically when your teacher starts the session.',
    badgeClass: 'border-accent/40 text-accent',
  },
  released: {
    tone: 'success',
    icon: <MdLockOpen />,
    chip: 'Examination open',
    line1: 'Paper released.',
    line2: 'Opening your paper…',
    line2Class: 'text-success',
    body: 'Your teacher has opened the examination. Your secure viewer is loading now.',
    badgeClass: 'border-success/40 bg-[#142318] text-success',
  },
  closed: {
    tone: 'warning',
    icon: <MdBlock />,
    chip: 'Admission closed',
    line1: 'Access closed.',
    line2: 'New devices can’t join right now.',
    line2Class: 'text-warning',
    body: 'Your teacher has closed admission for new devices. Please stay on this page and raise your hand — if your teacher reopens access, you will join automatically.',
    badgeClass: 'border-warning/40 bg-[#261e16] text-warning',
  },
  ended: {
    tone: 'error',
    icon: <MdDoneAll />,
    chip: 'Session concluded',
    line1: 'Examination ended.',
    line2: 'Pens down.',
    line2Class: 'text-editorial-cream',
    body: 'Your teacher has ended this examination. Please hand in your answer sheet as instructed and wait quietly for further instructions.',
    badgeClass: 'border-error/40 bg-[#261616] text-error',
  },
  removed: {
    tone: 'error',
    icon: <MdGppBad />,
    chip: 'Access removed',
    line1: 'Access removed.',
    line2: 'Please speak to your teacher.',
    line2Class: 'text-error',
    body: 'Your teacher has removed this device from the examination. The paper is no longer available on this device.',
    badgeClass: 'border-error/40 bg-[#261616] text-error',
  },
}

export function WaitingRoom({ session }: { session: PupilSession }) {
  const { state, releasing, exam } = session

  let view: View
  if (!session.deviceId) view = exam.status === 'ended' ? 'ended' : 'closed'
  else if (releasing) view = 'released'
  else if (state?.phase === 'access_closed') view = 'closed'
  else if (state?.phase === 'ended') view = 'ended'
  else if (state?.phase === 'removed') view = 'removed'
  else view = 'waiting'

  const v = VIEWS[view]
  const scheduledOpenAt = state?.exam.scheduledOpenAt ?? exam.scheduledOpenAt
  const live = view === 'waiting' || view === 'released'
  const canLeave = view === 'waiting' || view === 'ended' || (view === 'closed' && !session.deviceId)

  return (
    <div className="relative flex min-h-screen flex-col justify-between overflow-x-hidden">
      <Ambient />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 pb-4 pt-8">
        <div className="flex items-center gap-3">
          {canLeave ? (
            <button
              type="button"
              onClick={session.reset}
              title={view === 'waiting' ? 'Leave the waiting room' : 'Back to start'}
              aria-label={view === 'waiting' ? 'Leave the waiting room' : 'Back to start'}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-outline bg-surface-container text-accent transition-colors duration-150 hover:border-accent"
            >
              <MdArrowBack className="text-[18px]" />
            </button>
          ) : (
            <BrandMark />
          )}
          <div className="flex items-baseline gap-2">
            <span className="text-title-md font-semibold tracking-tight text-on-surface">ExamSecure</span>
            <span className="hidden text-label-sm font-medium text-on-surface-variant sm:inline">CSOK Jesma Edition</span>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-outline bg-surface-container/60 px-3.5 py-1.5 text-label-sm text-on-surface-variant">
          <span className="h-2 w-2 rounded-full bg-success" />
          <span>Live</span>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-12 text-center">
        <div
          key={view}
          className="relative flex w-full flex-col items-center rounded-2xl border border-outline bg-surface-container/60 p-8 shadow-xl backdrop-blur-sm animate-surface-enter sm:p-12"
        >
          <div className="relative mb-8 flex items-center justify-center" aria-hidden="true">
            {live && (
              <>
                <div className="pointer-events-none absolute h-24 w-24 rounded-full bg-accent/10 animate-soft-ping" />
                <div className="absolute h-20 w-20 rounded-full bg-accent/15 blur-sm" />
              </>
            )}
            <div
              className={cx(
                'relative z-10 flex h-16 w-16 items-center justify-center rounded-full border bg-surface-container text-[30px] shadow-inner',
                v.badgeClass,
              )}
            >
              {v.icon}
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
            <StatusChip tone={v.tone} pulse={live}>
              {v.chip}
            </StatusChip>
            {state?.device && <span className="font-code text-code-sm tabular-nums text-on-surface-variant">{state.device.label}</span>}
          </div>

          <h1 className="mb-4 tracking-tight">
            <span className="block text-balance text-headline-xl-mobile font-semibold leading-tight text-on-surface sm:text-headline-xl">
              {v.line1}
            </span>
            <span
              className={cx(
                'mt-1 block text-balance font-display text-[34px] font-semibold italic leading-tight sm:text-[50px]',
                v.line2Class,
              )}
            >
              {v.line2}
            </span>
          </h1>

          <p className="mx-auto mb-10 max-w-lg text-pretty text-body-lg text-on-surface-variant">{v.body}</p>

          <div className="flex w-full max-w-md flex-col items-center gap-4 border-t border-outline/60 pt-6">
            {view === 'waiting' && scheduledOpenAt && (
              <p className="text-label-lg text-on-surface">
                Scheduled to open at <span className="font-code text-accent">{formatShortTime(scheduledOpenAt)}</span>
              </p>
            )}
            <div className="flex flex-wrap items-center justify-center gap-3 text-label-sm text-on-surface-variant">
              <span className="h-2 w-2 rounded-full bg-success" />
              <span>{session.deviceId ? 'Live updates active' : 'You’ll join automatically if access reopens'}</span>
              <span>•</span>
              <MdLock className="text-[15px] text-accent" aria-hidden="true" />
              <span>Secure session</span>
            </div>
            {view === 'ended' && (
              <button
                type="button"
                onClick={session.reset}
                className="mt-2 rounded-full border border-outline px-5 py-2 text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant transition-colors duration-150 hover:border-outline-variant hover:text-on-surface"
              >
                Back to start
              </button>
            )}
          </div>
        </div>

        {(live || view === 'closed') && (
          <div className="mt-8 flex items-center gap-2 text-label-sm text-on-surface-variant">
            <MdInfoOutline className="shrink-0 text-[16px] text-accent" aria-hidden="true" />
            <span>Do not close or switch browser tabs. Focus monitoring starts automatically when your paper opens.</span>
          </div>
        )}
      </main>

      <SiteFooter left="CSOK Jesma Edition • Examination waiting room" right={<span>Answers go on your separate answer sheet</span>} />
    </div>
  )
}
