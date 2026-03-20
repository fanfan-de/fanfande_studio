
/**
 * @file UserService.ts
 * @description 用户相关的核心业务逻辑，包括注册、登录、权限校验。
 *              该服务作为 Controller 与 Repository 之间的中间层。
 * @module user
 * @depends AuthProvider, DatabaseClient, Logger
 * @exports createUser, loginUser, validateToken, UserVO, CreateUserDTO
 */
import { Instance } from "#project/instance.ts";
import * as Log from "#util/log.ts";
import * as Message from "./message"
import z from "zod";
import * as Identifier from "#id/id.ts";
import { fn } from "#util/fn.ts";
import * as Status from "#session/status.ts"
import * as Session from "#session/session.ts"
import { CONNREFUSED } from "node:dns";


const log = Log.create({ service: "session.engine" })

//每个项目实例拥有独立的Session State状态隔离，注意，这里是运行时的状态，不是所有的历史session
//仅仅是当前正在运行的session
export const state = Instance.state(
    () => {
        //每一个会话对应一个条目，表示正在执行loop循环
        const data: Record<
            string,
            {
                abort: AbortController
                callbacks: {
                    resolve(input: Message.WithParts): void
                    reject(): void
                }[]
            }
        > = {}
        return data
    },
)

//#region Types & Interfaces
export const PromptInput = z.object({
    sessionID: Identifier.schema("session"),
    messageID: Identifier.schema("message").optional(),
    model: z
        .object({
            providerID: z.string(),
            modelID: z.string(),
        })
        .optional(),
    agent: z.string().optional(),
    noReply: z.boolean().optional(),
    tools: z
        .record(z.string(), z.boolean())
        .optional()
        .describe(
            "@deprecated tools and permissions have been merged, you can set permissions on the session itself now",
        ),
    system: z.string().optional(),
    variant: z.string().optional(),
    parts: z.array(
        z.discriminatedUnion("type", [
            Message.TextPart.omit({
                messageid: true,
                sessionid: true,
            })
                .partial({
                    id: true,
                })
                .meta({
                    ref: "TextPartInput",
                }),
            Message.FilePart.omit({
                messageid: true,
                sessionid: true,
            })
                .partial({
                    id: true,
                })
                .meta({
                    ref: "FilePartInput",
                }),
            Message.AgentPart.omit({
                messageid: true,
                sessionid: true,
            })
                .partial({
                    id: true,
                })
                .meta({
                    ref: "AgentPartInput",
                }),
            Message.SubtaskPart.omit({
                messageid: true,
                sessionid: true,
            })
                .partial({
                    id: true,
                })
                .meta({
                    ref: "SubtaskPartInput",
                }),
        ]),
    ),
})
export type PromptInput = z.infer<typeof PromptInput>



//#endregion

// #region Internal Helpers (private)
function start(sessionID: string): AbortSignal | undefined {
    const s = state()
    if (s[sessionID]) return
    const controller = new AbortController()
    s[sessionID] = {
        abort: controller,
        callbacks: [],
    }
    return controller.signal
}
//#endregion


// #region Exports
// #endregion


//将prompt推入engine的入口
const prompt = fn(PromptInput, async (input) => {

    //获取session
    const session = Session.getSession({
        id: input.sessionID
    })

    //清理revert历史

    //创建 usermessage
    const usermessage = createUserMessage(input)
    //session.touch

    //input.tool 权限设置

    //input.noreply

    //在这之前，相当于准备完毕本地的数据，接下来，只需要一个sessonid即可开始循环
    return loop({ sessionID: input.sessionID })
})



export const LoopInput = z.object({
    sessionID: Identifier.schema("session"),
    resume_existing: z.boolean().optional(),
})

//一个sessionloop的状态机方法
const loop = fn(LoopInput, async (input) => {
    const { sessionID, resume_existing } = input

    //resume and start
    //尝试创建打断
    const abort =start(sessionID)
    if(!abort){
        //创建失败，说明当前
        return new Promise<Message.WithParts>((resolve, reject)=>{
            resolve(null)
        })
    }

    let step = 0

    while (true) {
        Status.set(sessionID, { type: "busy" })
    }
})


//构建 user message
async function createUserMessage(input: PromptInput) {
    //解析agent
    const agent = {}

    //解析model
    const model = {}

    //解析Varient

    const variant = {}

    //构建MessageInfo
    const messageinfo: Message.MessageInfo = {
        id: input.messageID ?? Identifier.ascending("message"),
        sessionID: input.sessionID,
        role: "user",
        created: Date.now(),
        tools: input.tools,
        agent: agent.name,
        model,
        system: input.system,
        format: input.format,
        variant,
    }

    //遍历input.parts,todo
    const parts = await Promise.all(
        input.parts.map(async (part): Promise<Message.Part> => {
            if (part.type === "file")
                return null
            if (part.type === "agent")
                return null
            if (part.type === "text")
                return null
            if (part.type === "subtask")
                return null
            return null
        }
        ),
    )


    const parsemessageinfo = Message.MessageInfo.safeParse(messageinfo)
    if (!parsemessageinfo.success) {
        log.error("invalid user message before save", {
            sessionID: input.sessionID,
            messageID: parsemessageinfo.id,
            agent: parsemessageinfo.agent,
            model: parsemessageinfo.model,
            issues: parsemessageinfo.error.issues,
        })
    }
    else
        //db 写入message
        Session.DataBaseCreate("messages", messageinfo)


    parts.forEach(
        (part, index) => {
            const parsedPart = Message.Part.safeParse(part)

            if (parsedPart.success) return
            log.error("invalid user part before save", {
                sessionID: input.sessionID,
                messageID: messageinfo.id,
                partID: part.id,
                partType: part.type,
                index,
                issues: parsedPart.error.issues,
                part,
            })
        }
    )

    for (const part of parts) {
        await Session.DataBaseCreate("parts", part)
    }



    return {
        messageinfo,
        parts,
    }







}






//#region  command
// 2. command 方法：结构化操作的门面模式
// 设计目的：为重复性、标准化的操作提供参数化、可复用的封装，降低用户认知负荷。
// 关键设计决策：
// - 模板驱动：支持 $1、$ARGUMENTS 占位符，实现命令参数化
// - 智能委派：根据命令配置自动决定是否转为子任务（subtask 机制）
// - 预处理管道：支持内联 shell 执行（!\`...\``），在 AI 介入前完成必要的数据准备
// - 事件驱动：发布 Command.Event.Executed 事件，支持系统其他部分的响应
// 解决的核心问题：用户经常需要执行“运行测试”、“部署到生产”等标准化操作，这些操作有固定模式但需要参数化。通过 command 抽象，用户无需每次都描述完整的工作流程。



//#endregion


//#region  shell  指令输入，不经过LLM

//#endregion



export {
    prompt,

}


