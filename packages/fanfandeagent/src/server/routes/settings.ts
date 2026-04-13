import { Hono } from "hono"
import z from "zod"
import * as Config from "#config/config.ts"
import * as Provider from "#provider/provider.ts"
import * as Skill from "#skill/skill.ts"
import * as SkillManager from "#skill/manage.ts"
import { ApiError } from "#server/error.ts"
import type { AppEnv } from "#server/types.ts"

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

export function SettingsRoutes() {
  const app = new Hono<AppEnv>()
  const SkillFileQuery = z.object({
    path: z.string().min(1),
  })
  const SkillFileBody = z.object({
    path: z.string().min(1),
    content: z.string(),
  })
  const CreateSkillBody = z.object({
    name: z.string().min(1),
  })
  const RenameSkillBody = z.object({
    directory: z.string().min(1),
    name: z.string().min(1),
  })
  const DeleteSkillQuery = z.object({
    directory: z.string().min(1),
  })
  const UpdateMcpServerBody = Config.McpServerInput

  function toSkillApiError(error: unknown) {
    if (error instanceof SkillManager.SkillManagerError) {
      if (error.code === "SKILL_FILE_NOT_FOUND" || error.code === "SKILL_NOT_FOUND") {
        return new ApiError(404, error.code, error.message)
      }

      if (error.code === "SKILL_ALREADY_EXISTS") {
        return new ApiError(409, error.code, error.message)
      }

      return new ApiError(400, error.code, error.message)
    }

    return error
  }

  app.get("/providers/catalog", async (c) => {
    const catalog = await Provider.catalog()

    return c.json({
      success: true,
      data: catalog,
      requestId: c.get("requestId"),
    })
  })

  app.get("/providers", async (c) => {
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

  app.get("/models", async (c) => {
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

  app.put("/providers/:providerID", async (c) => {
    const providerID = c.req.param("providerID")
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

    return c.json({
      success: true,
      data: {
        provider,
        selection: {
          model: providerConfig.model,
          small_model: providerConfig.small_model,
        },
      },
      requestId: c.get("requestId"),
    })
  })

  app.delete("/providers/:providerID", async (c) => {
    const providerID = c.req.param("providerID")
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

  app.patch("/model-selection", async (c) => {
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

  app.get("/mcp/servers", async (c) => {
    return c.json({
      success: true,
      data: await Config.listMcpServers(Config.GLOBAL_CONFIG_ID),
      requestId: c.get("requestId"),
    })
  })

  app.put("/mcp/servers/:serverID", async (c) => {
    const serverID = c.req.param("serverID")
    const payload = UpdateMcpServerBody.safeParse(await c.req.json().catch(() => undefined))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must be a valid MCP server configuration")
    }

    const server = await Config.setMcpServer(Config.GLOBAL_CONFIG_ID, serverID, payload.data)
    return c.json({
      success: true,
      data: server,
      requestId: c.get("requestId"),
    })
  })

  app.delete("/mcp/servers/:serverID", async (c) => {
    const serverID = c.req.param("serverID")

    return c.json({
      success: true,
      data: {
        serverID,
        removed: Boolean(await Config.removeMcpServer(Config.GLOBAL_CONFIG_ID, serverID)),
      },
      requestId: c.get("requestId"),
    })
  })

  app.get("/skills", async (c) => {
    return c.json({
      success: true,
      data: await Skill.listGlobal(),
      requestId: c.get("requestId"),
    })
  })

  app.get("/skills/tree", async (c) => {
    return c.json({
      success: true,
      data: await SkillManager.getGlobalSkillTree(),
      requestId: c.get("requestId"),
    })
  })

  app.get("/skills/file", async (c) => {
    const payload = SkillFileQuery.safeParse({
      path: c.req.query("path"),
    })
    if (!payload.success) {
      throw new ApiError(400, "INVALID_QUERY", "Query parameter 'path' must be a non-empty string.")
    }

    try {
      return c.json({
        success: true,
        data: await SkillManager.readGlobalSkillFile(payload.data.path),
        requestId: c.get("requestId"),
      })
    } catch (error) {
      throw toSkillApiError(error)
    }
  })

  app.put("/skills/file", async (c) => {
    const payload = SkillFileBody.safeParse(await c.req.json().catch(() => undefined))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must contain a non-empty 'path' and string 'content'.")
    }

    try {
      return c.json({
        success: true,
        data: await SkillManager.writeGlobalSkillFile(payload.data),
        requestId: c.get("requestId"),
      })
    } catch (error) {
      throw toSkillApiError(error)
    }
  })

  app.post("/skills", async (c) => {
    const payload = CreateSkillBody.safeParse(await c.req.json().catch(() => undefined))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must contain a non-empty 'name'.")
    }

    try {
      return c.json(
        {
          success: true,
          data: await SkillManager.createGlobalSkill(payload.data.name),
          requestId: c.get("requestId"),
        },
        201,
      )
    } catch (error) {
      throw toSkillApiError(error)
    }
  })

  app.patch("/skills", async (c) => {
    const payload = RenameSkillBody.safeParse(await c.req.json().catch(() => undefined))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must contain non-empty 'directory' and 'name' fields.")
    }

    try {
      return c.json({
        success: true,
        data: await SkillManager.renameGlobalSkill(payload.data),
        requestId: c.get("requestId"),
      })
    } catch (error) {
      throw toSkillApiError(error)
    }
  })

  app.delete("/skills", async (c) => {
    const payload = DeleteSkillQuery.safeParse({
      directory: c.req.query("directory"),
    })
    if (!payload.success) {
      throw new ApiError(400, "INVALID_QUERY", "Query parameter 'directory' must be a non-empty string.")
    }

    try {
      await SkillManager.deleteGlobalSkill(payload.data.directory)
      return c.json({
        success: true,
        data: {
          directory: payload.data.directory,
          removed: true,
        },
        requestId: c.get("requestId"),
      })
    } catch (error) {
      throw toSkillApiError(error)
    }
  })

  return app
}
