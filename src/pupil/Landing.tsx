import { MdErrorOutline, MdKey, MdLock } from 'react-icons/md'
import { Ambient, Brand, PillButton, SiteFooter } from '../components/ui.tsx'
import { navigate } from '../lib/router.ts'
import type { PupilSession } from './usePupilSession.ts'

export function Landing({ session }: { session: PupilSession }) {
  return (
    <div className="relative flex min-h-screen flex-col justify-between overflow-x-hidden">
      <Ambient />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 pb-4 pt-8">
        <Brand subtitle="CSOK Edition" />
        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-2 rounded-full border border-outline bg-surface-container/60 px-3.5 py-1.5 text-label-sm text-on-surface-variant sm:flex">
            <span className="h-2 w-2 rounded-full bg-success" />
            <span>Club session</span>
          </div>
          <button
            type="button"
            onClick={() => navigate('/teacher')}
            className="inline-flex items-center gap-2 rounded-full border border-outline bg-surface-container/80 px-4 py-1.5 text-label-sm text-on-surface-variant transition-colors duration-150 hover:border-outline-variant hover:text-on-surface"
          >
            <MdKey className="text-[16px]" aria-hidden="true" />
            <span>Teacher access</span>
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-6 py-12 text-center">
        <div className="flex w-full flex-col items-center px-0 py-8 animate-surface-enter sm:px-12">
          <span className="mb-8 inline-flex items-center gap-2 rounded-full border border-outline bg-surface-container/60 px-3.5 py-1 text-label-sm font-medium uppercase tracking-widest text-on-surface-variant">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            CSOK Jesma Edition
          </span>

          <h1 className="mb-6 tracking-tight">
            <span className="block text-balance text-headline-xl-mobile font-semibold leading-tight text-on-surface sm:text-display-lg">
              Your examination.
            </span>
            <span className="mt-1 block font-display text-[44px] font-semibold italic leading-tight text-editorial-cream sm:text-[68px]">
              One secure space.
            </span>
          </h1>

          <p className="mx-auto mb-10 max-w-xl text-pretty text-body-lg text-on-surface-variant">
            Press start and stay on the next screen. Your examination paper opens automatically as soon as your teacher
            starts the session.
          </p>

          <div className="flex flex-col items-center gap-4">
            <PillButton type="button" onClick={session.register} id="btn-start-exam">
              Start exam
            </PillButton>

            {session.joinError ? (
              <p role="alert" className="flex items-center gap-1.5 pt-2 text-label-sm text-error animate-fade-in">
                <MdErrorOutline className="text-[16px]" aria-hidden="true" />
                {session.joinError}
              </p>
            ) : (
              <div className="flex items-center gap-1.5 pt-2 text-label-sm text-on-surface-variant">
                <MdLock className="text-[16px] text-accent" aria-hidden="true" />
                <span>Secure examination environment</span>
              </div>
            )}
          </div>
        </div>
      </main>

      <SiteFooter
        left="CSOK Examination Board • Jesma Academic Evaluation Series"
        right={
          <>
            <span>No sign-in required</span>
            <span>•</span>
            <span>Teacher-controlled session</span>
          </>
        }
      />
    </div>
  )
}
