import { FullScreenMessage, Spinner } from '../components/ui.tsx'
import { TeacherDashboard } from './TeacherDashboard.tsx'
import { TeacherLogin } from './TeacherLogin.tsx'
import { useTeacherSession } from './useTeacherSession.ts'

export function TeacherApp() {
  const session = useTeacherSession()
  if (session.auth === 'checking') {
    return (
      <FullScreenMessage>
        <Spinner className="h-8 w-8" />
      </FullScreenMessage>
    )
  }
  return session.auth === 'signed_in' ? <TeacherDashboard session={session} /> : <TeacherLogin session={session} />
}
