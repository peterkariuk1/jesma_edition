import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
// The legacy build supports older mobile browsers (e.g. iPads/iPhones that are a few iOS versions behind).
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type RenderTask,
} from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { MdErrorOutline, MdRefresh } from 'react-icons/md'
import { Spinner } from '../components/ui.tsx'
import { EXAM_PDF_URL } from '../exam/document.ts'

GlobalWorkerOptions.workerSrc = workerUrl

/** PDF.js runtime data (fonts, cmaps, decoders), copied to /pdfjs/ by the Vite build. */
const PDFJS_ASSETS = `${import.meta.env.BASE_URL}pdfjs/`

/** Canvas limits: iOS Safari refuses canvases above ~16.7M pixels and has a small total canvas budget. */
const MAX_CANVAS_WIDTH = 4096
const MAX_CANVAS_PIXELS = 8_000_000
/** Fit-to-width never exceeds this CSS width at 100% zoom (comfortable reading measure). */
const MAX_FIT_WIDTH = 920

interface PageSize {
  width: number
  height: number
}

async function fetchExamPdf(): Promise<Uint8Array> {
  // Handed straight to PDF.js; no blob/object URL is created for the viewer.
  const res = await fetch(EXAM_PDF_URL)
  if (!res.ok) throw new Error(`The examination paper could not be loaded (HTTP ${res.status}).`)
  return new Uint8Array(await res.arrayBuffer())
}

function openPdf(data: Uint8Array): PDFDocumentLoadingTask {
  return getDocument({
    data, // transferred to the worker, not kept on the main thread
    cMapUrl: `${PDFJS_ASSETS}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${PDFJS_ASSETS}standard_fonts/`,
    wasmUrl: `${PDFJS_ASSETS}wasm/`,
    iccUrl: `${PDFJS_ASSETS}iccs/`,
    enableXfa: false,
  })
}

function watermarkStyle(label: string): CSSProperties {
  const text = `${label} · CSOK JESMA`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="220"><text x="0" y="140" transform="rotate(-28 180 110)" font-family="Source Code Pro, monospace" font-size="15" font-weight="600" fill="#1E1C1A" fill-opacity="0.07" letter-spacing="2">${text}</text></svg>`
  return { backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`, backgroundRepeat: 'repeat' }
}

