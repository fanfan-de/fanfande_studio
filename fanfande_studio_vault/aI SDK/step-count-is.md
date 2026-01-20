# `stepCountIs()`

创建一个停止条件，当步骤数达到指定计数时停止。

此函数与 `generateText` 和 `streamText` 中的 `stopWhen` 一起使用，用于根据执行的步骤数控制工具调用循环何时停止。

```ts
import { generateText, stepCountIs } from 'ai';
__PROVIDER_IMPORT__;

const result = await generateText({
  model: __MODEL__,
  tools: {
    // your tools
  },
  // 在 5 步后停止
  stopWhen: stepCountIs(5),
});
```

## 导入

<Snippet text={`import { stepCountIs } from "ai"`} prompt={false} />

## API 签名

### 参数

<PropertiesTable
  content={[
    {
      name: 'count',
      type: 'number',
      description:
        '在停止工具调用循环之前执行的最大步骤数。',
    },
  ]}
/>

### 返回值

一个 `StopCondition` 函数，当步骤计数达到指定数字时返回 `true`。该函数可与 `generateText` 和 `streamText` 中的 `stopWhen` 参数一起使用。

## 示例

### 基本用法

在 3 步后停止：

```ts
import { generateText, stepCountIs } from 'ai';

const result = await generateText({
  model: yourModel,
  tools: yourTools,
  stopWhen: stepCountIs(3),
});
```

### 结合其他条件

您可以在数组中组合多个停止条件：

```ts
import { generateText, stepCountIs, hasToolCall } from 'ai';

const result = await generateText({
  model: yourModel,
  tools: yourTools,
  // 在 10 步后停止 或 当 finalAnswer 工具被调用时
  stopWhen: [stepCountIs(10), hasToolCall('finalAnswer')],
});
```

## 另请参阅

- [`hasToolCall()`](/docs/reference/ai-sdk-core/has-tool-call)
- [`generateText()`](/docs/reference/ai-sdk-core/generate-text)
- [`streamText()`](/docs/reference/ai-sdk-core/stream-text)

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