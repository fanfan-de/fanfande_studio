这是一个非常完善的 Agent 消息系统设计。为了帮助你理解每一部分的具体用途，我为代码添加了详细的中文注释，解释了各个字段、类型和函数背后的设计意图。

```typescript
import { BusEvent } from "@/bus/bus-event"
import z from "zod"
import { NamedError } from "@opencode-ai/util/error"
import { APICallError, convertToModelMessages, LoadAPIKeyError, type ModelMessage, type UIMessage } from "ai"
import { Identifier } from "../id/id"
import { LSP } from "../lsp"
import { Snapshot } from "@/snapshot"
import { fn } from "@/util/fn"
import { Storage } from "@/storage/storage"
import { ProviderTransform } from "@/provider/transform"
import { STATUS_CODES } from "http"
import { iife } from "@/util/iife"
import { type SystemError } from "bun"
import type { Provider } from "@/provider/provider"

/**
 * MessageV2 命名空间
 * 定义了系统中所有的消息结构、错误类型、持久化逻辑以及与 LLM Provider 的转换逻辑。
 * 这是一个面向 "富消息" (Rich Message) 的设计，不仅仅是文本，还包含工具调用、文件快照、推理过程等。
 */
export namespace MessageV2 {
  // ==========================================================================================
  // 1. 错误定义 (Error Definitions)
  // 使用 Zod 定义结构化的错误，便于前端捕获并展示特定的 UI（如重试按钮、鉴权弹窗）。
  // ==========================================================================================

  // 当模型输出超过最大 Token 限制时抛出
  export const OutputLengthError = NamedError.create("MessageOutputLengthError", z.object({}))
  
  // 用户手动停止生成（点击 Stop 按钮）
  export const AbortedError = NamedError.create("MessageAbortedError", z.object({ message: z.string() }))
  
  // Provider 鉴权失败（如 API Key 错误或过期）
  export const AuthError = NamedError.create(
    "ProviderAuthError",
    z.object({
      providerID: z.string(),
      message: z.string(),
    }),
  )
  
  // 通用的 API 调用错误（网络问题、500错误等），包含是否可重试的标记
  export const APIError = NamedError.create(
    "APIError",
    z.object({
      message: z.string(),
      statusCode: z.number().optional(),
      isRetryable: z.boolean(), // 关键字段：决定 UI 是否显示“重试”按钮
      responseHeaders: z.record(z.string(), z.string()).optional(),
      responseBody: z.string().optional(),
      metadata: z.record(z.string(), z.string()).optional(),
    }),
  )
  export type APIError = z.infer<typeof APIError.Schema>

  // ==========================================================================================
  // 2. 消息组件 (Message Parts) - 消息的原子构成单元
  // 一条消息由多个 Part 组成，这种设计允许一条消息同时包含文本、工具调用、文件附件等。
  // ==========================================================================================

  // 所有 Part 的基类，包含数据库索引所需的 ID
  const PartBase = z.object({
    id: z.string(),
    sessionID: z.string(),
    messageID: z.string(),
  })

  /**
   * SnapshotPart: 文件系统快照
   * 用于 Coding Agent。记录消息发生时，整个项目文件系统的状态哈希。
   * 确保 Agent 知道它是在哪个版本的代码上进行操作。
   */
  export const SnapshotPart = PartBase.extend({
    type: z.literal("snapshot"),
    snapshot: z.string(),
  }).meta({
    ref: "SnapshotPart",
  })
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

  // --- 文件来源定义 (File Sources) ---
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

  export const FileSource = FilePartSourceBase.extend({
    type: z.literal("file"),
    path: z.string(),
  }).meta({
    ref: "FileSource",
  })

  export const SymbolSource = FilePartSourceBase.extend({
    type: z.literal("symbol"), // 来自 LSP (Language Server Protocol) 的符号定义
    path: z.string(),
    range: LSP.Range,
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

  /**
   * SubtaskPart: 任务拆解
   * Agent 将大任务拆解为小任务的记录。
   */
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
  })
  export type SubtaskPart = z.infer<typeof SubtaskPart>

  /**
   * RetryPart: 重试记录
   * 记录 API 调用失败并重试的痕迹，用于调试和 UI 展示（如 "Retrying... (2/3)"）。
   */
  export const RetryPart = PartBase.extend({
    type: z.literal("retry"),
    attempt: z.number(),
    error: APIError.Schema,
    time: z.object({
      created: z.number(),
    }),
  }).meta({
    ref: "RetryPart",
  })
  export type RetryPart = z.infer<typeof RetryPart>

  /**
   * StepStartPart / StepFinishPart: 执行步骤标记
   * Agent 的执行通常是一个循环 (Think -> Act -> Observe)。
   * 这两个 Part 标记了一个循环步骤的开始和结束，用于计算该步骤的耗时、Token 消耗和成本。
   */
  export const StepStartPart = PartBase.extend({
    type: z.literal("step-start"),
    snapshot: z.string().optional(),
  }).meta({
    ref: "StepStartPart",
  })
  export type StepStartPart = z.infer<typeof StepStartPart>

  export const StepFinishPart = PartBase.extend({
    type: z.literal("step-finish"),
    reason: z.string(), // 结束原因 (e.g., "tool_called", "stop")
    snapshot: z.string().optional(),
    cost: z.number(), // 该步骤的金钱成本
    tokens: z.object({ // 详细的 Token 统计
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

  // --- 工具状态机 (Tool State Machine) ---
  // 工具调用不是瞬间完成的，需要经历 Pending -> Running -> Completed/Error 的过程。
  // 这种设计允许 UI 实时渲染工具的执行进度。

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

  // ==========================================================================================
  // 3. 消息主体 (Message Info) - 消息的元数据容器
  // ==========================================================================================

  const Base = z.object({
    id: z.string(),
    sessionID: z.string(),
  })

  /**
   * User: 用户消息
   * 代表人类的输入。
   */
  export const User = Base.extend({
    role: z.literal("user"),
    time: z.object({
      created: z.number(),
    }),
    summary: z
      .object({
        title: z.string().optional(),
        body: z.string().optional(),
        diffs: Snapshot.FileDiff.array(), // 关键：用户消息可以携带代码变更 (Diff)
      })
      .optional(),
    agent: z.string(), // 指定处理该消息的 Agent
    model: z.object({  // 指定使用的模型
      providerID: z.string(),
      modelID: z.string(),
    }),
    system: z.string().optional(), // 可选的 System Prompt 覆盖
    tools: z.record(z.string(), z.boolean()).optional(), // 启用/禁用的工具列表
    variant: z.string().optional(),
  }).meta({
    ref: "UserMessage",
  })
  export type User = z.infer<typeof User>

  // Part 的联合类型，包含所有可能的组件
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
    ])
    .meta({
      ref: "Part",
    })
  export type Part = z.infer<typeof Part>

  /**
   * Assistant: AI 消息
   * 代表模型的输出。
   */
  export const Assistant = Base.extend({
    role: z.literal("assistant"),
    time: z.object({
      created: z.number(),
      completed: z.number().optional(),
    }),
    error: z
      .discriminatedUnion("name", [
        AuthError.Schema,
        NamedError.Unknown.Schema,
        OutputLengthError.Schema,
        AbortedError.Schema,
        APIError.Schema,
      ])
      .optional(),
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
  export type Assistant = z.infer<typeof Assistant>

  // 消息主体的联合类型
  export const Info = z.discriminatedUnion("role", [User, Assistant]).meta({
    ref: "Message",
  })
  export type Info = z.infer<typeof Info>

  // ==========================================================================================
  // 4. 事件系统 (Events)
  // 用于在消息更新时通知前端或其他系统组件
  // ==========================================================================================
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
        delta: z.string().optional(), // 增量更新（用于流式输出文本）
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

  // 完整的消息对象：包含元数据 (Info) 和内容组件列表 (Parts)
  export const WithParts = z.object({
    info: Info,
    parts: z.array(Part),
  })
  export type WithParts = z.infer<typeof WithParts>

  // ==========================================================================================
  // 5. 核心逻辑：转换为模型格式 (toModelMessages)
  // 将内部复杂的 MessageV2 结构转换为 Vercel AI SDK 或 LLM Provider 能理解的格式。
  // ==========================================================================================
  export function toModelMessages(input: WithParts[], model: Provider.Model): ModelMessage[] {
    const result: UIMessage[] = []
    const toolNames = new Set<string>()

    // 辅助函数：将工具输出转换为 AI SDK 格式（处理文本、图片等）
    const toModelOutput = (output: unknown) => {
      if (typeof output === "string") {
        return { type: "text", value: output }
      }

      if (typeof output === "object") {
        const outputObject = output as {
          text: string
          attachments?: Array<{ mime: string; url: string }>
        }
        // 过滤出 Data URL 格式的附件
        const attachments = (outputObject.attachments ?? []).filter((attachment) => {
          return attachment.url.startsWith("data:") && attachment.url.includes(",")
        })

        return {
          type: "content",
          value: [
            { type: "text", text: outputObject.text },
            ...attachments.map((attachment) => ({
              type: "media",
              mediaType: attachment.mime,
              data: iife(() => {
                // 提取 base64 数据部分
                const commaIndex = attachment.url.indexOf(",")
                return commaIndex === -1 ? attachment.url : attachment.url.slice(commaIndex + 1)
              }),
            })),
          ],
        }
      }

      return { type: "json", value: output as never }
    }

    for (const msg of input) {
      if (msg.parts.length === 0) continue

      // --- 处理用户消息 ---
      if (msg.info.role === "user") {
        const userMessage: UIMessage = {
          id: msg.info.id,
          role: "user",
          parts: [],
        }
        result.push(userMessage)
        for (const part of msg.parts) {
          // 文本部分
          if (part.type === "text" && !part.ignored)
            userMessage.parts.push({
              type: "text",
              text: part.text,
            })
          // 文件部分：忽略纯文本文件（通常已内联），处理图片等媒体文件
          if (part.type === "file" && part.mime !== "text/plain" && part.mime !== "application/x-directory")
            userMessage.parts.push({
              type: "file",
              url: part.url,
              mediaType: part.mime,
              filename: part.filename,
            })

          // 压缩标记：转换为自然语言提示
          if (part.type === "compaction") {
            userMessage.parts.push({
              type: "text",
              text: "What did we do so far?",
            })
          }
          // 子任务标记
          if (part.type === "subtask") {
            userMessage.parts.push({
              type: "text",
              text: "The following tool was executed by the user",
            })
          }
        }
      }

      // --- 处理 Assistant 消息 ---
      if (msg.info.role === "assistant") {
        // 检查模型是否发生变化（如果变化，可能需要清除 providerMetadata）
        const differentModel = `${model.providerID}/${model.id}` !== `${msg.info.providerID}/${msg.info.modelID}`

        // 错误处理：如果消息有错误且不是 Abort 错误，或者是 Abort 但没有生成任何实质内容，则跳过
        if (
          msg.info.error &&
          !(
            MessageV2.AbortedError.isInstance(msg.info.error) &&
            msg.parts.some((part) => part.type !== "step-start" && part.type !== "reasoning")
          )
        ) {
          continue
        }
        const assistantMessage: UIMessage = {
          id: msg.info.id,
          role: "assistant",
          parts: [],
        }
        for (const part of msg.parts) {
          // 文本输出
          if (part.type === "text")
            assistantMessage.parts.push({
              type: "text",
              text: part.text,
              ...(differentModel ? {} : { providerMetadata: part.metadata }),
            })
          // 步骤开始标记
          if (part.type === "step-start")
            assistantMessage.parts.push({
              type: "step-start",
            })
          
          // 工具调用处理 (关键逻辑)
          if (part.type === "tool") {
            toolNames.add(part.tool)
            // 1. 工具执行完成
            if (part.state.status === "completed") {
              // 如果被压缩了，清除旧内容以节省 Token
              const outputText = part.state.time.compacted ? "[Old tool result content cleared]" : part.state.output
              const attachments = part.state.time.compacted ? [] : (part.state.attachments ?? [])
              const output =
                attachments.length > 0
                  ? {
                      text: outputText,
                      attachments,
                    }
                  : outputText

              assistantMessage.parts.push({
                type: ("tool-" + part.tool) as `tool-${string}`,
                state: "output-available", // 标记结果可用
                toolCallId: part.callID,
                input: part.state.input,
                output,
                ...(differentModel ? {} : { callProviderMetadata: part.metadata }),
              })
            }
            // 2. 工具执行出错
            if (part.state.status === "error")
              assistantMessage.parts.push({
                type: ("tool-" + part.tool) as `tool-${string}`,
                state: "output-error",
                toolCallId: part.callID,
                input: part.state.input,
                errorText: part.state.error,
                ...(differentModel ? {} : { callProviderMetadata: part.metadata }),
              })
            // 3. 工具挂起或运行中 (Pending/Running)
            // Anthropic 等 API 要求每个 tool_use 必须有对应的 tool_result。
            // 如果消息流中断导致工具卡在运行状态，这里必须伪造一个错误结果，否则下次请求 API 会报错。
            if (part.state.status === "pending" || part.state.status === "running")
              assistantMessage.parts.push({
                type: ("tool-" + part.tool) as `tool-${string}`,
                state: "output-error",
                toolCallId: part.callID,
                input: part.state.input,
                errorText: "[Tool execution was interrupted]",
                ...(differentModel ? {} : { callProviderMetadata: part.metadata }),
              })
          }
          // 推理内容 (CoT)
          if (part.type === "reasoning") {
            assistantMessage.parts.push({
              type: "reasoning",
              text: part.text,
              ...(differentModel ? {} : { providerMetadata: part.metadata }),
            })
          }
        }
        if (assistantMessage.parts.length > 0) {
          result.push(assistantMessage)
        }
      }
    }

    // 构建工具定义映射，供 convertToModelMessages 使用
    const tools = Object.fromEntries(Array.from(toolNames).map((toolName) => [toolName, { toModelOutput }]))

    // 最终转换：过滤掉 step-start 等内部标记，调用 AI SDK 的转换函数
    return convertToModelMessages(
      result.filter((msg) => msg.parts.some((part) => part.type !== "step-start")),
      {
        //@ts-expect-error (convertToModelMessages 类型定义可能不完全匹配，但运行时只需要 tools[name]?.toModelOutput)
        tools,
      },
    )
  }

  // ==========================================================================================
  // 6. 存储与辅助函数 (Storage & Helpers)
  // ==========================================================================================

  // 流式获取会话的所有消息（从存储中倒序读取）
  export const stream = fn(Identifier.schema("session"), async function* (sessionID) {
    const list = await Array.fromAsync(await Storage.list(["message", sessionID]))
    for (let i = list.length - 1; i >= 0; i--) {
      yield await get({
        sessionID,
        messageID: list[i][2],
      })
    }
  })

  // 获取单条消息的所有 Parts
  export const parts = fn(Identifier.schema("message"), async (messageID) => {
    const result = [] as MessageV2.Part[]
    for (const item of await Storage.list(["part", messageID])) {
      const read = await Storage.read<MessageV2.Part>(item)
      result.push(read)
    }
    // 按 ID 排序确保顺序正确
    result.sort((a, b) => (a.id > b.id ? 1 : -1))
    return result
  })

  // 获取完整的消息对象 (Info + Parts)
  export const get = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      messageID: Identifier.schema("message"),
    }),
    async (input) => {
      return {
        info: await Storage.read<MessageV2.Info>(["message", input.sessionID, input.messageID]),
        parts: await parts(input.messageID),
      }
    },
  )

  // 过滤已压缩的消息
  // 当遇到 CompactionPart 时，停止加载更早的消息，只返回最近的上下文。
  export async function filterCompacted(stream: AsyncIterable<MessageV2.WithParts>) {
    const result = [] as MessageV2.WithParts[]
    const completed = new Set<string>()
    for await (const msg of stream) {
      result.push(msg)
      // 如果是用户消息且包含压缩标记，且该对话分支已完成，则停止加载旧消息
      if (
        msg.info.role === "user" &&
        completed.has(msg.info.id) &&
        msg.parts.some((part) => part.type === "compaction")
      )
        break
      // 标记已完成的 Assistant 消息的父节点（即 User 消息）
      if (msg.info.role === "assistant" && msg.info.summary && msg.info.finish) completed.add(msg.info.parentID)
    }
    result.reverse() // 恢复时间正序
    return result
  }

  // 错误转换工厂：将各种异常转换为 MessageV2 定义的标准错误
  export function fromError(e: unknown, ctx: { providerID: string }) {
    switch (true) {
      case e instanceof DOMException && e.name === "AbortError":
        return new MessageV2.AbortedError(
          { message: e.message },
          {
            cause: e,
          },
        ).toObject()
      case MessageV2.OutputLengthError.isInstance(e):
        return e
      case LoadAPIKeyError.isInstance(e):
        return new MessageV2.AuthError(
          {
            providerID: ctx.providerID,
            message: e.message,
          },
          { cause: e },
        ).toObject()
      case (e as SystemError)?.code === "ECONNRESET":
        return new MessageV2.APIError(
          {
            message: "Connection reset by server",
            isRetryable: true,
            metadata: {
              code: (e as SystemError).code ?? "",
              syscall: (e as SystemError).syscall ?? "",
              message: (e as SystemError).message ?? "",
            },
          },
          { cause: e },
        ).toObject()
      case APICallError.isInstance(e):
        // 尝试从 API 错误响应中提取有用的错误信息
        const message = iife(() => {
          let msg = e.message
          if (msg === "") {
            if (e.responseBody) return e.responseBody
            if (e.statusCode) {
              const err = STATUS_CODES[e.statusCode]
              if (err) return err
            }
            return "Unknown error"
          }
          const transformed = ProviderTransform.error(ctx.providerID, e)
          if (transformed !== msg) {
            return transformed
          }
          if (!e.responseBody || (e.statusCode && msg !== STATUS_CODES[e.statusCode])) {
            return msg
          }

          try {
            const body = JSON.parse(e.responseBody)
            // 尝试提取常见的错误字段
            const errMsg = body.message || body.error || body.error?.message
            if (errMsg && typeof errMsg === "string") {
              return `${msg}: ${errMsg}`
            }
          } catch {}

          return `${msg}: ${e.responseBody}`
        }).trim()

        const metadata = e.url ? { url: e.url } : undefined
        return new MessageV2.APIError(
          {
            message,
            statusCode: e.statusCode,
            isRetryable: e.isRetryable,
            responseHeaders: e.responseHeaders,
            responseBody: e.responseBody,
            metadata,
          },
          { cause: e },
        ).toObject()
      case e instanceof Error:
        return new NamedError.Unknown({ message: e.toString() }, { cause: e }).toObject()
      default:
        return new NamedError.Unknown({ message: JSON.stringify(e) }, { cause: e })
    }
  }
}
```