# `Agent`（接口）

`Agent` 接口定义了代理（agent）的契约，这些代理能够根据提示生成或流式传输AI生成的响应。代理可以封装高级逻辑，如工具使用、多步骤工作流或提示处理，从而实现简单和自主的AI代理。

实现 `Agent` 接口的类（例如 `ToolLoopAgent`）遵循相同的契约，并与所有期望代理的SDK API和工具无缝集成。这种设计允许用户提供自定义代理类或第三方链的包装器，同时最大限度地提高与AI SDK功能的兼容性。

## 接口定义

```ts
import { ModelMessage } from '@ai-sdk/provider-utils';
import { ToolSet } from '../generate-text/tool-set';
import { Output } from '../generate-text/output';
import { GenerateTextResult } from '../generate-text/generate-text-result';
import { StreamTextResult } from '../generate-text/stream-text-result';

export type AgentCallParameters<CALL_OPTIONS> = ([CALL_OPTIONS] extends [never]
  ? { options?: never }
  : { options: CALL_OPTIONS }) &
  (
    | {
        /**
         * 提示。可以是文本提示或消息列表。
         *
         * 可以使用 `prompt` 或 `messages`，但不能同时使用两者。
         */
        prompt: string | Array<ModelMessage>;

        /**
         * 消息列表。
         *
         * 可以使用 `prompt` 或 `messages`，但不能同时使用两者。
         */
        messages?: never;
      }
    | {
        /**
         * 消息列表。
         *
         * 可以使用 `prompt` 或 `messages`，但不能同时使用两者。
         */
        messages: Array<ModelMessage>;

        /**
         * 提示。可以是文本提示或消息列表。
         *
         * 可以使用 `prompt` 或 `messages`，但不能同时使用两者。
         */
        prompt?: never;
      }
  ) & {
    /**
     * 中止信号。
     */
    abortSignal?: AbortSignal;
    /**
     * 超时时间（毫秒）。可以指定为数字或具有 totalMs 属性的对象。
     * 如果调用时间超过指定超时，将被中止。
     * 可与 abortSignal 同时使用。
     */
    timeout?: number | { totalMs?: number };
  };

/**
 * 代理接收提示（文本或消息）并生成或流式传输由步骤、工具调用、数据部分等组成的输出。
 *
 * 您可以通过实现 `Agent` 接口来实现自己的代理，
 * 或使用 `ToolLoopAgent` 类。
 */
export interface Agent<
  CALL_OPTIONS = never,
  TOOLS extends ToolSet = {},
  OUTPUT extends Output = never,
> {
  /**
   * 代理接口的规范版本。这将使我们能够演进代理接口并保持向后兼容性。
   */
  readonly version: 'agent-v1';

  /**
   * 代理的 id。
   */
  readonly id: string | undefined;

  /**
   * 代理可以使用的工具。
   */
  readonly tools: TOOLS;

  /**
   * 从代理生成输出（非流式）。
   */
  generate(
    options: AgentCallParameters<CALL_OPTIONS>,
  ): PromiseLike<GenerateTextResult<TOOLS, OUTPUT>>;

  /**
   * 从代理流式传输输出（流式）。
   */
  stream(
    options: AgentCallParameters<CALL_OPTIONS>,
  ): PromiseLike<StreamTextResult<TOOLS, OUTPUT>>;
}
```

## 核心属性与方法

| 名称         | 类型                                             | 描述                                                         |
| ------------ | ------------------------------------------------ | ------------------------------------------------------------------- |
| `version`    | `'agent-v1'`                                     | 接口版本，用于兼容性。                                |
| `id`         | `string \| undefined`                            | 可选的代理标识符。                                          |
| `tools`      | `ToolSet`                                        | 此代理可用的工具集。                           |
| `generate()` | `PromiseLike<GenerateTextResult<TOOLS, OUTPUT>>` | 为文本提示或消息生成完整的非流式输出。 |
| `stream()`   | `PromiseLike<StreamTextResult<TOOLS, OUTPUT>>`   | 为文本提示或消息流式传输输出（块或步骤）。     |

