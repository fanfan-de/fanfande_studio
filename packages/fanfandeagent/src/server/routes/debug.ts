import { Hono } from "hono"
import { ApiError } from "#server/error.ts"
import type { AppEnv } from "#server/types.ts"
import * as EventStore from "#session/event-store.ts"
import * as Orchestrator from "#session/orchestrator.ts"
import * as RunningState from "#session/running-state.ts"
import * as RuntimeEvent from "#session/runtime-event.ts"
import * as Session from "#session/session.ts"
import * as Log from "#util/log.ts"

const log = Log.create({ service: "server.debug" })

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readString(value: unknown) {
  return typeof value === "string" ? value : ""
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function parseLimit(value: string | undefined, fallback: number, max: number) {
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, max)
}

function summarizeModel(value: unknown) {
  const model = readRecord(value)
  if (!model) return undefined

  const providerID = readString(model.providerID)
  const modelID = readString(model.modelID)
  if (!providerID || !modelID) return undefined

  return `${providerID}/${modelID}`
}

function summarizeMessage(value: unknown) {
  const message = readRecord(value)
  if (!message) return null

  return {
    messageID: readString(message.id) || undefined,
    role: readString(message.role) || undefined,
    created: readNumber(message.created),
    completed: readNumber(message.completed),
    finishReason: readString(message.finishReason) || undefined,
    providerID: readString(message.providerID) || undefined,
    modelID: readString(message.modelID) || undefined,
    agent: readString(message.agent) || undefined,
    error: readString(readRecord(message.error)?.message) || undefined,
  }
}

function summarizePart(value: unknown) {
  const part = readRecord(value)
  if (!part) return null

  const type = readString(part.type) || "unknown"
  const summary: Record<string, unknown> = {
    partID: readString(part.id) || undefined,
    messageID: readString(part.messageID) || undefined,
    type,
  }

  if (type === "text" || type === "reasoning") {
    summary["textLength"] = readString(part.text).length
  }

  if (type === "file" || type === "image") {
    summary["filename"] = readString(part.filename) || undefined
    summary["mime"] = readString(part.mime) || undefined
  }

  if (type === "tool") {
    const state = readRecord(part.state)
    summary["tool"] = readString(part.tool) || undefined
    summary["callID"] = readString(part.callID) || undefined
    summary["status"] = readString(state?.status) || undefined
    summary["title"] = readString(state?.title) || undefined
    summary["approvalID"] = readString(state?.approvalID) || undefined
    summary["error"] = readString(state?.error) || undefined
  }

  if (type === "patch") {
    const files = Array.isArray(part.files) ? part.files.filter((item): item is string => typeof item === "string") : []
    summary["files"] = files
    summary["fileCount"] = files.length
  }

  if (type === "snapshot") {
    summary["snapshotBytes"] = readString(part.snapshot).length
  }

  return summary
}

