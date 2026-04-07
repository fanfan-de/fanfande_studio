import * as AI from "ai";
import z from "zod"
import { Snapshot } from "../snapshot"
import {
    //     APICallError,
    //     convertToModelMessages,
    //     LoadAPIKeyError,
    type ModelMessage,
    type UIMessage,
    type UserModelMessage,
    type SystemModelMessage,
    type AssistantModelMessage,
    type ToolModelMessage,
    //     type UserContent,
    //     type TextPart, //as aiTextPart,
    //     type FilePart, //as aiFilePart,
    //     type ImagePart,//as aiImagePart
    //     type ReasoningUIPart,
    //     type ToolContent,
} from "ai"
import { NamedError } from "#util/error.ts"
import { define } from "#bus/bus-event.ts"
import { iife } from "#util/iife.ts"
import * as  Identifier from "#id/id.ts";
import { fn } from "#util/fn.ts";
import * as db from "#database/Sqlite.ts"
import type * as Agent from "#agent/agent.ts"
import * as Provider from "#provider/provider.ts"
import * as Permission from "#permission/schema.ts"

export const OutputLengthError = NamedError.create("MessageOutputLengthError", z.object({}))
export const AbortedError = NamedError.create("MessageAbortedError", z.object({ message: z.string() }))
export const AuthError = NamedError.create(
    "ProviderAuthError",
    z.object({
        providerID: z.string(),
        message: z.string(),
    }),
)
export const APIError = NamedError.create(
    "APIError",
    z.object({
        message: z.string(),
        statusCode: z.number().optional(),
        isRetryable: z.boolean(),
        responseHeaders: z.record(z.string(), z.string()).optional(),
        responseBody: z.string().optional(),
        metadata: z.record(z.string(), z.string()).optional(),
    }),
)
export type APIError = z.infer<typeof APIError.Schema>

const PartBase = z.object({
    id: z.string(),
    sessionID: z.string(),
    messageID: z.string()
})

export const SnapshotPart = PartBase.extend({
    type: z.literal("snapshot"),
    snapshot: z.string(),
}).meta({
    ref: "SnapshotPart",
})
export type SnapshotPart = z.infer<typeof SnapshotPart>

export const PatchPart = PartBase.extend({
    type: z.literal("patch"),
    hash: z.string(),
    files: z.string().array(),
}).meta({
    ref: "PatchPart",
})
export type PatchPart = z.infer<typeof PatchPart>

export const TextPart = PartBase.extend({
    type: z.literal("text"),
    text: z.string(),
    synthetic: z.boolean().optional(), // 鏍囪鏄惁涓虹郴缁熷悎鎴愮殑鏂囨湰锛堣€岄潪妯″瀷鐢熸垚鐨勶級
    ignored: z.boolean().optional(),   // 鏍囪璇ユ枃鏈槸鍚﹀簲璇ヨ鍙戦€佺粰 LLM锛堜緥濡備粎鐢ㄤ簬 UI 灞曠ず鐨勬彁绀猴級
    time: z
        .object({
            start: z.number(),
            end: z.number().optional(),
        })
        .optional(),
    metadata: z.record(z.string(), z.any()).optional(),
}).meta({
    ref: "TextPart",
})
export type TextPart = z.infer<typeof TextPart>

export const ReasoningPart = PartBase.extend({
    type: z.literal("reasoning"),
    text: z.string(),
    metadata: z.record(z.string(), z.any()).optional(),
    time: z.object({
        start: z.number(),
        end: z.number().optional(),
    }),
}).meta({
    ref: "ReasoningPart",
})
export type ReasoningPart = z.infer<typeof ReasoningPart>

const FilePartSourceBase = z.object({
    text: z
        .object({
            value: z.string(),
            start: z.number().int(),
            end: z.number().int(),
        })
        .meta({
            ref: "FilePartSourceText",
        }),
})

export const FileSource = FilePartSourceBase.extend({
    type: z.literal("file"),
    path: z.string(),
}).meta({
    ref: "FileSource",
})

