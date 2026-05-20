import type { ProfilerOnRenderCallback } from "react"

export const RENDERER_PERF_PROFILER_STORAGE_KEY = "desktop.perfProfiler.enabled"

type PerfContext = Record<string, unknown> | (() => Record<string, unknown>)

type PerfWindow = Window & {
  __ANYBOX_PERF_PROFILER__?: boolean
}

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
