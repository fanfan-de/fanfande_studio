import { Log } from "@/util/log"
import type { Message } from "./message/message"

//接收 LLM 的流式输出（Stream），
// 将其解析为结构化的消息组件（Parts），
// 并实时更新数据库和状态，同时处理工具调用、错误重试、文件系统快照和计费统计
export namespace SessionProcessor {
    const log = Log.create({service:"session.processor"})

    export function create(input:{
        LLMMessageMeta: Message.Meta_LLMMessage,
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
                return input.LLMMessageMeta
            },
            partFromToolCall(toolCallID: string) {
                return toolcalls[toolCallID]
            },
            

        }
    }
}