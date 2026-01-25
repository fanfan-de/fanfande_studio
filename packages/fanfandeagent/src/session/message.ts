
import z from "zod"
import { Snapshot } from "../snapshot"

export namespace Message{
    //`PartBase`：用于定义“消息的内容片段” (The Content Part)
    const PartBase = z.object({
        id: z.string(),
        sessionid: z.number(),
        messageid: z.number()
    })
    //`Part`：消息主体 (Message Info) - 消息的元数据容器(关于这个消息的消息)
    const Base = z.object({
    id: z.string(),
    sessionID: z.string(),
    })
    /**
   * SnapshotPart: 文件系统快照
   * 用于 Coding Agent。记录消息发生时，整个项目文件系统的状态哈希。
   * 确保 Agent 知道它是在哪个版本的代码上进行操作。
   * 快照，运行时验证器
   */
    export const SnapshotPart = PartBase.extend({
        type: z.literal("snapshot"),
        snapshot: z.string(),
    }).meta({
        ref: "SnapshotPart",
    })
    //TS类型
    export type SnapshotPart = z.infer<typeof SnapshotPart>
    /**
     * PatchPart: 代码补丁
     * 记录 Agent 对代码所做的修改（Diff）。
     */
    export const PatchPart = PartBase.extend({
        type: z.literal("patch"),
        hash: z.string(),
        files: z.string().array(),
    }).meta({
        ref: "PatchPart",
    })
    export type PatchPart = z.infer<typeof PatchPart>

    /**
     * TextPart: 文本内容
     * 最基础的消息组件。
     */
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

    /**
     * ReasoningPart: 思维链 (Chain of Thought)
     * 适配 OpenAI o1 或 DeepSeek r1 等模型。
     * 将模型的“思考过程”与最终“回答”分离存储，便于 UI 单独折叠展示。
     */
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

    // --- 文件来源定义 (File Sources) -------------------------------------------------
    // 定义文件内容是来自本地文件、LSP 符号还是外部资源
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
    //本地文件
    export const FileSource = FilePartSourceBase.extend({
        type: z.literal("file"),
        path: z.string(),
    }).meta({
        ref: "FileSource",
    })
    //LSP服务器
    export const SymbolSource = FilePartSourceBase.extend({
        type: z.literal("symbol"), // 来自 LSP (Language Server Protocol) 的符号定义
        path: z.string(),
        //range: LSP.Range,
        name: z.string(),
        kind: z.number().int(),
    }).meta({
        ref: "SymbolSource",
    })
    //外部资源
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

    /**
     * FilePart: 文件附件
     * 用户上传的文件或 Agent 读取的文件内容。
     */
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

    /**
     * AgentPart: 多 Agent 协作
     * 标记某个内容是由特定的子 Agent 生成的。
     */
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


    /**
     * CompactionPart: 上下文压缩标记
     * 当对话过长时，旧消息会被压缩。这个 Part 用于在 UI 上显示 "History compacted" 的分割线。
     */
    export const CompactionPart = PartBase.extend({
        type: z.literal("compaction"),
        auto: z.boolean(),
    }).meta({
        ref: "CompactionPart",
    })
    export type CompactionPart = z.infer<typeof CompactionPart>


    // --- 工具状态机 (Tool State Machine) ---
    // 工具调用不是瞬间完成的，需要经历 Pending -> Running -> Completed/Error 的过程。
    // 这种设计允许 UI 实时渲染工具的执行进度。
    //等待
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


    /**
     * ToolPart: 工具调用组件
     * 包含工具调用的 ID、名称以及上述的状态机。
     */
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

    //---------------Message Meta Data----------------------------------------------------------------------------

    export const Meta_UserMessage = Base.extend({
        role: z.literal("user"),
        time: z.object({
            created: z.number(),
        }),
        summary: z.object({
            title: z.string().optional(),
            body: z.string().optional(),                                       
            diffs: Snapshot.FileDiff.array(),
            }).optional(),
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
    export type Meta_UserMessage = z.infer<typeof Meta_UserMessage>

    /**
     * Assistant: AI 消息
     * 代表模型的输出。
     */
    export const Meta_LLMMessage = Base.extend({
        role: z.literal("LLM"),
        time: z.object({
        created: z.number(),
        completed: z.number().optional(),
        }),
        // error: z
        // .discriminatedUnion("name", [
        //     AuthError.Schema,
        //     NamedError.Unknown.Schema,
        //     OutputLengthError.Schema,
        //     AbortedError.Schema,
        //     APIError.Schema,
        // ])
        // .optional(),
        parentID: z.string(), // 支持树状对话结构，指向父消息
        modelID: z.string(),
        providerID: z.string(),
        /**
         * @deprecated
         */
        mode: z.string(),
        agent: z.string(),
        path: z.object({ // 记录 Agent 执行时的上下文路径
        cwd: z.string(),
        root: z.string(),
        }),
        summary: z.boolean().optional(),
        cost: z.number(), // 总成本
        tokens: z.object({ // 总 Token 消耗
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
    export type Meta_LLMMessage = z.infer<typeof Meta_LLMMessage>

}