import type { Provider } from "@/provider/provider";
import { Log } from "../util/log"
import { LLM } from './llm';
//import type { StreamInput } from "./llm"
import type { Message } from "./message"
//MainLoop
//接收 LLM 的流式输出（Stream），
// 将其解析为结构化的消息组件（Parts），
// 并实时更新数据库和状态，同时处理工具调用、错误重试、文件系统快照和计费统计
export namespace SessionProcessor {
    const log = Log.create({ service: "session.processor" })

    export function create(input:{
        Assistant: Message.Assistant,
        sessionID: string,
        model: Provider.Model,
        abort:AbortSignal
    })
    {
        const toolcalls: Record<string, Message.ToolPart> = {}
        let snapshot: string | undefined
        let blocked = false
        let attempt = 0
        let needsCompaction = false


        const result = {
            get message(){
                return input.Assistant
            },
            partFromToolCall(toolCallID: string) {
                return toolcalls[toolCallID]
            },
            async process(streamInput:LLM.StreamInput){
                while(true)
                {
                    const stream = await LLM.stream(streamInput)

                    for await (const value of stream.fullStream){
                        switch(value.type)
                        {
                            case 'text-delta':
                                // 处理文本增量
                                // value.text 包含增量文本
                                // value.snapshot 包含完整文本的快照（如果可用）
                                // TODO: 更新消息的文本部分，记录增量
                                // TODO: 更新数据库中的消息状态
                                // TODO: 发送事件通知 UI 更新
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
                            case 'reasoning':
                                // 处理推理内容
                                // value.text 推理文本
                                // TODO: 创建 ReasoningPart 并添加到消息中
                                // TODO: 更新数据库中的推理部分
                                // TODO: 发送事件通知 UI 显示推理内容
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
                            case 'error':
                                // 处理错误事件
                                // value.error 错误信息
                                // TODO: 记录错误到消息的 error 字段
                                // TODO: 更新数据库中的错误状态
                                // TODO: 根据错误类型决定是否重试（增加 attempt）
                                // TODO: 发送错误事件通知 UI
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
    //一次执行
    export const process = async (streamInput: LLM.StreamInput): Promise<LLM.StreamInput>=>
    {
        log.info("process")
        while(true)
        {

        }



        return streamInput
    }

}
        return streamInput
    }

}