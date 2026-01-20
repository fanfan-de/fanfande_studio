# `createAgentUIStream`

`createAgentUIStream` 函数执行一个 [Agent](/docs/reference/ai-sdk-core/agent)，消费一个 UI 消息数组，并通过异步可迭代对象以 UI 消息块的形式流式传输代理的输出。这实现了 AI 助手输出的实时、增量渲染，并完全支持工具使用、中间推理和交互式 UI 功能，适用于构建基于代理的聊天 API、仪表板或机器人。

## 导入

<Snippet text={`import { createAgentUIStream } from "ai"`} prompt={false} />

## 用法

```ts
import { ToolLoopAgent, createAgentUIStream } from 'ai';
__PROVIDER_IMPORT__;

const agent = new ToolLoopAgent({
  model: __MODEL__,
  instructions: 'You are a helpful assistant.',
  tools: { weather: weatherTool, calculator: calculatorTool },
});

export async function* streamAgent(
  uiMessages: unknown[],
  abortSignal?: AbortSignal,
) {
  const stream = await createAgentUIStream({
    agent,
    uiMessages,
    abortSignal,
    // ...其他选项（见下文）
  });

  for await (const chunk of stream) {
    yield chunk; // 每个块都是代理输出的 UI 消息。
  }
}
```

## 参数

<PropertiesTable
  content={[
    {
      name: 'agent',
      type: 'Agent',
      isRequired: true,
      description:
        '要运行的代理。必须定义其 `tools` 并实现 `.stream({ prompt, ... })` 方法。',
    },
    {
      name: 'uiMessages',
      type: 'unknown[]',
      isRequired: true,
      description:
        '输入 UI 消息对象的数组（例如用户/助手/聊天历史记录）。这些消息将被验证并转换为代理可用的格式。',
    },
    {
      name: 'abortSignal',
      type: 'AbortSignal',
      isRequired: false,
      description:
        '可选的 abort 信号，用于提前取消流（例如，当客户端断开连接时）。',
    },
    {
      name: 'timeout',
      type: 'number | { totalMs?: number }',
      isRequired: false,
      description:
        '超时时间（毫秒）。可以指定为数字或具有 totalMs 属性的对象。如果调用时间超过指定超时时间，将被中止。可与 abortSignal 一起使用。',
    },
    {
      name: 'options',
      type: 'CALL_OPTIONS',
      isRequired: false,
      description:
        '可选的代理调用选项，仅当您的代理需要额外配置时才需要（参见代理泛型参数）。',
    },
    {
      name: 'experimental_transform',
      type: 'StreamTextTransform | StreamTextTransform[]',
      isRequired: false,
      description:
        '应用于代理输出流的可选转换（实验性功能）。',
    },
    {
      name: '...UIMessageStreamOptions',
      type: 'UIMessageStreamOptions',
      isRequired: false,
      description:
        '控制输出流的附加选项，例如包含来源或使用数据。',
    },
  ]}
/>

## 返回值

返回一个 `Promise<AsyncIterableStream<UIMessageChunk>>`，其中每个产生的块都是代理输出的 UI 消息（参见 [`UIMessage`](/docs/reference/ai-sdk-core/ui-message)）。可以使用任何异步迭代器循环来消费，或将其传输到流式 HTTP 响应、套接字或其他接收器。

## 示例

```ts
import { createAgentUIStream } from 'ai';

const controller = new AbortController();

const stream = await createAgentUIStream({
  agent,
  uiMessages: [{ role: 'user', content: 'What is the weather in SF today?' }],
  abortSignal: controller.signal,
  sendStart: true,
  // ...其他 UIMessageStreamOptions
});

for await (const chunk of stream) {
  // 每个块都是一个 UI 消息更新——将其流式传输到客户端、仪表板、日志等。
  console.log(chunk);
}

// 调用 controller.abort() 可提前取消代理操作。
```

## 工作原理

1. **UI 消息验证：** 输入的 `uiMessages` 数组将使用代理的 `tools` 定义进行验证和规范化。任何无效消息都会导致错误。
2. **转换为模型消息：** 验证后的 UI 消息将转换为模型特定的消息格式，以满足代理的要求。
3. **代理流式传输：** 使用转换后的模型消息、可选的调用选项、abort 信号和任何实验性转换来调用代理的 `.stream({ prompt, ... })` 方法。
4. **UI 消息流构建：** 结果流被转换并公开为 UI 消息块的流式异步可迭代对象，供您消费。

## 注意事项

- 代理**必须**实现 `.stream({ prompt, ... })` 方法并定义其支持的 `tools` 属性。
- 此实用程序返回一个异步可迭代对象，以实现最大的流式传输灵活性。对于 HTTP 响应，请参见 [`createAgentUIStreamResponse`](/docs/reference/ai-sdk-core/create-agent-ui-stream-response)（Web）或 [`pipeAgentUIStreamToResponse`](/docs/reference/ai-sdk-core/pipe-agent-ui-stream-to-response)（Node.js）。
- `uiMessages` 参数名为 `uiMessages`，**而非**仅 `messages`。
- 您可以通过 [`UIMessageStreamOptions`](/docs/reference/ai-sdk-core/ui-message-stream-options) 提供高级选项（例如，包含来源或使用数据）。
- 要取消流，请通过 `abortSignal` 参数传递一个 [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal)。