export const SymbolSource = FilePartSourceBase.extend({
    type: z.literal("symbol"), // 鏉ヨ嚜 LSP (Language Server Protocol) 鐨勭鍙峰畾锟?
    path: z.string(),
    //range: LSP.Range,
    name: z.string(),
    kind: z.number().int(),
}).meta({
    ref: "SymbolSource",
})

export const ResourceSource = FilePartSourceBase.extend({
    type: z.literal("resource"), // 澶栭儴璧勬簮锛堝鏂囨。閾炬帴鍐呭锟?
    clientName: z.string(),
    uri: z.string(),
}).meta({
    ref: "ResourceSource",
})

export const FilePartSource = z.discriminatedUnion("type", [FileSource, SymbolSource, ResourceSource]).meta({
    ref: "FilePartSource",
})

export const FilePart = PartBase.extend({
    type: z.literal("file"),
    mime: z.string(),
    filename: z.string().optional(),
    url: z.string(), // 閫氬父锟?Data URL 鎴栧唴閮ㄥ瓨鍌ㄩ摼锟?
    source: FilePartSource.optional(),
}).meta({
    ref: "FilePart",
})
export type FilePart = z.infer<typeof FilePart>

export const ImagePart = PartBase.extend({
    type: z.literal("image"),
    mime: z.string(),
    filename: z.string().optional(),
    url: z.string(), // 閫氬父锟?Data URL 鎴栧唴閮ㄥ瓨鍌ㄩ摼锟?
    source: FilePartSource.optional(),
}).meta({
    ref: "ImagePart",
})
export type ImagePart = z.infer<typeof ImagePart>

export const AgentPart = PartBase.extend({
    type: z.literal("agent"),
    name: z.string(),
    source: z
        .object({
            value: z.string(),
            start: z.number().int(),
            end: z.number().int(),
        })
        .optional(),
}).meta({
    ref: "AgentPart",
})
export type AgentPart = z.infer<typeof AgentPart>

export const CompactionPart = PartBase.extend({
    type: z.literal("compaction"),
    auto: z.boolean(),
}).meta({
    ref: "CompactionPart",
})
export type CompactionPart = z.infer<typeof CompactionPart>

export const ToolStatePending = z
    .object({
        status: z.literal("pending"),
        input: z.record(z.string(), z.any()),
        raw: z.string(), // 鍘熷锟?JSON 瀛楃涓诧紝鐢ㄤ簬璋冭瘯瑙ｆ瀽閿欒
    })
    .meta({
        ref: "ToolStatePending",
    })
export type ToolStatePending = z.infer<typeof ToolStatePending>

export const ToolStateRunning = z
    .object({
        status: z.literal("running"),
        input: z.record(z.string(), z.any()),
        title: z.string().optional(),
        metadata: z.record(z.string(), z.any()).optional(),
        time: z.object({
            start: z.number(),
        }),
    })
    .meta({
        ref: "ToolStateRunning",
    })
export type ToolStateRunning = z.infer<typeof ToolStateRunning>

export const ToolStateCompleted = z
    .object({
        status: z.literal("completed"),
        input: z.record(z.string(), z.any()),
        output: z.preprocess((value) => normalizeToolOutputText(value), z.string()),
        title: z.string(),
        metadata: z.record(z.string(), z.any()),
        time: z.object({
            start: z.number(),
            end: z.number(),
            compacted: z.number().optional(), // 濡傛灉宸ュ叿杈撳嚭杩囬暱琚帇缂╋紝璁板綍鍘嬬缉鏃堕棿
        }),
        attachments: FilePart.array().optional(), // 宸ュ叿鍙互杩斿洖鏂囦欢锛堝鐢熸垚鐨勫浘鐗囷級
    })
    .meta({
        ref: "ToolStateCompleted",
    })
export type ToolStateCompleted = z.infer<typeof ToolStateCompleted>

export const ToolStateWaitingApproval = z
    .object({
        status: z.literal("waiting-approval"),
        approvalID: z.string(),
        input: z.record(z.string(), z.any()),
        title: z.string().optional(),
        metadata: z.record(z.string(), z.any()).optional(),
        time: z.object({
            start: z.number(),
        }),
    })
    .meta({
        ref: "ToolStateWaitingApproval",
    })
