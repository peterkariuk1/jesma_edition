import { useLayoutEffect } from 'react'
import { FullScreenMessage, Spinner } from '../components/ui.tsx'
import { navigate } from '../lib/router.ts'
import { ExamViewer } from './ExamViewer.tsx'
import { Landing } from './Landing.tsx'
import { usePupilSession } from './usePupilSession.ts'
import { WaitingRoom } from './WaitingRoom.tsx'

type Screen = 'landing' | 'loading' | 'waiting' | 'exam'

const SCREEN_PATH: Record<Exclude<Screen, 'loading'>, string> = {
  landing: '/',
  waiting: '/waiting',
  exam: '/exam',
}

/**
 * The pupil journey: landing → waiting room → secure viewer.
 * The screen is chosen from server-confirmed state only — typing /exam in the
 * address bar never shows the viewer unless the server says the device is admitted.
 */
export function PupilApp() {
  const session = usePupilSession()
  const { token, state, refusal, releasing } = session

  let screen: Screen
  if (!token) screen = refusal ? 'waiting' : 'landing'
  else if (!state) screen = 'loading'
  else if (state.phase === 'admitted' && !releasing) screen = 'exam'
  else screen = 'waiting'

  // Layout effect: the URL must be correct before child effects run (the viewer pins its history guard to it).
  useLayoutEffect(() => {
    if (screen !== 'loading') navigate(SCREEN_PATH[screen], { replace: true })
  }, [screen])

  switch (screen) {
    case 'landing':
      return <Landing session={session} />
    case 'loading':
      return (
        <FullScreenMessage>
          <Spinner className="h-8 w-8" />
          <p className="text-body-md text-on-surface-variant">
            {session.everConnected || session.connected
              ? 'Restoring your examination session…'
              : 'Connecting to the examination server…'}
          </p>
        </FullScreenMessage>
      )
    case 'waiting':
      return <WaitingRoom session={session} />
    case 'exam':
      return <ExamViewer session={session} />
  }
}
