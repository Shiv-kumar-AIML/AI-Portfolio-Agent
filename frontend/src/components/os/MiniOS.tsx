import {
  ArrowUp,
  BatteryFull,
  Briefcase,
  Check,
  CheckCheck,
  Copy,
  FileText,
  FolderGit2,
  Layers,
  Mail,
  MessageCircle,
  Power,
  RotateCcw,
  Square,
  Wifi,
} from 'lucide-react'
import { AnimatePresence, motion, useDragControls } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { socialLinks } from '@/components/BrandIcons'
import { ToolCardView } from '@/components/cards'
import { Sources } from '@/components/chat/Sources'
import { deskSignals, getScreenQuad, quadTransform, subscribeScreenQuad } from '@/components/desk/signals'
import { useClock } from '@/components/LocalTimePill'
import { Markdown } from '@/components/Markdown'
import { useTheme } from '@/components/theme'
import { cn } from '@/lib/utils'
import type { AssistantMessage, Message, PublicProfile, UserMessage } from '@/types'

/**
 * "ShivOS" — the conversation, shown as a little operating system on the character's laptop.
 * The camera dives into the screen (DeskScene) and this overlay takes over exactly where the
 * screen fills the view: menu bar, desktop icons, a draggable Messages window, a dock.
 *
 * The owner "types" every answer: while the reply streams it is typed into the composer letter by
 * letter (that's his keyboard), then the send button presses and the message pops into the thread.
 * Red closes the conversation (and the camera flies back out); yellow minimises to the dock.
 */

const WALLPAPER = {
  light: 'linear-gradient(180deg, #bfe3e6 0%, #e6eedd 45%, #f6eee2 72%, #f3d2b0 100%)',
  dark: 'linear-gradient(180deg, #0d1024 0%, #1b1e3a 55%, #2f2346 100%)',
}

// exit depends on why the window goes away (read at exit time through AnimatePresence `custom`)
const WINDOW_VARIANTS = {
  hidden: { opacity: 0, scale: 0.92, y: 24 },
  shown: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring' as const, stiffness: 260, damping: 26 } },
  gone: (w: string) =>
    w === 'closing'
      ? { opacity: 0, scale: 0.85, transition: { duration: 0.22 } }
      : { opacity: 0, scale: 0.3, y: 320, transition: { duration: 0.35 } },
}

const QUESTIONS = {
  projects: 'What projects have you built?',
  skills: 'What are your skills and tech stack?',
  experience: 'Walk me through your work experience.',
}

const initials = (name?: string) =>
  (name ?? 'SK')
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

// ---------------------------------------------------------------- typing the reply

const TYPE_CPS = 75 // characters per second while the answer is still streaming
const FINISH_WITHIN = 1.8 // once the stream is done, finish typing within this many seconds

