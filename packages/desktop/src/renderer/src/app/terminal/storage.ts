import type { TerminalStoragePayload, TerminalWorkspaceState } from "./types"

const TERMINAL_STORAGE_KEY = "desktop.terminal.workspace.v1"
const DEFAULT_PANEL_HEIGHT = 280

function resolveTerminalStorageKey(storageKey?: string) {
  return storageKey?.trim() || TERMINAL_STORAGE_KEY
}

export function createEmptyTerminalWorkspaceState(): TerminalWorkspaceState {
  return {
    isOpen: false,
    activePtyID: null,
    order: [],
    sessions: {},
    scrollTopBySessionID: {},
    panelHeight: DEFAULT_PANEL_HEIGHT,
    preferredShellProfileID: null,
  }
}

export function loadTerminalWorkspaceState(storageKey?: string): TerminalWorkspaceState {
  if (typeof window === "undefined") return createEmptyTerminalWorkspaceState()

  try {
    const raw = window.localStorage.getItem(resolveTerminalStorageKey(storageKey))
    if (!raw) return createEmptyTerminalWorkspaceState()

    const parsed = JSON.parse(raw) as TerminalStoragePayload
    if (parsed.version !== 2) {
      return createEmptyTerminalWorkspaceState()
    }

    return {
      isOpen: parsed.isOpen === true,
      activePtyID: null,
      order: [],
      sessions: {},
      scrollTopBySessionID:
        parsed.scrollTopBySessionID && typeof parsed.scrollTopBySessionID === "object"
          ? Object.fromEntries(
              Object.entries(parsed.scrollTopBySessionID)
                .filter(([, value]) => typeof value === "number" && Number.isFinite(value)),
            )
          : {},
      panelHeight: Number.isFinite(parsed.panelHeight) ? Math.max(220, Math.min(parsed.panelHeight, 560)) : DEFAULT_PANEL_HEIGHT,
      preferredShellProfileID: typeof parsed.preferredShellProfileID === "string" ? parsed.preferredShellProfileID : null,
    }
  } catch {
    return createEmptyTerminalWorkspaceState()
  }
}

export function saveTerminalWorkspaceState(state: TerminalWorkspaceState, storageKey?: string) {
  if (typeof window === "undefined") return

  const payload = serializeTerminalWorkspaceState(state)

  window.localStorage.setItem(resolveTerminalStorageKey(storageKey), payload)
}

export function serializeTerminalWorkspaceState(state: TerminalWorkspaceState) {
  const payload: TerminalStoragePayload = {
    version: 2,
    isOpen: state.isOpen,
    activePtyID: null,
    order: [],
    sessions: [],
    scrollTopBySessionID: state.scrollTopBySessionID,
    panelHeight: state.panelHeight,
    preferredShellProfileID: state.preferredShellProfileID,
  }

  return JSON.stringify(payload)
}

export function clearTerminalWorkspaceState(storageKey?: string) {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(resolveTerminalStorageKey(storageKey))
}
