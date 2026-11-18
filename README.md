# ExamSecure — CSOK Jesma Edition

A focused, teacher-controlled examination PDF viewer. Pupils press **Start Exam**, wait, and the paper opens automatically when the teacher opens the examination. Pupils only *view* the paper; answers go on a separate answer sheet.

- **Pupil journey:** open app → START EXAM → wait for teacher → view PDF
- **Teacher journey:** Teacher access → enter code → open exam → monitor devices → close access / end exam

This is a **frontend-only** application. There is no server, API or database. Everything runs in the browser, and it deploys to Vercel (or any static host) as plain files.

> ## ⚠️ Important: one browser, not many devices
>
> Without a backend, the examination state lives in the browser's own storage (`localStorage`). Tabs and windows of the **same browser on the same device** stay in sync through `BroadcastChannel`, falling back to `storage` events where that's unavailable.
>
> **Teacher actions on one phone or computer do not reach pupils on other phones or computers.** Browser storage cannot cross devices, and this version deliberately uses no external service. In practice:
>
> - The full workflow works when the teacher and pupils use **the same browser** (separate tabs or windows on one machine). This is also how it is tested.
> - On separate devices, each device has its own independent examination state.
>
> The sync layer is isolated (see [Adding cross-device sync](#adding-cross-device-sync)), so a real-time service can be added later without changing the screens.

## Stack

React 19 + TypeScript, Vite, Tailwind CSS v4 (tokens from `design/`), `react-icons` (Material set), PDF.js (legacy build, for older iOS and Android browsers).

## Running locally

Requires Node.js 20.19+ (22 recommended).

```bash
npm install
npm run dev        # http://localhost:5173  (teacher: /teacher)
```

Other scripts:

| Command | Purpose |
| --- | --- |
| `npm run build` | Typecheck and build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Unit tests for the examination state machine (plain Node, no browser) |
| `npm run lint` | ESLint |

## Deploying to Vercel

Import the GitHub repository in Vercel. `vercel.json` already sets everything:

- Framework **Vite**, build command `npm run build`, output directory `dist`
- SPA fallback, so `/teacher`, `/waiting` and `/exam` load the app on refresh
- Security headers and long-term caching for hashed assets

No environment variables are needed.

## Configuration

Everything is in [`src/config.ts`](src/config.ts):

| Constant | Default | Meaning |
| --- | --- | --- |
| `TEACHER_ACCESS_CODE` | `12345678bcd#` | Teacher code, case-sensitive |
| `TEACHER_SESSION_HOURS` | `12` | How long a teacher tab stays signed in |
| `EXAM_TITLE` | `null` (derived from the PDF file name) | Title shown to pupils and teacher |
| `EXAM_DEFAULTS.durationMinutes` | `0` | Default time limit (0 = none) |
| `EXAM_DEFAULTS.admissionWindowMinutes` | `0` | Default auto-close of new-device access after opening |
| `EXAM_DEFAULTS.escalationThreshold` | `3` | Violations before the serious warning |

> **The teacher code is not a secret.** It ships inside the public JavaScript bundle and anyone can find it by inspecting the site. It keeps casual users out of the dashboard; it is not real authentication.

## The examination paper

The paper is **the single PDF in `docs/`**. At build time Vite finds it with `import.meta.glob`, bundles it unchanged as a hashed asset (`dist/assets/<name>-<hash>.pdf`) and the viewer loads it from there. PDF.js runtime data (fonts, character maps, image decoders) is copied to `dist/pdfjs/` by a small plugin in `vite.config.ts`.

To change the paper, replace the PDF in `docs/` (keep exactly one) and redeploy.

## How it works

**States:** *Not started* (optionally *Scheduled*) → *Active* (accepting devices, or *new device access closed*) → *Ended*, then **Start new session**.

- **Start Exam** registers the browser tab as a device with an anonymous label such as `PUPIL-7F3A`. The device id is kept in `sessionStorage`, so a refresh keeps the place and each tab is its own device.
- **Open examination** lets waiting devices admit themselves immediately. While access is open, new devices are admitted on arrival.
- **Close new device access** refuses new devices, while admitted pupils stay in. A refused device waits and joins automatically if access is **reopened**.
- **End examination** (asks for confirmation) closes the paper everywhere and shows the ended screen. **Remove** (asks for confirmation) closes it on one device.
- **Optional settings** before opening: a scheduled opening time, auto-close of admission, and a time limit. Pupils see the time limit as a countdown, and the exam ends when it runs out.
- The dashboard shows waiting and admitted counts, online status (from tab heartbeats), time joined, violations and live alerts.

### Code layout

```
docs/                    the examination PDF (one file)
design/                  approved design references
src/config.ts            app configuration (teacher code, defaults)
src/exam/engine.ts       pure examination state machine (no DOM/React)
src/exam/store.ts        persisted cross-tab state (localStorage + notifications)
src/exam/bus.ts          tab messaging (BroadcastChannel, storage-event fallback)
src/exam/document.ts     finds and bundles the PDF from docs/
src/pupil/               landing, waiting room, secure viewer, PDF renderer, security hook
src/teacher/             access page, dashboard
scripts/engine-test.mjs  state machine tests
```

### Adding cross-device sync

`engine.ts` is pure, so it can run anywhere. To synchronise real devices later, back `store.ts` (`getExamState` / `mutate`) and `bus.ts` (`post` / `subscribe`) with a shared real-time service, or run the engine on a small server. The UI only uses `useExamState`, `mutate` and the bus, so it does not need to change.

## Security measures and their limits

**What the app does**

- Pages are drawn to `<canvas>` only, with no text layer, so the page contains no selectable or copyable question text.
- Text selection, the context menu, dragging, copy/cut, and common shortcuts (print, save, select-all, view source, dev tools) are blocked. Printing produces a blank page.
- Each page carries a faint watermark with the device label.
- Tab switches and focus loss are detected and recorded. The paper is blurred while the pupil is away, and a warning appears on return.
- Warnings escalate: *"Stay in your examination."*, then a serious warning at the threshold, with a live alert to teacher tabs in the same browser. **Nobody is removed automatically.**
- Back navigation is intercepted with a warning and recorded. Closing or reloading the tab triggers the browser's leave-page prompt.

**What it cannot do**

- **The PDF is a public static file.** Anyone who inspects network requests or the built assets can download it. Admission checks are client-side and can be bypassed by someone editing browser storage.
- No web page can prevent phone-camera photos, OS screenshots or screen recording, help from another device or an AI assistant, or a determined user with developer tools.

These measures discourage casual cheating and make leaving the exam visible. They are not a lockdown. For real enforcement, use managed devices (kiosk or guided-access mode, a lockdown browser) and physical invigilation.

## Mobile support

Tested at iPhone, Android phone and iPad sizes. Page controls move to their own row on small screens, pages fit the screen width, touch scrolling and pinch zoom work, and canvases stay within iOS Safari's size limits (far-away pages are released to save memory). The full-screen button only appears where the browser supports it (not on iPhone).
