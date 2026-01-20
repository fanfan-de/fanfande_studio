# `smoothStream()`

`smoothStream` 是一个工具函数，用于为 `streamText` 的 `transform` 选项创建一个 TransformStream，通过缓冲和释放完整的块，并配置可调节的延迟，来平滑文本和推理流式传输。这可以在流式传输文本和推理响应时提供更自然的阅读体验。

```ts highlight={"6-9"}
import { smoothStream, streamText } from 'ai';

const result = streamText({
  model,
  prompt,
  experimental_transform: smoothStream({
    delayInMs: 20, // 可选：默认为 10ms
    chunking: 'line', // 可选：默认为 'word'
  }),
});
```

## 导入

<Snippet text={`import { smoothStream } from "ai"`} prompt={false} />

## API 签名

### 参数

<PropertiesTable
  content={[
    {
      name: 'delayInMs',
      type: 'number | null',
      isOptional: true,
      description:
        '输出每个块之间的延迟毫秒数。默认为 10ms。设置为 `null` 以禁用延迟。',
    },
    {
      name: 'chunking',
      type: '"word" | "line" | RegExp | Intl.Segmenter | (buffer: string) => string | undefined | null',
      isOptional: true,
      description:
        '控制文本和推理内容如何分块进行流式传输。使用 "word" 逐单词流式传输（默认），"line" 逐行流式传输，Intl.Segmenter 用于语言敏感的单词分割（推荐用于 CJK 语言），或提供自定义回调函数或 RegExp 模式进行自定义分块。',
    },
  ]}
/>

#### 非拉丁语言单词分块的注意事项

基于单词的分块**对以下不使用空格分隔单词的语言效果不佳**：

- 中文
- 日文
- 韩文
- 越南文
- 泰文

#### 使用 Intl.Segmenter（推荐）

对于这些语言，我们推荐使用 `Intl.Segmenter` 进行正确的语言敏感单词分割。这是首选方法，因为它为 CJK 和其他语言提供准确的单词边界。

<Note>
  `Intl.Segmenter` 在 Node.js 16+ 和所有现代浏览器（Chrome 87+、Firefox 125+、Safari 14.1+）中可用。
</Note>

```tsx filename="Japanese example with Intl.Segmenter"
import { smoothStream, streamText } from 'ai';
__PROVIDER_IMPORT__;

const segmenter = new Intl.Segmenter('ja', { granularity: 'word' });

const result = streamText({
  model: __MODEL__,
  prompt: 'Your prompt here',
  experimental_transform: smoothStream({
    chunking: segmenter,
  }),
});
```

```tsx filename="Chinese example with Intl.Segmenter"
import { smoothStream, streamText } from 'ai';
__PROVIDER_IMPORT__;

const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });

const result = streamText({
  model: __MODEL__,
  prompt: 'Your prompt here',
  experimental_transform: smoothStream({
    chunking: segmenter,
  }),
});
```

#### 基于正则表达式的分块

要使用基于正则表达式的分块，请将 `RegExp` 传递给 `chunking` 选项。

```ts
// 按下划线分割：
smoothStream({
  chunking: /_+/,
});

// 也可以这样写，行为相同
smoothStream({
  chunking: /[^_]*_/,
});
```

#### 自定义回调分块

要使用自定义回调进行分块，请将一个函数传递给 `chunking` 选项。

```ts
smoothStream({
  chunking: text => {
    const findString = 'some string';
    const index = text.indexOf(findString);

    if (index === -1) {
      return null;
    }

    return text.slice(0, index) + findString;
  },
});
```

### 返回值

返回一个 `TransformStream`，该流：

- 缓冲传入的文本和推理块
- 当遇到分块模式时释放内容
- 在块之间添加可配置的延迟以实现平滑输出
- 立即传递非文本/推理块（如工具调用、步骤完成事件）

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