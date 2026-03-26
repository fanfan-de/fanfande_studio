import * as Log from "#util/log.ts";
import z from "zod"
import {
    type LanguageModel,
    type Provider,
    type Provider as SDKProvider,
} from "ai"
import * as ModelsDev from "#provider/modelsdev.ts"
import { createDeepSeek, deepseek } from "@ai-sdk/deepseek";
import { openai } from "@ai-sdk/openai"
import { Instance } from "@/project/instance";
import { mapValues, mergeDeep } from "remeda";
import { NamedError } from "@/util/error";
import fuzzysort from "fuzzysort"
//import { Config } from "@/config/config";
import { iife } from "@/util/iife";
import * as  Env from "#env/env.ts";

import { } from "@ai-sdk/deepseek"

/**
 * 存储所有支持的provider
 */

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



/**
 * 
 * return
        models: Map<string, LanguageModel>() ，Instance可用的Model
        providers：{ [providerID: string]: ProviderInfo }，Instance可用的的Provider
        sdk：Map<number, SDKProvider>()    AI SDK提供的 provider
        modelLoaders,
 */
const state = Instance.state(async () => {
    using _ = log.time("state")

    //const config = await Config.get() //用户的配置设置
    const DevProviders: Record<string, ModelsDev.DevProvider> = await ModelsDev.get()
    //存储所有的潜在providers的容器（从modeldevs中构建）
    const AllProviders = mapValues(DevProviders, fromModelsDevProvider)
    //const disabled = new Set(config.disabled_providers ?? [])
    //const enabled = config.enabled_providers ? new Set(config.enabled_providers) : null

    // function isProviderAllowed(providerID: string): boolean {
    //     if (enabled && !enabled.has(providerID)) return false
    //     if (disabled.has(providerID)) return false
    //     return true
    // }

    /**
     * 项目级的配置，存储已经经过配置，可用的provider和model
     * 未配置，不可用的不会存在这里
     */
    //存储所有已配置的提供者（provider）
    const providers: { [providerID: string]: ProviderInfo } = {}
    //字典，所有的可用的model实例，键值是 providerid+languageid
    const languages = new Map<string, LanguageModel>()
    //用于抽象不同 AI 服务（OpenAI、Anthropic 等）的模型加载逻辑。
    // const modelLoaders: {
    //     [providerID: string]: CustomModelLoader
    // } = {}
    //缓存AI SDK Provider实例，键为配置哈希，避免重复初始化
    const sdk = new Map<number, SDKProvider>()

    log.info("init")

    // const configProviders = Object.entries(config.provider ?? {})


    // /**
    // * 合并提供者配置信息。
    // * 
    // * 如果提供者已存在于 providers 中，则将新配置深度合并到现有配置上；
    // * 否则从 database 中获取基础配置，再与新配置深度合并后存入 providers。
    // * 
    // * @param providerID - 提供者标识符（如 "openai", "anthropic"）
    // * @param provider - 要合并的部分提供者配置信息
    // */
    function mergeProvider(providerID: string, provider: Partial<ProviderInfo>) {
        const existing = providers[providerID]
        if (existing) {
            // @ts-expect-error
            providers[providerID] = mergeDeep(existing, provider)
            return
        }
        const match = AllProviders[providerID]
        if (!match) return
        // @ts-expect-error
        providers[providerID] = mergeDeep(match, provider)
    }

    // // extend database from config
    // //从用户配置文件中扩展和合并AI模型提供商的配置。具体来说，它处理用户通过opencode.json
    // //配置文件自定义的提供商和模型设置。
    // for (const [providerID, provider] of configProviders) {
    //     const existing = database[providerID]
    //     //优先用户配置，其次是数据库预定义的，
    //     const parsed: Info = {
    //         id: providerID,
    //         name: provider.name ?? existing?.name ?? providerID,
    //         env: provider.env ?? existing?.env ?? [],
    //         options: mergeDeep(existing?.options ?? {}, provider.options ?? {}),
    //         source: "config",
    //         models: existing?.models ?? {},
    //     }

    //     for (const [modelID, model] of Object.entries(provider.models ?? {})) {
    //         const existingModel = parsed.models[model.id ?? modelID]
    //         const name = iife(() => {
    //             if (model.name) return model.name
    //             if (model.id && model.id !== modelID) return modelID
    //             return existingModel?.name ?? modelID
    //         })
    //         const parsedModel: Model = {
    //             id: modelID,
    //             api: {
    //                 id: model.id ?? existingModel?.api.id ?? modelID,
    //                 npm:
    //                     model.provider?.npm ??
    //                     provider.npm ??
    //                     existingModel?.api.npm ??
    //                     modelsDev[providerID]?.npm ??
    //                     "@ai-sdk/openai-compatible",
    //                 url: model.provider?.api ?? provider?.api ?? existingModel?.api.url ?? modelsDev[providerID]?.api!,
    //             },
    //             status: model.status ?? existingModel?.status ?? "active",
    //             name,
    //             providerID,
    //             capabilities: {
    //                 temperature: model.temperature ?? existingModel?.capabilities.temperature ?? false,
    //                 reasoning: model.reasoning ?? existingModel?.capabilities.reasoning ?? false,
    //                 attachment: model.attachment ?? existingModel?.capabilities.attachment ?? false,
    //                 toolcall: model.tool_call ?? existingModel?.capabilities.toolcall ?? true,
    //                 input: {
    //                     text: model.modalities?.input?.includes("text") ?? existingModel?.capabilities.input.text ?? true,
    //                     audio: model.modalities?.input?.includes("audio") ?? existingModel?.capabilities.input.audio ?? false,
    //                     image: model.modalities?.input?.includes("image") ?? existingModel?.capabilities.input.image ?? false,
    //                     video: model.modalities?.input?.includes("video") ?? existingModel?.capabilities.input.video ?? false,
    //                     pdf: model.modalities?.input?.includes("pdf") ?? existingModel?.capabilities.input.pdf ?? false,
    //                 },
    //                 output: {
    //                     text: model.modalities?.output?.includes("text") ?? existingModel?.capabilities.output.text ?? true,
    //                     audio: model.modalities?.output?.includes("audio") ?? existingModel?.capabilities.output.audio ?? false,
    //                     image: model.modalities?.output?.includes("image") ?? existingModel?.capabilities.output.image ?? false,
    //                     video: model.modalities?.output?.includes("video") ?? existingModel?.capabilities.output.video ?? false,
    //                     pdf: model.modalities?.output?.includes("pdf") ?? existingModel?.capabilities.output.pdf ?? false,
    //                 },
    //                 interleaved: model.interleaved ?? false,
    //             },
    //             cost: {
    //                 input: model?.cost?.input ?? existingModel?.cost?.input ?? 0,
    //                 output: model?.cost?.output ?? existingModel?.cost?.output ?? 0,
    //                 cache: {
    //                     read: model?.cost?.cache_read ?? existingModel?.cost?.cache.read ?? 0,
    //                     write: model?.cost?.cache_write ?? existingModel?.cost?.cache.write ?? 0,
    //                 },
    //             },
    //             options: mergeDeep(existingModel?.options ?? {}, model.options ?? {}),
    //             limit: {
    //                 context: model.limit?.context ?? existingModel?.limit?.context ?? 0,
    //                 output: model.limit?.output ?? existingModel?.limit?.output ?? 0,
    //             },
    //             headers: mergeDeep(existingModel?.headers ?? {}, model.headers ?? {}),
    //             family: model.family ?? existingModel?.family ?? "",
    //             release_date: model.release_date ?? existingModel?.release_date ?? "",
    //             variants: {},
    //         }
    //         // const merged = mergeDeep(ProviderTransform.variants(parsedModel), model.variants ?? {})
    //         // parsedModel.variants = mapValues(
    //         //     pickBy(merged, (v) => !v.disabled),
    //         //     (v) => omit(v, ["disabled"]),
    //         // )
    //         // parsed.models[modelID] = parsedModel
    //     }
    //     database[providerID] = parsed
    // }

    // load env
    const env = Env.all()
    for (const [providerID, provider] of Object.entries(AllProviders)) {
        const apiKey = provider.env.map((item) => env[item]).find(Boolean)
        if (!apiKey) continue
        mergeProvider(providerID, {
            source: "env",
            key: provider.env.length === 1 ? apiKey : undefined,
        })
    }

    for (const [id, provider] of Object.entries(providers)) {
        for (const [modelID, model] of Object.entries(provider.models)) {


        }
    }





    return {
        models: languages,
        providers,
        sdk,
        // modelLoaders,
    }
})
/**
 * 列出project的已有的providers
 * @returns 
 */
