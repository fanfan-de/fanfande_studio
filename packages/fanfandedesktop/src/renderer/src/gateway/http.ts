import { consumeSSEStream } from "./sse"
import type {
  AgentGateway,
  ApiEnvelope,
  ProjectInfo,
  SessionInfo,
  StreamHandle,
  StreamRawEvent,
  StreamSessionHandlers,
  StreamSessionMessageInput,
} from "./types"

export class HttpGateway implements AgentGateway {
  constructor(private readonly baseURL: string) {}

  async listProjects(): Promise<ProjectInfo[]> {
    return this.requestJSON<ProjectInfo[]>("/api/projects", { method: "GET" })
  }

  async createSession(input: { directory: string }): Promise<SessionInfo> {
    return this.requestJSON<SessionInfo>("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    })
  }

  streamSessionMessage(input: StreamSessionMessageInput, handlers: StreamSessionHandlers): StreamHandle {
    const controller = new AbortController()

    const done = (async () => {
      try {
        const response = await fetch(this.url(`/api/sessions/${input.sessionID}/messages/stream`), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            text: input.text,
            system: input.system,
            agent: input.agent,
            model: input.model,
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const text = await response.text().catch(() => "")
          throw new Error(`HTTP ${response.status}: ${text || response.statusText}`)
        }

        if (!response.body) throw new Error("Missing stream body")

        await consumeSSEStream(response.body, (raw) => {
          const parsed = this.parseRawEvent(raw)
          handlers.onEvent?.(parsed)

          if (parsed.event === "started") handlers.onStarted?.(parsed.data)
          else if (parsed.event === "delta") {
            const delta = this.getDeltaText(parsed.data)
            handlers.onDelta?.(delta, parsed.data)
          } else if (parsed.event === "part") handlers.onPart?.(parsed.data)
          else if (parsed.event === "done") handlers.onDone?.(parsed.data)
          else if (parsed.event === "error") handlers.onError?.(this.getErrorMessage(parsed.data), parsed.data)
        })
      } catch (error) {
        if (controller.signal.aborted) return
        const message = error instanceof Error ? error.message : String(error)
        handlers.onError?.(message)
      }
    })()

    return {
      cancel: () => controller.abort(),
      done,
    }
  }

  private parseRawEvent(raw: { event: string; data: string }): StreamRawEvent {
    let data: unknown = raw.data
    try {
      data = JSON.parse(raw.data)
    } catch {
      // keep raw string
    }
    return { event: raw.event, data }
  }

  private getDeltaText(payload: unknown): string {
    if (!payload || typeof payload !== "object") return ""
    const record = payload as Record<string, unknown>
    return typeof record.delta === "string" ? record.delta : ""
  }

  private getErrorMessage(payload: unknown): string {
    if (!payload || typeof payload !== "object") return "Unknown stream error"
    const record = payload as Record<string, unknown>
    return typeof record.message === "string" ? record.message : "Unknown stream error"
  }

  private async requestJSON<T>(pathname: string, init: RequestInit): Promise<T> {
    const response = await fetch(this.url(pathname), init)
    if (!response.ok) {
      const text = await response.text().catch(() => "")
      throw new Error(`HTTP ${response.status}: ${text || response.statusText}`)
    }

    const json = (await response.json()) as ApiEnvelope<T>
    if (!json.success) {
      throw new Error(`${json.error.code}: ${json.error.message}`)
    }

    return json.data
  }

  private url(pathname: string): string {
    return `${this.baseURL.replace(/\/+$/, "")}${pathname}`
  }
}
