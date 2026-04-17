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

function summarizeLlmUsage(usage: LanguageModelUsage | undefined) {
    if (!usage) {
        return undefined
    }

    return {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        reasoningTokens:
            usage.outputTokenDetails?.reasoningTokens ??
            usage.reasoningTokens,
        cacheReadTokens:
            usage.inputTokenDetails?.cacheReadTokens ??
            usage.cachedInputTokens,
        cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens,
    }
}

function readToolRaw(state: Message.ToolPart["state"] | undefined) {
    return state && typeof (state as { raw?: unknown }).raw === "string"
        ? (state as { raw: string }).raw
        : ""
}

function buildStepTokens(usage: LanguageModelUsage | undefined) {
    return {
        input: usage?.inputTokens ?? 0,
        output: usage?.outputTokens ?? 0,
        reasoning: usage?.outputTokenDetails?.reasoningTokens ?? usage?.reasoningTokens ?? 0,
        cache: {
            read: usage?.inputTokenDetails?.cacheReadTokens ?? usage?.cachedInputTokens ?? 0,
            write: usage?.inputTokenDetails?.cacheWriteTokens ?? 0,
        },
    }
}

function summarizeLlmCallInput(streamInput: LLM.StreamInput) {
    let hasAttachments = false

    for (const message of streamInput.messages) {
        if (!Array.isArray(message.content)) continue
        if (message.content.some((part) => part.type === "image" || part.type === "file")) {
            hasAttachments = true
            break
        }
    }

    return {
        messageCount: streamInput.messages.length,
        toolCount: Object.keys(streamInput.tools ?? {}).filter((toolName) => toolName !== "invalid").length,
        hasAttachments,
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

function toGeneratedFilePart(
    value: unknown,
    assistant: Message.Assistant,
): Message.FilePart | Message.ImagePart | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return undefined
    }

    const candidate = value as Record<string, unknown>
    const mime =
        typeof candidate.mediaType === "string"
            ? candidate.mediaType
            : typeof candidate.mime === "string"
                ? candidate.mime
                : ""
    const url = typeof candidate.url === "string" ? candidate.url : ""

    if (!mime || !url) {
        return undefined
    }

    const base = {
        id: Identifier.ascending("part"),
        sessionID: assistant.sessionID,
        messageID: assistant.id,
        mime,
        url,
        filename: typeof candidate.filename === "string" ? candidate.filename : undefined,
    }

    if (mime.startsWith("image/")) {
        return {
            ...base,
            type: "image",
        }
    }

    return {
        ...base,
        type: "file",
    }
}

function toSourcePart(
    value: unknown,
    assistant: Message.Assistant,
): Message.SourceUrlPart | Message.SourceDocumentPart | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return undefined
    }

    const candidate = value as Record<string, unknown>
    const sourceID =
        typeof candidate.sourceId === "string"
            ? candidate.sourceId
            : typeof candidate.id === "string"
                ? candidate.id
                : ""
    const providerMetadata =
        candidate.providerMetadata && typeof candidate.providerMetadata === "object" && !Array.isArray(candidate.providerMetadata)
            ? candidate.providerMetadata as Record<string, unknown>
            : undefined

    if (!sourceID) {
        return undefined
    }

    if (
        candidate.type === "source-url" ||
        candidate.sourceType === "url" ||
        typeof candidate.url === "string"
    ) {
        if (typeof candidate.url !== "string") {
            return undefined
        }

        return {
            id: Identifier.ascending("part"),
            sessionID: assistant.sessionID,
            messageID: assistant.id,
            type: "source-url",
            sourceID,
            url: candidate.url,
            title: typeof candidate.title === "string" ? candidate.title : undefined,
            providerMetadata,
        }
    }

    if (
        candidate.type === "source-document" ||
        candidate.sourceType === "document" ||
        typeof candidate.mediaType === "string"
    ) {
        if (typeof candidate.mediaType !== "string" || typeof candidate.title !== "string") {
            return undefined
        }

        return {
            id: Identifier.ascending("part"),
            sessionID: assistant.sessionID,
            messageID: assistant.id,
            type: "source-document",
            sourceID,
            mediaType: candidate.mediaType,
            title: candidate.title,
            filename: typeof candidate.filename === "string" ? candidate.filename : undefined,
            providerMetadata,
        }
    }

    return undefined
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

type FinalToolResultCandidate = {
    toolCallId: string
    toolName?: string
    input?: Record<string, unknown>
    output?: unknown
    result?: unknown
    title?: string
    providerMetadata?: Record<string, unknown>
    providerExecuted?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
}

