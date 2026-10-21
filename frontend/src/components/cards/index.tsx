import { CircleCheck } from 'lucide-react'
import { motion } from 'motion/react'
import { useChatActions } from '@/components/chat/ChatActions'
import type { Project, ToolCard } from '@/types'
import { ContactCard } from './ContactCard'
import { ExperienceCard } from './ExperienceCard'
import { GithubCard } from './GithubCard'
import { OpenLinkCard } from './OpenLinkCard'
import { type ProfileData, ProfileCard } from './ProfileCard'
import { ProjectDetailCard } from './ProjectDetailCard'
import { ProjectsCard } from './ProjectsCard'
import { ResumeCard } from './ResumeCard'
import { SkillsCard } from './SkillsCard'

function MessageSentCard({ data }: { data: { name: string; email: string } }) {
  const { profile } = useChatActions()
  return (
    <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm">
      <CircleCheck className="size-5 shrink-0 text-emerald-500" />
      <span>
        Message delivered to {profile?.firstName ?? 'the owner'} — they'll reply to <strong>{data.email}</strong>.
      </span>
    </div>
  )
}

/* eslint-disable @typescript-eslint/no-explicit-any -- payload shapes are owned by ai-service tools */
function renderCard(card: ToolCard) {
  const data = card.data as any
  switch (card.card) {
    case 'profile':
      return <ProfileCard data={data as ProfileData} />
    case 'projects':
      return data?.projects?.length ? <ProjectsCard data={data} /> : null
    case 'project':
      return <ProjectDetailCard data={data as Project} />
    case 'skills':
      return <SkillsCard data={data} />
    case 'experience':
      return <ExperienceCard data={data} />
    case 'resume':
      return <ResumeCard data={data} />
    case 'contact':
      return <ContactCard data={data} />
    case 'github':
      return <GithubCard data={data} />
    case 'message_sent':
      return <MessageSentCard data={data} />
    case 'open_link':
      return typeof data?.url === 'string' ? <OpenLinkCard data={data} /> : null
    default:
      return null // a card type this frontend doesn't know yet
  }
}

export function ToolCardView({ card }: { card: ToolCard }) {
  const content = renderCard(card)
  if (!content) return null
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      {content}
    </motion.div>
  )
}
