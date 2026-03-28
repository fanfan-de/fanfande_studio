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
import * as Provider from "#provider/provider.ts"

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
    sessionid: z.string(),
    messageid: z.string()
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
    synthetic: z.boolean().optional(), // 标记是否为系统合成的文本（而非模型生成的）
    ignored: z.boolean().optional(),   // 标记该文本是否应该被发送给 LLM（例如仅用于 UI 展示的提示）
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
    type: z.literal("symbol"), // 来自 LSP (Language Server Protocol) 的符号定�?
    path: z.string(),
    //range: LSP.Range,
    name: z.string(),
    kind: z.number().int(),
}).meta({
    ref: "SymbolSource",
})

export const ResourceSource = FilePartSourceBase.extend({
    type: z.literal("resource"), // 外部资源（如文档链接内容�?
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
    url: z.string(), // 通常�?Data URL 或内部存储链�?
    source: FilePartSource.optional(),
}).meta({
    ref: "FilePart",
})
export type FilePart = z.infer<typeof FilePart>

export const ImagePart = PartBase.extend({
    type: z.literal("image"),
    mime: z.string(),
    filename: z.string().optional(),
    url: z.string(), // 通常�?Data URL 或内部存储链�?
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
        raw: z.string(), // 原始�?JSON 字符串，用于调试解析错误
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
        output: z.string(),
        title: z.string(),
        metadata: z.record(z.string(), z.any()),
        time: z.object({
            start: z.number(),
            end: z.number(),
            compacted: z.number().optional(), // 如果工具输出过长被压缩，记录压缩时间
        }),
        attachments: FilePart.array().optional(), // 工具可以返回文件（如生成的图片）
    })
    .meta({
        ref: "ToolStateCompleted",
    })
export type ToolStateCompleted = z.infer<typeof ToolStateCompleted>

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

export const ToolState = z
    .discriminatedUnion("status", [ToolStatePending, ToolStateRunning, ToolStateCompleted, ToolStateError])
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
    /**
     * @deprecated
     */
    mode: z.string(),
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
    finish: z.string().optional(),
}).meta({
    ref: "AssistantMessage",
})
export type Assistant = z.infer<typeof Assistant>

export const MessageInfo = z.discriminatedUnion("role", [User, Assistant]).meta({
    ref: "Message",
})
export type MessageInfo = z.infer<typeof MessageInfo>

//messge的content + Meta，就可以理解为一�?message
export const WithParts = z.object({
    info: MessageInfo,//meta数据
    parts: z.array(Part),//消息的具体内�?
})
export type WithParts = z.infer<typeof WithParts>

// function Create<T extends z.ZodObject>(rawshape: z.ZodRawShape): T {
//     const result = z.object(rawshape)
//     return result
// }


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

export async function* stream(sessionID: string): AsyncGenerator<WithParts> {
    const messages = db.findManyWithSchema("messages", MessageInfo, {
        where: [{ column: "sessionID", value: sessionID }],
        orderBy: [
            { column: "created", direction: "ASC" },
            { column: "id", direction: "ASC" },
        ],
    })

    const parts = db.findManyWithSchema("parts", Part, {
        where: [{ column: "sessionid", value: sessionID }],
        orderBy: [{ column: "id", direction: "ASC" }],
    })

    const partsByMessageID = new Map<string, Part[]>()
    for (const part of parts) {
        const list = partsByMessageID.get(part.messageid) ?? []
        list.push(part)
        partsByMessageID.set(part.messageid, list)
    }

    for (const message of messages) {
        yield {
            info: message,
            parts: partsByMessageID.get(message.id) ?? [],
        }
    }
}

/**
 * 将项目内部的消息格式 WithParts[] 转换�?AI SDK 的消息格�?ModelMessage[]
 * 
 * 此函数遍历每�?WithParts 对象，根据消息角色（user/assistant）转换为对应�?AI SDK 消息角色�?
 * 并将每个消息的部分（parts）转换为 AI SDK 支持的内容类型（text、reasoning、file、image、tool-call、tool-result）�?
 * 转换过程中会检查模型的能力（capabilities），过滤掉模型不支持的内容类型�?
 * 
 * @param input - 项目内部的消息数组，每个消息包含元数据（info）和内容部分（parts�?
 * @param model - 提供者模型，包含模型的能力配置，用于过滤不支持的内容类型
 * @returns 符合 AI SDK 格式的消息数组，可直接用�?AI SDK �?API 调用
 */
export function toModelMessages(input: WithParts[], model: Provider.Model): ModelMessage[] {
    const result: ModelMessage[] = []
    /** 
     * 将单�?Part 转换�?AI SDK 支持的内容部�?
     * 根据 part.type 进行分发，检查模型能力，并构建对应的 AI SDK 内容对象
     * 
     * @param part - 项目内部的消息部�?
     * @param model - 提供者模型，用于检查能力支�?
     * @returns AI SDK 内容对象或数组，如果不支持则返回 null
     */
    function convertPartToAIPart(part: Part, model: Provider.Model): any | any[] | null {
        switch (part.type) {
            case "text":
                if (part.ignored) return null
                return {
                    type: "text" as const,
                    text: part.text
                }
            case "reasoning":
                if (!model.capabilities.reasoning) return null
                return {
                    type: "reasoning" as const,
                    text: part.text
                }
            case "file":
                if (!model.capabilities.attachment) return null
                return {
                    type: "file" as const,
                    mime: part.mime,
                    url: part.url,
                    filename: part.filename
                }
            case "image":
                if (!model.capabilities.attachment) return null
                return {
                    type: "image" as const,
                    mime: part.mime,
                    url: part.url,
                    filename: part.filename
                }
            case "tool":
                if (!model.capabilities.toolcall) return null
                const state = part.state
                if (state.status === "pending" || state.status === "running") {
                    return {
                        type: "tool-call" as const,
                        toolCallId: part.callID,
                        toolName: part.tool,
                        input: state.input,
                        providerMetadata: part.metadata
                    }
                } else if (state.status === "completed") {
                    return {
                        type: "tool-result" as const,
                        toolCallId: part.callID,
                        toolName: part.tool,
                        input: state.input,
                        output: {
                            result: state.output,
                            metadata: state.metadata,
                            title: state.title
                        },
                        attachments: state.attachments?.map(att => ({
                            type: "file" as const,
                            mime: att.mime,
                            url: att.url,
                            filename: att.filename
                        }))
                    }
                } else if (state.status === "error") {
                    return {
                        type: "tool-result" as const,
                        toolCallId: part.callID,
                        toolName: part.tool,
                        input: state.input,
                        output: {
                            result: state.error,
                            isError: true
                        }
                    }
                }
                return null
            default:
                return null
        }
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
        const content: any[] = []
        for (const part of item.parts) {
            const aiPart = convertPartToAIPart(part, model)
            if (aiPart) {
                if (Array.isArray(aiPart)) {
                    content.push(...aiPart)
                } else {
                    content.push(aiPart)
                }
            }
        }
        if (content.length > 0) {
            result.push({
                role: aiRole,
                content
            } as ModelMessage)
        }
    }
    return result
}


