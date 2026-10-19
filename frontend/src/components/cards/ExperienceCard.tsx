import { Briefcase, GraduationCap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

interface Job {
  company: string
  role: string
  start: string
  end: string | null
  location?: string
  summary?: string
  highlights?: string[]
  stack?: string[]
}

interface Education {
  institution: string
  degree: string
  start?: string
  end?: string
  notes?: string
}

const formatMonth = (value: string | null) => {
  if (!value) return 'Present'
  const [year, month] = value.split('-')
  if (!month) return year
  return new Date(Number(year), Number(month) - 1).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  })
}

function TimelineItem({ icon, children, last }: { icon: React.ReactNode; children: React.ReactNode; last: boolean }) {
  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      {!last && <span className="absolute top-8 bottom-0 left-4 w-px bg-border" aria-hidden />}
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0 flex-1 pt-1">{children}</div>
    </li>
  )
}

export function ExperienceCard({ data }: { data: { experience: Job[]; education: Education[] } }) {
  const total = data.experience.length + data.education.length
  return (
    <Card>
      <CardContent>
        <ol>
          {data.experience.map((job, i) => (
            <TimelineItem key={`${job.company}-${job.start}`} icon={<Briefcase className="size-4" />} last={i === total - 1}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <h4 className="font-heading font-semibold">
                  {job.role} <span className="font-normal text-muted-foreground">· {job.company}</span>
                </h4>
                <span className="font-mono text-xs text-muted-foreground">
                  {formatMonth(job.start)} — {formatMonth(job.end)}
                </span>
              </div>
              {job.summary && <p className="mt-1 text-sm text-muted-foreground">{job.summary}</p>}
              {!!job.highlights?.length && (
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
                  {job.highlights.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              )}
              {!!job.stack?.length && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {job.stack.map((t) => (
                    <Badge key={t} variant="secondary" className="font-normal">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
            </TimelineItem>
          ))}
          {data.education.map((edu, i) => (
            <TimelineItem
              key={edu.institution}
              icon={<GraduationCap className="size-4" />}
              last={data.experience.length + i === total - 1}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <h4 className="font-heading font-semibold">{edu.degree}</h4>
                {(edu.start || edu.end) && (
                  <span className="font-mono text-xs text-muted-foreground">
                    {edu.start} — {edu.end}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {edu.institution}
                {edu.notes ? ` · ${edu.notes}` : ''}
              </p>
            </TimelineItem>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
