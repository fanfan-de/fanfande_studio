```typescript
import { generateText } from 'ai';
import { deepseek } from "@ai-sdk/deepseek";

const { text } = await generateText({
  model: deepseek("deepseek-v3.1"),
  prompt: 'Invent a new holiday and describe its traditions.',
});

console.log(text);
```

# API 签名文档 (2026年1月20日版)

本文档详细描述了 `generateText` 或类似生成函数的核心 API 结构，用于指导如何配置语言模型、消息列表、工具调用以及处理生成的响应。

## 1. 核心请求参数 (Parameters)

| 参数名               | 类型                                                                     | 描述                                                 |
| :---------------- | :--------------------------------------------------------------------- | :------------------------------------------------- |
| `model`           | `LanguageModel`                                                        | **必填**。要使用的语言模型实例。例如：`openai('gpt-4o')`。           |
| `system`          | `string \| SystemModelMessage \| SystemModelMessage[]`                 | 系统提示词，用于规定模型的行为。                                   |
| `prompt`          | `string \| Array<ModelMessage>`                                        | 输入提示词。可以是纯文本字符串或消息对象数组。                            |
| `messages`        | `Array<ModelMessage>`                                                  | 表示对话的消息列表。会自动转换来自 `useChat` 钩子的 UI 消息。             |
| `tools`           | `ToolSet`                                                              | 模型可以访问和调用的工具集合。                                    |
| `toolChoice`      | `"auto" \| "none" \| "required" \| { type: 'tool', toolName: string }` | 工具选择设置。默认为 `"auto"`。                               |
| `maxOutputTokens` | `number`                                                               | 最大生成的 Token 数量。                                    |
| `temperature`     | `number`                                                               | 采样温度。控制生成文本的随机性。                                   |
| `topP`            | `number`                                                               | 核采样 (Nucleus sampling) 参数。建议与 `temperature` 二选一使用。 |
| `seed`            | `number`                                                               | 随机种子。用于生成确定性的结果。                                   |
| `maxRetries`      | `number`                                                               | 最大重试次数。默认值为 2。                                     |
| `timeout`         | `number \| { totalMs?: number; stepMs?: number }`                      | 超时设置（毫秒）。支持总超时或单步超时。                               |

---

## 2. 消息类型 (Message Types)

### SystemModelMessage (系统消息)
- `role`: `'system'`
- `content`: `string`

### UserModelMessage (用户消息)
- `role`: `'user'`
- `content`: `string \| Array<TextPart | ImagePart | FilePart>`

### AssistantModelMessage (助手消息)
- `role`: `'assistant'`
- `content`: `string \| Array<TextPart | FilePart | ReasoningPart | ToolCallPart>`

### ToolModelMessage (工具消息)
- `role`: `'tool'`
- `content`: `Array<ToolResultPart>`

---

## 3. 内容分块 (Content Parts)

| 类型 | 属性 | 描述 |
| :--- | :--- | :--- |
| **TextPart** | `text: string` | 纯文本内容。 |
| **ImagePart** | `image: string \| Uint8Array \| ...` | 图像数据。支持 Base64、URL 或 Buffer。 |
| **FilePart** | `data: string \| ...`, `mediaType: string` | 文件数据及 IANA 媒体类型。 |
| **ReasoningPart** | `text: string` | 模型生成的**推理过程**文本（思维链）。 |
| **ToolCallPart** | `toolCallId`, `toolName`, `input` | 模型发起的工具调用请求。 |
| **ToolResultPart** | `toolCallId`, `toolName`, `output`, `isError?` | 工具执行后的返回结果。 |

---

## 4. 工具定义 (Tool Definition)

每个工具包含以下属性：
- `description`: 描述工具的用途，帮助 LLM 理解何时使用。
- `inputSchema`: **Zod 或 JSON Schema**。定义工具接收的参数结构。
- `execute`: `async (parameters, options) => RESULT`。工具执行的异步函数。

---

## 5. 结构化输出控制 (Structured Output)

通过 `output` 设置，可以强制模型返回特定格式的数据：
- `Output.text()`: 默认值，生成纯文本。
- `Output.object({ schema, name, description })`: 生成符合特定模式的对象。
- `Output.array({ element, name, description })`: 生成元素符合模式的数组。
- `Output.choice({ options, name, description })`: 从给定的选项中选择其一。
- `Output.json({ name, description })`: 生成非结构化的 JSON 对象。

---

## 6. 生命周期回调 (Callbacks)

### `onStepFinish`
每一生成步骤（Step）完成时调用。常用于多步工具调用（Multi-step loop）。
- 参数：`OnStepFinishResult` (包含该步的 `usage`, `finishReason`, `toolCalls` 等)。

### `onFinish`
整个生成过程（包括所有工具执行）彻底结束时调用。
- 参数：`OnFinishResult` (包含最终合并后的 `text`, `reasoningText`, `usage`, `sources` 等)。

---

## 7. 返回值 (Returns)

执行生成函数后，将返回一个包含以下内容的对象：

| 属性 | 类型 | 描述 |
| :--- | :--- | :--- |
| `text` | `string` | 最终生成的完整文本。 |
| `reasoning` | `Array<ReasoningOutput>` | 模型生成的推理细节列表。 |
| `reasoningText` | `string \| undefined` | 完整的推理文本。 |
| `toolCalls` | `Array<ToolCall>` | 最后一步中发起的工具调用。 |
| `toolResults` | `Array<ToolResult>` | 最后一步中的工具执行结果。 |
| `finishReason` | `string` | 结束原因：`stop`, `length`, `content-filter`, `tool-calls`, `error` 等。 |
| `usage` | `LanguageModelUsage` | **当前步骤**的 Token 消耗统计。 |
| `totalUsage` | `LanguageModelUsage` | **所有步骤累计**的 Token 消耗统计。 |
| `sources` | `Array<Source>` | 模型引用的来源（如 RAG 模式下的 URL 来源）。 |
| `steps` | `Array<StepResult>` | 每一迭代步骤的详细响应信息。 |

---

## 8. Token 使用明细 (Usage Details)

系统提供了精细化的 Token 统计（`LanguageModelUsage`）：

- **inputTokens**: 总输入 Token。
    - `noCacheTokens`: 未命中的 Token。
    - `cacheReadTokens`: 命中缓存并读取的 Token。
    - `cacheWriteTokens`: 写入缓存的 Token。
- **outputTokens**: 总输出 Token。
    - `textTokens`: 文本生成的 Token。
    - `reasoningTokens`: **推理过程**消耗的 Token。
- **totalTokens**: 此次请求的总 Token。

---

## 9. 实验性功能 (Experimental Features)

- `experimental_telemetry`: 启用遥测，记录输入输出元数据。
- `experimental_repairToolCall`: 尝试自动修复解析失败的工具调用。
- `experimental_download`: 自定义模型在遇到 URL 时的下载行为。
- `prepareStep`: 允许在多步执行中，动态修改每一步的模型设置、提示词或可用工具。