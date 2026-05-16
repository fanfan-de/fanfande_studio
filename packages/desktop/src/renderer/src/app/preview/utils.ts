import type { PreviewErrorKind } from "../types"

export interface PreviewUrlNormalizeResult {
  errorKind: PreviewErrorKind | null
  errorMessage: string | null
  normalizedUrl: string | null
}

export function normalizePreviewUrlInput(input: string): PreviewUrlNormalizeResult {
  const trimmedInput = input.trim()
  if (!trimmedInput) {
    return {
      errorKind: "empty-url",
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
        errorKind: "unsupported-protocol",
        errorMessage: "Preview only supports http:// or https:// URLs.",
        normalizedUrl: null,
      }
    }

    return {
      errorKind: null,
      errorMessage: null,
      normalizedUrl: parsedUrl.toString(),
    }
  } catch {
    return {
      errorKind: "invalid-url",
      errorMessage: "That preview URL could not be parsed.",
      normalizedUrl: null,
    }
  }
}