## 相关链接

- [`Agent`](/docs/reference/ai-sdk-core/agent)
- [`ToolLoopAgent`](/docs/reference/ai-sdk-core/tool-loop-agent)
- [`UIMessage`](/docs/reference/ai-sdk-core/ui-message)
- [`UIMessageStreamOptions`](/docs/reference/ai-sdk-core/ui-message-stream-options)
- [`createAgentUIStreamResponse`](/docs/reference/ai-sdk-core/create-agent-ui-stream-response)
- [`pipeAgentUIStreamToResponse`](/docs/reference/ai-sdk-core/pipe-agent-ui-stream-to-response)


## 导航

- [generateText](/docs/reference/ai-sdk-core/generate-text)
- [streamText](/docs/reference/ai-sdk-core/stream-text)
- [generateObject](/docs/reference/ai-sdk-core/generate-object)
- [streamObject](/docs/reference/ai-sdk-core/stream-object)
- [embed](/docs/reference/ai-sdk-core/embed)
- [embedMany](/docs/reference/ai-sdk-core/embed-many)
- [rerank](/docs/reference/ai-sdk-core/rerank)
- [generateImage](/docs/reference/ai-sdk-core/generate-image)
- [transcribe](/docs/reference/ai-sdk-core/transcribe)
- [generateSpeech](/docs/reference/ai-sdk-core/generate-speech)
- [Agent (Interface)](/docs/reference/ai-sdk-core/agent)
- [ToolLoopAgent](/docs/reference/ai-sdk-core/tool-loop-agent)
- [createAgentUIStream](/docs/reference/ai-sdk-core/create-agent-ui-stream)
- [createAgentUIStreamResponse](/docs/reference/ai-sdk-core/create-agent-ui-stream-response)
- [pipeAgentUIStreamToResponse](/docs/reference/ai-sdk-core/pipe-agent-ui-stream-to-response)
- [tool](/docs/reference/ai-sdk-core/tool)
- [dynamicTool](/docs/reference/ai-sdk-core/dynamic-tool)
- [createMCPClient](/docs/reference/ai-sdk-core/create-mcp-client)
- [Experimental_StdioMCPTransport](/docs/reference/ai-sdk-core/mcp-stdio-transport)
- [jsonSchema](/docs/reference/ai-sdk-core/json-schema)
- [zodSchema](/docs/reference/ai-sdk-core/zod-schema)
- [valibotSchema](/docs/reference/ai-sdk-core/valibot-schema)
- [Output](/docs/reference/ai-sdk-core/output)
- [ModelMessage](/docs/reference/ai-sdk-core/model-message)
- [UIMessage](/docs/reference/ai-sdk-core/ui-message)
- [validateUIMessages](/docs/reference/ai-sdk-core/validate-ui-messages)
- [safeValidateUIMessages](/docs/reference/ai-sdk-core/safe-validate-ui-messages)
- [createProviderRegistry](/docs/reference/ai-sdk-core/provider-registry)
- [customProvider](/docs/reference/ai-sdk-core/custom-provider)
- [cosineSimilarity](/docs/reference/ai-sdk-core/cosine-similarity)
- [wrapLanguageModel](/docs/reference/ai-sdk-core/wrap-language-model)
- [wrapImageModel](/docs/reference/ai-sdk-core/wrap-image-model)
- [LanguageModelV3Middleware](/docs/reference/ai-sdk-core/language-model-v2-middleware)
- [extractReasoningMiddleware](/docs/reference/ai-sdk-core/extract-reasoning-middleware)
- [simulateStreamingMiddleware](/docs/reference/ai-sdk-core/simulate-streaming-middleware)
- [defaultSettingsMiddleware](/docs/reference/ai-sdk-core/default-settings-middleware)
- [addToolInputExamplesMiddleware](/docs/reference/ai-sdk-core/add-tool-input-examples-middleware)
- [extractJsonMiddleware](/docs/reference/ai-sdk-core/extract-json-middleware)
- [stepCountIs](/docs/reference/ai-sdk-core/step-count-is)
- [hasToolCall](/docs/reference/ai-sdk-core/has-tool-call)
- [simulateReadableStream](/docs/reference/ai-sdk-core/simulate-readable-stream)
- [smoothStream](/docs/reference/ai-sdk-core/smooth-stream)
- [generateId](/docs/reference/ai-sdk-core/generate-id)
- [createIdGenerator](/docs/reference/ai-sdk-core/create-id-generator)


[完整站点地图](/sitemap.md)