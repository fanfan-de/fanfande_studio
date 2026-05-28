import {
  BrowserExtensionClientMessage,
  BrowserExtensionServerMessage,
  type BrowserExtensionCommandMessage,
  type BrowserExtensionServerMessage as BrowserExtensionServerMessageValue,
} from "@anybox/shared/browser-extension"
import { handleBrowserCommand } from "./commands"
import {
  EXTENSION_INSTANCE_KEY,
  STATUS_STORAGE_KEY,
  type BridgeStatus,
} from "../shared/status"

const ANYBOX_WS_URL = "ws://127.0.0.1:4096/api/browser-extension/ws"
const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 15_000

let socket: WebSocket | null = null
let reconnectTimer: number | undefined
let reconnectAttempt = 0

function extensionVersion() {
  return chrome.runtime.getManifest().version as string
}

async function extensionInstanceID() {
  const stored = await chrome.storage.local.get(EXTENSION_INSTANCE_KEY)
  const existing = stored[EXTENSION_INSTANCE_KEY]
  if (typeof existing === "string" && existing) return existing

  const created = crypto.randomUUID()
  await chrome.storage.local.set({ [EXTENSION_INSTANCE_KEY]: created })
  return created
}

async function setStatus(status: BridgeStatus) {
  await chrome.storage.local.set({ [STATUS_STORAGE_KEY]: status })
}

function scheduleReconnect() {
  if (reconnectTimer !== undefined) return
  const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** reconnectAttempt)
  reconnectAttempt += 1
  reconnectTimer = self.setTimeout(() => {
    reconnectTimer = undefined
    connectAnybox()
  }, delay)
}

function sendClientMessage(message: unknown) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false
  socket.send(JSON.stringify(BrowserExtensionClientMessage.parse(message)))
  return true
}

async function sendHello() {
  sendClientMessage({
    type: "hello",
    extensionID: chrome.runtime.id,
    extensionInstanceID: await extensionInstanceID(),
    version: extensionVersion(),
  })
}

async function handleCommand(message: BrowserExtensionCommandMessage) {
  try {
    const data = await handleBrowserCommand(message.method, message.params)
    sendClientMessage({
      type: "result",
      commandID: message.commandID,
      ok: true,
      data,
    })
  } catch (error) {
    sendClientMessage({
      type: "result",
      commandID: message.commandID,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function handleServerMessage(raw: string) {
  const parsed = BrowserExtensionServerMessage.parse(JSON.parse(raw)) as BrowserExtensionServerMessageValue
  switch (parsed.type) {
    case "command":
      void handleCommand(parsed)
      return
    case "ping":
      sendClientMessage({
        type: "pong",
        nonce: parsed.nonce,
      })
      return
  }
}

export function connectAnybox() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return
  }

  void setStatus({ state: "connecting", lastChecked: Date.now() })

  try {
    socket = new WebSocket(ANYBOX_WS_URL)
  } catch (error) {
    void setStatus({
      state: "disconnected",
      lastChecked: Date.now(),
      error: error instanceof Error ? error.message : String(error),
    })
    scheduleReconnect()
    return
  }

  socket.addEventListener("open", () => {
    reconnectAttempt = 0
    void setStatus({ state: "connected", lastChecked: Date.now() })
    void sendHello()
  })

  socket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return
    try {
      handleServerMessage(event.data)
    } catch (error) {
      sendClientMessage({
        type: "event",
        event: "client_error",
        data: { message: error instanceof Error ? error.message : String(error) },
      })
    }
  })

  socket.addEventListener("close", () => {
    socket = null
    void setStatus({ state: "disconnected", lastChecked: Date.now() })
    scheduleReconnect()
  })

  socket.addEventListener("error", () => {
    void setStatus({ state: "disconnected", lastChecked: Date.now(), error: "WebSocket connection failed." })
  })
}

export function getBridgeStatusStorageKey() {
  return STATUS_STORAGE_KEY
}