export function PdfDocument({
  zoom,
  watermark,
  hidden,
  scrollRef,
  onLoaded,
}: {
  zoom: number
  watermark: string
  /** Blank the pages (focus lost) without unloading the document. */
  hidden: boolean
  scrollRef: RefObject<HTMLDivElement | null>
  onLoaded: (numPages: number) => void
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [sizes, setSizes] = useState<PageSize[]>([])
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [containerWidth, setContainerWidth] = useState(0)
  const onLoadedRef = useRef(onLoaded)

  useEffect(() => {
    onLoadedRef.current = onLoaded
  }, [onLoaded])

  // Load the document.
  useEffect(() => {
    let cancelled = false
    let task: PDFDocumentLoadingTask | null = null
    fetchExamPdf()
      .then((data) => {
        if (cancelled) return null
        task = openPdf(data)
        return task.promise
      })
      .then(async (loaded) => {
        if (cancelled || !loaded) return
        const pages = await Promise.all(
          Array.from({ length: loaded.numPages }, (_, i) =>
            loaded.getPage(i + 1).then((p) => {
              const vp = p.getViewport({ scale: 1 })
              return { width: vp.width, height: vp.height }
            }),
          ),
        )
        if (cancelled) return
        setSizes(pages)
        setPdf(loaded)
        setError(null)
        onLoadedRef.current(loaded.numPages)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false
        setError(
          offline
            ? 'This device is offline. Reconnect to the internet once to load the paper.'
            : err instanceof Error
              ? err.message
              : 'The examination paper could not be loaded.',
        )
      })
    return () => {
      cancelled = true
      void (task as PDFDocumentLoadingTask | null)?.destroy()
    }
  }, [attempt])

  // Track the available width for fit-to-width scaling.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [scrollRef])

  if (error) {
    return (
      <div className="mx-auto mt-24 flex max-w-sm flex-col items-center gap-4 rounded-2xl border border-outline bg-surface-container p-8 text-center animate-surface-enter">
        <MdErrorOutline className="text-[36px] text-error" aria-hidden="true" />
        <p className="text-title-md font-semibold text-on-surface">We couldn’t load your paper</p>
        <p className="text-body-sm text-on-surface-variant">{error}</p>
        <button
          type="button"
          onClick={() => {
            setError(null)
            setAttempt((a) => a + 1)
          }}
          className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-label-lg font-semibold text-ink transition-all hover:brightness-110"
        >
          <MdRefresh className="text-[18px]" aria-hidden="true" /> Try again
        </button>
      </div>
    )
  }

  if (!pdf || sizes.length === 0 || containerWidth === 0) {
    return (
      <div className="mx-auto mt-24 flex flex-col items-center gap-4 text-center animate-fade-in">
        <Spinner className="h-8 w-8" />
        <p className="text-body-md text-on-surface-variant">Preparing your examination paper…</p>
      </div>
    )
  }

  // Phones and portrait tablets use (almost) the full width; larger screens get breathing room around the page.
  const gutter = containerWidth < 640 ? 0 : containerWidth < 960 ? 8 : 32
  const fitWidth = Math.min(containerWidth - gutter * 2, MAX_FIT_WIDTH)
  const widest = Math.max(...sizes.map((s) => s.width))
  const scale = (Math.max(fitWidth, 240) / widest) * zoom
  const wm = watermarkStyle(watermark)

  return (
    <div
      className="flex w-max min-w-full flex-col items-center gap-4 transition-[filter,opacity] duration-200 sm:gap-6"
      style={hidden ? { filter: 'blur(28px)', opacity: 0.35 } : undefined}
      aria-hidden={hidden}
    >
      {sizes.map((size, i) => (
        <PdfPage key={i} pdf={pdf} pageNumber={i + 1} size={size} scale={scale} watermark={wm} scrollRef={scrollRef} />
      ))}
    </div>
  )
}

function PdfPage({
  pdf,
  pageNumber,
  size,
  scale,
  watermark,
  scrollRef,
}: {
  pdf: PDFDocumentProxy
  pageNumber: number
  size: PageSize
  scale: number
  watermark: CSSProperties
  scrollRef: RefObject<HTMLDivElement | null>
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [near, setNear] = useState(pageNumber <= 2)
  const [rendered, setRendered] = useState(false)
  const cssWidth = Math.floor(size.width * scale)
  const cssHeight = Math.floor(size.height * scale)

  // Only keep pages near the viewport rendered (important for memory on phones and tablets).
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {
      root: scrollRef.current,
      rootMargin: '1200px 0px',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [scrollRef])

  // (Re-)render when near or when the scale changes. Debounced so zooming stays smooth.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!near) {
      // Release the bitmap of pages far away.
      if (canvas && canvas.width > 0) {
        canvas.width = 0
        canvas.height = 0
      }
      return
    }
    let task: RenderTask | null = null
    let cancelled = false
    const timer = window.setTimeout(async () => {
      if (!canvas) return
      const page = await pdf.getPage(pageNumber)
      if (cancelled) return
      const dpr = window.devicePixelRatio || 1
      const ratio = Math.min(dpr, MAX_CANVAS_WIDTH / cssWidth, Math.sqrt(MAX_CANVAS_PIXELS / (cssWidth * cssHeight)))
      const viewport = page.getViewport({ scale: scale * ratio })
      // Render offscreen then swap in, so the previous image stays visible until the new one is ready.
      const off = document.createElement('canvas')
      off.width = Math.floor(viewport.width)
      off.height = Math.floor(viewport.height)
      task = page.render({ canvas: off, viewport })
      try {
        await task.promise
      } catch {
        off.width = off.height = 0
        return // cancelled
      }
      if (cancelled) {
        off.width = off.height = 0
        return
      }
      canvas.width = off.width
      canvas.height = off.height
      canvas.getContext('2d')?.drawImage(off, 0, 0)
      off.width = off.height = 0
      setRendered(true)
    }, 60)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      task?.cancel()
    }
  }, [near, pdf, pageNumber, scale, cssWidth, cssHeight])

  return (
    <div
      ref={wrapRef}
      data-page={pageNumber}
      className="relative shrink-0 overflow-hidden rounded-[3px] bg-paper-bg shadow-2xl ring-1 ring-paper-border/40"
      style={{ width: cssWidth, height: cssHeight }}
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        style={{ width: cssWidth, height: cssHeight }}
        onContextMenu={(e) => e.preventDefault()}
        draggable={false}
      />
      {(!rendered || !near) && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner className="border-paper-border border-t-accent" />
        </div>
      )}
      {/* Transparent shield + faint device watermark: blocks drag/long-press on the canvas and discourages photos. */}
      <div className="absolute inset-0" style={watermark} aria-hidden="true" />
    </div>
  )
}
