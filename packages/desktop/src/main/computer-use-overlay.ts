import { BrowserWindow, globalShortcut, screen, type WebContents } from "electron"
import { safeError, safeWarn } from "./safe-console"

const COMPUTER_USE_TOOL_PREFIX = "mcp_plugin_computer_use_windows_windows_"
const COMPUTER_USE_TITLE_PREFIX = "Computer Use Windows/"
const COMPUTER_USE_SHORTCUTS = ["Esc", "Escape"] as const
const DEFAULT_MIN_VISIBLE_MS = 700
const DEFAULT_IDLE_HIDE_MS = 250

export interface ComputerUseOverlayContext {
  backendSessionID: string
  callID?: string
  clientTurnID?: string
  title?: string
  tool?: string
  turnID?: string
  webContentsID: number
}

export type ComputerUseRuntimeEvent =
  | {
      type: "tool-started"
      callKey: string
      callID: string
      title?: string
      tool: string
      turnID?: string
    }
  | {
      type: "tool-settled"
      callKey: string
      callID: string
      title?: string
      tool: string
      turnID?: string
    }
  | {
      type: "turn-settled"
      turnID?: string
    }

interface ComputerUseOverlayManagerOptions {
  idleHideMs?: number
  minVisibleMs?: number
  onCancel?: (context: ComputerUseOverlayContext) => Promise<void> | void
}

interface SessionStreamEventInput {
  backendSessionID: string
  clientTurnID?: string
  data: unknown
  event: string
  target: WebContents
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function readToolPart(data: unknown) {
  if (!isRecord(data)) return null
  const payload = data.payload
  if (!isRecord(payload)) return null
  const part = payload.part
  return isRecord(part) ? part : null
}

function readToolTitle(part: Record<string, unknown>) {
  const state = part.state
  if (isRecord(state)) {
    return readString(state.title)
  }
  return undefined
}

function isComputerUseToolPart(part: Record<string, unknown>) {
  const tool = readString(part.tool)
  const title = readToolTitle(part)
  return Boolean(
    tool?.startsWith(COMPUTER_USE_TOOL_PREFIX) ||
      title?.startsWith(COMPUTER_USE_TITLE_PREFIX),
  )
}

function buildCallKey(data: unknown, callID: string) {
  const runtimeEvent = isRecord(data) ? data : {}
  return [
    readString(runtimeEvent.sessionID) ?? "session",
    readString(runtimeEvent.turnID) ?? "turn",
    callID,
  ].join(":")
}

export function readComputerUseRuntimeEvent(input: {
  data: unknown
  event: string
}): ComputerUseRuntimeEvent | null {
  if (input.event !== "runtime" || !isRecord(input.data)) return null

  const runtimeType = readString(input.data.type)
  if (runtimeType === "turn.completed" || runtimeType === "turn.failed" || runtimeType === "turn.cancelled") {
    return {
      type: "turn-settled",
      turnID: readString(input.data.turnID),
    }
  }

  const part = readToolPart(input.data)
  if (!part || !isComputerUseToolPart(part)) return null

  const callID = readString(part.callID)
  const tool = readString(part.tool)
  if (!callID || !tool) return null

  if (runtimeType === "tool.call.started" || runtimeType === "tool.call.waiting_approval") {
    return {
      type: "tool-started",
      callKey: buildCallKey(input.data, callID),
      callID,
      title: readToolTitle(part),
      tool,
      turnID: readString(input.data.turnID),
    }
  }

  if (
    runtimeType === "tool.call.completed" ||
    runtimeType === "tool.call.failed" ||
    runtimeType === "tool.call.denied"
  ) {
    return {
      type: "tool-settled",
      callKey: buildCallKey(input.data, callID),
      callID,
      title: readToolTitle(part),
      tool,
      turnID: readString(input.data.turnID),
    }
  }

  return null
}

export class ComputerUseOverlayManager {
  private readonly activeCalls = new Map<string, ComputerUseOverlayContext>()
  private readonly idleHideMs: number
  private latestContext: ComputerUseOverlayContext | null = null
  private readonly minVisibleMs: number
  private readonly onCancel?: (context: ComputerUseOverlayContext) => Promise<void> | void
  private registeredShortcut: string | null = null
  private resizeTimer: ReturnType<typeof setTimeout> | null = null
  private visibleSince = 0
  private windows: BrowserWindow[] = []
  private hideTimer: ReturnType<typeof setTimeout> | null = null

