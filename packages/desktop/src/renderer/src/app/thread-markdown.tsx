import type { MouseEvent, ReactNode } from "react"
import ReactMarkdown, { type Components, type UrlTransform } from "react-markdown"
import remarkGfm from "remark-gfm"

interface ThreadMarkdownProps {
  className?: string
  text: string
}

const remarkPlugins = [remarkGfm]

function normalizeExternalUrl(value: string) {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null
    }

    return parsed.toString()
  } catch {
    return null
  }
}

function handleExternalLinkClick(event: MouseEvent<HTMLAnchorElement>, href: string) {
  const openExternalUrl = window.desktop?.openExternalUrl
  if (!openExternalUrl) return

  event.preventDefault()
  void openExternalUrl({ url: href }).catch((error) => {
    console.error("[desktop] Failed to open external URL.", error)
  })
}

function MarkdownLink({ children, href }: { children?: ReactNode; href?: string }) {
  const normalizedHref = href ? normalizeExternalUrl(href) : null
  if (!normalizedHref) return <>{children}</>

  return (
    <a
      className="thread-inline-link"
      href={normalizedHref}
      onClick={(event) => handleExternalLinkClick(event, normalizedHref)}
      rel="noreferrer noopener"
      target="_blank"
    >
      {children}
    </a>
  )
}

function MarkdownImage({ alt }: { alt?: string }) {
  return alt ? <span className="thread-markdown-image-alt">{alt}</span> : null
}

const components: Components = {
  a: MarkdownLink,
  img: MarkdownImage,
}

const transformMarkdownUrl: UrlTransform = (url, key) => {
  if (key !== "href" && key !== "src") {
    return ""
  }

  return normalizeExternalUrl(url) ?? ""
}

export function ThreadMarkdown({ className, text }: ThreadMarkdownProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        components={components}
        remarkPlugins={remarkPlugins}
        skipHtml
        urlTransform={transformMarkdownUrl}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
