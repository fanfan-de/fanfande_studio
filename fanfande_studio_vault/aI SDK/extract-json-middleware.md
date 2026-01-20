# `extractJsonMiddleware()`

`extractJsonMiddleware` 是一个中间件函数，用于通过去除 Markdown 代码块和其他格式来从文本内容中提取 JSON。这在将 `Output.object()` 与那些将 JSON 响应包裹在 Markdown 代码块（例如 ` ```json ... ``` `）中的模型一起使用时非常有用。

```ts
import { extractJsonMiddleware } from 'ai';

const middleware = extractJsonMiddleware();
```

## 导入

<Snippet text={`import { extractJsonMiddleware } from "ai"`} prompt={false} />

## API 签名

### 参数

<PropertiesTable
  content={[
    {
      name: 'transform',
      type: '(text: string) => string',
      isOptional: true,
      description:
        '自定义转换函数，应用于文本内容。接收原始文本并应返回转换后的文本。如果未提供，则默认转换会去除 Markdown 代码块。',
    },
  ]}
/>

### 返回值

返回一个中间件对象，该对象：

- 处理流式和非流式响应
- 从文本内容中去除 Markdown 代码块（` ```json ` 和 ` ``` `）
- 当提供了 `transform` 函数时应用自定义转换
- 保持适当的流式行为并具有高效的缓冲机制

## 使用示例

### 基本用法

当使用结构化输出时，从模型响应中去除 Markdown 代码块：

```ts
import {
  generateText,
  wrapLanguageModel,
  extractJsonMiddleware,
  Output,
} from 'ai';
import { z } from 'zod';

const result = await generateText({
  model: wrapLanguageModel({
    model: yourModel,
    middleware: extractJsonMiddleware(),
  }),
  output: Output.object({
    schema: z.object({
      recipe: z.object({
        name: z.string(),
        steps: z.array(z.string()),
      }),
    }),
  }),
  prompt: 'Generate a lasagna recipe.',
});

console.log(result.output);
```

### 配合流式响应使用

该中间件同样适用于流式响应：

```ts
import {
  streamText,
  wrapLanguageModel,
  extractJsonMiddleware,
  Output,
} from 'ai';
import { z } from 'zod';

const { partialOutputStream } = streamText({
  model: wrapLanguageModel({
    model: yourModel,
    middleware: extractJsonMiddleware(),
  }),
  output: Output.object({
    schema: z.object({
      recipe: z.object({
        ingredients: z.array(z.string()),
        steps: z.array(z.string()),
      }),
    }),
  }),
  prompt: 'Generate a detailed recipe.',
});

for await (const partialObject of partialOutputStream) {
  console.log(partialObject);
}
```

### 自定义转换函数

对于使用不同格式的模型，您可以提供自定义转换：

```ts
import { extractJsonMiddleware } from 'ai';

const middleware = extractJsonMiddleware({
  transform: text =>
    text
      .replace(/^PREFIX/, '')
      .replace(/SUFFIX$/, '')
      .trim(),
});
```

## 工作原理

该中间件以两种方式处理文本内容：

### 非流式（generateText）

1. 接收模型的完整响应
2. 应用转换函数以去除 Markdown 代码块（或自定义格式）
3. 返回清理后的文本内容

### 流式（streamText）

1. 缓冲初始内容以检测 Markdown 代码块前缀（` ```json\n `）
2. 如果检测到代码块，则去除前缀并切换到流式模式
3. 维护一个小的后缀缓冲区以处理关闭的代码块（` \n``` `）
4. 当流结束时，从缓冲区中去除任何尾随的代码块
5. 对于自定义转换，缓冲所有内容并在最后应用转换

这种方法确保了高效的流式处理，同时正确处理可能跨多个数据块分割的代码块。

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