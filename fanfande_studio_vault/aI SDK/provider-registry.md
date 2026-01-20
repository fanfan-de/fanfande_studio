# `createProviderRegistry()`

当您使用多个提供商和模型时，通常希望在一个中心位置管理它们，并通过简单的字符串ID访问模型。

`createProviderRegistry` 允许您创建一个包含多个提供商的注册表，您可以通过 `providerId:modelId` 格式的ID访问它们。

### 设置

您可以使用 `createProviderRegistry` 创建包含多个提供商和模型的注册表。

```ts
import { anthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createProviderRegistry } from 'ai';

export const registry = createProviderRegistry({
  // 使用前缀和默认设置注册提供商：
  anthropic,

  // 使用前缀和自定义设置注册提供商：
  openai: createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  }),
});
```

### 自定义分隔符

默认情况下，注册表使用 `:` 作为提供商和模型ID之间的分隔符。您可以通过传递 `separator` 选项来自定义分隔符：

```ts
const registry = createProviderRegistry(
  {
    anthropic,
    openai,
  },
  { separator: ' > ' },
);

// 现在您可以使用自定义分隔符
const model = registry.languageModel('anthropic > claude-3-opus-20240229');
```

### 语言模型

您可以使用注册表上的 `languageModel` 方法访问语言模型。
提供商ID将成为模型ID的前缀：`providerId:modelId`。

```ts highlight={"5"}
import { generateText } from 'ai';
import { registry } from './registry';

const { text } = await generateText({
  model: registry.languageModel('openai:gpt-4.1'),
  prompt: 'Invent a new holiday and describe its traditions.',
});
```

### 文本嵌入模型

您可以使用注册表上的 `.embeddingModel` 方法访问文本嵌入模型。
提供商ID将成为模型ID的前缀：`providerId:modelId`。

```ts highlight={"5"}
import { embed } from 'ai';
import { registry } from './registry';

const { embedding } = await embed({
  model: registry.embeddingModel('openai:text-embedding-3-small'),
  value: 'sunny day at the beach',
});
```

### 图像模型

您可以使用注册表上的 `imageModel` 方法访问图像模型。
提供商ID将成为模型ID的前缀：`providerId:modelId`。

```ts highlight={"5"}
import { generateImage } from 'ai';
import { registry } from './registry';

const { image } = await generateImage({
  model: registry.imageModel('openai:dall-e-3'),
  prompt: 'A beautiful sunset over a calm ocean',
});
```

## 导入

<Snippet text={`import { createProviderRegistry } from "ai"`} prompt={false} />

## API签名

### 参数

<PropertiesTable
  content={[
    {
      name: 'providers',
      type: 'Record<string, Provider>',
      description: '提供商的唯一标识符。在注册表中应是唯一的。',
      properties: [
        {
          type: 'Provider',
          parameters: [
            {
              name: 'languageModel',
              type: '(id: string) => LanguageModel',
              description: '通过ID返回语言模型的函数。',
            },
            {
              name: 'embeddingModel',
              type: '(id: string) => EmbeddingModel<string>',
              description: '通过ID返回文本嵌入模型的函数。',
            },
            {
              name: 'imageModel',
              type: '(id: string) => ImageModel',
              description: '通过ID返回图像模型的函数。',
            },
          ],
        },
      ],
    },
    {
      name: 'options',
      type: 'object',
      description: '注册表的可选配置。',
      properties: [
        {
          type: 'Options',
          parameters: [
            {
              name: 'separator',
              type: 'string',
              description: '提供商和模型ID之间的自定义分隔符。默认为 ":"。',
            },
          ],
        },
      ],
    },
  ]}
/>

### 返回值

`createProviderRegistry` 函数返回一个 `Provider` 实例。它包含以下方法：

<PropertiesTable
  content={[
    {
      name: 'languageModel',
      type: '(id: string) => LanguageModel',
      description: '通过ID（格式：providerId:modelId）返回语言模型的函数。',
    },
    {
      name: 'embeddingModel',
      type: '(id: string) => EmbeddingModel<string>',
      description: '通过ID（格式：providerId:modelId）返回文本嵌入模型的函数。',
    },
    {
      name: 'imageModel',
      type: '(id: string) => ImageModel',
      description: '通过ID（格式：providerId:modelId）返回图像模型的函数。',
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