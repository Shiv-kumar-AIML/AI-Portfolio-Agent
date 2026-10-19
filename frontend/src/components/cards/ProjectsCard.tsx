import { ArrowUpRight, ExternalLink } from 'lucide-react'
import { motion } from 'motion/react'
import { GithubIcon } from '@/components/BrandIcons'
import { useChatActions } from '@/components/chat/ChatActions'
import { Badge } from '@/components/ui/badge'
import type { Project } from '@/types'

const STATUS_STYLES: Record<string, string> = {
  live: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  production: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  'open-source': 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  archived: 'bg-muted text-muted-foreground',
}

export function ProjectLinks({ project }: { project: Project }) {
  const { github, demo } = project.links ?? {}
  if (!github && !demo) return null
  return (
    <div className="flex gap-3 text-xs sm:text-sm">
      {github && (
        <a
          href={github}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          <GithubIcon className="size-3.5" /> Code
        </a>
      )}
      {demo && (
        <a
          href={demo}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="size-3.5" /> Live demo
        </a>
      )}
    </div>
  )
}

export function StatusBadge({ status }: { status?: string }) {
  if (!status) return null
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLES[status] ?? STATUS_STYLES.archived}`}>
      {status.replace('-', ' ')}
    </span>
  )
}

export function ProjectsCard({ data }: { data: { projects: Project[] } }) {
  const { ask, busy } = useChatActions()
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {data.projects.map((project, i) => (
        <motion.button
          key={project.slug}
          type="button"
          disabled={busy}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          onClick={() => ask(`Tell me more about the ${project.title} project`)}
          className="group flex flex-col gap-3 rounded-xl border bg-card p-4 text-left ring-1 ring-foreground/5 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5 disabled:pointer-events-none"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className="font-heading font-semibold leading-tight">{project.title}</h4>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                {project.year && <span>{project.year}</span>}
                <StatusBadge status={project.status} />
              </div>
            </div>
            <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">{project.tagline}</p>
          {!!project.metrics?.length && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {project.metrics.map((m) => (
                <div key={m.label} className="text-xs">
                  <span className="font-semibold text-foreground">{m.value}</span>{' '}
                  <span className="text-muted-foreground">{m.label}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-auto flex flex-wrap gap-1.5">
            {project.stack.slice(0, 5).map((tech) => (
              <Badge key={tech} variant="secondary" className="font-normal">
                {tech}
              </Badge>
            ))}
          </div>
          <ProjectLinks project={project} />
        </motion.button>
      ))}
    </div>
  )
}
