import type { PreviewErrorKind } from "../types"

export type PreviewLoadError = {
  code: string
  kind: PreviewErrorKind
  message: string
  suggestions: string[]
}

export function getPreviewFailure(errorDescription?: string, errorCode?: number): PreviewLoadError {
  const message = (errorDescription ?? "").trim()
  if (/ERR_BLOCKED_BY_RESPONSE/i.test(message) || errorCode === -27) {
    return {
      code: "ERR_BLOCKED_BY_RESPONSE",
      kind: "embedded-blocked",
      message: "This page does not allow being shown inside the preview window.",
      suggestions: ["Open it in your browser.", "Check whether the site blocks embedding with response headers."],
    }
  }
  if (/ERR_CONNECTION_REFUSED/i.test(message) || errorCode === -102) {
    return {
      code: "ERR_CONNECTION_REFUSED",
      kind: "connection-refused",
      message: "No service is listening at this address.",
      suggestions: ["Start your local dev server.", "Check that the host and port in the URL are correct."],
    }
  }
  if (/ERR_NAME_NOT_RESOLVED/i.test(message) || errorCode === -105) {
    return {
      code: "ERR_NAME_NOT_RESOLVED",
      kind: "dns",
      message: "The preview host could not be resolved.",
      suggestions: ["Check the hostname.", "Check your proxy, DNS, or network settings."],
    }
  }
  if (/ERR_CONNECTION_RESET/i.test(message) || errorCode === -101) {
    return {
      code: "ERR_CONNECTION_RESET",
      kind: "connection-reset",
      message: "The preview connection was reset before the page loaded.",
      suggestions: ["Reload the preview.", "Check whether the local service restarted or crashed."],
    }
  }
  if (/ERR_EMPTY_RESPONSE/i.test(message) || errorCode === -324) {
    return {
      code: "ERR_EMPTY_RESPONSE",
      kind: "connection-reset",
      message: "The preview service accepted the connection but returned an empty response.",
      suggestions: ["Restart the local dev server.", "Check server logs for crashes or early connection closes."],
    }
  }
  if (/ERR_TIMED_OUT|TIMEOUT/i.test(message) || errorCode === -7) {
    return {
      code: "ERR_TIMED_OUT",
      kind: "timeout",
      message: "The preview URL timed out before it responded.",
      suggestions: ["Reload the preview.", "Check whether the local service is still starting."],
    }
  }
  if (/ERR_CERT|CERT_|SSL/i.test(message)) {
    return {
      code: message || "ERR_CERTIFICATE",
      kind: "certificate",
      message: "The preview URL has a certificate problem.",
      suggestions: ["Open it externally to inspect the certificate.", "Use http:// for local development if HTTPS is not required."],
    }
  }

  return {
    code: message || "ERR_PREVIEW_LOAD_FAILED",
    kind: "unknown",
    message: "This page could not be opened inside the preview window.",
    suggestions: ["Reload the preview.", "Open it externally to inspect the browser error."],
  }
}
