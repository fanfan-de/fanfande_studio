import { Hono } from "hono"
import * as Project from "#project/project.ts"
import { ApiError } from "#server/error.ts"
import type { AppEnv } from "#server/types.ts"

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
