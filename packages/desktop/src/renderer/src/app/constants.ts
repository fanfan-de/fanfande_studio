import type { CanvasMenuKey, SidebarActionKey, TitlebarMenuKey } from "./types"

export const DEFAULT_SIDEBAR_WIDTH = 236
export const MIN_SIDEBAR_WIDTH = 192
export const MAX_SIDEBAR_WIDTH = 420
export const MIN_CANVAS_WIDTH = 560
export const SIDEBAR_KEYBOARD_STEP = 16
export const STREAM_PENDING_PREFIX = "Queued prompt:"
export const STREAM_PENDING_REASONING = "Reasoning updates will appear here as soon as the backend emits them."
export const STREAM_PENDING_NEXT_STEP = "Live output will keep appending inside this turn while the backend responds."

export const titlebarMenus: Array<{ key: TitlebarMenuKey; label: string }> = [
  { key: "file", label: "File" },
  { key: "edit", label: "Edit" },
  { key: "view", label: "View" },
  { key: "window", label: "Window" },
  { key: "help", label: "Help" },
]

export const sidebarActions: Array<{ key: SidebarActionKey; label: string }> = [
  { key: "project", label: "Open folder" },
  { key: "sort", label: "Sort sessions" },
  { key: "new", label: "Create session" },
]

export const canvasMenuItems: Array<{ key: CanvasMenuKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "artifacts", label: "Artifacts" },
  { key: "changes", label: "Changes" },
  { key: "console", label: "Console" },
  { key: "deploy", label: "Deploy" },
]
