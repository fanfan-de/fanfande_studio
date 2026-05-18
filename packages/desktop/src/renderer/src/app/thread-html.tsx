import DOMPurify, { type Config } from "dompurify"
import { memo, useMemo, type MouseEvent } from "react"
import {
  normalizeMarkdownLinkTarget,
  openExternalThreadLink,
  type MarkdownArtifactLinkTarget,
  type MarkdownLocalFileLinkTarget,
} from "./thread-markdown"

interface ThreadHtmlProps {
  className?: string
  onArtifactLinkOpen?: (target: MarkdownArtifactLinkTarget) => void
  onLocalFileLinkOpen?: (target: MarkdownLocalFileLinkTarget) => void
  text: string
}

const sanitizeConfig = {
  ALLOW_ARIA_ATTR: false,
  ALLOW_DATA_ATTR: false,
  ALLOWED_ATTR: ["colspan", "href", "rowspan", "title"],
  ALLOWED_TAGS: [
    "a",
    "blockquote",
    "br",
    "code",
    "div",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "li",
    "ol",
    "p",
    "pre",
    "section",
    "strong",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "ul",
  ],
  ALLOWED_URI_REGEXP:
    /^(?:(?:https?):|agent:\/\/artifact\/|file:\/\/|[A-Za-z]:[\\/]|\/|\\\\|\/\/)/i,
  FORBID_ATTR: ["class", "style"],
  FORBID_TAGS: ["body", "head", "html", "iframe", "script", "style"],
} satisfies Config

let linkSanitizerHookRegistered = false

function ensureThreadHtmlSanitizerHooks() {
  if (linkSanitizerHookRegistered) return
  linkSanitizerHookRegistered = true

  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (!(node instanceof HTMLAnchorElement)) return

    const href = node.getAttribute("href")
    if (!href) return

    const linkTarget = normalizeMarkdownLinkTarget(href)
    if (!linkTarget) {
      node.removeAttribute("href")
      return
    }

    node.setAttribute("href", linkTarget.href)
  })
}

function sanitizeThreadHtml(text: string) {
  ensureThreadHtmlSanitizerHooks()
  const sanitized = DOMPurify.sanitize(text, sanitizeConfig)
  return typeof sanitized === "string" ? sanitized : ""
}

export const ThreadHtml = memo(function ThreadHtml({
  className,
  onArtifactLinkOpen,
  onLocalFileLinkOpen,
  text,
}: ThreadHtmlProps) {
  const html = useMemo(() => sanitizeThreadHtml(text), [text])

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target instanceof Element ? event.target : null
    const anchor = target?.closest("a[href]")
    if (!anchor || !event.currentTarget.contains(anchor)) return

    const linkTarget = normalizeMarkdownLinkTarget(anchor.getAttribute("href") ?? "")
    if (!linkTarget) {
      event.preventDefault()
      return
    }

    event.preventDefault()

    if (linkTarget.kind === "artifact") {
      onArtifactLinkOpen?.(linkTarget.target)
      return
    }

    if (linkTarget.kind === "local-file") {
      onLocalFileLinkOpen?.(linkTarget.target)
      return
    }

    openExternalThreadLink(linkTarget.href)
  }

  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} onClick={handleClick} />
})
