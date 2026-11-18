import { useCallback, useEffect, useRef, useState } from 'react'
import type { SecurityEventType } from '../shared/types.ts'

export type SecurityPrompt = 'focus' | 'back' | 'screenshot'

const BLOCKED_KEYS = new Set(['p', 's', 'c', 'x', 'a', 'u', 'o', 'f', 'g'])
const BLOCKED_SHIFT_KEYS = new Set(['i', 'j', 'c', 'k', 's', 'e'])

/**
 * Client-side examination integrity measures for the secure viewer.
 *
 * These measures discourage and *record* casual attempts to leave or copy the exam.
 * They cannot stop a determined user (or a phone camera) — the server remains authoritative
 * for access, and the teacher decides what to do with recorded events.
 */
export function useExamSecurity(onEvent: (type: SecurityEventType) => void, enabled: boolean) {
  const [away, setAway] = useState(false)
  const [prompt, setPrompt] = useState<SecurityPrompt | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const awayRef = useRef(false)
  const onEventRef = useRef(onEvent)
  const noticeTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  const flash = useCallback((message: string) => {
    setNotice(message)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2600)
  }, [])

  useEffect(() => {
    if (!enabled) return
    const report = (type: SecurityEventType) => onEventRef.current(type)

    // ---- Leaving the window / tab -------------------------------------------------------
    const leave = (type: SecurityEventType) => {
      if (awayRef.current) return
      awayRef.current = true
      setAway(true)
      report(type)
    }
    const maybeReturn = () => {
      if (!awayRef.current) return
      if (document.visibilityState === 'visible' && document.hasFocus()) {
        awayRef.current = false
        setAway(false)
        setPrompt('focus')
      }
    }
    const onVisibility = () => (document.hidden ? leave('tab_hidden') : maybeReturn())
    const onBlur = () => leave('window_blur')
    const onFocus = () => maybeReturn()

    // ---- Copying, context menu, dragging, printing ---------------------------------------
    const block = (e: Event) => e.preventDefault()
    const onCopy = (e: ClipboardEvent) => {
      e.preventDefault()
      e.clipboardData?.setData('text/plain', '')
      flash('Copying is disabled during the examination.')
    }
    const onBeforePrint = () => report('blocked_shortcut')

    // ---- Keyboard shortcuts -------------------------------------------------------------
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      const mod = e.ctrlKey || e.metaKey
      const blocked =
        key === 'f12' ||
        (mod && e.shiftKey && BLOCKED_SHIFT_KEYS.has(key)) ||
        (mod && !e.shiftKey && BLOCKED_KEYS.has(key))
      if (blocked) {
        e.preventDefault()
        e.stopPropagation()
        report('blocked_shortcut')
        flash('That shortcut is disabled during the examination.')
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      // PrintScreen only fires keyup in most browsers. Best effort: wipe the clipboard and record it.
      if (e.key === 'PrintScreen') {
        navigator.clipboard?.writeText('').catch(() => {})
        report('screenshot_key')
        setPrompt('screenshot')
      }
    }

    // ---- Back navigation & unloading ----------------------------------------------------
    const guardUrl = window.location.href
    const guard = () => window.history.pushState({ examGuard: true }, '', guardUrl)
    guard()
    const onPopState = () => {
      guard()
      report('back_navigation')
      setPrompt('back')
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    document.addEventListener('contextmenu', block)
    document.addEventListener('dragstart', block)
    document.addEventListener('selectstart', block)
    document.addEventListener('copy', onCopy)
    document.addEventListener('cut', onCopy)
    window.addEventListener('beforeprint', onBeforePrint)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('popstate', onPopState)
    window.addEventListener('beforeunload', onBeforeUnload)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('contextmenu', block)
      document.removeEventListener('dragstart', block)
      document.removeEventListener('selectstart', block)
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('cut', onCopy)
      window.removeEventListener('beforeprint', onBeforePrint)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('popstate', onPopState)
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.clearTimeout(noticeTimer.current)
    }
  }, [enabled, flash])

  const dismiss = useCallback(() => setPrompt(null), [])

  return { away, prompt, notice, dismiss }
}
