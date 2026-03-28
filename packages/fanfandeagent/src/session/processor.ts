import * as Provider from "#provider/provider.ts";
import * as  Log from "#util/log.ts"
import * as LLM from '#session/llm.ts';
import * as Message from "#session/message.ts"
import * as  Identifier from "#id/id.ts";
import { ZodDate } from "zod";
import { matchedRoutes } from "hono/route";
import * as Session from "#session/session.ts"

const log = Log.create({ service: "session.processor" })

/**创建一个
 * 
 * @param input 
 * @returns 
 */
export function create(input: {
    Assistant: Message.Assistant
    //abort: AbortSignal
}) {
    const toolcalls: Record<string, Message.ToolPart> = {}
    let snapshot: string | undefined
    let blocked = false
    let attempt = 0
    let needsCompaction = false

    const result = {
        get message() {
            return input.Assistant
        },
        partFromToolCall(toolCallID: string) {
            return toolcalls[toolCallID]
        },
        async process(streamInput: LLM.StreamInput) {
            while (true) {
                try {
                    const stream = await LLM.stream(streamInput)
                     let currentText: Message.TextPart | undefined = undefined
                     //某些模型（如 Claude、Gemini）支持多个并行推理链或嵌套推理
                     let reasoningMap: Record<string, Message.ReasoningPart> = {}
                     let toolcalls: Record<string, Message.ToolPart> = {}
                      for await (const value of stream.fullStream) {
                         switch (value.type) {
                            case "text-start":
                                currentText = {
                                    id: Identifier.ascending("part"),
                                    sessionid: input.Assistant.sessionID,
                                    messageid: input.Assistant.id,
                                    type: "text",
                                    text: "",
                                    time: {
                                        start: Date.now(),
                                    },
                                    metadata: value.providerMetadata,
                                }
                                process.stdout.write("text-start:")
                                break;
                            case "text-end":
                                if (currentText) {
                                    currentText.text = currentText.text.trimEnd()
                                    if (currentText.time)
                                        currentText.time.end = Date.now()
                                    if (value.providerMetadata)
                                        currentText.metadata = value.providerMetadata
                                    //将part写入存储
                                    Session.DataBaseCreate("parts", currentText)
                                    process.stdout.write("\n")

                                }
                                break;
                            case 'text-delta':
                                if (currentText) {
                                    currentText.text += value.text
                                    if (value.providerMetadata)
                                        currentText.metadata = value.providerMetadata

                                    process.stdout.write(value.text)
                                }
                                break;
                            case "reasoning-start":
                                if (value.id in reasoningMap)
                                    continue

                                const reasoningPart: Message.ReasoningPart = {
                                    id: Identifier.ascending("part"),
                                    sessionid: input.Assistant.sessionID,
                                    messageid: input.Assistant.id,
                                    type: "reasoning",
                                    text: "",
                                    time: { start: Date.now() },
                                    metadata: value.providerMetadata,
                                }
                                reasoningMap[value.id] = reasoningPart

                                process.stdout.write("reasoning start")

                                break;
                            case "reasoning-end":
                                if (value.id in reasoningMap) {
                                    const part = reasoningMap[value.id]
                                    if (part) {
                                        part!.text = part!.text.trimEnd()

                                        part!.time = {
                                            ...part!.time,
                                            end: Date.now(),
                                        }
                                        if (value.providerMetadata) part!.metadata = value.providerMetadata

                                        Session.DataBaseCreate("parts", part)
                                        delete reasoningMap[value.id]//已经存盘，内存可以删除了
                                    }
                                }
                                process.stdout.write("\n")
                                break;
                            case "reasoning-delta":
                                if (value.id in reasoningMap) {
                                    const part = reasoningMap[value.id]
                                    part!.text += value.text
                                    if (value.providerMetadata) part!.metadata = value.providerMetadata
                                    process.stdout.write(value.text)
                                }
                                break

                            case "tool-input-start":
                                const part: Message.ToolPart = {
                                    id: Identifier.ascending("part"),
                                    sessionid: input.Assistant.sessionID,
                                    messageid: input.Assistant.id,
                                    type: "tool",
                                    callID: value.id,
                                    tool: value.toolName,
                                    state: {
                                        status: "pending",
                                        input: {},
                                        raw: "",
                                    },
                                    metadata: value.providerMetadata,
                                }
                                toolcalls[value.id] = part

                                await Session.updatePart(part)

                                break;
                            case "tool-input-end":
                                break;
                            case "tool-input-delta":
                                if (value.id in toolcalls) {
                                    if (Message.ToolStatePending.safeParse(toolcalls[value.id]?.state))
                                        (toolcalls[value.id]?.state as Message.ToolStatePending).raw += value.delta
                                }
                                break;
                            case "source":
                                break;
                            case "file":
                                break;
                            case 'tool-call':
                                // value.toolCallId 工具调用ID
                                // value.toolName 工具名称
                                // value.args 工具参数
                                const match = toolcalls[value.toolCallId]
                                if (match) {
                                    //更新工具调用状态到“运行中”
                                    const part: Message.ToolPart = {
                                        ...match,
                                        tool: value.toolName,
                                        state: {
                                            status: "running",
                                            input: value.input,
                                            time: { start: Date.now() }
                                        },
                                        metadata: value.providerMetadata,
                                    }

                                    toolcalls[value.toolCallId] = part as Message.ToolPart
                                }
                                break;
                            case 'tool-result':
                                if (toolcalls[value.toolCallId] && toolcalls[value.toolCallId]?.state.status === "running") {
                                    const match: Message.ToolPart = {
                                        ...toolcalls[value.toolCallId]!,
                                        state: {
                                            status: "completed",
                                            input: value.input,
                                            output: value.output,
                                            metadata: value.output.metadata,
                                            title: value.output.title,
                                            time: {
                                                start: (toolcalls[value.toolCallId]!.state as Message.ToolStateRunning).time.start,
                                                end: Date.now(),
                                            },
                                            attachments: value.output.attachments,
                                        },
                                    }

                                    toolcalls[value.toolCallId] = match
                                }
                                break;

                            case "tool-error":
                                break;
                            case "tool-output-denied":
                                break;
                            case "start-step":
                                break;
                            case "start":
                                //SessionStatus.set(input.sessionID, { type: "busy" })
                                //console.log(value)
                                break;
                             case 'finish':

                                 // 处理完成事件
                                 // value.finishReason 完成原因
                                 // value.usage 使用统计（token数量等）
                                 // TODO: 更新消息的完成状态和时间
                                 // TODO: 记录使用统计和计费信息
                                 // TODO: 发送完成事件通知 UI
                                 // TODO: 可能需要触发消息压缩（compaction）
                                 this.message.finish = value.finishReason
                                 break;
                            case "abort":

                                break;
                            case "raw":
                                break;
                             case 'error':
                                 // 处理错误事件
                                 // value.error 错误信息
                                 // TODO: 记录错误到消息的 error 字段
                                 // TODO: 更新数据库中的错误状态
                                 // TODO: 根据错误类型决定是否重试（增加 attempt）
                                 // TODO: 发送错误事件通知 UI
                                 console.log("processor: error event received:", value.error)
                                 log.error("stream error", { error: value.error })
                                 break;
                            case "finish-step":
                                //接收到这个value，说明LLM判断结束React loop
                                console.log(value.finishReason)
                                this.message.finish = value.finishReason


                                break;
                            case "tool-approval-request":
                                break;
                            default:
                                // 处理未知事件类型
                                log.warn(`Unknown stream value type: ${(value as any).type}`);
                                break;
                       }
                      }
                  }
                  catch  (e: any){
                      log.error("processor failure", { error: e.message, stack: e.stack })
                      throw e  // 重新抛出错误
                  }
                if (needsCompaction) return "compact"
                if (blocked) return "stop"
                if (input.Assistant.error) return "stop"
                return "continue"
            }
        }
    }
    return result
}


