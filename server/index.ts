import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import express, { type NextFunction, type Request, type Response } from 'express'
import { Server as SocketServer, type Socket } from 'socket.io'
import { config } from './config.ts'
import { ExamError, ExamStore } from './store.ts'
import { SECURITY_EVENT_LABELS, type SecurityEventType } from '../src/shared/types.ts'

const TEACHER_COOKIE = 'examsecure_teacher'

const store = new ExamStore()
const app = express()
const server = http.createServer(app)
const io = new SocketServer(server, {
  serveClient: false,
  // Same-origin only. In development the Vite dev server proxies /socket.io.
  cors: { origin: false },
})

app.disable('x-powered-by')
app.set('trust proxy', 'loopback')
app.use(express.json({ limit: '16kb' }))

// ------------------------------------------------------------------ security headers

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), display-capture=()')
  if (config.serveClient) {
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'wasm-unsafe-eval'",
        "worker-src 'self' blob:",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self' ws: wss:",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "base-uri 'self'",
      ].join('; '),
    )
  }
  next()
})

// ------------------------------------------------------------------ helpers

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    const k = part.slice(0, i).trim()
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim())
    } catch {
      /* ignore malformed cookie */
    }
  }
  return out
}

const teacherTokenFrom = (cookieHeader: string | undefined) => parseCookies(cookieHeader)[TEACHER_COOKIE]

function bearer(req: Request): string | null {
  const h = req.headers.authorization
  return h?.startsWith('Bearer ') ? h.slice(7).trim() : null
}

function safeEqual(a: string, b: string) {
  const ha = crypto.createHash('sha256').update(a, 'utf8').digest()
  const hb = crypto.createHash('sha256').update(b, 'utf8').digest()
  return crypto.timingSafeEqual(ha, hb)
}

function requireTeacher(req: Request, res: Response, next: NextFunction) {
  if (store.isTeacher(teacherTokenFrom(req.headers.cookie))) return next()
  res.status(401).json({ error: 'unauthorized', message: 'Teacher session expired. Please sign in again.' })
}

function handle(fn: (req: Request, res: Response) => void) {
  return (req: Request, res: Response) => {
    try {
      fn(req, res)
    } catch (err) {
      if (err instanceof ExamError) {
        res.status(err.status).json({ error: err.code, message: err.message })
      } else {
        console.error(err)
        res.status(500).json({ error: 'server_error', message: 'Something went wrong.' })
      }
    }
  }
}

// Simple in-memory brute-force protection for the teacher code.
const loginFailures = new Map<string, { count: number; resetAt: number }>()
const MAX_LOGIN_FAILURES = 8
const LOGIN_WINDOW_MS = 10 * 60_000

// ------------------------------------------------------------------ pupil API

app.post(
  '/api/pupil/register',
  handle((req, res) => {
    const { token, device } = store.registerDevice(req.headers['user-agent'])
    res.status(201).json({ token, state: store.pupilState(device) })
  }),
)

app.get(
  '/api/pupil/state',
  handle((req, res) => {
    const device = store.findDeviceByToken(bearer(req))
    if (device) store.revalidate(device)
    res.json(store.pupilState(device))
  }),
)

app.post(
  '/api/pupil/leave',
  handle((req, res) => {
    const device = store.findDeviceByToken(bearer(req))
    if (device) store.leave(device)
    res.status(204).end()
  }),
)

app.post(
  '/api/pupil/events',
  handle((req, res) => {
    const device = store.findDeviceByToken(bearer(req))
    if (!device) {
      res.status(401).json({ error: 'invalid_session' })
      return
    }
    const type = req.body?.type as SecurityEventType
    if (!(type in SECURITY_EVENT_LABELS)) {
      res.status(400).json({ error: 'invalid_event' })
      return
    }
    const alert = store.recordEvent(device, type)
    if (alert) io.to('teachers').emit('teacher:alert', alert)
    res.json({ violations: device.violations })
  }),
)

/** Public, non-sensitive status used by devices that were refused admission. */
app.get('/api/exam/public', (_req, res) => {
  res.json(store.pupilState(null).exam)
})

/**
 * The examination document. Served only to admitted devices of the active session.
 * Never cached, never offered as a download.
 */
app.get(
  '/api/exam/document',
  handle((req, res) => {
    const device = store.findDeviceByToken(bearer(req))
    if (!store.canViewDocument(device)) {
      res.status(403).json({ error: 'forbidden', message: 'This device is not admitted to the examination.' })
      return
    }
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Cache-Control', 'no-store, private, max-age=0')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Content-Disposition', 'inline')
    fs.createReadStream(config.pdfPath)
      .on('error', () => res.destroy())
      .pipe(res)
  }),
)

// ------------------------------------------------------------------ teacher API

app.get('/api/teacher/session', (req, res) => {
  res.json({ authenticated: store.isTeacher(teacherTokenFrom(req.headers.cookie)) })
})

