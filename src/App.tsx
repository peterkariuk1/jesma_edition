import { useEffect } from 'react'
import { startExamClock } from './exam/store.ts'
import { usePath } from './lib/router.ts'
import { PupilApp } from './pupil/PupilApp.tsx'
import { TeacherApp } from './teacher/TeacherApp.tsx'

export default function App() {
  const path = usePath()
  // Scheduled opening, automatic admission close and the time limit run in whichever tabs are open.
  useEffect(() => startExamClock(), [])
  return path.startsWith('/teacher') ? <TeacherApp /> : <PupilApp />
}
