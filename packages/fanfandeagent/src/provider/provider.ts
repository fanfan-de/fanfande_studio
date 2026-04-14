import z from "zod"
import fuzzysort from "fuzzysort"
import { mapValues } from "remeda"
import type { LanguageModel, Provider, Provider as SDKProvider } from "ai"
import { Instance } from "#project/instance.ts"
import { NamedError } from "#util/error.ts"
import { BunProc } from "#bun/index.ts"
import * as ModelsDev from "#provider/modelsdev.ts"
import * as Config from "#config/config.ts"
import * as Env from "#env/env.ts"
import * as Log from "#util/log.ts"

const OPENAI_SDK_PACKAGE = "@ai-sdk/openai"
const OPENAI_COMPATIBLE_SDK_PACKAGE = "@ai-sdk/openai-compatible"
const DEEPSEEK_SDK_PACKAGE = "@ai-sdk/deepseek"
const PROVIDER_VALIDATION_TIMEOUT_MS = 10_000
const log = Log.create({ service: "provider" })

// -----------------------------------------------------------------------------
// 共享的 schema 和对外 DTO
// -----------------------------------------------------------------------------

export const ModelReference = z
  .object({
    providerID: z.string(),
    modelID: z.string(),
  })
  .meta({
    ref: "ModelReference",
  })
export type ModelReference = z.infer<typeof ModelReference>

export const Model = z
  .object({
    id: z.string(),
    providerID: z.string(),
    api: z.object({
      id: z.string(),
      url: z.string(),
      npm: z.string(),
    }),
    name: z.string(),
    family: z.string().optional(),
    capabilities: z.object({
      temperature: z.boolean(),
      reasoning: z.boolean(),
      attachment: z.boolean(),
      toolcall: z.boolean(),
      input: z.object({
        text: z.boolean(),
        audio: z.boolean(),
        image: z.boolean(),
        video: z.boolean(),
        pdf: z.boolean(),
      }),
      output: z.object({
        text: z.boolean(),
        audio: z.boolean(),
        image: z.boolean(),
        video: z.boolean(),
        pdf: z.boolean(),
      }),
      interleaved: z.union([
        z.boolean(),
        z.object({
          field: z.enum(["reasoning_content", "reasoning_details"]),
        }),
      ]),
    }),
    cost: z.object({
      input: z.number(),
      output: z.number(),
      cache: z.object({
        read: z.number(),
        write: z.number(),
      }),
      experimentalOver200K: z
        .object({
          input: z.number(),
          output: z.number(),
          cache: z.object({
            read: z.number(),
            write: z.number(),
          }),
        })
        .optional(),
    }),
    limit: z.object({
      context: z.number(),
      input: z.number().optional(),
      output: z.number(),
    }),
    status: z.enum(["alpha", "beta", "deprecated", "active"]),
    options: z.record(z.string(), z.any()),
    headers: z.record(z.string(), z.string()),
    release_date: z.string(),
    variants: z.record(z.string(), z.record(z.string(), z.any())).optional(),
  })
  .meta({
    ref: "Model",
  })
export type Model = z.infer<typeof Model>

export const ProviderInfo = z
  .object({
    id: z.string(),
    name: z.string(),
    source: z.enum(["env", "config", "custom", "api"]),
    env: z.string().array(),
    key: z.string().optional(),
    options: z.record(z.string(), z.any()),
    models: z.record(z.string(), Model),
  })
  .meta({
    ref: "Provider",
  })
export type ProviderInfo = z.infer<typeof ProviderInfo>

export const PublicModel = Model.omit({
  headers: true,
}).extend({
  available: z.boolean(),
})
export type PublicModel = z.infer<typeof PublicModel>

export const PublicProvider = z
  .object({
    id: z.string(),
    name: z.string(),
    source: z.enum(["env", "config", "custom", "api"]),
    env: z.array(z.string()),
    configured: z.boolean(),
    available: z.boolean(),
    apiKeyConfigured: z.boolean(),
    baseURL: z.string().optional(),
    modelCount: z.number(),
    models: z.array(PublicModel),
  })
  .meta({
    ref: "PublicProvider",
  })
export type PublicProvider = z.infer<typeof PublicProvider>

export const ProviderCatalogItem = z
  .object({
    id: z.string(),
    name: z.string(),
    source: z.enum(["env", "config", "custom", "api"]),
    env: z.array(z.string()),
    configured: z.boolean(),
    available: z.boolean(),
    apiKeyConfigured: z.boolean(),
    baseURL: z.string().optional(),
    modelCount: z.number(),
  })
  .meta({
    ref: "ProviderCatalogItem",
  })
