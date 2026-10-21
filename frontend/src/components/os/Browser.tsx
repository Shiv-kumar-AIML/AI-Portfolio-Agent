import { ArrowLeft, ArrowRight, Globe, LayoutTemplate, Lock, Plus, RotateCw, SquareArrowOutUpRight, X } from 'lucide-react'
import { motion, useDragControls } from 'motion/react'
import { useCallback, useState, type RefObject } from 'react'
import { hasNativePage, isLiveUrl, NEW_TAB, normalizeUrl, prettyUrl } from '@/lib/browserUrl'
import type { RemoteBrowser } from '@/lib/remoteBrowser'
import { cn } from '@/lib/utils'
import type { PublicProfile, Socials } from '@/types'
import { BrowserPage, tabLabel } from './BrowserPages'
import { TrafficLights, WINDOW_VARIANTS } from './chrome'
import { RemoteEnded, RemoteScreen } from './RemoteScreen'

/**
 * The mini-OS browser: tabs, an address bar, and either the live page (a real Chromium on our
 * server, streamed — RemoteScreen) or, when that is unavailable, a preview from BrowserPages.
 * Links clicked anywhere in the OS — and links the agent opens — land here.
 */

/** The live browser's id for a tab. */
export const remoteTabId = (tab: Tab) => `t${tab.id}`

export interface Tab {
  id: number
  history: string[]
  index: number
  reloads: number
  /** the visitor's choice for the owner's GitHub/LinkedIn: the OS's own view or the live page */
  view?: 'simple' | 'live'
}

/** Which view the tab shows for a page that has both. */
export const viewOf = (tab: Tab) => tab.view ?? 'live'

/** Whether the tab's page runs in the live browser. */
export const usesLive = (tab: Tab, socials: Socials | undefined) => {
  const url = tab.history[tab.index]
  return isLiveUrl(url) && !(hasNativePage(url, socials) && viewOf(tab) === 'simple')
}

const MAX_TABS = 6
let nextTabId = 1

export function useBrowserTabs() {
  const [state, setState] = useState<{ tabs: Tab[]; activeId: number | null }>({ tabs: [], activeId: null })
  const update = useCallback((fn: (tab: Tab) => Tab) => {
    setState((s) => ({ ...s, tabs: s.tabs.map((t) => (t.id === s.activeId ? fn(t) : t)) }))
  }, [])

  /** A new tab on `url` — or the tab already showing it. */
  const open = useCallback((url: string) => {
    const id = nextTabId++
    setState((s) => {
      const existing = s.tabs.find((t) => t.history[t.index] === url)
      if (existing) return { ...s, activeId: existing.id }
      return { tabs: [...s.tabs, { id, history: [url], index: 0, reloads: 0 }].slice(-MAX_TABS), activeId: id }
    })
  }, [])

  const navigate = useCallback(
    (url: string) =>
      update((t) =>
        t.history[t.index] === url ? t : { ...t, history: [...t.history.slice(0, t.index + 1), url], index: t.index + 1, view: undefined }
      ),
    [update]
  )

  /** The live page moved on (a link was clicked in it, or a sign-in page): that's the tab's address now. */
  const replace = useCallback((id: number, url: string) => {
    setState((s) => ({
      ...s,
      tabs: s.tabs.map((t) => {
        if (t.id !== id || t.history[t.index] === url) return t
        return { ...t, history: t.history.map((u, i) => (i === t.index ? url : u)) }
      }),
    }))
  }, [])

  const close = useCallback((id: number) => {
    setState((s) => {
      const i = s.tabs.findIndex((t) => t.id === id)
      const tabs = s.tabs.filter((t) => t.id !== id)
      const activeId = s.activeId === id ? (tabs[Math.min(i, tabs.length - 1)]?.id ?? null) : s.activeId
      return { tabs, activeId }
    })
  }, [])

  return {
    tabs: state.tabs,
    active: state.tabs.find((t) => t.id === state.activeId),
    open,
    navigate,
    replace,
    close,
    select: useCallback((id: number) => setState((s) => ({ ...s, activeId: id })), []),
    back: useCallback(() => update((t) => ({ ...t, index: Math.max(0, t.index - 1) })), [update]),
    forward: useCallback(() => update((t) => ({ ...t, index: Math.min(t.history.length - 1, t.index + 1) })), [update]),
    reload: useCallback(() => update((t) => ({ ...t, reloads: t.reloads + 1 })), [update]),
    setView: useCallback((view: 'simple' | 'live') => update((t) => ({ ...t, view })), [update]),
    clear: useCallback(() => setState({ tabs: [], activeId: null }), []),
  }
}

