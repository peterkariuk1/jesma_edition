import { useState, type ReactNode } from 'react'
import {
  MdCheckCircle,
  MdClose,
  MdDesktopWindows,
  MdDevices,
  MdGppBad,
  MdLockClock,
  MdLockOpen,
  MdLogout,
  MdPhoneIphone,
  MdPlayCircle,
  MdRestartAlt,
  MdSchedule,
  MdShield,
  MdStopCircle,
  MdTabletMac,
  MdTune,
  MdWarningAmber,
} from 'react-icons/md'
import { Ambient, Brand, Dot, Modal, ModalButton, SiteFooter, Spinner, StatusChip, type Tone } from '../components/ui.tsx'
import { cx, formatClock, formatShortTime } from '../lib/format.ts'
import {
  SECURITY_EVENT_LABELS,
  type DeviceKind,
  type ExamDisplayStatus,
  type TeacherDevice,
  type TeacherSnapshot,
} from '../shared/types.ts'
import type { TeacherSession } from './useTeacherSession.ts'

const STATUS: Record<ExamDisplayStatus, { tone: Tone; label: string }> = {
  not_started: { tone: 'neutral', label: 'Not started' },
  scheduled: { tone: 'accent', label: 'Scheduled' },
  active: { tone: 'success', label: 'Active · accepting devices' },
  access_closed: { tone: 'warning', label: 'Active · new device access closed' },
  ended: { tone: 'error', label: 'Ended' },
}

const ADMISSION_OPTIONS = [0, 5, 10, 15, 30]
const DURATION_OPTIONS = [0, 30, 45, 60, 90, 120, 150, 180]

type Confirm = { kind: 'end' } | { kind: 'remove'; device: TeacherDevice } | null

