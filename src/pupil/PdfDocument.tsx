import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type RenderTask,
} from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { MdErrorOutline, MdRefresh } from 'react-icons/md'
import { ApiError } from '../lib/api.ts'
import { Spinner } from '../components/ui.tsx'

GlobalWorkerOptions.workerSrc = workerUrl

/** Max canvas backing-store width; keeps memory sane on high-DPI screens when zoomed in. */
const MAX_CANVAS_WIDTH = 4096
/** Fit-to-width never exceeds this CSS width at 100% zoom (comfortable reading measure). */
const MAX_FIT_WIDTH = 920
const PAGE_GUTTER = 32

interface PageSize {
  width: number
  height: number
}

async function fetchExamPdf(token: string): Promise<Uint8Array> {
  // The document is fetched with the device token and handed straight to PDF.js.
  // No blob/object URL is created, so there is no link to open or save.
  const res = await fetch('/api/exam/document', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    credentials: 'omit',
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.error ?? 'error', body.message ?? 'The examination paper could not be loaded.')
  }
  return new Uint8Array(await res.arrayBuffer())
}

function openPdf(data: Uint8Array): PDFDocumentLoadingTask {
  return getDocument({
    data, // transferred to the worker, not kept on the main thread
    cMapUrl: '/pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/pdfjs/standard_fonts/',
    wasmUrl: '/pdfjs/wasm/',
    iccUrl: '/pdfjs/iccs/',
    enableXfa: false,
  })
}

function watermarkStyle(label: string): CSSProperties {
  const text = `${label} · CSOK JESMA`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="220"><text x="0" y="140" transform="rotate(-28 180 110)" font-family="Source Code Pro, monospace" font-size="15" font-weight="600" fill="#1E1C1A" fill-opacity="0.07" letter-spacing="2">${text}</text></svg>`
  return { backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`, backgroundRepeat: 'repeat' }
}

export function PdfDocument({
  token,
  zoom,
  watermark,
  hidden,
  scrollRef,
  onLoaded,
}: {
  token: string
  zoom: number
  watermark: string
  /** Blank the pages (focus lost, disconnected) without unloading the document. */
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
    fetchExamPdf(token)
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
        if (!cancelled) setError(err instanceof Error ? err.message : 'The examination paper could not be loaded.')
      })
    return () => {
      cancelled = true
      void (task as PDFDocumentLoadingTask | null)?.destroy()
    }
  }, [token, attempt])

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

  const fitWidth = Math.min(containerWidth - PAGE_GUTTER * 2, MAX_FIT_WIDTH)
  const widest = Math.max(...sizes.map((s) => s.width))
  const scale = (Math.max(fitWidth, 240) / widest) * zoom
  const wm = watermarkStyle(watermark)

  return (
    <div
      className="flex flex-col items-center gap-6 transition-[filter,opacity] duration-200"
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

  // Only render pages near the viewport.
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

  // (Re-)render when visible or when the scale changes. Debounced so zooming stays smooth.
  useEffect(() => {
    if (!near) return
    let task: RenderTask | null = null
    let cancelled = false
    const timer = window.setTimeout(async () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const page = await pdf.getPage(pageNumber)
      if (cancelled) return
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_CANVAS_WIDTH / cssWidth)
      const viewport = page.getViewport({ scale: scale * ratio })
      // Render to an offscreen canvas then swap in, so the old image stays visible until the new one is ready.
      const off = document.createElement('canvas')
      off.width = Math.floor(viewport.width)
      off.height = Math.floor(viewport.height)
      task = page.render({ canvas: off, viewport })
      try {
        await task.promise
      } catch {
        return // cancelled
      }
      if (cancelled) return
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
  }, [near, pdf, pageNumber, scale, cssWidth])

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
      {!rendered && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner className="border-paper-border border-t-accent" />
        </div>
      )}
      {/* Transparent shield + faint device watermark: blocks drag/long-press on the canvas and discourages photos. */}
      <div className="absolute inset-0" style={watermark} aria-hidden="true" />
    </div>
  )
}
