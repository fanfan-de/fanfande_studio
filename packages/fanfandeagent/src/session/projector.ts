import z from "zod"
import * as db from "#database/Sqlite.ts"
import * as Permission from "#permission/schema.ts"
import * as Message from "#session/message.ts"
import * as RuntimeEvent from "#session/runtime-event.ts"
import * as Session from "#session/session.ts"
import * as Task from "#session/task.ts"

let permissionProjectionGeneration = -1
const STREAM_PART_PROJECTION_INTERVAL_MS = 250

type StreamPartProjectionBuffer = {
  lastProjectedAt: number
  part: Message.TextPart | Message.ReasoningPart
}

const streamPartProjectionBuffers = new Map<string, StreamPartProjectionBuffer>()

function currentStreamPart(partID: string) {
  return Session.DataBaseRead("parts", partID) as Message.Part | null
}

function streamPartBufferKey(sessionID: string, partID: string) {
  return `${sessionID}:${partID}`
}

function readBufferedStreamPart(sessionID: string, partID: string) {
  return streamPartProjectionBuffers.get(streamPartBufferKey(sessionID, partID))?.part
}

function projectStreamPart(
  part: Message.TextPart | Message.ReasoningPart,
  force = false,
) {
  const key = streamPartBufferKey(part.sessionID, part.id)
  const current = streamPartProjectionBuffers.get(key)
  const now = Date.now()
  const lastProjectedAt = current?.lastProjectedAt ?? 0

  streamPartProjectionBuffers.set(key, {
    part,
    lastProjectedAt,
  })

  if (!force && now - lastProjectedAt < STREAM_PART_PROJECTION_INTERVAL_MS) {
    return
  }

  Session.upsertPart(part)
  streamPartProjectionBuffers.set(key, {
    part,
    lastProjectedAt: now,
  })
}

function clearStreamPartProjection(sessionID: string, partID: string) {
  streamPartProjectionBuffers.delete(streamPartBufferKey(sessionID, partID))
}

function ensurePermissionProjectionTables() {
  const generation = db.getDatabaseGeneration()
  if (permissionProjectionGeneration === generation && generation > 0) return
  if (!db.tableExists("permission_requests")) {
    db.createTableByZodObject("permission_requests", Permission.Request)
  }
  db.syncTableColumnsWithZodObject("permission_requests", Permission.Request)
  permissionProjectionGeneration = db.getDatabaseGeneration()
}

function upsertPermissionRequest(request: Permission.Request) {
  ensurePermissionProjectionTables()
  const existing = db.findById("permission_requests", Permission.Request, request.id)
  if (existing) {
    db.updateByIdWithSchema("permission_requests", request.id, request, Permission.Request)
    return
  }

  db.insertOneWithSchema("permission_requests", request, Permission.Request)
}

function projectTextPart(
  event:
    | z.infer<typeof RuntimeEvent.TextPartStartedEvent>
    | z.infer<typeof RuntimeEvent.TextPartDeltaEvent>,
) {
  const existing = readBufferedStreamPart(event.sessionID, event.payload.partID) ?? currentStreamPart(event.payload.partID)
  const text =
    event.type === "text.part.delta"
      ? event.payload.text ?? `${existing?.type === "text" ? existing.text : ""}${event.payload.delta}`
      : event.payload.text
  const next = Message.TextPart.parse({
    id: event.payload.partID,
    sessionID: event.sessionID,
    messageID: event.payload.messageID,
    type: "text",
    text,
    time: {
      start:
        existing?.type === "text"
          ? existing.time?.start ?? event.timestamp
          : event.timestamp,
    },
    metadata: event.payload.metadata,
  })

  projectStreamPart(next, event.type === "text.part.started")
}

function projectReasoningPart(
  event:
    | z.infer<typeof RuntimeEvent.ReasoningPartStartedEvent>
    | z.infer<typeof RuntimeEvent.ReasoningPartDeltaEvent>,
) {
  const existing = readBufferedStreamPart(event.sessionID, event.payload.partID) ?? currentStreamPart(event.payload.partID)
  const text =
    event.type === "reasoning.part.delta"
      ? event.payload.text ?? `${existing?.type === "reasoning" ? existing.text : ""}${event.payload.delta}`
      : event.payload.text
  const next = Message.ReasoningPart.parse({
    id: event.payload.partID,
    sessionID: event.sessionID,
    messageID: event.payload.messageID,
    type: "reasoning",
    text,
    time: {
      start:
        existing?.type === "reasoning"
          ? existing.time.start
          : event.timestamp,
    },
    metadata: event.payload.metadata,
  })

  projectStreamPart(next, event.type === "reasoning.part.started")
}

function projectTerminalState(
  event:
    | z.infer<typeof RuntimeEvent.TurnCompletedEvent>
    | z.infer<typeof RuntimeEvent.TurnFailedEvent>
    | z.infer<typeof RuntimeEvent.TurnCancelledEvent>,
) {
  if (event.payload.message) {
    Session.upsertMessage(event.payload.message)
  }

  for (const part of event.payload.parts ?? []) {
    clearStreamPartProjection(event.sessionID, part.id)
    Session.upsertPart(part)
  }
}

export function project(event: RuntimeEvent.RuntimeEvent) {
  switch (event.type) {
    case "turn.started":
    case "turn.state.changed":
    case "llm.call.started":
    case "llm.call.completed":
    case "llm.call.failed":
    case "turn.error.context":
    case "retry.scheduled":
      return
    case "task.state.updated":
      Task.replaceTasksFromState({
        sessionID: event.sessionID,
        state: event.payload.state,
      })
      return
    case "message.recorded":
      Session.upsertMessage(event.payload.message)
      return
    case "part.recorded":
      Session.upsertPart(event.payload.part)
      return
    case "part.removed":
      clearStreamPartProjection(event.sessionID, event.payload.partID)
      Session.deletePart(event.payload.partID)
      return
    case "permission.requested":
    case "permission.resolved":
      upsertPermissionRequest(event.payload.request)
      Session.upsertPart(event.payload.part)
      return
    case "text.part.started":
    case "text.part.delta":
      projectTextPart(event)
      return
    case "text.part.completed":
      clearStreamPartProjection(event.sessionID, event.payload.part.id)
      Session.upsertPart(event.payload.part)
      return
    case "reasoning.part.started":
    case "reasoning.part.delta":
      projectReasoningPart(event)
      return
    case "reasoning.part.completed":
      clearStreamPartProjection(event.sessionID, event.payload.part.id)
      Session.upsertPart(event.payload.part)
      return
    case "tool.call.pending":
    case "tool.call.started":
    case "tool.call.waiting_approval":
    case "tool.call.approved":
    case "tool.call.denied":
    case "tool.call.completed":
    case "tool.call.failed":
    case "source.recorded":
    case "file.generated":
    case "patch.generated":
    case "snapshot.captured":
      Session.upsertPart(event.payload.part)
      return
    case "turn.completed":
    case "turn.failed":
    case "turn.cancelled":
      projectTerminalState(event)
      return
  }
}
