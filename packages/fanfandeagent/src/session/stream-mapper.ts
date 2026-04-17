import * as RuntimeEvent from "#session/runtime-event.ts"

type RendererStreamMeta = {
  cursor: string
  eventID: string
  seq: number
  timestamp: number
}

export type RendererStreamEvent =
  | {
      event: "started"
      data: {
        sessionID: string
        turnID: string
        timestamp: number
      } & RendererStreamMeta
    }
  | {
      event: "delta"
      data: {
        sessionID: string
        turnID: string
        messageID: string
        partID: string
        kind: "text" | "reasoning"
        delta: string
        text: string
      } & RendererStreamMeta
    }
  | {
      event: "part"
      data: {
        sessionID: string
        turnID: string
        part: unknown
      } & RendererStreamMeta
    }
  | {
      event: "done"
      data: {
        sessionID: string
        turnID: string
        status: "completed" | "blocked" | "stopped"
        finishReason?: string
        message?: unknown
        parts: unknown[]
      } & RendererStreamMeta
    }
  | {
      event: "error"
      data: {
        sessionID: string
        turnID: string
        message: string
        details?: unknown
      } & RendererStreamMeta
    }

function withMeta<TData extends { sessionID: string; turnID: string }>(
  event: RuntimeEvent.RuntimeEvent,
  data: TData,
): TData & RendererStreamMeta {
  return {
    ...data,
    cursor: RuntimeEvent.serializeCursor(RuntimeEvent.cursorOf(event)),
    eventID: event.eventID,
    seq: event.seq,
    timestamp: event.timestamp,
  }
}

export function toRendererStreamEvents(event: RuntimeEvent.RuntimeEvent): RendererStreamEvent[] {
  switch (event.type) {
    case "turn.started":
      return [
        {
          event: "started",
          data: withMeta(event, {
            sessionID: event.sessionID,
            turnID: event.turnID,
            timestamp: event.timestamp,
          }),
        },
      ]
    case "part.recorded": {
      const part = event.payload.part
      if (
        part.type !== "step-start" &&
        part.type !== "step-finish" &&
        part.type !== "retry" &&
        part.type !== "subtask" &&
        part.type !== "agent" &&
        part.type !== "compaction"
      ) {
        return []
      }

      return [
        {
          event: "part",
          data: withMeta(event, {
            sessionID: event.sessionID,
            turnID: event.turnID,
            part,
          }),
        },
      ]
    }
    case "text.part.delta":
    case "reasoning.part.delta":
      return [
        {
          event: "delta",
          data: withMeta(event, {
            sessionID: event.sessionID,
            turnID: event.turnID,
            messageID: event.payload.messageID,
            partID: event.payload.partID,
            kind: event.payload.kind,
            delta: event.payload.delta,
            text: event.payload.text,
          }),
        },
      ]
    case "tool.call.pending":
    case "tool.call.started":
    case "tool.call.waiting_approval":
    case "tool.call.approved":
    case "tool.call.denied":
    case "tool.call.completed":
    case "tool.call.failed":
    case "source.recorded":
    case "file.generated":
    case "text.part.completed":
    case "reasoning.part.completed":
    case "permission.requested":
    case "permission.resolved":
    case "patch.generated":
    case "snapshot.captured":
      return [
        {
          event: "part",
          data: withMeta(event, {
            sessionID: event.sessionID,
            turnID: event.turnID,
            part: event.payload.part,
          }),
        },
      ]
    case "turn.completed":
      return [
        {
          event: "done",
          data: withMeta(event, {
            sessionID: event.sessionID,
            turnID: event.turnID,
            status: event.payload.status,
            finishReason: event.payload.finishReason,
            message: event.payload.message,
            parts: event.payload.parts ?? [],
          }),
        },
      ]
    case "turn.failed":
      return [
        {
          event: "error",
          data: withMeta(event, {
            sessionID: event.sessionID,
            turnID: event.turnID,
            message: event.payload.error,
            details: {
              message: event.payload.message,
              parts: event.payload.parts ?? [],
            },
          }),
        },
      ]
    default:
      return []
  }
}
