import React, { type ErrorInfo, type ReactNode } from "react"
import type { DesktopRendererErrorReport } from "../../../shared/desktop-ipc-contract"

const ERROR_TEXT_LIMIT = 12_000
const ERROR_REPORT_DEDUPE_WINDOW_MS = 5_000
const ERROR_REPORT_WINDOW_MS = 10_000
const ERROR_REPORT_WINDOW_LIMIT = 12
let globalErrorReportingInstalled = false
let recentErrorReportTimes: number[] = []
const lastErrorReportAtByKey = new Map<string, number>()

function truncate(value: string | null | undefined, maxLength = ERROR_TEXT_LIMIT): string | undefined {
  if (!value) return undefined
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength)}\n[truncated ${value.length - maxLength} chars]`
}

function serializeError(value: unknown) {
  if (value instanceof Error) {
    return {
      message: truncate(value.message, 2_000) ?? value.name,
      name: truncate(value.name, 500),
      stack: truncate(value.stack),
    }
  }

  if (typeof value === "string") {
    return {
      message: truncate(value, 2_000) ?? "Unknown renderer error",
    }
  }

  try {
    return {
      message: truncate(JSON.stringify(value), 2_000) ?? "Unknown renderer error",
    }
  } catch {
    return {
      message: "Unknown renderer error",
    }
  }
}

function getRendererErrorReportKey(report: Omit<DesktopRendererErrorReport, "timestamp" | "url" | "userAgent">) {
  return [
    report.source,
    report.name,
    report.message,
    report.filename,
    report.lineno,
    report.colno,
    report.stack?.slice(0, 500),
  ].filter(Boolean).join("\u0000")
}

function shouldSuppressRendererErrorReport(report: Omit<DesktopRendererErrorReport, "timestamp" | "url" | "userAgent">, now = Date.now()) {
  const key = getRendererErrorReportKey(report)
  const previousReportAt = lastErrorReportAtByKey.get(key) ?? 0
  if (now - previousReportAt < ERROR_REPORT_DEDUPE_WINDOW_MS) return true

  recentErrorReportTimes = recentErrorReportTimes.filter((reportedAt) => now - reportedAt < ERROR_REPORT_WINDOW_MS)
  if (recentErrorReportTimes.length >= ERROR_REPORT_WINDOW_LIMIT) return true

  lastErrorReportAtByKey.set(key, now)
  recentErrorReportTimes.push(now)
  return false
}

function reportRendererError(input: Omit<DesktopRendererErrorReport, "timestamp" | "url" | "userAgent">) {
  const now = Date.now()
  if (shouldSuppressRendererErrorReport(input, now)) return

  const report: DesktopRendererErrorReport = {
    ...input,
    timestamp: now,
    url: window.location.href,
    userAgent: window.navigator.userAgent,
  }

  console.error("[desktop][renderer-error]", report)
  void window.desktop?.reportRendererError?.(report).catch((error) => {
    console.error("[desktop][renderer-error] failed to report renderer error:", error)
  })
}

export function installRendererGlobalErrorReporting() {
  if (globalErrorReportingInstalled) return
  globalErrorReportingInstalled = true

  window.addEventListener("error", (event) => {
    reportRendererError({
      ...serializeError(event.error ?? event.message),
      colno: event.colno,
      filename: event.filename,
      lineno: event.lineno,
      source: "window-error",
    })
  })

  window.addEventListener("unhandledrejection", (event) => {
    reportRendererError({
      ...serializeError(event.reason),
      source: "unhandled-rejection",
    })
  })
}

interface RootErrorBoundaryProps {
  children: ReactNode
}

interface RootErrorBoundaryState {
  error: Error | null
}

export class RootErrorBoundary extends React.Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
  state: RootErrorBoundaryState = {
    error: null,
  }

  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportRendererError({
      ...serializeError(error),
      componentStack: truncate(info.componentStack),
      source: "error-boundary",
    })
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main
        style={{
          alignItems: "center",
          background: "#eff3f7",
          color: "#172033",
          display: "flex",
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
          height: "100vh",
          justifyContent: "center",
          padding: 32,
        }}
      >
        <section
          role="alert"
          style={{
            background: "#ffffff",
            border: "1px solid #d7dde7",
            borderRadius: 8,
            boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
            maxWidth: 680,
            padding: 24,
          }}
        >
          <h1 style={{ fontSize: 18, margin: "0 0 8px" }}>Renderer error</h1>
          <p style={{ lineHeight: 1.5, margin: 0 }}>
            The desktop renderer hit an unrecoverable error. The failure has been reported to the main process logs.
          </p>
        </section>
      </main>
    )
  }
}