export type BrowserTabs = ReturnType<typeof useBrowserTabs>

function AddressBar({ url, onGo }: { url: string; onGo: (url: string) => void }) {
  // what's being typed; null = show the tab's address
  const [draft, setDraft] = useState<string | null>(null)
  const secure = url.startsWith('https:')
  return (
    <form
      className="vx-sm flex min-w-0 flex-1 items-center gap-1.5 bg-card px-2.5 py-1"
      onSubmit={(e) => {
        e.preventDefault()
        const next = normalizeUrl(draft ?? url)
        if (!next) return
        setDraft(null)
        onGo(next)
        ;(document.activeElement as HTMLElement | null)?.blur()
      }}
    >
      {secure ? <Lock className="size-3 shrink-0 text-emerald-600" /> : <Globe className="size-3 shrink-0 text-muted-foreground" />}
      <input
        value={draft ?? prettyUrl(url)}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
        aria-label="Address"
        placeholder="Search or type a URL"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent font-mono text-xs outline-none placeholder:text-muted-foreground sm:text-[13px]"
      />
    </form>
  )
}

const navButton = 'grid size-7 shrink-0 place-items-center rounded-md text-foreground/80 hover:bg-foreground/10 disabled:opacity-35 disabled:hover:bg-transparent'

export function Browser({
  tabs,
  remote,
  profile,
  maximized,
  front,
  constraints,
  onClose,
  onMinimize,
  onMaximize,
  onFocus,
}: {
  tabs: BrowserTabs
  remote: RemoteBrowser
  profile: PublicProfile | null
  maximized: boolean
  front: boolean
  constraints: RefObject<HTMLDivElement | null>
  onClose: () => void
  onMinimize: () => void
  onMaximize: () => void
  onFocus: () => void
}) {
  const drag = useDragControls()
  const { active } = tabs
  const url = active ? active.history[active.index] : NEW_TAB
  const key = active ? remoteTabId(active) : ''
  const wantsLive = !!active && usesLive(active, profile?.socials)
  const live = wantsLive && remote.status !== 'unavailable'
  const native = !!active && hasNativePage(url, profile?.socials)
  const osName = `${profile?.firstName ?? 'Shiv'}OS`
  const simple = !!active && native && viewOf(active) === 'simple'
  const state = live ? remote.tabs.get(key) : undefined
  const canBack = !!state?.canBack || (!!active && active.index > 0)
  const canForward = !!state?.canForward || (!!active && active.index < active.history.length - 1)

  return (
    <motion.section
      drag={!maximized}
      dragControls={drag}
      dragListener={false}
      dragMomentum={false}
      dragConstraints={constraints}
      dragElastic={0.05}
      variants={WINDOW_VARIANTS}
      initial="hidden"
      animate="shown"
      exit="gone"
      onPointerDownCapture={onFocus}
      aria-label="Browser"
      className={cn(
        'absolute flex flex-col overflow-hidden border-2 border-vx-edge bg-background shadow-[0_8px_0_var(--vx-edge)] select-text',
        front ? 'z-[3]' : 'z-[2]',
        maximized
          ? 'inset-x-0 top-0 bottom-[4.5rem] rounded-none'
          : 'inset-x-2 top-2 bottom-20 rounded-lg sm:inset-x-auto sm:top-[8%] sm:bottom-auto sm:left-[calc(50%-min(400px,47cqw)+1.5rem)] sm:h-[min(640px,76cqh)] sm:w-[min(800px,94cqw)]'
      )}
    >
      {/* title bar: lights + tabs — the drag handle */}
      <header
        onPointerDown={(e) => !maximized && drag.start(e)}
        className={cn('flex h-10 shrink-0 items-end gap-3 bg-muted px-3 pt-1.5', !maximized && 'cursor-grab active:cursor-grabbing')}
      >
        <div className="self-center">
          <TrafficLights closeLabel="Close browser" onClose={onClose} onMinimize={onMinimize} onMaximize={onMaximize} />
        </div>
        <div className="flex min-w-0 flex-1 items-end gap-1 overflow-hidden" onPointerDown={(e) => e.stopPropagation()}>
          {tabs.tabs.map((tab) => {
            const label = tabLabel(tab.history[tab.index], profile)
            const icon = label.icon
            const title = (usesLive(tab, profile?.socials) && remote.tabs.get(remoteTabId(tab))?.title) || label.title
            const selected = tab.id === active?.id
            return (
              <div
                key={tab.id}
                className={cn(
                  'group flex h-8 max-w-44 min-w-0 flex-1 items-center gap-1.5 rounded-t-md pr-1 pl-2.5 text-xs sm:text-[13px]',
                  selected ? 'border-2 border-b-0 border-vx-edge bg-background' : 'text-muted-foreground hover:bg-background/50'
                )}
              >
                <button type="button" onClick={() => tabs.select(tab.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                  <span className="shrink-0">{icon}</span>
                  <span className="truncate">{title}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Close ${title}`}
                  onClick={() => tabs.close(tab.id)}
                  className="grid size-5 shrink-0 place-items-center rounded hover:bg-foreground/10"
                >
                  <X className="size-3" />
                </button>
              </div>
            )
          })}
          <button type="button" aria-label="New tab" onClick={() => tabs.open(NEW_TAB)} className={cn(navButton, 'mb-0.5')}>
            <Plus className="size-4" />
          </button>
        </div>
      </header>

      {/* toolbar */}
      <div className="flex shrink-0 items-center gap-1 border-y-2 border-vx-edge bg-background px-2 py-1.5">
        <button type="button" aria-label="Back" disabled={!canBack} onClick={() => (state?.canBack ? remote.back(key) : tabs.back())} className={navButton}>
          <ArrowLeft className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Forward"
          disabled={!canForward}
          onClick={() => (state?.canForward ? remote.forward(key) : tabs.forward())}
          className={navButton}
        >
          <ArrowRight className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Reload"
          disabled={!active}
          onClick={() => (!live ? tabs.reload() : remote.status === 'ended' ? remote.restart() : remote.reload(key))}
          className={navButton}
        >
          <RotateCw className="size-3.5" />
        </button>
        <AddressBar key={url} url={url} onGo={(next) => (active ? tabs.navigate(next) : tabs.open(next))} />
        {native && (
          <button
            type="button"
            onClick={() => tabs.setView(simple ? 'live' : 'simple')}
            title={simple ? 'Show the live page' : `Show a simple ${osName} view`}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-foreground/80 hover:bg-foreground/10 sm:text-xs"
          >
            {simple ? <Globe className="size-3.5" /> : <LayoutTemplate className="size-3.5" />}
            <span className="hidden sm:inline">{simple ? 'Live page' : 'Simple view'}</span>
          </button>
        )}
        {url !== NEW_TAB && (
          <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Open in a real tab" title="Open in a real tab" className={navButton}>
            <SquareArrowOutUpRight className="size-3.5" />
          </a>
        )}
      </div>

      {wantsLive && remote.status === 'unavailable' && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-amber-500/10 px-3 py-1.5 text-[11px] sm:text-xs">
          <span>{remote.message || 'The live browser is unavailable.'} Showing a preview.</span>
          <button type="button" onClick={() => remote.restart()} className="shrink-0 font-medium underline-offset-4 hover:underline">
            Try again
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {active && live ? (
          remote.status === 'ended' ? (
            <RemoteEnded message={remote.message} onRestart={() => remote.restart()} />
          ) : (
            <RemoteScreen key={key} remote={remote} tab={key} state={state} />
          )
        ) : active ? (
          <BrowserPage key={`${active.id}:${active.index}`} url={url} profile={profile} reloads={active.reloads} onNavigate={tabs.navigate} />
        ) : (
          <BrowserPage url={NEW_TAB} profile={profile} reloads={0} onNavigate={tabs.open} />
        )}
      </div>
    </motion.section>
  )
}
