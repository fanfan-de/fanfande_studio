import z from "zod"
import * as ProviderAuth from "#auth/provider-auth.ts"
import * as Config from "#config/config.ts"
import * as Mcp from "#mcp/manager.ts"
import * as Plugin from "#plugin/plugin.ts"
import * as ModelsDev from "#provider/modelsdev.ts"
import * as Provider from "#provider/provider.ts"
import { ApiError } from "#server/error.ts"
import * as PromptPresets from "#session/support/prompt-presets.ts"
import * as Skill from "#skill/skill.ts"
import * as SkillManager from "#skill/manage.ts"
import * as ToolRegistry from "#tool/registry.ts"

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
export const InstallPluginBody = Plugin.InstallPluginInput
export const UpdateInstalledPluginBody = Plugin.UpdateInstalledPluginInput
export const SavePluginConnectorApiKeyBody = Plugin.SavePluginConnectorApiKeyInput

export const ProviderAuthFlowBody = z.object({
  method: z.string().min(1),
})

export const ProviderAuthApiKeyBody = z.object({
  apiKey: z.string().nullable().optional(),
})

export const ProviderConnectionTestBody = z.object({
  method: z.string().optional(),
  credentialMode: z.enum(["active", "manual", "environment"]).optional(),
  apiKey: z.string().nullable().optional(),
  baseURL: z.string().nullable().optional(),
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
  sideChatPromptPresetID: z.string().min(1),
})

export const UpdateBuiltinToolSelectionBody = z
  .object({
    tools: z.record(z.string(), z.boolean()),
  })
  .strict()

export const UpdateToolPermissionModeBody = z
  .object({
    mode: Config.PermissionMode,
  })
  .strict()

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

function toPluginApiError(error: unknown) {
  if (error instanceof Plugin.PluginError) {
    switch (error.code) {
      case "PLUGIN_NOT_FOUND":
      case "INSTALLED_PLUGIN_NOT_FOUND":
      case "PLUGIN_CONNECTOR_NOT_FOUND":
        return new ApiError(404, error.code, error.message)
      case "PLUGIN_ALREADY_INSTALLED":
        return new ApiError(409, error.code, error.message)
      case "PLUGIN_CONFIG_INVALID":
      case "PLUGIN_RISK_NOT_ALLOWED":
      case "PLUGIN_CONNECTOR_NOT_CONNECTED":
        return new ApiError(400, error.code, error.message)
    }
  }

  return error
}

async function readProviderAuthState(providerID: string) {
  const catalog = await Provider.catalog()
  const item = catalog.find((entry) => entry.id === providerID)
  if (item?.authState) return item.authState
  return ProviderAuth.createDisconnectedProviderAuthState(providerID)
}

function assertProviderConfigDoesNotContainSecrets(input: Config.Provider) {
  if (input.options && "apiKey" in input.options) {
    throw new ApiError(
      400,
      "PROVIDER_API_KEY_NOT_ALLOWED",
      "Provider API keys must be saved through the credential store, not provider config.",
    )
  }
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
  assertProviderConfigDoesNotContainSecrets(input)

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

function classifyProviderConnectionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()

  if (
    normalized.includes("rejected the api key") ||
    normalized.includes("401") ||
    normalized.includes("403") ||
    normalized.includes("unauthorized") ||
    normalized.includes("forbidden")
  ) {
    return {
      status: "auth_error" as const,
      message,
    }
  }

  if (
    normalized.includes("could not reach") ||
    normalized.includes("network") ||
    normalized.includes("timeout") ||
    normalized.includes("fetch") ||
    normalized.includes("enotfound") ||
    normalized.includes("econnrefused")
  ) {
    return {
      status: "network_error" as const,
      message,
    }
  }

  return {
    status: "config_error" as const,
    message,
  }
}

function getProviderConnectionCapability(
  provider: Provider.ProviderCatalogItem,
  method: string | undefined,
) {
  if (!method) return undefined
  return provider.authCapabilities.find((capability) => capability.method === method)
}

