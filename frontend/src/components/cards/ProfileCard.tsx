import { MapPin, Sparkles } from 'lucide-react'
import { socialLinks } from '@/components/BrandIcons'
import { ExternalLink } from '@/components/ExternalLink'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { Socials } from '@/types'

export interface ProfileData {
  name: string
  title: string
  tagline?: string
  bio?: string
  location?: string
  availability?: string
  avatar?: string
  highlights?: string[]
  socials?: Socials
}

export function ProfileCard({ data }: { data: ProfileData }) {
  const links = socialLinks(data.socials)
  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-4">
        <div className="flex items-start gap-4">
          <Avatar className="size-16 ring-2 ring-primary/10">
            <AvatarImage src={data.avatar} alt={data.name} />
            <AvatarFallback>{data.name.slice(0, 2)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h3 className="font-heading text-lg font-semibold sm:text-xl">{data.name}</h3>
            <p className="text-sm text-muted-foreground sm:text-base">{data.title}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {data.location && (
                <Badge variant="outline" className="gap-1">
                  <MapPin className="size-3" /> {data.location}
                </Badge>
              )}
              {data.availability && (
                <Badge variant="secondary" className="gap-1.5">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/60" />
                    <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                  </span>
                  Available
                </Badge>
              )}
            </div>
          </div>
        </div>
        {data.bio && <p className="text-sm leading-relaxed sm:text-[15px]">{data.bio}</p>}
        {!!data.highlights?.length && (
          <ul className="space-y-1.5">
            {data.highlights.map((h) => (
              <li key={h} className="flex gap-2 text-sm text-muted-foreground">
                <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
                {h}
              </li>
            ))}
          </ul>
        )}
        {links.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {links.map(({ key, label, href, Icon }) => (
              <ExternalLink
                key={key}
                href={href}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors hover:bg-muted sm:text-sm"
              >
                <Icon className="size-3.5" /> {label}
              </ExternalLink>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
