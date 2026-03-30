import { Hono } from "hono"
import z from "zod"
import * as Project from "#project/project.ts"
import * as Session from "#session/session.ts"
import { ApiError } from "#server/error.ts"
import type { AppEnv } from "#server/types.ts"

const CreateSessionBody = z.object({
  directory: z.string().min(1),
})

export function SessionRoutes() {
  const app = new Hono<AppEnv>()

  app.get("/", (c) => {
    return c.json({
      success: true,
      data: {
        hint: "Use POST /api/sessions with { directory } to create a session",
      },
      requestId: c.get("requestId"),
    })
  })

  app.post("/", async (c) => {
    const payload = CreateSessionBody.safeParse(await c.req.json().catch(() => undefined))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must include a non-empty 'directory'")
    }

    const { project } = await Project.fromDirectory(payload.data.directory)
    const session = await Session.createSession({
      directory: payload.data.directory,
      projectID: project.id,
    })

    return c.json(
      {
        success: true,
        data: session,
        requestId: c.get("requestId"),
      },
      201,
    )
  })

  app.get("/:id", (c) => {
    const id = c.req.param("id")
    const session = (() => {
      try {
        return Session.DataBaseRead("sessions", id)
      } catch {
        return null
      }
    })()
    if (!session) {
      throw new ApiError(404, "SESSION_NOT_FOUND", `Session '${id}' not found`)
    }

    return c.json({
      success: true,
      data: session,
      requestId: c.get("requestId"),
    })
  })

  return app
}
