import { motion } from 'motion/react'
import { Card, CardContent } from '@/components/ui/card'

export function SkillsCard({ data }: { data: { skills: Array<{ category: string; items: string[] }> } }) {
  return (
    <Card>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {data.skills.map((group, gi) => (
          <div key={group.category}>
            <h4 className="mb-2 font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
              {group.category}
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {group.items.map((skill, i) => (
                <motion.span
                  key={skill}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: gi * 0.06 + i * 0.02 }}
                  className="rounded-md border bg-background px-2 py-1 text-xs sm:text-sm"
                >
                  {skill}
                </motion.span>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
