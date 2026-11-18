# ExamSecure — CSOK Jesma Edition

A focused, teacher-controlled examination PDF viewer. Pupils press **Start Exam**, wait, and the paper opens automatically when the teacher opens the examination. Pupils only *view* the paper; answers go on a separate answer sheet.

- **Pupil journey:** open app → START EXAM → wait for teacher → view PDF
- **Teacher journey:** Teacher access → enter code → open exam → monitor devices → close access / end exam

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | React 19 + TypeScript, Vite, Tailwind CSS v4 (tokens from `design/`), `react-icons` (Material set), PDF.js |
| Backend | Node.js + Express 5, Socket.IO (real-time), JSON-file persistence (`server/data/state.json`) |

The examination paper is the **single PDF in `docs/`**, discovered automatically at startup. If there are several, the first alphabetically is used and a warning is logged. The PDF is never placed in `public/` or the build; it's streamed by the server only to admitted devices.

## Requirements

- Node.js **22+** (uses `process.loadEnvFile`)

## Setup

```bash
npm install
cp .env.example .env      # then edit TEACHER_ACCESS_CODE before a real examination
```

> **Quote values containing `#` in `.env`.** `TEACHER_ACCESS_CODE="12345678abcd#"` works, but unquoted `12345678abcd#` is read as `12345678abcd` (everything after `#` is a comment).

## Running

### Development

```bash
npm run dev
```

Starts the API server (port `3001`) and the Vite dev server (`http://localhost:5173`, proxied to the API). Open the Vite URL. Vite also prints a **Network** URL for pupils' devices on the same Wi-Fi/LAN.

### Production / examination day

```bash
npm run build
npm start
```

Serves everything from one port (default `http://<this-computer's-IP>:3001`). Pupils open that address, and the teacher goes to `/teacher`. Allow the port through the computer's firewall if pupil devices can't connect.

### Other scripts

| Command | Purpose |
| --- | --- |
| `npm run lint` | ESLint |
| `npm run test:smoke` | End-to-end check of the whole workflow against a running server (`BASE_URL=http://localhost:3001` by default). **It opens, ends and resets the session, so never run it during a real exam.** |

## Configuration (`.env`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `TEACHER_ACCESS_CODE` | `12345678abcd#` | Teacher code (case-sensitive). Checked on the server only. **Change it.** |
| `PORT` / `HOST` | `3001` / `0.0.0.0` | Where the server listens |
| `EXAM_TITLE` | from PDF file name | Title shown to pupils and the teacher |
| `EXAM_DURATION_MINUTES` | `0` | Default time limit (0 = none). Teacher can change it before opening. |
| `ADMISSION_WINDOW_MINUTES` | `0` | Default auto-close of new-device access after opening (0 = manual) |
| `VIOLATION_ESCALATION_THRESHOLD` | `3` | Violations before the serious warning and a prominent teacher alert |
| `TEACHER_SESSION_HOURS` | `12` | Teacher sign-in lifetime |
| `COOKIE_SECURE` | `false` | Set `true` when served over HTTPS |

## How it works

**Examination states:** *Not started* (optionally *Scheduled*) → *Active* (accepting devices, or *new device access closed*) → *Ended*. After ending, the teacher can **Start new session**.

- **Start Exam** registers a device and returns a random device token, which is stored in the browser and hashed on the server. Each device gets an anonymous label such as `PUPIL-7F3A`. There are no names or accounts.
- **Open examination** admits every waiting, connected device in real time. New devices are admitted on arrival while access is open.
- **Close new device access** refuses new registrations. Admitted pupils stay in. A refused device keeps checking and joins automatically if access is **reopened**.
- **End examination** (asks for confirmation) closes the paper on every device, shows the ended screen and invalidates all device sessions.
- **Remove** (asks for confirmation) closes the paper on one device.
- Optional settings (before opening): a scheduled opening time, auto-close of admission after N minutes, and a time limit. Pupils see the time limit as a countdown, and the exam ends automatically when it runs out.
- State lives on the server and survives restarts. Refreshing a page re-validates with the server and never bypasses admission.

### PDF access control

`GET /api/exam/document` returns the PDF only if the device token is valid, the device is admitted and not removed, it belongs to the current session, and the examination is active. Otherwise it returns `403`. Responses are `no-store`. The client hands the bytes straight to PDF.js. No blob or download URL is created.

## Security measures and their limits

**What the app does**

- Pages render to `<canvas>` only, with no text layer, so the page DOM contains no question text to select, copy, translate or read with extensions.
- Text selection, context menu, drag, copy/cut, and common shortcuts (print, save, select-all, view-source, dev tools) are blocked. Printing produces a blank page.
- Each page carries a faint watermark with the device label, which discourages sharing photos.
- Tab switches and focus loss are detected and recorded. The paper is blurred while the pupil is away, and a warning appears on return. A simultaneous blur and tab switch counts as one violation.
- The warnings escalate: *"Stay in your examination."*, then at the threshold a serious warning, and the teacher is alerted live. **Nobody is removed automatically**; the teacher decides.
- Back navigation is intercepted with a "You can't leave the examination" modal and recorded. Closing or reloading the tab triggers the browser's leave-page prompt.
- When the **PrintScreen** key is detected, the event is recorded and the app tries to clear the clipboard.
- The teacher code is verified server-side with a constant-time comparison and attempts are rate-limited. The teacher session is an HttpOnly, SameSite=Strict cookie, and the code is never sent to or stored in the browser.

**What a web app cannot do.** No browser application can fully prevent:

- photos of the screen taken with another device (phone camera),
- OS-level screenshots and screen recording (Snipping Tool, Win+Shift+S, macOS shortcuts, capture software), or
- help from a person or AI assistant on another device, or from an overlay tool that doesn't take window focus.

A determined user with developer tools or a modified browser can also inspect anything the browser receives, including the PDF bytes for an admitted device.

The measures above discourage casual cheating and make leaving the exam **visible to the teacher**. For stronger guarantees, use managed devices: kiosk or assigned-access mode, Chrome OS managed sessions, or a lockdown browser. Physical invigilation still matters.

## Project layout

```
docs/                 the examination PDF (do not rename/move)
design/               approved design references
server/
  config.ts           env config, automatic PDF discovery
  store.ts            authoritative exam/device state machine + persistence
  index.ts            Express API, PDF access control, Socket.IO, scheduler
src/
  shared/types.ts     types shared by server and client
  components/ui.tsx   design-system components (pill button, chips, modal…)
  pupil/              landing, waiting room, secure viewer, PDF renderer, security hook
  teacher/            access page, dashboard
scripts/smoke-test.mjs  end-to-end workflow check
```

To reset all examination state, stop the server and delete `server/data/state.json`.