function toToolResultCandidate(
    value: unknown,
    options?: {
        unwrapOutput?: boolean
    },
): FinalToolResultCandidate | undefined {
    if (!isRecord(value) || value.type !== "tool-result" || typeof value.toolCallId !== "string") {
        return undefined
    }

    const output =
        options?.unwrapOutput === true
            ? unwrapFinalToolOutput(value.output)
            : value.output

    const input = isRecord(value.input) ? value.input : undefined
    const providerMetadata = isRecord(value.providerMetadata) ? value.providerMetadata : undefined

    return {
        toolCallId: value.toolCallId,
        toolName: typeof value.toolName === "string" ? value.toolName : undefined,
        input,
        output,
        result: value.result,
        title: typeof value.title === "string" ? value.title : undefined,
        providerMetadata,
        providerExecuted: value.providerExecuted === true ? true : undefined,
    }
}

function unwrapFinalToolOutput(output: unknown): unknown {
    if (!isRecord(output) || typeof output.type !== "string") {
        return output
    }

    if (
        output.type === "json" ||
        output.type === "error-json" ||
        output.type === "text" ||
        output.type === "error-text"
    ) {
        return "value" in output ? output.value : output
    }

    if (output.type === "execution-denied") {
        return {
            reason: typeof output.reason === "string" ? output.reason : "Tool execution was denied.",
        }
    }

    return output
}

function collectStepToolResultCandidates(steps: unknown): FinalToolResultCandidate[] {
    if (!Array.isArray(steps)) {
        return []
    }

    const results: FinalToolResultCandidate[] = []
    for (const step of steps) {
        if (!isRecord(step) || !Array.isArray(step.content)) {
            continue
        }

        for (const item of step.content) {
            const candidate = toToolResultCandidate(item)
            if (candidate) {
                results.push(candidate)
            }
        }
    }

    return results
}

