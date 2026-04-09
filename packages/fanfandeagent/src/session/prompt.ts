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
import * as Snapshot  from "#snapshot/snapshot.ts"
import * as SessionDiff from "#session/diff.ts"
import { Flag } from "#flag/flag.ts"

import * as Message from "./message";
import { resolveTools } from "./resolve-tools.ts";
//import type { string } from "yargs";

const log = Log.create({ service: "session.prompt" });
const DEFAULT_PROMPT_LOOP_LIMIT = Flag.FanFande_EXPERIMENTAL_AGENT_LOOP_LIMIT ?? 16

type RunningSession = {
    abort: AbortController;
   // lastAgent: string | undefined;
    //lastModel: any | undefined;
};

// ====================
// 业务模块：运行态控制
// ====================
// 这里只保存“当前正在执行”的 session loop 控制器，不保存历史消息。
// 历史会话状态统一以数据库为准，运行态只负责并发保护和取消信号。
export const state = Instance.state(() => {
    // 这里只跟踪当前正在运行的 prompt loop。
    const data: Record<string, RunningSession> = {};
    return data;
});

// ====================
// 业务模块：外部输入协议
// ====================
// prompt API 的原始入参会先经过这里校验，再被拆成 message / part 两层结构。
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
    variant: z.string().optional(),
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

// function start(sessionID: string): AbortController | undefined {
//     // 为当前 session 注册唯一的取消信号；若已存在，说明已有 loop 正在运行。
//     const running = state();
//     if (running[sessionID]) return;

//     const controller = new AbortController();
//     running[sessionID] = {
//         abort: controller,
//         latestAgent:Input.
//     };

//     return controller;
// }

function finish(sessionID: string, controller?: AbortController) {
    const running = state();
    const current = running[sessionID];
    if (!current) return;
    if (controller && current.abort !== controller) return;
    delete running[sessionID];
}

