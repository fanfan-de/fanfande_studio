import { Instance } from "#project/instance.ts";
import * as Log from "#util/log.ts";
import * as Message from "./message"
import z from "zod";
import * as Identifier from "#id/id.ts";
import { fn } from "#util/fn.ts";
import * as Status from "#session/status.ts"
import * as Session from "#session/session.ts"
import * as Processor from "#session/processor.ts"
//import { Provider } from "#config/config.ts";
import * as Provider from "#provider/provider.ts"
import * as  db from "#database/Sqlite.ts";
import * as Agent from "#agent/agent.ts"
import { resolveTools } from "./resolve-tools.ts"



const log = Log.create({ service: "session.prompt" })

//每个项目实例拥有独立的Session State状态隔离，注意，这里是运行时的状态，不是所有的历史session
//仅仅是当前正在运行的session
export const state = Instance.state(
    () => {
        //每一个会话对应一个条目，表示正在执行session循环
        const data: Record<
            string,//sessionID
            {
                abort: AbortController//AbortController 对象 - 用于发出取消信号
                callbacks: {
                    resolve(input: Message.WithParts): void
                    reject(): void
                }[]
            }//
        > = {}
        return data
    },
)

//#region Types & Interfaces
export const PromptInput = z.object({
    sessionID: Identifier.schema("session"),
    //messageID: Identifier.schema("message").optional(),
    model: z
        .object({
            providerID: z.string(),
            modelID: z.string(),
        })
        .optional(),
    agent: z.string().optional(),
    noReply: z.boolean().optional(),
    system: z.string().optional(),
    variant: z.string().optional(),
    parts: z.array(
        z.discriminatedUnion("type", [
            Message.TextPart.omit({
                messageID: true,
                sessionID: true,
            })
                .partial({
                    id: true,
                })
                .meta({
                    ref: "TextPartInput",
                }),
            Message.FilePart.omit({
                messageID: true,
                sessionID: true,
            })
                .partial({
                    id: true,
                })
                .meta({
                    ref: "FilePartInput",
                }),
            Message.AgentPart.omit({
                messageID: true,
                sessionID: true,
            })
                .partial({
                    id: true,
                })
                .meta({
                    ref: "AgentPartInput",
                }),
            Message.SubtaskPart.omit({
                messageID: true,
                sessionID: true,
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

export function cancel(sessionID: string) {
    const s = state()
    const running = s[sessionID]
    if (!running) return false
    running.abort.abort()
    delete s[sessionID]
    return true
}
//#endregion


// #region Exports
// #endregion


//将prompt loop的入口
export const prompt = fn(PromptInput, async (input) => {
    //获取session,先有session，再有prompt流程
    const session = Session.DataBaseRead("sessions", input.sessionID)
    //清理revert历史
    //创建 usermessage
    const { messageinfo, parts, } = await createUserMessage(input)
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
    const abort = start(sessionID)
    if (!abort) {
        //创建失败，说明当前
        //return new Promise<Message.WithParts>((resolve, reject)=>{
        //    resolve(null)
        //})
    }

    //using _ = defer(() => cancel(sessionID))

    let step = 0
    const session = Session.DataBaseRead("sessions", input.sessionID)    //执行一次prompt

    let currentAssistant: Message.Assistant | undefined

    while (true) {
        if (abort?.aborted) throw new Error("Prompt aborted")
        Status.set(sessionID, { type: "busy" })
        //log.info("loop", { step, sessionID })
        //if (abort.aborted) break
        //历史消息

        //获取当前会话所需的最新的记忆
        let msginfos: Message.MessageInfo[] = db.findManyWithSchema("messages", Message.MessageInfo, {
            where: [{ column: "sessionID", value: sessionID }],
            orderBy: [{ column: "created", direction: "ASC" }]
        })


        let msgs: Message.WithParts[]

        //遍历msgs，根据每个message的id，从database中的parts表中找到所有的匹配的parts，然后和这个message组合成 withparts组合对象，

        // 查询当前session的所有parts
        const allParts = db.findManyWithSchema("parts", Message.Part, {
            where: [{ column: "sessionID", value: sessionID }],
            orderBy: [{ column: "id", direction: "ASC" }]
        });

        // 按messageID分组
        const partsByMessageId = new Map<string, Message.Part[]>();
        for (const part of allParts) {
            const list = partsByMessageId.get(part.messageID) || [];
            list.push(part);
            partsByMessageId.set(part.messageID, list);
        }

        // 构建withparts数组
        msgs = msginfos.map(msginfo => ({
            info: msginfo,
            parts: partsByMessageId.get(msginfo.id) || []
        }));


        let lastUser: Message.User | undefined //最后一个用户消息
        let lastAssistant: Message.Assistant | undefined//最后一个assistant消息
        let lastFinished: Message.Assistant | undefined//最后一个已完成的assistant消息
        let tasks: (Message.CompactionPart | Message.SubtaskPart)[] = []// 收集未完成状态下的压缩任务和子任务

        for (let i = msgs.length - 1; i >= 0; i--) {
            const msg = msgs[i]!
            if (!lastUser && msg.info.role === "user") lastUser = msg.info as Message.User
            if (!lastAssistant && msg.info.role === "assistant") lastAssistant = msg.info as Message.Assistant
            if (!lastFinished && msg.info.role === "assistant" && msg.info.finishReason)
                lastFinished = msg.info as Message.Assistant
            if (lastUser && lastFinished) break
            const task = msg.parts.filter((part) => part.type === "compaction" || part.type === "subtask")
            if (task && !lastFinished) {
                tasks.push(...task)
            }
        }

        if (!lastUser) throw new Error("No user message found in stream. This should never happen.")

        if (
            lastAssistant?.finishReason &&
            !["tool-calls", "unknown"].includes(lastAssistant.finishReason) &&
            lastUser.id < lastAssistant.id
        ) {
            log.info("exiting loop", { sessionID })
            break
        }

        step++
        if (step === 1) {
            //生成标题，先不做
        }

        //获取模型参数
        const model = await Provider.getModel(lastUser.model.providerID, lastUser.model.modelID)

        //pending subtask

        //pending compaction


        const assistantMessage: Message.Assistant = {
            id: Identifier.ascending("message"),
            sessionID: sessionID,
            role: "assistant",
            created: Date.now(),
            parentID: "",
            modelID: model.id,
            providerID: model.providerID,
            agent: lastUser.agent,
            path: {
                cwd: Instance.directory,
                root: Instance.worktree
            },
            cost: 0,
            tokens: {
                input: 0,
                output: 0,
                reasoning: 0,
                cache: {
                    read: 0,
                    write: 0
                }
            }
        }
        currentAssistant = assistantMessage

        const tools = await resolveTools({
            agent: Agent.planAgent,
            sessionID,
            messageID: assistantMessage.id,
            abort: abort!,
        })

        const processor = Processor.create({
            Assistant: assistantMessage
            //abort,
        })
        const result = await processor.process({
            user: lastUser,
            sessionID: sessionID,
            messageID: assistantMessage.id,
            model,
            agent: Agent.planAgent,
            system: ["你是一个助手"],
            abort: abort!,
            messages: [
                ...Message.toModelMessages(msgs, model)
            ],
            //small?: boolean,
            tools,
            //retries?: number,
        })

        Session.DataBaseCreate("messages", assistantMessage)

        const modelFinished = processor.message.finishReason

        
        if (modelFinished && !["tool-calls", "unknown"].includes(modelFinished)) {
            console.log("modelFinish: " + modelFinished)
            break
        }

        if (result === "stop") break

        // if (result === "compact") {
        //     await SessionCompaction.create({
        //         sessionID,
        //         agent: lastUser.agent,
        //         model: lastUser.model,
        //         auto: true,
        //         overflow: !processor.message.finishReason,
        //     })
        // }
        continue
    }


    if (!currentAssistant) throw new Error("No assistant message was created.")

    const running = state()
    delete running[sessionID]

    const parts = db.findManyWithSchema("parts", Message.Part, {
        where: [{ column: "messageID", value: currentAssistant.id }],
        orderBy: [{ column: "id", direction: "ASC" }],
    })

    return {
        info: currentAssistant,
        parts,
    }

    for await (const item of Message.stream(sessionID)) {
        if (item.info.role === "user") continue
        //   const queued = state()[sessionID]?.callbacks ?? []
        //   for (const q of queued) {
        //     q.resolve(item)
        //   }
        //返回第一个"Assiatant"信息
        return item
    }

    throw new Error("Impossible")

})


//构建 user 以及对应的part，每次用户输入的prompt，构建成message存入database
async function createUserMessage(input: PromptInput) {
    //解析agent
    const agent = {}

    //解析model
    const model = {}

    //解析Varient

    const variant = {}

    //构建MessageInfo
    const messageinfo: Message.User = {
        id: Identifier.ascending("message"),
        sessionID: input.sessionID,
        role: "user",
        created: Date.now(),
        agent: input.agent ?? "plan",
        model: input.model ?? await Provider.getDefaultModelRef(),
        system: input.system,
    }


    //遍历input.parts,todo
    const parts = await Promise.all(
        input.parts.map(async (part): Promise<Message.Part> => {
            if (part.type === "file")
                return {
                    id: Identifier.ascending("part"),
                    messageID: messageinfo.id,
                    sessionID: input.sessionID,
                    ...part
                } as Message.FilePart
            if (part.type === "agent")
                return {
                    id: Identifier.ascending("part"),
                    messageID: messageinfo.id,
                    sessionID: input.sessionID,
                    ...part
                } as Message.AgentPart
            if (part.type === "text")
                return {
                    id: Identifier.ascending("part"),
                    messageID: messageinfo.id,
                    sessionID: input.sessionID,
                    ...part
                } as Message.TextPart
            if (part.type === "subtask")
                return {
                    id: Identifier.ascending("part"),
                    messageID: messageinfo.id,
                    sessionID: input.sessionID,
                    ...part
                } as Message.SubtaskPart

            return {
                id: Identifier.ascending("part"),
                messageID: messageinfo.id,
                sessionID: input.sessionID,
            } as Message.Part
        }
        ))


    const parsemessageinfo = Message.User.safeParse(messageinfo)
    if (!parsemessageinfo.success) {
        // log.error("invalid user message before save", {
        //     sessionID: input.sessionID,
        //     messageID: parsemessageinfo.id,
        //     agent: parsemessageinfo.agent,
        //     model: parsemessageinfo.model,
        //     issues: parsemessageinfo.error.issues,
        // })
    }
    else

        //db 写入message
        Session.DataBaseCreate("messages", messageinfo)




    //检查
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
        Session.DataBaseCreate("parts", part)
    }



    return {
        messageinfo,
        parts,
    }







}

//构建工具参数
// export async function resolveTools(input: {
//     agent: AgentInfo
//     model: Provider.Model
//     session: Session.SessionInfo
//     tools?: Record<string, boolean>
//     processor: Awaited<ReturnType<typeof Processor.create>>
//     bypassAgentCheck: boolean
//     messages: Message.WithParts[]
// }) {
//     using _ = log.time("resolveTools")
//     const tools: Record<string, AITool> = {}

//     // const context = (args: any, options: ToolCallOptions): Tool.Context => ({
//     //     sessionID: input.session.id,
//     //     abort: options.abortSignal!,
//     //     messageID: input.processor.message.id,
//     //     callID: options.toolCallId,
//     //     extra: { model: input.model, bypassAgentCheck: input.bypassAgentCheck },
//     //     agent: input.agent.name,
//     //     messages: input.messages,
//     //     metadata: async (val: { title?: string; metadata?: any }) => {
//     //         const match = input.processor.partFromToolCall(options.toolCallId)
//     //         if (match && match.state.status === "running") {
//     //             await Session.updatePart({
//     //                 ...match,
//     //                 state: {
//     //                     title: val.title,
//     //                     metadata: val.metadata,
//     //                     status: "running",
//     //                     input: args,
//     //                     time: {
//     //                         start: Date.now(),
//     //                     },
//     //                 },
//     //             })
//     //         }
//     //     },
//     //     async ask(req) {
//     //         await Permission.ask({
//     //             ...req,
//     //             sessionID: input.session.id,
//     //             tool: { messageID: input.processor.message.id, callID: options.toolCallId },
//     //             ruleset: Permission.merge(input.agent.permission, input.session.permission ?? []),
//     //         })
//     //     },
//     // })

//     for (const item of await ToolRegistry.tools(
//         { modelID: ModelID.make(input.model.api.id), providerID: input.model.providerID },
//         input.agent,
//     )) {
//         const schema = ProviderTransform.schema(input.model, z.toJSONSchema(item.parameters))
//         tools[item.id] = tool({
//             id: item.id as any,
//             description: item.description,
//             inputSchema: jsonSchema(schema as any),
//             async execute(args, options) {
//                 const ctx = context(args, options)
//                 await Plugin.trigger(
//                     "tool.execute.before",
//                     {
//                         tool: item.id,
//                         sessionID: ctx.sessionID,
//                         callID: ctx.callID,
//                     },
//                     {
//                         args,
//                     },
//                 )
//                 const result = await item.execute(args, ctx)
//                 const output = {
//                     ...result,
//                     attachments: result.attachments?.map((attachment) => ({
//                         ...attachment,
//                         id: PartID.ascending(),
//                         sessionID: ctx.sessionID,
//                         messageID: input.processor.message.id,
//                     })),
//                 }
//                 await Plugin.trigger(
//                     "tool.execute.after",
//                     {
//                         tool: item.id,
//                         sessionID: ctx.sessionID,
//                         callID: ctx.callID,
//                         args,
//                     },
//                     output,
//                 )
//                 return output
//             },
//         })
//     }

//     for (const [key, item] of Object.entries(await MCP.tools())) {
//         const execute = item.execute
//         if (!execute) continue

//         const transformed = ProviderTransform.schema(input.model, asSchema(item.inputSchema).jsonSchema)
//         item.inputSchema = jsonSchema(transformed)
//         // Wrap execute to add plugin hooks and format output
//         item.execute = async (args, opts) => {
//             const ctx = context(args, opts)

//             await Plugin.trigger(
//                 "tool.execute.before",
//                 {
//                     tool: key,
//                     sessionID: ctx.sessionID,
//                     callID: opts.toolCallId,
//                 },
//                 {
//                     args,
//                 },
//             )

//             await ctx.ask({
//                 permission: key,
//                 metadata: {},
//                 patterns: ["*"],
//                 always: ["*"],
//             })

//             const result = await execute(args, opts)

//             await Plugin.trigger(
//                 "tool.execute.after",
//                 {
//                     tool: key,
//                     sessionID: ctx.sessionID,
//                     callID: opts.toolCallId,
//                     args,
//                 },
//                 result,
//             )

//             const textParts: string[] = []
//             const attachments: Omit<MessageV2.FilePart, "id" | "sessionID" | "messageID">[] = []

//             for (const contentItem of result.content) {
//                 if (contentItem.type === "text") {
//                     textParts.push(contentItem.text)
//                 } else if (contentItem.type === "image") {
//                     attachments.push({
//                         type: "file",
//                         mime: contentItem.mimeType,
//                         url: `data:${contentItem.mimeType};base64,${contentItem.data}`,
//                     })
//                 } else if (contentItem.type === "resource") {
//                     const { resource } = contentItem
//                     if (resource.text) {
//                         textParts.push(resource.text)
//                     }
//                     if (resource.blob) {
//                         attachments.push({
//                             type: "file",
//                             mime: resource.mimeType ?? "application/octet-stream",
//                             url: `data:${resource.mimeType ?? "application/octet-stream"};base64,${resource.blob}`,
//                             filename: resource.uri,
//                         })
//                     }
//                 }
//             }

//             const truncated = await Truncate.output(textParts.join("\n\n"), {}, input.agent)
//             const metadata = {
//                 ...(result.metadata ?? {}),
//                 truncated: truncated.truncated,
//                 ...(truncated.truncated && { outputPath: truncated.outputPath }),
//             }

//             return {
//                 title: "",
//                 metadata,
//                 output: truncated.content,
//                 attachments: attachments.map((attachment) => ({
//                     ...attachment,
//                     id: PartID.ascending(),
//                     sessionID: ctx.sessionID,
//                     messageID: input.processor.message.id,
//                 })),
//                 content: result.content, // directly return content to preserve ordering when outputting to model
//             }
//         }
//         tools[key] = item
//     }

//     return tools
// }



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