export type ToolStateWaitingApproval = z.infer<typeof ToolStateWaitingApproval>

export const ToolStateDenied = z
    .object({
        status: z.literal("denied"),
        approvalID: z.string().optional(),
        input: z.record(z.string(), z.any()),
        reason: z.string(),
        metadata: z.record(z.string(), z.any()).optional(),
        time: z.object({
            start: z.number(),
            end: z.number(),
        }),
    })
    .meta({
        ref: "ToolStateDenied",
    })
export type ToolStateDenied = z.infer<typeof ToolStateDenied>

export const ToolStateError = z
    .object({
        status: z.literal("error"),
        input: z.record(z.string(), z.any()),
        error: z.string(),
        metadata: z.record(z.string(), z.any()).optional(),
        time: z.object({
            start: z.number(),
            end: z.number(),
        }),
    })
    .meta({
        ref: "ToolStateError",
    })
export type ToolStateError = z.infer<typeof ToolStateError>

export function normalizeToolOutputText(output: unknown): string {
    if (typeof output === "string") return output
    if (output == null) return ""

    if (typeof output === "object") {
        const candidate = output as Record<string, unknown>
        if (typeof candidate.result === "string") return candidate.result
        if (typeof candidate.value === "string") return candidate.value
        if (typeof candidate.text === "string") return candidate.text

        try {
            const serialized = JSON.stringify(output)
            if (serialized) return serialized
        } catch {
            // ignore and fall through to String(output)
        }
    }

    return String(output)
}

export const ToolState = z
    .discriminatedUnion("status", [
        ToolStatePending,
        ToolStateRunning,
        ToolStateWaitingApproval,
        ToolStateCompleted,
        ToolStateDenied,
        ToolStateError,
    ])
    .meta({
        ref: "ToolState",
    })

export const ToolPart = PartBase.extend({
    type: z.literal("tool"),
    callID: z.string(),
    tool: z.string(),
    state: ToolState,
    metadata: z.record(z.string(), z.any()).optional(),
}).meta({
    ref: "ToolPart",
})
export type ToolPart = z.infer<typeof ToolPart>

export const PermissionPart = PartBase.extend({
    type: z.literal("permission"),
    approvalID: z.string(),
    toolCallID: z.string(),
    tool: z.string(),
    action: Permission.Action,
    scope: Permission.ApprovalScope.optional(),
    reason: z.string().optional(),
    created: z.number(),
}).meta({
    ref: "PermissionPart",
})
export type PermissionPart = z.infer<typeof PermissionPart>

export const SubtaskPart = PartBase.extend({
    type: z.literal("subtask"),
    prompt: z.string(),
    description: z.string(),
    agent: z.string(),
    model: z
        .object({
            providerID: z.string(),
            modelID: z.string(),
        })
        .optional(),
    command: z.string().optional(),
}).meta({
    ref: "SubtaskPart",
})
export type SubtaskPart = z.infer<typeof SubtaskPart>

export const StepStartPart = PartBase.extend({
    type: z.literal("step-start"),
    snapshot: z.string().optional(),
}).meta({
    ref: "StepStartPart",
})
export type StepStartPart = z.infer<typeof StepStartPart>

export const StepFinishPart = PartBase.extend({
    type: z.literal("step-finish"),
    reason: z.string(),
    snapshot: z.string().optional(),
    cost: z.number(),
    tokens: z.object({
        input: z.number(),
        output: z.number(),
        reasoning: z.number(),
        cache: z.object({
            read: z.number(),
            write: z.number(),
        }),
    }),
}).meta({
    ref: "StepFinishPart",
})
export type StepFinishPart = z.infer<typeof StepFinishPart>

export const RetryPart = PartBase.extend({
    type: z.literal("retry"),
    attempt: z.number(),
    //error: APIError.Schema,
    time: z.object({
        created: z.number(),
    }),
}).meta({
    ref: "RetryPart",
})
export type RetryPart = z.infer<typeof RetryPart>