## 泛型参数

| 参数      | 默认值 | 描述                                                                |
| -------------- | ------- | -------------------------------------------------------------------------- |
| `CALL_OPTIONS` | `never` | 可选的类型，用于传递给代理的额外调用选项。 |
| `TOOLS`        | `{}`    | 此代理可用工具集的类型。                          |
| `OUTPUT`       | `never` | 代理可以生成的额外输出数据的类型。             |

## 方法参数

`generate()` 和 `stream()` 都接受一个 `AgentCallParameters<CALL_OPTIONS>` 对象，其中包含：

- `prompt`（可选）：字符串提示或 `ModelMessage` 对象数组
- `messages`（可选）：`ModelMessage` 对象数组（与 `prompt` 互斥）
- `options`（可选）：当 `CALL_OPTIONS` 不为 `never` 时的额外调用选项
- `abortSignal`（可选）：用于取消操作的 `AbortSignal`
- `timeout`（可选）：以毫秒为单位的超时时间。可以指定为数字或具有 `totalMs` 属性的对象。如果调用时间超过指定超时，将被中止。可与 `abortSignal` 同时使用。

## 示例：自定义代理实现

以下是如何实现自己的代理：

```ts
import { Agent, GenerateTextResult, StreamTextResult } from 'ai';
import type { ModelMessage } from '@ai-sdk/provider-utils';

class MyEchoAgent implements Agent {
  version = 'agent-v1' as const;
  id = 'echo';
  tools = {};

  async generate({ prompt, messages, abortSignal }) {
    const text = prompt ?? JSON.stringify(messages);
    return { text, steps: [] };
  }

  async stream({ prompt, messages, abortSignal }) {
    const text = prompt ?? JSON.stringify(messages);
    return {
      textStream: (async function* () {
        yield text;
      })(),
    };
  }
}
```

## 用法：与代理交互

所有接受代理的SDK工具——包括 [`createAgentUIStream`](/docs/reference/ai-sdk-core/create-agent-ui-stream)、[`createAgentUIStreamResponse`](/docs/reference/ai-sdk-core/create-agent-ui-stream-response) 和 [`pipeAgentUIStreamToResponse`](/docs/reference/ai-sdk-core/pipe-agent-ui-stream-to-response)——都期望一个符合 `Agent` 接口的对象。

您可以使用官方的 [`ToolLoopAgent`](/docs/reference/ai-sdk-core/tool-loop-agent)（推荐用于具有工具使用的多步骤AI工作流），或提供自己的实现：

```ts
import { ToolLoopAgent, createAgentUIStream } from "ai";

const agent = new ToolLoopAgent({ ... });

const stream = await createAgentUIStream({
  agent,
  messages: [{ role: "user", content: "What is the weather in NYC?" }]
});

for await (const chunk of stream) {
  console.log(chunk);
}
```

## 另请参阅

- [`ToolLoopAgent`](/docs/reference/ai-sdk-core/tool-loop-agent) &mdash; 官方的多步骤代理实现
- [`createAgentUIStream`](/docs/reference/ai-sdk-core/create-agent-ui-stream)
- [`GenerateTextResult`](/docs/reference/ai-sdk-core/generate-text)
- [`StreamTextResult`](/docs/reference/ai-sdk-core/stream-text)

## 注意事项

- 代理应定义其 `tools` 属性，即使为空（`{}`），以确保与SDK工具的兼容性。
- 接口同时接受简单提示和消息数组作为输入，但一次只能使用一种。
- `CALL_OPTIONS` 泛型参数允许代理在需要时接受额外的调用特定选项。
- `abortSignal` 参数支持取消代理操作。
- 该设计既可扩展用于复杂的自主代理，也可用于简单的LLM包装器。

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