app.post('/api/teacher/login', (req, res) => {
  const ip = req.ip ?? 'unknown'
  const now = Date.now()
  const entry = loginFailures.get(ip)
  if (entry && entry.resetAt > now && entry.count >= MAX_LOGIN_FAILURES) {
    res.status(429).json({ error: 'too_many_attempts', message: 'Too many attempts. Please wait a few minutes and try again.' })
    return
  }
  const code = typeof req.body?.code === 'string' ? req.body.code : ''
  if (!code || code.length > 256 || !safeEqual(code, config.teacherCode)) {
    const e = entry && entry.resetAt > now ? entry : { count: 0, resetAt: now + LOGIN_WINDOW_MS }
    e.count += 1
    loginFailures.set(ip, e)
    res.status(401).json({ error: 'invalid_code', message: 'That access code is not correct.' })
    return
  }
  loginFailures.delete(ip)
  const { token, expiresAt } = store.createTeacherSession()
  res.cookie(TEACHER_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.cookieSecure,
    path: '/',
    expires: new Date(expiresAt),
  })
  res.json({ authenticated: true })
})

app.post('/api/teacher/logout', (req, res) => {
  store.endTeacherSession(teacherTokenFrom(req.headers.cookie))
  res.clearCookie(TEACHER_COOKIE, { path: '/' })
  res.status(204).end()
})

app.use('/api/teacher', requireTeacher)

app.get('/api/teacher/state', (_req, res) => {
  res.json(store.teacherSnapshot())
})

const teacherAction = (fn: (req: Request) => void) =>
  handle((req, res) => {
    fn(req)
    res.json(store.teacherSnapshot())
  })

app.post('/api/teacher/config', teacherAction((req) => store.configure(req.body ?? {})))
app.post('/api/teacher/open', teacherAction(() => store.open()))
app.post('/api/teacher/close-access', teacherAction(() => store.closeAccess()))
app.post('/api/teacher/reopen-access', teacherAction(() => store.reopenAccess()))
app.post('/api/teacher/end', teacherAction(() => store.end('teacher')))
app.post('/api/teacher/new-session', teacherAction(() => store.startNewSession()))
app.post('/api/teacher/devices/:id/remove', teacherAction((req) => store.removeDevice(String(req.params.id))))

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'not_found' })
})

// ------------------------------------------------------------------ PDF.js runtime assets

for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  app.use(`/pdfjs/${dir}`, express.static(path.join(config.pdfjsDir, dir), { maxAge: '7d' }))
}

// ------------------------------------------------------------------ built client (production)

if (config.serveClient) {
  const indexHtml = path.join(config.distDir, 'index.html')
  if (!fs.existsSync(indexHtml)) {
    console.error('[server] dist/ not found. Run "npm run build" before "npm start".')
    process.exit(1)
  }
  app.use(express.static(config.distDir, { index: false, maxAge: '1h' }))
  app.get(/^\/(?!api\/|socket\.io\/|pdfjs\/).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.sendFile(indexHtml)
  })
}

// ------------------------------------------------------------------ realtime

function broadcast() {
  for (const deviceId of store.connectedDeviceIds()) {
    const sockets = io.sockets.adapter.rooms.get(`device:${deviceId}`)
    if (!sockets) continue
    for (const sid of sockets) {
      const s = io.sockets.sockets.get(sid)
      const device = s ? store.findDeviceByToken(s.data.token as string) : null
      if (s) s.emit('pupil:state', store.pupilState(device))
    }
  }
  io.to('teachers').emit('teacher:state', store.teacherSnapshot())
}

// Coalesce bursts of changes into one broadcast.
let broadcastQueued = false
store.onChange(() => {
  if (broadcastQueued) return
  broadcastQueued = true
  queueMicrotask(() => {
    broadcastQueued = false
    broadcast()
  })
})

io.on('connection', (socket: Socket) => {
  const role = socket.handshake.auth?.role

  if (role === 'teacher') {
    if (!store.isTeacher(teacherTokenFrom(socket.handshake.headers.cookie))) {
      socket.emit('teacher:unauthorized')
      socket.disconnect(true)
      return
    }
    socket.join('teachers')
    socket.emit('teacher:state', store.teacherSnapshot())
    return
  }

  if (role === 'pupil') {
    const token = socket.handshake.auth?.token as string | undefined
    const device = store.findDeviceByToken(token)
    if (!device) {
      socket.emit('pupil:state', store.pupilState(null))
      socket.disconnect(true)
      return
    }
    socket.data.token = token
    socket.join(`device:${device.id}`)
    store.deviceConnected(device.id) // re-validates admission & triggers a broadcast
    socket.emit('pupil:state', store.pupilState(device))
    socket.on('disconnect', () => store.deviceDisconnected(device.id))
    return
  }

  socket.disconnect(true)
})

// Scheduled opening, admission window and time limit.
setInterval(() => store.tick(), 1000).unref()

// Keep teacher sessions honest: drop sockets whose session expired.
setInterval(() => {
  for (const s of io.sockets.sockets.values()) {
    if (s.rooms.has('teachers') && !store.isTeacher(teacherTokenFrom(s.handshake.headers.cookie))) {
      s.emit('teacher:unauthorized')
      s.disconnect(true)
    }
  }
}, 60_000).unref()

const shutdown = () => {
  store.flush()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`
  Port ${config.port} is already in use. Set a different PORT in .env, e.g. PORT=3005.
`)
    process.exit(1)
  }
  throw err
})

server.listen(config.port, config.host, () => {
  console.log(`\n  ExamSecure server listening on http://localhost:${config.port}`)
  console.log(`  Examination paper: ${config.pdfFileName}`)
  console.log(`  Mode: ${config.serveClient ? 'production (serving dist/)' : 'development (use the Vite URL)'}\n`)
})
