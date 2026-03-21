// https://models.dev/
//https://github.com/anomalyco/models.dev
//Models.dev 是一个社区驱动的开源 AI 模型数据库，致力于成为 AI 领域的“维基百科”，解决模型信息分散、选择困难、成本不透明等问题。
// 核心定位与价值
// 统一数据库：提供结构化、标准化且持续更新的 AI 模型信息，整合分散在各平台的模型数据
// 社区驱动：开源项目，依赖社区贡献保持数据准确性和时效性
// 多场景应用：已被集成到 OpenCode 等工具中，作为底层模型支持的核心数据来源
import * as Log from "#util/log.ts"
import * as Global from "#global/global.ts"
import path from "path"
import z from "zod"
import * as  Flag from "#flag/flag.ts"
import * as lazy from "#util/lazy.ts"
import * as  Installation from "#installation/installation.ts"


const log = Log.create({ service: "models.dev" })
const filepath = path.join(Global.Path.cache, "models.json")

export const Model = z.object({
    id: z.string(),
    name: z.string(),
    family: z.string().optional(),
    release_date: z.string(),
    attachment: z.boolean(),
    reasoning: z.boolean(),
    temperature: z.boolean(),
    tool_call: z.boolean(),
    interleaved: z
        .union([
            z.literal(true),
            z
                .object({
                    field: z.enum(["reasoning_content", "reasoning_details"]),
                })
                .strict(),
        ])
        .optional(),
    cost: z
        .object({
            input: z.number(),
            output: z.number(),
            cache_read: z.number().optional(),
            cache_write: z.number().optional(),
            context_over_200k: z
                .object({
                    input: z.number(),
                    output: z.number(),
                    cache_read: z.number().optional(),
                    cache_write: z.number().optional(),
                })
                .optional(),
        })
        .optional(),
    limit: z.object({
        context: z.number(),
        input: z.number().optional(),
        output: z.number(),
    }),
    modalities: z
        .object({
            input: z.array(z.enum(["text", "audio", "image", "video", "pdf"])),
            output: z.array(z.enum(["text", "audio", "image", "video", "pdf"])),
        })
        .optional(),
    experimental: z.boolean().optional(),
    status: z.enum(["alpha", "beta", "deprecated"]).optional(),
    options: z.record(z.string(), z.any()),
    headers: z.record(z.string(), z.string()).optional(),
    provider: z.object({ npm: z.string(), api: z.string().optional() }).optional(),
    variants: z.record(z.string(), z.record(z.string(), z.any())).optional(),
})
export type Model = z.infer<typeof Model>

export const Provider = z.object({
    api: z.string().optional(),
    name: z.string(),
    env: z.array(z.string()),
    id: z.string(),
    npm: z.string().optional(),
    models: z.record(z.string(), Model),
})
export type Provider = z.infer<typeof Provider>


function url() {
    return "https://models.dev"
}

//封装在一个 `lazy` 函数中，意味着这段逻辑只有在 `Data` 第一次被访问时才会异步执行，并缓存结果。
//这里的闭包函数是指 既不是lazy(),async()=>{},而是lazy里面定义的一个result(),在里面执行判断的逻辑，使用了相对于result外部，lazy内部的参数
export const Data = lazy.lazy(async () => {
    const json = await fetch(`${url()}/api.json`).then((x) => x.text())
    return JSON.parse(json)
})


export async function get(): Promise<Record<string, Provider>> {
    const result = await Data()
    return result as Record<string, Provider>
}
//refresh models
// export async function refresh() {
//     const file = Bun.file(filepath)
//     const result = await fetch(`${url()}/api.json`, {
//         headers: {
//             "User-Agent": Installation.USER_AGENT,
//         },
//         signal: AbortSignal.timeout(10 * 1000),
//     }).catch((e) => {
//         log.error("Failed to fetch models.dev", {
//             error: e,
//         })
//     })
//     if (result && result.ok) {
//         await Bun.write(file, await result.text())
//         ModelsDev.Data.reset()
//     }
// }

import {
  gateway,
  customProvider,
  defaultSettingsMiddleware,
  wrapLanguageModel,
} from 'ai';

import {deepseek} from "@ai-sdk/deepseek"

// 带有不同 Provider 选项的自定义 Provider：
export const openai = customProvider({
  languageModels: {
    // 带有自定义 Provider 选项的替换模型：
    'gpt-5.1': wrapLanguageModel({
      model: gateway('openai/gpt-5.1'),
      middleware: defaultSettingsMiddleware({
        settings: {
          providerOptions: {
            openai: {
              reasoningEffort: 'high',
            },
          },
        },
      }),
    }),
    // 带有自定义 Provider 选项的别名模型：
    'gpt-5.1-high-reasoning': wrapLanguageModel({
      model: gateway('openai/gpt-5.1'),
      middleware: defaultSettingsMiddleware({
        settings: {
          providerOptions: {
            openai: {
              reasoningEffort: 'high',
            },
          },
        },
      }),
    }),
  },
  fallbackProvider: gateway,
});


deepseek.languageModel("deepseek-reasoner")

