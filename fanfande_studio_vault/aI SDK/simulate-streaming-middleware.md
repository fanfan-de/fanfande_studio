# `simulateStreamingMiddleware()`

`simulateStreamingMiddleware` 是一个中间件函数，用于模拟非流式语言模型响应的流式行为。当您希望在使用仅提供完整响应的模型时保持一致的流式接口时，这非常有用。

```ts
import { simulateStreamingMiddleware } from 'ai';

const middleware = simulateStreamingMiddleware();
```

## 导入

<Snippet
  text={`import { simulateStreamingMiddleware } from "ai"`}
  prompt={false}
/>

## API 签名

### 参数

该中间件不接受任何参数。

### 返回值

返回一个中间件对象，该对象：

- 接收语言模型的完整响应
- 将其转换为模拟的流式数据块
- 正确处理各种响应组件，包括：
  - 文本内容
  - 推理过程（作为字符串或对象数组）
  - 工具调用
  - 元数据和使用信息
  - 警告信息

### 使用示例

```ts
import { streamText } from 'ai';
import { wrapLanguageModel } from 'ai';
import { simulateStreamingMiddleware } from 'ai';

// 使用非流式模型的示例
const result = streamText({
  model: wrapLanguageModel({
    model: nonStreamingModel,
    middleware: simulateStreamingMiddleware(),
  }),
  prompt: 'Your prompt here',
});

// 现在可以使用流式接口
for await (const chunk of result.fullStream) {
  // 处理流式数据块
}
```

## 工作原理

该中间件：

1. 等待语言模型的完整响应
2. 创建一个 `ReadableStream`，按正确顺序发出数据块
3. 通过将响应分解为适当的数据块类型来模拟流式传输
4. 保留所有元数据、推理过程、工具调用和其他响应属性

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