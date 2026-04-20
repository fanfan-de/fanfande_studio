import { Fragment, type MouseEvent, type ReactNode } from "react"

type ThreadRichTextElement = "div" | "p" | "span"

export interface ThreadRichTextSegment {
  type: "text" | "link"
  text: string
  href?: string
}

interface ThreadRichTextProps {
  as?: ThreadRichTextElement
  className?: string
  text: string
}

interface MarkdownLinkMatch {
  start: number
  end: number
  label: string
  href: string
}

const BARE_URL_PATTERN = /https?:\/\/[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+/g
const SIMPLE_TRAILING_URL_PUNCTUATION = new Set([",", ".", "!", "?", ";", ":", "'", "\"", ">"])
const BALANCED_TRAILING_PAIRS: Array<{ open: string; close: string }> = [
  { open: "(", close: ")" },
  { open: "[", close: "]" },
  { open: "{", close: "}" },
]

function countOccurrences(value: string, target: string) {
  let count = 0

  for (const character of value) {
    if (character === target) {
      count += 1
    }
  }

  return count
}

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

function splitTrailingUrlDecoration(value: string) {
  let cursor = value.length

  while (cursor > 0) {
    const trailingCharacter = value[cursor - 1]
    const candidate = value.slice(0, cursor)

    if (SIMPLE_TRAILING_URL_PUNCTUATION.has(trailingCharacter)) {
      cursor -= 1
      continue
    }

    const balancedPair = BALANCED_TRAILING_PAIRS.find((pair) => pair.close === trailingCharacter)
    if (balancedPair) {
      const openCount = countOccurrences(candidate, balancedPair.open)
      const closeCount = countOccurrences(candidate, balancedPair.close)
      if (closeCount > openCount) {
        cursor -= 1
        continue
      }
    }

    break
  }

  return {
    url: value.slice(0, cursor),
    trailingText: value.slice(cursor),
  }
}

function tokenizeBareUrls(text: string): ThreadRichTextSegment[] {
  const segments: ThreadRichTextSegment[] = []
  let cursor = 0
  let match: RegExpExecArray | null

  BARE_URL_PATTERN.lastIndex = 0

  while ((match = BARE_URL_PATTERN.exec(text)) !== null) {
    const matchStart = match.index
    const matchedText = match[0]
    const { trailingText, url } = splitTrailingUrlDecoration(matchedText)
    const normalizedUrl = normalizeExternalUrl(url)

    if (!normalizedUrl) {
      continue
    }

    if (matchStart > cursor) {
      segments.push({
        type: "text",
        text: text.slice(cursor, matchStart),
      })
    }

    segments.push({
      type: "link",
      text: url,
      href: normalizedUrl,
    })

    if (trailingText) {
      segments.push({
        type: "text",
        text: trailingText,
      })
    }

    cursor = matchStart + matchedText.length
  }

  if (cursor < text.length) {
    segments.push({
      type: "text",
      text: text.slice(cursor),
    })
  }

  return segments
}

function findNextMarkdownLink(text: string, startIndex: number): MarkdownLinkMatch | null {
  for (let index = startIndex; index < text.length; index += 1) {
    if (text[index] !== "[") continue

    let labelEnd = -1

    for (let cursor = index + 1; cursor < text.length - 1; cursor += 1) {
      const character = text[cursor]
      if (character === "\n") break
      if (character === "]" && text[cursor + 1] === "(") {
        labelEnd = cursor
        break
      }
    }

    if (labelEnd === -1) continue

    const label = text.slice(index + 1, labelEnd)
    if (!label) continue

    let depth = 0
    let urlEnd = -1
    let invalidLink = false

    for (let cursor = labelEnd + 2; cursor < text.length; cursor += 1) {
      const character = text[cursor]

      if (character === "\n") {
        invalidLink = true
        break
      }

      if (/\s/.test(character) && depth === 0) {
        invalidLink = true
        break
      }

      if (character === "(") {
        depth += 1
        continue
      }

      if (character === ")") {
        if (depth === 0) {
          urlEnd = cursor
          break
        }

        depth -= 1
      }
    }

    if (invalidLink || urlEnd === -1) continue

    const href = normalizeExternalUrl(text.slice(labelEnd + 2, urlEnd))
    if (!href) continue

    return {
      start: index,
      end: urlEnd + 1,
      label,
      href,
    }
  }

  return null
}

export function parseThreadRichText(text: string): ThreadRichTextSegment[] {
  const segments: ThreadRichTextSegment[] = []
  let cursor = 0

  while (cursor < text.length) {
    const markdownLink = findNextMarkdownLink(text, cursor)

    if (!markdownLink) {
      segments.push(...tokenizeBareUrls(text.slice(cursor)))
      break
    }

    if (markdownLink.start > cursor) {
      segments.push(...tokenizeBareUrls(text.slice(cursor, markdownLink.start)))
    }

    segments.push({
      type: "link",
      text: markdownLink.label,
      href: markdownLink.href,
    })

    cursor = markdownLink.end
  }

  return segments.filter((segment) => segment.text.length > 0)
}

function renderSegment(segment: ThreadRichTextSegment, index: number): ReactNode {
  if (segment.type === "text" || !segment.href) {
    return <Fragment key={`text-${index}`}>{segment.text}</Fragment>
  }

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    const openExternalUrl = window.desktop?.openExternalUrl
    if (!openExternalUrl) return

    event.preventDefault()
    void openExternalUrl({ url: segment.href! }).catch((error) => {
      console.error("[desktop] Failed to open external URL.", error)
    })
  }

  return (
    <a
      key={`link-${index}-${segment.href}`}
      className="thread-inline-link"
      href={segment.href}
      onClick={handleClick}
      rel="noreferrer noopener"
      target="_blank"
    >
      {segment.text}
    </a>
  )
}

export function ThreadRichText({
  as = "p",
  className,
  text,
}: ThreadRichTextProps) {
  const Component = as
  const segments = parseThreadRichText(text)

  return (
    <Component className={className}>
      {segments.map((segment, index) => renderSegment(segment, index))}
    </Component>
  )
}