export function TeacherDashboard({ session }: { session: TeacherSession }) {
  const { snapshot, connected, busy, action, actionError, setActionError } = session
  const [confirm, setConfirm] = useState<Confirm>(null)

  if (!snapshot) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  const { exam, counts } = snapshot
  const status = STATUS[exam.displayStatus]
  const notStarted = exam.status === 'not_started'
  const active = exam.status === 'active'
  const ended = exam.status === 'ended'

  return (
    <div className="relative flex min-h-screen flex-col justify-between overflow-x-hidden">
      <Ambient />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 pb-4 pt-8">
        <Brand subtitle="Teacher control" />
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 rounded-full border border-outline bg-surface-container/60 px-3.5 py-1.5 text-label-sm text-on-surface-variant sm:flex">
            <Dot tone={connected ? 'success' : 'error'} pulse={!connected} />
            {connected ? 'Live updates' : 'Reconnecting…'}
          </span>
          <button
            type="button"
            onClick={() => void session.logout()}
            className="inline-flex items-center gap-2 rounded-full border border-outline bg-surface-container/80 px-4 py-1.5 text-label-sm text-on-surface-variant transition-colors duration-150 hover:border-outline-variant hover:text-on-surface"
          >
            <MdLogout className="text-[16px]" aria-hidden="true" />
            Sign out
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-6 animate-fade-in">
        {/* -------------------------------------------------------------- status & controls */}
        <section className="flex flex-col justify-between gap-6 rounded-2xl border border-outline bg-surface-container p-6 xl:flex-row xl:items-center">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <StatusChip tone={status.tone} pulse={active}>
                {status.label}
                {exam.displayStatus === 'scheduled' && exam.scheduledOpenAt ? ` · opens ${formatShortTime(exam.scheduledOpenAt)}` : ''}
              </StatusChip>
              <span className="font-code text-code-sm text-on-surface-variant">SESSION {exam.id.slice(0, 8).toUpperCase()}</span>
            </div>
            <h1 className="text-balance break-words text-headline-md font-semibold text-on-surface sm:text-headline-lg">
              {exam.title}
            </h1>
            <p className="text-body-md text-on-surface-variant">
              {ended
                ? `Ended ${exam.endedAt ? formatShortTime(exam.endedAt) : ''}${exam.endReason === 'time' ? ' · time limit reached' : ''}`
                : active && exam.openedAt
                  ? `Opened ${formatShortTime(exam.openedAt)}${exam.endsAt ? ` · ends ${formatShortTime(exam.endsAt)}` : ' · no time limit'}`
                  : 'Pupils who press Start Exam wait here until you open the examination.'}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-3">
            {ended ? (
              <ActionButton variant="primary" icon={<MdRestartAlt />} busy={busy === 'new'} onClick={() => void action('new', '/api/teacher/new-session')}>
                Start new session
              </ActionButton>
            ) : (
              <ActionButton
                variant={active ? 'done' : 'primary'}
                icon={active ? <MdCheckCircle /> : <MdPlayCircle />}
                disabled={active}
                busy={busy === 'open'}
                onClick={() => void action('open', '/api/teacher/open')}
              >
                {active ? 'Examination open' : 'Open examination'}
              </ActionButton>
            )}

            {active && !exam.admissionOpen ? (
              <ActionButton variant="primary" icon={<MdLockOpen />} busy={busy === 'reopen'} onClick={() => void action('reopen', '/api/teacher/reopen-access')}>
                Reopen access
              </ActionButton>
            ) : (
              <ActionButton
                variant="warning"
                icon={<MdLockClock />}
                disabled={!active}
                busy={busy === 'close'}
                onClick={() => void action('close', '/api/teacher/close-access')}
              >
                Close new device access
              </ActionButton>
            )}

            <ActionButton variant="danger" icon={<MdStopCircle />} disabled={!active} busy={busy === 'end'} onClick={() => setConfirm({ kind: 'end' })}>
              End examination
            </ActionButton>
          </div>
        </section>

        {actionError && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-body-sm text-error animate-surface-enter">
            <span className="flex items-center gap-2">
              <MdWarningAmber className="text-[18px]" aria-hidden="true" />
              {actionError}
            </span>
            <button type="button" aria-label="Dismiss" onClick={() => setActionError(null)} className="text-error/80 hover:text-error">
              <MdClose className="text-[18px]" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* -------------------------------------------------------------- left column */}
          <div className="flex flex-col gap-6 lg:col-span-4">
            <div className="grid grid-cols-3 gap-3">
              <Metric label="Waiting" value={counts.waiting} hint={notStarted ? 'Ready' : 'In lobby'} />
              <Metric label="Admitted" value={counts.admitted} hint={`${counts.connected} online`} tone="success" />
              <Metric label="Flagged" value={counts.flagged} hint={`${snapshot.escalationThreshold}+ alerts`} tone={counts.flagged > 0 ? 'warning' : undefined} />
            </div>

            <Settings snapshot={snapshot} session={session} />

            <AlertsPanel snapshot={snapshot} />
          </div>

          {/* -------------------------------------------------------------- devices */}
          <div className="lg:col-span-8">
            <DevicesPanel snapshot={snapshot} onRemove={(device) => setConfirm({ kind: 'remove', device })} />
          </div>
        </div>
      </main>

      <SiteFooter
        left="CSOK Jesma Edition • Invigilation control"
        right={<span className="truncate">PAPER: {exam.documentName}</span>}
      />

      <Toasts session={session} />

      <Modal
        open={confirm?.kind === 'end'}
        tone="error"
        icon={<MdStopCircle />}
        eyebrow="Confirm"
        title="End the examination?"
        onClose={() => setConfirm(null)}
        actions={
          <>
            <ModalButton
              tone="error"
              disabled={busy === 'end'}
              onClick={async () => {
                await action('end', '/api/teacher/end')
                setConfirm(null)
              }}
            >
              End examination
            </ModalButton>
            <ModalButton tone="ghost" data-autofocus onClick={() => setConfirm(null)}>
              Cancel
            </ModalButton>
          </>
        }
      >
        The paper closes immediately on all {counts.admitted} admitted {counts.admitted === 1 ? 'device' : 'devices'} and every
        pupil sees the examination-ended screen. Device sessions are invalidated.
      </Modal>

      <Modal
        open={confirm?.kind === 'remove'}
        tone="error"
        icon={<MdGppBad />}
        eyebrow="Confirm"
        title={`Remove ${confirm?.kind === 'remove' ? confirm.device.label : ''}?`}
        onClose={() => setConfirm(null)}
        actions={
          <>
            <ModalButton
              tone="error"
              disabled={busy === 'remove'}
              onClick={async () => {
                if (confirm?.kind === 'remove') await action('remove', `/api/teacher/devices/${confirm.device.id}/remove`)
                setConfirm(null)
              }}
            >
              Remove device
            </ModalButton>
            <ModalButton tone="ghost" data-autofocus onClick={() => setConfirm(null)}>
              Cancel
            </ModalButton>
          </>
        }
      >
        The paper closes on this device immediately and it cannot rejoin this session.
        {confirm?.kind === 'remove' && confirm.device.violations > 0 && (
          <span className="mt-2 block text-warning">
            {confirm.device.violations} violation{confirm.device.violations === 1 ? '' : 's'} recorded.
          </span>
        )}
      </Modal>
    </div>
  )
}

