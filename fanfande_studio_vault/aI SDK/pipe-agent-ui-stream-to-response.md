# `pipeAgentUIStreamToResponse`

`pipeAgentUIStreamToResponse` 函数运行一个[Agent](/docs/reference/ai-sdk-core/agent)并将生成的UI消息输出直接流式传输到Node.js的[`ServerResponse`](https://nodejs.org/api/http.html#class-httpserverresponse)对象。这对于在基于Node.js的框架（如Express、Hono或自定义Node服务器）中构建实时流式API端点（用于聊天、工具使用等）非常理想。

## 导入

<Snippet
  text={`import { pipeAgentUIStreamToResponse } from "ai"`}
  prompt={false}
/>

## 用法

```ts
import { pipeAgentUIStreamToResponse } from 'ai';
import { MyAgent } from './agent';

export async function handler(req, res) {
  const { messages } = JSON.parse(req.body);

  await pipeAgentUIStreamToResponse({
    response: res, // Node.js ServerResponse
    agent: MyAgent,
    uiMessages: messages, // 必需：输入UI消息数组
    // abortSignal: 可选的AbortSignal用于取消
    // status: 200,
    // headers: { ... },
    // ...其他可选的UI消息流选项
  });
}
```

## 参数

<PropertiesTable
  content={[
    {
      name: 'response',
      type: 'ServerResponse',
      isRequired: true,
      description:
        '要向其管道传输UI消息流输出的Node.js ServerResponse对象。',
    },
    {
      name: 'agent',
      type: 'Agent',
      isRequired: true,
      description:
        '实现了`.stream({ prompt, ... })`方法并定义了`tools`属性的代理实例。',
    },
    {
      name: 'uiMessages',
      type: 'unknown[]',
      isRequired: true,
      description:
        '发送给代理的输入UI消息数组（例如用户/助手消息对象）。',
    },
    {
      name: 'abortSignal',
      type: 'AbortSignal',
      isRequired: false,
      description:
        '用于取消流式传输的可选中止信号（例如在客户端断开连接时）。提供一个[`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal)，例如来自`AbortController`。',
    },
    {
      name: 'timeout',
      type: 'number | { totalMs?: number }',
      isRequired: false,
      description:
        '超时时间（毫秒）。可以指定为数字或具有totalMs属性的对象。如果调用时间超过指定的超时时间，将被中止。可以与abortSignal一起使用。',
    },
    {
      name: 'options',
      type: 'CALL_OPTIONS',
      isRequired: false,
      description:
        '可选的代理调用选项，用于配置了泛型参数`CALL_OPTIONS`的代理。',
    },
    {
      name: 'experimental_transform',
      type: 'StreamTextTransform | StreamTextTransform[]',
      isRequired: false,
      description:
        '应用于代理输出的可选流文本转换。',
    },
    {
      name: '...UIMessageStreamResponseInit & UIMessageStreamOptions',
      type: 'object',
      isRequired: false,
      description:
        '流式传输头、状态、SSE流配置和附加UI消息流控制的选项。',
    },
  ]}
/>

## 返回值

一个`Promise<void>`。当UI消息流已完全发送到提供的ServerResponse时，该函数完成。

## 示例：Express路由处理器

```ts
import { pipeAgentUIStreamToResponse } from 'ai';
import { openaiWebSearchAgent } from './openai-web-search-agent';

app.post('/chat', async (req, res) => {
  // 使用req.body.messages作为输入UI消息
  await pipeAgentUIStreamToResponse({
    response: res,
    agent: openaiWebSearchAgent,
    uiMessages: req.body.messages,
    // abortSignal: yourController.signal
    // status: 200,
    // headers: { ... },
    // ...更多选项
  });
});
```

## 工作原理

1. **运行代理：** 使用提供的UI消息和选项调用代理的`.stream`方法，根据需要将它们转换为模型消息。
2. **流式传输UI消息输出：** 将代理输出作为UI消息流管道传输到`ServerResponse`，通过流式HTTP响应发送数据（包括适当的头）。
3. **中止信号处理：** 如果提供了`abortSignal`，则信号触发时（例如客户端断开连接）立即取消流式传输。
4. **无响应返回：** 与返回`Response`的Edge/无服务器API不同，此函数直接向ServerResponse写入字节，不返回响应对象。

## 注意事项

- **中止处理：** 为了获得最佳鲁棒性，使用`AbortSignal`（例如，连接到Express/Hono客户端断开连接）以确保快速取消代理计算和流式传输。
- **仅限Node.js：** 仅适用于Node.js的[ServerResponse](https://nodejs.org/api/http.html#class-httpserverresponse)对象（例如，在Express、Hono的Node适配器等中），不适用于Edge/无服务器/web Response API。
- **流式传输支持：** 确保您的客户端（以及任何代理）正确支持流式HTTP响应以获得完整效果。
- **参数名称：** 输入消息的属性是`uiMessages`（不是`messages`），以与SDK代理工具保持一致。

## 另请参阅

- [`createAgentUIStreamResponse`](/docs/reference/ai-sdk-core/create-agent-ui-stream-response)
- [`Agent`](/docs/reference/ai-sdk-core/agent)
- [`UIMessageStreamOptions`](/docs/reference/ai-sdk-core/ui-message-stream-options)
- [`UIMessage`](/docs/reference/ai-sdk-core/ui-message)

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