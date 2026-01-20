# `defaultSettingsMiddleware()`

`defaultSettingsMiddleware` 是一个中间件函数，用于向语言模型调用应用默认设置。当您希望在多个模型调用中建立一致的默认参数时，这非常有用。

```ts
import { defaultSettingsMiddleware } from 'ai';

const middleware = defaultSettingsMiddleware({
  settings: {
    temperature: 0.7,
    maxOutputTokens: 1000,
    // 其他设置...
  },
});
```

## 导入

<Snippet
  text={`import { defaultSettingsMiddleware } from "ai"`}
  prompt={false}
/>

## API 签名

### 参数

该中间件接受一个配置对象，包含以下属性：

- `settings`：一个包含要应用于语言模型调用的默认参数值的对象。这些可以包括任何有效的 `LanguageModelV3CallOptions` 属性以及可选的提供者元数据。

### 返回值

返回一个中间件对象，该对象：

- 将默认设置与每个模型调用中提供的参数合并
- 确保显式提供的参数优先于默认值
- 合并提供者元数据对象

### 使用示例

```ts
import { streamText, wrapLanguageModel, defaultSettingsMiddleware } from 'ai';

// 创建带有默认设置的模型
const modelWithDefaults = wrapLanguageModel({
  model: gateway('anthropic/claude-sonnet-4.5'),
  middleware: defaultSettingsMiddleware({
    settings: {
      providerOptions: {
        openai: {
          reasoningEffort: 'high',
        },
      },
    },
  }),
});

// 使用模型 - 默认设置将被应用
const result = await streamText({
  model: modelWithDefaults,
  prompt: 'Your prompt here',
  // 这些参数将覆盖默认值
  temperature: 0.8,
});
```

## 工作原理

该中间件：

1. 接受一组默认设置作为配置
2. 将这些默认值与每个模型调用中提供的参数合并
3. 确保显式提供的参数优先于默认值
4. 合并来自两个源的提供者元数据对象

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
- [Agent (接口)](/docs/reference/ai-sdk-core/agent)
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
