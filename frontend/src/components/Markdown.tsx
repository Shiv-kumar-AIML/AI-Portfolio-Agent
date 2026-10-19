import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

// The model's text is untrusted: react-markdown renders no raw HTML, and every link opens in a new
// tab without leaking the opener.
export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={cn(
        'prose prose-neutral dark:prose-invert max-w-none text-[15px] leading-relaxed sm:text-base',
        'prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-headings:mt-4 prose-headings:mb-2',
        'prose-a:text-primary prose-a:underline-offset-4 prose-code:before:content-none prose-code:after:content-none',
        'prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:font-normal',
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
