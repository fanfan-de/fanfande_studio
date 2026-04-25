import { Instance } from "#project/instance.ts";
import * as Log from "#util/log.ts";
import z from "zod";
import * as Identifier from "#id/id.ts";
import { fn } from "#util/fn.ts";
import * as Status from "#session/status.ts";
import * as Session from "#session/session.ts";
import * as Processor from "#session/processor.ts";
import * as Provider from "#provider/provider.ts";
import * as db from "#database/Sqlite.ts";
import * as Agent from "#agent/agent.ts";
import * as SystemPrompt from "#session/system.ts"
import * as Skill from "#skill/skill.ts"
import * as Snapshot  from "#snapshot/snapshot.ts"
import * as SessionDiff from "#session/diff.ts"
import { Flag } from "#flag/flag.ts"
import * as Orchestrator from "#session/orchestrator.ts"
import * as RunningState from "#session/running-state.ts"
import * as ContextWindow from "#session/context-window.ts"
import * as RuntimeEvent from "#session/runtime-event.ts"
import * as SessionTitle from "#session/title.ts"

import * as Message from "./message";
import { resolveTools } from "./resolve-tools.ts";

/**
 * Agent prompt 编排层。
 *
 * 核心流向：
 * 1. prompt(): 新建 user message / parts，并启动本轮对话。
 * 2. resume(): 不创建新 user message，只继续推进已有对话。
 * 3. runLoop(): 每轮重建上下文，拼装 system/messages/tools，交给 Processor 执行。
 *
 * 约束：数据库是会话真相；RunningState 只保存当前运行中的 AbortController。
 */

const log = Log.create({ service: "session.prompt" });
const DEFAULT_PROMPT_LOOP_LIMIT = 64
const HARD_PROMPT_LOOP_LIMIT = Flag.FanFande_EXPERIMENTAL_AGENT_LOOP_LIMIT
const DANGLING_TOOL_CALL_ERROR =
    "Recovered dangling tool call from an earlier interrupted run before resuming."

// ---------------------------------------------------------------------------
// 输入协议与运行态
// ---------------------------------------------------------------------------

// 当前正在执行的 session loop 控制器；历史消息始终以数据库为准。
export function state() {
    return RunningState.state();
}

