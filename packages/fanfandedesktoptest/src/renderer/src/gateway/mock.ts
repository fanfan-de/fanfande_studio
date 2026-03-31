import type {
  AgentGateway,
  ProjectInfo,
  SessionInfo,
  StreamHandle,
  StreamSessionHandlers,
  StreamSessionMessageInput,
} from "./types"

export interface MockGatewayOptions {
  chunkDelayMs?: number
}

export class MockGateway implements AgentGateway {
  constructor(private readonly options: MockGatewayOptions = {}) {}

  async listProjects(): Promise<ProjectInfo[]> {
    return [
      {
        id: "project_mock_001",
        name: "Mock Workspace",
        worktree: "C:/Projects/fanfande_studio",
        sandboxes: ["C:/Projects/fanfande_studio"],
        created: Date.now() - 5_000,
        updated: Date.now(),
      },
    ]
  }

  async createSession(input: { directory: string }): Promise<SessionInfo> {
    return {
      id: `session_mock_${Date.now()}`,
      projectID: "project_mock_001",
      directory: input.directory,
      title: "Mock Session",
      time: {
        created: Date.now(),
        updated: Date.now(),
      },
    }
  }

  streamSessionMessage(input: StreamSessionMessageInput, handlers: StreamSessionHandlers): StreamHandle {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const chunkDelay = this.options.chunkDelayMs ?? 90

    const fullText = [
      "This is a mock stream response.",
      `sessionID=${input.sessionID}.`,
      `prompt=${input.text}`,
    ].join(" ")

    const chunks = fullText.match(/.{1,18}/g) ?? [fullText]

    const done = new Promise<void>((resolve) => {
      handlers.onStarted?.({ sessionID: input.sessionID, mock: true, timestamp: Date.now() })
      handlers.onEvent?.({ event: "started", data: { sessionID: input.sessionID, mock: true } })

      const push = (index: number) => {
        if (cancelled) {
          handlers.onError?.("Mock stream cancelled")
          handlers.onEvent?.({ event: "error", data: { message: "Mock stream cancelled" } })
          resolve()
          return
        }

        if (index >= chunks.length) {
          const donePayload = { sessionID: input.sessionID, mock: true, text: fullText }
          handlers.onDone?.(donePayload)
          handlers.onEvent?.({ event: "done", data: donePayload })
          resolve()
          return
        }

        const deltaPayload = {
          sessionID: input.sessionID,
          messageID: `msg_mock_${input.sessionID}`,
          partID: `part_mock_${index}`,
          kind: "text",
          delta: chunks[index],
          text: chunks.slice(0, index + 1).join(""),
        }
        handlers.onDelta?.(chunks[index], deltaPayload)
        handlers.onEvent?.({ event: "delta", data: deltaPayload })

        timer = setTimeout(() => push(index + 1), chunkDelay)
      }

      timer = setTimeout(() => push(0), chunkDelay)
    })

    return {
      cancel() {
        cancelled = true
        if (timer) clearTimeout(timer)
      },
      done,
    }
  }
}
