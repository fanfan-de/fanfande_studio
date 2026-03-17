/**
 * 管理、存储和验证用户的身份认证信息（Authentication Info）
 * 将认证数据持久化存储在一个 JSON 文件中（`auth.json`）
 */
import path from "path"
import * as  Global from "#global/global.ts" // 引入全局配置，通常包含路径信息
import fs from "fs/promises"
import z from "zod" // 数据校验库
import * as Filesystem from "#util/filesystem.ts"


//第一种auth验证的方式：Open Authorization（开放授权）
export const Oauth = z
    .object({
        type: z.literal("oauth"),
        refresh: z.string(),
        access: z.string(),
        expires: z.number(),
        accountId: z.string().optional(),
        enterpriseUrl: z.string().optional(),
    })
    .meta({ ref: "OAuth" })

//第二种auth验证的方式：Api信息
export const Api = z
    .object({
        type: z.literal("api"),
        key: z.string(),
    })
    .meta({ ref: "ApiAuth" })


//第三种auth验证的方式:  (type: "wellknown")
export const WellKnown = z
    .object({
        type: z.literal("wellknown"),
        key: z.string(),
        token: z.string(),
    })
    .meta({ ref: "WellKnownAuth" })

export const Info = z.discriminatedUnion("type", [Oauth, Api, WellKnown]).meta({ ref: "Auth" })
export type Info = z.infer<typeof Info>

const filepath = path.join(Global.Path.data, "auth.json")





//从硬盘读取 JSON 文件，清洗掉格式错误的数据，只返回格式正确的数据
export async function all(): Promise<Record<string, Info>> {
    const data = await Filesystem.readJson<Record<string, unknown>>(filepath).catch(() => ({}))
    return Object.entries(data).reduce(
        (acc, [key, value]) => {
            const parsed = Info.safeParse(value)
            if (!parsed.success) return acc
            acc[key] = parsed.data
            return acc
        },
        {} as Record<string, Info>,
    )
}


export async function get(providerID: string) {
    const auth = await all()
    return auth[providerID]
}

export async function set(key: string, info: Info) {
    const file = Bun.file(filepath)
    const data = await all()
    await Bun.write(file, JSON.stringify({ ...data, [key]: info }, null, 2))
    await fs.chmod(file.name!, 0o600)
}

export async function remove(key: string) {
    const file = Bun.file(filepath)
    const data = await all()
    delete data[key]
    await Bun.write(file, JSON.stringify(data, null, 2))
    await fs.chmod(file.name!, 0o600)
}