export type ProviderCatalogItem = z.infer<typeof ProviderCatalogItem>

const sdkState = Instance.state(() => new Map<string, SDKProvider>())
const languageState = Instance.state(() => new Map<string, LanguageModel>())

type SDKFactoryInput = {
  provider: ProviderInfo
  apiKey: string | undefined
  baseURL: string | undefined
  headers: Record<string, string> | undefined
}

type SDKModuleFactory = (options: Record<string, unknown>) => Provider

const SDK_ADAPTERS = {
  [DEEPSEEK_SDK_PACKAGE]: {
    version: "2.0.26",
    exportName: "createDeepSeek",
    create(input: SDKFactoryInput, factory: SDKModuleFactory) {
      return factory({
        apiKey: input.apiKey,
        baseURL: input.baseURL,
        headers: input.headers,
      }) as SDKProvider
    },
  },
  [OPENAI_COMPATIBLE_SDK_PACKAGE]: {
    version: "2.0.38",
    exportName: "createOpenAICompatible",
    create(input: SDKFactoryInput, factory: SDKModuleFactory) {
      if (!input.baseURL) {
        throw new Error(
          `Provider '${input.provider.id}' requires a baseURL when using '${OPENAI_COMPATIBLE_SDK_PACKAGE}'`,
        )
      }

      return factory({
        name: input.provider.id,
        apiKey: input.apiKey,
        baseURL: input.baseURL,
        headers: input.headers,
      }) as SDKProvider
    },
  },
  [OPENAI_SDK_PACKAGE]: {
    version: "3.0.48",
    exportName: "createOpenAI",
    create(input: SDKFactoryInput, factory: SDKModuleFactory) {
      return factory({
        name: input.provider.id,
        apiKey: input.apiKey,
        baseURL: input.baseURL,
        headers: input.headers,
      }) as SDKProvider
    },
  },
} satisfies Record<
  string,
  {
    version: string
    exportName: string
    create(input: SDKFactoryInput, factory: SDKModuleFactory): SDKProvider
  }
>

type SupportedSDKPackage = keyof typeof SDK_ADAPTERS

function isSupportedSDKPackage(npmPackage: string): npmPackage is SupportedSDKPackage {
  return npmPackage in SDK_ADAPTERS
}

// -----------------------------------------------------------------------------
// 通用小工具
// -----------------------------------------------------------------------------

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== "string") continue
    const trimmed = value.trim()
    if (trimmed) return trimmed
  }
  return undefined
}

function hasProviderConfig(config: Config.Info, providerID: string) {
  return Boolean(config.provider?.[providerID])
}

function isProviderAllowed(config: Config.Info, providerID: string) {
  if (config.enabled_providers && !config.enabled_providers.includes(providerID)) return false
  if (config.disabled_providers?.includes(providerID)) return false
  return true
}

function resolveProviderApiKey(
  provider: ProviderInfo,
  providerConfig: Config.Provider | undefined,
  env: Record<string, string | undefined>,
) {
  return firstNonEmptyString(
    providerConfig?.options?.apiKey,
    ...provider.env.map((item) => env[item]),
  )
}

function sanitizeProviderOptions(options: Config.Provider["options"]) {
  if (!options) return {}
  const { apiKey: _apiKey, ...rest } = options
  return rest
}

function hasApiKey(provider: ProviderInfo) {
  return Boolean(firstNonEmptyString(provider.key))
}

function isAvailable(provider: ProviderInfo) {
  return hasApiKey(provider) || provider.env.length === 0
}

function parseModelReference(input: string | undefined) {
  if (!input) return undefined
  const [providerID, ...rest] = input.split("/")
  const modelID = rest.join("/")
  if (!providerID || !modelID) return undefined
  return {
    providerID,
    modelID,
  }
}

function resolveConfigID(configID?: string) {
  if (configID) return configID

  try {
    return Instance.project.id
  } catch {
    return Config.GLOBAL_CONFIG_ID
  }
}

function suggestMatches(input: string, candidates: string[]) {
  return fuzzysort
    .go(input, candidates, {
      limit: 3,
      threshold: -10000,
    })
    .map((item) => item.target)
}

// 当 provider 只存在于项目配置里、不存在于 models.dev catalog 里时，
// 先构造一个最小可用的 provider 骨架，后续再叠加配置与模型信息。
function createConfigOnlyProvider(providerID: string, providerConfig: Config.Provider | undefined): ProviderInfo {
  return {
    id: providerID,
    name: providerConfig?.name ?? providerID,
    source: "custom",
    env: providerConfig?.env ?? [],
    options: {},
    models: {},
  }
}

