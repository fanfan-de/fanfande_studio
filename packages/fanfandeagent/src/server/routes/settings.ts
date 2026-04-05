import { Hono } from "hono"
import * as Config from "#config/config.ts"
import * as Provider from "#provider/provider.ts"
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

  return app
}
