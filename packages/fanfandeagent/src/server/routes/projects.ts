import { Hono } from "hono"
import z from "zod"
import * as db from "#database/Sqlite.ts"
import * as Project from "#project/project.ts"
import * as Session from "#session/session.ts"
import * as Config from "#config/config.ts"
import * as Provider from "#provider/provider.ts"
import { ApiError } from "#server/error.ts"
import type { AppEnv } from "#server/types.ts"

const CreateProjectBody = z.object({
  directory: z.string().min(1),
})

const CreateProjectSessionBody = z.object({
  directory: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
})

function safeReadProject(projectID: string) {
  const project = Project.get(projectID)
  if (!project) {
    throw new ApiError(404, "PROJECT_NOT_FOUND", `Project '${projectID}' not found`)
  }

  return project
}

function parseModelReference(value: string) {
  const [providerID, ...rest] = value.split("/")
  const modelID = rest.join("/")
  if (!providerID || !modelID) {
    throw new ApiError(400, "INVALID_MODEL_REFERENCE", `Model '${value}' must use the format provider/model`)
  }

  return {
    providerID,
    modelID,
  }
}

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
    const project = safeReadProject(id)

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
    const project = safeReadProject(id)

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

  app.get("/:id/providers/catalog", async (c) => {
    const id = c.req.param("id")
    safeReadProject(id)

    const catalog = await Provider.catalog()

    return c.json({
      success: true,
      data: catalog,
      requestId: c.get("requestId"),
    })
  })

  app.get("/:id/providers", async (c) => {
    const id = c.req.param("id")
    safeReadProject(id)

    const data = {
      items: await Provider.listPublicProviders(),
      selection: await Provider.getSelection(),
    }

    return c.json({
      success: true,
      data,
      requestId: c.get("requestId"),
    })
  })

  app.get("/:id/models", async (c) => {
    const id = c.req.param("id")
    safeReadProject(id)

    const data = {
      items: await Provider.listModels(),
      selection: await Provider.getSelection(),
    }

    return c.json({
      success: true,
      data,
      requestId: c.get("requestId"),
    })
  })

  app.put("/:id/providers/:providerID", async (c) => {
    const id = c.req.param("id")
    const providerID = c.req.param("providerID")
    safeReadProject(id)

    const payload = Config.Provider.safeParse(await c.req.json().catch(() => undefined))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must be a valid provider configuration")
    }

    try {
      await Provider.validateProviderConfig(providerID, payload.data, Config.GLOBAL_CONFIG_ID)
    } catch (error) {
      throw new ApiError(
        400,
        "PROVIDER_VALIDATION_FAILED",
        error instanceof Error ? error.message : String(error),
      )
    }

    const providerConfig = await Config.setProvider(Config.GLOBAL_CONFIG_ID, providerID, payload.data)
    const provider = await Provider.getPublicProvider(providerID)
    if (!provider) {
      throw new ApiError(404, "PROVIDER_NOT_FOUND", `Provider '${providerID}' not found in the catalog`)
    }

    const data = {
      provider,
      selection: {
        model: providerConfig.model,
        small_model: providerConfig.small_model,
      },
    }

    return c.json({
      success: true,
      data,
      requestId: c.get("requestId"),
    })
  })

  app.delete("/:id/providers/:providerID", async (c) => {
    const id = c.req.param("id")
    const providerID = c.req.param("providerID")
    safeReadProject(id)

    const providerConfig = await Config.removeProvider(Config.GLOBAL_CONFIG_ID, providerID)

    return c.json({
      success: true,
      data: {
        providerID,
        selection: {
          model: providerConfig.model,
          small_model: providerConfig.small_model,
        },
      },
      requestId: c.get("requestId"),
    })
  })

  app.patch("/:id/model-selection", async (c) => {
    const id = c.req.param("id")
    safeReadProject(id)

    const payload = Config.ModelSelection.safeParse(await c.req.json().catch(() => undefined))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must contain nullable 'model' and 'small_model' fields")
    }

    if (payload.data.model) {
      const ref = parseModelReference(payload.data.model)
      await Provider.getModel(ref.providerID, ref.modelID)
    }

    if (payload.data.small_model) {
      const ref = parseModelReference(payload.data.small_model)
      await Provider.getModel(ref.providerID, ref.modelID)
    }

    const selection = await Config.setModelSelection(Config.GLOBAL_CONFIG_ID, payload.data)
    return c.json({
      success: true,
      data: {
        model: selection.model,
        small_model: selection.small_model,
      },
      requestId: c.get("requestId"),
    })
  })

  app.delete("/:id", (c) => {
    const id = c.req.param("id")
    safeReadProject(id)

    const deletedSessions = Session.removeProjectSessions(id)
    db.deleteById("projects", id)
    db.deleteById("project_configs", id, "projectID")

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
    const project = safeReadProject(id)

    return c.json({
      success: true,
      data: project,
      requestId: c.get("requestId"),
    })
  })

  return app
}