/** Reveals `text` like someone typing it; `settled` = the source text won't grow any more. */
function useTypewriter(text: string, settled: boolean, key: string | undefined) {
  const [shown, setShown] = useState(0)
  const pos = useRef(0)
  const latest = useRef({ text, settled })
  latest.current = { text, settled }
  useEffect(() => {
    pos.current = 0
    setShown(0)
    if (!key) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      const { text: t, settled: done } = latest.current
      const remaining = t.length - pos.current
      if (remaining > 0) {
        const cps = done ? Math.max(TYPE_CPS, remaining / FINISH_WITHIN) : TYPE_CPS
        pos.current = Math.min(t.length, pos.current + cps * dt)
        setShown(Math.floor(pos.current))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [key])
  return Math.min(shown, text.length)
}

// ---------------------------------------------------------------- composer

function Composer({
  live,
  busy,
  onSend,
  onStop,
  onDelivered,
  ownerFirstName,
}: {
  live: AssistantMessage | undefined
  busy: boolean
  onSend: (text: string) => void
  onStop: () => void
  onDelivered: (id: string) => void
  ownerFirstName: string
}) {
  const [value, setValue] = useState('')
  const [pressing, setPressing] = useState(false)
  const ta = useRef<HTMLTextAreaElement>(null)
  const draftBox = useRef<HTMLDivElement>(null)
  const settled = !!live && live.status !== 'streaming'
  const shown = useTypewriter(live?.text ?? '', settled, live?.id)
  const draft = live ? live.text.slice(0, shown) : ''
  const finishedTyping = !!live && settled && shown >= live.text.length

  // his hands on the 3D keyboard type faster while this is going on
  useEffect(() => {
    deskSignals.typing = !!live && !finishedTyping
    return () => {
      deskSignals.typing = false
    }
  }, [live, finishedTyping])

  // when he's done typing: press send, then the message goes out
  useEffect(() => {
    if (!live || !finishedTyping) return
    setPressing(true)
    const t1 = setTimeout(() => setPressing(false), 180)
    const t2 = setTimeout(() => onDelivered(live.id), 260)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [finishedTyping, live, onDelivered])

  useLayoutEffect(() => {
    if (draftBox.current) draftBox.current.scrollTop = draftBox.current.scrollHeight
  }, [draft])

  const runningStep = live?.steps.findLast((s) => s.status === 'running')
  const send = () => {
    const text = value.trim()
    if (!text || busy) return
    onSend(text)
    setValue('')
  }

  return (
    <div className="border-t bg-background/70 px-3 pt-2 pb-3 backdrop-blur sm:px-4">
      {/* what's going on at the other end of the keyboard */}
      <div className="mb-1.5 flex h-5 items-center gap-1.5 text-[11px] text-muted-foreground sm:text-xs">
        <AnimatePresence mode="wait">
          {live ? (
            <motion.span
              key={runningStep ? `step-${runningStep.id}` : draft ? 'typing' : 'thinking'}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="inline-flex items-center gap-1.5"
            >
              {runningStep ? (
                <>🔎 {runningStep.label}</>
              ) : draft ? (
                <>⌨️ {ownerFirstName} is typing…</>
              ) : (
                <>💭 {ownerFirstName} is thinking…</>
              )}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      <div
        className={cn(
          'vx-sm flex items-end gap-2 bg-card py-1.5 pr-1.5 pl-3 transition-shadow',
          !live && 'focus-within:ring-4 focus-within:ring-teal/25'
        )}
      >
        {live ? (
          // his draft, being typed
          <div
            ref={draftBox}
            className="max-h-28 min-h-9 flex-1 overflow-hidden py-1.5 text-sm leading-relaxed whitespace-pre-wrap sm:text-[15px]"
          >
            {draft}
            <span className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[2px] animate-pulse bg-foreground" />
          </div>
        ) : (
          <textarea
            ref={ta}
            value={value}
            rows={1}
            autoFocus
            aria-label="Message"
            placeholder={`Message ${ownerFirstName}…`}
            onChange={(e) => {
              setValue(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = `${Math.min(e.target.scrollHeight, 112)}px`
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send()
              }
            }}
            className="max-h-28 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground sm:text-[15px]"
          />
        )}
        {live && !settled ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop"
            className="vx-sm grid size-9 shrink-0 place-items-center rounded-md bg-muted text-foreground"
          >
            <Square className="size-3.5 fill-current" />
          </button>
        ) : (
          <motion.button
            type="button"
            onClick={send}
            disabled={!live && (!value.trim() || busy)}
            aria-label="Send"
            animate={pressing ? { scale: 0.82 } : { scale: 1 }}
            transition={{ type: 'spring', stiffness: 600, damping: 18 }}
            className="vx-sm grid size-9 shrink-0 place-items-center rounded-md bg-teal text-white disabled:opacity-50 dark:text-[#0d1024]"
          >
            <ArrowUp className="size-4" />
          </motion.button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- thread

function UserBubble({ message, seen }: { message: UserMessage; seen: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      className="flex flex-col items-end"
    >
      <div className="vx-sm max-w-[82%] rounded-md bg-teal px-3.5 py-2 text-sm whitespace-pre-wrap text-white sm:text-[15px] dark:text-[#0d1024]">
        {message.text}
      </div>
      {seen && (
        <span className="mt-0.5 mr-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <CheckCheck className="size-3 text-teal" /> Read
        </span>
      )}
    </motion.div>
  )
}

function OwnerAvatar({ name }: { name?: string }) {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-[4px] border-2 border-vx-edge bg-wood font-pixel text-[10px] font-bold text-white">
      {initials(name)}
    </span>
  )
}

function CopyAnswer({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      aria-label="Copy answer"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1400)
        } catch {
          /* clipboard blocked */
        }
      }}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function AssistantBubble({
  message,
  name,
  isLast,
  busy,
  onRetry,
  onAsk,
}: {
  message: AssistantMessage
  name?: string
  isLast: boolean
  busy: boolean
  onRetry: () => void
  onAsk: (q: string) => void
}) {
  const failed = message.status === 'error'
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 26 }}
      className="flex gap-2"
    >
      <OwnerAvatar name={name} />
      <div className="min-w-0 max-w-[88%] space-y-2">
        {message.text && (
          <div className="vx-sm rounded-md bg-card px-3.5 py-2 text-sm sm:text-[15px]">
            <Markdown text={message.text} />
          </div>
        )}
        {message.cards.map((card) => (
          <ToolCardView key={card.id} card={card} />
        ))}
        {failed && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl rounded-bl-md border border-destructive/30 bg-destructive/5 px-3.5 py-2 text-sm">
            <span className="flex-1">{message.error || 'Something went wrong.'}</span>
            {isLast && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs hover:bg-muted"
              >
                <RotateCcw className="size-3" /> Retry
              </button>
            )}
          </div>
        )}
        {message.status === 'stopped' && isLast && (
          <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <RotateCcw className="size-3" /> Stopped — ask again
          </button>
        )}
        {!failed && (message.sources.length > 0 || message.text) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Sources sources={message.sources} />
            {message.text && message.status === 'done' && <CopyAnswer text={message.text} />}
          </div>
        )}
        {isLast && message.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {message.suggestions.map((s, i) => (
              <motion.button
                key={s}
                type="button"
                disabled={busy}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.06 }}
                onClick={() => onAsk(s)}
                className="vx-sm vx-press bg-card px-3 py-1 text-left text-xs sm:text-[13px]"
              >
                {s}
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

function TypingBubble({ name }: { name?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} className="flex gap-2">
      <OwnerAvatar name={name} />
      <div className="vx-sm flex items-center gap-1 rounded-md bg-card px-3.5 py-3">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-1.5 rounded-full bg-muted-foreground/70"
            animate={{ y: [0, -4, 0], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------- window chrome

function TrafficLights({ onClose, onMinimize, onMaximize }: { onClose: () => void; onMinimize: () => void; onMaximize: () => void }) {
  const dot = 'group/dot grid size-3.5 place-items-center rounded-[3px] border-2 border-vx-edge text-[8px] font-black leading-none text-black/70 sm:size-4'
  return (
    <div className="group flex items-center gap-1.5 sm:gap-2" onPointerDown={(e) => e.stopPropagation()}>
      <button type="button" aria-label="Close conversation" onClick={onClose} className={cn(dot, 'bg-[#ff5f57]')}>
        <span className="opacity-0 group-hover:opacity-100">×</span>
      </button>
      <button type="button" aria-label="Minimise" onClick={onMinimize} className={cn(dot, 'bg-[#febc2e]')}>
        <span className="opacity-0 group-hover:opacity-100">–</span>
      </button>
      <button type="button" aria-label="Maximise" onClick={onMaximize} className={cn(dot, 'bg-[#28c840]')}>
        <span className="opacity-0 group-hover:opacity-100">+</span>
      </button>
    </div>
  )
}

function DesktopIcon({ label, onOpen, children }: { label: string; onOpen: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-20 flex-col items-center gap-1 rounded-lg p-1.5 text-center outline-none focus-visible:bg-white/20"
    >
      <span className="grid size-12 place-items-center overflow-hidden rounded-md border-2 border-vx-edge shadow-[0_3px_0_var(--vx-edge)] transition-transform group-hover:-translate-y-0.5 group-active:translate-y-0.5">
        {children}
      </span>
      <span className="rounded px-1 font-pixel text-[12px] font-medium text-foreground">{label}</span>
    </button>
  )
}

function DockItem({ label, onClick, running, children, tint }: { label: string; onClick: () => void; running?: boolean; children: ReactNode; tint: string }) {
  return (
    <div className="group relative flex flex-col items-center">
      <span className="pointer-events-none absolute -top-8 rounded-md bg-foreground/85 px-2 py-0.5 text-[11px] whitespace-nowrap text-background opacity-0 transition-opacity group-hover:opacity-100">
        {label}
      </span>
      <motion.button
        type="button"
        aria-label={label}
        onClick={onClick}
        whileHover={{ y: -6, scale: 1.15 }}
        whileTap={{ scale: 0.92 }}
        transition={{ type: 'spring', stiffness: 400, damping: 18 }}
        className={cn('grid size-10 place-items-center rounded-md border-2 border-vx-edge text-white shadow-[0_3px_0_var(--vx-edge)] sm:size-11', tint)}
      >
        {children}
      </motion.button>
      <span className={cn('mt-1 size-1 rounded-full bg-foreground/70', running ? 'opacity-100' : 'opacity-0')} />
    </div>
  )
}

// ---------------------------------------------------------------- the OS

export function MiniOS({
  profile,
  messages,
  busy,
  onSend,
  onStop,
  onRetry,
  onClose,
  onContact,
  restored = false,
  pov = false,
}: {
  profile: PublicProfile | null
  messages: Message[]
  busy: boolean
  onSend: (text: string) => void
  onStop: () => void
  onRetry: () => void
  /** end the conversation and leave the laptop */
  onClose: () => void
  onContact: () => void
  /** the conversation was restored by a reload: show the existing answers as already sent */
  restored?: boolean
  /** show the OS on the laptop screen, from the character's eyes (else full-screen) */
  pov?: boolean
}) {
  const { resolvedTheme } = useTheme()
  const { time } = useClock(profile?.timezone)

  // Where the laptop screen is on the page (reported by the desk scene once the camera sits at his
  // eyes). The OS is laid out at the screen's on-page size and mapped onto those 4 corners.
  const quad = useSyncExternalStore(subscribeScreenQuad, getScreenQuad)
  const screenSize = useMemo(() => {
    if (!quad) return { w: 0, h: 0 }
    const len = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)
    return {
      w: Math.round((len(quad.tl, quad.tr) + len(quad.bl, quad.br)) / 2),
      h: Math.round((len(quad.tl, quad.bl) + len(quad.tr, quad.br)) / 2),
    }
  }, [quad])
  // no quad yet (3D still starting after a reload): wait briefly, then fall back to full-screen
  const [gaveUp, setGaveUp] = useState(false)
  useEffect(() => {
    if (!pov || quad) return
    const t = setTimeout(() => setGaveUp(true), 1500)
    return () => clearTimeout(t)
  }, [pov, quad])
  const onScreen = pov && !!quad && !gaveUp
  const waiting = pov && !quad && !gaveUp
  const desktop = useRef<HTMLDivElement>(null)
  const drag = useDragControls()
  // on the laptop screen the conversation gets the whole screen (maximised) to stay readable
  const [win, setWin] = useState<'open' | 'min' | 'max' | 'closing'>(pov ? 'max' : 'open')
  const name = profile?.name
  const first = profile?.firstName ?? 'Shiv'
  const links = socialLinks(profile?.socials)
  const github = links.find((l) => l.key === 'github')
  const linkedin = links.find((l) => l.key === 'linkedin')

  // Which answers have been "sent". In a conversation restored by a reload they all have; every
  // new answer — even one that finished streaming during the camera flight — is typed first.
  const [delivered, setDelivered] = useState<Set<string>>(
    () =>
      new Set(
        restored ? messages.filter((m) => m.role === 'assistant' && m.status !== 'streaming').map((m) => m.id) : []
      )
  )
  const markDelivered = useMemo(() => (id: string) => setDelivered((d) => new Set(d).add(id)), [])
  const last = messages[messages.length - 1]
  const live = last?.role === 'assistant' && !delivered.has(last.id) ? last : undefined
  // errors and stops skip the typing — there's nothing to type
  useEffect(() => {
    if (live && (live.status === 'error' || live.status === 'stopped' || (live.status === 'done' && !live.text))) {
      markDelivered(live.id)
    }
  }, [live, markDelivered])

  const thread = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = thread.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages.length, delivered, live?.cards.length])

  const ask = (q: string) => {
    setWin((w) => (w === 'min' ? 'open' : w))
    if (!busy) onSend(q)
  }
  const close = () => setWin('closing')

  const lastDeliveredAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && delivered.has(m.id))

  return (
    <motion.div
      className={cn('fixed inset-0 z-50 select-none', waiting && 'invisible')}
      style={{ pointerEvents: onScreen ? 'none' : undefined }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* at his eyes: soften the room around the screen so the eye goes to it */}
      {onScreen && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at 50% 45%, transparent 45%, rgba(0,0,0,0.28) 100%)' }}
        />
      )}
      <div
        className="absolute overflow-hidden"
        style={{
          background: resolvedTheme === 'dark' ? WALLPAPER.dark : WALLPAPER.light,
          containerType: 'size',
          ...(onScreen && quad
            ? {
                left: 0,
                top: 0,
                width: screenSize.w,
                height: screenSize.h,
                transformOrigin: '0 0',
                transform: quadTransform(screenSize.w, screenSize.h, quad),
                pointerEvents: 'auto',
                borderRadius: 3,
              }
            : { inset: 0 }),
        }}
      >
      {/* wallpaper texture: a faint voxel grid and a big wordmark */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center">
        <span className="font-heading text-[18cqw] font-black tracking-tighter text-foreground/[0.05]">ShivOS</span>
      </div>

      {/* menu bar */}
      <div className="relative z-20 flex h-8 items-center justify-between border-b-2 border-vx-edge bg-card/80 px-3 font-pixel text-xs font-medium backdrop-blur sm:px-4 sm:text-[13px]">
        <div className="flex items-center gap-4">
          <span className="font-bold tracking-wide text-wood">▣ {first}OS</span>
          <span className="hidden sm:inline">Messages</span>
          <span className="hidden text-muted-foreground md:inline">File</span>
          <span className="hidden text-muted-foreground md:inline">View</span>
          <span className="hidden text-muted-foreground md:inline">Help</span>
        </div>
        <div className="flex items-center gap-3">
          <Wifi className="size-3.5" />
          <BatteryFull className="size-4" />
          <span className="font-mono tabular-nums">{time}</span>
          <button type="button" onClick={close} aria-label="Shut down and leave" className="rounded p-0.5 hover:bg-foreground/10">
            <Power className="size-3.5" />
          </button>
        </div>
      </div>

      <div ref={desktop} className="absolute inset-x-0 top-8 bottom-0">
        {/* desktop icons */}
        <div className="absolute top-4 left-3 hidden flex-col gap-2 md:flex">
          <DesktopIcon label="Projects" onOpen={() => ask(QUESTIONS.projects)}>
            <span className="grid size-full place-items-center rounded-2xl bg-gradient-to-br from-violet-400 to-violet-600">
              <FolderGit2 className="size-6 text-white" />
            </span>
          </DesktopIcon>
          <DesktopIcon label="Skills" onOpen={() => ask(QUESTIONS.skills)}>
            <span className="grid size-full place-items-center rounded-2xl bg-gradient-to-br from-sky-400 to-sky-600">
              <Layers className="size-6 text-white" />
            </span>
          </DesktopIcon>
          <DesktopIcon label="Experience" onOpen={() => ask(QUESTIONS.experience)}>
            <span className="grid size-full place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600">
              <Briefcase className="size-6 text-white" />
            </span>
          </DesktopIcon>
          {profile?.resumeUrl && (
            <DesktopIcon label="Resume.pdf" onOpen={() => window.open(profile.resumeUrl, '_blank', 'noopener,noreferrer')}>
              <span className="grid size-full place-items-center rounded-2xl bg-gradient-to-br from-rose-400 to-rose-600">
                <FileText className="size-6 text-white" />
              </span>
            </DesktopIcon>
          )}
        </div>

        {/* the Messages window */}
        <AnimatePresence custom={win} onExitComplete={() => win === 'closing' && onClose()}>
          {(win === 'open' || win === 'max') && (
            <motion.section
              key="messages"
              drag={win === 'open'}
              dragControls={drag}
              dragListener={false}
              dragMomentum={false}
              dragConstraints={desktop}
              dragElastic={0.05}
              custom={win}
              variants={WINDOW_VARIANTS}
              initial="hidden"
              animate="shown"
              exit="gone"
              className={cn(
                'absolute flex flex-col overflow-hidden border-2 border-vx-edge bg-background shadow-[0_8px_0_var(--vx-edge)] select-text',
                win === 'max'
                  ? 'inset-x-0 top-0 bottom-[4.5rem] rounded-none'
                  : 'inset-x-2 top-2 bottom-20 rounded-lg sm:inset-x-auto sm:top-[6%] sm:bottom-auto sm:left-[calc(50%-min(380px,46cqw))] sm:h-[min(620px,74cqh)] sm:w-[min(760px,92cqw)]'
              )}
            >
              {/* title bar — the drag handle */}
              <header
                onPointerDown={(e) => win === 'open' && drag.start(e)}
                className="flex h-11 shrink-0 cursor-grab items-center gap-3 border-b-2 border-vx-edge bg-wood px-3.5 text-white active:cursor-grabbing"
              >
                <TrafficLights onClose={close} onMinimize={() => setWin('min')} onMaximize={() => setWin((w) => (w === 'max' ? 'open' : 'max'))} />
                <div className="flex min-w-0 flex-1 items-center justify-center gap-2 pr-12">
                  <OwnerAvatar name={name} />
                  <div className="min-w-0 leading-tight">
                    <div className="truncate font-pixel text-sm font-semibold tracking-wide">{name ?? 'Shiv'}</div>
                    <div className="font-pixel text-[11px] text-white/85">
                      {live ? (
                        <span>typing…</span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <span className="size-1.5 bg-emerald-300" /> online
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </header>

              <div ref={thread} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-5">
                <div className="mx-auto mb-2 w-fit rounded-[4px] bg-muted px-3 py-1 font-pixel text-[11px] text-muted-foreground">
                  Today · you're chatting with {first}'s AI
                </div>
                {messages.map((m) => {
                  if (m.role === 'user') {
                    const next = messages[messages.indexOf(m) + 1]
                    return <UserBubble key={m.id} message={m} seen={!!next} />
                  }
                  if (!delivered.has(m.id)) return null
                  return (
                    <AssistantBubble
                      key={m.id}
                      message={m}
                      name={name}
                      isLast={m === lastDeliveredAssistant && m === last}
                      busy={busy}
                      onRetry={onRetry}
                      onAsk={ask}
                    />
                  )
                })}
                <AnimatePresence>{live && <TypingBubble key="typing" name={name} />}</AnimatePresence>
              </div>

              <Composer live={live} busy={busy} onSend={ask} onStop={onStop} onDelivered={markDelivered} ownerFirstName={first} />
            </motion.section>
          )}
        </AnimatePresence>

        {/* minimised: a gentle hint */}
        <AnimatePresence>
          {win === 'min' && (
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              onClick={() => setWin('open')}
              className="vx-sm absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-4 py-2 font-pixel text-sm"
            >
              💬 Messages is in the dock — click to reopen
            </motion.button>
          )}
        </AnimatePresence>

        {/* dock */}
        <div className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2">
          <div className="vx flex items-end gap-2 bg-card/85 px-2.5 pt-2 pb-1 backdrop-blur sm:gap-2.5">
            <DockItem label="Messages" running onClick={() => setWin((w) => (w === 'min' ? 'open' : w))} tint="bg-gradient-to-br from-green-400 to-emerald-600">
              <MessageCircle className="size-5" />
            </DockItem>
            <DockItem label="Projects" onClick={() => ask(QUESTIONS.projects)} tint="bg-gradient-to-br from-violet-400 to-violet-600">
              <FolderGit2 className="size-5" />
            </DockItem>
            {github && (
              <DockItem label="GitHub" onClick={() => window.open(github.href, '_blank', 'noopener,noreferrer')} tint="bg-gradient-to-br from-neutral-700 to-neutral-900">
                <github.Icon className="size-5" />
              </DockItem>
            )}
            {linkedin && (
              <DockItem label="LinkedIn" onClick={() => window.open(linkedin.href, '_blank', 'noopener,noreferrer')} tint="bg-gradient-to-br from-sky-500 to-blue-700">
                <linkedin.Icon className="size-5" />
              </DockItem>
            )}
            <DockItem label="Contact" onClick={onContact} tint="bg-gradient-to-br from-orange-400 to-rose-500">
              <Mail className="size-5" />
            </DockItem>
            <span className="mx-0.5 mb-2 h-8 w-px self-center bg-foreground/15" />
            <DockItem label="Leave" onClick={close} tint="bg-gradient-to-br from-zinc-400 to-zinc-600">
              <Power className="size-5" />
            </DockItem>
          </div>
        </div>
      </div>
      </div>
    </motion.div>
  )
}
