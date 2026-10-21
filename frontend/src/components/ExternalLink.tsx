import type { AnchorHTMLAttributes } from 'react'
import { useChatActions } from '@/components/chat/ChatActions'

/**
 * A link that leaves the page. Inside the mini-OS a plain click opens it in the OS browser;
 * anywhere else (and on ctrl/cmd/middle-click) it opens a real tab without leaking the opener.
 */
export function ExternalLink({ href, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { openLink } = useChatActions()
  return (
    <a
      {...props}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        onClick?.(e)
        if (!openLink || !href || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return
        e.preventDefault()
        openLink(href)
      }}
    />
  )
}
