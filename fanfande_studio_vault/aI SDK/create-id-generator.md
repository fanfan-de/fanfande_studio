# `createIdGenerator()`

创建一个可自定义的ID生成器函数。您可以配置生成ID的字母表、前缀、分隔符和默认大小。

```ts
import { createIdGenerator } from 'ai';

const generateCustomId = createIdGenerator({
  prefix: 'user',
  separator: '_',
});

const id = generateCustomId(); // 示例："user_1a2b3c4d5e6f7g8h"
```

## 导入

<Snippet text={`import { createIdGenerator } from "ai"`} prompt={false} />

## API签名

### 参数

<PropertiesTable
  content={[
    {
      name: 'options',
      type: 'object',
      description:
        '可选配置对象，具有以下属性：',
    },
    {
      name: 'options.alphabet',
      type: 'string',
      description:
        '用于生成ID随机部分的字符。默认为字母数字字符（0-9，A-Z，a-z）。',
    },
    {
      name: 'options.prefix',
      type: 'string',
      description:
        '预置到所有生成ID前的字符串。默认为无。',
    },
    {
      name: 'options.separator',
      type: 'string',
      description:
        '前缀和随机部分之间使用的字符。默认为"-"。',
    },
    {
      name: 'options.size',
      type: 'number',
      description:
        'ID随机部分的默认长度。默认为16。',
    },
  ]}
/>

### 返回值

返回一个根据配置选项生成ID的函数。

### 注意

- 生成器使用非安全随机生成，不应用于安全关键用途。
- 分隔符字符不得是字母表的一部分，以确保可靠的前缀检查。

## 示例

```ts
// 为用户ID创建自定义ID生成器
const generateUserId = createIdGenerator({
  prefix: 'user',
  separator: '_',
  size: 8,
});

// 生成ID
const id1 = generateUserId(); // 例如："user_1a2b3c4d"
```

## 另请参阅

- [`generateId()`](/docs/reference/ai-sdk-core/generate-id)


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


[Full Sitemap](/sitemap.md)