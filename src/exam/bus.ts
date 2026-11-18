import type { TeacherAlert } from '../shared/types.ts'

/**
 * Same-origin messaging between tabs/windows of this browser.
 * Uses BroadcastChannel where available, otherwise falls back to `storage` events.
 *
 * This is the seam for future cross-device sync: replace `post`/`subscribe` with a
 * real-time transport and the rest of the app keeps working.
 */
export type BusMessage =
  | { type: 'state' }
  | { type: 'presence'; deviceId: string }
  | { type: 'bye'; deviceId: string }
  | { type: 'ping' }
  | { type: 'alert'; alert: TeacherAlert }

const CHANNEL = 'examsecure'
const FALLBACK_KEY = 'examsecure.bus'

const channel: BroadcastChannel | null =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null

export function post(message: BusMessage) {
  try {
    if (channel) channel.postMessage(message)
    else localStorage.setItem(FALLBACK_KEY, JSON.stringify({ message, nonce: Math.random() }))
  } catch {
    /* storage unavailable — single-tab use still works */
  }
}

export function subscribe(listener: (message: BusMessage) => void): () => void {
  if (channel) {
    const onMessage = (e: MessageEvent<BusMessage>) => listener(e.data)
    channel.addEventListener('message', onMessage)
    return () => channel.removeEventListener('message', onMessage)
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key !== FALLBACK_KEY || !e.newValue) return
    try {
      listener(JSON.parse(e.newValue).message as BusMessage)
    } catch {
      /* ignore malformed */
    }
  }
  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}
