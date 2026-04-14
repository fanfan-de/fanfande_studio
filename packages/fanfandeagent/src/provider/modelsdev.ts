import fs from "fs/promises"
import path from "path"
import z from "zod"
import * as Global from "#global/global.ts"
import * as Installation from "#installation/installation.ts"
import * as Log from "#util/log.ts"
import * as lazy from "#util/lazy.ts"

const MODELS_DEV_URL = "https://models.dev"
const REQUEST_TIMEOUT_MS = 10 * 1000

const log = Log.create({ service: "models.dev" })
const filepath = path.join(Global.Path.cache, "models.json")
type DevCatalog = Record<string, DevProvider>
type CacheSnapshot = {
    data: DevCatalog
    signature?: string
}

// -----------------------------------------------------------------------------
// 远端 catalog 的 schema
// -----------------------------------------------------------------------------

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


// -----------------------------------------------------------------------------
// 本地缓存 + 远端拉取
// -----------------------------------------------------------------------------

function apiURL(pathname: string) {
    return `${MODELS_DEV_URL}${pathname}`
}

async function readCache() {
    const signature = await fs
        .stat(filepath)
        .then((stat) => `${stat.mtimeMs}:${stat.size}`)
        .catch(() => undefined)
    const text = await Bun.file(filepath)
        .text()
        .catch(() => undefined)
    if (!text) return undefined

    try {
        return {
            data: JSON.parse(text) as DevCatalog,
            signature,
        } satisfies CacheSnapshot
    } catch {
        return undefined
    }
}

let loadedCacheSignature: string | undefined

async function invalidateIfCacheChanged() {
    if (!loadedCacheSignature) return

    const currentSignature = await fs
        .stat(filepath)
        .then((stat) => `${stat.mtimeMs}:${stat.size}`)
        .catch(() => undefined)
    if (!currentSignature || currentSignature === loadedCacheSignature) return

    log.info("models.dev cache changed on disk; invalidating in-memory catalog", {
        previous: loadedCacheSignature,
        next: currentSignature,
    })
    loadedCacheSignature = undefined
    DevData.reset()
}

async function fetchRemote() {
    const response = await fetch(apiURL("/api.json"), {
        headers: {
            "User-Agent": Installation.USER_AGENT,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    if (!response.ok) {
        throw new Error(`models.dev request failed with status ${response.status}`)
    }

    const text = await response.text()
    await fs.mkdir(path.dirname(filepath), { recursive: true })
    await Bun.write(Bun.file(filepath), text)
    loadedCacheSignature = await fs
        .stat(filepath)
        .then((stat) => `${stat.mtimeMs}:${stat.size}`)
        .catch(() => undefined)
    return JSON.parse(text) as DevCatalog
}

const DevData = lazy.lazy(async () => {
    // 进程内优先复用 lazy 缓存；首次未命中时再去读文件或请求远端。
    const cached = await readCache()
    if (cached) {
        loadedCacheSignature = cached.signature
        return cached.data
    }
    return fetchRemote()
})

// -----------------------------------------------------------------------------
// 对外 API
// -----------------------------------------------------------------------------

/**
 * 按顺序加载 models.dev catalog：
 * 1. 先看进程内 lazy 缓存。
 * 2. 再看本地磁盘缓存。
 * 3. 最后才请求远端接口。
 */
async function get(): Promise<Record<string, DevProvider>> {
    try {
        await invalidateIfCacheChanged()
        const result = await DevData()
        return result as DevCatalog
    } catch (error) {
        log.error("Failed to load models.dev catalog", {
            error,
        })
        const cached = await readCache()
        if (cached) {
            loadedCacheSignature = cached.signature
            return cached.data
        }
        throw error
    }
}

// 强制从远端刷新 catalog；刷新成功后清掉进程内缓存，下次 get() 会拿到新数据。
async function refresh() {
    const result = await fetchRemote().catch((error) => {
        log.error("Failed to fetch models.dev", {
            error,
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
