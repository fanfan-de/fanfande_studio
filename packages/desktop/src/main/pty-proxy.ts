import type { WebContents } from "electron"
import { requestAgentJSON, resolveAgentWebSocketURL } from "./agent-client"
import type { AgentPtySessionInfo, AgentPtySocketMessage, PtyTransportIPCEvent } from "./types"

export const PTY_EVENT_CHANNEL = "desktop:pty-event"

interface PtyProxyConnection {
  detached: boolean
  ptyID: string
  senderID: number
  socket: WebSocket
}

function connectionKey(senderID: number, ptyID: string) {
  return `${String(senderID)}:${ptyID}`
}

function safeSend(sender: WebContents, payload: PtyTransportIPCEvent) {
  if (sender.isDestroyed()) return
  sender.send(PTY_EVENT_CHANNEL, payload)
}

async function readMessageData(data: MessageEvent["data"]) {
  if (typeof data === "string") return data
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data)
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data)
  if (data instanceof Blob) return data.text()
  return String(data)
}

export class PtyProxyManager {
  private readonly connections = new Map<string, PtyProxyConnection>()
  private readonly trackedSenders = new Set<number>()

  private ensureSenderCleanup(sender: WebContents) {
    if (this.trackedSenders.has(sender.id)) return
    this.trackedSenders.add(sender.id)

    sender.once("destroyed", () => {
      this.trackedSenders.delete(sender.id)

      for (const key of [...this.connections.keys()]) {
        if (!key.startsWith(`${String(sender.id)}:`)) continue
        const connection = this.connections.get(key)
        if (!connection) continue
        connection.detached = true
        connection.socket.close(1000, "Renderer destroyed")
        this.connections.delete(key)
      }
    })
  }

  private releaseConnection(key: string, socket: WebSocket) {
    const active = this.connections.get(key)
    if (!active || active.socket !== socket) return null
    this.connections.delete(key)
    return active
  }

  async attach(sender: WebContents, input: { id: string; cursor?: number }) {
    const ptyID = input.id.trim()
    const session = (
      await requestAgentJSON<AgentPtySessionInfo>(`/api/pty/${encodeURIComponent(ptyID)}`)
    ).data

    this.detach(sender, ptyID)
    this.ensureSenderCleanup(sender)

    const key = connectionKey(sender.id, ptyID)
    const socket = new WebSocket(
      resolveAgentWebSocketURL(`/api/pty/${encodeURIComponent(ptyID)}/connect`, {
        cursor: input.cursor,
      }),
    )
    const connection: PtyProxyConnection = {
      detached: false,
      ptyID,
      senderID: sender.id,
      socket,
    }

    this.connections.set(key, connection)
    safeSend(sender, {
      ptyID,
      type: "transport",
      state: "connecting",
    })

    socket.addEventListener("open", () => {
      if (this.connections.get(key)?.socket !== socket) return
      safeSend(sender, {
        ptyID,
        type: "transport",
        state: "connected",
      })
    })

    socket.addEventListener("message", async (event) => {
      if (this.connections.get(key)?.socket !== socket) return

      try {
        const raw = await readMessageData(event.data)
        const payload = JSON.parse(raw) as AgentPtySocketMessage
        safeSend(sender, {
          ptyID,
          ...payload,
        })
      } catch (error) {
        safeSend(sender, {
          ptyID,
          type: "transport",
          state: "error",
          message: error instanceof Error ? error.message : String(error),
        })
      }
    })

    socket.addEventListener("error", () => {
      if (this.connections.get(key)?.socket !== socket) return
      safeSend(sender, {
        ptyID,
        type: "transport",
        state: "error",
        message: "PTY socket proxy failed",
      })
    })

    socket.addEventListener("close", (event) => {
      const released = this.releaseConnection(key, socket)
      if (!released) return

      safeSend(sender, {
        ptyID,
        type: "transport",
        state: "disconnected",
        code: event.code,
        reason: event.reason,
        userInitiated: released.detached,
      })
    })

    return session
  }

  detach(sender: WebContents, ptyID: string) {
    const key = connectionKey(sender.id, ptyID.trim())
    const connection = this.connections.get(key)
    if (!connection) return false

    connection.detached = true
    this.connections.delete(key)
    connection.socket.close(1000, "Renderer detached")
    return true
  }

  write(sender: WebContents, input: { id: string; data: string }) {
    const key = connectionKey(sender.id, input.id.trim())
    const connection = this.connections.get(key)
    if (!connection || connection.socket.readyState !== WebSocket.OPEN) {
      throw new Error(`PTY session '${input.id}' is not attached`)
    }

    connection.socket.send(
      JSON.stringify({
        type: "input",
        data: input.data,
      }),
    )
  }
}

