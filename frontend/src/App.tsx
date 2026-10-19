import { AnimatePresence } from 'motion/react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChatActionsContext } from '@/components/chat/ChatActions'
import { ContactDialog } from '@/components/ContactDialog'
import { FluidCursor } from '@/components/FluidCursor'
import { POV_MIN_WIDTH } from '@/components/desk/signals'
import { canRender3D, Landing } from '@/components/Landing'
import { TopBar } from '@/components/TopBar'
import { useChat } from '@/hooks/useChat'
import { fetchProfile } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { PublicProfile } from '@/types'

// The mini-OS (chat, markdown, cards) is most of the bundle; the landing page doesn't need it.
const MiniOS = lazy(() => import('@/components/os/MiniOS').then((m) => ({ default: m.MiniOS })))

/**
 * landing → (a question is asked) → diving: the camera orbits into the laptop screen
 *         → os: the conversation runs on the laptop's mini-OS
 *         → (the window is closed) → leaving: the camera flies back out → landing
 */
type Stage = 'landing' | 'diving' | 'os' | 'leaving'

// If the 3D scene can't report arrivals (no WebGL, chunk failed), don't get stuck mid-flight.
const FLIGHT_TIMEOUT_MS = { diving: 3500, leaving: 3000 }

export default function App() {
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [contactOpen, setContactOpen] = useState(false)
  const chat = useChat()
  const hasChat = chat.messages.length > 0
  // a reload that restores a conversation opens straight on the laptop, without the flight
  const instant = useRef(hasChat)
  const [stage, setStage] = useState<Stage>(() => (hasChat ? 'os' : 'landing'))

  useEffect(() => {
    fetchProfile()
      .then((p) => {
        setProfile(p)
        document.title = `${p.name} — ${p.title}`
      })
      .catch(() => {
        // The landing page still works with placeholders; chat reports its own errors.
      })
  }, [])

  // the first question takes the camera into the laptop
  useEffect(() => {
    if (stage === 'landing' && hasChat) setStage(canRender3D ? 'diving' : 'os')
  }, [stage, hasChat])

  useEffect(() => {
    if (stage !== 'diving' && stage !== 'leaving') return
    const t = setTimeout(() => setStage(stage === 'diving' ? 'os' : 'landing'), FLIGHT_TIMEOUT_MS[stage])
    return () => clearTimeout(t)
  }, [stage])

  const away = stage !== 'landing'
  const pov = canRender3D && window.innerWidth >= POV_MIN_WIDTH
  useEffect(() => {
    document.documentElement.style.overflow = away ? 'hidden' : ''
    if (away) window.scrollTo({ top: 0 })
  }, [away])

  const onArrive = useCallback((to: 0 | 1) => {
    setStage((s) => (to === 1 && s === 'diving' ? 'os' : to === 0 && s === 'leaving' ? 'landing' : s))
  }, [])

  const closeConversation = useCallback(() => {
    instant.current = false
    chat.reset()
    setStage(canRender3D ? 'leaving' : 'landing')
  }, [chat])

  const actions = useMemo(
    () => ({
      ask: (q: string) => void chat.send(q),
      openContact: () => setContactOpen(true),
      profile,
      busy: chat.isStreaming,
    }),
    [chat, profile]
  )

  return (
    <ChatActionsContext.Provider value={actions}>
      <div className="relative flex min-h-dvh flex-col">
        <FluidCursor />
        <div className={cn('transition-opacity duration-500', away && 'pointer-events-none opacity-0')}>
          <TopBar profile={profile} inChat={false} onContact={() => setContactOpen(true)} onHome={closeConversation} />
        </div>
        <Landing
          profile={profile}
          onAsk={(q) => void chat.send(q)}
          away={away}
          scene={{
            focused: stage === 'diving' || stage === 'os',
            instant: instant.current,
            // at his eyes the scene keeps running (his hands type); full-screen OS on phones covers it
            paused: stage === 'os' && !pov,
            onArrive,
          }}
        />
        <AnimatePresence>
          {stage === 'os' && (
            <Suspense key="os" fallback={null}>
              <MiniOS
                profile={profile}
                messages={chat.messages}
                busy={chat.isStreaming}
                onSend={(t) => void chat.send(t)}
                onStop={chat.stop}
                onRetry={chat.retry}
                onClose={closeConversation}
                onContact={() => setContactOpen(true)}
                restored={instant.current}
                pov={pov}
              />
            </Suspense>
          )}
        </AnimatePresence>
        <ContactDialog open={contactOpen} onOpenChange={setContactOpen} ownerName={profile?.firstName ?? 'me'} />
      </div>
    </ChatActionsContext.Provider>
  )
}
