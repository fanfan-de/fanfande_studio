import z from "zod"
import * as db from "#database/Sqlite.ts"
import * as Permission from "#permission/schema.ts"
import * as RuntimeEvent from "#session/runtime/runtime-event.ts"
import * as Session from "#session/core/session.ts"
import * as Task from "#session/tasks/task.ts"

let permissionProjectionGeneration = -1

function clearStreamPartProjection(sessionID: string, partID: string) {
  void sessionID
  void partID
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

function projectTerminalState(
  event:
    | z.infer<typeof RuntimeEvent.TurnCompletedEvent>
    | z.infer<typeof RuntimeEvent.TurnFailedEvent>
    | z.infer<typeof RuntimeEvent.TurnCancelledEvent>,
) {
  if (event.payload.message && event.payload.message.role !== "assistant") {
    Session.upsertMessage(event.payload.message)
  }

  for (const part of event.payload.parts ?? []) {
    clearStreamPartProjection(event.sessionID, part.id)
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
      return
    case "text.part.completed":
      clearStreamPartProjection(event.sessionID, event.payload.part.id)
      return
    case "reasoning.part.started":
    case "reasoning.part.delta":
      return
    case "reasoning.part.completed":
      clearStreamPartProjection(event.sessionID, event.payload.part.id)
      return
    case "tool.call.pending":
    case "tool.call.started":
    case "tool.call.waiting_approval":
    case "tool.call.approved":
    case "tool.call.denied":
    case "tool.call.completed":
    case "tool.call.failed":
      Session.upsertPart(event.payload.part)
      return
    case "source.recorded":
    case "file.generated":
      return
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