// -----------------------------------------------------------------------------
// 第一阶段：catalog + config + env -> 当前项目可见的 provider 视图
// 这一层每次查询都会重新解析一次，所以配置和环境变量的变化会立刻生效。
// -----------------------------------------------------------------------------

function createBaseModelFromConfig(
  providerID: string,
  providerConfig: Config.Provider | undefined,
  modelID: string,
  modelConfig: NonNullable<Config.Provider["models"]>[string],
): Model {
  return {
    id: modelID,
    providerID,
    api: {
      id: firstNonEmptyString(modelConfig.id, modelID) ?? modelID,
      url: firstNonEmptyString(modelConfig.provider?.api, providerConfig?.api, providerConfig?.options?.baseURL) ?? "",
      npm: firstNonEmptyString(modelConfig.provider?.npm, providerConfig?.npm) ?? OPENAI_SDK_PACKAGE,
    },
    name: firstNonEmptyString(modelConfig.name, modelID) ?? modelID,
    family: modelConfig.family,
    capabilities: {
      temperature: modelConfig.temperature ?? true,
      reasoning: modelConfig.reasoning ?? false,
      attachment: modelConfig.attachment ?? false,
      toolcall: modelConfig.tool_call ?? true,
      input: {
        text: modelConfig.modalities?.input?.includes("text") ?? true,
        audio: modelConfig.modalities?.input?.includes("audio") ?? false,
        image: modelConfig.modalities?.input?.includes("image") ?? false,
        video: modelConfig.modalities?.input?.includes("video") ?? false,
        pdf: modelConfig.modalities?.input?.includes("pdf") ?? false,
      },
      output: {
        text: modelConfig.modalities?.output?.includes("text") ?? true,
        audio: modelConfig.modalities?.output?.includes("audio") ?? false,
        image: modelConfig.modalities?.output?.includes("image") ?? false,
        video: modelConfig.modalities?.output?.includes("video") ?? false,
        pdf: modelConfig.modalities?.output?.includes("pdf") ?? false,
      },
      interleaved: modelConfig.interleaved ?? false,
    },
    cost: {
      input: modelConfig.cost?.input ?? 0,
      output: modelConfig.cost?.output ?? 0,
      cache: {
        read: modelConfig.cost?.cache_read ?? 0,
        write: modelConfig.cost?.cache_write ?? 0,
      },
      experimentalOver200K: modelConfig.cost?.context_over_200k
        ? {
            input: modelConfig.cost.context_over_200k.input,
            output: modelConfig.cost.context_over_200k.output,
            cache: {
              read: modelConfig.cost.context_over_200k.cache_read ?? 0,
              write: modelConfig.cost.context_over_200k.cache_write ?? 0,
            },
          }
        : undefined,
    },
    limit: {
      context: modelConfig.limit?.context ?? 0,
      input: modelConfig.limit?.input,
      output: modelConfig.limit?.output ?? 0,
    },
    status: modelConfig.status ?? "active",
    options: modelConfig.options ?? {},
    headers: modelConfig.headers ?? {},
    release_date: modelConfig.release_date ?? "",
    variants: modelConfig.variants ?? {},
  }
}

