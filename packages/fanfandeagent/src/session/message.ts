import * as AI from "ai";
import z from "zod"
import { Snapshot } from "../snapshot"
import {
    APICallError,
    convertToModelMessages,
    LoadAPIKeyError,
    type ModelMessage,
    type UIMessage,
    type UserModelMessage,
    type SystemModelMessage,
    type AssistantModelMessage,
    type ToolModelMessage,
    type UserContent,
    type TextPart, //as aiTextPart,
    type FilePart, //as aiFilePart,
    type ImagePart,//as aiImagePart
    type ReasoningUIPart,
    type ToolContent,
} from "ai"
import { NamedError } from "../util/error"
import { BusEvent } from "@/bus/bus-event"
import { iife } from "@/util/iife"
import { Identifier } from "@/id/id";
import { fn } from "@/util/fn";
import { Storage } from "../database/storage"

export namespace Message {

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
        type: z.literal("symbol"), // 来自 LSP (Language Server Protocol) 的符号定义
        path: z.string(),
        //range: LSP.Range,
        name: z.string(),
        kind: z.number().int(),
    }).meta({
        ref: "SymbolSource",
    })

    export const ResourceSource = FilePartSourceBase.extend({
        type: z.literal("resource"), // 外部资源（如文档链接内容）
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
        url: z.string(), // 通常是 Data URL 或内部存储链接
        source: FilePartSource.optional(),
    }).meta({
        ref: "FilePart",
    })
    export type FilePart = z.infer<typeof FilePart>

    export const ImagePart = PartBase.extend({
        type: z.literal("image"),
        mime: z.string(),
        filename: z.string().optional(),
        url: z.string(), // 通常是 Data URL 或内部存储链接
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
            raw: z.string(), // 原始的 JSON 字符串，用于调试解析错误
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
        summary: z
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

    export const Environment = Base.extend({
        // role: z.enum(["Envirnment" , "Function" , "Tool"]),
        role: z.literal("Envirnment"),
    }).meta({
        ref: "EnvironmontMessage",
    })
    export type Environment = z.infer<typeof Environment>

    export const Info = z.discriminatedUnion("role", [User, Assistant, Environment]).meta({
        ref: "Message",
    })
    export type Info = z.infer<typeof Info>

    //messge的content + Meta，就可以理解为一个 message
    export const WithParts = z.object({
        info: Info,//meta数据
        parts: z.array(Part),//消息的具体内容
    })
    export type WithParts = z.infer<typeof WithParts>


    export const Event = {
        Updated: BusEvent.define(
            "message.updated",
            z.object({
                info: Info,
            }),
        ),
        Removed: BusEvent.define(
            "message.removed",
            z.object({
                sessionID: z.string(),
                messageID: z.string(),
            }),
        ),
        PartUpdated: BusEvent.define(
            "message.part.updated",
            z.object({
                part: Part,
                delta: z.string().optional(),
            }),
        ),
        PartRemoved: BusEvent.define(
            "message.part.removed",
            z.object({
                sessionID: z.string(),
                messageID: z.string(),
                partID: z.string(),
            }),
        ),
    }



    export function toModelMessages(input: WithParts[]/*, model: Provider.Model*/): ModelMessage[] {
        const result: ModelMessage[] = []
        //const toolNames = new Set<string>()

        // const toModelOutput = (output: unknown) => {
        //     if (typeof output === "string") {
        //         return { type: "text", value: output }
        //     }

        //     if (typeof output === "object") {
        //         const outputObject = output as {
        //             text: string
        //             attachments?: Array<{ mime: string; url: string }>
        //         }
        //         const attachments = (outputObject.attachments ?? []).filter((attachment) => {
        //             return attachment.url.startsWith("data:") && attachment.url.includes(",")
        //         })

        //         return {
        //             type: "content",
        //             value: [
        //                 { type: "text", text: outputObject.text },
        //                 ...attachments.map((attachment) => ({
        //                     type: "media",
        //                     mediaType: attachment.mime,
        //                     data: iife(() => {
        //                         const commaIndex = attachment.url.indexOf(",")
        //                         return commaIndex === -1 ? attachment.url : attachment.url.slice(commaIndex + 1)
        //                     }),
        //                 })),
        //             ],
        //         }
        //     }

        //     return { type: "json", value: output as never }
        // }

        for (const msg of input) {
            if (msg.parts.length === 0) continue

            if (msg.info.role === "user") {
                const userMessage: UserModelMessage = {
                    role: "user",
                    content: [] as (AI.TextPart | AI.ImagePart | AI.FilePart)[]
                }
                result.push(userMessage)
                for (const part of msg.parts) {
                    //文本
                    if (part.type === "text" && !part.ignored)
                        (userMessage.content as (AI.TextPart | AI.ImagePart | AI.FilePart)[]).push({
                            type: "text",
                            text: part.text,
                        })
                    // 非文本、非目录的文件类型
                    if (part.type === "file" && part.mime !== "text/plain" && part.mime !== "application/x-directory")
                        (userMessage.content as (AI.TextPart | AI.ImagePart | AI.FilePart)[]).push({
                            type: "file",
                            data: part.url,
                            mediaType: part.mime,
                            filename: part.filename,
                            //providerOptions:
                        })
                    //Image
                    if (part.type === "image" && part.mime && part.mime.startsWith("image/")) {
                        (userMessage.content as (AI.TextPart | AI.ImagePart | AI.FilePart)[]).push({
                            type: "image" as const,
                            image: part.url,  // 可以是 URL 或 base64 字符串
                            mediaType: part.mime, // 例如 "image/jpeg", "image/png"
                            //providerOptions:
                        });
                    }

                    // if (part.type === "compaction") {
                    //     userMessage.parts.push({
                    //         type: "text",
                    //         text: "What did we do so far?",
                    //     })
                    // }

                    // if (part.type === "subtask") {
                    //     userMessage.parts.push({
                    //         type: "text",
                    //         text: "The following tool was executed by the user",
                    //     })
                    // }
                }
            }

            if (msg.info.role === "assistant") {
                // const differentModel = `${model.providerID}/${model.id}` !== `${msg.info.providerID}/${msg.info.modelID}`
                // if (
                //     msg.info.error &&
                //     !(
                //         Message.AbortedError.isInstance(msg.info.error) &&
                //         msg.parts.some((part) => part.type !== "step-start" && part.type !== "reasoning")
                //     )
                // ) {
                //     continue
                // }
                const assistantMessage: AssistantModelMessage = {
                    //id: msg.info.id,
                    role: "assistant",
                    content: [] as (AI.TextPart | AI.FilePart |
                        ReasoningPart | AI.ToolCallPart |
                        AI.ToolResultPart | AI.ToolApprovalRequest)[],
                    //providerOptions
                }
                for (const part of msg.parts) {
                    //文本
                    if (part.type === "text" && !part.ignored)
                        (assistantMessage.content as AI.TextPart[]).push({
                            type: "text",
                            text: part.text,
                        })
                    //FilePart
                    if (part.type === "file" && part.mime !== "text/plain" && part.mime !== "application/x-directory")
                        (assistantMessage.content as AI.FilePart[]).push({
                            type: "file",
                            data: part.url,
                            mediaType: part.mime,
                            filename: part.filename,
                            //providerOptions:
                        })
                    //
                    if (part.type === "reasoning") {
                        (assistantMessage.content as AI.ReasoningUIPart[]).push(
                            {
                                type: "reasoning",
                                text: part.text,
                                //state:part.
                                //providerMetadata
                            }
                        )
                    }

                    // if (part.type === "step-start")
                    //     assistantMessage.parts.push({
                    //         type: "step-start",
                    //     })
                    // if (part.type === "tool") {
                    //     toolNames.add(part.tool)
                    //     if (part.state.status === "completed") {
                    //         const outputText = part.state.time.compacted ? "[Old tool result content cleared]" : part.state.output
                    //         const attachments = part.state.time.compacted ? [] : (part.state.attachments ?? [])
                    //         const output =
                    //             attachments.length > 0
                    //                 ? {
                    //                     text: outputText,
                    //                     attachments,
                    //                 }
                    //                 : outputText

                    //         assistantMessage.parts.push({
                    //             type: ("tool-" + part.tool) as `tool-${string}`,
                    //             state: "output-available",
                    //             toolCallId: part.callID,
                    //             input: part.state.input,
                    //             output,
                    //             ...(differentModel ? {} : { callProviderMetadata: part.metadata }),
                    //         })
                    //     }
                    //     if (part.state.status === "error")
                    //         assistantMessage.parts.push({
                    //             type: ("tool-" + part.tool) as `tool-${string}`,
                    //             state: "output-error",
                    //             toolCallId: part.callID,
                    //             input: part.state.input,
                    //             errorText: part.state.error,
                    //             ...(differentModel ? {} : { callProviderMetadata: part.metadata }),
                    //         })
                    //     // Handle pending/running tool calls to prevent dangling tool_use blocks
                    //     // Anthropic/Claude APIs require every tool_use to have a corresponding tool_result
                    //     if (part.state.status === "pending" || part.state.status === "running")
                    //         assistantMessage.parts.push({
                    //             type: ("tool-" + part.tool) as `tool-${string}`,
                    //             state: "output-error",
                    //             toolCallId: part.callID,
                    //             input: part.state.input,
                    //             errorText: "[Tool execution was interrupted]",
                    //             ...(differentModel ? {} : { callProviderMetadata: part.metadata }),
                    //         })
                    // }
                    // if (part.type === "reasoning") {
                    //     assistantMessage.parts.push({
                    //         type: "reasoning",
                    //         text: part.text,
                    //         ...(differentModel ? {} : { providerMetadata: part.metadata }),
                    //     })
                    // }
                }
                if (assistantMessage.content.length > 0) {
                    result.push(assistantMessage)
                }
            }

            if (msg.info.role === "Envirnment") {

                const environmentMessage: ToolModelMessage = {
                    role: "tool",
                    content: [] as AI.ToolContent as (AI.ToolResultPart | AI.ToolApprovalResponse)[],
                    //providerOptions
                }

                for (const part of msg.parts) {
                    if (part.type === "tool") {
                        environmentMessage.content.push({
                            type: "tool-result",
                            toolCallId: part.callID,
                            toolName: part.tool,
                            output: (() => {
                                if (part.state.status === "pending")
                                    return {
                                        type: "text",
                                        value: ""
                                        //providerOptions?: SharedV3ProviderOptions | undefined;
                                    }
                                if (part.state.status === "running")
                                    return {
                                        type: "text",
                                        value: ""
                                        //providerOptions?: SharedV3ProviderOptions | undefined;
                                    }
                                if (part.state.status === "completed")
                                    return {
                                        type: "text",
                                        value: "",
                                        //providerOptions?: SharedV3ProviderOptions | undefined;
                                    }
                                if (part.state.status === "error")
                                    return {
                                        type: "text",
                                        value: "",
                                    }
                                else {
                                    return {
                                        type: "text",
                                        value: "",
                                    }

                                }
                            })(),


                        })
                    }
                }
            }
        }

        // const tools = Object.fromEntries(Array.from(toolNames).map((toolName) => [toolName, { toModelOutput }]))

        // return convertToModelMessages(
        //     result.filter((msg) => msg.parts.some((part) => part.type !== "step-start")),
        //     {
        //         //@ts-expect-error (convertToModelMessages expects a ToolSet but only actually needs tools[name]?.toModelOutput)
        //         tools,
        //     },
        //)
        return result
    }
    //异步生成器，返回 messageid,本地读取？
    export const stream = fn(Identifier.schema("session"), async function* (sessionID) {
        //获得session下所有的message
        const list = await Array.fromAsync(await Storage.list(["message", sessionID]))
        for (let i = list.length - 1; i >= 0; i--) {
            yield await get({
                sessionID,
                messageID: list[i]![2]!,
            })
        }
    })


    export const parts = fn(Identifier.schema("message"), async (messageID) => {
        const result = [] as Message.Part[]
        for (const item of await Storage.list(["part", messageID])) {
            const read = await Storage.read<Message.Part>(item)
            result.push(read)
        }
        result.sort((a, b) => (a.id > b.id ? 1 : -1))
        return result
    })
    /**
     * 输入：sessionid+messageid
     * 输出：对应的withpart
     */
    export const get = fn(
        z.object({
            sessionID: Identifier.schema("session"),
            messageID: Identifier.schema("message"),
        }),
        async (input): Promise<WithParts> => {
            return {
                info: await Storage.read<Message.Info>(["message", input.sessionID, input.messageID]),
                parts: await parts(input.messageID),
            }
        },
    )

    export async function filterCompacted(stream: AsyncIterable<Message.WithParts>) {
        const result = [] as Message.WithParts[]
        const completed = new Set<string>()
        for await (const msg of stream) {
            result.push(msg)
            if (
                msg.info.role === "user" &&
                completed.has(msg.info.id) &&
                msg.parts.some((part) => part.type === "compaction")
            )
                break
            if (msg.info.role === "assistant" && msg.info.summary && msg.info.finish) completed.add(msg.info.parentID)
        }
        result.reverse()
        return result
    }






}