# `ModelMessage`

`ModelMessage` 表示与 AI SDK Core 函数一起使用的基本消息结构。
它包含了可用于任何 AI SDK Core 函数的 `messages` 字段中的各种消息类型。

您可以通过 `modelMessageSchema` 导出访问 `ModelMessage` 的 Zod 模式。

## `ModelMessage` 类型

### `SystemModelMessage`

可以包含系统信息的系统消息。

```typescript
type SystemModelMessage = {
  role: 'system';
  content: string;
};
```

您可以通过 `systemModelMessageSchema` 导出访问 `SystemModelMessage` 的 Zod 模式。

<Note>
  推荐使用 "system" 属性而不是系统消息，以增强对提示注入攻击的抵御能力。
</Note>

### `UserModelMessage`

可以包含文本或文本、图像和文件组合的用户消息。

```typescript
type UserModelMessage = {
  role: 'user';
  content: UserContent;
};

type UserContent = string | Array<TextPart | ImagePart | FilePart>;
```

您可以通过 `userModelMessageSchema` 导出访问 `UserModelMessage` 的 Zod 模式。

### `AssistantModelMessage`

可以包含文本、工具调用或两者组合的助手消息。

```typescript
type AssistantModelMessage = {
  role: 'assistant';
  content: AssistantContent;
};

type AssistantContent = string | Array<TextPart | ToolCallPart>;
```

您可以通过 `assistantModelMessageSchema` 导出访问 `AssistantModelMessage` 的 Zod 模式。

### `ToolModelMessage`

包含一个或多个工具调用结果的工具消息。

```typescript
type ToolModelMessage = {
  role: 'tool';
  content: ToolContent;
};

type ToolContent = Array<ToolResultPart>;
```

您可以通过 `toolModelMessageSchema` 导出访问 `ToolModelMessage` 的 Zod 模式。

## `ModelMessage` 部分

### `TextPart`

表示提示的文本内容部分。它包含一串文本。

```typescript
export interface TextPart {
  type: 'text';
  /**
   * 文本内容。
   */
  text: string;
}
```

### `ImagePart`

表示用户消息中的图像部分。

```typescript
export interface ImagePart {
  type: 'image';

  /**
   * 图像数据。可以是以下之一：
   * - data: base64 编码的字符串、Uint8Array、ArrayBuffer 或 Buffer
   * - URL: 指向图像的 URL
   */
  image: DataContent | URL;

  /**
   * 可选的图像 IANA 媒体类型。
   * 我们建议留空，因为它会自动检测。
   */
  mediaType?: string;
}
```

### `FilePart`

表示用户消息中的文件部分。

```typescript
export interface FilePart {
  type: 'file';

  /**
   * 文件数据。可以是以下之一：
   * - data: base64 编码的字符串、Uint8Array、ArrayBuffer 或 Buffer
   * - URL: 指向文件的 URL
   */
  data: DataContent | URL;

  /**
   * 可选的文件名。
   */
  filename?: string;

  /**
   * 文件的 IANA 媒体类型。
   */
  mediaType: string;
}
```

### `ToolCallPart`

表示提示的工具调用内容部分，通常由 AI 模型生成。

```typescript
export interface ToolCallPart {
  type: 'tool-call';

  /**
   * 工具调用的 ID。此 ID 用于将工具调用与工具结果匹配。
   */
  toolCallId: string;

  /**
   * 被调用工具的名称。
   */
  toolName: string;

  /**
   * 工具调用的参数。这是一个与工具输入模式匹配的 JSON 可序列化对象。
   */
  args: unknown;
}
```

### `ToolResultPart`

表示工具消息中工具调用的结果。

```typescript
export interface ToolResultPart {
  type: 'tool-result';

  /**
   * 与此结果关联的工具调用的 ID。
   */
  toolCallId: string;

  /**
   * 生成此结果的工具的名称。
   */
  toolName: string;

  /**
   * 工具调用的结果。这是一个 JSON 可序列化对象。
   */
  output: LanguageModelV3ToolResultOutput;

  /**
  额外的提供者特定元数据。它们通过 AI SDK 传递给提供者，
  并启用可以完全封装在提供者中的提供者特定功能。
  */
  providerOptions?: ProviderOptions;
}
```

