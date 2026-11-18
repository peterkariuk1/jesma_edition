import { TeacherDashboard } from './TeacherDashboard.tsx'
import { TeacherLogin } from './TeacherLogin.tsx'
import { useTeacherSession } from './useTeacherSession.ts'

export function TeacherApp() {
  const session = useTeacherSession()
  return session.auth === 'signed_in' ? <TeacherDashboard session={session} /> : <TeacherLogin session={session} />
}
