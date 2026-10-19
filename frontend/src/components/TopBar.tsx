import { ChevronRight, SquarePen } from 'lucide-react'
import { motion } from 'motion/react'
import { socialLinks } from '@/components/BrandIcons'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button, buttonVariants } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { PublicProfile } from '@/types'

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

/**
 * Shared by the landing page and the chat: availability pill on the left, monogram (landing) or the
 * small avatar (chat — tapping it goes back home) in the middle, socials + theme on the right.
 */
export function TopBar({
  profile,
  inChat,
  onContact,
  onHome,
}: {
  profile: PublicProfile | null
  inChat: boolean
  onContact: () => void
  onHome: () => void
}) {
  const links = socialLinks(profile?.socials).filter((l) => l.key === 'github' || l.key === 'linkedin')

  return (
    <header className="relative z-30 shrink-0 px-4 pt-4 pb-2 sm:px-6 sm:pt-6">
      <div className="relative flex min-h-12 items-start justify-between gap-3 sm:min-h-14">
        <motion.button
          type="button"
          onClick={onContact}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur transition-shadow hover:shadow-md sm:px-4 sm:py-2 sm:text-sm"
        >
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/60" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          <span className="hidden sm:inline">Available for work</span>
          <span className="sm:hidden">Hire me</span>
          <ChevronRight className="size-3.5 text-muted-foreground" />
        </motion.button>

        <div className="absolute left-1/2 top-0 -translate-x-1/2">
          {inChat ? (
            <motion.button
              type="button"
              onClick={onHome}
              aria-label="Back to start"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              className="block transition-transform hover:scale-105"
            >
              <img
                src={profile?.avatar || '/avatar.svg'}
                alt={profile?.name ?? ''}
                className="h-12 w-auto object-contain drop-shadow-md sm:h-14"
                draggable={false}
              />
            </motion.button>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex size-12 items-center justify-center rounded-2xl border bg-background font-heading text-lg font-bold tracking-tight shadow-md sm:size-14 sm:text-xl"
              aria-label={profile?.name}
            >
              {profile ? initials(profile.name) : ''}
            </motion.div>
          )}
        </div>

        <div className="flex items-center gap-0.5 rounded-full border bg-background/80 p-0.5 shadow-sm backdrop-blur">
          {inChat && (
            <Tooltip>
              <TooltipTrigger
                render={<Button variant="ghost" size="icon" className="rounded-full" onClick={onHome} aria-label="New chat" />}
              >
                <SquarePen />
              </TooltipTrigger>
              <TooltipContent>New chat</TooltipContent>
            </Tooltip>
          )}
          {links.map(({ key, label, href, Icon }) => (
            <a
              key={key}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'hidden rounded-full sm:inline-flex')}
            >
              <Icon className="size-4" />
            </a>
          ))}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
