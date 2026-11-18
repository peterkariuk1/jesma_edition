import { useLayoutEffect } from 'react'
import { navigate } from '../lib/router.ts'
import { ExamViewer } from './ExamViewer.tsx'
import { Landing } from './Landing.tsx'
import { usePupilSession } from './usePupilSession.ts'
import { WaitingRoom } from './WaitingRoom.tsx'

type Screen = 'landing' | 'waiting' | 'exam'

const SCREEN_PATH: Record<Screen, string> = {
  landing: '/',
  waiting: '/waiting',
  exam: '/exam',
}

/**
 * The pupil journey: landing → waiting room → secure viewer.
 * The screen is derived from the examination state only — typing /exam in the
 * address bar never shows the viewer unless this device has been admitted.
 */
export function PupilApp() {
  const session = usePupilSession()
  const { deviceId, state, refusal, releasing } = session

  let screen: Screen
  if (!deviceId) screen = refusal ? 'waiting' : 'landing'
  else if (state?.phase === 'admitted' && !releasing) screen = 'exam'
  else screen = 'waiting'

  // Layout effect: the URL must be correct before child effects run (the viewer pins its history guard to it).
  useLayoutEffect(() => {
    navigate(SCREEN_PATH[screen], { replace: true })
  }, [screen])

  switch (screen) {
    case 'landing':
      return <Landing session={session} />
    case 'waiting':
      return <WaitingRoom session={session} />
    case 'exam':
      return <ExamViewer session={session} />
  }
}
