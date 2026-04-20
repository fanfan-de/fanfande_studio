import type { PreviewComment } from "../types"

function formatCommentCoordinate(value: number) {
  return `${Math.round(value)}%`
}

export function normalizePreviewUrlInput(input: string) {
  const trimmedInput = input.trim()
  if (!trimmedInput) {
    return {
      errorMessage: "Enter a preview URL such as http://localhost:3000 or https://example.com.",
      normalizedUrl: null,
    }
  }

  let candidate = trimmedInput
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmedInput)) {
    const hostname = trimmedInput.split("/")[0]?.split(":")[0]?.toLowerCase() ?? ""
    const useHttp = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0"
    candidate = `${useHttp ? "http" : "https"}://${trimmedInput}`
  }

  try {
    const parsedUrl = new URL(candidate)
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return {
        errorMessage: "Preview only supports http:// or https:// URLs.",
        normalizedUrl: null,
      }
    }

    return {
      errorMessage: null,
      normalizedUrl: parsedUrl.toString(),
    }
  } catch {
    return {
      errorMessage: "That preview URL could not be parsed.",
      normalizedUrl: null,
    }
  }
}

export function buildPreviewCommentDraft(url: string, comments: PreviewComment[]) {
  if (comments.length === 0) return ""

  const lines = comments.map((comment) => {
    const anchorLabel = comment.anchor?.label?.trim()
    if (anchorLabel) {
      return `- ${anchorLabel}: ${comment.text.trim()}`
    }

    return `- At ${formatCommentCoordinate(comment.x)}, ${formatCommentCoordinate(comment.y)}: ${comment.text.trim()}`
  })

  return [`Preview feedback for ${url}`, ...lines].join("\n")
}
