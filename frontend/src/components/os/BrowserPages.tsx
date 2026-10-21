import { BookOpen, FileText, Folder, FolderGit2, GitFork, Globe, Loader2, MapPin, ShieldOff, SquareArrowOutUpRight, Star } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { GithubIcon, LinkedinIcon, socialLinks } from '@/components/BrandIcons'
import { ExperienceCard } from '@/components/cards/ExperienceCard'
import { SkillsCard } from '@/components/cards/SkillsCard'
import { Markdown } from '@/components/Markdown'
import { fetchAbout, fetchGithub, fetchProjects, fetchRepo } from '@/lib/api'
import { pageFor, prettyUrl } from '@/lib/browserUrl'
import { cn } from '@/lib/utils'
import type { PublicProfile, RepoDetails } from '@/types'

/**
 * What a mini-OS browser tab shows for a URL (see lib/browserUrl.ts for why GitHub and LinkedIn are
 * drawn here instead of loaded).
 */

// ---------------------------------------------------------------- data

// Loaded once per page and reload, so switching tabs doesn't refetch.
const loaded = new Map<string, Promise<unknown>>()

function useData<T>(key: string, load: () => Promise<T>, reloads: number) {
  const k = `${key}#${reloads}`
  const loadRef = useRef(load)
  loadRef.current = load
  const [state, setState] = useState<{ k: string; data?: T; error?: string }>({ k: '' })
  useEffect(() => {
    let alive = true
    let p = loaded.get(k)
    if (!p) {
      p = loadRef.current()
      loaded.set(k, p)
      p.catch(() => loaded.delete(k))
    }
    p.then(
      (data) => alive && setState({ k, data: data as T }),
      (e: unknown) => alive && setState({ k, error: e instanceof Error ? e.message : 'Could not load this page' })
    )
    return () => {
      alive = false
    }
  }, [k])
  return state.k === k ? state : { k, data: undefined, error: undefined }
}

// A link out of the mini-OS, to the real site.
function RealSiteLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('vx-sm vx-press inline-flex items-center gap-1.5 bg-card px-3 py-1.5 text-xs font-medium sm:text-sm', className)}
    >
      {children} <SquareArrowOutUpRight className="size-3.5" />
    </a>
  )
}

function Loading() {
  return (
    <div className="grid h-full min-h-40 place-items-center text-sm text-muted-foreground">
      <span className="inline-flex items-center gap-2">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </span>
    </div>
  )
}

function Problem({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="grid h-full min-h-60 place-items-center p-6 text-center">
      <div className="max-w-sm space-y-3">
        <div className="mx-auto grid size-12 place-items-center rounded-md border-2 border-vx-edge bg-muted">{icon}</div>
        <h2 className="font-heading text-base font-semibold sm:text-lg">{title}</h2>
        {children}
      </div>
    </div>
  )
}

function Failed({ error, url }: { error: string; url: string }) {
  return (
    <Problem icon={<Globe className="size-6" />} title="This page didn't load">
      <p className="text-sm text-muted-foreground">{error}</p>
      <RealSiteLink href={url}>Open {prettyUrl(url).split('/')[0]}</RealSiteLink>
    </Problem>
  )
}

const timeAgo = (iso: string) => {
  const days = Math.round((Date.now() - Date.parse(iso)) / 86_400_000)
  if (days < 1) return 'today'
  if (days < 30) return `${days} days ago`
  if (days < 365) return `${Math.round(days / 30)} months ago`
  return `${Math.round(days / 365)} years ago`
}

const LANG_COLORS = ['bg-violet-500', 'bg-fuchsia-500', 'bg-orange-400', 'bg-sky-500', 'bg-emerald-500', 'bg-amber-400']

// ---------------------------------------------------------------- GitHub: a repo

function topLevel(files: string[]) {
  const dirs = new Set<string>()
  const plain: string[] = []
  for (const f of files) {
    const [head, ...rest] = f.split('/')
    if (rest.length) dirs.add(head)
    else plain.push(head)
  }
  return [...[...dirs].sort().map((name) => ({ name, dir: true })), ...plain.sort().map((name) => ({ name, dir: false }))]
}

function RepoPage({ repo, url, reloads }: { repo: string; url: string; reloads: number }) {
  const { data, error } = useData(`repo:${repo.toLowerCase()}`, () => fetchRepo(repo), reloads)
  if (error) return <Failed error={error} url={url} />
  if (!data) return <Loading />
  return <RepoView data={data} />
}

