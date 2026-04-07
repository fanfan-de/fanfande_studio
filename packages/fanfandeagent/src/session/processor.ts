import * as Provider from "#provider/provider.ts";
import * as  Log from "#util/log.ts"
import * as LLM from '#session/llm.ts';
import * as Message from "#session/message.ts"
import * as  Identifier from "#id/id.ts";
import { Instance } from "#project/instance.ts"
import * as Permission from "#permission/permission.ts"
import { ZodDate } from "zod";
import { matchedRoutes } from "hono/route";
import * as Session from "#session/session.ts"

const log = Log.create({ service: "session.processor" })
const STREAM_PART_PERSIST_INTERVAL_MS = 100

type StreamPersistedPart = Message.TextPart | Message.ReasoningPart

function createStreamPartPersister() {
    const state = new Map<string, {
        dirty: boolean
        lastPersistedAt: number
    }>()

    async function flush(part: StreamPersistedPart) {
        const current = state.get(part.id)
        if (!current?.dirty) {
            return
        }

        await Session.updatePart(part)
        current.dirty = false
        current.lastPersistedAt = Date.now()
        state.set(part.id, current)
    }

    async function persist(part: StreamPersistedPart, force = false) {
        const current = state.get(part.id) ?? {
            dirty: false,
            lastPersistedAt: 0,
        }

        current.dirty = true
        state.set(part.id, current)

        if (!force && Date.now() - current.lastPersistedAt < STREAM_PART_PERSIST_INTERVAL_MS) {
            return
        }

        await flush(part)
    }

    function clear(partID: string) {
        state.delete(partID)
    }

    return {
        persist,
        flush,
        clear,
    }
}

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

/**
 * create a  processor（handle single LLM prompt，not loop）
 * 不仅仅是LLM端的stream输出过程，还包括工具的执行过程
 * @param input 
 * @returns 
 */
