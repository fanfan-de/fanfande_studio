import z from "zod"
import * as ProviderAuth from "#auth/provider-auth.ts"
import * as Config from "#config/config.ts"
import * as ModelsDev from "#provider/modelsdev.ts"
import * as Provider from "#provider/provider.ts"
import { ApiError } from "#server/error.ts"
import * as PromptPresets from "#session/prompt-presets.ts"
import * as Skill from "#skill/skill.ts"
import * as SkillManager from "#skill/manage.ts"

export const SkillFileQuery = z.object({
  path: z.string().min(1),
})

export const SkillFileBody = z.object({
  path: z.string().min(1),
  content: z.string(),
})

export const CreateSkillBody = z.object({
  name: z.string().min(1),
})

export const RenameSkillBody = z.object({
  directory: z.string().min(1),
  name: z.string().min(1),
})

export const DeleteSkillQuery = z.object({
  directory: z.string().min(1),
})

export const UpdateMcpServerBody = Config.McpServerInput
export const UpdateGlobalProviderBody = Config.Provider
export const UpdateGlobalModelSelectionBody = Config.ModelSelection

export const ProviderAuthFlowBody = z.object({
  method: z.string().min(1),
})

export const ProviderAuthApiKeyBody = z.object({
  apiKey: z.string().nullable().optional(),
})

export const PromptPresetCreateBody = z.object({
  label: z.string().optional(),
  content: z.string().optional(),
  description: z.string().optional(),
})

export const PromptPresetBody = z.object({
  label: z.string().optional(),
  content: z.string(),
  description: z.string().optional(),
})

export const PromptPresetSelectionBody = z.object({
  systemPromptPresetID: z.string().min(1),
  planModePromptPresetID: z.string().min(1),
})

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

async function readProviderAuthState(providerID: string) {
  const catalog = await Provider.catalog()
  const item = catalog.find((entry) => entry.id === providerID)
  if (item?.authState) return item.authState
  return ProviderAuth.createDisconnectedProviderAuthState(providerID)
}

export async function listProviderCatalog() {
  return Provider.catalog()
}

export async function refreshProviderCatalog() {
  try {
    await ModelsDev.refresh()
  } catch (error) {
    throw new ApiError(
      502,
      "PROVIDER_CATALOG_REFRESH_FAILED",
      error instanceof Error ? error.message : String(error),
    )
  }

  return Provider.catalog()
}

export async function listProviders() {
  return {
    items: await Provider.listPublicProviders(),
    selection: await Provider.getSelection(),
  }
}

export async function listModels() {
  return {
    items: await Provider.listModels(),
    selection: await Provider.getSelection(),
  }
}

export async function updateProvider(
  providerID: string,
  input: z.infer<typeof UpdateGlobalProviderBody>,
) {
  try {
    await Provider.validateProviderConfig(providerID, input, Config.GLOBAL_CONFIG_ID)
  } catch (error) {
    throw new ApiError(
      400,
      "PROVIDER_VALIDATION_FAILED",
      error instanceof Error ? error.message : String(error),
    )
  }

  const providerConfig = await Config.setProvider(Config.GLOBAL_CONFIG_ID, providerID, input)
  const provider = await Provider.getPublicProvider(providerID)
  if (!provider) {
    throw new ApiError(404, "PROVIDER_NOT_FOUND", `Provider '${providerID}' not found in the catalog`)
  }

  return {
    provider,
    selection: {
      model: providerConfig.model,
      small_model: providerConfig.small_model,
    },
  }
}

export async function removeProvider(providerID: string) {
  const providerConfig = await Config.removeProvider(Config.GLOBAL_CONFIG_ID, providerID)

  return {
    providerID,
    selection: {
      model: providerConfig.model,
      small_model: providerConfig.small_model,
    },
  }
}

export async function updateModelSelection(input: z.infer<typeof UpdateGlobalModelSelectionBody>) {
  if (input.model) {
    const ref = parseModelReference(input.model)
    await Provider.getModel(ref.providerID, ref.modelID)
  }

  if (input.small_model) {
    const ref = parseModelReference(input.small_model)
    await Provider.getModel(ref.providerID, ref.modelID)
  }

  const selection = await Config.setModelSelection(Config.GLOBAL_CONFIG_ID, input)

  return {
    model: selection.model,
    small_model: selection.small_model,
  }
}

export async function getProviderAuth(providerID: string) {
  return readProviderAuthState(providerID)
}

export async function startProviderAuthFlow(input: {
  providerID: string
  method: string
  serverBaseURL: string
}) {
  try {
    return await ProviderAuth.startProviderAuthFlow(input)
  } catch (error) {
    throw new ApiError(400, "PROVIDER_AUTH_FLOW_FAILED", error instanceof Error ? error.message : String(error))
  }
}

export async function getProviderAuthFlow(providerID: string, flowID: string) {
  const flow = await ProviderAuth.getProviderFlow(providerID, flowID)
  if (!flow) {
    throw new ApiError(404, "PROVIDER_AUTH_FLOW_NOT_FOUND", `Auth flow '${flowID}' was not found`)
  }

  return flow
}

