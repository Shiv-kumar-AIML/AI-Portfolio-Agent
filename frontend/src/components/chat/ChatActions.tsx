import { createContext, useContext } from 'react'
import type { PublicProfile } from '@/types'

interface ChatActions {
  ask: (question: string) => void
  openContact: () => void
  profile: PublicProfile | null
  busy: boolean
}

export const ChatActionsContext = createContext<ChatActions>({
  ask: () => {},
  openContact: () => {},
  profile: null,
  busy: false,
})

export const useChatActions = () => useContext(ChatActionsContext)