function mergeModelConfig(
  providerID: string,
  providerConfig: Config.Provider | undefined,
  modelID: string,
  baseModel: Model | undefined,
  modelConfig: NonNullable<Config.Provider["models"]>[string] | undefined,
) {
  const base = baseModel
    ? structuredClone(baseModel)
    : createBaseModelFromConfig(providerID, providerConfig, modelID, modelConfig ?? {})

  if (!modelConfig) {
    return {
      ...base,
      providerID,
      api: {
        ...base.api,
        url: firstNonEmptyString(providerConfig?.api, providerConfig?.options?.baseURL, base.api.url) ?? "",
        npm: firstNonEmptyString(providerConfig?.npm, base.api.npm) ?? OPENAI_SDK_PACKAGE,
      },
    }
  }

  return {
    ...base,
    id: modelID,
    providerID,
    api: {
      id: firstNonEmptyString(modelConfig.id, base.api.id, modelID) ?? modelID,
      url:
        firstNonEmptyString(modelConfig.provider?.api, providerConfig?.api, providerConfig?.options?.baseURL, base.api.url) ??
        "",
      npm: firstNonEmptyString(modelConfig.provider?.npm, providerConfig?.npm, base.api.npm) ?? OPENAI_SDK_PACKAGE,
    },
    name: firstNonEmptyString(modelConfig.name, base.name, modelID) ?? modelID,
    family: modelConfig.family ?? base.family,
    capabilities: {
      temperature: modelConfig.temperature ?? base.capabilities.temperature,
      reasoning: modelConfig.reasoning ?? base.capabilities.reasoning,
      attachment: modelConfig.attachment ?? base.capabilities.attachment,
      toolcall: modelConfig.tool_call ?? base.capabilities.toolcall,
      input: {
        text: modelConfig.modalities?.input?.includes("text") ?? base.capabilities.input.text,
        audio: modelConfig.modalities?.input?.includes("audio") ?? base.capabilities.input.audio,
        image: modelConfig.modalities?.input?.includes("image") ?? base.capabilities.input.image,
        video: modelConfig.modalities?.input?.includes("video") ?? base.capabilities.input.video,
        pdf: modelConfig.modalities?.input?.includes("pdf") ?? base.capabilities.input.pdf,
      },
      output: {
        text: modelConfig.modalities?.output?.includes("text") ?? base.capabilities.output.text,
        audio: modelConfig.modalities?.output?.includes("audio") ?? base.capabilities.output.audio,
        image: modelConfig.modalities?.output?.includes("image") ?? base.capabilities.output.image,
        video: modelConfig.modalities?.output?.includes("video") ?? base.capabilities.output.video,
        pdf: modelConfig.modalities?.output?.includes("pdf") ?? base.capabilities.output.pdf,
      },
      interleaved: modelConfig.interleaved ?? base.capabilities.interleaved,
    },
    cost: {
      input: modelConfig.cost?.input ?? base.cost.input,
      output: modelConfig.cost?.output ?? base.cost.output,
      cache: {
        read: modelConfig.cost?.cache_read ?? base.cost.cache.read,
        write: modelConfig.cost?.cache_write ?? base.cost.cache.write,
      },
      experimentalOver200K: modelConfig.cost?.context_over_200k
        ? {
            input: modelConfig.cost.context_over_200k.input,
            output: modelConfig.cost.context_over_200k.output,
            cache: {
              read: modelConfig.cost.context_over_200k.cache_read ?? 0,
              write: modelConfig.cost.context_over_200k.cache_write ?? 0,
            },
          }
        : base.cost.experimentalOver200K,
    },
    limit: {
      context: modelConfig.limit?.context ?? base.limit.context,
      input: modelConfig.limit?.input ?? base.limit.input,
      output: modelConfig.limit?.output ?? base.limit.output,
    },
    status: modelConfig.status ?? base.status,
    options: {
      ...base.options,
      ...(modelConfig.options ?? {}),
    },
    headers: {
      ...base.headers,
      ...(modelConfig.headers ?? {}),
    },
    release_date: modelConfig.release_date ?? base.release_date,
    variants: modelConfig.variants ?? base.variants,
  } satisfies Model
}

function mergeProviderModels(
  providerID: string,
  baseModels: Record<string, Model>,
  providerConfig: Config.Provider | undefined,
) {
  // 先以 catalog 里的模型为底，再叠加项目配置里的 override / 自定义模型。
  const resultModels: Record<string, Model> = {}
  const configModels = providerConfig?.models ?? {}

  for (const [modelID, baseModel] of Object.entries(baseModels)) {
    resultModels[modelID] = mergeModelConfig(providerID, providerConfig, modelID, baseModel, configModels[modelID])
  }

  for (const [modelID, modelConfig] of Object.entries(configModels)) {
    if (resultModels[modelID]) continue
    resultModels[modelID] = mergeModelConfig(providerID, providerConfig, modelID, undefined, modelConfig)
  }

  return resultModels
}

// provider 级别的 whitelist / blacklist 在所有模型合并完成后再统一过滤。
function filterProviderModels(models: Record<string, Model>, providerConfig: Config.Provider | undefined) {
  let modelEntries = Object.entries(models)

  if (providerConfig?.whitelist?.length) {
    const whitelist = new Set(providerConfig.whitelist)
    modelEntries = modelEntries.filter(([modelID]) => whitelist.has(modelID))
  }

  if (providerConfig?.blacklist?.length) {
    const blacklist = new Set(providerConfig.blacklist)
    modelEntries = modelEntries.filter(([modelID]) => !blacklist.has(modelID))
  }

  return Object.fromEntries(modelEntries)
}

