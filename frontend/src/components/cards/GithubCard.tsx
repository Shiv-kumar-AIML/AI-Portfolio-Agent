import { Star } from 'lucide-react'
import { GithubIcon } from '@/components/BrandIcons'
import { ExternalLink } from '@/components/ExternalLink'
import { Card, CardContent } from '@/components/ui/card'

interface GithubData {
  username: string
  profileUrl: string
  avatarUrl: string | null
  name: string | null
  publicRepos: number
  followers: number
  totalStars: number
  topLanguages: Array<{ name: string; repos: number }>
  recentRepos: Array<{
    name: string
    description: string | null
    url: string
    stars: number
    language: string | null
    updatedAt: string
  }>
}

// A fixed sequential ramp keeps the bar readable in both themes without per-language brand colors.
const BAR_COLORS = ['bg-violet-500', 'bg-fuchsia-500', 'bg-orange-400', 'bg-sky-500', 'bg-emerald-500', 'bg-amber-400']

const timeAgo = (iso: string) => {
  const days = Math.round((Date.now() - Date.parse(iso)) / 86_400_000)
  if (days < 1) return 'today'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.round(days / 30)}mo ago`
  return `${Math.round(days / 365)}y ago`
}

export function GithubCard({ data }: { data: GithubData }) {
  const totalLangRepos = data.topLanguages.reduce((sum, l) => sum + l.repos, 0) || 1
  const stats = [
    { label: 'Repos', value: data.publicRepos },
    { label: 'Stars', value: data.totalStars },
    { label: 'Followers', value: data.followers },
  ]
  return (
    <Card>
      <CardContent className="space-y-4">
        <ExternalLink href={data.profileUrl} className="flex items-center gap-3 hover:opacity-80">
          {data.avatarUrl ? (
            <img src={data.avatarUrl} alt="" className="size-10 rounded-full border" />
          ) : (
            <GithubIcon className="size-10" />
          )}
          <div>
            <div className="font-heading font-semibold">{data.name ?? data.username}</div>
            <div className="font-mono text-xs text-muted-foreground">@{data.username}</div>
          </div>
        </ExternalLink>
        <div className="grid grid-cols-3 gap-2">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border bg-background/60 px-3 py-2 text-center">
              <div className="font-heading text-lg font-semibold tabular-nums">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
        {data.topLanguages.length > 0 && (
          <div className="space-y-2">
            <div className="flex h-2 overflow-hidden rounded-full bg-muted">
              {data.topLanguages.map((l, i) => (
                <div
                  key={l.name}
                  className={BAR_COLORS[i % BAR_COLORS.length]}
                  style={{ width: `${(l.repos / totalLangRepos) * 100}%` }}
                  title={`${l.name}: ${l.repos} repos`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {data.topLanguages.map((l, i) => (
                <span key={l.name} className="inline-flex items-center gap-1">
                  <span className={`size-2 rounded-full ${BAR_COLORS[i % BAR_COLORS.length]}`} />
                  {l.name} <span className="tabular-nums">{Math.round((l.repos / totalLangRepos) * 100)}%</span>
                </span>
              ))}
            </div>
          </div>
        )}
        {data.recentRepos.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {data.recentRepos.map((repo) => (
              <li key={repo.name}>
                <ExternalLink
                  href={repo.url}
                  className="flex items-start justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <div className="truncate font-mono text-sm">{repo.name}</div>
                    {repo.description && (
                      <div className="line-clamp-1 text-xs text-muted-foreground">{repo.description}</div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                    {repo.language && <span className="hidden sm:inline">{repo.language}</span>}
                    <span className="inline-flex items-center gap-0.5 tabular-nums">
                      <Star className="size-3" /> {repo.stars}
                    </span>
                    <span>{timeAgo(repo.updatedAt)}</span>
                  </div>
                </ExternalLink>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
