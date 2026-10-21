import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ExternalLink } from '@/components/ExternalLink'
import { cn } from '@/lib/utils'

// The model's text is untrusted: react-markdown renders no raw HTML, and every link opens in a new
// tab (or the mini-OS browser) without leaking the opener. `resolveUrl` rewrites relative links and
// images (a README's, against its repo).
export function Markdown({
  text,
  className,
  resolveUrl,
}: {
  text: string
  className?: string
  resolveUrl?: (url: string, key: string) => string
}) {
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
        urlTransform={(url, key) => defaultUrlTransform(resolveUrl ? resolveUrl(url, key) : url)}
        components={{
          a: ({ href, children }) => <ExternalLink href={href}>{children}</ExternalLink>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