// 把 catalog 里的 provider、项目配置、当前实例环境变量三份信息合成最终 ProviderInfo。
function applyProviderConfig(
  providerID: string,
  baseProvider: ProviderInfo | undefined,
  providerConfig: Config.Provider | undefined,
  env: Record<string, string | undefined>,
) {
  if (!baseProvider && !providerConfig) return undefined

  const provider: ProviderInfo = baseProvider
    ? structuredClone(baseProvider)
    : createConfigOnlyProvider(providerID, providerConfig)

  const configured = Boolean(providerConfig) || Boolean(resolveProviderApiKey(provider, providerConfig, env))
  if (!configured) return undefined

  provider.name = providerConfig?.name ?? provider.name
  provider.env = providerConfig?.env ?? provider.env
  provider.source = providerConfig ? "config" : "env"
  provider.key = resolveProviderApiKey(provider, providerConfig, env)
  provider.options = sanitizeProviderOptions(providerConfig?.options)
  provider.models = filterProviderModels(mergeProviderModels(providerID, provider.models, providerConfig), providerConfig)
  return provider
}

async function catalogMap():Promise<Record<string,ProviderInfo>> {
  const providers = await ModelsDev.get()
  return mapValues(providers, fromModelsDevProvider)
}

/**
 * 解析“当前项目实际生效”的 provider 视图。
 *
 * 执行顺序：
 * 1. 先读取共享的 models.dev catalog，得到系统已知的 provider 基础骨架。
 * 2. 再读取当前项目配置，拿到 provider 开关、覆盖项和自定义项。
 * 3. 最后结合当前环境变量，把 catalog、config、env 合并成当前项目真正可用的 provider 集合。
 *
 * 返回值同时保留两个视图：
 * - `catalog`：完整的基础 provider 目录，适合“展示全集”。
 * - `providers`：当前项目中真正生效的 provider，适合“运行时使用”。
 */
async function resolveProjectProviders(configID = resolveConfigID()) {
  // 读取共享 catalog。这里提供“系统已知”的 provider 基础骨架。
  const catalog = await catalogMap()
  // 读取当前项目配置，里面可能会覆盖 provider 名称、模型、开关等。
  const config = await Config.get(configID)
  // 读取当前实例环境变量，用于补全 API Key 等运行时字段。
  const env = Env.all()

  // 候选 provider ID 来自两个地方：
  // 1. catalog 中已有的 provider
  // 2. config.provider 中额外声明的 provider（例如项目自定义 provider）
  //
  // 用 Set 合并是为了去重，避免同一个 provider 被重复处理。
  const providerIDs = new Set<string>([
    ...Object.keys(catalog),
    ...Object.keys(config.provider ?? {}),
  ])

  // 这里只收集最终“在当前项目中生效”的 provider。
  // 未通过开关过滤，或无法形成有效配置的 provider，不会进入这个结果。
  const configuredProviders: Record<string, ProviderInfo> = {}
  for (const providerID of providerIDs) {
    // 先检查 provider 是否被 enabled / disabled 规则排除。
    if (!isProviderAllowed(config, providerID)) continue

    // 只有配置里显式声明了该 provider，才读取它的项目级配置；
    // 否则保持 undefined，让后面的合并逻辑只依赖 catalog 和 env。
    const providerConfig = hasProviderConfig(config, providerID) ? config.provider?.[providerID] : undefined

    // 按优先级合并基础 catalog、项目配置和环境变量：
    // - catalog 提供默认骨架
    // - project config 提供覆盖和追加
    // - env 提供 API Key 等敏感信息
    const provider = applyProviderConfig(providerID, catalog[providerID], providerConfig, env)

    // 返回 undefined 说明这个 provider 虽然在候选集合里，
    // 但在当前上下文中并没有形成一个“已配置完成”的结果。
    if (!provider) continue

    // 记录最终结果，后续会用它来列出 provider、查 model、初始化 SDK。
    configuredProviders[providerID] = provider
  }

  // 同时返回原始 catalog 和当前项目已生效的 provider 视图。
  return {
    catalog,
    providers: configuredProviders,
  }
}

// -----------------------------------------------------------------------------
// 第二阶段：当前项目 provider 视图 -> 对外查询 API
// -----------------------------------------------------------------------------