export async function cancelProviderAuthFlow(providerID: string, flowID: string) {
  const flow = await ProviderAuth.cancelProviderAuthFlow(providerID, flowID)
  if (!flow) {
    throw new ApiError(404, "PROVIDER_AUTH_FLOW_NOT_FOUND", `Auth flow '${flowID}' was not found`)
  }

  return flow
}

export async function completeProviderAuthCallback(providerID: string, url: URL) {
  const result = await ProviderAuth.completeProviderBrowserCallback({
    providerID,
    url,
  })

  return {
    html: ProviderAuth.renderProviderAuthCallbackPage({
      ok: result.ok,
      title: result.title,
      message: result.message,
    }),
    status: result.status,
  }
}

export async function saveProviderApiKey(
  providerID: string,
  input: z.infer<typeof ProviderAuthApiKeyBody>,
) {
  await ProviderAuth.saveProviderApiKey(providerID, input.apiKey)
  return readProviderAuthState(providerID)
}

export async function deleteProviderSession(providerID: string) {
  await ProviderAuth.deleteProviderSession(providerID)
  return readProviderAuthState(providerID)
}

export async function listMcpServers() {
  return Config.listMcpServers(Config.GLOBAL_CONFIG_ID)
}

export async function updateMcpServer(serverID: string, input: z.infer<typeof UpdateMcpServerBody>) {
  return Config.setMcpServer(Config.GLOBAL_CONFIG_ID, serverID, input)
}

export async function removeMcpServer(serverID: string) {
  return {
    serverID,
    removed: Boolean(await Config.removeMcpServer(Config.GLOBAL_CONFIG_ID, serverID)),
  }
}

export async function listPromptPresets() {
  return PromptPresets.listPromptPresetSummaries(Config.GLOBAL_CONFIG_ID)
}

export async function getPromptPresetSelection() {
  return PromptPresets.getPromptPresetSelection(Config.GLOBAL_CONFIG_ID)
}

export async function updatePromptPresetSelection(input: z.infer<typeof PromptPresetSelectionBody>) {
  try {
    return await PromptPresets.updatePromptPresetSelection(input, Config.GLOBAL_CONFIG_ID)
  } catch (error) {
    throw toPromptPresetApiError(error)
  }
}

export async function createPromptPreset(input: z.infer<typeof PromptPresetCreateBody>) {
  try {
    return await PromptPresets.createPromptPreset(input, Config.GLOBAL_CONFIG_ID)
  } catch (error) {
    throw toPromptPresetApiError(error)
  }
}

export async function readPromptPreset(presetID: string) {
  try {
    return await PromptPresets.readPromptPresetDocument(presetID, Config.GLOBAL_CONFIG_ID)
  } catch (error) {
    throw toPromptPresetApiError(error)
  }
}

export async function updatePromptPreset(presetID: string, input: z.infer<typeof PromptPresetBody>) {
  try {
    return await PromptPresets.updatePromptPreset(presetID, input, Config.GLOBAL_CONFIG_ID)
  } catch (error) {
    throw toPromptPresetApiError(error)
  }
}

export async function resetPromptPreset(presetID: string) {
  try {
    return await PromptPresets.resetPromptPreset(presetID, Config.GLOBAL_CONFIG_ID)
  } catch (error) {
    throw toPromptPresetApiError(error)
  }
}

export async function deletePromptPreset(presetID: string) {
  try {
    return await PromptPresets.deletePromptPreset(presetID, Config.GLOBAL_CONFIG_ID)
  } catch (error) {
    throw toPromptPresetApiError(error)
  }
}

export async function listSkills() {
  return Skill.listGlobal()
}

export async function getSkillTree() {
  return SkillManager.getGlobalSkillTree()
}

export async function readSkillFile(input: z.infer<typeof SkillFileQuery>) {
  try {
    return await SkillManager.readGlobalSkillFile(input.path)
  } catch (error) {
    throw toSkillApiError(error)
  }
}

export async function writeSkillFile(input: z.infer<typeof SkillFileBody>) {
  try {
    return await SkillManager.writeGlobalSkillFile(input)
  } catch (error) {
    throw toSkillApiError(error)
  }
}

export async function createSkill(input: z.infer<typeof CreateSkillBody>) {
  try {
    return await SkillManager.createGlobalSkill(input.name)
  } catch (error) {
    throw toSkillApiError(error)
  }
}

export async function renameSkill(input: z.infer<typeof RenameSkillBody>) {
  try {
    return await SkillManager.renameGlobalSkill(input)
  } catch (error) {
    throw toSkillApiError(error)
  }
}

export async function deleteSkill(input: z.infer<typeof DeleteSkillQuery>) {
  try {
    await SkillManager.deleteGlobalSkill(input.directory)
    return {
      directory: input.directory,
      removed: true,
    }
  } catch (error) {
    throw toSkillApiError(error)
  }
}
