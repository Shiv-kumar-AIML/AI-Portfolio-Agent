import { Calendar, Check, Copy, Mail, MapPin, Send } from 'lucide-react'
import { useState } from 'react'
import { socialLinks } from '@/components/BrandIcons'
import { useChatActions } from '@/components/chat/ChatActions'
import { ExternalLink } from '@/components/ExternalLink'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Socials } from '@/types'

interface ContactData {
  name: string
  email?: string
  location?: string
  availability?: string
  calendlyUrl?: string | null
  socials?: Socials
}

export function ContactCard({ data }: { data: ContactData }) {
  const { openContact } = useChatActions()
  const [copied, setCopied] = useState(false)

  const copyEmail = async () => {
    if (!data.email) return
    try {
      await navigator.clipboard.writeText(data.email)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      window.location.href = `mailto:${data.email}`
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        {data.availability && <p className="text-sm text-muted-foreground">{data.availability}</p>}
        <div className="space-y-2">
          {data.email && (
            <div className="flex items-center gap-2 rounded-lg border bg-background/60 px-3 py-2">
              <Mail className="size-4 text-muted-foreground" />
              <a href={`mailto:${data.email}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                {data.email}
              </a>
              <Button variant="ghost" size="icon-sm" onClick={copyEmail} aria-label="Copy email">
                {copied ? <Check className="text-emerald-500" /> : <Copy />}
              </Button>
            </div>
          )}
          {data.location && (
            <div className="flex items-center gap-2 px-3 text-sm text-muted-foreground">
              <MapPin className="size-4" /> {data.location}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {socialLinks(data.socials).map(({ key, label, href, Icon }) => (
            <ExternalLink
              key={key}
              href={href}
              className={buttonVariants({ variant: 'outline' })}
            >
              <Icon /> {label}
            </ExternalLink>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button onClick={openContact}>
            <Send /> Write me a message
          </Button>
          {data.calendlyUrl && (
            <ExternalLink href={data.calendlyUrl} className={buttonVariants({ variant: 'secondary' })}>
              <Calendar /> Book a call
            </ExternalLink>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