async function list() {
    return state().then((state) => state.providers)
}
//获得project特定的provider
async function getProvider(providerID: string) {
    return state().then((s) => s.providers[providerID])
}
//获得模型
async function getModel(providerID: string, modelID: string) {
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


function fromModelsDevModel(provider: ModelsDev.DevProvider, model: ModelsDev.DevModel): Model {
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

export function fromModelsDevProvider(provider: ModelsDev.DevProvider): ProviderInfo {
    return {
        id: provider.id,
        source: "custom",
        name: provider.name,
        env: provider.env ?? [],
        options: {},
        models: mapValues(provider.models, (model) => fromModelsDevModel(provider, model)),
    }
}
/**
 * model，provider都是本项目自己定义的type（准确说是匹配 modeldev上面的定义的结构）
 * 需要找到转成AI SDK中对应的SDK
 * @param model 
 * @returns 
 */
// async function getLanguage(model: Model): Promise<LanguageModel> {
//     const s = await state()
//     //模板字符串语法，
//     // 使用反引号（`）而不是单引号或双引号
//     //允许在字符串中嵌入表达式
//     //表达式用 ${} 包裹
//     const key = `${model.providerID}/${model.id}`
//     if (s.models.has(key))
//         return s.models.get(key)!

//     const provider = s.providers[model.providerID]
//     const sdk = await getSDK(model)

//     try {
//         const language = s.modelLoaders[model.providerID]
//             ? await s.modelLoaders[model.providerID](sdk, model.api.id, provider.options)
//             : sdk.languageModel(model.api.id)
//         s.models.set(key, language)
//         return language
//     } catch (e) {
//         if (e instanceof NoSuchModelError)
//             throw new ModelNotFoundError(
//                 {
//                     modelID: model.id,
//                     providerID: model.providerID,
//                 },
//                 { cause: e },
//             )
//         throw e
//     }
// }

/**
 * 动态初始化并返回一个用于与特定大语言模型 (LLM) 供应商通信的 SDK 实例。
 * @param model 
 */
async function getSDK(model: Model) {

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


const deepseekprovider = deepseek
const deepseekreasoningmodel = deepseek.languageModel("deepseek-reasoner")

//for test
//在以下位置撰写一个Model和provider的实例，使用的是deepseek reasoner模型（本文件定义的），以供我测试文件来调用测试

// for test - create Model and Provider instances for deepseek reasoner
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
};

const testDeepSeekProvider:ProviderInfo = fromModelsDevProvider(testDeepSeekDevProvider);
const testDeepSeekModel:Model = testDeepSeekProvider.models["deepseek-reasoner"]!;





export {
    list,
    getProvider,
    getModel,
    //getLanguage,
    //temp
    deepseekprovider,
    deepseekreasoningmodel,
    testDeepSeekProvider,
    testDeepSeekModel,
}



