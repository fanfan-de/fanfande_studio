export type AssistantResponseFormat = "html" | "markdown"

export interface ParsedAssistantResponseFormat {
  format: AssistantResponseFormat
  marker: string | null
  text: string
}

const FORMAT_MARKER_PATTERN =
  /^([ \t]*<!--[ \t]*(?:anybox|fanfande)-response-format:[ \t]*(html|markdown)[ \t]*-->[ \t]*)(?:(\r\n|\n|\r)|$)/
const STREAMING_MARKER_PREFIXES = [
  "<!-- anybox-response-format: html -->",
  "<!-- anybox-response-format: markdown -->",
  "<!-- fanfande-response-format: html -->",
  "<!-- fanfande-response-format: markdown -->",
]

export function parseAssistantResponseFormat(text: string): ParsedAssistantResponseFormat {
  const match = text.match(FORMAT_MARKER_PATTERN)
  if (!match) {
    return {
      format: "markdown",
      marker: null,
      text,
    }
  }

  return {
    format: match[2] as AssistantResponseFormat,
    marker: match[1].trim(),
    text: text.slice(match[0].length),
  }
}

function isPotentialStreamingMarkerPrefix(text: string) {
  const trimmedLeadingWhitespace = text.replace(/^[ \t]+/, "")
  if (!trimmedLeadingWhitespace) return true

  return STREAMING_MARKER_PREFIXES.some((marker) => marker.startsWith(trimmedLeadingWhitespace))
}

export function stripStreamingResponseFormatMarker(text: string) {
  const parsed = parseAssistantResponseFormat(text)
  if (parsed.marker) return parsed.text

  const firstLineBreak = text.search(/\r\n|\n|\r/)
  if (firstLineBreak !== -1) return text

  return isPotentialStreamingMarkerPrefix(text) ? "" : text
}