### `LanguageModelV3ToolResultOutput`

```ts
/**
 * 工具结果的输出。
 */
export type ToolResultOutput =
  | {
      /**
       * 应直接发送给 API 的文本工具输出。
       */
      type: 'text';
      value: string;

      /**
       * 提供者特定选项。
       */
      providerOptions?: ProviderOptions;
    }
  | {
      type: 'json';
      value: JSONValue;

      /**
       * 提供者特定选项。
       */
      providerOptions?: ProviderOptions;
    }
  | {
      /**
       * 当用户拒绝执行工具调用时的类型。
       */
      type: 'execution-denied';

      /**
       * 执行拒绝的可选原因。
       */
      reason?: string;

      /**
       * 提供者特定选项。
       */
      providerOptions?: ProviderOptions;
    }
  | {
      type: 'error-text';
      value: string;

      /**
       * 提供者特定选项。
       */
      providerOptions?: ProviderOptions;
    }
  | {
      type: 'error-json';
      value: JSONValue;

      /**
       * 提供者特定选项。
       */
      providerOptions?: ProviderOptions;
    }
  | {
      type: 'content';
      value: Array<
        | {
            type: 'text';

            /**
文本内容。
*/
            text: string;

            /**
             * 提供者特定选项。
             */
            providerOptions?: ProviderOptions;
          }
        | {
            /**
             * @deprecated 请使用 image-data 或 file-data。
             */
            type: 'media';
            data: string;
            mediaType: string;
          }
        | {
            type: 'file-data';

            /**
Base-64 编码的媒体数据。
*/
            data: string;

            /**
IANA 媒体类型。
@see https://www.iana.org/assignments/media-types/media-types.xhtml
*/
            mediaType: string;

            /**
             * 可选的文件名。
             */
            filename?: string;

            /**
             * 提供者特定选项。
             */
            providerOptions?: ProviderOptions;
          }
        | {
            type: 'file-url';

            /**
             * 文件的 URL。
             */
            url: string;

            /**
             * 提供者特定选项。
             */
            providerOptions?: ProviderOptions;
          }
        | {
            type: 'file-id';

            /**
             * 文件的 ID。
             *
             * 如果使用多个提供者，您需要使用
             * Record 选项指定提供者特定的 ID。键是提供者
             * 名称，例如 'openai' 或 'anthropic'。
             */
            fileId: string | Record<string, string>;

            /**
             * 提供者特定选项。
             */
            providerOptions?: ProviderOptions;
          }
        | {
            /**
             * 使用 base64 编码数据引用的图像。
             */
            type: 'image-data';

            /**
Base-64 编码的图像数据。
*/
            data: string;

            /**
IANA 媒体类型。
@see https://www.iana.org/assignments/media-types/media-types.xhtml
*/
            mediaType: string;

            /**
             * 提供者特定选项。
             */
            providerOptions?: ProviderOptions;
          }
        | {
            /**
             * 使用 URL 引用的图像。
             */
            type: 'image-url';

            /**
             * 图像的 URL。
             */
            url: string;

            /**
             * 提供者特定选项。
             */
            providerOptions?: ProviderOptions;
          }
        | {
            /**
             * 使用提供者文件 ID 引用的图像。
             */
            type: 'image-file-id';

            /**
             * 使用提供者文件 ID 引用的图像。
             *
             * 如果使用多个提供者，您需要使用
             * Record 选项指定提供者特定的 ID。键是提供者
             * 名称，例如 'openai' 或 'anthropic'。
             */
            fileId: string | Record<string, string>;

            /**
             * 提供者特定选项。
             */
            providerOptions?: ProviderOptions;
          }
        | {
            /**
             * 自定义内容部分。这可用于实现
             * 提供者特定的内容部分。
             */
            type: 'custom';

            /**
             * 提供者特定选项。
             */
            providerOptions?: ProviderOptions;
          }
      >;
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