function sortProviders<T extends { name: string; id: string }>(items: T[]) {
  return items.toSorted((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
}

function sortModels<T extends { name: string; id: string; providerID?: string }>(items: T[]) {
  return items.toSorted(
    (left, right) =>
      left.name.localeCompare(right.name) ||
      (left.providerID ?? "").localeCompare(right.providerID ?? "") ||
      left.id.localeCompare(right.id),
  )
}

function modelBaseURL(provider: ProviderInfo) {
  const firstModel = Object.values(provider.models)[0]
  return firstNonEmptyString(provider.options.baseURL, firstModel?.api.url)
}

function normalizeBaseURL(baseURL: string) {
  return baseURL.endsWith("/") ? baseURL : `${baseURL}/`
}

function buildProviderModelsURL(baseURL: string) {
  try {
    return new URL("models", normalizeBaseURL(baseURL)).toString()
  } catch {
    throw new Error(`Provider base URL '${baseURL}' is not a valid URL`)
  }
}

function pickValidationModel(provider: ProviderInfo) {
  return Object.values(provider.models)[0]
}

function extractValidationErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    const trimmed = payload.trim()
    return trimmed || undefined
  }

  if (!payload || typeof payload !== "object") return undefined

  const record = payload as Record<string, unknown>
  const directMessage = firstNonEmptyString(record.message, record.detail, record.error_description)
  if (directMessage) return directMessage

  const errorRecord = record.error
  if (errorRecord && typeof errorRecord === "object") {
    return firstNonEmptyString(
      (errorRecord as Record<string, unknown>).message,
      (errorRecord as Record<string, unknown>).detail,
      (errorRecord as Record<string, unknown>).error,
    )
  }

  return undefined
}

async function readValidationFailureMessage(response: Response) {
  const contentType = response.headers.get("content-type") ?? ""

  if (contentType.includes("application/json")) {
    const payload = await response.json().catch(() => undefined)
    const parsed = extractValidationErrorMessage(payload)
    if (parsed) return parsed
  }

  const text = await response.text().catch(() => "")
  return extractValidationErrorMessage(text)
}

function formatValidationFailureMessage(provider: ProviderInfo, status: number, detail?: string) {
  const summary = status === 401 || status === 403 ? "rejected the API key" : "validation request failed"
  return detail
    ? `Provider '${provider.name}' ${summary} (${status}): ${detail}`
    : `Provider '${provider.name}' ${summary} (${status})`
}

function toPublicModel(provider: ProviderInfo, model: Model): PublicModel {
  return {
    ...model,
    available: isAvailable(provider),
  }
}

function toPublicProvider(provider: ProviderInfo): PublicProvider {
  const models = sortModels(Object.values(provider.models).map((model) => toPublicModel(provider, model)))
  return {
    id: provider.id,
    name: provider.name,
    source: provider.source,
    env: provider.env,
    configured: true,
    available: isAvailable(provider),
    apiKeyConfigured: hasApiKey(provider),
    baseURL: modelBaseURL(provider),
    modelCount: models.length,
    models,
  }
}

function toCatalogItem(baseProvider: ProviderInfo, configuredProvider: ProviderInfo | undefined): ProviderCatalogItem {
  return {
    id: baseProvider.id,
    name: baseProvider.name,
    source: configuredProvider?.source ?? baseProvider.source,
    env: baseProvider.env,
    configured: Boolean(configuredProvider),
    available: configuredProvider ? isAvailable(configuredProvider) : baseProvider.env.length === 0,
    apiKeyConfigured: configuredProvider ? hasApiKey(configuredProvider) : false,
    baseURL: modelBaseURL(configuredProvider ?? baseProvider),
    modelCount: Object.keys((configuredProvider ?? baseProvider).models).length,
  }
}

// 运行时缓存 key。
// 只要这里参与计算的字段发生变化，就会重新创建 SDK / LanguageModel。

function runtimeKey(provider: ProviderInfo, model: Model) {
  return JSON.stringify({
    providerID: provider.id,
    modelID: model.id,
    apiKey: provider.key ?? "",
    baseURL: firstNonEmptyString(provider.options.baseURL, model.api.url) ?? "",
    headers: model.headers,
  })
}

async function requireRuntimeProvider(providerID: string, configID = resolveConfigID()) {
  const provider = await getProvider(providerID, configID)
  if (provider) return provider

  throw new InitError({
    providerID,
  })
}

export async function catalog(configID = resolveConfigID()) {
  const state = await resolveProjectProviders(configID)
  return sortProviders(
    Object.values(state.catalog).map((provider) => toCatalogItem(provider, state.providers[provider.id])),
  )
}