export const Part = z
    .discriminatedUnion("type", [
        TextPart,
        SubtaskPart,
        ReasoningPart,
        FilePart,
        ToolPart,
        PermissionPart,
        StepStartPart,
        StepFinishPart,
        SnapshotPart,
        PatchPart,
        AgentPart,
        RetryPart,
        CompactionPart,
        ImagePart,
    ])
    .meta({
        ref: "Part",
    })
export type Part = z.infer<typeof Part>


//---------------Message Meta Data----------------------------------------------------------------------------

const Base = z.object({
    id: z.string(),
    sessionID: z.string(),
})
export const User = Base.extend({
    role: z.literal("user"),
    created: z.number(),
    diffSummary: z
        .object({
            title: z.string().optional(),
            body: z.string().optional(),
            diffs: Snapshot.FileDiff.array(),
        })
        .optional(),
    agent: z.string(),
    model: z.object({
        providerID: z.string(),
        modelID: z.string(),
    }),
    system: z.string().optional(),
    tools: z.record(z.string(), z.boolean()).optional(),
    variant: z.string().optional(),
}).meta({
    ref: "UserMessage",
})
export type User = z.infer<typeof User>

export const Assistant = Base.extend({
    role: z.literal("assistant"),
    created: z.number(),
    completed: z.number().optional(),
    error: z
        .discriminatedUnion("name", [
            AuthError.Schema,
            NamedError.Unknown.Schema,
            OutputLengthError.Schema,
            AbortedError.Schema,
            APIError.Schema,
        ])
        .optional(),
    parentID: z.string(),
    modelID: z.string(),
    providerID: z.string(),
    agent: z.string(),
    path: z.object({
        cwd: z.string(),
        root: z.string(),
    }),
    summary: z.boolean().optional(),
    cost: z.number(),
    tokens: z.object({
        input: z.number(),
        output: z.number(),
        reasoning: z.number(),
        cache: z.object({
            read: z.number(),
            write: z.number(),
        }),
    }),
    finishReason: z.string().optional(),
}).meta({
    ref: "AssistantMessage",
})
export type Assistant = z.infer<typeof Assistant>

export const MessageInfo = z.discriminatedUnion("role", [User, Assistant]).meta({
    ref: "Message",
})
export type MessageInfo = z.infer<typeof MessageInfo>

//messge鐨刢ontent + Meta锛屽氨鍙互鐞嗚В涓轰竴锟?message
export const WithParts = z.object({
    info: MessageInfo,//meta鏁版嵁
    parts: z.array(Part),//娑堟伅鐨勫叿浣撳唴锟?
})
export type WithParts = z.infer<typeof WithParts>

// function Create<T extends z.ZodObject>(rawshape: z.ZodRawShape): T {
//     const result = z.object(rawshape)
//     return result
// }


// TODO: move message events out of message.ts after the schema settles.
export const Event = {
    Updated: define(
        "message.updated",
        z.object({
            info: MessageInfo,
        }),
    ),
    Removed: define(
        "message.removed",
        z.object({
            sessionID: z.string(),
            messageID: z.string(),
        }),
    ),
    PartUpdated: define(
        "message.part.updated",
        z.object({
            part: Part,
            delta: z.string().optional(),
        }),
    ),
    PartRemoved: define(
        "message.part.removed",
        z.object({
            sessionID: z.string(),
            messageID: z.string(),
            partID: z.string(),
        }),
    ),
    PartDelta: define(
        "message.part.delta",
        z.object({
            sessionID: z.string(),
            messageID: z.string(),
            partID: z.string(),
            field: z.string(),
            delta: z.string(),
        })
    )
}