  constructor(options: ComputerUseOverlayManagerOptions = {}) {
    this.idleHideMs = options.idleHideMs ?? DEFAULT_IDLE_HIDE_MS
    this.minVisibleMs = options.minVisibleMs ?? DEFAULT_MIN_VISIBLE_MS
    this.onCancel = options.onCancel
  }

  handleSessionStreamEvent(input: SessionStreamEventInput) {
    const event = readComputerUseRuntimeEvent(input)
    if (!event) return

    if (event.type === "turn-settled") {
      this.clearForTurn({
        backendSessionID: input.backendSessionID,
        turnID: event.turnID,
        webContentsID: input.target.id,
      })
      return
    }

    if (event.type === "tool-started") {
      const context: ComputerUseOverlayContext = {
        backendSessionID: input.backendSessionID,
        callID: event.callID,
        clientTurnID: input.clientTurnID,
        title: event.title,
        tool: event.tool,
        turnID: event.turnID,
        webContentsID: input.target.id,
      }
      this.activeCalls.set(event.callKey, context)
      this.latestContext = context
      this.show()
      return
    }

    this.activeCalls.delete(event.callKey)
    this.latestContext = this.lastActiveContext()
    if (this.activeCalls.size === 0) {
      this.scheduleHide()
    }
  }

  clearForRequest(input: { backendSessionID: string; clientTurnID?: string; webContentsID: number }) {
    for (const [key, context] of this.activeCalls.entries()) {
      if (context.webContentsID !== input.webContentsID) continue
      if (context.backendSessionID !== input.backendSessionID) continue
      if (input.clientTurnID && context.clientTurnID && context.clientTurnID !== input.clientTurnID) continue
      this.activeCalls.delete(key)
    }

    this.latestContext = this.lastActiveContext()
    if (this.activeCalls.size === 0) {
      this.scheduleHide()
    }
  }

  clearForWebContents(webContentsID: number) {
    for (const [key, context] of this.activeCalls.entries()) {
      if (context.webContentsID === webContentsID) {
        this.activeCalls.delete(key)
      }
    }

    this.latestContext = this.lastActiveContext()
    if (this.activeCalls.size === 0) {
      this.scheduleHide()
    }
  }

  destroy() {
    this.activeCalls.clear()
    this.latestContext = null
    this.hideNow()
  }

  private clearForTurn(input: { backendSessionID: string; turnID?: string; webContentsID: number }) {
    for (const [key, context] of this.activeCalls.entries()) {
      if (context.webContentsID !== input.webContentsID) continue
      if (context.backendSessionID !== input.backendSessionID) continue
      if (input.turnID && context.turnID !== input.turnID) continue
      this.activeCalls.delete(key)
    }

    this.latestContext = this.lastActiveContext()
    if (this.activeCalls.size === 0) {
      this.scheduleHide()
    }
  }

  private lastActiveContext() {
    const contexts = [...this.activeCalls.values()]
    return contexts.length ? contexts[contexts.length - 1] : null
  }

  private show() {
    this.clearHideTimer()
    this.visibleSince = this.visibleSince || Date.now()

    if (this.windows.length === 0) {
      this.createWindows()
      this.registerDisplayListeners()
    }

    this.registerCancelShortcut()
  }

  private createWindows() {
    const displays = screen.getAllDisplays()
    this.windows = displays.map((display) => {
      const win = new BrowserWindow({
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
        frame: false,
        transparent: true,
        backgroundColor: "#00000000",
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        closable: false,
        focusable: false,
        hasShadow: false,
        show: false,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      })

      win.setIgnoreMouseEvents(true, { forward: true })
      this.applyAlwaysOnTop(win)
      win.loadURL(createOverlayDataURL()).catch((error) => {
        safeError("[desktop][computer-use-overlay] failed to load overlay", error)
      })
      win.once("ready-to-show", () => {
        if (win.isDestroyed()) return
        this.applyAlwaysOnTop(win)
        win.showInactive()
      })
      win.on("closed", () => {
        this.windows = this.windows.filter((item) => item !== win)
      })
      return win
    })
  }

  private applyAlwaysOnTop(win: BrowserWindow) {
    try {
      win.setAlwaysOnTop(true, "screen-saver")
    } catch {
      win.setAlwaysOnTop(true)
    }
  }

  private registerDisplayListeners() {
    screen.on("display-added", this.scheduleRecreateWindows)
    screen.on("display-removed", this.scheduleRecreateWindows)
    screen.on("display-metrics-changed", this.scheduleRecreateWindows)
  }