export async function validateProviderConfig(providerID: string, providerConfig: Config.Provider, configID = Config.GLOBAL_CONFIG_ID) {
  const [catalog, config] = await Promise.all([catalogMap(), Config.get(configID)])
  const mergedProviderConfig = Config.mergeProviderConfig(config.provider?.[providerID], providerConfig)
  const provider = applyProviderConfig(providerID, catalog[providerID], mergedProviderConfig, Env.all())

  if (!provider) {
    throw new Error(`Provider '${providerID}' could not be resolved from the catalog`)
  }

  if (!provider.key && provider.env.length > 0) {
    return
  }

  const model = pickValidationModel(provider)
  const baseURL = firstNonEmptyString(provider.options.baseURL, model?.api.url)
  if (!baseURL) {
    return
  }

  const headers = new Headers({
    accept: "application/json",
  })

  if (provider.key) {
    headers.set("authorization", `Bearer ${provider.key}`)
  }

  for (const [key, value] of Object.entries(model?.headers ?? {})) {
    headers.set(key, value)
  }

  const modelsURL = buildProviderModelsURL(baseURL)

  let response: Response
  try {
    response = await fetch(modelsURL, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(PROVIDER_VALIDATION_TIMEOUT_MS),
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not reach ${provider.name} at ${modelsURL}: ${detail}`)
  }

  if (!response.ok) {
    const detail = await readValidationFailureMessage(response)
    throw new Error(formatValidationFailureMessage(provider, response.status, detail))
  }
}

async function list(configID = resolveConfigID()) {
  const state = await resolveProjectProviders(configID)
  return state.providers
}

export async function listPublicProviders(configID = resolveConfigID()) {
  const providers = await list(configID)
  return sortProviders(Object.values(providers).map(toPublicProvider))
}

export async function listModels(configID = resolveConfigID()) {
  const providers = await list(configID)
  return sortModels(
    Object.values(providers).flatMap((provider) => Object.values(provider.models).map((model) => toPublicModel(provider, model))),
  )
}

async function getProvider(providerID: string, configID = resolveConfigID()) {
  const providers = await list(configID)
  return providers[providerID]
}

export async function getPublicProvider(providerID: string, configID = resolveConfigID()) {
  const provider = await getProvider(providerID, configID)
  if (!provider) return undefined
  return toPublicProvider(provider)
}

async function getModel(providerID: string, modelID: string, configID = resolveConfigID()) {
  const providers = await list(configID)
  const provider = providers[providerID]
  if (!provider) {
    throw new ModelNotFoundError({
      providerID,
      modelID,
      suggestions: suggestMatches(providerID, Object.keys(providers)),
    })
  }

  const model = provider.models[modelID]
  if (!model) {
    throw new ModelNotFoundError({
      providerID,
      modelID,
      suggestions: suggestMatches(modelID, Object.keys(provider.models)),
    })
  }

  return model
}

export async function getSelection(configID = resolveConfigID()) {
  const config = await Config.get(configID)
  return {
    model: config.model,
    small_model: config.small_model,
  }
}

/**
 * 用三步解析默认模型：
 * 1. 如果配置里保存的 model 仍然有效，就直接使用它。
 * 2. 否则退回到“当前项目里第一个可用模型”。
 * 3. 如果连可用模型都没有，直接抛错，要求调用方显式配置 provider / model。
 */
export async function getDefaultModelRef(configID = resolveConfigID()): Promise<ModelReference> {
  const selection = await getSelection(configID)
  const parsed = parseModelReference(selection.model)
  if (parsed) {
    try {
      await getModel(parsed.providerID, parsed.modelID, configID)
      return parsed
    } catch {
      // 配置里保存的是陈旧模型时，继续退回到当前可用模型。
    }
  }

  const models = await listModels(configID)
  const firstModel = models.find((model) => model.available)
  if (firstModel) {
    return {
      providerID: firstModel.providerID,
      modelID: firstModel.id,
    }
  }

  throw new Error(
    "No provider model is available for this project. Configure a provider/model in the project settings before starting a session.",
  )
}

// -----------------------------------------------------------------------------
// 第三阶段：惰性运行时初始化
// 只有 session 真正要拿 LanguageModel 发请求时，才会进入这一层。
// -----------------------------------------------------------------------------

export async function getLanguage(model: Model, configID = resolveConfigID()): Promise<LanguageModel> {
  const provider = await requireRuntimeProvider(model.providerID, configID)

  const key = runtimeKey(provider, model)
  const cache = languageState()
  const cached = cache.get(key)
  if (cached) return cached

  const sdk = await getSDK(model, configID)
  const language = sdk.languageModel(model.api.id) as LanguageModel
  cache.set(key, language)
  return language
}

async function loadSDKFactory(npmPackage: string) {
  if (!isSupportedSDKPackage(npmPackage)) {
    throw new Error(
      `Unsupported SDK package '${npmPackage}'. Add it to the SDK adapter allowlist before using it in provider.npm or model.provider.npm.`,
    )
  }

  const adapter = SDK_ADAPTERS[npmPackage]
  const loaded = await BunProc.importPackage<Record<string, unknown>>(npmPackage, adapter.version)
  const factory = loaded.module[adapter.exportName]
  if (typeof factory !== "function") {
    throw new Error(`SDK package '${npmPackage}' is missing export '${adapter.exportName}'`)
  }

  return {
    adapter,
    factory: factory as SDKModuleFactory,
    version: loaded.version,
  }
}

async function getSDK(model: Model, configID = resolveConfigID()) {
  // SDK Provider 比 LanguageModel 更底层，先保证它存在，再由上层取 languageModel。
  const provider = await requireRuntimeProvider(model.providerID, configID)

  if (!provider.key && provider.env.length > 0) {
    throw new InitError(
      {
        providerID: model.providerID,
      },
      {
        cause: new Error(`Provider '${model.providerID}' is missing an API key`),
      },
    )
  }

  const key = runtimeKey(provider, model)
  const cache = sdkState()
  const cached = cache.get(key)
  if (cached) return cached

  const baseURL = firstNonEmptyString(provider.options.baseURL, model.api.url)
  const headers = Object.keys(model.headers).length > 0 ? model.headers : undefined
  const loaded = await loadSDKFactory(model.api.npm)
  log.info("initializing sdk provider", {
    providerID: model.providerID,
    modelID: model.id,
    sdkPackage: model.api.npm,
    baseURL,
    apiKeyConfigured: Boolean(provider.key),
    headersConfigured: Boolean(headers),
  })
  const sdk = loaded.adapter.create(
    {
      provider,
      apiKey: provider.key,
      baseURL,
      headers,
    },
    loaded.factory,
  )

  cache.set(key, sdk as SDKProvider)
  return sdk as SDKProvider
}

export async function getSDKProvider(model: Model, configID = resolveConfigID()) {
  return await getSDK(model, configID)
}

// -----------------------------------------------------------------------------
// models.dev catalog -> 内部统一 provider 结构
// -----------------------------------------------------------------------------

function fromModelsDevModel(provider: ModelsDev.DevProvider, model: ModelsDev.DevModel): Model {
  return {
    id: model.id,
    providerID: provider.id,
    api: {
      id: model.id,
      url: firstNonEmptyString(model.provider?.api, provider.api) ?? "",
      npm: firstNonEmptyString(model.provider?.npm, provider.npm) ?? OPENAI_SDK_PACKAGE,
    },
    name: model.name,
    capabilities: {
      temperature: model.temperature,
      reasoning: model.reasoning,
      attachment: model.attachment,
      toolcall: model.tool_call,
      input: {
        text: model.modalities?.input?.includes("text") ?? false,
        audio: model.modalities?.input?.includes("audio") ?? false,
        image: model.modalities?.input?.includes("image") ?? false,
        video: model.modalities?.input?.includes("video") ?? false,
        pdf: model.modalities?.input?.includes("pdf") ?? false,
      },
      output: {
        text: model.modalities?.output?.includes("text") ?? false,
        audio: model.modalities?.output?.includes("audio") ?? false,
        image: model.modalities?.output?.includes("image") ?? false,
        video: model.modalities?.output?.includes("video") ?? false,
        pdf: model.modalities?.output?.includes("pdf") ?? false,
      },
      interleaved: model.interleaved ?? false,
    },
    cost: {
      input: model.cost?.input ?? 0,
      output: model.cost?.output ?? 0,
      cache: {
        read: model.cost?.cache_read ?? 0,
        write: model.cost?.cache_write ?? 0,
      },
      experimentalOver200K: model.cost?.context_over_200k
        ? {
            cache: {
              read: model.cost.context_over_200k.cache_read ?? 0,
              write: model.cost.context_over_200k.cache_write ?? 0,
            },
            input: model.cost.context_over_200k.input,
            output: model.cost.context_over_200k.output,
          }
        : undefined,
    },
    limit: {
      context: model.limit.context,
      input: model.limit.input,
      output: model.limit.output,
    },
    status: model.status ?? "active",
    options: model.options ?? {},
    headers: model.headers ?? {},
    release_date: model.release_date,
    variants: model.variants ?? {},
    family: model.family,
  }
}

export function fromModelsDevProvider(provider: ModelsDev.DevProvider): ProviderInfo {
  return {
    id: provider.id,
    source: "api",
    name: provider.name,
    env: provider.env ?? [],
    options: {},
    models: mapValues(provider.models, (model) => fromModelsDevModel(provider, model)),
  }
}

export const ModelNotFoundError = NamedError.create(
  "ProviderModelNotFoundError",
  z.object({
    providerID: z.string(),
    modelID: z.string(),
    suggestions: z.array(z.string()).optional(),
  }),
)

export const InitError = NamedError.create(
  "ProviderInitError",
  z.object({
    providerID: z.string(),
  }),
)



export {
  list,
  getProvider,
  getModel,
}
