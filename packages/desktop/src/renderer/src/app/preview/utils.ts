import type { PreviewComment } from "../types"

function getPreviewHostLabel(url: string) {
  try {
    return new URL(url).host || "page"
  } catch {
    return "page"
  }
}

function readPreviewTargetLabel(comment: PreviewComment) {
  return comment.anchor?.label?.trim() || comment.anchor?.tagName?.trim() || "Preview target"
}

export function buildPreviewCommentReferenceLabel(url: string, commentIndex: number) {
  return `preview:${getPreviewHostLabel(url)}#${Math.max(1, commentIndex)}`
}

export function buildPreviewCommentReferenceTitle(comment: PreviewComment) {
  return `${readPreviewTargetLabel(comment)} - ${comment.pageUrl ?? comment.url}`
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
