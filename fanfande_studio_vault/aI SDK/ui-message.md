# `UIMessage`

`UIMessage` 作为应用程序状态的单一数据源，表示完整的消息历史，包括元数据、数据部分和所有上下文信息。与传递给模型的 `ModelMessage`（代表模型的状态或上下文）不同，`UIMessage` 包含 UI 渲染和客户端功能所需的完整应用程序状态。

## 类型安全

`UIMessage` 设计为类型安全，并接受三个泛型参数，以确保在整个应用程序中的正确类型：

1. **`METADATA`** - 用于额外消息信息的自定义元数据类型
2. **`DATA_PARTS`** - 用于结构化数据组件的自定义数据部分类型
3. **`TOOLS`** - 用于类型安全工具交互的工具定义

## 创建自定义 UIMessage 类型

以下是如何为您的应用程序创建自定义类型化 UIMessage 的示例：

```typescript
import { InferUITools, ToolSet, UIMessage, tool } from 'ai';
import z from 'zod';

const metadataSchema = z.object({
  someMetadata: z.string().datetime(),
});

type MyMetadata = z.infer<typeof metadataSchema>;

const dataPartSchema = z.object({
  someDataPart: z.object({}),
  anotherDataPart: z.object({}),
});

type MyDataPart = z.infer<typeof dataPartSchema>;

const tools = {
  someTool: tool({}),
} satisfies ToolSet;

type MyTools = InferUITools<typeof tools>;

export type MyUIMessage = UIMessage<MyMetadata, MyDataPart, MyTools>;
```

## `UIMessage` 接口

```typescript
interface UIMessage<
  METADATA = unknown,
  DATA_PARTS extends UIDataTypes = UIDataTypes,
  TOOLS extends UITools = UITools,
> {
  /**
   * 消息的唯一标识符。
   */
  id: string;

  /**
   * 消息的角色。
   */
  role: 'system' | 'user' | 'assistant';

  /**
   * 消息的元数据。
   */
  metadata?: METADATA;

  /**
   * 消息的部分。用于在 UI 中渲染消息。
   */
  parts: Array<UIMessagePart<DATA_PARTS, TOOLS>>;
}
```

## `UIMessagePart` 类型

### `TextUIPart`

消息的文本部分。

```typescript
type TextUIPart = {
  type: 'text';
  /**
   * 文本内容。
   */
  text: string;
  /**
   * 文本部分的状态。
   */
  state?: 'streaming' | 'done';
};
```

### `ReasoningUIPart`

消息的推理部分。

```typescript
type ReasoningUIPart = {
  type: 'reasoning';
  /**
   * 推理文本。
   */
  text: string;
  /**
   * 推理部分的状态。
   */
  state?: 'streaming' | 'done';
  /**
   * 提供者元数据。
   */
  providerMetadata?: Record<string, any>;
};
```

### `ToolUIPart`

表示工具调用及其结果的消息工具部分。

<Note>
  该类型基于工具的名称（例如，名为 `someTool` 的工具类型为 `tool-someTool`）。
</Note>

```typescript
type ToolUIPart<TOOLS extends UITools = UITools> = ValueOf<{
  [NAME in keyof TOOLS & string]: {
    type: `tool-${NAME}`;
    toolCallId: string;
  } & (
    | {
        state: 'input-streaming';
        input: DeepPartial<TOOLS[NAME]['input']> | undefined;
        providerExecuted?: boolean;
        output?: never;
        errorText?: never;
      }
    | {
        state: 'input-available';
        input: TOOLS[NAME]['input'];
        providerExecuted?: boolean;
        output?: never;
        errorText?: never;
      }
    | {
        state: 'output-available';
        input: TOOLS[NAME]['input'];
        output: TOOLS[NAME]['output'];
        errorText?: never;
        providerExecuted?: boolean;
      }
    | {
        state: 'output-error';
        input: TOOLS[NAME]['input'];
        output?: never;
        errorText: string;
        providerExecuted?: boolean;
      }
  );
}>;
```

### `SourceUrlUIPart`

消息的源 URL 部分。

```typescript
type SourceUrlUIPart = {
  type: 'source-url';
  sourceId: string;
  url: string;
  title?: string;
  providerMetadata?: Record<string, any>;
};
```

### `SourceDocumentUIPart`

消息的文档源部分。

```typescript
type SourceDocumentUIPart = {
  type: 'source-document';
  sourceId: string;
  mediaType: string;
  title: string;
  filename?: string;
  providerMetadata?: Record<string, any>;
};
```

### `FileUIPart`

消息的文件部分。

```typescript
type FileUIPart = {
  type: 'file';
  /**
   * 文件的 IANA 媒体类型。
   */
  mediaType: string;
  /**
   * 可选的文件名。
   */
  filename?: string;
  /**
   * 文件的 URL。
   * 可以是托管文件的 URL 或数据 URL。
   */
  url: string;
};
```

### `DataUIPart`

用于自定义数据类型的消息数据部分。

<Note>
  该类型基于数据部分的名称（例如，名为 `someDataPart` 的数据部分类型为 `data-someDataPart`）。
</Note>

```typescript
type DataUIPart<DATA_TYPES extends UIDataTypes> = ValueOf<{
  [NAME in keyof DATA_TYPES & string]: {
    type: `data-${NAME}`;
    id?: string;
    data: DATA_TYPES[NAME];
  };
}>;
```

### `StepStartUIPart`

消息的步骤边界部分。

```typescript
type StepStartUIPart = {
  type: 'step-start';
};
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
