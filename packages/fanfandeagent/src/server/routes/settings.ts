import { Hono } from "hono"
import z from "zod"
import * as Config from "#config/config.ts"
import * as ModelsDev from "#provider/modelsdev.ts"
import * as Provider from "#provider/provider.ts"
import * as PromptPresets from "#session/prompt-presets.ts"
import * as Skill from "#skill/skill.ts"
import * as SkillManager from "#skill/manage.ts"
import { ApiError } from "#server/error.ts"
import type { AppEnv } from "#server/types.ts"
import * as ProviderAuth from "#auth/provider-auth.ts"

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
  const ProviderAuthFlowBody = z.object({
    method: z.string().min(1),
  })
  const ProviderAuthApiKeyBody = z.object({
    apiKey: z.string().nullable().optional(),
  })
  const PromptPresetCreateBody = z.object({
    label: z.string().optional(),
    content: z.string().optional(),
    description: z.string().optional(),
  })
  const PromptPresetBody = z.object({
    label: z.string().optional(),
    content: z.string(),
    description: z.string().optional(),
  })
  const PromptPresetSelectionBody = z.object({
    systemPromptPresetID: z.string().min(1),
    planModePromptPresetID: z.string().min(1),
  })

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

  function toPromptPresetApiError(error: unknown) {
    if (!(error instanceof Error)) {
      return error
    }

    if (error.message.startsWith("Unknown prompt preset")) {
      return new ApiError(404, "PROMPT_PRESET_NOT_FOUND", error.message)
    }

    if (error.message.includes("cannot be reset") || error.message.includes("cannot be deleted")) {
      return new ApiError(400, "PROMPT_PRESET_ACTION_NOT_ALLOWED", error.message)
    }

    return error
  }

  function resolveServerBaseURL(c: { req: { url: string } }) {
    const requestURL = new URL(c.req.url)
    return `${requestURL.protocol}//${requestURL.host}`
  }

  async function readProviderAuthState(providerID: string) {
    const catalog = await Provider.catalog()
    const item = catalog.find((entry) => entry.id === providerID)
    if (item?.authState) return item.authState
    return ProviderAuth.createDisconnectedProviderAuthState(providerID)
  }

  app.get("/providers/catalog", async (c) => {
    const catalog = await Provider.catalog()

    return c.json({
      success: true,
      data: catalog,
      requestId: c.get("requestId"),
    })
  })

  app.post("/providers/catalog/refresh", async (c) => {
    try {
      await ModelsDev.refresh()
    } catch (error) {
      throw new ApiError(
        502,
        "PROVIDER_CATALOG_REFRESH_FAILED",
        error instanceof Error ? error.message : String(error),
      )
    }

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

  app.get("/providers/:providerID/auth", async (c) => {
    const providerID = c.req.param("providerID")

    return c.json({
      success: true,
      data: await readProviderAuthState(providerID),
      requestId: c.get("requestId"),
    })
  })

  app.post("/providers/:providerID/auth/flows", async (c) => {
    const providerID = c.req.param("providerID")
    const payload = ProviderAuthFlowBody.safeParse(await c.req.json().catch(() => undefined))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must contain a non-empty 'method' field.")
    }

    try {
      const flow = await ProviderAuth.startProviderAuthFlow({
        providerID,
        method: payload.data.method,
        serverBaseURL: resolveServerBaseURL(c),
      })
      return c.json({
        success: true,
        data: flow,
        requestId: c.get("requestId"),
      })
    } catch (error) {
      throw new ApiError(400, "PROVIDER_AUTH_FLOW_FAILED", error instanceof Error ? error.message : String(error))
    }
  })

  app.get("/providers/:providerID/auth/flows/:flowID", async (c) => {
    const providerID = c.req.param("providerID")
    const flowID = c.req.param("flowID")
    const flow = await ProviderAuth.getProviderFlow(providerID, flowID)
    if (!flow) {
      throw new ApiError(404, "PROVIDER_AUTH_FLOW_NOT_FOUND", `Auth flow '${flowID}' was not found`)
    }

    return c.json({
      success: true,
      data: flow,
      requestId: c.get("requestId"),
    })
  })

  app.delete("/providers/:providerID/auth/flows/:flowID", async (c) => {
    const providerID = c.req.param("providerID")
    const flowID = c.req.param("flowID")
    const flow = await ProviderAuth.cancelProviderAuthFlow(providerID, flowID)
    if (!flow) {
      throw new ApiError(404, "PROVIDER_AUTH_FLOW_NOT_FOUND", `Auth flow '${flowID}' was not found`)
    }

    return c.json({
      success: true,
      data: flow,
      requestId: c.get("requestId"),
    })
  })

  app.get("/providers/:providerID/auth/callback", async (c) => {
    const providerID = c.req.param("providerID")
    const result = await ProviderAuth.completeProviderBrowserCallback({
      providerID,
      url: new URL(c.req.url),
    })

    return c.html(
      ProviderAuth.renderProviderAuthCallbackPage({
        ok: result.ok,
        title: result.title,
        message: result.message,
      }),
      result.status as 200 | 400 | 500,
    )
  })

  app.put("/providers/:providerID/auth/api-key", async (c) => {
    const providerID = c.req.param("providerID")
    const payload = ProviderAuthApiKeyBody.safeParse(await c.req.json().catch(() => undefined))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must contain an optional nullable 'apiKey' field.")
    }

    await ProviderAuth.saveProviderApiKey(providerID, payload.data.apiKey)

    return c.json({
      success: true,
      data: await readProviderAuthState(providerID),
      requestId: c.get("requestId"),
    })
  })

  app.delete("/providers/:providerID/auth/session", async (c) => {
    const providerID = c.req.param("providerID")
    await ProviderAuth.deleteProviderSession(providerID)

    return c.json({
      success: true,
      data: await readProviderAuthState(providerID),
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

  app.get("/prompts", async (c) => {
    return c.json({
      success: true,
      data: await PromptPresets.listPromptPresetSummaries(Config.GLOBAL_CONFIG_ID),
      requestId: c.get("requestId"),
    })
  })

  app.get("/prompts/selection", async (c) => {
    return c.json({
      success: true,
      data: await PromptPresets.getPromptPresetSelection(Config.GLOBAL_CONFIG_ID),
      requestId: c.get("requestId"),
    })
  })

  app.put("/prompts/selection", async (c) => {
    const payload = PromptPresetSelectionBody.safeParse(await c.req.json().catch(() => undefined))
    if (!payload.success) {
      throw new ApiError(
        400,
        "INVALID_PAYLOAD",
        "Body must contain non-empty 'systemPromptPresetID' and 'planModePromptPresetID' fields.",
      )
    }

    try {
      return c.json({
        success: true,
        data: await PromptPresets.updatePromptPresetSelection(payload.data, Config.GLOBAL_CONFIG_ID),
        requestId: c.get("requestId"),
      })
    } catch (error) {
      throw toPromptPresetApiError(error)
    }
  })

  app.post("/prompts", async (c) => {
    const payload = PromptPresetCreateBody.safeParse(await c.req.json().catch(() => undefined))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must be a valid prompt preset input.")
    }

    try {
      return c.json({
        success: true,
        data: await PromptPresets.createPromptPreset(payload.data, Config.GLOBAL_CONFIG_ID),
        requestId: c.get("requestId"),
      })
    } catch (error) {
      throw toPromptPresetApiError(error)
    }
  })

  app.get("/prompts/:presetID", async (c) => {
    const presetID = c.req.param("presetID")

    try {
      return c.json({
        success: true,
        data: await PromptPresets.readPromptPresetDocument(presetID, Config.GLOBAL_CONFIG_ID),
        requestId: c.get("requestId"),
      })
    } catch (error) {
      throw toPromptPresetApiError(error)
    }
  })

  app.put("/prompts/:presetID", async (c) => {
    const presetID = c.req.param("presetID")
    const payload = PromptPresetBody.safeParse(await c.req.json().catch(() => undefined))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must contain a string 'content' field.")
    }

    try {
      return c.json({
        success: true,
        data: await PromptPresets.updatePromptPreset(presetID, payload.data, Config.GLOBAL_CONFIG_ID),
        requestId: c.get("requestId"),
      })
    } catch (error) {
      throw toPromptPresetApiError(error)
    }
  })

  app.delete("/prompts/:presetID", async (c) => {
    const presetID = c.req.param("presetID")

    try {
      return c.json({
        success: true,
        data: await PromptPresets.resetPromptPreset(presetID, Config.GLOBAL_CONFIG_ID),
        requestId: c.get("requestId"),
      })
    } catch (error) {
      throw toPromptPresetApiError(error)
    }
  })

  app.delete("/prompts/:presetID/custom", async (c) => {
    const presetID = c.req.param("presetID")

    try {
      return c.json({
        success: true,
        data: await PromptPresets.deletePromptPreset(presetID, Config.GLOBAL_CONFIG_ID),
        requestId: c.get("requestId"),
      })
    } catch (error) {
      throw toPromptPresetApiError(error)
    }
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
