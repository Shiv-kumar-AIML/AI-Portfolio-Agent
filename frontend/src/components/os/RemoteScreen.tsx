import { Loader2, RotateCw, ShieldOff, SquareArrowOutUpRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { prettyUrl } from '@/lib/browserUrl'
import type { RemoteBrowser, RemoteTab } from '@/lib/remoteBrowser'

const BUTTONS = ['left', 'middle', 'right'] as const
// keys the browser reports that Chromium has no name for
const SKIP_KEYS = new Set(['Unidentified', 'Dead', 'Process', 'Compose'])

/**
 * The live page of one tab: frames from the remote Chromium drawn on a canvas, with the visitor's
 * pointer, wheel, keys and pastes sent back. Coordinates go out as fractions of the canvas, so it
 * works at any display size — including mapped onto the laptop screen.
 */
export function RemoteScreen({ remote, tab, state }: { remote: RemoteBrowser; tab: string; state: RemoteTab | undefined }) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [painted, setPainted] = useState(false)

  // the remote viewport follows this box's layout size (not its on-screen, transformed size)
  useEffect(() => {
    const el = box.current
    if (!el) return
    let t: ReturnType<typeof setTimeout> | undefined
    const report = () => {
      clearTimeout(t)
      t = setTimeout(() => remote.resize(el.offsetWidth, el.offsetHeight), 120)
    }
    report()
    const observer = new ResizeObserver(report)
    observer.observe(el)
    return () => {
      clearTimeout(t)
      observer.disconnect()
    }
  }, [remote])

  // draw this tab's frames (keyed by tab, so `painted` starts over for each)
  useEffect(() => {
    let drawing = false
    let latest: Blob | null = null
    const draw = async () => {
      if (drawing || !latest) return
      drawing = true
      const jpeg = latest
      latest = null
      try {
        const bitmap = await createImageBitmap(jpeg)
        const c = canvas.current
        if (c) {
          if (c.width !== bitmap.width || c.height !== bitmap.height) {
            c.width = bitmap.width
            c.height = bitmap.height
          }
          c.getContext('2d')?.drawImage(bitmap, 0, 0)
          setPainted(true)
        }
        bitmap.close()
      } catch {
        /* a corrupt frame: skip it */
      }
      drawing = false
      void draw()
    }
    return remote.onFrame((frameTab, jpeg) => {
      if (frameTab !== tab) return
      latest = jpeg // only the newest frame matters
      void draw()
    })
  }, [remote, tab])

  // input --------------------------------------------------------------------------------------
  const point = (e: { nativeEvent: MouseEvent }) => {
    const c = canvas.current!
    return {
      x: Math.min(1, Math.max(0, e.nativeEvent.offsetX / c.offsetWidth)),
      y: Math.min(1, Math.max(0, e.nativeEvent.offsetY / c.offsetHeight)),
    }
  }
  const move = useRef<{ x: number; y: number } | null>(null)
  const raf = useRef(0)
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  // wheel needs a non-passive listener to keep the OS from scrolling
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    let pending = { dx: 0, dy: 0, x: 0, y: 0 }
    let frame = 0
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? c.offsetHeight : 1
      pending = {
        dx: pending.dx + e.deltaX * scale,
        dy: pending.dy + e.deltaY * scale,
        x: e.offsetX / c.offsetWidth,
        y: e.offsetY / c.offsetHeight,
      }
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const clamp = (v: number) => Math.max(-5000, Math.min(5000, v))
        const x = Math.min(1, Math.max(0, pending.x))
        const y = Math.min(1, Math.max(0, pending.y))
        remote.input({ t: 'wheel', x, y, dx: clamp(pending.dx), dy: clamp(pending.dy) })
        pending = { dx: 0, dy: 0, x: 0, y: 0 }
      })
    }
    c.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      c.removeEventListener('wheel', onWheel)
      cancelAnimationFrame(frame)
    }
  }, [remote])

  const sendKey = (kind: 'down' | 'up', e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing || SKIP_KEYS.has(e.key)) return
    e.preventDefault()
    // characters Chromium's US keyboard can't press are typed as text
    if (e.key.length === 1 && e.key.charCodeAt(0) > 126) {
      if (kind === 'down') remote.input({ t: 'text', text: e.key })
      return
    }
    remote.input({ t: 'key', kind, key: e.key })
  }

  const blocked = state?.blocked
  return (
    <div ref={box} className="relative h-full min-h-40 overflow-hidden bg-white">
      <canvas
        ref={canvas}
        tabIndex={0}
        aria-label={state?.title || 'Live page'}
        style={{ cursor: remote.cursor }}
        className="block size-full outline-none"
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          e.currentTarget.focus()
          e.currentTarget.setPointerCapture(e.pointerId)
          remote.input({ t: 'mouse', kind: 'down', ...point(e), button: BUTTONS[e.button] ?? 'left', clicks: Math.min(3, Math.max(1, e.detail)) })
        }}
        onPointerUp={(e) => {
          remote.input({ t: 'mouse', kind: 'up', ...point(e), button: BUTTONS[e.button] ?? 'left', clicks: Math.min(3, Math.max(1, e.detail)) })
        }}
        onPointerMove={(e) => {
          move.current = point(e)
          if (raf.current) return
          raf.current = requestAnimationFrame(() => {
            raf.current = 0
            if (move.current) remote.input({ t: 'mouse', kind: 'move', ...move.current, button: 'left', clicks: 1 })
          })
        }}
        onKeyDown={(e) => sendKey('down', e)}
        onKeyUp={(e) => sendKey('up', e)}
        onPaste={(e) => {
          const text = e.clipboardData.getData('text').slice(0, 500)
          if (text) remote.input({ t: 'text', text })
          e.preventDefault()
        }}
      />

      {state?.loading && !blocked && (
        <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-teal/20">
          <div className="h-full w-1/3 animate-[loading-bar_1.1s_ease-in-out_infinite] bg-teal" />
        </div>
      )}

      {!painted && !blocked && (
        <div className="absolute inset-0 grid place-items-center bg-background text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" /> Starting the browser…
          </span>
        </div>
      )}

      {blocked && (
        <div className="absolute inset-0 grid place-items-center bg-background/95 p-6 text-center">
          <div className="max-w-sm space-y-3">
            <div className="mx-auto grid size-12 place-items-center rounded-md border-2 border-vx-edge bg-muted">
              <ShieldOff className="size-6" />
            </div>
            <h2 className="font-heading text-base font-semibold sm:text-lg">{prettyUrl(blocked).split('/')[0]} isn't open in this browser</h2>
            <p className="text-sm text-muted-foreground">
              This browser runs on the portfolio's server, so it only visits GitHub, LinkedIn and the project sites.
            </p>
            <a
              href={blocked}
              target="_blank"
              rel="noopener noreferrer"
              className="vx-sm vx-press inline-flex items-center gap-1.5 bg-card px-3 py-1.5 text-xs font-medium sm:text-sm"
            >
              Open in a real tab <SquareArrowOutUpRight className="size-3.5" />
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

/** Shown in place of the page when the server ended the session. */
export function RemoteEnded({ message, onRestart }: { message: string; onRestart: () => void }) {
  return (
    <div className="grid h-full min-h-60 place-items-center p-6 text-center">
      <div className="max-w-sm space-y-3">
        <p className="text-sm text-muted-foreground">{message || 'The live browser session ended.'}</p>
        <button type="button" onClick={onRestart} className="vx-sm vx-press inline-flex items-center gap-1.5 bg-card px-3 py-1.5 text-xs font-medium sm:text-sm">
          <RotateCw className="size-3.5" /> Start it again
        </button>
      </div>
    </div>
  )
}
