import * as Log from "#util/log.ts"
import * as Global from "#global/global.ts"
import path from "path"
import z from "zod"
import * as  Flag from "#flag/flag.ts"
import * as lazy from "#util/lazy.ts"
import * as  Installation from "#installation/installation.ts"


const log = Log.create({ service: "models.dev" })
const filepath = path.join(Global.Path.cache, "models.json")

const DevModel = z.object({
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
type DevModel = z.infer<typeof DevModel>

const DevProvider = z.object({
    api: z.string().optional(),
    name: z.string(),
    env: z.array(z.string()),
    id: z.string(),
    npm: z.string().optional(),
    models: z.record(z.string(), DevModel),
})
type DevProvider = z.infer<typeof DevProvider>


function url() {
    return "https://models.dev"
}

const DevData = lazy.lazy(async () => {
    const json = await fetch(`${url()}/api.json`).then((x) => x.text())
    return JSON.parse(json)
})

/**
 * 获得从 modelsdev中构建的  Provider对象
 * @returns 
 */
async function get(): Promise<Record<string, DevProvider>> {
    const result = await DevData()
    return result as Record<string, DevProvider>
}
//refresh models 
async function refresh() {
    const file = Bun.file(filepath)
    const result = await fetch(`${url()}/api.json`, {
        headers: {
            "User-Agent": Installation.USER_AGENT,
        },
        signal: AbortSignal.timeout(10 * 1000),
    }).catch((e) => {
        log.error("Failed to fetch models.dev", {
            error: e,
        })
    })
    if (result && result.ok) {
        await Bun.write(file, await result.text())
        DevData.reset()
    }
}



export {
    DevModel,
    DevProvider,
    get,
    refresh
}