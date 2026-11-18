/**
 * Unit test for the examination state machine (src/exam/engine.ts).
 * Runs in plain Node — no server, no browser:  npm test
 */
import * as E from '../src/exam/engine.ts'

let failures = 0
const ok = (cond, name) => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}`)
  if (!cond) failures++
}
const throwsCode = (fn, code) => {
  try {
    fn()
    return false
  } catch (e) {
    return e instanceof E.ExamError && e.code === code
  }
}
const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140'
const UA_PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148'
const UA_TABLET = 'Mozilla/5.0 (Linux; Android 14; SM-X200) Chrome/140 Safari/537.36'
const T = 'Test paper'
const phase = (s, id) => E.pupilState(s, id, T).phase

const s = E.createInitialState()
ok(E.isValidState(s) && s.exam.status === 'not_started', 'fresh state is valid and not started')

console.log('Waiting room')
const a = E.registerDevice(s, UA_DESKTOP)
ok(phase(s, a.id) === 'waiting', 'START EXAM registers a waiting device')
ok(/^PUPIL-[0-9A-F]{4}$/.test(a.label), 'device gets an anonymous label')
ok(E.deviceKindFromUserAgent(UA_PHONE) === 'mobile' && E.deviceKindFromUserAgent(UA_TABLET) === 'tablet', 'device kind detection')
ok(!E.revalidate(s, a.id), 'cannot be admitted before the exam opens')
ok(phase(s, 'unknown-id') === 'invalid', 'unknown device ids are invalid')

console.log('Opening')
E.openExam(s)
ok(s.exam.status === 'active' && s.exam.admissionOpen, 'teacher opens the exam')
ok(phase(s, a.id) === 'waiting' && E.revalidate(s, a.id) && phase(s, a.id) === 'admitted', 'waiting device admits itself after opening')
const b = E.registerDevice(s, UA_PHONE)
ok(phase(s, b.id) === 'admitted', 'new device joins directly while admission is open')

console.log('Closing / reopening admission')
E.closeAccess(s)
ok(throwsCode(() => E.registerDevice(s, UA_DESKTOP), 'admission_closed'), 'new devices are rejected while closed')
ok(phase(s, a.id) === 'admitted' && phase(s, b.id) === 'admitted', 'admitted devices stay in')
E.reopenAccess(s)
const c = E.registerDevice(s, UA_TABLET)
ok(phase(s, c.id) === 'admitted', 'new devices can join after reopening')

console.log('Security events')
const t0 = Date.now()
const a1 = E.recordEvent(s, a.id, 'tab_hidden', t0)
const a2 = E.recordEvent(s, a.id, 'window_blur', t0 + 100)
ok(a1?.violations === 1 && a2 === null, 'violation recorded; simultaneous blur de-duplicated')
E.recordEvent(s, a.id, 'back_navigation', t0 + 3000)
const a3 = E.recordEvent(s, a.id, 'tab_hidden', t0 + 6000)
ok(a3?.violations === 3 && a3.serious, 'third violation escalates')
ok(E.recordEvent(s, a.id, 'blocked_shortcut', t0 + 9000)?.violations === 3, 'blocked shortcuts are recorded but not counted')
const snap = E.teacherSnapshot(s, (id) => id === a.id, { title: T, documentName: 'x.pdf' })
ok(snap.counts.admitted === 3 && snap.counts.flagged === 1 && snap.counts.connected === 1, 'teacher snapshot counts')
ok(snap.exam.displayStatus === 'active' && snap.events.length === 4, 'teacher snapshot status and events')

console.log('Removing')
E.removeDevice(s, b.id)
ok(phase(s, b.id) === 'removed', 'teacher removes a device')
ok(!E.revalidate(s, b.id), 'removed device cannot re-admit itself')

console.log('Ending')
ok(throwsCode(() => E.startNewSession(s), 'not_ended'), 'cannot start a new session while active')
E.endExam(s, 'teacher')
ok(phase(s, a.id) === 'ended' && phase(s, c.id) === 'ended', 'ending shows the ended state to every device')
ok(throwsCode(() => E.registerDevice(s, UA_DESKTOP), 'exam_ended'), 'new devices cannot join an ended exam')
ok(throwsCode(() => E.openExam(s), 'exam_ended'), 'an ended exam cannot be reopened')

console.log('New session')
E.startNewSession(s)
ok(s.exam.status === 'not_started' && phase(s, a.id) === 'ended', 'new session; old devices stay ended')
ok(E.teacherSnapshot(s, () => false, { title: T, documentName: 'x' }).devices.length === 0, 'dashboard starts empty')

console.log('Timing')
const t = E.createInitialState()
E.configure(t, { durationMinutes: 30, admissionWindowMinutes: 5 })
const now = Date.now()
E.configure(t, { scheduledOpenAt: now + 60_000 }, now)
ok(!E.tickDue(t, now) && E.tickDue(t, now + 60_000), 'scheduled opening becomes due')
E.tick(t, now + 60_000)
ok(t.exam.status === 'active' && t.exam.endsAt === now + 60_000 + 30 * 60_000, 'scheduled open applies time limit')
E.tick(t, now + 60_000 + 5 * 60_000)
ok(t.exam.status === 'active' && !t.exam.admissionOpen, 'admission window closes automatically')
E.tick(t, now + 60_000 + 30 * 60_000)
ok(t.exam.status === 'ended' && t.exam.endReason === 'time', 'time limit ends the exam')
ok(throwsCode(() => E.configure(t, { durationMinutes: 10 }), 'not_editable'), 'settings locked after opening')

console.log(failures ? `\n${failures} check(s) failed.\n` : '\nAll engine checks passed.\n')
process.exit(failures ? 1 : 0)
