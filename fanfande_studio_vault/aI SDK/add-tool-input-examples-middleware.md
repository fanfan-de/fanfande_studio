# `addToolInputExamplesMiddleware`

`addToolInputExamplesMiddleware` 是一个中间件函数，用于向工具描述追加输入示例。这对于**原生不支持 `inputExamples` 属性**的语言模型提供商尤其有用——该中间件会序列化并将示例注入到工具的 `description` 中，以便模型能够从中学习。

## 导入

<Snippet
  text={`import { addToolInputExamplesMiddleware } from "ai"`}
  prompt={false}
/>

## API

### 函数签名

```ts
function addToolInputExamplesMiddleware(options?: {
  prefix?: string;
  format?: (example: { input: JSONObject }, index: number) => string;
  remove?: boolean;
}): LanguageModelMiddleware;
```

### 参数

<PropertiesTable
  content={[
    {
      name: 'prefix',
      type: 'string',
      isOptional: true,
      description:
        "预置在输入示例部分之前的前缀。默认为 `'Input Examples:'`。",
    },
    {
      name: 'format',
      type: '(example: { input: JSONObject }, index: number) => string',
      isOptional: true,
      description:
        '每个示例的可选自定义格式化函数。接收示例对象及其索引。默认：JSON.stringify(example.input)。',
    },
    {
      name: 'remove',
      type: 'boolean',
      isOptional: true,
      description:
        '是否在将示例添加到描述后从工具中移除 `inputExamples` 属性。默认为 true。',
    },
  ]}
/>

### 返回值

返回一个 [LanguageModelMiddleware](/docs/03-ai-sdk-core/40-middleware)，该中间件：

- 定位具有 `inputExamples` 属性的函数工具。
- 序列化每个输入示例（默认使用 JSON，或使用您的自定义格式化函数）。
- 在工具描述末尾追加一个包含所有格式化示例的部分，前缀为 `prefix`。
- 从工具中移除 `inputExamples` 属性（除非设置 `remove: false`）。
- 其他所有工具（包括没有示例的工具）保持不变。

## 使用示例

```ts
import {
  generateText,
  tool,
  wrapLanguageModel,
  addToolInputExamplesMiddleware,
} from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const model = wrapLanguageModel({
  model: __MODEL__,
  middleware: addToolInputExamplesMiddleware({
    prefix: 'Input Examples:',
    format: (example, index) =>
      `${index + 1}. ${JSON.stringify(example.input)}`,
  }),
});

const result = await generateText({
  model,
  tools: {
    weather: tool({
      description: '获取某个地点的天气',
      inputSchema: z.object({ location: z.string() }),
      inputExamples: [
        { input: { location: 'San Francisco' } },
        { input: { location: 'London' } },
      ],
    }),
  },
  prompt: '东京的天气怎么样？',
});
```

## 工作原理

1. 对于每个定义了 `inputExamples` 的函数工具，该中间件：

   - 使用 `format` 函数格式化每个示例（默认：JSON.stringify）。
   - 构建如下部分：

     ```
     Input Examples:
     {"location":"San Francisco"}
     {"location":"London"}
     ```

   - 将该部分追加到工具 `description` 的末尾。

2. 默认情况下，它在追加后会移除 `inputExamples` 属性以防止重复（可通过 `remove: false` 禁用）。
3. 没有输入示例的工具或非函数工具保持不变。

> **提示：** 该中间件对于 OpenAI 或 Anthropic 等原生不支持 `inputExamples` 的提供商尤其有用。

## 效果示例

如果原始工具定义为：

```ts
{
  type: 'function',
  name: 'weather',
  description: '获取某个地点的天气',
  inputSchema: { ... },
  inputExamples: [
    { input: { location: 'San Francisco' } },
    { input: { location: 'London' } }
  ]
}
```

应用中间件（使用默认设置）后，传递给模型的工具将如下所示：

```ts
{
  type: 'function',
  name: 'weather',
  description: `获取某个地点的天气

Input Examples:
{"location":"San Francisco"}
{"location":"London"}`,
  inputSchema: { ... }
  // inputExamples 默认已被移除
}
```

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