// ---------------------------------------------------------------------------- pieces

function ActionButton({
  variant,
  icon,
  busy,
  disabled,
  onClick,
  children,
}: {
  variant: 'primary' | 'warning' | 'danger' | 'done'
  icon: ReactNode
  busy?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  const styles = {
    primary: 'bg-accent text-ink shadow-sm hover:brightness-110 border border-accent',
    warning: 'bg-ink border border-warning/50 text-warning hover:bg-warning/10',
    danger: 'bg-ink border border-error/50 text-error hover:bg-error/10',
    done: 'border border-success/40 bg-success/10 text-success disabled:!opacity-100',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={cx(
        'flex items-center gap-2 whitespace-nowrap rounded-full px-5 py-2.5 text-label-lg font-semibold uppercase transition-all duration-150 ease-standard',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:brightness-100',
        styles[variant],
      )}
    >
      {busy ? <Spinner className="h-[18px] w-[18px] border-current/30 border-t-current" /> : <span className="text-[18px]">{icon}</span>}
      {children}
    </button>
  )
}

function Metric({ label, value, hint, tone }: { label: string; value: number; hint: string; tone?: 'success' | 'warning' }) {
  return (
    <div className="rounded-2xl border border-outline bg-surface-container p-4">
      <span className="text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">{label}</span>
      <div className={cx('mt-1 text-headline-lg font-bold tabular-nums', tone === 'warning' ? 'text-warning' : 'text-on-surface')}>{value}</div>
      <span className={cx('mt-0.5 block truncate text-label-sm', tone === 'success' ? 'text-success' : 'text-on-surface-variant')}>{hint}</span>
    </div>
  )
}

function Panel({ icon, title, subtitle, aside, children }: { icon: ReactNode; title: string; subtitle?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex h-full flex-col rounded-2xl border border-outline bg-surface-container p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-title-lg font-semibold text-on-surface">
            <span className="text-[20px] text-accent">{icon}</span>
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-body-sm text-on-surface-variant">{subtitle}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}

function nextOccurrence(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!m) return null
  const d = new Date()
  d.setHours(Number(m[1]), Number(m[2]), 0, 0)
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1)
  return d.getTime()
}

function Settings({ snapshot, session }: { snapshot: TeacherSnapshot; session: TeacherSession }) {
  const { exam } = snapshot
  const editable = exam.status === 'not_started'
  const [mode, setMode] = useState<'immediate' | 'scheduled'>(exam.scheduledOpenAt ? 'scheduled' : 'immediate')
  const [time, setTime] = useState('')
  const save = (body: object) => session.action('config', '/api/teacher/config', body)

  const selectClass =
    'w-full rounded-lg border border-outline bg-ink px-3 py-2 text-label-lg font-medium text-on-surface outline-none transition-colors focus:border-accent disabled:opacity-60'

  return (
    <Panel icon={<MdTune />} title="Session settings" subtitle={editable ? 'Optional. Applied when you open the examination.' : 'Locked while the session is running.'}>
      <div className="space-y-4">
        <div>
          <span className="mb-1.5 block text-label-sm font-medium text-on-surface-variant">Opening</span>
          <div className="grid grid-cols-2 gap-2">
            {(['immediate', 'scheduled'] as const).map((m) => (
              <button
                key={m}
                type="button"
                disabled={!editable}
                onClick={() => {
                  setMode(m)
                  if (m === 'immediate' && exam.scheduledOpenAt) void save({ scheduledOpenAt: null })
                }}
                className={cx(
                  'rounded-lg border bg-ink px-3 py-2 text-center text-label-sm transition-colors disabled:opacity-60',
                  mode === m ? 'border-accent font-semibold text-accent' : 'border-outline text-on-surface-variant hover:border-outline-variant',
                )}
              >
                {m === 'immediate' ? 'When I click open' : 'At a set time'}
              </button>
            ))}
          </div>
          {mode === 'scheduled' && editable && (
            <div className="mt-2 flex items-center gap-2 animate-fade-in">
              {exam.scheduledOpenAt ? (
                <div className="flex w-full items-center justify-between rounded-lg border border-accent/30 bg-warm-badge px-3 py-2 text-label-sm text-accent">
                  <span className="flex items-center gap-2">
                    <MdSchedule className="text-[16px]" aria-hidden="true" />
                    Opens automatically at {formatShortTime(exam.scheduledOpenAt)}
                  </span>
                  <button type="button" className="font-semibold hover:underline" onClick={() => void save({ scheduledOpenAt: null })}>
                    Clear
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    aria-label="Opening time"
                    className="w-full rounded-lg border border-outline bg-ink px-3 py-2 font-code text-code-sm text-on-surface outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    disabled={!time}
                    onClick={() => {
                      const at = nextOccurrence(time)
                      if (at) void save({ scheduledOpenAt: at })
                    }}
                    className="whitespace-nowrap rounded-lg bg-accent px-4 py-2 text-label-sm font-semibold text-ink transition-all hover:brightness-110 disabled:opacity-40"
                  >
                    Set time
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <label className="block">
          <span className="mb-1.5 block text-label-sm font-medium text-on-surface-variant">Close new device access automatically</span>
          <select
            className={selectClass}
            disabled={!editable}
            value={exam.admissionWindowMinutes}
            onChange={(e) => void save({ admissionWindowMinutes: Number(e.target.value) })}
          >
            {ADMISSION_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m === 0 ? 'Never (I’ll close it myself)' : `${m} minutes after opening`}
              </option>
            ))}
          </select>
          {exam.admissionClosesAt && (
            <span className="mt-1.5 block text-body-sm text-warning">Closes at {formatShortTime(exam.admissionClosesAt)}</span>
          )}
        </label>

        <label className="block">
          <span className="mb-1.5 block text-label-sm font-medium text-on-surface-variant">Time limit</span>
          <select
            className={selectClass}
            disabled={!editable}
            value={exam.durationMinutes}
            onChange={(e) => void save({ durationMinutes: Number(e.target.value) })}
          >
            {DURATION_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m === 0 ? 'No time limit' : `${m} minutes`}
              </option>
            ))}
          </select>
          <span className="mt-1.5 block text-body-sm text-on-surface-variant">
            {exam.endsAt ? `Ends automatically at ${formatShortTime(exam.endsAt)}.` : 'Shown as a countdown to pupils when set.'}
          </span>
        </label>

        <div className="rounded-lg border border-accent/20 bg-warm-badge p-3.5 text-body-sm text-accent">
          <span className="mb-0.5 flex items-center gap-1.5 font-semibold">
            <MdShield className="text-[15px]" aria-hidden="true" /> Integrity monitoring
          </span>
          Tab switching, leaving the window and back navigation are recorded on admitted devices. Nobody is removed
          automatically — you decide.
        </div>
      </div>
    </Panel>
  )
}

