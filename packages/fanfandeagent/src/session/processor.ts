import * as Provider from "#provider/provider.ts";
import * as  Log from "#util/log.ts"
import * as LLM from '#session/llm.ts';
import * as Message from "#session/message.ts"
import * as  Identifier from "#id/id.ts";
import { ZodDate } from "zod";
import { matchedRoutes } from "hono/route";
import * as Session from "#session/session.ts"

const log = Log.create({ service: "session.processor" })

function normalizeToolError(error: unknown): string {
    if (error instanceof Error && error.message) {
        return error.message
    }

    if (typeof error === "string") {
        return error
    }

    try {
        const serialized = JSON.stringify(error)
        if (serialized) return serialized
    } catch {
        // ignore and fall through to String(error)
    }

    return String(error)
}

function toAttachmentPart(
    value: unknown,
    toolPart: Message.ToolPart,
): Message.FilePart | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return undefined
    }

    const candidate = value as Record<string, unknown>
    if (typeof candidate.url !== "string" || typeof candidate.mime !== "string") {
        return undefined
    }

    return {
        id: Identifier.ascending("part"),
        sessionID: toolPart.sessionID,
        messageID: toolPart.messageID,
        type: "file",
        url: candidate.url,
        mime: candidate.mime,
        filename: typeof candidate.filename === "string" ? candidate.filename : undefined,
    }
}

function extractToolResultState(
    output: unknown,
    fallbackTitle?: string,
    fallbackMetadata?: Record<string, unknown>,
    toolPart?: Message.ToolPart,
) {
    let text = Message.normalizeToolOutputText(output)
    let title = typeof fallbackTitle === "string" ? fallbackTitle : ""
    let metadata = fallbackMetadata ?? {}
    let attachments: Message.FilePart[] | undefined

    if (output && typeof output === "object" && !Array.isArray(output)) {
        const candidate = output as Record<string, unknown>

        if (typeof candidate.text === "string") {
            text = candidate.text
        }

        if (typeof candidate.title === "string") {
            title = candidate.title
        }

        if (candidate.metadata && typeof candidate.metadata === "object" && !Array.isArray(candidate.metadata)) {
            metadata = candidate.metadata as Record<string, unknown>
        }

        if (toolPart && Array.isArray(candidate.attachments)) {
            const mapped = candidate.attachments
                .map((attachment) => toAttachmentPart(attachment, toolPart))
                .filter((attachment): attachment is Message.FilePart => Boolean(attachment))

            if (mapped.length > 0) {
                attachments = mapped
            }
        }
    }

    return {
        output: text,
        title,
        metadata,
        attachments,
    }
}

