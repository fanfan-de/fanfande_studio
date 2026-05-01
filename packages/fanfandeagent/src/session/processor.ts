import * as Provider from "#provider/provider.ts";
import * as  Log from "#util/log.ts"
import * as Bus from "#bus/project-bus.ts"
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
import * as StreamEvents from "#session/stream-events.ts"
import {
    createAskUserQuestionMetadataFromInput,
    isAnsweredAskUserQuestionMetadata,
} from "#tool/ask-user-question.ts"

const log = Log.create({ service: "session.processor" })
const ENABLE_STREAM_STDOUT_DEBUG = Flag.FanFande_DEBUG_STREAM_STDOUT

type AssistantOutputDraftPart =
    | Message.TextPart
    | Message.ReasoningPart
    | Message.SourceUrlPart
    | Message.SourceDocumentPart
    | Message.FilePart
    | Message.ImagePart
    | Message.StepStartPart
    | Message.StepFinishPart

function createAssistantOutputDraft() {
    const order: string[] = []
    const parts = new Map<string, AssistantOutputDraftPart>()

    function remember<T extends AssistantOutputDraftPart>(part: T) {
        if (!parts.has(part.id)) {
            order.push(part.id)
        }
        parts.set(part.id, part)
        return part
    }

    function snapshot() {
        return order
            .map((partID) => parts.get(partID))
            .filter((part): part is AssistantOutputDraftPart => Boolean(part))
    }

    function textParts() {
        return snapshot().filter((part): part is Message.TextPart => part.type === "text")
    }

    function reasoningParts() {
        return snapshot().filter((part): part is Message.ReasoningPart => part.type === "reasoning")
    }

    function hasSource(sourceID: string) {
        return snapshot().some(
            (part) =>
                (part.type === "source-url" || part.type === "source-document") &&
                part.sourceID === sourceID,
        )
    }

    function hasFile(url: string) {
        return snapshot().some(
            (part) =>
                (part.type === "file" || part.type === "image") &&
                part.url === url,
        )
    }

    return {
        remember,
        snapshot,
        textParts,
        reasoningParts,
        hasSource,
        hasFile,
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

function deferSideEffect(action: () => PromiseLike<unknown> | unknown) {
    return new Promise<void>((resolve, reject) => {
        setTimeout(() => {
            Promise.resolve()
                .then(action)
                .then(
                    () => resolve(),
                    (error) => reject(error),
                )
        }, 0)
    })
}

function hasProjectBusContext() {
    try {
        void Instance.directory
        return true
    } catch {
        return false
    }
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
    const base64 =
        typeof candidate.base64 === "string"
            ? candidate.base64
            : candidate.uint8Array instanceof Uint8Array
                ? Buffer.from(candidate.uint8Array).toString("base64")
                : ""
    const url =
        typeof candidate.url === "string"
            ? candidate.url
            : mime && base64
                ? `data:${mime};base64,${base64}`
                : ""

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

function applyFinalStreamResultToDraft(
    draft: ReturnType<typeof createAssistantOutputDraft>,
    event: unknown,
    assistant: Message.Assistant,
) {
    if (!isRecord(event)) {
        return
    }

    const textParts = draft.textParts()
    if (typeof event.text === "string") {
        if (textParts.length === 1) {
            const textPart = textParts[0]
            if (!textPart) return
            textPart.text = event.text.trimEnd()
            textPart.time = {
                ...(textPart.time ?? { start: Date.now() }),
                end: textPart.time?.end ?? Date.now(),
            }
        } else if (textParts.length === 0 && event.text.length > 0) {
            draft.remember({
                id: Identifier.ascending("part"),
                sessionID: assistant.sessionID,
                messageID: assistant.id,
                type: "text",
                text: event.text.trimEnd(),
                time: {
                    start: Date.now(),
                    end: Date.now(),
                },
            })
        }
    }

    const reasoningParts = draft.reasoningParts()
    const reasoning = Array.isArray(event.reasoning) ? event.reasoning : []
    if (reasoning.length > 0) {
        reasoning.forEach((item, index) => {
            if (!isRecord(item) || typeof item.text !== "string") {
                return
            }

            const existing = reasoningParts[index]
            if (existing) {
                existing.text = item.text.trimEnd()
                existing.time = {
                    ...existing.time,
                    end: existing.time.end ?? Date.now(),
                }
                if (isRecord(item.providerMetadata)) {
                    existing.metadata = item.providerMetadata
                }
                return
            }

            draft.remember({
                id: Identifier.ascending("part"),
                sessionID: assistant.sessionID,
                messageID: assistant.id,
                type: "reasoning",
                text: item.text.trimEnd(),
                time: {
                    start: Date.now(),
                    end: Date.now(),
                },
                metadata: isRecord(item.providerMetadata) ? item.providerMetadata : undefined,
            })
        })
    } else if (typeof event.reasoningText === "string" && event.reasoningText.length > 0 && reasoningParts.length === 0) {
        draft.remember({
            id: Identifier.ascending("part"),
            sessionID: assistant.sessionID,
            messageID: assistant.id,
            type: "reasoning",
            text: event.reasoningText.trimEnd(),
            time: {
                start: Date.now(),
                end: Date.now(),
            },
        })
    }

    if (Array.isArray(event.sources)) {
        for (const source of event.sources) {
            if (!isRecord(source)) {
                continue
            }
            const sourceID =
                typeof source.id === "string"
                    ? source.id
                    : typeof source.sourceId === "string"
                        ? source.sourceId
                        : ""
            if (sourceID && draft.hasSource(sourceID)) {
                continue
            }

            const sourcePart = toSourcePart(source, assistant)
            if (sourcePart) {
                draft.remember(sourcePart)
            }
        }
    }

    if (Array.isArray(event.files)) {
        for (const file of event.files) {
            const filePart = toGeneratedFilePart(file, assistant)
            if (filePart && draft.hasFile(filePart.url)) {
                continue
            }
            if (filePart) {
                draft.remember(filePart)
            }
        }
    }
}

async function extractToolResultState(
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
        modelOutput: output,
    }
}

function isAskUserQuestionToolResult(
    metadata: Record<string, unknown> | undefined,
) {
    return Boolean(metadata && metadata.kind === "ask-user-question" && !isAnsweredAskUserQuestionMetadata(metadata))
}

function isAskUserQuestionToolName(toolName: string | undefined) {
    return toolName === "AskUserQuestion" ||
        toolName === "ask-user-question" ||
        toolName === "question-tool" ||
        toolName === "question"
}

function isWorkflowControlToolResult(
    metadata: Record<string, unknown> | undefined,
) {
    return Boolean(metadata && metadata.kind === "workflow-control" && metadata.restartLoop === true)
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
    let restartLoop = false
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
    const persistCanonicalPart = async (part: Message.Part) => {
        if (emitRuntimeEvent) {
            emitRuntimeEvent("part.recorded", { part })
            return
        }

        await Session.updatePart(part)
    }
    const persistAssistantMessage = async () => {
        if (emitRuntimeEvent) {
            emitRuntimeEvent("message.recorded", { message: input.Assistant })
            return
        }

        await Session.updateMessage(input.Assistant)
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
            const pendingStreamSideEffects = new Set<Promise<void>>()
            const busAvailable = hasProjectBusContext()
            const unsubscribeStreamSideEffects: Array<() => void> = []

            const trackStreamSideEffect = (promise: Promise<void>) => {
                let tracked: Promise<void>
                tracked = promise.finally(() => {
                    pendingStreamSideEffects.delete(tracked)
                })
                pendingStreamSideEffects.add(tracked)
                return tracked
            }

            const flushStreamSideEffects = async () => {
                while (pendingStreamSideEffects.size > 0) {
                    await Promise.all([...pendingStreamSideEffects])
                }
            }

            const publishStreamChunk = (value: { type?: unknown } & Record<string, unknown>) => {
                if (!busAvailable) return

                Bus.publishDetached(
                    StreamEvents.Event.ChunkReceived,
                    {
                        sessionID: input.Assistant.sessionID,
                        turnID: input.turn?.turnID,
                        messageID: input.Assistant.id,
                        iteration: attempt,
                        chunkType: typeof value.type === "string" ? value.type : "unknown",
                        chunk: value,
                    },
                    { silent: true, global: false },
                )
            }

            const requestPartPersistence = (part: Message.Part) => {
                const persist = () => persistPart(part)
                if (!busAvailable) {
                    trackStreamSideEffect(deferSideEffect(persist))
                    return
                }

                trackStreamSideEffect(
                    Bus.publishDeferred(
                        StreamEvents.Event.PartPersistenceRequested,
                        {
                            sessionID: input.Assistant.sessionID,
                            messageID: input.Assistant.id,
                            part,
                        },
                        { silent: true, global: false },
                    ),
                )
            }

            const requestToolApprovalRegistration = (toolPart: Message.ToolPart) => {
                const register = () =>
                    Permission.registerApprovalRequest({
                        assistant: {
                            ...input.Assistant,
                            path: {
                                cwd: input.Assistant.path.cwd || Instance.directory,
                                root: input.Assistant.path.root || Instance.worktree,
                            },
                        },
                        toolPart,
                        turn: input.turn,
                    })

                if (!busAvailable) {
                    trackStreamSideEffect(deferSideEffect(register))
                    return
                }

                trackStreamSideEffect(
                    Bus.publishDeferred(
                        StreamEvents.Event.ToolApprovalRegistrationRequested,
                        {
                            sessionID: input.Assistant.sessionID,
                            messageID: input.Assistant.id,
                            assistant: input.Assistant,
                            toolPart,
                            turn: input.turn,
                        },
                        { silent: true, global: false },
                    ),
                )
            }

            if (busAvailable) {
                unsubscribeStreamSideEffects.push(
                    Bus.subscribe(StreamEvents.Event.PartPersistenceRequested, async (event) => {
                        if (event.properties.sessionID !== input.Assistant.sessionID) return
                        if (event.properties.messageID !== input.Assistant.id) return
                        await persistPart(event.properties.part)
                    }),
                    Bus.subscribe(StreamEvents.Event.ToolApprovalRegistrationRequested, async (event) => {
                        if (event.properties.sessionID !== input.Assistant.sessionID) return
                        if (event.properties.messageID !== input.Assistant.id) return
                        await Permission.registerApprovalRequest({
                            assistant: {
                                ...event.properties.assistant,
                                path: {
                                    cwd: event.properties.assistant.path.cwd || Instance.directory,
                                    root: event.properties.assistant.path.root || Instance.worktree,
                                },
                            },
                            toolPart: event.properties.toolPart,
                            turn: event.properties.turn,
                        })
                    }),
                )
            }

            try {
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
                        const normalized = await extractToolResultState(
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
                                modelOutput: normalized.modelOutput,
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
                let persistPartialDraftOnce: ((reason: string) => Promise<void>) | undefined
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

                    const draft = createAssistantOutputDraft()
                    let currentText: Message.TextPart | undefined = undefined
                    // 鏌愪簺妯″瀷锛堝 Claude銆丟emini锛夋敮鎸佸涓苟琛屾帹鐞嗛摼鎴栧祵濂楁帹鐞嗭紝鎸?id 鍒嗗紑璺熻釜
                    let reasoningMap: Record<string, Message.ReasoningPart> = {}
                    let outputDraftPersisted = false
                    let lifecyclePersistence: Promise<void> | undefined

                    const persistDraftParts = async () => {
                        for (const part of draft.snapshot()) {
                            await persistCanonicalPart(part)
                        }
                    }

                    const persistSuccessfulDraft = async (event: unknown) => {
                        if (outputDraftPersisted) {
                            return
                        }

                        outputDraftPersisted = true
                        applyFinalStreamResultToDraft(draft, event, input.Assistant)

                        if (isRecord(event)) {
                            const finishReason =
                                typeof event.finishReason === "string"
                                    ? event.finishReason
                                    : this.message.finishReason
                            if (finishReason) {
                                this.message.finishReason = finishReason
                            }
                            applyUsageToAssistantMessage(
                                this.message,
                                event.totalUsage as LanguageModelUsage | undefined,
                                "preserve",
                            )
                        }

                        this.message.completed = this.message.completed ?? Date.now()
                        await persistDraftParts()
                        await persistAssistantMessage()
                    }

                    persistPartialDraftOnce = async (reason: string) => {
                        if (outputDraftPersisted) {
                            return
                        }

                        outputDraftPersisted = true
                        const now = Date.now()
                        for (const part of draft.snapshot()) {
                            if (part.type === "text") {
                                part.text = part.text.trimEnd()
                                part.time = {
                                    ...(part.time ?? { start: now }),
                                    end: part.time?.end ?? now,
                                }
                            }
                            if (part.type === "reasoning") {
                                part.text = part.text.trimEnd()
                                part.time = {
                                    ...part.time,
                                    end: part.time.end ?? now,
                                }
                            }
                        }

                        input.Assistant.error = input.Assistant.error ?? {
                            name: "UnknownError",
                            data: {
                                message: reason,
                            },
                        } as Message.Assistant["error"]
                        input.Assistant.completed = input.Assistant.completed ?? now
                        await persistDraftParts()
                        await persistAssistantMessage()
                    }

                    const stream = await LLM.stream({
                        ...streamInput,
                        onFinish: (event) => {
                            lifecyclePersistence = persistSuccessfulDraft(event)
                            return lifecyclePersistence
                        },
                        onAbort: () => {
                            const reason = "The model stream was aborted."
                            streamAbortReason = streamAbortReason ?? reason
                            input.Assistant.error = input.Assistant.error ?? {
                                name: "MessageAbortedError",
                                data: {
                                    message: streamAbortReason,
                                },
                            } as Message.Assistant["error"]
                            lifecyclePersistence = persistPartialDraftOnce!(streamAbortReason)
                            return lifecyclePersistence
                        },
                        onError: (event) => {
                            const reason = normalizeToolError(event.error)
                            input.Assistant.error = {
                                name: "UnknownError",
                                data: {
                                    message: reason,
                                },
                            } as Message.Assistant["error"]
                            lifecyclePersistence = persistPartialDraftOnce!(reason)
                            return lifecyclePersistence
                        },
                    })
                    for await (const streamValue of stream.fullStream) {
                        const value = streamValue as typeof streamValue | (
                            { type: "source-url" | "source-document" } & Record<string, unknown>
                        )
                        publishStreamChunk(value as { type?: unknown } & Record<string, unknown>)
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
                                draft.remember(currentText)
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
                                        metadata: currentText.metadata,
                                    })

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
                                draft.remember(reasoningPart)
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

                                        delete reasoningMap[value.id]
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
                                        metadata: part!.metadata,
                                    })
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
                                draft.remember(sourcePart)
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
                                draft.remember(filePart)
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
                                const askUserQuestionMetadata = isAskUserQuestionToolName(value.toolName)
                                    ? createAskUserQuestionMetadataFromInput(value.input, {
                                        toolCallID: value.toolCallId,
                                    })
                                    : undefined
                                const runningStateMetadata = askUserQuestionMetadata ?? value.providerMetadata
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
                                        metadata: runningStateMetadata,
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
                                requestPartPersistence(part)
                                break;
                            case 'tool-result':
                                if (toolcalls[value.toolCallId] && toolcalls[value.toolCallId]?.state.status === "running") {
                                    const resultValue = value as { output?: unknown; result?: unknown }
                                    const rawToolOutput = resultValue.output ?? resultValue.result
                                    const normalized = await extractToolResultState(
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
                                            modelOutput: normalized.modelOutput,
                                            metadata: normalized.metadata,
                                            title: normalized.title,
                                            time: {
                                                start: (toolcalls[value.toolCallId]!.state as Message.ToolStateRunning).time.start,
                                                end: Date.now(),
                                            },
                                            attachments: normalized.attachments,
                                        },
                                        metadata: toolcalls[value.toolCallId]!.metadata,
                                    }

                                    toolcalls[value.toolCallId] = match
                                    emitRuntimeEvent?.("tool.call.completed", {
                                        part: match,
                                    })
                                    requestPartPersistence(match)

                                    if (isAskUserQuestionToolResult(normalized.metadata)) {
                                        blocked = true
                                    }
                                    if (isWorkflowControlToolResult(normalized.metadata)) {
                                        restartLoop = true
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
                                    requestPartPersistence(match)
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
                                    requestPartPersistence(match)
                                }
                                break;
                            case "start-step":
                                const stepStartPart: Message.StepStartPart = {
                                    id: Identifier.ascending("part"),
                                    sessionID: input.Assistant.sessionID,
                                    messageID: input.Assistant.id,
                                    type: "step-start",
                                    snapshot:
                                        typeof (value as unknown as { snapshot?: unknown }).snapshot === "string"
                                            ? (value as unknown as { snapshot: string }).snapshot
                                            : undefined,
                                }
                                draft.remember(stepStartPart)
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
                                const streamErrorMessage = normalizeToolError(value.error)
                                input.Assistant.error = {
                                    name: "UnknownError",
                                    data: {
                                        message: streamErrorMessage,
                                    },
                                } as Message.Assistant["error"]
                                emitRuntimeEvent?.("llm.call.failed", {
                                    messageID: input.Assistant.id,
                                    providerID: streamInput.model.providerID,
                                    modelID: streamInput.model.id,
                                    agent: streamInput.agent.name,
                                    iteration: attempt,
                                    messageCount: llmSummary.messageCount,
                                    toolCount: llmSummary.toolCount,
                                    hasAttachments: llmSummary.hasAttachments,
                                    error: streamErrorMessage,
                                    retryable: false,
                                })
                                llmCallSettled = true
                                log.error("stream error", { error: value.error })
                                await persistPartialDraftOnce?.(streamErrorMessage)
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
                                        typeof (value as unknown as { snapshot?: unknown }).snapshot === "string"
                                            ? (value as unknown as { snapshot: string }).snapshot
                                            : undefined,
                                    cost: 0,
                                    tokens: buildStepTokens(value.usage),
                                }
                                draft.remember(stepFinishPart)

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
                                    requestPartPersistence(waiting)
                                    requestToolApprovalRegistration(waiting)
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
                        currentText.text = currentText.text.trimEnd()
                        currentText.time = {
                            ...(currentText.time ?? { start: Date.now() }),
                            end: currentText.time?.end ?? Date.now(),
                        }
                    }

                    for (const part of Object.values(reasoningMap)) {
                        part.text = part.text.trimEnd()
                        part.time = {
                            ...part.time,
                            end: part.time.end ?? Date.now(),
                        }
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
                        input.Assistant.error = input.Assistant.error ?? {
                            name: "MessageAbortedError",
                            data: {
                                message: streamAbortReason,
                            },
                        } as Message.Assistant["error"]
                        await persistPartialDraftOnce?.(streamAbortReason)
                    }

                    if (lifecyclePersistence) {
                        await lifecyclePersistence
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
                    await persistPartialDraftOnce?.(normalizeToolError(e))
                    await failOpenToolCalls(normalizeToolError(e))
                    log.error("processor failure", { error: e.message, stack: e.stack })
                    throw e  // 閲嶆柊鎶涘嚭閿欒
                }
                if (needsCompaction) return "compact"
                if (restartLoop) {
                    input.Assistant.finishReason = "tool-calls"
                    return "restart"
                }
                if (blocked) return "stop"
                if (input.Assistant.error) return "stop"
                return "continue"
            }
            } finally {
                try {
                    await flushStreamSideEffects()
                } finally {
                    for (const unsubscribe of unsubscribeStreamSideEffects.splice(0)) {
                        unsubscribe()
                    }
                }
            }
        }
    }
    return result
}
