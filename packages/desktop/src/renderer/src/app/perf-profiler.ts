import { Fragment, Profiler, createElement, type ReactNode } from "react"
import type { ProfilerOnRenderCallback } from "react"

export const RENDERER_PERF_PROFILER_STORAGE_KEY = "desktop.perfProfiler.enabled"

type PerfContext = Record<string, unknown> | (() => Record<string, unknown>)
type RendererPerformanceCleanupReason = "interval" | "session-stream-terminal" | "manual"

type PerfWindow = Window & {
  __ANYBOX_PERF_PROFILER__?: boolean
}

interface RendererProfilerProps {
  children: ReactNode
  id: string
  onRender: ProfilerOnRenderCallback
}

let performanceCleanupTimerID: number | null = null

const RENDERER_PERFORMANCE_CLEANUP_INTERVAL_MS = 60_000

function roundDuration(value: number) {
  return Number(value.toFixed(value >= 10 ? 1 : 2))
}

function readPerfContext(context?: PerfContext) {
  if (!context) return {}
  return typeof context === "function" ? context() : context
}

export function isRendererPerfProfilerEnabled() {
  if (import.meta.env.MODE === "test" || typeof window === "undefined") return false

  const perfWindow = window as PerfWindow
  if (perfWindow.__ANYBOX_PERF_PROFILER__) return true

  try {
    return window.localStorage.getItem(RENDERER_PERF_PROFILER_STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

export function logRendererPerf(label: string, data: Record<string, unknown> = {}) {
  if (!isRendererPerfProfilerEnabled()) return
  console.info(`[desktop-perf] ${label}`, data)
}

export function measureRendererPerf<T>(label: string, callback: () => T, context?: PerfContext) {
  if (!isRendererPerfProfilerEnabled()) return callback()

  const start = performance.now()
  try {
    return callback()
  } finally {
    logRendererPerf(label, {
      durationMs: roundDuration(performance.now() - start),
      ...readPerfContext(context),
    })
  }
}

export function createRendererProfilerOnRender(label: string, context?: PerfContext): ProfilerOnRenderCallback {
  return (_id, phase, actualDuration, baseDuration, startTime, commitTime) => {
    logRendererPerf(label, {
      phase,
      actualDurationMs: roundDuration(actualDuration),
      baseDurationMs: roundDuration(baseDuration),
      renderToCommitMs: roundDuration(commitTime - startTime),
      ...readPerfContext(context),
    })
  }
}

export function RendererProfiler({ children, id, onRender }: RendererProfilerProps) {
  if (!isRendererPerfProfilerEnabled()) {
    return createElement(Fragment, null, children)
  }

  return createElement(Profiler, { id, onRender }, children)
}

function getPerformanceEntryCount(type: string) {
  if (typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") return 0

  try {
    return performance.getEntriesByType(type).length
  } catch {
    return 0
  }
}

export function clearRendererPerformanceEntries(reason: RendererPerformanceCleanupReason = "manual") {
  if (!import.meta.env.DEV || typeof performance === "undefined") return
  if (
    typeof performance.clearMeasures !== "function" &&
    typeof performance.clearMarks !== "function"
  ) {
    return
  }

  const markCount = getPerformanceEntryCount("mark")
  const measureCount = getPerformanceEntryCount("measure")
  if (markCount === 0 && measureCount === 0) return

  try {
    performance.clearMeasures?.()
    performance.clearMarks?.()
  } catch {
    return
  }

  logRendererPerf("renderer.performance.clearEntries", {
    markCount,
    measureCount,
    reason,
  })
}

export function installRendererPerformanceEntryCleanup() {
  if (!import.meta.env.DEV || typeof window === "undefined" || performanceCleanupTimerID !== null) return

  performanceCleanupTimerID = window.setInterval(() => {
    clearRendererPerformanceEntries("interval")
  }, RENDERER_PERFORMANCE_CLEANUP_INTERVAL_MS)
}
