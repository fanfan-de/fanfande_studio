/**
 * @MODULE: [Session - 负责Session的模块]
 * 
 * 1. 【数据形状 / Shapes】
 *    - 核心实体: [如 Order, User]
 *    - 会话生命周期: created -> updated(活跃) -> archived(归档) | deleted(删除)
 *      - 会话层级: 根会话(parentID=null) / 子会话(parentID!=null)
 *      - 分享状态: 未分享(share=undefined) -> 已分享(share.url) -> 取消分享(share=undefined)
 *      - 回退状态: 无回退点(revert=undefined) -> 设置回退点(revert={messageID, partID?, snapshot?, diff?}) -> 清除回退点
 * 
 * 2. 【变换规则 / Transforms】
 *    - 核心路径: 
 *          - 创建: create/createNext -> 构建 Info 对象(生成降序ID + slug) -> INSERT SessionTable -> 发布 Event.Created + Event.Updated -> 自动分享(若配置)
 *          - 删除: remove -> 递归删除子会话 -> unshare -> DELETE SessionTable(CASCADE 自动删除 Message/Part) -> 发布 Event.Deleted
 *    - 核心公式: [如 total = price * qty + tax - discount]
 * 
 * 3. 【驱动时序 / Timing】
 *    - 触发源: [如 用户点击 / MQ 消息 / 定时任务]
 *    - 副作用: [如 修改外部 DB / 发送 Email / 更新缓存]
 * 
 * 4. 【契约约束 / Constraints】
 *    - 禁止: [如 严禁绕过 Service 直接操作 Repo]
 *    - 必须: [如 所有金额计算必须使用 Decimal.js 以防精度丢失]
 */

import * as Log from "#util/log.ts"
import z from "zod"
import *  as  Identifier from "#id/id.ts"
import { Snapshot } from "#snapshot/index.ts"
import * as  Bus from "#bus/project-bus.ts"
import * as  BusEvent from "#bus/bus-event.ts"
import * as Message from "#session/message.ts"
import { Instance } from "#project/instance.ts"
import * as  Project from "#project/project.ts"
//import { Slug } from "#util/slug.ts"
import * as  Installation from "#installation/installation.ts"
import { fn } from "#util/fn.ts"
import * as db from "#database/Sqlite.ts"
import { zodObjectToColumnDefs, toCreateTableSQL, } from "#database/parser.ts"
import type { } from "#project/project.ts"


//#region Type & Interface
// 定义映射关系
interface TableRecordMap {
    projects: Project.ProjectInfo;
    sessions: SessionInfo;
    messages: Message.MessageInfo;
    parts: Message.Part;
}
// 从映射中派生出联合类型
type TableName = keyof TableRecordMap;
// 等价于 "projects" | "sessions" | "messages" | "parts"
type TableRecord = TableRecordMap[TableName];
// 等价于 Project.Info | Info | Message.Info | Message.Part

export const SessionInfo = z
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
export type SessionInfo = z.output<typeof SessionInfo>


const TableSchemaMap = {
    projects: Project.ProjectInfo,
    sessions: SessionInfo,
    messages: Message.MessageInfo,
    parts: Message.Part,
} as const;



//#endregion







const log = Log.create({ service: "session" })
const parentTiTlePrefix = "新对话"
const childTiltePrefic = "子对话"
//#region Modula Initialize----------------------------------------
//建表操作
if (!db.tableExists("sessions")) {
    db.createTableByZodObject("sessions", SessionInfo)
}
if (!db.tableExists("messages")) {
    db.createTableByZodDiscriminatedUnion("messages", Message.MessageInfo)
}
if (!db.tableExists("parts")) {
    db.createTableByZodDiscriminatedUnion("parts", Message.Part)
}
//#endregion

// database CRUD
/**
 * 四种数据(project,session,message,part)的数据库crud操作
 * @param tableName 
 * @param tableRecord 对应表的record
 */
function DataBaseCreate<T extends TableName>(tableName: T, tableRecord: TableRecordMap[T]): void {

    db.insertOneWithSchema(tableName, tableRecord, TableSchemaMap[tableName])
}

function DataBaseRead<T extends TableName>(tableName: T, id: string) {
    const result = db.findById(tableName, TableSchemaMap[tableName], id)
    if (TableSchemaMap[tableName].parse(result))
        return result
    else
        return null
}


// export const read = fn(Identifier.schema("session"), (key) => {
//     const record = findById("session", key)
//     if (record != null)
//         return fromSQLiteRecord(Info, record)
//     else
//         return null
// })


//session 的创建，更新，删除，diff，error事件
const Event = {
    Created: BusEvent.define(
        "session.created",
        z.object({
            info: SessionInfo,
        }),
    ),
    Updated: BusEvent.define(
        "session.updated",
        z.object({
            info: SessionInfo,
        }),
    ),
    Deleted: BusEvent.define(
        "session.deleted",
        z.object({
            info: SessionInfo,
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
async function createSession(
    input: {
        //id?: string
        //title?: string
        //parentID?: string
        directory: string
        projectID: string
        //permission?: PermissionNext.Ruleset
    }
): Promise<SessionInfo> {
    const result: SessionInfo = {
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
    log.info("create", result)
    //db insert
    DataBaseCreate("sessions", result)

    Bus.publish(Event.Created, {
        info: result,
    })

    Bus.publish(Event.Updated, {
        info: result,
    })

    return result;
}
async function getSession(input: {
    id: string
}) {
    const result = DataBaseRead("sessions", input.id)
    if (!result)
        throw new db.NotFoundError({ message: `Session not found: ${input.id}` })
    return result 
}

//删除Session

//获取Session下所有的Messages


//创建新的message
async function createMessage()

const updateMessage = fn(Message.MessageInfo, async (msg) => {
    DataBaseCreate("messages", msg)
})

const updatePart = fn(Message.Part, async (part) => {
    DataBaseCreate("parts", part)
})



export {
    Event,//session的生命周期事件
    //Session的CRUD操作
    createSession,//在本地创建session记录
    forkSession,//
    touchSession,//会话保活？

    getSession,
    share,
    unshare,

    DataBaseCreate,
    DataBaseRead,



    updateMessage,//本地创建message记录
    updatePart,//本地创建part记录


    remove,

    initialize,//会话初始化功能，用于在AI对话会话开始时建立连接并准备环境

    //session生命周期



}