async function waitForStop(sessionID: string) {
    while (state()[sessionID]) {
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
}

export function cancel(sessionID: string) {
    // 主动中断某个正在运行的 loop，并从运行态注册表中移除。
    const running = state();
    const current = running[sessionID];
    if (!current) return false;

    current.abort.abort();
    delete running[sessionID];
    return true;
}

async function runLoop(input: LoopRuntimeInput): Promise<Message.WithParts> {
    const { sessionID, abort, controller } = input;
    const session = Session.DataBaseRead("sessions", sessionID);
    if (!session) {
        throw new Error(`Session '${sessionID}' was not found.`);
    }

    let currentAssistant: Message.Assistant | undefined;
    let iteration = 0;
    try {
        while (true) {
            if (abort.aborted) throw new Error("Prompt aborted");

            Status.set(sessionID, { type: "busy" });
            //组装 history  memory
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

            const agent = (await Agent.get(lastUser.agent)) ?? Agent.planAgent;
            const maxLoopIterations = Math.min(agent.steps ?? DEFAULT_PROMPT_LOOP_LIMIT, DEFAULT_PROMPT_LOOP_LIMIT);
            iteration += 1;
            if (iteration > maxLoopIterations) {
                log.error("prompt loop exceeded maximum iterations", {
                    sessionID,
                    userMessageID: lastUser.id,
                    agent: agent.name,
                    maxLoopIterations,
                });
                throw new Error(
                    `Prompt loop exceeded ${maxLoopIterations} iterations without reaching a final response.`,
                );
            }

            const outstandingTool = findOutstandingToolAfterUser(messages, lastUser.id);
            if (outstandingTool) {
                log.warn("stopping prompt loop because the latest user turn still has an unresolved tool", {
                    sessionID,
                    assistantID: outstandingTool.assistant.id,
                    toolCallID: outstandingTool.toolPart.callID,
                    tool: outstandingTool.toolPart.tool,
                    status: outstandingTool.toolPart.state.status,
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

            //获得runtime model
            const model = await Provider.getModel(lastUser.model.providerID, lastUser.model.modelID);

            const assistantMessage = createAssistantMessage(sessionID, lastUser, model);
            currentAssistant = assistantMessage;
            await Session.updateMessage(assistantMessage);

            //解析工具参数
            const tools = await resolveTools({
                agent,
                sessionID,
                messageID: assistantMessage.id,
                abort,
            });

            //组装 静态系统提示词,(base + 项目环境)
            const system = [
                //SystemPrompt.provider(model),//每一个模型对应一个system prompt，我觉得不是很必要
                ...SystemPrompt.defaultPrompt(),
                ...await SystemPrompt.environment(model),
            ]



            const processor = Processor.create({
                Assistant: assistantMessage,
                abort,
            });

            let processResult: Awaited<ReturnType<typeof processor.process>>;
            try {
                processResult = await processor.process({
                    user: lastUser,
                    sessionID,
                    messageID: assistantMessage.id,
                    model,
                    agent,
                    system: system,
                    abort,
                    messages: await Message.toModelMessages(messages, model, {
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
                await Session.updateMessage(assistantMessage);
                throw error;
            }

            await Session.updateMessage(assistantMessage);

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

        return latest;
    } finally {
        finish(sessionID, controller);
        Status.set(sessionID, { type: "idle" });
    }
}

// ====================
// 业务模块：入口编排
// ====================
// prompt 入口负责两件事：
// 1. 校验目标 session 存在
// 2. 先落库用户消息，再启动推理循环
export const prompt = fn(PromptInput, async (input) => {
    const session = Session.DataBaseRead("sessions", input.sessionID);
    if (!session) {
        throw new Error(`Session '${input.sessionID}' was not found.`);
    }

    //已有 loop 正在运行。
    if (state()[input.sessionID]) {
        throw new Error(`Session '${input.sessionID}' is already running.`);
    }
    //
    const controller = new AbortController();
    state()[input.sessionID] = {
        abort: controller,
        //lastAgent: input.agent,
        //lastModel: input.model,
    };

    const baselineSnapshot = await Snapshot.track().catch((error) => {
        log.warn("failed to capture pre-turn snapshot", {
            sessionID: input.sessionID,
            error: error instanceof Error ? error.message : String(error),
        })
        return undefined
    })

    let userMessage: Awaited<ReturnType<typeof createUserMessage>>


    try {
        //判断当前session最新的assistant message是什么mode，如果mode发生变化，插入一个system message
        //Session.DataBaseRead("messages")
        userMessage = await createUserMessage(input, {
            snapshot: baselineSnapshot,
        });
    } catch (error) {
        finish(input.sessionID, controller);
        Status.set(input.sessionID, { type: "idle" });
        throw error;
    }

    try {
        const result = await runLoop({
            sessionID: input.sessionID,
            abort: controller.signal,
            controller,
        });

        await persistDiffArtifacts({
            sessionID: input.sessionID,
            userMessageID: userMessage.messageinfo.id,
            snapshot: baselineSnapshot,
            assistantMessageID: result.info.role === "assistant" ? result.info.id : undefined,
        }).catch((error) => {
            log.warn("failed to persist prompt diff artifacts", {
                sessionID: input.sessionID,
                error: error instanceof Error ? error.message : String(error),
            })
        })

        return result
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
        }).catch((persistError) => {
            log.warn("failed to persist prompt diff artifacts after error", {
                sessionID: input.sessionID,
                error: persistError instanceof Error ? persistError.message : String(persistError),
            })
        })

        throw error
    }
});

export const ResumeInput = z.object({
    sessionID: Identifier.schema("session"),
});

// resume 不创建新的 user message，只尝试继续推进既有会话。
export const resume = fn(ResumeInput, async (input) => {
    const session = Session.DataBaseRead("sessions", input.sessionID);
    if (!session) {
        throw new Error(`Session '${input.sessionID}' was not found.`);
    }

    await waitForStop(input.sessionID);

    //const controller = start(input.sessionID);


    // 为当前 session 注册唯一的取消信号；若已存在，说明已有 loop 正在运行。
    const running = state();
    if (running[input.sessionID])
        throw new Error(`Session '${input.sessionID}' is already running.`);

    const controller = new AbortController();
    running[input.sessionID] = {
        abort: controller,

    };
    const latestUser = SessionDiff.findLatestUserMessageWithSnapshot(input.sessionID)

    try {
        const result = await runLoop({
            sessionID: input.sessionID,
            abort: controller.signal,
            controller,
        });

        await persistDiffArtifacts({
            sessionID: input.sessionID,
            userMessageID: latestUser?.message.id ?? "",
            snapshot: latestUser?.snapshot,
            assistantMessageID: result.info.role === "assistant" ? result.info.id : undefined,
        }).catch((error) => {
            log.warn("failed to persist resume diff artifacts", {
                sessionID: input.sessionID,
                error: error instanceof Error ? error.message : String(error),
            })
        })

        return result
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
        }).catch((persistError) => {
            log.warn("failed to persist resume diff artifacts after error", {
                sessionID: input.sessionID,
                error: persistError instanceof Error ? persistError.message : String(persistError),
            })
        })

        throw error
    }
});

type LoopRuntimeInput = {
    sessionID: string
    abort: AbortSignal
    controller: AbortController
}

// ====================
// 业务模块：上下文重建
// ====================
// 每一轮都从 messages + parts 重建上下文，而不是依赖内存中的缓存副本。
// 这样工具执行写入的新 part、恢复会话后的补写等状态都能自然进入下一轮推理。
function loadMessagesWithParts(sessionID: string): Message.WithParts[] {
    // 每轮都从 messages + parts 重建上下文，避免内存态与数据库脱节。
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

function findOutstandingToolAfterUser(
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
                assistant: message.info as Message.Assistant,
                toolPart,
            };
        }
    }
}

function isFinalFinishReason(finishReason?: string) {
    // `tool-calls` / `unknown` 往往意味着当前轮还没有真正收束，
    // 其余 finish reason 才可以视为最终回答。
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
}) {
    if (!input.snapshot || !input.userMessageID) return

    const message = db.findById("messages", Message.MessageInfo, input.userMessageID)
    if (!message || message.role !== "user") return

    const diffSummary = await SessionDiff.computeDiffSummaryFromSnapshot(input.snapshot)
    const nextUser: Message.User = {
        ...(message as Message.User),
        diffSummary,
    }
    await Session.updateMessage(nextUser)

    if (!input.assistantMessageID) return

    const existingPatch = readPatchPart(input.assistantMessageID)
    if (diffSummary.diffs.length === 0) {
        if (existingPatch) {
            db.deleteById("parts", existingPatch.id)
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

    await Session.updatePart(patchPart)
}

// 先创建 assistant message 的“骨架记录”。
// 真正的文本、推理链、工具调用结果会在 Processor 执行期间作为 part 持续补齐。
function createAssistantMessage(
    sessionID: string,
    lastUser: Message.User,
    model: Provider.Model,
): Message.Assistant {
    return {
        id: Identifier.ascending("message"),
        sessionID,
        role: "assistant",
        created: Date.now(),
        parentID: "",
        modelID: model.id,
        providerID: model.providerID,
        agent: lastUser.agent,
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

// ====================
// 业务模块：推理循环协调器
// ====================
// loop 是 session 级状态机，它把一次完整回答拆成多个“单轮 processor 执行”：
// 1. 从数据库重建最新上下文
// 2. 判断当前输入是否已经被回复
// 3. 绑定模型和工具，创建本轮 assistant 壳消息
// 4. 调用 Processor 执行单轮推理和工具调用
// 5. 根据 finishReason / process 结果决定是否继续下一轮
// ====================
// 业务模块：输入归一化
// ====================
// 把外部 prompt 入参里的 part 转成数据库统一使用的 Part 结构。
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

// ====================
// 业务模块：用户消息入库
// ====================
// 用户输入会先落成一条 user message，再拆成多条 part。
// 这样后续无论是模型消费、UI 展示，还是工具补写，都可以复用同一套消息模型。
async function createUserMessage(input: PromptInput, options?: { snapshot?: string }) {
    const messageinfo: Message.User = {
        id: Identifier.ascending("message"),
        sessionID: input.sessionID,
        role: "user",
        created: Date.now(),
        agent: input.agent ?? "default",
        model: input.model ?? await Provider.getDefaultModelRef(),
        system: input.system,
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

    if (Message.User.safeParse(messageinfo).success) {
        Session.DataBaseCreate("messages", messageinfo);
    }

    // part 校验失败不会阻断整条消息入库，但会打日志，便于排查调用方传参问题。
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

    for (const part of parts) {
        Session.DataBaseCreate("parts", part);
    }

    return {
        messageinfo,
        parts,
    };
}
