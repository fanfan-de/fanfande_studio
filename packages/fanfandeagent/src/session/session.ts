import { Log } from "#util/log.ts"
import z from "zod"
import { Identifier } from "#id/id.ts"
import { Snapshot } from "#snapshot/index.ts"
import { Bus } from "#bus/index.ts"
import { BusEvent } from "#bus/bus-event.ts"
import { Message } from "#session/message.ts"
import { Instance } from "#project/instance.ts"
import { Slug } from "@/util/slug"
import { Installation } from "#installation/index.ts"
import { fn } from "#util/fn.ts"
import {
    db,
    createTableByZodDiscriminatedUnion, tableExists,
    insertOne, createTableByZodObject, toSQLiteValue,
    findOne, findById, fromSQLiteRecord
} from "#database/Sqlite.ts"
import { zodObjectToColumnDefs, toCreateTableSQL, } from "#database/parser.ts"
import type { Project } from "#project/project.ts"



const log = Log.create({ service: "session" })
const parentTiTlePrefix = "新对话"
const childTiltePrefic = "子对话"

//#region Type & Interface
// 定义映射关系
interface TableRecordMap {
    projects: Project.Info;
    sessions: Info;
    messages: Message.Info;
    parts: Message.Part;
}
// 从映射中派生出联合类型
type TableName = keyof TableRecordMap;
// 等价于 "projects" | "sessions" | "messages" | "parts"
type TableRecord = TableRecordMap[TableName];
// 等价于 Project.Info | Info | Message.Info | Message.Part

export const Info = z
    .object({
        id: Identifier.schema("session"),//会话唯一标识符 ("session" 类型)
        slug: z.string().optional(),//简短标识符（用于 URL/显示）
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
//#endregion


//#region Modula Initialize----------------------------------------
//建表操作
if (!tableExists("sessions")) {
    createTableByZodObject("sessions", Info)
}
if (!tableExists("messages")) {
    createTableByZodDiscriminatedUnion("messages", Message.Info)
}
if (!tableExists("parts")) {
    createTableByZodDiscriminatedUnion("parts", Message.Part)
}
//#endregion

// database CRUD
/**
 * 四种数据(project,session,message,part)的数据库crud操作
 * @param tableName 
 * @param tableRecord 对应表的record
 */
function Create<T extends TableName>(tableName: T, tableRecord: TableRecordMap[T]): void {
    insertOne(tableName, toSQLiteValue(tableRecord))
}


export const read = fn(Identifier.schema("session"), (key) => {
    const record = findById("session", key)
    if (record != null)
        return fromSQLiteRecord(Info, record)
    else
        return null
})



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



//创建新的Session,仅仅只是在存储中创建一个记录，而不是instance.state中的session
export async function createSession(
    input: {
        //id?: string
        //title?: string
        //parentID?: string
        directory: string
        projectID: string
        //permission?: PermissionNext.Ruleset
    }
): Promise<Info> {
    const result: Info = {
        id: Identifier.descending("session"),
        //slug: Slug.create(),//随机组合一个“形容词”和一个“名词”来创建一个可读性很强的字符串。
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
    //db insert
    Create("sessions", result)

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



export const updateMessage = fn(Message.Info, async (msg) => {
    Create("messages", msg)
})

export const updatePart = fn(Message.Part, async (part) => {
    Create("parts", part)
})


