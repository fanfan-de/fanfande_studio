# `createAgentUIStreamResponse`

`createAgentUIStreamResponse` 函数执行一个[代理](/docs/reference/ai-sdk-core/agent)，将其流式输出作为UI消息流运行，并返回一个HTTP [Response](https://developer.mozilla.org/en-US/docs/Web/API/Response)对象，其主体是实时流式的UI消息输出。此函数专为提供实时代理结果的API路由设计，例如聊天端点或流式工具使用操作。

## 导入

<Snippet
  text={`import { createAgentUIStreamResponse } from "ai"`}
  prompt={false}
/>

## 用法

```ts
import { ToolLoopAgent, createAgentUIStreamResponse } from 'ai';
__PROVIDER_IMPORT__;

const agent = new ToolLoopAgent({
  model: __MODEL__,
  instructions: '您是一个有用的助手。',
  tools: { weather: weatherTool, calculator: calculatorTool },
});

export async function POST(request: Request) {
  const { messages } = await request.json();

  // 可选：支持取消（在断开连接等情况下中止）
  const abortController = new AbortController();

  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
    abortSignal: abortController.signal, // 可选
    // ...其他 UIMessageStreamOptions，如 sendSources、includeUsage、experimental_transform 等。
  });
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
        '要从中流式输出响应的代理实例。必须实现 `.stream({ prompt, ... })` 并定义 `tools` 属性。',
    },
    {
      name: 'uiMessages',
      type: 'unknown[]',
      isRequired: true,
      description:
        '提供给代理的输入UI消息数组（例如用户和助手消息）。',
    },
    {
      name: 'abortSignal',
      type: 'AbortSignal',
      isRequired: false,
      description:
        '可选的取消信号，用于取消流式传输，例如在客户端断开连接时。这应该是一个 [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) 实例。',
    },
    {
      name: 'timeout',
      type: 'number | { totalMs?: number }',
      isRequired: false,
      description:
        '超时时间（毫秒）。可以指定为一个数字或具有 totalMs 属性的对象。如果调用时间超过指定的超时时间，将会被中止。可以与 abortSignal 一起使用。',
    },
    {
      name: 'options',
      type: 'CALL_OPTIONS',
      isRequired: false,
      description:
        '可选的代理调用选项，适用于具有泛型参数 `CALL_OPTIONS` 的代理。',
    },
    {
      name: 'experimental_transform',
      type: 'StreamTextTransform | StreamTextTransform[]',
      isRequired: false,
      description:
        '可选的流转换，用于后处理文本输出——与低层级流式API中的相同。',
    },
    {
      name: '...UIMessageStreamOptions',
      type: 'UIMessageStreamOptions',
      isRequired: false,
      description:
        '其他UI消息输出选项——例如 `sendSources`、`includeUsage` 等。请参阅 [`UIMessageStreamOptions`](/docs/reference/ai-sdk-core/ui-message-stream-options)。',
    },
    {
      name: 'headers',
      type: 'HeadersInit',
      isRequired: false,
      description: '可选的要包含在Response对象中的HTTP头。',
    },
    {
      name: 'status',
      type: 'number',
      isRequired: false,
      description: '可选的HTTP状态码。',
    },
    {
      name: 'statusText',
      type: 'string',
      isRequired: false,
      description: '可选的HTTP状态文本。',
    },
    {
      name: 'consumeSseStream',
      type: 'boolean',
      isRequired: false,
      description:
        '如果为true，则使用SSE（服务器发送事件）消费流，而不是默认的流式传输。',
    },
  ]}
/>

## 返回值

一个 `Promise<Response>`，其 `body` 是来自代理的流式UI消息输出。在无服务器、Next.js、Express、Hono 或边缘运行时上下文中，将此用作API/服务器处理程序的返回值。

## 示例：Next.js API路由处理程序

```ts
import { createAgentUIStreamResponse } from 'ai';
import { MyCustomAgent } from '@/agent/my-custom-agent';

export async function POST(request: Request) {
  const { messages } = await request.json();

  return createAgentUIStreamResponse({
    agent: MyCustomAgent,
    uiMessages: messages,
    sendSources: true, // （可选）
    includeUsage: true, // （可选）
    // headers、status、abortSignal 和其他 UIMessageStreamOptions 也受支持
  });
}
```

## 工作原理

- 1. **UI消息验证：** 根据代理指定的工具和要求验证传入的 `uiMessages` 数组。
- 2. **模型消息转换：** 将验证后的UI消息转换为代理的内部模型消息格式。
- 3. **流式代理输出：** 调用代理的 `.stream({ prompt, ... })` 以获取块（步骤/UI消息）流。
- 4. **HTTP响应创建：** 将输出流包装为可读的HTTP `Response` 对象，将UI消息块流式传输到客户端。

## 注意事项

- 您的代理**必须**实现 `.stream({ prompt, ... })` 并定义 `tools` 属性（即使只是 `{}`）才能与此函数一起工作。
- **仅限服务器端：** 此API应仅在后端/服务器端上下文中调用（API路由、边缘/无服务器/服务器路由处理程序等）。不适用于浏览器使用。
- 其他选项（`headers`、`status`、UI流选项、转换等）可用于高级场景。
- 此函数利用 [ReadableStream](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream)，因此您的平台/客户端必须支持HTTP流式消费。

## 另请参阅

- [`代理`](/docs/reference/ai-sdk-core/agent)
- [`ToolLoopAgent`](/docs/reference/ai-sdk-core/tool-loop-agent)
- [`UIMessage`](/docs/reference/ai-sdk-core/ui-message)
- [`UIMessageStreamOptions`](/docs/reference/ai-sdk-core/ui-message-stream-options)
- [`createAgentUIStream`](/docs/reference/ai-sdk-core/create-agent-ui-stream)


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
- [代理（接口）](/docs/reference/ai-sdk-core/agent)
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