export function create(input: {
    Assistant: Message.Assistant
    abort?: AbortSignal
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
            const failOpenToolCalls = async (reason: string) => {
                const end = Date.now()

                for (const [toolCallID, current] of Object.entries(toolcalls)) {
                    if (
                        current.state.status === "completed" ||
                        current.state.status === "error" ||
                        current.state.status === "denied" ||
                        current.state.status === "waiting-approval"
                    ) {
                        continue
                    }

                    const start =
                        current.state.status === "running"
                            ? current.state.time.start
                            : end

                    const failed: Message.ToolPart = {
                        ...current,
                        state: {
                            status: "error",
                            input: current.state.input,
                            error: reason,
                            metadata:
                                current.state.status === "running"
                                    ? current.state.metadata ?? {}
                                    : current.metadata ?? {},
                            time: {
                                start,
                                end,
                            },
                        },
                    }

                    toolcalls[toolCallID] = failed
                    await Session.updatePart(failed)
                }
            }

            const listActiveToolCalls = () =>
                Object.values(toolcalls).filter(
                    (part) =>
                        part.state.status === "pending" ||
                        part.state.status === "running",
                )

            while (true) {
                try {
                    const stream = await LLM.stream(streamInput)
                    const streamPartPersister = createStreamPartPersister()
                    let currentText: Message.TextPart | undefined = undefined
                    // 某些模型（如 Claude、Gemini）支持多个并行推理链或嵌套推理，按 id 分开跟踪
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
                                    // 将 part 写入存储
                                    await streamPartPersister.persist(currentText, true)
                                    streamPartPersister.clear(currentText.id)
                                    currentText = undefined
                                    process.stdout.write("\n")

                                }
                                break;
                            case 'text-delta':
                                if (currentText) {
                                    currentText.text += value.text
                                    if (value.providerMetadata)
                                        currentText.metadata = value.providerMetadata

                                    await streamPartPersister.persist(currentText)
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

                                        await streamPartPersister.persist(part, true)
                                        streamPartPersister.clear(part.id)
                                        delete reasoningMap[value.id] // 已经存盘，内存可以删除了
                                    }
                                }
                                process.stdout.write("\n")
                                break;
                            case "reasoning-delta":
                                if (value.id in reasoningMap) {
                                    const part = reasoningMap[value.id]
                                    part!.text += value.text
                                    if (value.providerMetadata) part!.metadata = value.providerMetadata
                                    await streamPartPersister.persist(part!)
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

                                //这个阶段无需落盘，只需维护内存状态
                                // try {
                                //     await Session.updatePart(part)
                                // } catch (error) {
                                //     console.error("failed to persist tool-input-start part", part)
                                //     throw error
                                // }
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
                                // value.toolCallId 工具调用 ID
                                // value.toolName 工具名称
                                // value.args 工具参数
                                const match = toolcalls[value.toolCallId]
                                if (match) {
                                    // 更新工具调用状态到“运行中”
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
                                if (
                                    toolcalls[value.toolCallId] &&
                                    (
                                        toolcalls[value.toolCallId]?.state.status === "running" ||
                                        toolcalls[value.toolCallId]?.state.status === "waiting-approval"
                                    )
                                ) {
                                    const current = toolcalls[value.toolCallId]!
                                    const start =
                                        current.state.status === "waiting-approval"
                                            ? current.state.time.start
                                            : (current.state as Message.ToolStateRunning).time.start

                                    const match: Message.ToolPart = {
                                        ...current,
                                        state: {
                                            status: "denied",
                                            approvalID:
                                                current.state.status === "waiting-approval"
                                                    ? current.state.approvalID
                                                    : undefined,
                                            input: current.state.input,
                                            reason: "Tool execution was denied.",
                                            metadata:
                                                current.state.status === "waiting-approval"
                                                    ? current.state.metadata
                                                    : (current.state as Message.ToolStateRunning).metadata,
                                            time: {
                                                start,
                                                end: Date.now(),
                                            },
                                        },
                                    }

                                    toolcalls[value.toolCallId] = match
                                    await Session.updatePart(match)
                                }
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
                                // value.usage 使用统计（token 数量等）
                                // TODO: 更新消息的完成状态和时间
                                // TODO: 记录使用统计和计费信息
                                // TODO: 发送完成事件通知 UI
                                // TODO: 可能需要触发消息压缩（compaction）
                                this.message.finishReason = value.finishReason
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
                                // 接收到这个 value，说明 LLM 判断结束 React loop
                                console.log(value.finishReason)
                                this.message.finishReason = value.finishReason


                                break;
                            case "tool-approval-request":
                                if (
                                    toolcalls[value.toolCallId] &&
                                    (
                                        toolcalls[value.toolCallId]?.state.status === "running" ||
                                        toolcalls[value.toolCallId]?.state.status === "pending"
                                    )
                                ) {
                                    const current = toolcalls[value.toolCallId]!
                                    const waiting: Message.ToolPart = {
                                        ...current,
                                        state: {
                                            status: "waiting-approval",
                                            approvalID: value.approvalId,
                                            input: current.state.input,
                                            title:
                                                current.state.status === "running"
                                                    ? current.state.title
                                                    : undefined,
                                            metadata:
                                                (current.state.status === "running" ? current.state.metadata : undefined),
                                            time: {
                                                start:
                                                    current.state.status === "running"
                                                        ? current.state.time.start
                                                        : Date.now(),
                                            },
                                        },
                                        metadata: current.metadata,
                                    }

                                    toolcalls[value.toolCallId] = waiting
                                    await Session.updatePart(waiting)
                                    await Permission.registerApprovalRequest({
                                        assistant: {
                                            ...input.Assistant,
                                            path: {
                                                cwd: input.Assistant.path.cwd || Instance.directory,
                                                root: input.Assistant.path.root || Instance.worktree,
                                            },
                                        },
                                        toolPart: waiting,
                                    })
                                    blocked = true
                                }
                                break;
                            default:
                                // 处理未知事件类型
                                log.warn(`Unknown stream value type: ${(value as any).type}`);
                                break;
                        }
                    }

                    if (currentText) {
                        await streamPartPersister.flush(currentText)
                    }

                    for (const part of Object.values(reasoningMap)) {
                        await streamPartPersister.flush(part)
                    }

                    const activeToolCalls = listActiveToolCalls()
                    if (activeToolCalls.length > 0) {
                        const reason = "Tool call did not complete before the model response finished."
                        await failOpenToolCalls(reason)
                        log.warn("stopping processor because tool calls were left unresolved", {
                            activeToolCalls: activeToolCalls.map((part) => ({
                                callID: part.callID,
                                tool: part.tool,
                                status: part.state.status,
                            })),
                        })
                        return "stop"
                    }
                }
                catch (e: any) {
                    await failOpenToolCalls(normalizeToolError(e))
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
