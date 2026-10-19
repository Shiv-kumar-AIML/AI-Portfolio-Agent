import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { ChatActionsContext } from '@/components/chat/ChatActions'
import { ContactDialog } from '@/components/ContactDialog'
import { FluidCursor } from '@/components/FluidCursor'
import { Landing } from '@/components/Landing'
import { TopBar } from '@/components/TopBar'
import { useChat } from '@/hooks/useChat'
import { fetchProfile } from '@/lib/api'
import type { PublicProfile } from '@/types'

// The chat (markdown, cards, animations) is most of the bundle; the landing page doesn't need it.
const ChatView = lazy(() => import('@/components/chat/ChatView').then((m) => ({ default: m.ChatView })))

export default function App() {
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [contactOpen, setContactOpen] = useState(false)
  const chat = useChat()
  const inChat = chat.messages.length > 0

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

  const actions = useMemo(
    () => ({
      ask: (q: string) => void chat.send(q),
      openContact: () => setContactOpen(true),
      profile,
      busy: chat.isStreaming,
    }),
    [chat, profile]
  )

  const startOver = () => {
    chat.reset()
    window.scrollTo({ top: 0 })
  }

  return (
    <ChatActionsContext.Provider value={actions}>
      <div className={inChat ? 'relative flex h-dvh flex-col overflow-hidden' : 'relative flex min-h-dvh flex-col'}>
        <FluidCursor />
        <TopBar profile={profile} inChat={inChat} onContact={() => setContactOpen(true)} onHome={startOver} />
        {inChat ? (
          <Suspense fallback={<div className="flex-1" />}>
            <ChatView
              messages={chat.messages}
              busy={chat.isStreaming}
              onSend={(t) => void chat.send(t)}
              onStop={chat.stop}
              onRetry={chat.retry}
            />
          </Suspense>
        ) : (
          <Landing profile={profile} onAsk={(q) => void chat.send(q)} />
        )}
        <ContactDialog open={contactOpen} onOpenChange={setContactOpen} ownerName={profile?.firstName ?? 'me'} />
      </div>
    </ChatActionsContext.Provider>
  )
}