function collectResponseToolResultCandidates(response: unknown): FinalToolResultCandidate[] {
    if (!isRecord(response) || !Array.isArray(response.messages)) {
        return []
    }

    const results: FinalToolResultCandidate[] = []
    for (const message of response.messages) {
        if (!isRecord(message) || !Array.isArray(message.content)) {
            continue
        }

        for (const item of message.content) {
            const candidate = toToolResultCandidate(item, { unwrapOutput: true })
            if (candidate) {
                results.push(candidate)
            }
        }
    }

    return results
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
    let currentPhase: string | undefined
    const persistPart = async (part: Message.Part) => {
        if (emitRuntimeEvent) {
            return
        }

        await Session.updatePart(part)
    }

    const emitRuntimePhase = (
        phase: "waiting_llm" | "reasoning" | "executing_tool" | "waiting_approval" | "responding" | "retrying",
        payload?: {
            reason?: string
            toolCallID?: string
            toolName?: string
            iteration?: number
        },
    ) => {
        if (!emitRuntimeEvent || currentPhase === phase) {
            return
        }

        currentPhase = phase
        emitRuntimeEvent("turn.state.changed", {
            phase,
            reason: payload?.reason,
            messageID: input.Assistant.id,
            toolCallID: payload?.toolCallID,
            toolName: payload?.toolName,
            iteration: payload?.iteration,
        })
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

            const describeOpenToolCallFailure = (
                activeToolCalls: Message.ToolPart[],
                streamAbortReason?: string,
            ) => {
                if (!streamAbortReason) {
                    return "Tool call did not complete before the model response finished."
                }

                const pending = activeToolCalls.find((part) => part.state.status === "pending")
                const rawLength =
                    pending?.state.status === "pending"
                        ? pending.state.raw.length
                        : undefined

                const detail = rawLength && rawLength > 0
                    ? ` Buffered tool input size: ${rawLength} characters.`
                    : ""

                return [
                    `Model stream aborted before the tool call finished: ${streamAbortReason}`,
                    detail.trim(),
                    "Increase FanFande_EXPERIMENTAL_LLM_TOTAL_TIMEOUT_MS or FanFande_EXPERIMENTAL_LLM_STEP_TIMEOUT_MS if this tool needs more time to stream large arguments.",
                ]
                    .filter((item) => item.length > 0)
                    .join(" ")
            }

            const reconcileOpenToolCalls = async (stream: LLM.StreamOutput) => {
                const activeToolCalls = listActiveToolCalls()
                if (activeToolCalls.length === 0) {
                    return 0
                }

                const candidates = new Map<string, FinalToolResultCandidate>()
                const remember = (candidate: FinalToolResultCandidate | undefined) => {
                    if (!candidate) {
                        return
                    }

                    candidates.set(candidate.toolCallId, candidate)
                }

                try {
                    const settled = await Promise.allSettled([
                        stream.toolResults,
                        stream.steps,
                        stream.response,
                    ])

                    const [toolResultsResult, stepsResult, responseResult] = settled

                    if (toolResultsResult?.status === "fulfilled" && Array.isArray(toolResultsResult.value)) {
                        for (const item of toolResultsResult.value) {
                            remember(toToolResultCandidate(item))
                        }
                    }

                    if (stepsResult?.status === "fulfilled") {
                        for (const candidate of collectStepToolResultCandidates(stepsResult.value)) {
                            remember(candidate)
                        }
                    }

                    if (responseResult?.status === "fulfilled") {
                        for (const candidate of collectResponseToolResultCandidates(responseResult.value)) {
                            remember(candidate)
                        }
                    }

                    let reconciled = 0
                    for (const current of activeToolCalls) {
                        const candidate = candidates.get(current.callID)
                        if (!candidate) {
                            continue
                        }

                        const rawToolOutput = candidate.output ?? candidate.result
                        const fallbackTitle =
                            candidate.title ??
                            (current.state.status === "running"
                                ? current.state.title
                                : undefined)
                        const fallbackMetadata =
                            candidate.providerMetadata ??
                            (
                                current.state.status === "running"
                                    ? current.state.metadata
                                    : current.metadata
                            ) ??
                            {}
                        const normalized = extractToolResultState(
                            rawToolOutput,
                            fallbackTitle,
                            fallbackMetadata,
                            current,
                        )
                        const match: Message.ToolPart = {
                            ...current,
                            tool: candidate.toolName ?? current.tool,
                            providerExecuted:
                                candidate.providerExecuted === true
                                    ? true
                                    : current.providerExecuted,
                            state: {
                                status: "completed",
                                input: candidate.input ?? current.state.input,
                                output: normalized.output,
                                modelOutput: rawToolOutput,
                                metadata: normalized.metadata,
                                title: normalized.title,
                                time: {
                                    start:
                                        current.state.status === "running"
                                            ? current.state.time.start
                                            : Date.now(),
                                    end: Date.now(),
                                },
                                attachments: normalized.attachments,
                            },
                            metadata: candidate.providerMetadata ?? current.metadata,
                        }

                        toolcalls[current.callID] = match
                        emitRuntimeEvent?.("tool.call.completed", {
                            part: match,
                        })
                        await persistPart(match)
                        reconciled += 1
                    }

                    if (reconciled > 0) {
                        log.warn("reconciled tool results after the stream ended", {
                            reconciled,
                            activeToolCalls: activeToolCalls.map((part) => ({
                                callID: part.callID,
                                tool: part.tool,
                                status: part.state.status,
                            })),
                        })
                    }

                    return reconciled
                } catch (error) {
                    log.warn("failed to reconcile tool results after the stream ended", {
                        error: normalizeToolError(error),
                    })
                    return 0
                }
            }

            while (true) {
                let llmSummary = summarizeLlmCallInput(streamInput)
                let llmCallSettled = false
                let streamAbortReason: string | undefined
                try {
                    attempt += 1
                    emitRuntimePhase("waiting_llm", {
                        reason: "Awaiting the next model stream.",
                        iteration: attempt,
                    })
                    emitRuntimeEvent?.("llm.call.started", {
                        messageID: input.Assistant.id,
                        providerID: streamInput.model.providerID,
                        modelID: streamInput.model.id,
                        agent: streamInput.agent.name,
                        iteration: attempt,
                        messageCount: llmSummary.messageCount,
                        toolCount: llmSummary.toolCount,
                        hasAttachments: llmSummary.hasAttachments,
                    })

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
                                emitRuntimePhase("responding", {
                                    reason: "The model started streaming a visible response.",
                                    iteration: attempt,
                                })
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
                                emitRuntimePhase("reasoning", {
                                    reason: "The model started streaming reasoning output.",
                                    iteration: attempt,
                                })
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
                                emitRuntimeEvent?.("tool.call.pending", {
                                    part: pendingPart,
                                })

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
                                    const current = toolcalls[value.id]
                                    const pendingState = Message.ToolStatePending.safeParse(current?.state)
                                    if (current && pendingState.success) {
                                        const pendingPart: Message.ToolPart = {
                                            ...current,
                                            state: {
                                                ...pendingState.data,
                                                raw: pendingState.data.raw + value.delta,
                                            },
                                        }
                                        toolcalls[value.id] = pendingPart
                                        emitRuntimeEvent?.("tool.call.pending", {
                                            part: pendingPart,
                                        })
                                    }
                                }
                                break;
                            case "source":
                            case "source-url":
                            case "source-document": {
                                const sourcePart = toSourcePart(value, input.Assistant)
                                if (!sourcePart) {
                                    break
                                }

                                emitRuntimeEvent?.("source.recorded", {
                                    part: sourcePart,
                                })
                                await persistPart(sourcePart)
                                break
                            }
                            case "file": {
                                const filePart = toGeneratedFilePart(value, input.Assistant)
                                if (!filePart) {
                                    break
                                }

                                emitRuntimeEvent?.("file.generated", {
                                    part: filePart,
                                })
                                await persistPart(filePart)
                                break
                            }
                            case 'tool-call':
                                emitRuntimePhase("executing_tool", {
                                    reason: "The model issued a tool call.",
                                    toolCallID: value.toolCallId,
                                    toolName: value.toolName,
                                    iteration: attempt,
                                })
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
                                        raw: readToolRaw(match?.state),
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
                                            raw: readToolRaw(toolcalls[value.toolCallId]!.state),
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
                                            raw: readToolRaw(toolcalls[value.toolCallId]!.state),
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
                                            raw: readToolRaw(current.state),
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
                                const stepStartPart: Message.StepStartPart = {
                                    id: Identifier.ascending("part"),
                                    sessionID: input.Assistant.sessionID,
                                    messageID: input.Assistant.id,
                                    type: "step-start",
                                    snapshot:
                                        typeof (value as { snapshot?: unknown }).snapshot === "string"
                                            ? (value as { snapshot: string }).snapshot
                                            : undefined,
                                }
                                emitRuntimeEvent?.("part.recorded", {
                                    part: stepStartPart,
                                })
                                await persistPart(stepStartPart)
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
                                emitRuntimeEvent?.("llm.call.completed", {
                                    messageID: input.Assistant.id,
                                    providerID: streamInput.model.providerID,
                                    modelID: streamInput.model.id,
                                    agent: streamInput.agent.name,
                                    iteration: attempt,
                                    messageCount: llmSummary.messageCount,
                                    toolCount: llmSummary.toolCount,
                                    hasAttachments: llmSummary.hasAttachments,
                                    finishReason: value.finishReason,
                                    usage: summarizeLlmUsage(value.totalUsage),
                                })
                                llmCallSettled = true
                                break;
                            case "abort":
                                streamAbortReason =
                                    typeof value.reason === "string" && value.reason.length > 0
                                        ? value.reason
                                        : "The model stream aborted."
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
                                const stepFinishPart: Message.StepFinishPart = {
                                    id: Identifier.ascending("part"),
                                    sessionID: input.Assistant.sessionID,
                                    messageID: input.Assistant.id,
                                    type: "step-finish",
                                    reason:
                                        typeof value.finishReason === "string" && value.finishReason.length > 0
                                            ? value.finishReason
                                            : "Reasoning step completed.",
                                    snapshot:
                                        typeof (value as { snapshot?: unknown }).snapshot === "string"
                                            ? (value as { snapshot: string }).snapshot
                                            : undefined,
                                    cost: 0,
                                    tokens: buildStepTokens(value.usage),
                                }
                                emitRuntimeEvent?.("part.recorded", {
                                    part: stepFinishPart,
                                })
                                await persistPart(stepFinishPart)

                                break;
                            case "tool-approval-request":
                                const approvalToolCallID =
                                    value.toolCall?.toolCallId ??
                                    (value as { toolCallId?: string }).toolCallId
                                emitRuntimePhase("waiting_approval", {
                                    reason: "Waiting for an approval decision before continuing the tool.",
                                    toolCallID: approvalToolCallID,
                                    toolName: approvalToolCallID ? toolcalls[approvalToolCallID]?.tool : undefined,
                                    iteration: attempt,
                                })
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
                                            raw: readToolRaw(current.state),
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

                    if (!llmCallSettled && streamAbortReason) {
                        emitRuntimeEvent?.("llm.call.failed", {
                            messageID: input.Assistant.id,
                            providerID: streamInput.model.providerID,
                            modelID: streamInput.model.id,
                            agent: streamInput.agent.name,
                            iteration: attempt,
                            messageCount: llmSummary.messageCount,
                            toolCount: llmSummary.toolCount,
                            hasAttachments: llmSummary.hasAttachments,
                            error: streamAbortReason,
                            retryable: false,
                        })
                        llmCallSettled = true
                    }

                    await reconcileOpenToolCalls(stream)

                    const activeToolCalls = listActiveToolCalls()
                    if (activeToolCalls.length > 0) {
                        const reason = describeOpenToolCallFailure(activeToolCalls, streamAbortReason)
                        await failOpenToolCalls(reason)
                        log.warn("stopping processor because tool calls were left unresolved", {
                            reason,
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
                    if (!llmCallSettled) {
                        emitRuntimeEvent?.("llm.call.failed", {
                            messageID: input.Assistant.id,
                            providerID: streamInput.model.providerID,
                            modelID: streamInput.model.id,
                            agent: streamInput.agent.name,
                            iteration: attempt,
                            messageCount: llmSummary.messageCount,
                            toolCount: llmSummary.toolCount,
                            hasAttachments: llmSummary.hasAttachments,
                            error: normalizeToolError(e),
                            retryable: Boolean(e?.isRetryable === true),
                        })
                    }
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