  private unregisterDisplayListeners() {
    screen.off("display-added", this.scheduleRecreateWindows)
    screen.off("display-removed", this.scheduleRecreateWindows)
    screen.off("display-metrics-changed", this.scheduleRecreateWindows)
    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer)
      this.resizeTimer = null
    }
  }

  private readonly scheduleRecreateWindows = () => {
    if (this.resizeTimer) clearTimeout(this.resizeTimer)
    this.resizeTimer = setTimeout(() => {
      this.resizeTimer = null
      if (this.windows.length === 0) return
      this.destroyWindows()
      this.createWindows()
    }, 120)
  }

  private registerCancelShortcut() {
    if (this.registeredShortcut) return

    for (const shortcut of COMPUTER_USE_SHORTCUTS) {
      const registered = globalShortcut.register(shortcut, () => {
        void this.cancelFromShortcut()
      })
      if (registered) {
        this.registeredShortcut = shortcut
        return
      }
    }

    safeWarn("[desktop][computer-use-overlay] failed to register Esc cancel shortcut")
  }

  private unregisterCancelShortcut() {
    if (!this.registeredShortcut) return
    globalShortcut.unregister(this.registeredShortcut)
    this.registeredShortcut = null
  }

  private async cancelFromShortcut() {
    const context = this.latestContext
    this.activeCalls.clear()
    this.latestContext = null
    this.hideNow()

    if (!context || !this.onCancel) return

    try {
      await this.onCancel(context)
    } catch (error) {
      safeError("[desktop][computer-use-overlay] failed to cancel computer use turn", error)
    }
  }

  private scheduleHide() {
    this.clearHideTimer()
    const visibleFor = Date.now() - this.visibleSince
    const minVisibleDelay = Math.max(0, this.minVisibleMs - visibleFor)
    this.hideTimer = setTimeout(() => {
      this.hideNow()
    }, Math.max(this.idleHideMs, minVisibleDelay))
  }

  private clearHideTimer() {
    if (!this.hideTimer) return
    clearTimeout(this.hideTimer)
    this.hideTimer = null
  }

  private hideNow() {
    this.clearHideTimer()
    this.visibleSince = 0
    this.unregisterCancelShortcut()
    this.unregisterDisplayListeners()
    this.destroyWindows()
  }

  private destroyWindows() {
    const windows = this.windows
    this.windows = []
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.destroy()
      }
    }
  }
}

function createOverlayDataURL() {
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
    <style>
      :root {
        color-scheme: light dark;
        --accent: #1683e9;
        --accent-strong: #0f74d4;
        --accent-glow: rgba(37, 99, 235, 0.48);
        --accent-glow-soft: rgba(37, 99, 235, 0.20);
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: transparent;
        pointer-events: none;
        user-select: none;
      }

      .computer-use-overlay {
        position: fixed;
        inset: 0;
        pointer-events: none;
      }

      .computer-use-overlay::before {
        content: "";
        position: absolute;
        inset: 0;
        border: 2px solid rgba(59, 130, 246, 0.78);
        box-shadow:
          inset 0 0 20px var(--accent-glow),
          inset 0 0 72px var(--accent-glow-soft),
          inset 0 0 140px rgba(37, 99, 235, 0.08);
      }

      .computer-use-overlay::after {
        content: "";
        position: absolute;
        inset: 0;
        border: 1px solid rgba(147, 197, 253, 0.58);
      }

      .computer-use-banner {
        position: fixed;
        top: 42px;
        left: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 42px;
        max-width: min(520px, calc(100vw - 48px));
        transform: translateX(-50%);
        padding: 0 16px;
        border: 1px solid rgba(191, 219, 254, 0.65);
        border-radius: 10px;
        background: linear-gradient(180deg, var(--accent), var(--accent-strong));
        box-shadow:
          0 10px 30px rgba(15, 23, 42, 0.22),
          0 0 0 4px rgba(59, 130, 246, 0.18),
          0 0 28px rgba(37, 99, 235, 0.42);
        color: #fff;
        font: 600 14px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0;
        white-space: nowrap;
      }

      .computer-use-banner span {
        opacity: 0.88;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <main class="computer-use-overlay" aria-hidden="true">
      <div class="computer-use-banner">Codex is using your computer&nbsp;&nbsp;<span>- Esc to cancel</span></div>
    </main>
  </body>
</html>`

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}
