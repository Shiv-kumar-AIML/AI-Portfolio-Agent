import { Download, FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface ResumeData {
  name: string
  title: string
  resumeUrl?: string
  summary?: string
  currentRole?: string | null
  topSkills?: string[]
}

export function ResumeCard({ data }: { data: ResumeData }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-orange-400 text-white shadow-md">
          <FileText className="size-7" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <h4 className="font-heading font-semibold">
            {data.name} — Resume
          </h4>
          <p className="text-sm text-muted-foreground">{data.currentRole ?? data.title}</p>
          {!!data.topSkills?.length && (
            <div className="flex flex-wrap gap-1 pt-1">
              {data.topSkills.map((s) => (
                <Badge key={s} variant="secondary" className="font-normal">
                  {s}
                </Badge>
              ))}
            </div>
          )}
        </div>
        {data.resumeUrl && (
          <a
            href={data.resumeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ size: 'lg', className: 'shrink-0' })}
          >
            <Download /> Download PDF
          </a>
        )}
      </CardContent>
    </Card>
  )
}
