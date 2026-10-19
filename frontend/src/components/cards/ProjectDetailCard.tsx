import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { Project } from '@/types'
import { ProjectLinks, StatusBadge } from './ProjectsCard'

export function ProjectDetailCard({ data }: { data: Project }) {
  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-br from-violet-500/15 via-fuchsia-500/10 to-orange-400/15" />
      <CardContent className="relative space-y-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {data.year && <span>{data.year}</span>}
            <StatusBadge status={data.status} />
            {data.tags.map((t) => (
              <span key={t}>#{t}</span>
            ))}
          </div>
          <h3 className="mt-1 font-heading text-xl font-semibold sm:text-2xl">{data.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">{data.tagline}</p>
        </div>
        {!!data.metrics?.length && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {data.metrics.map((m) => (
              <div key={m.label} className="rounded-lg border bg-background/60 px-3 py-2">
                <div className="truncate font-heading text-base font-semibold sm:text-lg">{m.value}</div>
                <div className="text-xs text-muted-foreground">{m.label}</div>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {data.stack.map((tech) => (
            <Badge key={tech} variant="outline" className="font-normal">
              {tech}
            </Badge>
          ))}
        </div>
        <ProjectLinks project={data} />
      </CardContent>
    </Card>
  )
}
