import { Hono } from "hono"
import z from "zod"
import * as db from "#database/Sqlite.ts"
import * as Project from "#project/project.ts"
import * as Session from "#session/session.ts"
import { ApiError } from "#server/error.ts"
import type { AppEnv } from "#server/types.ts"

const CreateProjectBody = z.object({
  directory: z.string().min(1),
})

const CreateProjectSessionBody = z.object({
  directory: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
})

export function ProjectRoutes() {
  const app = new Hono<AppEnv>()

  app.get("/", async (c) => {
    const projects = await Project.list()
    return c.json({
      success: true,
      data: projects,
      requestId: c.get("requestId"),
    })
  })

  app.post("/", async (c) => {
    const payload = CreateProjectBody.safeParse(await c.req.json().catch(() => undefined))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must include a non-empty 'directory'")
    }

    const { project } = await Project.fromDirectory(payload.data.directory)

    return c.json(
      {
        success: true,
        data: project,
        requestId: c.get("requestId"),
      },
      201,
    )
  })

  app.get("/:id/sessions", (c) => {
    const id = c.req.param("id")
    const project = Project.get(id)
    if (!project) {
      throw new ApiError(404, "PROJECT_NOT_FOUND", `Project '${id}' not found`)
    }

    const sessions = db
      .findManyWithSchema("sessions", Session.SessionInfo, {
        where: [{ column: "projectID", value: id }],
      })
      .sort((left, right) => right.time.updated - left.time.updated)

    return c.json({
      success: true,
      data: sessions,
      requestId: c.get("requestId"),
    })
  })

  app.post("/:id/sessions", async (c) => {
    const id = c.req.param("id")
    const project = Project.get(id)
    if (!project) {
      throw new ApiError(404, "PROJECT_NOT_FOUND", `Project '${id}' not found`)
    }

    const payload = CreateProjectSessionBody.safeParse(await c.req.json().catch(() => ({})))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must include optional non-empty 'title' or 'directory'")
    }

    let directory = payload.data.directory?.trim() || project.worktree
    if (payload.data.directory) {
      const resolved = await Project.fromDirectory(directory)
      if (resolved.project.id !== id) {
        throw new ApiError(400, "DIRECTORY_NOT_IN_PROJECT", `Directory '${directory}' does not belong to project '${id}'`)
      }
      directory = payload.data.directory.trim()
    }

    const session = await Session.createSession({
      directory,
      projectID: id,
      title: payload.data.title?.trim() || undefined,
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

  app.delete("/:id", (c) => {
    const id = c.req.param("id")
    const project = Project.get(id)
    if (!project) {
      throw new ApiError(404, "PROJECT_NOT_FOUND", `Project '${id}' not found`)
    }

    const deletedSessions = Session.removeProjectSessions(id)
    db.deleteById("projects", id)

    return c.json({
      success: true,
      data: {
        projectID: id,
        deletedSessionIDs: deletedSessions.map((session) => session.id),
      },
      requestId: c.get("requestId"),
    })
  })

  app.get("/:id", (c) => {
    const id = c.req.param("id")
    const project = Project.get(id)
    if (!project) {
      throw new ApiError(404, "PROJECT_NOT_FOUND", `Project '${id}' not found`)
    }

    return c.json({
      success: true,
      data: project,
      requestId: c.get("requestId"),
    })
  })

  return app
}