// TODO: move message streaming/query helpers out of message.ts after the schema settles.
export async function* stream(sessionID: string): AsyncGenerator<WithParts> {
    const messages = db.findManyWithSchema("messages", MessageInfo, {
        where: [{ column: "sessionID", value: sessionID }],
        orderBy: [
            { column: "created", direction: "ASC" },
            { column: "id", direction: "ASC" },
        ],
    })

    const parts = db.findManyWithSchema("parts", Part, {
        where: [{ column: "sessionID", value: sessionID }],
        orderBy: [{ column: "id", direction: "ASC" }],
    })

    const partsByMessageID = new Map<string, Part[]>()
    for (const part of parts) {
        const list = partsByMessageID.get(part.messageID) ?? []
        list.push(part)
        partsByMessageID.set(part.messageID, list)
    }

    for (const message of messages) {
        yield {
            info: message,
            parts: partsByMessageID.get(message.id) ?? [],
        }
    }
}

/**
 * 灏嗛」鐩唴閮ㄧ殑娑堟伅鏍煎紡 WithParts[] 杞崲锟?AI SDK 鐨勬秷鎭牸锟?ModelMessage[]
 * 
 * 姝ゅ嚱鏁伴亶鍘嗘瘡锟?WithParts 瀵硅薄锛屾牴鎹秷鎭鑹诧紙user/assistant锛夎浆鎹负瀵瑰簲锟?AI SDK 娑堟伅瑙掕壊锟?
 * 骞跺皢姣忎釜娑堟伅鐨勯儴鍒嗭紙parts锛夎浆鎹负 AI SDK 鏀寔鐨勫唴瀹圭被鍨嬶紙text銆乺easoning銆乫ile銆乮mage銆乼ool-call銆乼ool-result锛夛拷?
 * 杞崲杩囩▼涓細妫€鏌ユā鍨嬬殑鑳藉姏锛坈apabilities锛夛紝杩囨护鎺夋ā鍨嬩笉鏀寔鐨勫唴瀹圭被鍨嬶拷?
 * 
 * @param input - 椤圭洰鍐呴儴鐨勬秷鎭暟缁勶紝姣忎釜娑堟伅鍖呭惈鍏冩暟鎹紙info锛夊拰鍐呭閮ㄥ垎锛坧arts锟?
 * @param model - 鎻愪緵鑰呮ā鍨嬶紝鍖呭惈妯″瀷鐨勮兘鍔涢厤缃紝鐢ㄤ簬杩囨护涓嶆敮鎸佺殑鍐呭绫诲瀷
 * @returns 绗﹀悎 AI SDK 鏍煎紡鐨勬秷鎭暟缁勶紝鍙洿鎺ョ敤锟?AI SDK 锟?API 璋冪敤
 */
