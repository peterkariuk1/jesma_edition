import { useState, type FormEvent } from 'react'
import { MdArrowBack, MdErrorOutline, MdKey, MdVerified, MdVisibility, MdVisibilityOff } from 'react-icons/md'
import { Ambient, PillButton, SiteFooter } from '../components/ui.tsx'
import { navigate } from '../lib/router.ts'
import type { TeacherSession } from './useTeacherSession.ts'

export function TeacherLogin({ session }: { session: TeacherSession }) {
  const [code, setCode] = useState('')
  const [reveal, setReveal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!code) {
      setError('Enter your teacher access code.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await session.login(code)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That access code is not correct.')
      setCode('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col justify-between overflow-x-hidden">
      <Ambient />
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 pb-4 pt-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label="Back to start"
            title="Back to start"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-outline bg-surface-container text-accent transition-colors duration-150 hover:border-accent"
          >
            <MdArrowBack className="text-[18px]" />
          </button>
          <div className="flex items-baseline gap-2">
            <span className="text-title-md font-semibold tracking-tight text-on-surface">ExamSecure</span>
            <span className="hidden text-label-sm font-medium text-on-surface-variant sm:inline">Teacher access</span>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div className="flex w-full flex-col items-center animate-surface-enter">
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full border border-outline bg-surface-container text-accent">
            <MdKey className="text-[28px]" aria-hidden="true" />
          </div>
          <h1 className="mb-2 text-headline-xl-mobile font-semibold text-on-surface sm:text-headline-xl">
            Teacher <span className="font-display italic text-editorial-cream">access</span>
          </h1>
          <p className="mb-8 text-pretty text-body-md text-on-surface-variant">
            Enter your access code to open the examination, admit devices and monitor the session.
          </p>

          <form onSubmit={submit} className="flex w-full flex-col gap-4" noValidate>
            <div className="relative">
              <label htmlFor="teacher-code" className="sr-only">
                Teacher access code
              </label>
              <input
                id="teacher-code"
                type={reveal ? 'text' : 'password'}
                autoComplete="current-password"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
                value={code}
                onChange={(e) => {
                  setCode(e.target.value)
                  if (error) setError(null)
                }}
                placeholder="Access code"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'teacher-code-error' : undefined}
                className={`w-full rounded-xl border bg-surface-container px-12 py-3.5 text-center font-code text-[15px] tracking-wider text-on-surface outline-none transition-colors duration-150 placeholder:font-sans placeholder:tracking-normal placeholder:text-on-surface-variant focus:border-accent ${
                  error ? 'border-error/70' : 'border-outline'
                }`}
              />
              <button
                type="button"
                onClick={() => setReveal((r) => !r)}
                aria-label={reveal ? 'Hide code' : 'Show code'}
                className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:text-on-surface"
              >
                {reveal ? <MdVisibilityOff className="text-[18px]" /> : <MdVisibility className="text-[18px]" />}
              </button>
            </div>

            {error && (
              <p id="teacher-code-error" role="alert" className="flex items-center justify-center gap-1.5 text-label-sm text-error animate-fade-in">
                <MdErrorOutline className="text-[16px]" aria-hidden="true" />
                {error}
              </p>
            )}

            <PillButton type="submit" loading={submitting} icon={<MdVerified className="text-[18px]" />} size="md" className="w-full justify-center">
              Continue
            </PillButton>
          </form>
          <p className="mt-6 text-label-sm text-on-surface-variant">The access code is case-sensitive.</p>
        </div>
      </main>

      <SiteFooter left="CSOK Jesma Edition • Invigilation control" />
    </div>
  )
}