function AlertsPanel({ snapshot }: { snapshot: TeacherSnapshot }) {
  const events = snapshot.events.filter((e) => e.type !== 'blocked_shortcut').slice(0, 8)
  return (
    <Panel icon={<MdWarningAmber />} title="Security alerts" subtitle="Most recent first.">
      {events.length === 0 ? (
        <p className="rounded-lg border border-dashed border-outline px-4 py-6 text-center text-body-sm text-on-surface-variant">No alerts recorded.</p>
      ) : (
        <ul className="divide-y divide-outline/40">
          {events.map((e) => {
            const serious = e.violations >= snapshot.escalationThreshold
            return (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-code text-code-sm text-on-surface">{e.deviceLabel}</p>
                  <p className={cx('truncate text-body-sm', serious ? 'text-error' : 'text-warning')}>{SECURITY_EVENT_LABELS[e.type]}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-code text-code-sm tabular-nums text-on-surface-variant">{formatClock(e.at)}</p>
                  <p className="text-label-sm text-on-surface-variant">#{e.violations}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

const KIND_ICON: Record<DeviceKind, ReactNode> = {
  desktop: <MdDesktopWindows />,
  tablet: <MdTabletMac />,
  mobile: <MdPhoneIphone />,
}

function DevicesPanel({ snapshot, onRemove }: { snapshot: TeacherSnapshot; onRemove: (d: TeacherDevice) => void }) {
  const { devices, escalationThreshold } = snapshot
  return (
    <Panel
      icon={<MdDevices />}
      title="Connected devices"
      subtitle="Real-time device register. No pupil names or accounts."
      aside={
        <span className="whitespace-nowrap rounded-full border border-outline bg-ink px-2.5 py-1 font-code text-code-sm tabular-nums text-on-surface-variant">
          {devices.length} joined
        </span>
      }
    >
      {devices.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-outline px-6 py-16 text-center">
          <MdDevices className="text-[32px] text-outline-variant" aria-hidden="true" />
          <p className="text-title-md text-on-surface">No devices yet</p>
          <p className="max-w-xs text-body-sm text-on-surface-variant">Devices appear here as soon as pupils press Start Exam.</p>
        </div>
      ) : (
        <div className="-mx-6 overflow-x-auto px-6">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-outline/60 text-label-sm uppercase tracking-wider text-on-surface-variant">
                <th className="py-3 font-medium">Device</th>
                <th className="py-3 font-medium">Status</th>
                <th className="py-3 font-medium">Connection</th>
                <th className="py-3 font-medium">Joined</th>
                <th className="py-3 font-medium">Security</th>
                <th className="py-3 text-right font-medium">Control</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline/40 text-label-sm">
              {devices.map((d) => {
                const flagged = d.violations >= escalationThreshold
                return (
                  <tr key={d.id} className={cx('transition-colors hover:bg-ink/50', flagged && 'bg-error/5')}>
                    <td className="py-3.5">
                      <span className="flex items-center gap-2 font-code text-code-sm text-on-surface">
                        <span className="text-[16px] text-on-surface-variant">{KIND_ICON[d.kind]}</span>
                        {d.label}
                      </span>
                    </td>
                    <td className="py-3.5">
                      {d.status === 'admitted' ? (
                        <span className="text-on-surface">Admitted</span>
                      ) : d.status === 'waiting' ? (
                        <span className="text-accent">Waiting</span>
                      ) : (
                        <span className="text-error">Removed</span>
                      )}
                    </td>
                    <td className="py-3.5">
                      <span className={cx('inline-flex items-center gap-1.5', d.connected ? 'text-success' : 'text-on-surface-variant')}>
                        <Dot tone={d.connected ? 'success' : 'neutral'} className="h-1.5 w-1.5" />
                        {d.connected ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td className="py-3.5 font-code text-code-sm tabular-nums text-on-surface-variant">{formatClock(d.joinedAt)}</td>
                    <td className="py-3.5">
                      {d.violations === 0 ? (
                        <span className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-success">Clean</span>
                      ) : (
                        <span
                          className={cx(
                            'rounded-full border px-2 py-0.5',
                            flagged ? 'border-error/40 bg-error/10 text-error' : 'border-warning/30 bg-warning/10 text-warning',
                          )}
                        >
                          {d.violations} violation{d.violations === 1 ? '' : 's'}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 text-right">
                      {d.status !== 'removed' && (
                        <button type="button" onClick={() => onRemove(d)} className="text-on-surface-variant transition-colors hover:text-error">
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

function Toasts({ session }: { session: TeacherSession }) {
  if (session.toasts.length === 0) return null
  return (
    <div className="fixed bottom-4 right-4 z-40 flex w-[340px] max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="assertive">
      {session.toasts.map((t) => (
        <div
          key={t.key}
          className={cx(
            'flex items-start gap-3 rounded-xl border bg-surface-container p-4 shadow-2xl animate-surface-enter',
            t.serious ? 'border-error/50' : 'border-warning/40',
          )}
        >
          <span className={cx('mt-0.5 text-[20px]', t.serious ? 'text-error' : 'text-warning')}>{t.serious ? <MdGppBad /> : <MdWarningAmber />}</span>
          <div className="min-w-0 flex-1">
            <p className="text-label-lg font-semibold text-on-surface">
              {t.serious ? 'Repeated violations' : 'Security alert'} · <span className="font-code">{t.deviceLabel}</span>
            </p>
            <p className="text-body-sm text-on-surface-variant">
              {SECURITY_EVENT_LABELS[t.type]} · {t.violations} recorded{t.serious ? '. Consider removing this device.' : ''}
            </p>
          </div>
          <button type="button" aria-label="Dismiss" onClick={() => session.dismissToast(t.key)} className="text-on-surface-variant hover:text-on-surface">
            <MdClose className="text-[16px]" />
          </button>
        </div>
      ))}
    </div>
  )
}
