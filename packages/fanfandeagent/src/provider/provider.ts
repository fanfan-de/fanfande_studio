import { Log } from "@/util/log";
import z from "zod"
import {
    type LanguageModel,
    type Provider as SDKProvider,
} from "ai"
import { ModelsDev } from "./models"
import { deepseek } from "@ai-sdk/deepseek";
import { openai } from "@ai-sdk/openai"
import { Instance } from "@/project/instance";
import { mapValues, mergeDeep } from "remeda";
import { NamedError } from "@/util/error";
import fuzzysort from "fuzzysort"
import { Config } from "@/config/config";
import { iife } from "@/util/iife";
import { Env } from "#env/env.ts";

/**
 * 存储所有支持的provider
 */
export namespace Provider {
    const log = Log.create({ service: "provider" })
    
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

    //provider info
    export const Info = z
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
    export type Info = z.infer<typeof Info>

    type CustomModelLoader = (sdk: any, modelID: string, options?: Record<string, any>) => Promise<any>

    const state = Instance.state(async () => {
        using _ = log.time("state")

        const config = await Config.get() //用户的配置设置
        const modelsDev = await ModelsDev.get()
        const database = mapValues(modelsDev, fromModelsDevProvider)
        const disabled = new Set(config.disabled_providers ?? [])
        const enabled = config.enabled_providers ? new Set(config.enabled_providers) : null

        function isProviderAllowed(providerID: string): boolean {
            if (enabled && !enabled.has(providerID)) return false
            if (disabled.has(providerID)) return false
            return true
        }

        /**
         * 项目级的配置，存储已经经过配置，可用的provider和model
         * 未配置，不可用的不会存在这里
         */
        //存储所有已配置的提供者（provider）
        const providers: { [providerID: string]: Info } = {}
        //字典，所有的可用的model实例，键值是 providerid+languageid
        const languages = new Map<string, LanguageModel>()
        //用于抽象不同 AI 服务（OpenAI、Anthropic 等）的模型加载逻辑。
        const modelLoaders: {
            [providerID: string]: CustomModelLoader
        } = {}
        //缓存AI SDK Provider实例，键为配置哈希，避免重复初始化
        const sdk = new Map<number, SDKProvider>()

        log.info("init")

        const configProviders = Object.entries(config.provider ?? {})


        /**
        * 合并提供者配置信息。
        * 
        * 如果提供者已存在于 providers 中，则将新配置深度合并到现有配置上；
        * 否则从 database 中获取基础配置，再与新配置深度合并后存入 providers。
        * 
        * @param providerID - 提供者标识符（如 "openai", "anthropic"）
        * @param provider - 要合并的部分提供者配置信息
        */
        function mergeProvider(providerID: string, provider: Partial<Info>) {
            const existing = providers[providerID]
            if (existing) {
                // @ts-expect-error
                providers[providerID] = mergeDeep(existing, provider)
                return
            }
            const match = database[providerID]
            if (!match) return
            // @ts-expect-error
            providers[providerID] = mergeDeep(match, provider)
        }

        // extend database from config
        //从用户配置文件中扩展和合并AI模型提供商的配置。具体来说，它处理用户通过opencode.json
        //配置文件自定义的提供商和模型设置。
        for (const [providerID, provider] of configProviders) {
            const existing = database[providerID]
            //优先用户配置，其次是数据库预定义的，
            const parsed: Info = {
                id: providerID,
                name: provider.name ?? existing?.name ?? providerID,
                env: provider.env ?? existing?.env ?? [],
                options: mergeDeep(existing?.options ?? {}, provider.options ?? {}),
                source: "config",
                models: existing?.models ?? {},
            }

            for (const [modelID, model] of Object.entries(provider.models ?? {})) {
                const existingModel = parsed.models[model.id ?? modelID]
                const name = iife(() => {
                    if (model.name) return model.name
                    if (model.id && model.id !== modelID) return modelID
                    return existingModel?.name ?? modelID
                })
                const parsedModel: Model = {
                    id: modelID,
                    api: {
                        id: model.id ?? existingModel?.api.id ?? modelID,
                        npm:
                            model.provider?.npm ??
                            provider.npm ??
                            existingModel?.api.npm ??
                            modelsDev[providerID]?.npm ??
                            "@ai-sdk/openai-compatible",
                        url: model.provider?.api ?? provider?.api ?? existingModel?.api.url ?? modelsDev[providerID]?.api!,
                    },
                    status: model.status ?? existingModel?.status ?? "active",
                    name,
                    providerID,
                    capabilities: {
                        temperature: model.temperature ?? existingModel?.capabilities.temperature ?? false,
                        reasoning: model.reasoning ?? existingModel?.capabilities.reasoning ?? false,
                        attachment: model.attachment ?? existingModel?.capabilities.attachment ?? false,
                        toolcall: model.tool_call ?? existingModel?.capabilities.toolcall ?? true,
                        input: {
                            text: model.modalities?.input?.includes("text") ?? existingModel?.capabilities.input.text ?? true,
                            audio: model.modalities?.input?.includes("audio") ?? existingModel?.capabilities.input.audio ?? false,
                            image: model.modalities?.input?.includes("image") ?? existingModel?.capabilities.input.image ?? false,
                            video: model.modalities?.input?.includes("video") ?? existingModel?.capabilities.input.video ?? false,
                            pdf: model.modalities?.input?.includes("pdf") ?? existingModel?.capabilities.input.pdf ?? false,
                        },
                        output: {
                            text: model.modalities?.output?.includes("text") ?? existingModel?.capabilities.output.text ?? true,
                            audio: model.modalities?.output?.includes("audio") ?? existingModel?.capabilities.output.audio ?? false,
                            image: model.modalities?.output?.includes("image") ?? existingModel?.capabilities.output.image ?? false,
                            video: model.modalities?.output?.includes("video") ?? existingModel?.capabilities.output.video ?? false,
                            pdf: model.modalities?.output?.includes("pdf") ?? existingModel?.capabilities.output.pdf ?? false,
                        },
                        interleaved: model.interleaved ?? false,
                    },
                    cost: {
                        input: model?.cost?.input ?? existingModel?.cost?.input ?? 0,
                        output: model?.cost?.output ?? existingModel?.cost?.output ?? 0,
                        cache: {
                            read: model?.cost?.cache_read ?? existingModel?.cost?.cache.read ?? 0,
                            write: model?.cost?.cache_write ?? existingModel?.cost?.cache.write ?? 0,
                        },
                    },
                    options: mergeDeep(existingModel?.options ?? {}, model.options ?? {}),
                    limit: {
                        context: model.limit?.context ?? existingModel?.limit?.context ?? 0,
                        output: model.limit?.output ?? existingModel?.limit?.output ?? 0,
                    },
                    headers: mergeDeep(existingModel?.headers ?? {}, model.headers ?? {}),
                    family: model.family ?? existingModel?.family ?? "",
                    release_date: model.release_date ?? existingModel?.release_date ?? "",
                    variants: {},
                }
                // const merged = mergeDeep(ProviderTransform.variants(parsedModel), model.variants ?? {})
                // parsedModel.variants = mapValues(
                //     pickBy(merged, (v) => !v.disabled),
                //     (v) => omit(v, ["disabled"]),
                // )
                // parsed.models[modelID] = parsedModel
            }
            database[providerID] = parsed
        }

        // load env
        const env = Env.all()
        for (const [providerID, provider] of Object.entries(database)) {
            if (disabled.has(providerID)) continue
            const apiKey = provider.env.map((item) => env[item]).find(Boolean)
            if (!apiKey) continue
            mergeProvider(providerID, {
                source: "env",
                key: provider.env.length === 1 ? apiKey : undefined,
            })
        }

        // load apikeys
        for (const [providerID, provider] of Object.entries(await Auth.all())) {
            if (disabled.has(providerID)) continue
            if (provider.type === "api") {
                mergeProvider(providerID, {
                    source: "api",
                    key: provider.key,
                })
            }
        }

        for (const plugin of await Plugin.list()) {
            if (!plugin.auth) continue
            const providerID = plugin.auth.provider
            if (disabled.has(providerID)) continue

            // For github-copilot plugin, check if auth exists for either github-copilot or github-copilot-enterprise
            let hasAuth = false
            const auth = await Auth.get(providerID)
            if (auth) hasAuth = true

            // Special handling for github-copilot: also check for enterprise auth
            if (providerID === "github-copilot" && !hasAuth) {
                const enterpriseAuth = await Auth.get("github-copilot-enterprise")
                if (enterpriseAuth) hasAuth = true
            }

            if (!hasAuth) continue
            if (!plugin.auth.loader) continue

            // Load for the main provider if auth exists
            if (auth) {
                const options = await plugin.auth.loader(() => Auth.get(providerID) as any, database[plugin.auth.provider])
                const opts = options ?? {}
                const patch: Partial<Info> = providers[providerID] ? { options: opts } : { source: "custom", options: opts }
                mergeProvider(providerID, patch)
            }

            // If this is github-copilot plugin, also register for github-copilot-enterprise if auth exists
            if (providerID === "github-copilot") {
                const enterpriseProviderID = "github-copilot-enterprise"
                if (!disabled.has(enterpriseProviderID)) {
                    const enterpriseAuth = await Auth.get(enterpriseProviderID)
                    if (enterpriseAuth) {
                        const enterpriseOptions = await plugin.auth.loader(
                            () => Auth.get(enterpriseProviderID) as any,
                            database[enterpriseProviderID],
                        )
                        const opts = enterpriseOptions ?? {}
                        const patch: Partial<Info> = providers[enterpriseProviderID]
                            ? { options: opts }
                            : { source: "custom", options: opts }
                        mergeProvider(enterpriseProviderID, patch)
                    }
                }
            }
        }

        for (const [providerID, fn] of Object.entries(CUSTOM_LOADERS)) {
            if (disabled.has(providerID)) continue
            const data = database[providerID]
            if (!data) {
                log.error("Provider does not exist in model list " + providerID)
                continue
            }
            const result = await fn(data)
            if (result && (result.autoload || providers[providerID])) {
                if (result.getModel) modelLoaders[providerID] = result.getModel
                const opts = result.options ?? {}
                const patch: Partial<Info> = providers[providerID] ? { options: opts } : { source: "custom", options: opts }
                mergeProvider(providerID, patch)
            }
        }

        // load config
        for (const [providerID, provider] of configProviders) {
            const partial: Partial<Info> = { source: "config" }
            if (provider.env) partial.env = provider.env
            if (provider.name) partial.name = provider.name
            if (provider.options) partial.options = provider.options
            mergeProvider(providerID, partial)
        }

        for (const [providerID, provider] of Object.entries(providers)) {
            if (!isProviderAllowed(providerID)) {
                delete providers[providerID]
                continue
            }

            const configProvider = config.provider?.[providerID]

            for (const [modelID, model] of Object.entries(provider.models)) {
                model.api.id = model.api.id ?? model.id ?? modelID
                if (modelID === "gpt-5-chat-latest" || (providerID === "openrouter" && modelID === "openai/gpt-5-chat"))
                    delete provider.models[modelID]
                if (model.status === "alpha" && !Flag.OPENCODE_ENABLE_EXPERIMENTAL_MODELS) delete provider.models[modelID]
                if (model.status === "deprecated") delete provider.models[modelID]
                if (
                    (configProvider?.blacklist && configProvider.blacklist.includes(modelID)) ||
                    (configProvider?.whitelist && !configProvider.whitelist.includes(modelID))
                )
                    delete provider.models[modelID]

                model.variants = mapValues(ProviderTransform.variants(model), (v) => v)

                // Filter out disabled variants from config
                const configVariants = configProvider?.models?.[modelID]?.variants
                if (configVariants && model.variants) {
                    const merged = mergeDeep(model.variants, configVariants)
                    model.variants = mapValues(
                        pickBy(merged, (v) => !v.disabled),
                        (v) => omit(v, ["disabled"]),
                    )
                }
            }

            if (Object.keys(provider.models).length === 0) {
                delete providers[providerID]
                continue
            }

            log.info("found", { providerID })
        }
        //每一個項目，對應一個模型配置
        //
        return {
            models: languages,
            providers,
            sdk,
            modelLoaders,
        }
    })
    /**
     * 列出project的已有的providers
     * @returns 
     */
    export async function list() {
        return state().then((state) => state.providers)
    }
    //获得project特定的provider
    export async function getProvider(providerID: string) {
        return state().then((s) => s.providers[providerID])
    }
    //获得模型
    export async function getModel(providerID: string, modelID: string) {
        const s = await state()
        const provider = s.providers[providerID]
        if (!provider) {
            const availableProviders = Object.keys(s.providers)
            const matches = fuzzysort.go(providerID, availableProviders, { limit: 3, threshold: -10000 })
            const suggestions = matches.map((m) => m.target)
            throw new ModelNotFoundError({ providerID, modelID, suggestions })
        }

        const info = provider.models[modelID]
        if (!info) {
            const availableModels = Object.keys(provider.models)
            const matches = fuzzysort.go(modelID, availableModels, { limit: 3, threshold: -10000 })
            const suggestions = matches.map((m) => m.target)//模糊匹配
            throw new ModelNotFoundError({ providerID, modelID, suggestions })
        }
        return info
    }


