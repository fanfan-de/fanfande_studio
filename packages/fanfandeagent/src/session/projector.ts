import z from "zod"
import * as db from "#database/Sqlite.ts"
import * as Permission from "#permission/schema.ts"
import * as Message from "#session/message.ts"
import * as RuntimeEvent from "#session/runtime-event.ts"
import * as Session from "#session/session.ts"

let permissionProjectionGeneration = -1

function currentStreamPart(partID: string) {
  return Session.DataBaseRead("parts", partID) as Message.Part | null
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
  const existing = currentStreamPart(event.payload.partID)
  const next = Message.TextPart.parse({
    id: event.payload.partID,
    sessionID: event.sessionID,
    messageID: event.payload.messageID,
    type: "text",
    text: event.payload.text,
    time: {
      start:
        existing?.type === "text"
          ? existing.time?.start ?? event.timestamp
          : event.timestamp,
    },
    metadata: event.payload.metadata,
  })

  Session.upsertPart(next)
}

function projectReasoningPart(
  event:
    | z.infer<typeof RuntimeEvent.ReasoningPartStartedEvent>
    | z.infer<typeof RuntimeEvent.ReasoningPartDeltaEvent>,
) {
  const existing = currentStreamPart(event.payload.partID)
  const next = Message.ReasoningPart.parse({
    id: event.payload.partID,
    sessionID: event.sessionID,
    messageID: event.payload.messageID,
    type: "reasoning",
    text: event.payload.text,
    time: {
      start:
        existing?.type === "reasoning"
          ? existing.time.start
          : event.timestamp,
    },
    metadata: event.payload.metadata,
  })

  Session.upsertPart(next)
}

function projectTerminalState(
  event:
    | z.infer<typeof RuntimeEvent.TurnCompletedEvent>
    | z.infer<typeof RuntimeEvent.TurnFailedEvent>,
) {
  if (event.payload.message) {
    Session.upsertMessage(event.payload.message)
  }

  for (const part of event.payload.parts ?? []) {
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
    case "message.recorded":
      Session.upsertMessage(event.payload.message)
      return
    case "part.recorded":
      Session.upsertPart(event.payload.part)
      return
    case "part.removed":
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
      Session.upsertPart(event.payload.part)
      return
    case "reasoning.part.started":
    case "reasoning.part.delta":
      projectReasoningPart(event)
      return
    case "reasoning.part.completed":
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
      projectTerminalState(event)
      return
  }
}