// TODO: move model message conversion out of message.ts after the schema settles.
export async function toModelMessages(
    input: WithParts[],
    model: Provider.Model,
    options?: {
        agent?: Agent.AgentInfo
    },
): Promise<ModelMessage[]> {
    const result: ModelMessage[] = []
    const toolRuntimeCache = new Map<string, Promise<any | undefined>>()

    async function getToolModules() {
        const [toolModule, registryModule] = await Promise.all([
            import("#tool/tool.ts"),
            import("#tool/registry.ts"),
        ])

        return {
            Tool: toolModule,
            ToolRegistry: registryModule,
        }
    }

    function convertPartToAIPart(part: Part, model: Provider.Model): any | any[] | null {
        switch (part.type) {
            case "text":
                if (part.ignored) return null
                return {
                    type: "text" as const,
                    text: part.text,
                }
            case "reasoning":
                if (!model.capabilities.reasoning) return null
                return {
                    type: "reasoning" as const,
                    text: part.text,
                }
            case "file":
                if (!model.capabilities.attachment) return null
                return {
                    type: "file" as const,
                    mime: part.mime,
                    url: part.url,
                    filename: part.filename,
                }
            case "image":
                if (!model.capabilities.attachment) return null
                return {
                    type: "image" as const,
                    mime: part.mime,
                    url: part.url,
                    filename: part.filename,
                }
            case "tool":
            case "permission":
                return null
            default:
                return null
        }
    }

    async function resolveToolModelOutput(part: ToolPart): Promise<{
        type: "text" | "json" | "error-text" | "error-json" | "execution-denied"
        value?: unknown
        reason?: string
    }> {
        const state = part.state
        if (state.status === "denied") {
            return {
                type: "execution-denied",
                reason: state.reason,
            }
        }

        if (state.status === "error") {
            return {
                type: "error-text",
                value: state.error,
            }
        }

        const cachedRuntime = toolRuntimeCache.get(part.tool) ?? (async () => {
            const { ToolRegistry } = await getToolModules()
            const info = await ToolRegistry.get(part.tool)
            if (!info) return undefined
            return info.init(options?.agent ? { agent: options.agent } : undefined)
        })()

        toolRuntimeCache.set(part.tool, cachedRuntime)
        const runtime = await cachedRuntime
        const completed = state as ToolStateCompleted
        const reconstructed = {
            text: completed.output,
            title: completed.title,
            metadata: completed.metadata,
            attachments: completed.attachments?.map((attachment) => ({
                url: attachment.url,
                mime: attachment.mime,
                filename: attachment.filename,
            })),
        }

        const { Tool } = await getToolModules()
        if (!runtime?.toModelOutput) {
            return Tool.normalizeToolModelOutput(reconstructed.text)
        }

        return Tool.normalizeToolModelOutput(await runtime.toModelOutput(reconstructed))
    }

    for (const item of input) {
        const role = item.info.role
        let aiRole: "user" | "assistant"
        if (role === "user") {
            aiRole = "user"
        } else if (role === "assistant") {
            aiRole = "assistant"
        } else {
            continue
        }

        const orderedParts = [...item.parts].sort((a, b) => a.id.localeCompare(b.id))
        const approvalsByToolCallID = new Map<string, PermissionPart[]>()
        for (const part of orderedParts) {
            if (part.type !== "permission") continue
            const list = approvalsByToolCallID.get(part.toolCallID) ?? []
            list.push(part)
            approvalsByToolCallID.set(part.toolCallID, list)
        }

        const assistantContent: any[] = []
        const flushAssistant = () => {
            if (assistantContent.length === 0) return
            result.push({
                role: aiRole,
                content: [...assistantContent],
            } as ModelMessage)
            assistantContent.length = 0
        }

        for (const part of orderedParts) {
            if (aiRole === "assistant" && part.type === "tool") {
                const state = part.state
                const approvals = approvalsByToolCallID.get(part.callID) ?? []
                const approvalRequest = approvals.find((approval) => approval.action === "ask")
                const approvalResponse = approvals.find(
                    (approval) => approval.action === "allow" || approval.action === "deny",
                )

                if (
                    state.status === "waiting-approval" ||
                    state.status === "completed" ||
                    state.status === "error" ||
                    state.status === "denied"
                ) {
                    flushAssistant()

                    const assistantToolContent: any[] = [
                        {
                            type: "tool-call" as const,
                            toolCallId: part.callID,
                            toolName: part.tool,
                            input: state.input,
                        },
                    ]

                    if (approvalRequest) {
                        assistantToolContent.push({
                            type: "tool-approval-request" as const,
                            approvalId: approvalRequest.approvalID,
                            toolCallId: part.callID,
                        })
                    }

                    result.push({
                        role: "assistant",
                        content: assistantToolContent,
                    } as ModelMessage)

                    const toolContent: any[] = []
                    if (approvalRequest && approvalResponse) {
                        toolContent.push({
                            type: "tool-approval-response" as const,
                            approvalId: approvalRequest.approvalID,
                            approved: approvalResponse.action === "allow",
                            reason: approvalResponse.reason,
                        })
                    }

                    if (state.status === "completed" || state.status === "error" || state.status === "denied") {
                        toolContent.push({
                            type: "tool-result" as const,
                            toolCallId: part.callID,
                            toolName: part.tool,
                            output: await resolveToolModelOutput(part),
                        })
                    }

                    if (toolContent.length > 0) {
                        result.push({
                            role: "tool",
                            content: toolContent as any,
                        } as ModelMessage)
                    }
                    continue
                }
            }

            const aiPart = convertPartToAIPart(part, model)
            if (!aiPart) continue

            if (Array.isArray(aiPart)) {
                assistantContent.push(...aiPart)
            } else {
                assistantContent.push(aiPart)
            }
        }

        flushAssistant()
    }

    return result
}