// 外部 prompt API 入参。保存时会被拆成 message 和 part 两层结构。
export const PromptInput = z.object({
    sessionID: Identifier.schema("session"),
    model: z
        .object({
            providerID: z.string(),
            modelID: z.string(),
        })
        .optional(),
    agent: z.string().optional(),
    noReply: z.boolean().optional(),
    system: z.string().optional(),
    skills: z.array(z.string()).optional(),
    variant: z.string().optional(),
    permissionMode: Message.PermissionMode.optional(),
    reasoningEffort: Message.OpenAIReasoningEffort.optional(),
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
            Message.ImagePart.omit({
                messageID: true,
                sessionID: true,
            })
                .partial({
                    id: true,
                })
                .meta({
                    ref: "ImagePartInput",
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
});
export type PromptInput = z.infer<typeof PromptInput>;

function finish(sessionID: string, controller?: AbortController) {
    RunningState.finish(sessionID, controller);
}

async function waitForStop(sessionID: string) {
    await RunningState.waitForStop(sessionID);
}

async function persistMessageRecord(
    message: Message.MessageInfo,
    turn?: Orchestrator.TurnContext,
) {
    if (turn) {
        turn.emit("message.recorded", {
            message,
        })
        return
    }

    await Session.updateMessage(message)
}

async function persistRecoveredToolError(
    part: Message.ToolPart,
    turn?: Orchestrator.TurnContext,
) {
    if (turn) {
        turn.emit("tool.call.failed", {
            part,
        })
        return
    }

    await Session.updatePart(part)
}

async function removePartRecord(
    partID: string,
    turn?: Orchestrator.TurnContext,
    messageID?: string,
) {
    if (turn) {
        turn.emit("part.removed", {
            partID,
            messageID,
        })
        return
    }

    Session.deletePart(partID)
}

function normalizePromptErrorMessage(error: unknown) {
    if (error instanceof Error && error.message) {
        return error.message
    }

    return String(error)
}

function effectivePermissionMode(
    session: Session.SessionInfo,
    permissionMode: PromptInput["permissionMode"],
) {
    if (Session.normalizeSessionInfo(session).policy?.ignoreFullAccess) {
        return "default" as const
    }

    return permissionMode ?? "default"
}

function buildSideChatSystemPrompt(link: Session.SideChatLink) {
    const lines = [
        "<side_chat_context>",
        "This session is a side chat anchored to a single assistant reply from another session.",
        "Use only the snapshot below as the parent-session context. Do not assume any other main-session history exists.",
        "This side chat is strictly read-only. Do not attempt edits, command execution, git writes, or any other side effects.",
    ]

    if (link.snapshot.userText?.trim()) {
        lines.push("", "Anchoring user question:", link.snapshot.userText.trim())
    }

    lines.push("", "Anchoring assistant reply:", link.snapshot.assistantText.trim())

    if ((link.snapshot.sources?.length ?? 0) > 0) {
        lines.push("", "Anchoring sources:")
        for (const source of link.snapshot.sources ?? []) {
            lines.push(`- ${source.kind}: ${source.title}${source.url ? ` (${source.url})` : ""}`)
        }
    }

    if ((link.snapshot.toolSummaries?.length ?? 0) > 0) {
        lines.push("", "Anchoring tool outcomes:")
        for (const summary of link.snapshot.toolSummaries ?? []) {
            lines.push(`- ${summary.tool} [${summary.status}]: ${summary.summary}`)
        }
    }

    if ((link.snapshot.filePaths?.length ?? 0) > 0) {
        lines.push("", "Anchoring files:", ...(link.snapshot.filePaths ?? []).map((filePath) => `- ${filePath}`))
    }

    lines.push("</side_chat_context>")
    return lines.join("\n")
}

function summarizeRuntimeTool(part: Message.ToolPart) {
    return {
        callID: part.callID,
        tool: part.tool,
        status: part.state.status,
    }
}

function isAskUserQuestionPart(part: Message.Part): part is Message.ToolPart & {
    state: Message.ToolStateCompleted
} {
    if (part.type !== "tool" || part.state.status !== "completed") {
        return false
    }

    const metadata = part.state.metadata
    return Boolean(
        metadata &&
        typeof metadata === "object" &&
        !Array.isArray(metadata) &&
        metadata.kind === "ask-user-question",
    )
}

function inferFailurePhase(parts: Message.Part[]): RuntimeEvent.TurnRuntimePhase | undefined {
    const toolParts = parts.filter((part): part is Message.ToolPart => part.type === "tool")

    if (toolParts.some((part) => part.state.status === "waiting-approval")) {
        return "waiting_approval"
    }

    if (toolParts.some((part) => part.state.status === "running" || part.state.status === "pending")) {
        return "executing_tool"
    }

    if (parts.some((part) => part.type === "text")) {
        return "responding"
    }

    if (parts.some((part) => part.type === "reasoning")) {
        return "reasoning"
    }

    return undefined
}

function emitTurnFailureContext(input: {
    turn: Orchestrator.TurnContext
    error: unknown
    assistant?: Message.Assistant
    parts: Message.Part[]
}) {
    const toolParts = input.parts.filter((part): part is Message.ToolPart => part.type === "tool")
    const activeTools = toolParts
        .filter((part) =>
            part.state.status === "pending" ||
            part.state.status === "running" ||
            part.state.status === "waiting-approval",
        )
        .map(summarizeRuntimeTool)
    const latestTool = toolParts.length > 0 ? summarizeRuntimeTool(toolParts[toolParts.length - 1]!) : undefined
    const errorMessage = normalizePromptErrorMessage(input.error)

    input.turn.emit("turn.error.context", {
        phase: inferFailurePhase(input.parts),
        messageID: input.assistant?.id,
        agent: input.assistant?.agent,
        model: input.assistant
            ? {
                providerID: input.assistant.providerID,
                modelID: input.assistant.modelID,
            }
            : undefined,
        error: {
            name: input.error instanceof Error ? input.error.name : undefined,
            message: errorMessage,
            retryable: Boolean((input.error as { isRetryable?: unknown } | null | undefined)?.isRetryable === true),
        },
        activeTools,
        latestTool,
    })
}

export function cancel(sessionID: string) {
    return RunningState.cancel(sessionID);
}

type RunLoopResult = {
    latest: Message.WithParts
    status: "completed" | "blocked" | "stopped"
    finishReason?: string
}

// ---------------------------------------------------------------------------
// 推理循环
// ---------------------------------------------------------------------------

// session 级状态机：一个用户输入可能经过多轮模型调用和工具调用，直到最终回答或阻塞。
async function runLoop(input: LoopRuntimeInput): Promise<RunLoopResult> {
    const { sessionID, abort, controller, turn } = input;
    const session = Session.DataBaseRead("sessions", sessionID) as Session.SessionInfo | null;
    if (!session) {
        throw new Error(`Session '${sessionID}' was not found.`);
    }
    const sideChatLink = Session.isSideChatSession(session)
        ? Session.getSideChatLink(sessionID)
        : null

    let currentAssistant: Message.Assistant | undefined;
    let iteration = 0;
    try {
        while (true) {
            if (abort.aborted) throw new Error("Prompt aborted");

            Status.set(sessionID, { type: "busy" });
            // 每轮从数据库重建历史，确保工具结果、恢复补写、diff part 都进入上下文。
            const messages = loadMessagesWithParts(sessionID);

            let lastUser: Message.User | undefined;
            let lastAssistant: Message.Assistant | undefined;
            let lastFinished: Message.Assistant | undefined;

            for (let i = messages.length - 1; i >= 0; i--) {
                const message = messages[i]!;

                if (!lastUser && message.info.role === "user") {
                    lastUser = message.info as Message.User;
                }

                if (!lastAssistant && message.info.role === "assistant") {
                    lastAssistant = message.info as Message.Assistant;
                }

                if (!lastFinished && message.info.role === "assistant" && message.info.finishReason) {
                    lastFinished = message.info as Message.Assistant;
                }

                if (lastUser && lastFinished) break;
            }

            if (!lastUser) {
                throw new Error("No user message found in stream. This should never happen.");
            }

            const activeSession = Session.DataBaseRead("sessions", sessionID) as Session.SessionInfo | null;
            if (!activeSession) {
                throw new Error(`Session '${sessionID}' was not found.`);
            }

            const requestedAgentName = lastUser.agent ?? "default";
            const workflow = Session.normalizeWorkflowState(activeSession.workflow);
            const effectiveAgentName = workflow.mode === "planning" ? "plan" : requestedAgentName;
            const agent = (await Agent.get(effectiveAgentName)) ?? Agent.planAgent;
            const maxLoopIterations = resolvePromptLoopLimit(agent);
            iteration += 1;
            if (iteration > maxLoopIterations) {
                log.error("prompt loop exceeded maximum iterations", {
                    sessionID,
                    userMessageID: lastUser.id,
                    agent: agent.name,
                    maxLoopIterations,
                });
                throw new Error(
                    `Prompt loop exceeded ${maxLoopIterations} iterations without reaching a final response. ` +
                    `If this task legitimately needs more tool steps, increase FanFande_EXPERIMENTAL_AGENT_LOOP_LIMIT.`,
                );
            }

            const recoveredDanglingToolCalls = await recoverDanglingToolCallsAfterUser(
                messages,
                lastUser.id,
                turn,
            )
            if (recoveredDanglingToolCalls > 0) {
                log.warn("recovered dangling tool calls before resuming the prompt loop", {
                    sessionID,
                    userMessageID: lastUser.id,
                    recoveredDanglingToolCalls,
                })
                iteration -= 1
                continue
            }

            const blockingInteraction = findBlockingAssistantInteractionAfterUser(messages, lastUser.id);
            if (blockingInteraction) {
                log.warn("stopping prompt loop because the latest user turn is waiting on a blocking assistant interaction", {
                    sessionID,
                    assistantID: blockingInteraction.assistant.id,
                    toolCallID: blockingInteraction.toolPart.callID,
                    tool: blockingInteraction.toolPart.tool,
                    status: blockingInteraction.toolPart.state.status,
                    interaction: blockingInteraction.kind,
                    questionID:
                        blockingInteraction.kind === "question"
                            ? blockingInteraction.questionID
                            : undefined,
                });
                break;
            }

            if (
                lastAssistant &&
                isFinalFinishReason(lastAssistant.finishReason) &&
                lastUser.id < lastAssistant.id
            ) {
                log.info("exiting loop", { sessionID });
                break;
            }

            // 本轮实际执行所需的模型、assistant 壳消息和工具集。
            const model = await Provider.getModel(
                lastUser.model.providerID,
                lastUser.model.modelID,
                Instance.project.id,
            );

            const assistantMessage = createAssistantMessage(sessionID, lastUser, model, agent.name);
            currentAssistant = assistantMessage;
            await persistMessageRecord(assistantMessage, turn);

            const tools = await resolveTools({
                agent,
                sessionID,
                messageID: assistantMessage.id,
                permissionMode: effectivePermissionMode(activeSession, lastUser.permissionMode),
                abort,
            });

            // system prompt 由 agent 基础规则、侧聊上下文、项目环境、skills 和用户追加规则组成。
            const system: string[] = [
                ...await SystemPrompt.defaultPrompt({
                    agent,
                    session: activeSession,
                }),
                ...(sideChatLink ? [buildSideChatSystemPrompt(sideChatLink)] : []),
                ...await SystemPrompt.environment(model),
                ...await SystemPrompt.skills(sessionID, lastUser.skills ?? []),
                ...(lastUser.system ? [lastUser.system] : []),
            ].filter((item): item is string => typeof item === "string")

            const promptContext = await ContextWindow.preparePromptContext({
                sessionID,
                model,
                system,
                messages,
                disableCompaction: Session.isSideChatSession(activeSession),
            })

            const processor = Processor.create({
                Assistant: assistantMessage,
                abort,
                turn,
            });

            let processResult: Awaited<ReturnType<typeof processor.process>>;
            try {
                processResult = await processor.process({
                    user: lastUser,
                    sessionID,
                    messageID: assistantMessage.id,
                    model,
                    agent,
                    system: promptContext.system,
                    abort,
                    reasoningEffort: lastUser.reasoningEffort,
                    messages: await Message.toModelMessages(promptContext.messages, model, {
                        agent,
                    }),
                    tools,
                });
            } catch (error) {
                assistantMessage.error = {
                    name: "UnknownError",
                    data: {
                        message: error instanceof Error ? error.message : String(error),
                    },
                } as Message.Assistant["error"];
                await persistMessageRecord(assistantMessage, turn);
                throw error;
            }

            await persistMessageRecord(assistantMessage, turn);

            if (isFinalFinishReason(processor.message.finishReason)) {
                log.info("model-finish", {
                    sessionID,
                    finishReason: processor.message.finishReason,
                    iteration,
                });
                break;
            }

            if (processResult === "stop") break;
        }

        const latest = currentAssistant
            ? {
                info: currentAssistant,
                parts: db.findManyWithSchema("parts", Message.Part, {
                    where: [{ column: "messageID", value: currentAssistant.id }],
                    orderBy: [{ column: "id", direction: "ASC" }],
                }),
            }
            : latestAssistantWithParts(sessionID);

        if (!latest) {
            throw new Error("No assistant message was created.");
        }

        const finishReason = latest.info.role === "assistant" ? latest.info.finishReason : undefined
        const blockedByApproval = latest.parts.some(
            (part): part is Message.ToolPart =>
                part.type === "tool" && part.state.status === "waiting-approval",
        )
        const blockedByQuestion = latest.parts.some(isAskUserQuestionPart)

        return {
            latest,
            status: blockedByApproval || blockedByQuestion
                ? "blocked"
                : isFinalFinishReason(finishReason)
                    ? "completed"
                    : "stopped",
            finishReason,
        };
    } finally {
        finish(sessionID, controller);
        Status.set(sessionID, { type: "idle" });
    }
}

// ---------------------------------------------------------------------------
// 对外入口
// ---------------------------------------------------------------------------

// 新用户输入入口：先记录 user message / parts，再启动 runLoop。
export const prompt = fn(PromptInput, async (input) => {
    const existingMessages = loadMessagesWithParts(input.sessionID)
    const session = Session.DataBaseRead("sessions", input.sessionID) as Session.SessionInfo | null;
    if (!session) {
        throw new Error(`Session '${input.sessionID}' was not found.`);
    }

    const shouldAutoGenerateTitle =
        Session.isDefaultSessionTitle(session.title) &&
        existingMessages.length === 0

    if (state()[input.sessionID]) {
        throw new Error(`Session '${input.sessionID}' is already running.`);
    }
    //
    const controller = new AbortController();
    RunningState.register(input.sessionID, controller, {
        reason: "prompt",
    });

    const baselineSnapshot = await Snapshot.track().catch((error) => {
        log.warn("failed to capture pre-turn snapshot", {
            sessionID: input.sessionID,
            error: error instanceof Error ? error.message : String(error),
        })
        return undefined
    })
    const nextInput: PromptInput = {
        ...input,
        permissionMode: effectivePermissionMode(session, input.permissionMode),
        skills: await Skill.resolveTurnSkillIDs({
            projectID: session.projectID,
            projectRoot: Instance.worktree,
            requestedSkillIDs: input.skills,
        }),
    }

    let userMessage: Awaited<ReturnType<typeof createUserMessage>>
    let turn: Orchestrator.TurnContext | undefined
    let sessionTitlePromise: Promise<void> | undefined


    try {
        userMessage = await createUserMessage(nextInput, {
            snapshot: baselineSnapshot,
        });
        if (shouldAutoGenerateTitle) {
            sessionTitlePromise = autoGenerateSessionTitle({
                sessionID: input.sessionID,
                projectID: session.projectID,
                model: userMessage.messageinfo.model,
                parts: userMessage.parts,
            })
        }
    } catch (error) {
        finish(input.sessionID, controller);
        Status.set(input.sessionID, { type: "idle" });
        throw error;
    }

    try {
        turn = Orchestrator.startTurn({
            sessionID: input.sessionID,
            userMessageID: userMessage.messageinfo.id,
            agent: userMessage.messageinfo.agent,
            model: userMessage.messageinfo.model,
        })

        turn.emit("turn.state.changed", {
            phase: "preparing",
            reason: "User turn recorded and prompt loop is preparing the next model call.",
            messageID: userMessage.messageinfo.id,
        })

        turn.emit("message.recorded", {
            message: userMessage.messageinfo,
        })

        for (const part of userMessage.parts) {
            if (part.type === "snapshot") {
                turn.emit("snapshot.captured", {
                    part,
                    phase: "turn-start",
                })
                continue
            }

            turn.emit("part.recorded", {
                part,
            })
        }

        const result = await runLoop({
            sessionID: input.sessionID,
            abort: controller.signal,
            controller,
            turn,
        });

        await persistDiffArtifacts({
            sessionID: input.sessionID,
            userMessageID: userMessage.messageinfo.id,
            snapshot: baselineSnapshot,
            assistantMessageID: result.latest.info.role === "assistant" ? result.latest.info.id : undefined,
            turn,
        }).catch((error) => {
            log.warn("failed to persist prompt diff artifacts", {
                sessionID: input.sessionID,
                error: error instanceof Error ? error.message : String(error),
            })
        })
        await sessionTitlePromise

        turn.emit("turn.state.changed", {
            phase: result.status === "blocked" ? "blocked" : "completed",
            reason: result.finishReason,
            messageID: result.latest.info.id,
        })

        turn.emit("turn.completed", {
            status: result.status,
            finishReason: result.finishReason,
            message: result.latest.info,
            parts: result.latest.parts,
        })

        return result.latest
    } catch (error) {
        const latestAssistant = latestAssistantWithPartsAfter(
            input.sessionID,
            userMessage.messageinfo.id,
        )
        await persistDiffArtifacts({
            sessionID: input.sessionID,
            userMessageID: userMessage.messageinfo.id,
            snapshot: baselineSnapshot,
            assistantMessageID: latestAssistant?.info.role === "assistant" ? latestAssistant.info.id : undefined,
            turn,
        }).catch((persistError) => {
            log.warn("failed to persist prompt diff artifacts after error", {
                sessionID: input.sessionID,
                error: persistError instanceof Error ? persistError.message : String(persistError),
            })
        })
        await sessionTitlePromise

        if (turn) {
            emitTurnFailureContext({
                turn,
                error,
                assistant: latestAssistant?.info.role === "assistant" ? latestAssistant.info : undefined,
                parts: latestAssistant?.parts ?? [],
            })
            turn.emit("turn.state.changed", {
                phase: "failed",
                reason: normalizePromptErrorMessage(error),
                messageID: latestAssistant?.info.id,
            })
            turn.emit("turn.failed", {
                error: normalizePromptErrorMessage(error),
                message: latestAssistant?.info,
                parts: latestAssistant?.parts,
            })
        }

        throw error
    } finally {
        if (turn) {
            Orchestrator.finishTurn(turn)
        }
        finish(input.sessionID, controller)
        Status.set(input.sessionID, { type: "idle" })
    }
});

export const ResumeInput = z.object({
    sessionID: Identifier.schema("session"),
});

// 恢复入口：等待旧 loop 停止后，基于最近一次 user message 继续推进。
export const resume = fn(ResumeInput, async (input) => {
    const session = Session.DataBaseRead("sessions", input.sessionID) as Session.SessionInfo | null;
    if (!session) {
        throw new Error(`Session '${input.sessionID}' was not found.`);
    }

    await waitForStop(input.sessionID);

    const running = state();
    if (running[input.sessionID])
        throw new Error(`Session '${input.sessionID}' is already running.`);

    const controller = new AbortController();
    RunningState.register(input.sessionID, controller, {
        reason: "resume",
    });
    const latestUser = SessionDiff.findLatestUserMessageWithSnapshot(input.sessionID)
    let turn: Orchestrator.TurnContext | undefined

    try {
        turn = Orchestrator.startTurn({
            sessionID: input.sessionID,
            userMessageID: latestUser?.message.id,
            agent: latestUser?.message.agent,
            model: latestUser?.message.model,
            resume: true,
        })

        turn.emit("turn.state.changed", {
            phase: "preparing",
            reason: "Resume requested and the prompt loop is preparing the next model call.",
            messageID: latestUser?.message.id,
        })

        const result = await runLoop({
            sessionID: input.sessionID,
            abort: controller.signal,
            controller,
            turn,
        });

        await persistDiffArtifacts({
            sessionID: input.sessionID,
            userMessageID: latestUser?.message.id ?? "",
            snapshot: latestUser?.snapshot,
            assistantMessageID: result.latest.info.role === "assistant" ? result.latest.info.id : undefined,
            turn,
        }).catch((error) => {
            log.warn("failed to persist resume diff artifacts", {
                sessionID: input.sessionID,
                error: error instanceof Error ? error.message : String(error),
            })
        })

        turn.emit("turn.state.changed", {
            phase: result.status === "blocked" ? "blocked" : "completed",
            reason: result.finishReason,
            messageID: result.latest.info.id,
        })

        turn.emit("turn.completed", {
            status: result.status,
            finishReason: result.finishReason,
            message: result.latest.info,
            parts: result.latest.parts,
        })

        return result.latest
    } catch (error) {
        const latestAssistant = latestAssistantWithPartsAfter(
            input.sessionID,
            latestUser?.message.id,
        )
        await persistDiffArtifacts({
            sessionID: input.sessionID,
            userMessageID: latestUser?.message.id ?? "",
            snapshot: latestUser?.snapshot,
            assistantMessageID: latestAssistant?.info.role === "assistant" ? latestAssistant.info.id : undefined,
            turn,
        }).catch((persistError) => {
            log.warn("failed to persist resume diff artifacts after error", {
                sessionID: input.sessionID,
                error: persistError instanceof Error ? persistError.message : String(persistError),
            })
        })

        if (turn) {
            emitTurnFailureContext({
                turn,
                error,
                assistant: latestAssistant?.info.role === "assistant" ? latestAssistant.info : undefined,
                parts: latestAssistant?.parts ?? [],
            })
            turn.emit("turn.state.changed", {
                phase: "failed",
                reason: normalizePromptErrorMessage(error),
                messageID: latestAssistant?.info.id,
            })
            turn.emit("turn.failed", {
                error: normalizePromptErrorMessage(error),
                message: latestAssistant?.info,
                parts: latestAssistant?.parts,
            })
        }

        throw error
    } finally {
        if (turn) {
            Orchestrator.finishTurn(turn)
        }
        finish(input.sessionID, controller)
        Status.set(input.sessionID, { type: "idle" })
    }
});

type LoopRuntimeInput = {
    sessionID: string
    abort: AbortSignal
    controller: AbortController
    turn: Orchestrator.TurnContext
}

// ---------------------------------------------------------------------------
// 上下文重建与恢复保护
// ---------------------------------------------------------------------------

// 从 messages + parts 重建模型上下文，避免内存态与数据库脱节。
function loadMessagesWithParts(sessionID: string): Message.WithParts[] {
    const messageInfos = db.findManyWithSchema("messages", Message.MessageInfo, {
        where: [{ column: "sessionID", value: sessionID }],
        orderBy: [{ column: "created", direction: "ASC" }],
    });

    const allParts = db.findManyWithSchema("parts", Message.Part, {
        where: [{ column: "sessionID", value: sessionID }],
        orderBy: [{ column: "id", direction: "ASC" }],
    });

    const partsByMessageID = new Map<string, Message.Part[]>();
    for (const part of allParts) {
        const list = partsByMessageID.get(part.messageID) ?? [];
        list.push(part);
        partsByMessageID.set(part.messageID, list);
    }

    return messageInfos.map((messageInfo) => ({
        info: messageInfo,
        parts: partsByMessageID.get(messageInfo.id) ?? [],
    }));
}

function findBlockingAssistantInteractionAfterUser(
    messages: Message.WithParts[],
    userMessageID: string,
) {
    let afterUser = false;

    for (const message of messages) {
        if (!afterUser) {
            afterUser = message.info.id === userMessageID;
            continue;
        }

        if (message.info.role !== "assistant") continue;

        const toolPart = message.parts.find(
            (part): part is Message.ToolPart =>
                part.type === "tool" &&
                (
                    part.state.status === "pending" ||
                    part.state.status === "running" ||
                    part.state.status === "waiting-approval"
                ),
        );

        if (toolPart) {
            return {
                kind: "tool" as const,
                assistant: message.info as Message.Assistant,
                toolPart,
            };
        }

        const questionPart = message.parts.find(isAskUserQuestionPart)
        if (questionPart) {
            const metadata = questionPart.state.metadata as Record<string, unknown>
            return {
                kind: "question" as const,
                assistant: message.info as Message.Assistant,
                toolPart: questionPart,
                questionID: typeof metadata.questionID === "string" ? metadata.questionID : undefined,
            }
        }
    }
}

async function recoverDanglingToolCallsAfterUser(
    messages: Message.WithParts[],
    userMessageID: string,
    turn?: Orchestrator.TurnContext,
) {
    let afterUser = false
    let recovered = 0

    for (const message of messages) {
        if (!afterUser) {
            afterUser = message.info.id === userMessageID
            continue
        }

        if (message.info.role !== "assistant") continue

        for (const part of message.parts) {
            if (part.type !== "tool") continue
            if (part.state.status !== "pending" && part.state.status !== "running") continue

            const end = Date.now()
            const repaired = Message.ToolPart.parse({
                ...part,
                state: {
                    status: "error",
                    input: part.state.input,
                    raw: part.state.raw,
                    error: DANGLING_TOOL_CALL_ERROR,
                    metadata:
                        part.state.status === "running"
                            ? part.state.metadata
                            : undefined,
                    time: {
                        start:
                            part.state.status === "running"
                                ? part.state.time.start
                                : end,
                        end,
                    },
                },
            })

            await persistRecoveredToolError(repaired, turn)
            recovered += 1
        }
    }

    return recovered
}

function resolvePromptLoopLimit(agent: Agent.AgentInfo) {
    const requestedLimit =
        agent.steps === undefined || !Number.isFinite(agent.steps)
            ? DEFAULT_PROMPT_LOOP_LIMIT
            : agent.steps

    return HARD_PROMPT_LOOP_LIMIT
        ? Math.min(requestedLimit, HARD_PROMPT_LOOP_LIMIT)
        : requestedLimit
}

function isFinalFinishReason(finishReason?: string) {
    // `tool-calls` / `unknown` 表示还可能需要继续工具循环。
    return Boolean(finishReason && !["tool-calls", "unknown"].includes(finishReason));
}

function latestAssistantWithParts(sessionID: string): Message.WithParts | undefined {
    const messages = loadMessagesWithParts(sessionID);
    for (let index = messages.length - 1; index >= 0; index--) {
        const item = messages[index]!;
        if (item.info.role === "assistant") return item;
    }
}

function latestAssistantWithPartsAfter(
    sessionID: string,
    userMessageID?: string,
): Message.WithParts | undefined {
    if (!userMessageID) return

    const messages = loadMessagesWithParts(sessionID)
    let afterUser = false
    let latestAssistant: Message.WithParts | undefined

    for (const message of messages) {
        if (!afterUser) {
            afterUser = message.info.id === userMessageID
            continue
        }

        if (message.info.role === "assistant") {
            latestAssistant = message
        }
    }

    return latestAssistant
}

function readPatchPart(messageID: string): Message.PatchPart | undefined {
    const parts = db.findManyWithSchema("parts", Message.Part, {
        where: [{ column: "messageID", value: messageID }],
        orderBy: [{ column: "id", direction: "ASC" }],
    })

    return parts.find((part): part is Message.PatchPart => part.type === "patch")
}

async function persistDiffArtifacts(input: {
    sessionID: string
    userMessageID: string
    snapshot: string | undefined
    assistantMessageID?: string
    turn?: Orchestrator.TurnContext
}) {
    if (!input.snapshot || !input.userMessageID) return

    const message = db.findById("messages", Message.MessageInfo, input.userMessageID)
    if (!message || message.role !== "user") return

    const diffSummary = await SessionDiff.computeDiffSummaryFromSnapshot(input.snapshot)
    const nextUser: Message.User = {
        ...(message as Message.User),
        diffSummary,
    }
    await persistMessageRecord(nextUser, input.turn)

    if (!input.assistantMessageID) return

    const existingPatch = readPatchPart(input.assistantMessageID)
    if (diffSummary.diffs.length === 0) {
        if (existingPatch) {
            await removePartRecord(existingPatch.id, input.turn, existingPatch.messageID)
        }
        return
    }

    const currentSnapshot = await Snapshot.track()
    if (!currentSnapshot) return

    const patchPart: Message.PatchPart = {
        id: existingPatch?.id ?? Identifier.ascending("part"),
        sessionID: input.sessionID,
        messageID: input.assistantMessageID,
        type: "patch",
        hash: currentSnapshot,
        files: diffSummary.diffs.map((diff) => diff.file),
        changes: diffSummary.diffs,
        summary: diffSummary.stats,
    }

    if (input.turn) {
        input.turn.emit("patch.generated", {
            part: patchPart,
        })
        return
    }

    await Session.updatePart(patchPart)
}

// ---------------------------------------------------------------------------
// 消息构造与附属任务
// ---------------------------------------------------------------------------

// 先创建 assistant message 的“骨架记录”。
// 真正的文本、推理链、工具调用结果会在 Processor 执行期间作为 part 持续补齐。
function createAssistantMessage(
    sessionID: string,
    lastUser: Message.User,
    model: Provider.Model,
    agentName: string,
): Message.Assistant {
    return {
        id: Identifier.ascending("message"),
        sessionID,
        role: "assistant",
        created: Date.now(),
        parentID: "",
        modelID: model.id,
        providerID: model.providerID,
        agent: agentName,
        path: {
            cwd: Instance.directory,
            root: Instance.worktree,
        },
        cost: 0,
        tokens: {
            input: 0,
            output: 0,
            reasoning: 0,
            cache: {
                read: 0,
                write: 0,
            },
        },
    };
}

// 把外部 prompt part 归一化为数据库统一使用的 Part 结构。
function toUserPart(
    part: PromptInput["parts"][number],
    messageID: string,
    sessionID: string,
): Message.Part {
    const base = {
        id: Identifier.ascending("part"),
        messageID,
        sessionID,
    };

    switch (part.type) {
        case "file":
            return {
                ...base,
                ...part,
            } as Message.FilePart;
        case "image":
            return {
                ...base,
                ...part,
            } as Message.ImagePart;
        case "agent":
            return {
                ...base,
                ...part,
            } as Message.AgentPart;
        case "text":
            return {
                ...base,
                ...part,
            } as Message.TextPart;
        case "subtask":
            return {
                ...base,
                ...part,
            } as Message.SubtaskPart;
    }
}

// 用户输入先落成一条 user message，再拆成多条 part，供模型、UI 和工具链复用。
async function createUserMessage(input: PromptInput, options?: { snapshot?: string }) {
    const messageinfo: Message.User = {
        id: Identifier.ascending("message"),
        sessionID: input.sessionID,
        role: "user",
        created: Date.now(),
        agent: input.agent ?? "default",
        model: input.model ?? await Provider.getDefaultModelRef(Instance.project.id),
        system: input.system,
        skills: input.skills,
        permissionMode: input.permissionMode ?? "default",
        reasoningEffort: input.reasoningEffort,
    };

    const parts = input.parts.map((part) =>
        toUserPart(part, messageinfo.id, input.sessionID),
    );

    if (options?.snapshot) {
        parts.push({
            id: Identifier.ascending("part"),
            sessionID: input.sessionID,
            messageID: messageinfo.id,
            type: "snapshot",
            snapshot: options.snapshot,
        } satisfies Message.SnapshotPart)
    }


    // 这里仅记录校验问题，避免单个异常 part 阻断整条用户消息。
    parts.forEach((part, index) => {
        const parsedPart = Message.Part.safeParse(part);
        if (parsedPart.success) return;

        log.error("invalid user part before save", {
            sessionID: input.sessionID,
            messageID: messageinfo.id,
            partID: part.id,
            partType: part.type,
            index,
            issues: parsedPart.error.issues,
            part,
        });
    });

    return {
        messageinfo,
        parts,
    };
}

function isSessionTitleSourcePart(part: Message.Part) {
    return part.type === "text" || part.type === "file" || part.type === "image"
}

async function autoGenerateSessionTitle(input: {
    sessionID: string
    projectID: string
    model: Provider.ModelReference
    parts: Message.Part[]
}) {
    const titleSourceParts = input.parts.filter(isSessionTitleSourcePart)
    if (titleSourceParts.length === 0) return

    try {
        const fallbackModel = await Provider.getModel(
            input.model.providerID,
            input.model.modelID,
            input.projectID,
        )
        const title = await SessionTitle.generateSessionTitle({
            projectID: input.projectID,
            fallbackModel,
            parts: titleSourceParts,
        })
        if (!title) return

        Session.updateSessionTitle(input.sessionID, title, {
            ifCurrentTitle: Session.DEFAULT_SESSION_TITLE,
        })
    } catch (error) {
        log.warn("automatic session title generation failed", {
            sessionID: input.sessionID,
            projectID: input.projectID,
            error: error instanceof Error ? error.message : String(error),
        })
    }
}
