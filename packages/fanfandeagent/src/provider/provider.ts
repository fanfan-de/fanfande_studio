import z from "zod"
import fuzzysort from "fuzzysort"
import { mapValues } from "remeda"
import { createDeepSeek } from "@ai-sdk/deepseek"
import { createOpenAI } from "@ai-sdk/openai"
import type { LanguageModel, Provider as SDKProvider } from "ai"
import { Instance } from "#project/instance.ts"
import { NamedError } from "#util/error.ts"
import * as ModelsDev from "#provider/modelsdev.ts"
import * as Config from "#config/config.ts"
import * as Env from "#env/env.ts"

const DEFAULT_MODEL_REF = {
  providerID: "deepseek",
  modelID: "deepseek-reasoner",
} as const

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
      npm: firstNonEmptyString(modelConfig.provider?.npm, providerConfig?.npm) ?? "@ai-sdk/openai",
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
        npm: firstNonEmptyString(providerConfig?.npm, base.api.npm) ?? "@ai-sdk/openai",
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
      npm: firstNonEmptyString(modelConfig.provider?.npm, providerConfig?.npm, base.api.npm) ?? "@ai-sdk/openai",
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

function applyProviderConfig(
  providerID: string,
  baseProvider: ProviderInfo | undefined,
  providerConfig: Config.Provider | undefined,
  env: Record<string, string | undefined>,
) {
  if (!baseProvider && !providerConfig) return undefined

  const provider: ProviderInfo = baseProvider
    ? structuredClone(baseProvider)
    : {
        id: providerID,
        name: providerConfig?.name ?? providerID,
        source: "custom",
        env: providerConfig?.env ?? [],
        options: {},
        models: {},
      }

  const configured = Boolean(providerConfig) || Boolean(resolveProviderApiKey(provider, providerConfig, env))
  if (!configured) return undefined

  provider.name = providerConfig?.name ?? provider.name
  provider.env = providerConfig?.env ?? provider.env
  provider.source = providerConfig ? "config" : "env"
  provider.key = resolveProviderApiKey(provider, providerConfig, env)
  provider.options = sanitizeProviderOptions(providerConfig?.options)

  const resultModels: Record<string, Model> = {}
  const configModels = providerConfig?.models ?? {}

  for (const [modelID, baseModel] of Object.entries(provider.models)) {
    resultModels[modelID] = mergeModelConfig(providerID, providerConfig, modelID, baseModel, configModels[modelID])
  }

  for (const [modelID, modelConfig] of Object.entries(configModels)) {
    if (resultModels[modelID]) continue
    resultModels[modelID] = mergeModelConfig(providerID, providerConfig, modelID, undefined, modelConfig)
  }

  let modelEntries = Object.entries(resultModels)
  if (providerConfig?.whitelist?.length) {
    const whitelist = new Set(providerConfig.whitelist)
    modelEntries = modelEntries.filter(([modelID]) => whitelist.has(modelID))
  }
  if (providerConfig?.blacklist?.length) {
    const blacklist = new Set(providerConfig.blacklist)
    modelEntries = modelEntries.filter(([modelID]) => !blacklist.has(modelID))
  }

  provider.models = Object.fromEntries(modelEntries)
  return provider
}

async function catalogMap() {
  const providers = await ModelsDev.get()
  return mapValues(providers, fromModelsDevProvider)
}

async function resolveProjectProviders() {
  const catalog = await catalogMap()
  const config = await Config.get()
  const env = Env.all()
  const providerIDs = new Set<string>([
    ...Object.keys(catalog),
    ...Object.keys(config.provider ?? {}),
  ])

  const configuredProviders: Record<string, ProviderInfo> = {}
  for (const providerID of providerIDs) {
    if (!isProviderAllowed(config, providerID)) continue
    const provider = applyProviderConfig(providerID, catalog[providerID], config.provider?.[providerID], env)
    if (!provider) continue
    configuredProviders[providerID] = provider
  }

  return {
    catalog,
    config,
    providers: configuredProviders,
  }
}

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

function runtimeKey(provider: ProviderInfo, model: Model) {
  return JSON.stringify({
    providerID: provider.id,
    modelID: model.id,
    apiKey: provider.key ?? "",
    baseURL: firstNonEmptyString(provider.options.baseURL, model.api.url) ?? "",
    headers: model.headers,
  })
}

export async function catalog() {
  const state = await resolveProjectProviders()
  return sortProviders(
    Object.values(state.catalog).map((provider) => toCatalogItem(provider, state.providers[provider.id])),
  )
}

async function list() {
  const state = await resolveProjectProviders()
  return state.providers
}