function summarizeRuntimeEvent(event: RuntimeEvent.RuntimeEvent) {
  const summaryBase = {
    eventID: event.eventID,
    type: event.type,
    sessionID: event.sessionID,
    turnID: event.turnID,
    seq: event.seq,
    timestamp: event.timestamp,
    cursor: RuntimeEvent.serializeCursor(RuntimeEvent.cursorOf(event)),
  }

  switch (event.type) {
    case "turn.started":
      return {
        ...summaryBase,
        summary: {
          userMessageID: event.payload.userMessageID,
          agent: event.payload.agent,
          model: summarizeModel(event.payload.model),
          resume: event.payload.resume ?? false,
        },
      }
    case "message.recorded":
      return {
        ...summaryBase,
        summary: summarizeMessage(event.payload.message),
      }
    case "part.recorded":
      return {
        ...summaryBase,
        summary: summarizePart(event.payload.part),
      }
    case "part.removed":
      return {
        ...summaryBase,
        summary: {
          partID: event.payload.partID,
          messageID: event.payload.messageID,
        },
      }
    case "permission.requested":
    case "permission.resolved": {
      const request = readRecord(event.payload.request)
      return {
        ...summaryBase,
        summary: {
          requestID: readString(request?.id) || undefined,
          status: readString(request?.status) || undefined,
          part: summarizePart(event.payload.part),
        },
      }
    }
    case "turn.completed":
      return {
        ...summaryBase,
        summary: {
          status: event.payload.status,
          finishReason: event.payload.finishReason,
          message: summarizeMessage(event.payload.message),
          partCount: event.payload.parts?.length ?? 0,
        },
      }
    case "turn.failed":
      return {
        ...summaryBase,
        summary: {
          error: event.payload.error,
          message: summarizeMessage(event.payload.message),
          partCount: event.payload.parts?.length ?? 0,
        },
      }
    case "text.part.started":
    case "reasoning.part.started":
      return {
        ...summaryBase,
        summary: {
          messageID: event.payload.messageID,
          partID: event.payload.partID,
          kind: event.payload.kind,
          textLength: event.payload.text.length,
        },
      }
    case "text.part.delta":
    case "reasoning.part.delta":
      return {
        ...summaryBase,
        summary: {
          messageID: event.payload.messageID,
          partID: event.payload.partID,
          kind: event.payload.kind,
          deltaLength: event.payload.delta.length,
          textLength: event.payload.text.length,
        },
      }
    case "text.part.completed":
    case "reasoning.part.completed":
      return {
        ...summaryBase,
        summary: summarizePart(event.payload.part),
      }
    case "tool.call.started":
    case "tool.call.waiting_approval":
    case "tool.call.approved":
    case "tool.call.denied":
    case "tool.call.completed":
    case "tool.call.failed":
    case "patch.generated":
      return {
        ...summaryBase,
        summary: summarizePart(event.payload.part),
      }
    case "snapshot.captured":
      return {
        ...summaryBase,
        summary: {
          part: summarizePart(event.payload.part),
          phase: event.payload.phase,
        },
      }
    case "retry.scheduled":
      return {
        ...summaryBase,
        summary: {
          attempt: event.payload.attempt,
          reason: event.payload.reason,
        },
      }
  }
}

function summarizeSession(session: Session.SessionInfo | null, sessionID?: string) {
  if (!session) {
    return {
      id: sessionID ?? "unknown",
      missing: true,
    }
  }

  return {
    id: session.id,
    projectID: session.projectID,
    directory: session.directory,
    title: session.title,
    created: session.time.created,
    updated: session.time.updated,
    missing: false,
  }
}

function buildSessionRuntimeSnapshot(sessionID: string, limit: number) {
  const session = Session.DataBaseRead("sessions", sessionID) as Session.SessionInfo | null
  const running = RunningState.info(sessionID)
  const activeTurn = Orchestrator.activeTurn(sessionID)
  const recentEvents = EventStore.listRecentSessionEvents({
    sessionID,
    limit,
  }).map(summarizeRuntimeEvent)

  return {
    session: summarizeSession(session, sessionID),
    status: running || activeTurn ? { type: "busy" as const } : { type: "idle" as const },
    running: running ?? {
      sessionID,
      activeForMs: 0,
      startedAt: null,
      reason: undefined,
    },
    turn: activeTurn
      ? {
          id: activeTurn.turnID,
          sessionID: activeTurn.sessionID,
        }
      : null,
    recentEvents,
  }
}

export function DebugRoutes() {
  const app = new Hono<AppEnv>()

  app.get("/runtime", (c) => {
    const limit = parseLimit(c.req.query("limit"), 5, 20)
    const runningSessions = RunningState.snapshot().map((item) => buildSessionRuntimeSnapshot(item.sessionID, limit))

    log.info("runtime debug snapshot requested", {
      requestId: c.get("requestId"),
      runningSessions: runningSessions.length,
      limit,
    })

    return c.json({
      success: true,
      data: {
        generatedAt: Date.now(),
        process: {
          pid: process.pid,
          uptimeMs: Math.round(process.uptime() * 1000),
          platform: process.platform,
        },
        logging: Log.status(),
        runningSessions,
      },
      requestId: c.get("requestId"),
    })
  })

  app.get("/sessions/:id/runtime", (c) => {
    const sessionID = c.req.param("id")
    const session = Session.DataBaseRead("sessions", sessionID) as Session.SessionInfo | null
    if (!session) {
      throw new ApiError(404, "SESSION_NOT_FOUND", `Session '${sessionID}' not found`)
    }

    const limit = parseLimit(c.req.query("limit"), 20, 100)
    const detail = buildSessionRuntimeSnapshot(sessionID, limit)

    log.info("session runtime debug requested", {
      requestId: c.get("requestId"),
      sessionID,
      limit,
    })

    return c.json({
      success: true,
      data: {
        generatedAt: Date.now(),
        logging: Log.status(),
        ...detail,
      },
      requestId: c.get("requestId"),
    })
  })

  return app
}
