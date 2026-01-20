# `customProvider()`

通过自定义提供商，您可以将ID映射到任何模型。
这允许您设置自定义模型配置、别名等。
自定义提供商还支持回退提供商，这对于
包装现有提供商和添加额外功能非常有用。

### 示例：自定义模型设置

您可以使用 `customProvider` 创建自定义提供商。

```ts
import { openai } from '@ai-sdk/openai';
import { customProvider } from 'ai';

// 使用不同模型设置的自定义提供商：
export const myOpenAI = customProvider({
  languageModels: {
    // 带有自定义设置的替换模型：
    'gpt-4': wrapLanguageModel({
      model: openai('gpt-4'),
      middleware: defaultSettingsMiddleware({
        settings: {
          providerOptions: {
            openai: {
              reasoningEffort: 'high',
            },
          },
        },
      }),
    }),
    // 带有自定义设置的别名模型：
    'gpt-4o-reasoning-high': wrapLanguageModel({
      model: openai('gpt-4o'),
      middleware: defaultSettingsMiddleware({
        settings: {
          providerOptions: {
            openai: {
              reasoningEffort: 'high',
            },
          },
        },
      }),
    }),
  },
  fallbackProvider: openai,
});
```

## 导入

<Snippet text={`import {  customProvider } from "ai"`} prompt={false} />

## API 签名

### 参数

<PropertiesTable
  content={[
    {
      name: 'languageModels',
      type: 'Record<string, LanguageModel>',
      isOptional: true,
      description:
        '语言模型的记录，其中键是模型ID，值是LanguageModel实例。',
    },
    {
      name: '.embeddingModels',
      type: 'Record<string, EmbeddingModel<string>>',
      isOptional: true,
      description:
        '文本嵌入模型的记录，其中键是模型ID，值是EmbeddingModel<string>实例。',
    },
    {
      name: 'imageModels',
      type: 'Record<string, ImageModel>',
      isOptional: true,
      description:
        '图像模型的记录，其中键是模型ID，值是图像模型实例。',
    },
    {
      name: 'fallbackProvider',
      type: 'Provider',
      isOptional: true,
      description:
        '可选的回退提供商，当请求的模型在自定义提供商中找不到时使用。',
    },
  ]}
/>

### 返回值

`customProvider` 函数返回一个 `Provider` 实例。它包含以下方法：

<PropertiesTable
  content={[
    {
      name: 'languageModel',
      type: '(id: string) => LanguageModel',
      description:
        '根据ID（格式：providerId:modelId）返回语言模型的函数',
    },
    {
      name: 'embeddingModel',
      type: '(id: string) => EmbeddingModel<string>',
      description:
        '根据ID（格式：providerId:modelId）返回文本嵌入模型的函数',
    },
    {
      name: 'imageModel',
      type: '(id: string) => ImageModel',
      description:
        '根据ID（格式：providerId:modelId）返回图像模型的函数',
    },
  ]}
/>

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