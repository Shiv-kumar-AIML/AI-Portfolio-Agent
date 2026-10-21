import { ArrowUpRight, Globe } from 'lucide-react'
import { ExternalLink } from '@/components/ExternalLink'
import { prettyUrl } from '@/lib/browserUrl'

/** The agent opened a link (open_link): in the mini-OS it is already showing in the browser. */
export function OpenLinkCard({ data }: { data: { url: string } }) {
  return (
    <ExternalLink
      href={data.url}
      className="vx-sm vx-press group inline-flex max-w-full items-center gap-2 bg-card px-3 py-1.5 text-xs sm:text-sm"
    >
      <Globe className="size-4 shrink-0 text-teal" />
      <span className="truncate">
        Opened <span className="font-mono">{prettyUrl(data.url)}</span> in the browser
      </span>
      <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />
    </ExternalLink>
  )
}
