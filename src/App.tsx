import { usePath } from './lib/router.ts'
import { PupilApp } from './pupil/PupilApp.tsx'
import { TeacherApp } from './teacher/TeacherApp.tsx'

export default function App() {
  const path = usePath()
  return path.startsWith('/teacher') ? <TeacherApp /> : <PupilApp />
}
