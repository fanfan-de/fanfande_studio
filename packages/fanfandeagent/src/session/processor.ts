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
import { Flag } from "#flag/flag.ts"
import type { LanguageModelUsage } from "ai"
import type { TurnContext } from "#session/orchestrator.ts"

const log = Log.create({ service: "session.processor" })
const STREAM_PART_PERSIST_INTERVAL_MS = 100
const ENABLE_STREAM_STDOUT_DEBUG = Flag.FanFande_DEBUG_STREAM_STDOUT

type StreamPersistedPart = Message.TextPart | Message.ReasoningPart

function createStreamPartPersister(input: {
    persist: (part: StreamPersistedPart) => Promise<void>
}) {
    const state = new Map<string, {
        dirty: boolean
        lastPersistedAt: number
    }>()

    async function flush(part: StreamPersistedPart) {
        const current = state.get(part.id)
        if (!current?.dirty) {
            return
        }

        await input.persist(part)
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

function writeStreamDebug(value: string) {
    if (!ENABLE_STREAM_STDOUT_DEBUG) return
    process.stdout.write(value)
}

function applyUsageToAssistantMessage(
    message: Message.Assistant,
    usage: LanguageModelUsage | undefined,
    inputMode: "replace" | "peak" | "preserve" = "replace",
) {
    if (!usage) {
        return
    }

    const measuredInputTokens = usage.inputTokens ?? message.tokens.input
    let nextInputTokens = measuredInputTokens

    if (inputMode === "peak") {
        nextInputTokens = Math.max(message.tokens.input, measuredInputTokens)
    } else if (inputMode === "preserve" && message.tokens.input > 0) {
        nextInputTokens = message.tokens.input
    }

    message.tokens = {
        input: nextInputTokens,
        output: usage.outputTokens ?? message.tokens.output,
        reasoning:
            usage.outputTokenDetails?.reasoningTokens ??
            usage.reasoningTokens ??
            message.tokens.reasoning,
        cache: {
            read:
                usage.inputTokenDetails?.cacheReadTokens ??
                usage.cachedInputTokens ??
                message.tokens.cache.read,
            write:
                usage.inputTokenDetails?.cacheWriteTokens ??
                message.tokens.cache.write,
        },
    }
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
 * create a  processor锛坔andle single LLM prompt锛宯ot loop锛?
 * 涓嶄粎浠呮槸LLM绔殑stream杈撳嚭杩囩▼锛岃繕鍖呮嫭宸ュ叿鐨勬墽琛岃繃绋?
 * @param input 
 * @returns 
 */
export function create(input: {
    Assistant: Message.Assistant
    abort?: AbortSignal
    turn?: TurnContext
}) {
    const toolcalls: Record<string, Message.ToolPart> = {}
    let snapshot: string | undefined
    let blocked = false
    let attempt = 0
    let needsCompaction = false
    const emitRuntimeEvent = input.turn?.emit.bind(input.turn)
    const persistPart = async (part: Message.Part) => {
        if (emitRuntimeEvent) {
            return
        }

        await Session.updatePart(part)
    }

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
                    emitRuntimeEvent?.("tool.call.failed", {
                        part: failed,
                    })
                    await persistPart(failed)
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
                    const streamPartPersister = createStreamPartPersister({
                        persist: persistPart,
                    })
                    let currentText: Message.TextPart | undefined = undefined
                    // 鏌愪簺妯″瀷锛堝 Claude銆丟emini锛夋敮鎸佸涓苟琛屾帹鐞嗛摼鎴栧祵濂楁帹鐞嗭紝鎸?id 鍒嗗紑璺熻釜
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
                                emitRuntimeEvent?.("text.part.started", {
                                    messageID: currentText.messageID,
                                    partID: currentText.id,
                                    kind: "text",
                                    text: currentText.text,
                                    metadata: currentText.metadata,
                                })
                                writeStreamDebug("text-start:")
                                break;
                            case "text-end":
                                if (currentText) {
                                    currentText.text = currentText.text.trimEnd()
                                    if (currentText.time)
                                        currentText.time.end = Date.now()
                                    if (value.providerMetadata)
                                        currentText.metadata = value.providerMetadata
                                    emitRuntimeEvent?.("text.part.completed", {
                                        part: currentText,
                                    })
                                    // 灏?part 鍐欏叆瀛樺偍
                                    await streamPartPersister.persist(currentText, true)
                                    streamPartPersister.clear(currentText.id)
                                    currentText = undefined
                                    writeStreamDebug("\n")

                                }
                                break;
                            case 'text-delta':
                                if (currentText) {
                                    currentText.text += value.text
                                    if (value.providerMetadata)
                                        currentText.metadata = value.providerMetadata
                                    emitRuntimeEvent?.("text.part.delta", {
                                        messageID: currentText.messageID,
                                        partID: currentText.id,
                                        kind: "text",
                                        delta: value.text,
                                        text: currentText.text,
                                        metadata: currentText.metadata,
                                    })

                                    await streamPartPersister.persist(currentText)
                                    writeStreamDebug(value.text)
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
                                emitRuntimeEvent?.("reasoning.part.started", {
                                    messageID: reasoningPart.messageID,
                                    partID: reasoningPart.id,
                                    kind: "reasoning",
                                    text: reasoningPart.text,
                                    metadata: reasoningPart.metadata,
                                })

                                writeStreamDebug("reasoning start")

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
                                        emitRuntimeEvent?.("reasoning.part.completed", {
                                            part: part!,
                                        })

                                        await streamPartPersister.persist(part, true)
                                        streamPartPersister.clear(part.id)
                                        delete reasoningMap[value.id] // 宸茬粡瀛樼洏锛屽唴瀛樺彲浠ュ垹闄や簡
                                    }
                                }
                                writeStreamDebug("\n")
                                break;
                            case "reasoning-delta":
                                if (value.id in reasoningMap) {
                                    const part = reasoningMap[value.id]
                                    part!.text += value.text
                                    if (value.providerMetadata) part!.metadata = value.providerMetadata
                                    emitRuntimeEvent?.("reasoning.part.delta", {
                                        messageID: part!.messageID,
                                        partID: part!.id,
                                        kind: "reasoning",
                                        delta: value.text,
                                        text: part!.text,
                                        metadata: part!.metadata,
                                    })
                                    await streamPartPersister.persist(part!)
                                    writeStreamDebug(value.text)
                                }
                                break

                            case "tool-input-start":
                                const pendingPart: Message.ToolPart = {
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
                                toolcalls[value.id] = pendingPart

                                //杩欎釜闃舵鏃犻渶钀界洏锛屽彧闇€缁存姢鍐呭瓨鐘舵€?
                                // try {
                                //     await Session.updatePart(pendingPart)
                                // } catch (error) {
                                //     console.error("failed to persist tool-input-start part", pendingPart)
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
                                // value.toolCallId 宸ュ叿璋冪敤 ID
                                // value.toolName 宸ュ叿鍚嶇О
                                // value.args 宸ュ叿鍙傛暟
                                const match = toolcalls[value.toolCallId]
                                const part: Message.ToolPart = {
                                    ...(match ?? {
                                        id: Identifier.ascending("part"),
                                        sessionID: input.Assistant.sessionID,
                                        messageID: input.Assistant.id,
                                        type: "tool" as const,
                                        callID: value.toolCallId,
                                    }),
                                    tool: value.toolName,
                                    providerExecuted: value.providerExecuted === true ? true : match?.providerExecuted,
                                    state: {
                                        status: "running",
                                        input: value.input,
                                        title: value.title,
                                        metadata: value.providerMetadata,
                                        time: {
                                            start:
                                                match?.state.status === "running"
                                                    ? match.state.time.start
                                                    : Date.now(),
                                        }
                                    },
                                    metadata: value.providerMetadata ?? match?.metadata,
                                }
                                toolcalls[value.toolCallId] = part
                                emitRuntimeEvent?.("tool.call.started", {
                                    part,
                                })
                                try {
                                    await persistPart(part)
                                } catch (error) {
                                    log.error("failed to persist tool-call part", {
                                        callID: part.callID,
                                        tool: part.tool,
                                        error: normalizeToolError(error),
                                    })
                                    throw error
                                }
                                break;
                            case 'tool-result':
                                if (toolcalls[value.toolCallId] && toolcalls[value.toolCallId]?.state.status === "running") {
                                    const resultValue = value as { output?: unknown; result?: unknown }
                                    const rawToolOutput = resultValue.output ?? resultValue.result
                                    const normalized = extractToolResultState(
                                        rawToolOutput,
                                        value.title,
                                        value.providerMetadata ?? {},
                                        toolcalls[value.toolCallId],
                                    )
                                    const match: Message.ToolPart = {
                                        ...toolcalls[value.toolCallId]!,
                                        providerExecuted:
                                            value.providerExecuted === true
                                                ? true
                                                : toolcalls[value.toolCallId]!.providerExecuted,
                                        state: {
                                            status: "completed",
                                            input: value.input,
                                            output: normalized.output,
                                            modelOutput: rawToolOutput,
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
                                    emitRuntimeEvent?.("tool.call.completed", {
                                        part: match,
                                    })
                                    try {
                                        await persistPart(match)
                                    } catch (error) {
                                        log.error("failed to persist tool-result part", {
                                            callID: match.callID,
                                            tool: match.tool,
                                            error: normalizeToolError(error),
                                        })
                                        throw error
                                    }
                                }
                                break;

                            case "tool-error":
                                if (toolcalls[value.toolCallId] && toolcalls[value.toolCallId]?.state.status === "running") {
                                    const match: Message.ToolPart = {
                                        ...toolcalls[value.toolCallId]!,
                                        providerExecuted:
                                            value.providerExecuted === true
                                                ? true
                                                : toolcalls[value.toolCallId]!.providerExecuted,
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
                                    emitRuntimeEvent?.("tool.call.failed", {
                                        part: match,
                                    })
                                    try {
                                        await persistPart(match)
                                    } catch (error) {
                                        log.error("failed to persist tool-error part", {
                                            callID: match.callID,
                                            tool: match.tool,
                                            error: normalizeToolError(error),
                                        })
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
                                    emitRuntimeEvent?.("tool.call.denied", {
                                        part: match,
                                    })
                                    await persistPart(match)
                                }
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
                                // value.usage 浣跨敤缁熻锛坱oken 鏁伴噺绛夛級
                                // TODO: 鏇存柊娑堟伅鐨勫畬鎴愮姸鎬佸拰鏃堕棿
                                // TODO: 璁板綍浣跨敤缁熻鍜岃璐逛俊鎭?
                                // TODO: 鍙戦€佸畬鎴愪簨浠堕€氱煡 UI
                                // TODO: 鍙兘闇€瑕佽Е鍙戞秷鎭帇缂╋紙compaction锛?
                                this.message.finishReason = value.finishReason
                                applyUsageToAssistantMessage(this.message, value.totalUsage, "preserve")
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
                                log.error("stream error", { error: value.error })
                                break;
                            case "finish-step":
                                // 鎺ユ敹鍒拌繖涓?value锛岃鏄?LLM 鍒ゆ柇缁撴潫 React loop
                                this.message.finishReason = value.finishReason
                                applyUsageToAssistantMessage(this.message, value.usage, "peak")


                                break;
                            case "tool-approval-request":
                                const approvalToolCallID =
                                    value.toolCall?.toolCallId ??
                                    (value as { toolCallId?: string }).toolCallId
                                if (!approvalToolCallID) {
                                    log.warn("tool approval request arrived without a tool call id", {
                                        approvalId: value.approvalId,
                                    })
                                    break
                                }
                                if (
                                    toolcalls[approvalToolCallID] &&
                                    (
                                        toolcalls[approvalToolCallID]?.state.status === "running" ||
                                        toolcalls[approvalToolCallID]?.state.status === "pending"
                                    )
                                ) {
                                    const current = toolcalls[approvalToolCallID]!
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

                                    toolcalls[approvalToolCallID] = waiting
                                    emitRuntimeEvent?.("tool.call.waiting_approval", {
                                        part: waiting,
                                    })
                                    await persistPart(waiting)
                                    await Permission.registerApprovalRequest({
                                        assistant: {
                                            ...input.Assistant,
                                            path: {
                                                cwd: input.Assistant.path.cwd || Instance.directory,
                                                root: input.Assistant.path.root || Instance.worktree,
                                            },
                                        },
                                        toolPart: waiting,
                                        turn: input.turn,
                                    })
                                    blocked = true
                                }
                                break;
                            default:
                                // 澶勭悊鏈煡浜嬩欢绫诲瀷
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
