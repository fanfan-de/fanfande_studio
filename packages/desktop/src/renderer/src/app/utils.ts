import { MAX_SIDEBAR_WIDTH, MIN_CANVAS_WIDTH, MIN_SIDEBAR_WIDTH } from "./constants"

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function resolveSidebarWidthBounds(containerWidth?: number) {
  if (!containerWidth || containerWidth <= 0) {
    return {
      min: MIN_SIDEBAR_WIDTH,
      max: MAX_SIDEBAR_WIDTH,
    }
  }

  return {
    min: MIN_SIDEBAR_WIDTH,
    max: Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, containerWidth - MIN_CANVAS_WIDTH)),
  }
}

export function createID(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`
}

export function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp)
}

export function compactText(input: string, maxLength = 180) {
  const normalized = input.replace(/\s+/g, " ").trim()
  if (!normalized) return ""
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized
}
