这份文档详细描述了 Vercel AI SDK 中 `streamText` 函数的配置参数、数据结构以及返回结果。以下是整理后的技术手册：

---

# streamText API 技术文档

`streamText` 是 Vercel AI SDK 中用于实现流式文本生成的函数，支持模型对话、工具调用、多模态输入以及深度思考（Reasoning）过程的实时输出。

## 1. 核心输入参数 (Request Options)

### 1.1 模型
*   **`model`**: `LanguageModel` (必选)。要使用的语言模型实例。

1.2 提示词
*  **`system`**: `string`。系统提示词，定义模型的行为边界。
*  **`prompt`**: `string` | `Array<Message>`。生成文本的输入提示。
*   **`messages`**: `Array<Message>`。对话历史列表，支持系统、用户、助手和工具角色。
	* 不可以同时使用的prompt和messages，prompt比messages多一个纯text的选项
	* https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text#messages
	

### 1.2 生成控制参数
*   **`maxOutputTokens`**: `number`。限制生成的最大 Token 数。
*   **`temperature`**: `number`。采样温度，控制输出的随机性。
*   **`topP` / `topK`**: 采样策略参数，用于控制词汇多样性。
*   **`presencePenalty` / `frequencyPenalty`**: 惩罚机制，减少内容重复。
*   **`stopSequences`**: `string[]`。遇到这些特定字符串时停止生成。
*   **`seed`**: `number`。设置随机种子以获取确定性结果。

### 1.3 工具与调用
*   **`tools`**: `ToolSet`。模型可以调用的工具集合。
	* https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text#tools.tool.execute
*   **`toolChoice`**: `"auto" | "none" | "required" | { type: "tool", toolName: string }`。强制或禁用工具调用。

### 1.4 高级配置
*   **`abortSignal`**: `AbortSignal`。用于取消请求。
*   **`headers`**: `Record<string, string>`。额外的 HTTP 请求头。
*   **`maxRetries`**: `number`。最大重试次数（默认 2 次）。
*   **`timeout`**: `number | object`。超时设置。
	* Timeout in milliseconds. Can be specified as a number or as an object with totalMs, stepMs, and/or chunkMs properties. totalMs sets the total timeout for the entire call. stepMs sets the timeout for each individual step (LLM call), useful for multi-step generations. chunkMs sets the timeout between stream chunks - the call will abort if no new chunk is received within this duration, useful for detecting stalled streams. Can be used alongside abortSignal.
* ### experimental_generateMessageId?:() => string
	* Function used to generate a unique ID for each message. This is an experimental feature.
* ### experimental_telemetry?:TelemetrySettings
	* Telemetry configuration. Experimental feature.
	* https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text#timeout
* ### experimental_transform### ?:StreamTextTransform Array<StreamTextTransform>
	* Whether to include raw chunks from the provider in the stream. When enabled, you will receive raw chunks with type "raw" that contain the unprocessed data from the provider. This allows access to cutting-edge provider features not yet wrapped by the AI SDK. Defaults to false.

---

## 2. 消息与内容结构 (Messages & Parts)

### 2.1 角色类型
*   **`system`**: 系统指令。
*   **`user`**: 用户输入，内容可以是字符串或包含文本、图片、文件的数组。
*   **`assistant`**: 模型输出，包含文本、深度思考（Reasoning）、工具调用。
*   **`tool`**: 工具执行结果。

### 2.2 多模态内容
*   **`TextPart`**: `{ type: 'text', text: string }`。
*   **`ImagePart`**: `{ type: 'image', image: URL|Buffer|base64, mediaType?: string }`。
*   **`FilePart`**: `{ type: 'file', data: string|Buffer, mediaType: string }`。
*   **`ReasoningPart`**: `{ type: 'reasoning', text: string }`。深度思考过程文本。

---

## 3. 返回结果对象 (Returns)

调用 `streamText` 后返回一个结果对象，包含多个流和 Promise：

### 3.1 核心流 (Streams)
*   **`textStream`**: `AsyncIterableStream<string>`。**最常用**。仅返回生成的文本片段（Delta）。
*   **`fullStream`**: 返回完整事件流，包含文本、工具调用、思考过程、错误信息等。
*   **`elementStream`**: 当使用 `Output.array()` 时，流式返回完整的数组元素。

### 3.2 状态与元数据 (Promises)
*   **`text`**: `Promise<string>`。生成结束后的完整文本。
*   **`reasoningText`**: `Promise<string>`。生成结束后的完整思考过程。
*   **`usage`**: `Promise<LanguageModelUsage>`。本次请求消耗的 Token 信息（含缓存命中情况）。
*   **`finishReason`**: `Promise<string>`。结束原因（如 `'stop'`, `'length'`, `'content-filter'`）。
*   **`steps`**: `Promise<Array<StepResult>>`。多步生成的详细步骤信息。

---

## 4. 事件类型 (TextStreamPart)

在使用 `fullStream` 或回调时，会接收到以下类型的事件 chunk：

*   **`text`**: 文本片段。
*   **`reasoning`**: 思考过程片段。
*   **`tool-call`**: 工具调用起始。
*   **`tool-result`**: 工具执行结果。
*   **`start-step` / `finish-step`**: 每一个生成步骤的开关。
*   **`finish`**: 整个流结束。
*   **`error`**: 发生异常。

---

## 5. 生命周期回调 (Callbacks)

*   **`onChunk`**: 每收到一个流片段时触发。
*   **`onStepFinish`**: 每一个中间步骤完成时触发。
*   **`onFinish`**: 整个对话逻辑（包括所有工具执行）全部完成时触发。
*   **`onError`**: 流式输出过程中发生错误时调用。

---

## 6. 响应转换工具 (Response Utilities)

提供了一系列方法将结果直接对接 Web 标准或 Node.js 环境：

*   **`toTextStreamResponse()`**: 创建一个 Web 标准的 `Response`，返回纯文本流。
*   **`toUIMessageStreamResponse()`**: 返回符合 UI 协议（如 `useChat` 钩子所需）的 JSON 流。
*   **`pipeTextStreamToResponse(res)`**: 将文本流管道传输到 Node.js 的 `ServerResponse` 对象。
*   **`toUIMessageStream()`**: 转换为 UI 消息格式的流，支持包含元数据和来源。

---

## 7. Token 使用详情结构 (Usage Details)

`usage` 属性提供了极其精细的 Token 统计：
*   **`inputTokens`**: 总输入。
    *   `noCacheTokens`: 非缓存输入。
    *   `cacheReadTokens`: 缓存命中。
*   **`outputTokens`**: 总输出。
    *   `textTokens`: 文本输出。
    *   `reasoningTokens`: 思考过程消耗。
*   **`totalTokens`**: 总计。

---

## 总结

`streamText` 不仅仅是一个简单的流式接口，它是一个复杂的**多步状态机**，能够自动处理：
1.  **文本流式生成**。
2.  **深度思考过程展示**（Reasoning）。
3.  **自动工具执行与反馈循环**（通过多步 Step 处理）。
4.  **Token 消耗精准统计**。
5.  **跨平台响应封装**（兼容 Next.js, Node.js 等）。