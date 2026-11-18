import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { MdArrowForward, MdVerifiedUser } from 'react-icons/md'
import { cx } from '../lib/format.ts'

export type Tone = 'accent' | 'success' | 'warning' | 'error' | 'neutral'

const chipTone: Record<Tone, string> = {
  accent: 'bg-accent/15 border-accent/30 text-accent',
  success: 'bg-success/15 border-success/30 text-success',
  warning: 'bg-warning/15 border-warning/30 text-warning',
  error: 'bg-error/15 border-error/30 text-error',
  neutral: 'bg-surface-container border-outline text-on-surface-variant',
}

const dotTone: Record<Tone, string> = {
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
  neutral: 'bg-on-surface-variant',
}

/** Warm ambient glow used behind hero sections (no heavy gradients). */
export function Ambient() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
      <div className="absolute left-1/2 top-1/4 h-[480px] w-[780px] max-w-[120vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/5 blur-[120px]" />
      <div className="absolute -top-32 right-1/4 h-[340px] w-[420px] rounded-full bg-[#3d2117]/30 blur-[100px]" />
      <div className="absolute bottom-0 left-1/2 h-[320px] w-full -translate-x-1/2 bg-gradient-to-t from-surface/60 to-transparent" />
    </div>
  )
}

export function BrandMark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <div
      className={cx(
        'flex shrink-0 items-center justify-center rounded-full border border-outline bg-surface-container text-accent',
        size === 'sm' ? 'h-7 w-7' : 'h-8 w-8',
      )}
    >
      <MdVerifiedUser className={size === 'sm' ? 'text-[16px]' : 'text-[18px]'} aria-hidden="true" />
    </div>
  )
}

export function Brand({ subtitle = 'CSOK Jesma Edition' }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-3">
      <BrandMark />
      <div className="flex items-baseline gap-2">
        <span className="text-title-md font-semibold tracking-tight text-on-surface">ExamSecure</span>
        <span className="hidden text-label-sm font-medium text-on-surface-variant sm:inline">{subtitle}</span>
      </div>
    </div>
  )
}

export function Dot({ tone, pulse = false, className }: { tone: Tone; pulse?: boolean; className?: string }) {
  return <span className={cx('inline-block h-2 w-2 shrink-0 rounded-full', dotTone[tone], pulse && 'animate-pulse', className)} />
}

export function StatusChip({
  tone,
  children,
  pulse = false,
  icon,
  className,
}: {
  tone: Tone
  children: ReactNode
  pulse?: boolean
  icon?: ReactNode
  className?: string
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-label-sm font-semibold',
        chipTone[tone],
        className,
      )}
    >
      {icon ?? <Dot tone={tone} pulse={pulse} />}
      {children}
    </span>
  )
}

interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode
  loading?: boolean
  size?: 'md' | 'lg'
}

/** Signature primary action: dark pill with an orange circular icon anchor. */
export function PillButton({ icon, loading, size = 'lg', children, className, disabled, ...rest }: PillButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'group inline-flex items-center gap-3 rounded-full border border-outline bg-surface-container/90 pl-2.5 text-on-surface shadow-lg transition-all duration-150 ease-standard',
        'hover:border-accent/70 hover:shadow-accent/5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-outline',
        size === 'lg' ? 'py-2.5 pr-7' : 'py-2 pr-6',
        className,
      )}
    >
      <span
        className={cx(
          'flex shrink-0 items-center justify-center rounded-full bg-accent text-ink shadow-sm transition-transform duration-150 ease-standard group-hover:translate-x-1 group-disabled:translate-x-0',
          size === 'lg' ? 'h-9 w-9' : 'h-8 w-8',
        )}
      >
        {loading ? <Spinner className="h-4 w-4 border-ink/30 border-t-ink" /> : (icon ?? <MdArrowForward className="text-[20px]" />)}
      </span>
      <span className="text-title-md font-semibold uppercase tracking-wider">{children}</span>
    </button>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cx('inline-block h-5 w-5 animate-spin rounded-full border-2 border-outline-variant border-t-accent', className)}
    />
  )
}

export function FullScreenMessage({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <Ambient />
      <div className="relative z-10 flex flex-col items-center gap-4 animate-fade-in">{children}</div>
    </div>
  )
}

export function SiteFooter({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <footer className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 border-t border-outline/40 px-6 py-6 text-label-sm text-on-surface-variant sm:flex-row">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        <span>{left}</span>
      </div>
      {right && <div className="flex items-center gap-4 font-code text-code-sm">{right}</div>}
    </footer>
  )
}

const modalTone: Record<'warning' | 'error' | 'neutral', { border: string; badge: string; eyebrow: string }> = {
  warning: { border: 'border-warning/50', badge: 'bg-warning/10 border-warning/30 text-warning', eyebrow: 'text-warning' },
  error: { border: 'border-error/50', badge: 'bg-error/10 border-error/30 text-error', eyebrow: 'text-error' },
  neutral: { border: 'border-outline-variant', badge: 'bg-accent/10 border-accent/30 text-accent', eyebrow: 'text-accent' },
}

export function Modal({
  open,
  tone = 'neutral',
  icon,
  eyebrow,
  title,
  children,
  actions,
  footnote,
  onClose,
}: {
  open: boolean
  tone?: 'warning' | 'error' | 'neutral'
  icon: ReactNode
  eyebrow?: string
  title: string
  children?: ReactNode
  actions: ReactNode
  footnote?: ReactNode
  onClose?: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const t = modalTone[tone]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/85 p-4 backdrop-blur-md animate-fade-in">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={cx(
          'relative flex w-full max-w-md flex-col items-center rounded-2xl border bg-surface-container p-8 text-center shadow-2xl animate-surface-enter',
          t.border,
        )}
      >
        <div className={cx('mb-5 flex h-16 w-16 items-center justify-center rounded-full border text-[32px]', t.badge)}>{icon}</div>
        {eyebrow && <span className={cx('mb-1 text-label-sm font-semibold uppercase tracking-widest', t.eyebrow)}>{eyebrow}</span>}
        <h2 id="modal-title" className="mb-3 text-headline-md font-semibold text-on-surface">
          {title}
        </h2>
        {children && <div className="mb-6 text-pretty text-body-md text-on-surface-variant">{children}</div>}
        <div className="flex w-full flex-col gap-3">{actions}</div>
        {footnote && <div className="mt-4 font-code text-code-sm text-on-surface-variant">{footnote}</div>}
      </div>
    </div>
  )
}

const solidTone = {
  warning: 'bg-warning text-ink hover:bg-warning/90',
  error: 'bg-error text-on-surface hover:bg-error/90',
  accent: 'bg-accent text-ink hover:brightness-110',
  ghost: 'bg-transparent border border-outline text-on-surface-variant hover:text-on-surface hover:border-outline-variant',
}

export function ModalButton({
  tone,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone: keyof typeof solidTone }) {
  return (
    <button
      {...rest}
      className={cx(
        'w-full rounded-full py-3 text-label-lg font-semibold uppercase shadow-lg transition-all duration-150 ease-standard hover:scale-[1.01] disabled:opacity-60',
        solidTone[tone],
        className,
      )}
    />
  )
}
