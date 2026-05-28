import {
  BrowserExtensionClientMessage,
  BrowserExtensionCommandMethod,
  BrowserExtensionServerMessage,
  type BrowserExtensionClientMessage as BrowserExtensionClientMessageValue,
  type BrowserExtensionCommandMethod as BrowserExtensionCommandMethodValue,
} from "@anybox/shared/browser-extension"
import * as Log from "#util/log.ts"

const DEFAULT_COMMAND_TIMEOUT_MS = 15_000

type SocketLike = {
  send(data: string): void
  close(code?: number, reason?: string): void
}

type Connection = {
  socket: SocketLike
  connectionID: string
  extensionInstanceID?: string
  extensionID?: string
  version?: string
  connectedAt: number
  lastSeenAt: number
}

type PendingCommand = {
  connectionID: string
  method: BrowserExtensionCommandMethodValue
  resolve(value: unknown): void
  reject(error: Error): void
  timer: ReturnType<typeof setTimeout>
}

const log = Log.create({ service: "browser-extension" })

function send(socket: SocketLike, payload: unknown) {
  socket.send(JSON.stringify(BrowserExtensionServerMessage.parse(payload)))
}

function normalizeError(error: unknown) {
  if (error instanceof Error) return error
  return new Error(typeof error === "string" ? error : String(error))
}

class BrowserExtensionBridge {
  private readonly connections = new Map<string, Connection>()
  private readonly pending = new Map<string, PendingCommand>()
  private activeConnectionID: string | undefined

  status() {
    const active = this.activeConnection()
    return {
      connected: Boolean(active),
      active: active
        ? {
            connectionID: active.connectionID,
            extensionInstanceID: active.extensionInstanceID,
            extensionID: active.extensionID,
            version: active.version,
            connectedAt: active.connectedAt,
            lastSeenAt: active.lastSeenAt,
          }
        : null,
      connectionCount: this.connections.size,
    }
  }

  register(socket: SocketLike) {
    const connectionID = crypto.randomUUID()
    const connection: Connection = {
      socket,
      connectionID,
      connectedAt: Date.now(),
      lastSeenAt: Date.now(),
    }
    this.connections.set(connectionID, connection)
    this.activeConnectionID = connectionID
    log.info("connected", { connectionID })
    return connectionID
  }

  unregister(connectionID: string) {
    const connection = this.connections.get(connectionID)
    if (!connection) return

    this.connections.delete(connectionID)
    if (this.activeConnectionID === connectionID) {
      this.activeConnectionID = this.connections.keys().next().value
    }

    for (const [commandID, pending] of this.pending) {
      if (pending.connectionID !== connectionID) continue
      clearTimeout(pending.timer)
      this.pending.delete(commandID)
      pending.reject(new Error("Browser extension disconnected before returning a result."))
    }

    log.info("disconnected", {
      connectionID,
      extensionInstanceID: connection.extensionInstanceID,
    })
  }

  handleRawMessage(connectionID: string, raw: unknown) {
    const connection = this.connections.get(connectionID)
    if (!connection) return

    let parsedJson: unknown
    try {
      parsedJson = typeof raw === "string" ? JSON.parse(raw) : raw
    } catch {
      throw new Error("Browser extension websocket message must be valid JSON.")
    }

    const message = BrowserExtensionClientMessage.parse(parsedJson)
    connection.lastSeenAt = Date.now()
    this.handleMessage(connection, message)
  }

  async sendCommand(
    method: BrowserExtensionCommandMethodValue,
    params?: unknown,
    options: { timeoutMs?: number } = {},
  ) {
    BrowserExtensionCommandMethod.parse(method)
    const connection = this.activeConnection()
    if (!connection) {
      throw new Error("No Chrome extension is connected to Anybox.")
    }

    const commandID = crypto.randomUUID()
    const timeoutMs = options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS

    return await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(commandID)
        reject(new Error(`Browser command '${method}' timed out after ${timeoutMs}ms.`))
      }, timeoutMs)

      this.pending.set(commandID, {
        connectionID: connection.connectionID,
        method,
        resolve,
        reject,
        timer,
      })

      try {
        send(connection.socket, {
          type: "command",
          commandID,
          method,
          params,
        })
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(commandID)
        reject(normalizeError(error))
      }
    })
  }

  ping() {
    const connection = this.activeConnection()
    if (!connection) return false
    send(connection.socket, {
      type: "ping",
      nonce: crypto.randomUUID(),
    })
    return true
  }

  private activeConnection() {
    if (this.activeConnectionID) {
      const active = this.connections.get(this.activeConnectionID)
      if (active) return active
    }

    const next = this.connections.values().next().value
    this.activeConnectionID = next?.connectionID
    return next
  }

  private handleMessage(connection: Connection, message: BrowserExtensionClientMessageValue) {
    switch (message.type) {
      case "hello":
        connection.extensionInstanceID = message.extensionInstanceID
        connection.extensionID = message.extensionID
        connection.version = message.version
        this.activeConnectionID = connection.connectionID
        log.info("hello", {
          connectionID: connection.connectionID,
          extensionInstanceID: message.extensionInstanceID,
          extensionID: message.extensionID,
          version: message.version,
        })
        return
      case "result": {
        const pending = this.pending.get(message.commandID)
        if (!pending) return
        clearTimeout(pending.timer)
        this.pending.delete(message.commandID)
        if (message.ok) {
          pending.resolve(message.data)
        } else {
          pending.reject(new Error(message.error || `Browser command '${pending.method}' failed.`))
        }
        return
      }
      case "event":
        log.debug("event", {
          connectionID: connection.connectionID,
          event: message.event,
        })
        return
      case "pong":
        return
    }
  }
}

export const browserExtensionBridge = new BrowserExtensionBridge()