function RepoView({ data }: { data: RepoDetails }) {
  const [owner] = data.url.replace(/^https:\/\/github\.com\//, '').split('/')
  const entries = useMemo(() => topLevel(data.files), [data.files])
  // README links and images are relative to the repo
  const resolve = (href: string, key: string) => {
    if (/^([a-z][a-z\d+.-]*:|#|\/\/)/i.test(href)) return href
    const path = href.replace(/^\.?\//, '')
    return key === 'src'
      ? `https://raw.githubusercontent.com/${owner}/${data.name}/${data.defaultBranch}/${path}`
      : `${data.url}/blob/${data.defaultBranch}/${path}`
  }
  return (
    <div className="@container mx-auto max-w-5xl space-y-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex min-w-0 items-center gap-2 text-base sm:text-lg md:text-xl">
          <GithubIcon className="size-5 shrink-0" />
          <span className="truncate">
            <span className="text-muted-foreground">{owner} / </span>
            <span className="font-semibold">{data.name}</span>
          </span>
          <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">Public</span>
        </h1>
        <div className="flex items-center gap-2 text-xs sm:text-sm">
          <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1">
            <Star className="size-3.5" /> {data.stars}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1">
            <GitFork className="size-3.5" /> {data.forks}
          </span>
          <RealSiteLink href={data.url}>github.com</RealSiteLink>
        </div>
      </div>

      <div className="grid gap-4 @3xl:grid-cols-[1fr_15rem]">
        <div className="min-w-0 space-y-4">
          {/* files */}
          <div className="overflow-hidden rounded-md border-2 border-vx-edge">
            <div className="flex items-center justify-between border-b bg-muted px-3 py-2 text-xs sm:text-sm">
              <span className="font-medium">{data.defaultBranch}</span>
              <span className="text-muted-foreground">
                {data.totalFiles} files · updated {timeAgo(data.pushedAt)}
              </span>
            </div>
            <ul className="divide-y text-xs sm:text-sm">
              {entries.slice(0, 14).map((e) => (
                <li key={e.name} className="flex items-center gap-2 px-3 py-1.5">
                  {e.dir ? <Folder className="size-4 shrink-0 fill-sky-400/30 text-sky-500" /> : <FileText className="size-4 shrink-0 text-muted-foreground" />}
                  <span className="truncate font-mono">{e.name}</span>
                </li>
              ))}
              {entries.length > 14 && <li className="px-3 py-1.5 text-muted-foreground">…and {entries.length - 14} more</li>}
            </ul>
          </div>

          {/* README */}
          {data.readme ? (
            <div className="rounded-md border-2 border-vx-edge">
              <div className="flex items-center gap-2 border-b px-3 py-2 text-xs font-medium sm:text-sm">
                <BookOpen className="size-4" /> README
              </div>
              <div className="px-4 py-3 sm:px-6">
                <Markdown text={data.readme} resolveUrl={resolve} className="prose-img:my-1 prose-img:inline-block text-sm sm:text-[15px]" />
                {data.readmeTruncated && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    The README continues on{' '}
                    <a href={data.url} target="_blank" rel="noopener noreferrer" className="underline">
                      github.com
                    </a>
                    .
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">This repo has no README.</p>
          )}
        </div>

        {/* about */}
        <aside className="space-y-4 text-sm">
          <div className="space-y-2">
            <h2 className="font-semibold">About</h2>
            <p className="text-muted-foreground">{data.description || 'No description.'}</p>
            {data.homepage && (
              <a href={data.homepage} target="_blank" rel="noopener noreferrer" className="block truncate text-teal underline-offset-4 hover:underline">
                {prettyUrl(data.homepage)}
              </a>
            )}
            {data.topics.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {data.topics.map((t) => (
                  <span key={t} className="rounded-full bg-teal/10 px-2 py-0.5 text-[11px] text-teal sm:text-xs">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
          {data.languages.length > 0 && (
            <div className="space-y-2">
              <h2 className="font-semibold">Languages</h2>
              <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                {data.languages.map((l, i) => (
                  <div key={l.name} className={LANG_COLORS[i % LANG_COLORS.length]} style={{ width: `${l.percent}%` }} />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {data.languages.map((l, i) => (
                  <span key={l.name} className="inline-flex items-center gap-1">
                    <span className={cn('size-2 rounded-full', LANG_COLORS[i % LANG_COLORS.length])} />
                    {l.name} <span className="text-muted-foreground tabular-nums">{l.percent}%</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- GitHub: the profile

function GithubProfilePage({ url, reloads, onNavigate }: { url: string; reloads: number; onNavigate: (url: string) => void }) {
  const { data, error } = useData('github', fetchGithub, reloads)
  if (error) return <Failed error={error} url={url} />
  if (!data) return <Loading />
  const stats = [
    { label: 'repositories', value: data.publicRepos },
    { label: 'stars', value: data.totalStars },
    { label: 'followers', value: data.followers },
  ]
  return (
    <div className="@container mx-auto grid max-w-5xl gap-5 p-3 sm:p-5 @2xl:grid-cols-[13rem_1fr]">
      <div className="space-y-3">
        {data.avatarUrl ? (
          <img src={data.avatarUrl} alt="" className="size-20 rounded-full border-2 border-vx-edge @2xl:size-40" />
        ) : (
          <GithubIcon className="size-20" />
        )}
        <div>
          <h1 className="font-heading text-lg font-semibold sm:text-xl">{data.name ?? data.username}</h1>
          <p className="font-mono text-sm text-muted-foreground">{data.username}</p>
        </div>
        {data.bio && <p className="text-sm">{data.bio}</p>}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs sm:text-sm">
          {stats.map((s) => (
            <span key={s.label}>
              <strong className="tabular-nums">{s.value}</strong> <span className="text-muted-foreground">{s.label}</span>
            </span>
          ))}
        </div>
        <RealSiteLink href={data.profileUrl}>Follow on github.com</RealSiteLink>
      </div>
      <div className="min-w-0">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold sm:text-base">
          <FolderGit2 className="size-4" /> Repositories
        </h2>
        <ul className="divide-y rounded-md border-2 border-vx-edge">
          {data.allRepos.map((repo) => (
            <li key={repo.name}>
              <button
                type="button"
                onClick={() => onNavigate(`${data.profileUrl}/${repo.name}`)}
                className="block w-full px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
              >
                <div className="truncate font-mono text-sm font-medium text-teal">{repo.name}</div>
                {repo.description && <div className="line-clamp-2 text-xs text-muted-foreground sm:text-sm">{repo.description}</div>}
                {repo.language && <div className="mt-1 text-[11px] text-muted-foreground sm:text-xs">{repo.language}</div>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- LinkedIn

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

function LinkedinPage({ url, profile, reloads }: { url: string; profile: PublicProfile | null; reloads: number }) {
  const { data, error } = useData('about', fetchAbout, reloads)
  if (error) return <Failed error={error} url={url} />
  if (!data || !profile) return <Loading />
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-3 sm:p-5">
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground sm:text-xs">
        <LinkedinIcon className="size-3.5 text-[#0a66c2]" /> LinkedIn only shows profiles to signed-in members — this is the same profile, built from its data.
      </p>
      <section className="overflow-hidden rounded-md border-2 border-vx-edge bg-card">
        <div className="h-20 bg-gradient-to-r from-sky-600 via-blue-700 to-indigo-800 sm:h-24" />
        <div className="space-y-2 px-4 pb-4 sm:px-6">
          <div className="-mt-10 size-20 overflow-hidden rounded-full border-4 border-card bg-wood sm:size-24">
            {profile.avatar ? (
              <img src={profile.avatar} alt="" className="size-full object-cover" />
            ) : (
              <span className="grid size-full place-items-center font-pixel text-2xl font-bold text-white">{initials(profile.name)}</span>
            )}
          </div>
          <h1 className="font-heading text-lg font-semibold sm:text-xl md:text-2xl">{profile.name}</h1>
          <p className="text-sm sm:text-base">{profile.title}</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:text-sm">
            {profile.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" /> {profile.location}
              </span>
            )}
            {profile.availability && <span className="text-emerald-600 dark:text-emerald-400">{profile.availability}</span>}
          </p>
          <RealSiteLink href={url} className="bg-[#0a66c2] text-white">
            Connect on LinkedIn
          </RealSiteLink>
        </div>
      </section>
      {data.bio && (
        <section className="space-y-2 rounded-md border-2 border-vx-edge bg-card p-4 sm:px-6">
          <h2 className="font-semibold sm:text-lg">About</h2>
          <p className="text-sm leading-relaxed whitespace-pre-line sm:text-[15px]">{data.bio}</p>
        </section>
      )}
      {(data.experience.length > 0 || data.education.length > 0) && (
        <section className="space-y-2">
          <h2 className="font-semibold sm:text-lg">Experience & education</h2>
          <ExperienceCard data={data} />
        </section>
      )}
      {data.skills.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold sm:text-lg">Skills</h2>
          <SkillsCard data={data} />
        </section>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- new tab

function NewTabPage({ profile, reloads, onNavigate }: { profile: PublicProfile | null; reloads: number; onNavigate: (url: string) => void }) {
  const { data: projects } = useData('projects', fetchProjects, reloads)
  const tiles = [
    ...socialLinks(profile?.socials).map(({ key, label, href, Icon }) => ({ key, label, href, icon: <Icon className="size-5" /> })),
    ...(profile?.resumeUrl ? [{ key: 'resume', label: 'Resume', href: profile.resumeUrl, icon: <FileText className="size-5" /> }] : []),
  ]
  const repos = (projects ?? []).filter((p) => p.links?.github)
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <h1 className="text-center font-pixel text-2xl font-bold text-wood sm:text-3xl md:text-4xl">{profile?.firstName ?? 'Shiv'}OS Browser</h1>
      <div className="flex flex-wrap justify-center gap-3">
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onNavigate(t.href)}
            className="vx-sm vx-press flex w-24 flex-col items-center gap-1.5 bg-card px-2 py-3 text-xs sm:text-sm"
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      {repos.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Project repos</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {repos.map((p) => (
              <button
                key={p.slug}
                type="button"
                onClick={() => onNavigate(p.links!.github!)}
                className="vx-sm vx-press flex items-start gap-2 bg-card px-3 py-2 text-left"
              >
                <GithubIcon className="mt-0.5 size-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{p.title}</span>
                  <span className="line-clamp-1 text-xs text-muted-foreground">{p.tagline}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- anything else

function FramePage({ url }: { url: string }) {
  const sameOrigin = new URL(url).origin === window.location.origin
  return (
    <div className="flex h-full flex-col">
      <iframe
        src={url}
        title={prettyUrl(url)}
        referrerPolicy="no-referrer"
        // our own files (the resume PDF) need the real viewer; other sites stay sandboxed
        sandbox={sameOrigin ? undefined : 'allow-scripts allow-same-origin allow-forms allow-popups'}
        className="min-h-0 flex-1 bg-white"
      />
      {!sameOrigin && (
        <div className="flex items-center justify-between gap-2 border-t bg-muted px-3 py-1.5 text-[11px] text-muted-foreground sm:text-xs">
          <span>Blank page? Some sites refuse to open inside others.</span>
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 font-medium text-foreground hover:underline">
            Open in a new tab <SquareArrowOutUpRight className="size-3" />
          </a>
        </div>
      )}
    </div>
  )
}

export function BrowserPage({
  url,
  profile,
  reloads,
  onNavigate,
}: {
  url: string
  profile: PublicProfile | null
  reloads: number
  onNavigate: (url: string) => void
}) {
  const page = pageFor(url, profile?.socials)
  switch (page.kind) {
    case 'newtab':
      return <NewTabPage profile={profile} reloads={reloads} onNavigate={onNavigate} />
    case 'github-profile':
      return <GithubProfilePage url={url} reloads={reloads} onNavigate={onNavigate} />
    case 'github-repo':
      return <RepoPage repo={page.repo} url={url} reloads={reloads} />
    case 'linkedin':
      return <LinkedinPage url={url} profile={profile} reloads={reloads} />
    case 'blocked':
      return (
        <Problem icon={<ShieldOff className="size-6" />} title={`${page.host} can't be shown here`}>
          <p className="text-sm text-muted-foreground">This site doesn't allow other pages to embed it, so it only opens in a real tab.</p>
          <RealSiteLink href={url}>Open {page.host}</RealSiteLink>
        </Problem>
      )
    case 'frame':
      return <FramePage key={reloads} url={url} />
  }
}

/** Tab title and icon. */
export function tabLabel(url: string, profile: PublicProfile | null): { title: string; icon: ReactNode } {
  const page = pageFor(url, profile?.socials)
  switch (page.kind) {
    case 'newtab':
      return { title: 'New tab', icon: <Globe className="size-3.5" /> }
    case 'github-profile':
      return { title: 'GitHub', icon: <GithubIcon className="size-3.5" /> }
    case 'github-repo':
      return { title: page.repo, icon: <GithubIcon className="size-3.5" /> }
    case 'linkedin':
      return { title: profile?.name ?? 'LinkedIn', icon: <LinkedinIcon className="size-3.5 text-[#0a66c2]" /> }
    default:
      return { title: prettyUrl(url).split('/')[0], icon: <Globe className="size-3.5" /> }
  }
}
