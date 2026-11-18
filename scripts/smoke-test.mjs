/**
 * End-to-end smoke test for the ExamSecure backend.
 *
 *   npm run test:smoke                 (server must be running, default http://localhost:3001)
 *   BASE_URL=http://localhost:5173 TEACHER_ACCESS_CODE=... npm run test:smoke
 *
 * WARNING: this drives the real examination state (opens, ends and resets the session).
 * Never run it against a server while an examination is in progress.
 */
import { io } from 'socket.io-client'

const BASE = process.env.BASE_URL ?? 'http://localhost:3001'
const CODE = process.env.TEACHER_ACCESS_CODE ?? '12345678abcd#'
let cookie = ''
let failures = 0

const ok = (cond, name) => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}`)
  if (!cond) failures++
}

async function req(path, { method = 'GET', body, token, teacher = false } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(teacher && cookie ? { Cookie: cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const setCookie = res.headers.get('set-cookie')
  if (setCookie && teacher) cookie = setCookie.split(';')[0]
  const type = res.headers.get('content-type') ?? ''
  const data = type.includes('json') ? await res.json() : res.status === 204 ? null : Buffer.from(await res.arrayBuffer())
  return { status: res.status, data, headers: res.headers }
}

const teacher = (path, body) => req(path, { method: 'POST', body: body ?? {}, teacher: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function pupilSocket(token) {
  const s = io(BASE, { auth: { role: 'pupil', token }, transports: ['websocket'] })
  s.states = []
  s.on('pupil:state', (st) => s.states.push(st))
  return s
}

async function waitFor(fn, ms = 3000) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    if (fn()) return true
    await sleep(50)
  }
  return false
}

const lastPhase = (s) => s.states.at(-1)?.phase

async function main() {
  console.log(`\nExamSecure smoke test → ${BASE}\n`)

  console.log('Landing & routing')
  const home = await req('/')
  ok(home.status === 200 && String(home.data).includes('<div id="root">'), 'GET / serves the app')

  console.log('Teacher authentication')
  ok((await req('/api/teacher/state')).status === 401, 'teacher API rejects unauthenticated requests')
  ok((await teacher('/api/teacher/login', { code: 'wrong' })).status === 401, 'incorrect code is rejected')
  ok((await teacher('/api/teacher/login', { code: CODE.toUpperCase() })).status === 401, 'code is case-sensitive')
  const login = await teacher('/api/teacher/login', { code: CODE })
  ok(login.status === 200 && cookie.startsWith('examsecure_teacher='), 'correct code creates an HttpOnly session cookie')
  const js = await req('/')
  ok(!String(js.data).includes(CODE), 'teacher code not present in served HTML')

  // Reset to a fresh, not-started session.
  let snap = (await req('/api/teacher/state', { teacher: true })).data
  if (snap.exam.status === 'active') snap = (await teacher('/api/teacher/end')).data
  if (snap.exam.status === 'ended') snap = (await teacher('/api/teacher/new-session')).data
  ok(snap.exam.status === 'not_started', 'session is not started')

  const teacherSocket = io(BASE, { auth: { role: 'teacher' }, extraHeaders: { Cookie: cookie }, transports: ['polling', 'websocket'] })
  const alerts = []
  teacherSocket.on('teacher:alert', (a) => alerts.push(a))

  console.log('Waiting room')
  const a = await req('/api/pupil/register', { method: 'POST' })
  ok(a.status === 201 && a.data.state.phase === 'waiting', 'START EXAM registers a waiting device')
  const tokenA = a.data.token
  const sockA = pupilSocket(tokenA)
  ok(await waitFor(() => lastPhase(sockA) === 'waiting'), 'pupil socket receives waiting state')
  ok((await req('/api/exam/document', { token: tokenA })).status === 403, 'waiting device cannot fetch the PDF')
  ok((await req('/api/exam/document')).status === 403, 'no token cannot fetch the PDF')
  ok((await req('/api/exam/document', { token: 'forged-token' })).status === 403, 'forged token cannot fetch the PDF')

  console.log('Opening the examination')
  snap = (await teacher('/api/teacher/open')).data
  ok(snap.exam.status === 'active' && snap.exam.admissionOpen, 'teacher opens the examination')
  ok(await waitFor(() => lastPhase(sockA) === 'admitted'), 'waiting pupil is admitted in real time')
  const doc = await req('/api/exam/document', { token: tokenA })
  ok(doc.status === 200 && doc.data.subarray(0, 5).toString() === '%PDF-', 'admitted device receives the actual PDF')
  ok(doc.headers.get('cache-control')?.includes('no-store'), 'PDF response is not cacheable')

  const b = await req('/api/pupil/register', { method: 'POST' })
  ok(b.status === 201 && b.data.state.phase === 'admitted', 'new device joins while admission is open')
  const tokenB = b.data.token

  console.log('Closing new-device access')
  snap = (await teacher('/api/teacher/close-access')).data
  ok(snap.exam.displayStatus === 'access_closed', 'teacher closes new-device access')
  const c1 = await req('/api/pupil/register', { method: 'POST' })
  ok(c1.status === 403 && c1.data.error === 'admission_closed', 'new device is rejected while access is closed')
  ok((await req('/api/pupil/state', { token: tokenA })).data.phase === 'admitted', 'previously admitted device stays inside')
  ok((await req('/api/exam/document', { token: tokenB })).status === 200, 'previously admitted device can still load the PDF')

  console.log('Reopening access')
  snap = (await teacher('/api/teacher/reopen-access')).data
  ok(snap.exam.displayStatus === 'active', 'teacher reopens access')
  const c2 = await req('/api/pupil/register', { method: 'POST' })
  ok(c2.status === 201 && c2.data.state.phase === 'admitted', 'new device can join after reopening')

  console.log('Security events')
  const ev = await req('/api/pupil/events', { method: 'POST', token: tokenA, body: { type: 'tab_hidden' } })
  ok(ev.status === 200 && ev.data.violations === 1, 'tab switch is recorded as a violation')
  const ev2 = await req('/api/pupil/events', { method: 'POST', token: tokenA, body: { type: 'window_blur' } })
  ok(ev2.data.violations === 1, 'simultaneous blur is de-duplicated')
  ok(await waitFor(() => alerts.length > 0), 'teacher receives a real-time alert')
  ok((await req('/api/pupil/events', { method: 'POST', token: tokenA, body: { type: 'bogus' } })).status === 400, 'unknown event types are rejected')

  console.log('Removing a device')
  await teacher(`/api/teacher/devices/${b.data.state.device.id}/remove`)
  ok((await req('/api/pupil/state', { token: tokenB })).data.phase === 'removed', 'teacher removes a device')
  ok((await req('/api/exam/document', { token: tokenB })).status === 403, 'removed device loses PDF access')

  console.log('Ending the examination')
  snap = (await teacher('/api/teacher/end')).data
  ok(snap.exam.status === 'ended', 'teacher ends the examination')
  ok(await waitFor(() => lastPhase(sockA) === 'ended'), 'connected pupil is notified that the exam ended')
  ok((await req('/api/exam/document', { token: tokenA })).status === 403, 'ended session cannot fetch the PDF')
  ok((await req('/api/pupil/state', { token: tokenA })).data.phase === 'ended', 'refreshing does not restore access')
  const d = await req('/api/pupil/register', { method: 'POST' })
  ok(d.status === 403 && d.data.error === 'exam_ended', 'new devices cannot join an ended examination')

  console.log('New session')
  snap = (await teacher('/api/teacher/new-session')).data
  ok(snap.exam.status === 'not_started' && snap.devices.length === 0, 'teacher starts a fresh session')
  ok((await req('/api/pupil/state', { token: tokenA })).data.phase === 'ended', 'old device sessions stay invalid')

  console.log('Sign out')
  await teacher('/api/teacher/logout')
  ok((await req('/api/teacher/state', { teacher: true })).status === 401, 'signed-out teacher session is rejected')

  sockA.close()
  teacherSocket.close()
  console.log(failures ? `\n${failures} check(s) failed.\n` : '\nAll checks passed.\n')
  process.exit(failures ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