/**鍒涘缓涓€涓?
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
                     //鏌愪簺妯″瀷锛堝 Claude銆丟emini锛夋敮鎸佸涓苟琛屾帹鐞嗛摼鎴栧祵濂楁帹鐞?
                     let reasoningMap: Record<string, Message.ReasoningPart> = {}
                      for await (const value of stream.fullStream) {
                         switch (value.type) {
                            case "text-start":
                                currentText = {
                                    id: Identifier.ascending("part"),
                                    sessionID: input.Assistant.sessionID,
                                    messageID: input.Assistant.id,
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
                                    //灏唒art鍐欏叆瀛樺偍
                                    await Session.updatePart(currentText)
                                    process.stdout.write("\n")

                                }
                                break;
                            case 'text-delta':
                                if (currentText) {
                                    currentText.text += value.text
                                    if (value.providerMetadata)
                                        currentText.metadata = value.providerMetadata

                                    await Session.updatePart(currentText)
                                    process.stdout.write(value.text)
                                }
                                break;
                            case "reasoning-start":
                                if (value.id in reasoningMap)
                                    continue

                                const reasoningPart: Message.ReasoningPart = {
                                    id: Identifier.ascending("part"),
                                    sessionID: input.Assistant.sessionID,
                                    messageID: input.Assistant.id,
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

                                        await Session.updatePart(part)
                                        delete reasoningMap[value.id]//宸茬粡瀛樼洏锛屽唴瀛樺彲浠ュ垹闄や簡
                                    }
                                }
                                process.stdout.write("\n")
                                break;
                            case "reasoning-delta":
                                if (value.id in reasoningMap) {
                                    const part = reasoningMap[value.id]
                                    part!.text += value.text
                                    if (value.providerMetadata) part!.metadata = value.providerMetadata
                                    await Session.updatePart(part!)
                                    process.stdout.write(value.text)
                                }
                                break

                            case "tool-input-start":
                                const part: Message.ToolPart = {
                                    id: Identifier.ascending("part"),
                                    sessionID: input.Assistant.sessionID,
                                    messageID: input.Assistant.id,
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

                                try {
                                    await Session.updatePart(part)
                                } catch (error) {
                                    console.error("failed to persist tool-input-start part", part)
                                    throw error
                                }

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
                                // value.toolCallId 宸ュ叿璋冪敤ID
                                // value.toolName 宸ュ叿鍚嶇О
                                // value.args 宸ュ叿鍙傛暟
                                const match = toolcalls[value.toolCallId]
                                if (match) {
                                    //鏇存柊宸ュ叿璋冪敤鐘舵€佸埌鈥滆繍琛屼腑鈥?
                                    const part: Message.ToolPart = {
                                        ...match,
                                        tool: value.toolName,
                                        state: {
                                            status: "running",
                                            input: value.input,
                                            title: value.title,
                                            metadata: value.providerMetadata,
                                            time: { start: Date.now() }
                                        },
                                        metadata: value.providerMetadata,
                                    }

                                    toolcalls[value.toolCallId] = part as Message.ToolPart
                                    try {
                                        await Session.updatePart(part)
                                    } catch (error) {
                                        console.error("failed to persist tool-call part", part)
                                        throw error
                                    }
                                }
                                break;
                            case 'tool-result':
                                if (toolcalls[value.toolCallId] && toolcalls[value.toolCallId]?.state.status === "running") {
                                    const normalized = extractToolResultState(
                                        value.output,
                                        value.title,
                                        value.providerMetadata ?? {},
                                        toolcalls[value.toolCallId],
                                    )
                                    const match: Message.ToolPart = {
                                        ...toolcalls[value.toolCallId]!,
                                        state: {
                                            status: "completed",
                                            input: value.input,
                                            output: normalized.output,
                                            metadata: normalized.metadata,
                                            title: normalized.title,
                                            time: {
                                                start: (toolcalls[value.toolCallId]!.state as Message.ToolStateRunning).time.start,
                                                end: Date.now(),
                                            },
                                            attachments: normalized.attachments,
                                        },
                                    }

                                    toolcalls[value.toolCallId] = match
                                    try {
                                        await Session.updatePart(match)
                                    } catch (error) {
                                        console.error("failed to persist tool-result part", match)
                                        throw error
                                    }
                                }
                                break;

                            case "tool-error":
                                if (toolcalls[value.toolCallId] && toolcalls[value.toolCallId]?.state.status === "running") {
                                    const match: Message.ToolPart = {
                                        ...toolcalls[value.toolCallId]!,
                                        state: {
                                            status: "error",
                                            input: value.input,
                                            error: normalizeToolError(value.error),
                                            metadata: value.providerMetadata ?? {},
                                            time: {
                                                start: (toolcalls[value.toolCallId]!.state as Message.ToolStateRunning).time.start,
                                                end: Date.now(),
                                            },
                                        },
                                    }

                                    toolcalls[value.toolCallId] = match
                                    try {
                                        await Session.updatePart(match)
                                    } catch (error) {
                                        console.error("failed to persist tool-error part", match)
                                        throw error
                                    }
                                }
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

                                 // 澶勭悊瀹屾垚浜嬩欢
                                 // value.finishReason 瀹屾垚鍘熷洜
                                 // value.usage 浣跨敤缁熻锛坱oken鏁伴噺绛夛級
                                 // TODO: 鏇存柊娑堟伅鐨勫畬鎴愮姸鎬佸拰鏃堕棿
                                 // TODO: 璁板綍浣跨敤缁熻鍜岃璐逛俊鎭?
                                 // TODO: 鍙戦€佸畬鎴愪簨浠堕€氱煡 UI
                                 // TODO: 鍙兘闇€瑕佽Е鍙戞秷鎭帇缂╋紙compaction锛?
                                 this.message.finishReason = value.finishReason
                                 break;
                            case "abort":

                                break;
                            case "raw":
                                break;
                             case 'error':
                                 // 澶勭悊閿欒浜嬩欢
                                 // value.error 閿欒淇℃伅
                                 // TODO: 璁板綍閿欒鍒版秷鎭殑 error 瀛楁
                                 // TODO: 鏇存柊鏁版嵁搴撲腑鐨勯敊璇姸鎬?
                                 // TODO: 鏍规嵁閿欒绫诲瀷鍐冲畾鏄惁閲嶈瘯锛堝鍔?attempt锛?
                                 // TODO: 鍙戦€侀敊璇簨浠堕€氱煡 UI
                                 console.log("processor: error event received:", value.error)
                                 log.error("stream error", { error: value.error })
                                 break;
                            case "finish-step":
                                //鎺ユ敹鍒拌繖涓獀alue锛岃鏄嶭LM鍒ゆ柇缁撴潫React loop
                                console.log(value.finishReason)
                                this.message.finishReason = value.finishReason


                                break;
                            case "tool-approval-request":
                                break;
                            default:
                                // 澶勭悊鏈煡浜嬩欢绫诲瀷
                                log.warn(`Unknown stream value type: ${(value as any).type}`);
                                break;
                       }
                      }
                  }
                  catch  (e: any){
                      log.error("processor failure", { error: e.message, stack: e.stack })
                      throw e  // 閲嶆柊鎶涘嚭閿欒
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



