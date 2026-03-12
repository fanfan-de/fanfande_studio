import { Log } from "../util/log"
import z from "zod"
import { Identifier } from "../id/id"
import { Snapshot } from "../snapshot"
import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import { Message } from "./message"
import { Instance } from "@/project/instance"
import { Slug } from "@/util/slug"
import { Installation } from "@/installation"
import { Storage } from "../storage/storage"
import { fn } from "@/util/fn"

export namespace Session {
    const log = Log.create({ service: "session" })

    const parentTiTlePrefix = "新对话"
    const childTiltePrefic = "子对话"

    //todo 创建默认title

    export const Info = z
        .object({
            id: Identifier.schema("session"),//会话唯一标识符 ("session" 类型)
            slug: z.string().optional,//简短标识符（用于 URL/显示）
            projectID: z.string(),//关联的项目ID
            directory: z.string(),//工作目录路径
            // parentID: Identifier.schema("session").optional(),//父会话ID（可选，用于会话树）
            summary: z
                .object({
                    additions: z.number(),//新增行数
                    deletions: z.number(),//删除行数
                    files: z.number(),//涉及文件数
                    ///diffs: Snapshot.FileDiff.array().optional(),//详细文件差异（可选）
                })
                .optional(),//代码变更摘要（可选）？
            share: z
                .object({
                    url: z.string(),
                })
                .optional(),//分享信息（可选）
            title: z.string(),//会话标题
            version: z.string(),//数据结构版本号
            time: z.object({
                created: z.number(),
                updated: z.number(),
                compacting: z.number().optional(),//压缩时间（可选）
                archived: z.number().optional(),//归档时间（可选）
            }),//时间戳记录
            ///permission: PermissionNext.Ruleset.optional(),//访问权限规则集（可选）
            revert: z
                .object({
                    messageID: z.string(),//关联消息ID
                    partID: z.string().optional(),//部分回滚标识（可选）
                    snapshot: z.string().optional(),//目标快照标识（可选）
                    diff: z.string().optional(),//差异标识（可选）
                })
                .optional(),//回滚操作信息（可选）
        })
        .meta({
            ref: "Session",
        })
    export type Info = z.output<typeof Info>

    export const ShareInfo = z
        .object({
            secret: z.string(),
            url: z.string(),
        })
        .meta({
            ref: "SessionShare",
        })
    export type ShareInfo = z.output<typeof ShareInfo>


    //Session 事件
    export const Event = {
        Created: BusEvent.define(
            "session.created",
            z.object({
                info: Info,
            }),
        ),
        Updated: BusEvent.define(
            "session.updated",
            z.object({
                info: Info,
            }),
        ),
        Deleted: BusEvent.define(
            "session.deleted",
            z.object({
                info: Info,
            }),
        ),
        Diff: BusEvent.define(
            "session.diff",
            z.object({
                sessionID: z.string(),
                diff: Snapshot.FileDiff.array(),
            }),
        ),
        Error: BusEvent.define(
            "session.error",
            z.object({
                sessionID: z.string().optional(),
                error: Message.Assistant.shape.error,
            }),
        ),
    }

    //公共API，用户调用,默认当前的工作目录
    // export const  create  = fn(
    //     z.object({
    //         parentID:
    //     })
    // )

    //创建新的Session
    export async function createSession(
        input: {
            //id?: string
            //title?: string
            //parentID?: string
            directory: string
            projectID:string
            //permission?: PermissionNext.Ruleset
        }
    ):Promise<Info> {
        const result: Info = {
            id: Identifier.descending("session"),
            slug: Slug.create(),//随机组合一个“形容词”和一个“名词”来创建一个可读性很强的字符串。
            projectID: input.projectID,
            directory: input.directory,
            title: "测试名称",
            version: Installation.VERSION,
            time: {
                created: Date.now(),
                updated: Date.now(),
            },
        }
        //log.info("create", result)

        

        await Storage.write(["session", Instance.project.id, result.id], result)

        Bus.publish(Event.Created, {
            info: result,
        })

        Bus.publish(Event.Updated, {
            info: result,
        })

        return result;
    }

    //删除Session

    //获取Session下所有的Messages

    //通过ID获得Session（读盘获取记录）
    export const get = fn(Identifier.schema("session"), async (id) => {
        const read = await Storage.read<Info>(["session", Instance.project.id, id])
        return read as Info
    })


    export const updateMessage = fn(Message.Info,async (msg)=>{
        
    })

    


}