export async function listPublicProviders() {
  const providers = await list()
  return sortProviders(Object.values(providers).map(toPublicProvider))
}

export async function listModels() {
  const providers = await list()
  return sortModels(
    Object.values(providers).flatMap((provider) => Object.values(provider.models).map((model) => toPublicModel(provider, model))),
  )
}

async function getProvider(providerID: string) {
  const providers = await list()
  return providers[providerID]
}

export async function getPublicProvider(providerID: string) {
  const provider = await getProvider(providerID)
  if (!provider) return undefined
  return toPublicProvider(provider)
}

async function getModel(providerID: string, modelID: string) {
  const providers = await list()
  const provider = providers[providerID]
  if (!provider) {
    const matches = fuzzysort.go(providerID, Object.keys(providers), {
      limit: 3,
      threshold: -10000,
    })
    throw new ModelNotFoundError({
      providerID,
      modelID,
      suggestions: matches.map((item) => item.target),
    })
  }

  const model = provider.models[modelID]
  if (!model) {
    const matches = fuzzysort.go(modelID, Object.keys(provider.models), {
      limit: 3,
      threshold: -10000,
    })
    throw new ModelNotFoundError({
      providerID,
      modelID,
      suggestions: matches.map((item) => item.target),
    })
  }

  return model
}

export async function getSelection() {
  const config = await Config.get()
  return {
    model: config.model,
    small_model: config.small_model,
  }
}

export async function getDefaultModelRef(): Promise<ModelReference> {
  const selection = await getSelection()
  const parsed = parseModelReference(selection.model)
  if (parsed) {
    try {
      await getModel(parsed.providerID, parsed.modelID)
      return parsed
    } catch {
      // fall through to the first configured model
    }
  }

  const models = await listModels()
  const firstModel = models[0]
  if (firstModel) {
    return {
      providerID: firstModel.providerID,
      modelID: firstModel.id,
    }
  }

  return DEFAULT_MODEL_REF
}

export async function getLanguage(model: Model): Promise<LanguageModel> {
  const provider = await getProvider(model.providerID)
  if (!provider) {
    throw new InitError({
      providerID: model.providerID,
    })
  }

  const key = runtimeKey(provider, model)
  const cache = languageState()
  const cached = cache.get(key)
  if (cached) return cached

  const sdk = await getSDK(model)
  const language = sdk.languageModel(model.api.id) as LanguageModel
  cache.set(key, language)
  return language
}

async function getSDK(model: Model) {
  const provider = await getProvider(model.providerID)
  if (!provider) {
    throw new InitError({
      providerID: model.providerID,
    })
  }

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

  const sdk =
    model.api.npm === "@ai-sdk/deepseek" || provider.id === "deepseek"
      ? createDeepSeek({
          apiKey: provider.key,
          baseURL,
          headers,
        })
      : createOpenAI({
          name: provider.id,
          apiKey: provider.key,
          baseURL,
          headers,
        })

  cache.set(key, sdk as SDKProvider)
  return sdk as SDKProvider
}

function fromModelsDevModel(provider: ModelsDev.DevProvider, model: ModelsDev.DevModel): Model {
  return {
    id: model.id,
    providerID: provider.id,
    api: {
      id: model.id,
      url: firstNonEmptyString(model.provider?.api, provider.api) ?? "",
      npm: firstNonEmptyString(model.provider?.npm, provider.npm) ?? "@ai-sdk/openai",
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

const testDeepSeekDevProvider: ModelsDev.DevProvider = {
  id: "deepseek",
  name: "DeepSeek",
  env: ["DEEPSEEK_API_KEY"],
  api: "https://api.deepseek.com",
  npm: "@ai-sdk/deepseek",
  models: {
    "deepseek-reasoner": {
      id: "deepseek-reasoner",
      name: "DeepSeek Reasoner",
      family: "deepseek",
      release_date: "2024-01-01",
      attachment: false,
      reasoning: true,
      temperature: true,
      tool_call: true,
      interleaved: undefined,
      cost: {
        input: 0.0001,
        output: 0.0002,
        cache_read: 0,
        cache_write: 0,
      },
      limit: {
        context: 128000,
        input: undefined,
        output: 4096,
      },
      modalities: {
        input: ["text"],
        output: ["text"],
      },
      status: "beta",
      options: {},
      headers: {},
    },
  },
}

const testDeepSeekProvider: ProviderInfo = fromModelsDevProvider(testDeepSeekDevProvider)
const testDeepSeekModel: Model = testDeepSeekProvider.models["deepseek-reasoner"]!

export {
  list,
  getProvider,
  getModel,
  testDeepSeekProvider,
  testDeepSeekModel,
}