    function fromModelsDevModel(provider: ModelsDev.Provider, model: ModelsDev.Model): Model {
        const m: Model = {
            id: model.id,
            providerID: provider.id,
            api: {
                id: model.id,
                url: provider.api!,
                npm: model.provider?.npm ?? provider.npm ?? "@ai-sdk/openai-compatible",
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
            variants: {},
            family: model.family,
        }

        /// m.variants = mapValues(ProviderTransform.variants(m), (v) => v)

        return m
    }

    export function fromModelsDevProvider(provider: ModelsDev.Provider): Info {
        return {
            id: provider.id,
            source: "custom",
            name: provider.name,
            env: provider.env ?? [],
            options: {},
            models: mapValues(provider.models, (model) => fromModelsDevModel(provider, model)),
        }
    }

    //model，provider都是本项目自己定义的type（准确说是匹配 modeldev上面的定义的结构），
    // 需要找到转成AI SDK中对应的SDK
    export async function getLanguage(model: Model): Promise<LanguageModel> {
        const s = await state()
        //模板字符串语法，
        // 使用反引号（`）而不是单引号或双引号
        //允许在字符串中嵌入表达式
        //表达式用 ${} 包裹
        const key = `${model.providerID}/${model.id}`
        if (s.models.has(key)) return s.models.get(key)!

        const provider = s.providers[model.providerID]
        const sdk = await getSDK(model)

        try {
            const language = s.modelLoaders[model.providerID]
                ? await s.modelLoaders[model.providerID](sdk, model.api.id, provider.options)
                : sdk.languageModel(model.api.id)
            s.models.set(key, language)
            return language
        } catch (e) {
            if (e instanceof NoSuchModelError)
                throw new ModelNotFoundError(
                    {
                        modelID: model.id,
                        providerID: model.providerID,
                    },
                    { cause: e },
                )
            throw e
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




}