function hasProviderConnectionCandidate(
  provider: Provider.ProviderCatalogItem,
  input: {
    method?: string
    credentialMode?: "active" | "manual" | "environment"
    apiKey?: string
  },
) {
  const capability = getProviderConnectionCapability(provider, input.method)
  const credentials = provider.authState.credentials

  if (input.method && !capability) return false

  if (capability?.kind === "api_key") {
    if (input.apiKey) return true

    if (input.credentialMode === "environment") {
      return credentials.some(
        (credential) =>
          credential.method === capability.method &&
          credential.kind === "api_key" &&
          credential.source === "environment" &&
          credential.configured,
      )
    }

    if (input.credentialMode === "manual") {
      return credentials.some(
        (credential) =>
          credential.method === capability.method &&
          credential.kind === "api_key" &&
          credential.source === "credential_store" &&
          credential.configured,
      )
    }

    return credentials.some(
      (credential) =>
        credential.method === capability.method &&
        credential.kind === "api_key" &&
        credential.configured,
    )
  }

  if (capability) {
    return credentials.some(
      (credential) =>
        credential.method === capability.method &&
        credential.configured,
    )
  }

  return provider.authState.status === "connected" || provider.apiKeyConfigured
}

export async function testProviderConnection(
  providerID: string,
  input: z.infer<typeof ProviderConnectionTestBody>,
) {
  const catalog = await Provider.catalog()
  const provider = catalog.find((entry) => entry.id === providerID)

  if (!provider) {
    throw new ApiError(404, "PROVIDER_NOT_FOUND", `Provider '${providerID}' not found in the catalog`)
  }

  const method = input.method?.trim() || provider.authState.activeMethod
  const credentialMode = input.credentialMode ?? "active"
  const apiKey = input.apiKey?.trim()
  const baseURL = input.baseURL?.trim()
  const capability = getProviderConnectionCapability(provider, method)

  if (method && !capability) {
    return {
      providerID,
      ok: false,
      status: "unsupported" as const,
      checkedAt: Date.now(),
      message: `Provider '${provider.name}' does not support connection method '${method}'.`,
    }
  }

  if (!hasProviderConnectionCandidate(provider, { method, credentialMode, apiKey })) {
    return {
      providerID,
      ok: false,
      status: "not_connected" as const,
      checkedAt: Date.now(),
      message: "未找到可用连接。请先配置环境变量、登录账号或保存 API key。",
    }
  }

  try {
    const optionsPayload: {
      apiKey?: string
      baseURL?: string
    } = {}

    if (apiKey) optionsPayload.apiKey = apiKey
    if (baseURL) optionsPayload.baseURL = baseURL

    await Provider.validateProviderConfig(
      providerID,
      {
        name: provider.name,
        env: provider.env,
        options: Object.keys(optionsPayload).length > 0 ? optionsPayload : undefined,
      },
      Config.GLOBAL_CONFIG_ID,
      {
        auth: {
          method,
          credentialMode,
          transientApiKey: apiKey,
        },
        requireCredential: true,
      },
    )

    return {
      providerID,
      ok: true,
      status: "working" as const,
      checkedAt: Date.now(),
      message: "连接测试成功。",
    }
  } catch (error) {
    const classified = classifyProviderConnectionError(error)
    return {
      providerID,
      ok: false,
      status: classified.status,
      checkedAt: Date.now(),
      message: classified.message,
    }
  }
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

export async function getMcpServerDiagnostic(serverID: string) {
  const server = await Config.getMcpServer(Config.GLOBAL_CONFIG_ID, serverID)
  if (!server) {
    throw new ApiError(404, "MCP_SERVER_NOT_FOUND", `MCP server '${serverID}' is not configured globally`)
  }

  return Mcp.diagnoseServer(server)
}

export async function removeMcpServer(serverID: string) {
  return {
    serverID,
    removed: Boolean(await Config.removeMcpServer(Config.GLOBAL_CONFIG_ID, serverID)),
  }
}

export function listPluginCatalog() {
  return Plugin.listCatalog()
}

export function listInstalledPlugins() {
  return Plugin.listInstalled()
}

export async function installPlugin(pluginID: string, input: z.infer<typeof InstallPluginBody>) {
  try {
    return await Plugin.install(pluginID, input)
  } catch (error) {
    throw toPluginApiError(error)
  }
}

export async function updateInstalledPlugin(pluginID: string, input: z.infer<typeof UpdateInstalledPluginBody>) {
  try {
    return await Plugin.update(pluginID, input)
  } catch (error) {
    throw toPluginApiError(error)
  }
}

export async function removeInstalledPlugin(pluginID: string) {
  try {
    return await Plugin.remove(pluginID)
  } catch (error) {
    throw toPluginApiError(error)
  }
}

export async function getInstalledPluginDiagnostic(pluginID: string) {
  try {
    return await Plugin.diagnose(pluginID)
  } catch (error) {
    throw toPluginApiError(error)
  }
}

export async function listInstalledPluginConnectors(pluginID: string) {
  try {
    return await Plugin.listConnectorStatuses(pluginID)
  } catch (error) {
    throw toPluginApiError(error)
  }
}

export async function saveInstalledPluginConnectorApiKey(
  pluginID: string,
  appID: string,
  input: z.infer<typeof SavePluginConnectorApiKeyBody>,
) {
  try {
    return await Plugin.saveConnectorApiKey(pluginID, appID, input)
  } catch (error) {
    throw toPluginApiError(error)
  }
}

export async function deleteInstalledPluginConnectorApiKey(pluginID: string, appID: string) {
  try {
    return await Plugin.removeConnectorApiKey(pluginID, appID)
  } catch (error) {
    throw toPluginApiError(error)
  }
}

export async function getInstalledPluginConnectorDiagnostic(pluginID: string, appID: string) {
  try {
    return await Plugin.diagnoseConnector(pluginID, appID)
  } catch (error) {
    throw toPluginApiError(error)
  }
}

export async function listBuiltinTools() {
  const [items, selection] = await Promise.all([
    ToolRegistry.builtinTools(),
    Config.getToolSelection(Config.GLOBAL_CONFIG_ID),
  ])

  return {
    items: await Promise.all(
      items.map(async (item) => {
        const runtime = await item.init()
        const explicitStates = [item.id, ...(item.aliases ?? [])]
          .map((name) => selection.tools[name])
          .filter((value): value is boolean => typeof value === "boolean")

        return {
          id: item.id,
          title: runtime.title ?? item.title ?? item.id,
          description: runtime.description,
          aliases: item.aliases ?? [],
          capabilities: item.capabilities ?? {},
          enabled: !explicitStates.includes(false),
        }
      }),
    ),
    selection,
  }
}

export async function updateBuiltinToolSelection(input: z.infer<typeof UpdateBuiltinToolSelectionBody>) {
  const items = await ToolRegistry.builtinTools()
  const knownToolIDs = new Set(items.map((item) => item.id))
  const tools: Record<string, boolean> = {}

  for (const [toolID, enabled] of Object.entries(input.tools)) {
    const normalizedToolID = toolID.trim()
    if (!normalizedToolID) continue
    if (!knownToolIDs.has(normalizedToolID)) {
      throw new ApiError(400, "UNKNOWN_BUILTIN_TOOL", `Unknown built-in tool id '${normalizedToolID}'.`)
    }
    tools[normalizedToolID] = enabled
  }

  return Config.setToolSelection(Config.GLOBAL_CONFIG_ID, tools)
}

export async function getToolPermissionMode() {
  return Config.getPermissionMode(Config.GLOBAL_CONFIG_ID)
}

export async function updateToolPermissionMode(input: z.infer<typeof UpdateToolPermissionModeBody>) {
  return Config.setPermissionMode(Config.GLOBAL_CONFIG_ID, input.mode)
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
