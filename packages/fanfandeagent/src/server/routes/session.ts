import { Hono } from "hono"
import { ok, parseJsonBody } from "#server/http.ts"
import type { AppEnv } from "#server/types.ts"
import * as SessionUseCase from "#server/usecases/session.ts"

export { createSessionExecutionStream } from "#server/usecases/session.ts"

export function SessionRoutes() {
  const app = new Hono<AppEnv>()

  app.get("/", (c) =>
    ok(c, {
      hint: "Use POST /api/sessions with { directory } to create a session",
    }),
  )

  app.post("/", async (c) => {
    const payload = await parseJsonBody(
      c,
      SessionUseCase.CreateSessionBody,
      "Body must include a non-empty 'directory'",
    )
    return ok(c, await SessionUseCase.createSession(payload), 201)
  })

  app.get("/archived", (c) => ok(c, SessionUseCase.listArchivedSessions()))

  app.post("/:id/archive", (c) => ok(c, SessionUseCase.archiveSession(c.req.param("id"))))

  app.post("/archived/:id/restore", (c) => ok(c, SessionUseCase.restoreArchivedSession(c.req.param("id"))))

  app.delete("/archived/:id", (c) => ok(c, SessionUseCase.deleteArchivedSession(c.req.param("id"))))

  app.post("/:id/side-chats", async (c) => {
    const payload = await parseJsonBody(
      c,
      SessionUseCase.CreateSideChatBody,
      "Body must include a non-empty 'anchorMessageID'",
    )
    return ok(c, await SessionUseCase.createSideChat(c.req.param("id"), payload), 201)
  })

  app.get("/:id/side-chats", (c) =>
    ok(
      c,
      SessionUseCase.listSideChats(
        c.req.param("id"),
        c.req.query("anchorMessageID")?.trim() || undefined,
      ),
    ),
  )

  app.get("/:id/side-chat-link", (c) => ok(c, SessionUseCase.getSideChatLink(c.req.param("id"))))

  app.get("/:id/side-chat-context", (c) => ok(c, SessionUseCase.getSideChatContext(c.req.param("id"))))

  app.get("/:id/tasks", (c) =>
    ok(
      c,
      SessionUseCase.listSessionTasks(c.req.param("id"), {
        owner: c.req.query("owner"),
        status: c.req.query("status"),
        includeCompleted: c.req.query("includeCompleted"),
      }),
    ),
  )

  app.get("/:id/tasks/:taskID", (c) =>
    ok(c, SessionUseCase.getSessionTask(c.req.param("id"), c.req.param("taskID"))),
  )

  app.get("/:id", (c) => ok(c, SessionUseCase.getSession(c.req.param("id"))))

  app.get("/:id/models", async (c) => ok(c, await SessionUseCase.listSessionModels(c.req.param("id"))))

  app.patch("/:id/model-selection", async (c) => {
    const payload = await parseJsonBody(
      c,
      SessionUseCase.UpdateSessionModelSelectionBody,
      "Body must contain nullable 'model' and 'small_model' fields",
    )
    return ok(c, await SessionUseCase.updateSessionModelSelection(c.req.param("id"), payload))
  })

  app.get("/:id/messages", async (c) => ok(c, await SessionUseCase.listSessionMessages(c.req.param("id"))))

  app.get("/:id/diff", async (c) => ok(c, await SessionUseCase.getSessionDiff(c.req.param("id"))))

  app.post("/:id/cancel", (c) => ok(c, SessionUseCase.cancelSession(c.req.param("id"))))

  app.delete("/:id", (c) => ok(c, SessionUseCase.deleteSession(c.req.param("id"))))

  app.get("/:id/events/stream", (c) =>
    SessionUseCase.createEventStreamResponse({
      sessionID: c.req.param("id"),
      requestId: c.get("requestId"),
      replayCursor: c.req.query("since") ?? c.req.header("last-event-id"),
    }),
  )

  app.post("/:id/messages/stream", async (c) => {
    const payload = await parseJsonBody(
      c,
      SessionUseCase.StreamSessionMessageBody,
      "Body must include a non-empty 'text' or at least one attachment",
    )
    return SessionUseCase.createMessageStreamResponse({
      sessionID: c.req.param("id"),
      payload,
      requestId: c.get("requestId"),
      replayTurnID: c.req.query("turnID"),
      sinceSeq: c.req.query("sinceSeq"),
    })
  })

  app.post("/:id/resume/stream", (c) =>
    SessionUseCase.createResumeStreamResponse({
      sessionID: c.req.param("id"),
      requestId: c.get("requestId"),
      replayTurnID: c.req.query("turnID"),
      sinceSeq: c.req.query("sinceSeq"),
    }),
  )

  return app
}
