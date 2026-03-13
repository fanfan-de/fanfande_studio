import type { Provider } from "@/provider/provider";
import { Log } from "../util/log"
import { LLM } from './llm';
//import type { StreamInput } from "./llm"
import type { Message } from "./message"
import { Identifier } from "@/id/id";
import { ZodDate } from "zod";
//一次LLM调用的循环处理器
export namespace SessionProcessor {
    const log = Log.create({ service: "session.processor" })

    //创建一个处理器
    export function create(input: {
        Assistant: Message.Assistant,
        abort: AbortSignal
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
                while (true) {//重试循环

                    const stream = await LLM.stream(streamInput)

                    let currentText: Message.TextPart | undefined = undefined
                    //某些模型（如 Claude、Gemini）支持多个并行推理链或嵌套推理
                    let reasoningMap: Record<string, Message.ReasoningPart> = {}

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
                                break;
                            case "text-end":
                                if (currentText) {
                                    currentText.text = currentText.text.trimEnd()
                                    if (currentText.time)
                                        currentText.time.end = Date.now()
                                    if (value.providerMetadata)
                                        currentText.metadata = value.providerMetadata
                                    //将part写入存储
                                }
                                break;
                            case 'text-delta':
                                // 处理文本增量
                                // value.text 包含增量文本
                                // value.snapshot 包含完整文本的快照（如果可用）
                                // TODO: 更新消息的文本部分，记录增量
                                // TODO: 更新数据库中的消息状态
                                // TODO: 发送事件通知 UI 更新
                                if (currentText) {
                                    currentText.text += value.text
                                    if (value.providerMetadata)
                                        currentText.metadata = value.providerMetadata


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

                                break;
                            case "reasoning-end":
                                if (value.id in reasoningMap) {
                                    const part = reasoningMap[value.id]
                                    part!.text = part!.text.trimEnd()

                                    part!.time = {
                                        ...part!.time,
                                        end: Date.now(),
                                    }
                                    if (value.providerMetadata) part!.metadata = value.providerMetadata

                                    await Session.updatePart(part)
                                    delete reasoningMap[value.id]//已经存盘，内存可以删除了
                                }
                                break;
                            case "reasoning-delta":
                                if (value.id in reasoningMap) {
                                    const part = reasoningMap[value.id]
                                    part!.text += value.text
                                    if (value.providerMetadata) part!.metadata = value.providerMetadata
                                    await Session.updatePartDelta({
                                        sessionID: part.sessionID,
                                        messageID: part.messageID,
                                        partID: part.id,
                                        field: "text",
                                        delta: value.text,
                                    })
                                }
                                break

                            case "tool-input-start":
                                const part: Message.ToolPart = {
                                    id: Identifier.ascending("part"),
                                    sessionid: input.Assistant.sessionID,
                                    messageid: input.Assistant.id,
                                    type:"tool",
                                    callID:value.id,
                                    tool:value.toolName,
                                    state:{
                                        status:"pending",
                                        input:{},
                                        raw:"",
                                    },
                                    metadata:value.providerMetadata,
                                }
                                await Session.updatePart(part)

                                break;
                            case "tool-input-end":
                                break;
                            case "tool-input-delta":
                                break;
                            case "source":
                                break;
                            case "file":
                                break;
                            case 'tool-call':
                                // 处理工具调用
                                // value.toolCallId 工具调用ID
                                // value.toolName 工具名称
                                // value.args 工具参数
                                // TODO: 创建 ToolPart 并设置为 pending 状态
                                // TODO: 存储到 toolcalls 映射中
                                // TODO: 更新数据库中的工具调用状态
                                // TODO: 发送事件通知 UI 显示工具调用
                                break;
                            case 'tool-result':
                                // 处理工具结果
                                // value.toolCallId 工具调用ID
                                // value.toolName 工具名称
                                // value.result 工具执行结果
                                // TODO: 更新对应的 ToolPart 状态为 completed 或 error
                                // TODO: 更新数据库中的工具结果
                                // TODO: 发送事件通知 UI 更新工具状态
                                // TODO: 如果工具执行失败，可能需要重试或处理错误
                                break;
                            case "tool-error":
                                break;
                            case "tool-output-denied":
                                break;
                            case "start-step":
                                break;
                            case "start":
                                //
                                break;
                            case 'finish':
                                // 处理完成事件
                                // value.finishReason 完成原因
                                // value.usage 使用统计（token数量等）
                                // TODO: 更新消息的完成状态和时间
                                // TODO: 记录使用统计和计费信息
                                // TODO: 发送完成事件通知 UI
                                // TODO: 可能需要触发消息压缩（compaction）
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
                                break;
                            case "finish-step":
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
            }


        }
        return result
    }


}
