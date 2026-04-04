import * as Log from "#util/log.ts"
import * as Global from "#global/global.ts"
import path from "path"
import fs from "fs/promises"
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

async function readCache() {
    const text = await Bun.file(filepath)
        .text()
        .catch(() => undefined)
    if (!text) return undefined

    try {
        return JSON.parse(text) as Record<string, DevProvider>
    } catch {
        return undefined
    }
}

async function fetchRemote() {
    const response = await fetch(`${url()}/api.json`, {
        headers: {
            "User-Agent": Installation.USER_AGENT,
        },
        signal: AbortSignal.timeout(10 * 1000),
    })

    if (!response.ok) {
        throw new Error(`models.dev request failed with status ${response.status}`)
    }

    const text = await response.text()
    await fs.mkdir(path.dirname(filepath), { recursive: true })
    await Bun.write(Bun.file(filepath), text)
    return JSON.parse(text) as Record<string, DevProvider>
}

const DevData = lazy.lazy(async () => {
    const cached = await readCache()
    if (cached) return cached
    return fetchRemote()
})

/**
 * 获得从 modelsdev中构建的  Provider对象
 * @returns 
 */
async function get(): Promise<Record<string, DevProvider>> {
    try {
        const result = await DevData()
        return result as Record<string, DevProvider>
    } catch (error) {
        log.error("Failed to load models.dev catalog", {
            error,
        })
        const cached = await readCache()
        if (cached) return cached
        throw error
    }
}
//refresh models 
async function refresh() {
    const result = await fetchRemote().catch((e) => {
        log.error("Failed to fetch models.dev", {
            error: e,
        })
    })
    if (result) {
        DevData.reset()
    }
}



export {
    DevModel,
    DevProvider,
    get,
    refresh
}
