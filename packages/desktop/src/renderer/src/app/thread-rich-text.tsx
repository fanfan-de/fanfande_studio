import { Fragment, type MouseEvent, type ReactNode } from "react"
import type { UserTurnReference } from "./types"

type ThreadRichTextElement = "div" | "p" | "span"

type ThreadRichTextReference = UserTurnReference

type ThreadRichTextSegment =
  | {
      type: "text"
      text: string
    }
  | {
      type: "link"
      text: string
      href: string
    }
  | {
      type: "reference"
      text: string
      reference: ThreadRichTextReference
    }

interface ThreadRichTextProps {
  as?: ThreadRichTextElement
  className?: string
  references?: ThreadRichTextReference[]
  text: string
}

interface MarkdownLinkMatch {
  start: number
  end: number
  label: string
  href: string
}

interface ThreadReferenceMatch {
  end: number
  reference: ThreadRichTextReference
  start: number
  text: string
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

function resolveThreadReferenceKind(reference: ThreadRichTextReference) {
  if (reference.kind) return reference.kind
  return reference.id.startsWith("file:") ? "file" : "comment"
}

function findNextThreadReference(text: string, startIndex: number, references: ThreadRichTextReference[]) {
  let nextMatch: ThreadReferenceMatch | null = null

  for (const reference of references) {
    const token = `@${reference.label}`
    if (!token.trim()) continue

    const matchStart = text.indexOf(token, startIndex)
    if (matchStart === -1) continue

    if (
      nextMatch &&
      (matchStart > nextMatch.start || (matchStart === nextMatch.start && token.length <= nextMatch.text.length))
    ) {
      continue
    }

    nextMatch = {
      start: matchStart,
      end: matchStart + token.length,
      text: token,
      reference,
    }
  }

  return nextMatch
}

function parseThreadRichTextWithoutReferences(text: string): ThreadRichTextSegment[] {
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

export function parseThreadRichText(text: string, references: ThreadRichTextReference[] = []): ThreadRichTextSegment[] {
  if (references.length === 0) {
    return parseThreadRichTextWithoutReferences(text)
  }

  const segments: ThreadRichTextSegment[] = []
  let cursor = 0

  while (cursor < text.length) {
    const referenceMatch = findNextThreadReference(text, cursor, references)

    if (!referenceMatch) {
      segments.push(...parseThreadRichTextWithoutReferences(text.slice(cursor)))
      break
    }

    if (referenceMatch.start > cursor) {
      segments.push(...parseThreadRichTextWithoutReferences(text.slice(cursor, referenceMatch.start)))
    }

    segments.push({
      type: "reference",
      text: referenceMatch.text,
      reference: referenceMatch.reference,
    })
    cursor = referenceMatch.end
  }

  return segments.filter((segment) => segment.text.length > 0)
}

function renderSegment(segment: ThreadRichTextSegment, index: number): ReactNode {
  if (segment.type === "text") {
    return <Fragment key={`text-${index}`}>{segment.text}</Fragment>
  }

  if (segment.type === "reference") {
    const kind = resolveThreadReferenceKind(segment.reference)
    return (
      <span
        key={`reference-${index}-${segment.reference.id}`}
        className={`composer-inline-tag thread-inline-reference is-${kind}`}
        data-thread-reference-kind={kind}
        title={segment.reference.title ?? segment.reference.label}
      >
        {segment.text}
      </span>
    )
  }

  const href = segment.href

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    const openExternalUrl = window.desktop?.openExternalUrl
    if (!openExternalUrl) return

    event.preventDefault()
    void openExternalUrl({ url: href }).catch((error) => {
      console.error("[desktop] Failed to open external URL.", error)
    })
  }

  return (
    <a
      key={`link-${index}-${href}`}
      className="thread-inline-link"
      href={href}
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
  references = [],
  text,
}: ThreadRichTextProps) {
  const Component = as
  const segments = parseThreadRichText(text, references)

  return (
    <Component className={className}>
      {segments.map((segment, index) => renderSegment(segment, index))}
    </Component>
  )
}
