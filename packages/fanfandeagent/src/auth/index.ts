/**
 * 管理、存储和验证用户的身份认证信息（Authentication Info）
 * 将认证数据持久化存储在一个 JSON 文件中（`auth.json`）
 */
import path from "path"
import { Global } from "../global" // 引入全局配置，通常包含路径信息
import fs from "fs/promises"
import z from "zod" // 数据校验库
export namespace Auth {
    export const Oauth = z
    .object({
      type: z.literal("oauth"),
      refresh: z.string(),
      access: z.string(),
      expires: z.number(),
      accountId: z.string().optional(),
    })
    .meta({ ref: "OAuth" })

    const filepath = path.join(Global.Path.data, "auth.json")
    
    export const Info = z.discriminatedUnion("type", [Oauth]).meta({ ref: "Auth" })
    export type Info = z.infer<typeof Info>
    //从硬盘读取 JSON 文件，清洗掉格式错误的数据，只返回格式正确的数据
    export async function all(): Promise<Record<string, Info>> {
        const file = Bun.file(filepath)
        const data = await file.json().catch(() => ({}) as Record<string, unknown>)
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

}