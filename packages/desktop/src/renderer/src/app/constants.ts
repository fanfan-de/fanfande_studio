import type { SidebarActionKey } from "./types"

export const DEFAULT_SIDEBAR_WIDTH = 236
export const MIN_SIDEBAR_WIDTH = 192
export const MAX_SIDEBAR_WIDTH = 420
export const MIN_CANVAS_WIDTH = 560
export const SIDEBAR_KEYBOARD_STEP = 16
export const STREAM_PENDING_PREFIX = "Queued prompt:"
export const STREAM_PENDING_REASONING = "Reasoning updates will appear here as soon as the backend emits them."
export const STREAM_PENDING_NEXT_STEP = "Live output will keep appending inside this turn while the backend responds."

export const sidebarActions: Array<{ key: SidebarActionKey; label: string }> = [
  { key: "project", label: "Open folder" },
  { key: "sort", label: "Sort sessions" },
  { key: "new", label: "Create session" },
]
