# `tool()`

`tool()` 是一个辅助函数，用于推断其 `execute` 方法的工具输入。

它在运行时没有任何行为，但可以帮助 TypeScript 推断 `execute` 方法的输入类型。

如果没有这个辅助函数，TypeScript 无法将 `inputSchema` 属性连接到 `execute` 方法，并且 `execute` 的参数类型无法推断。

```ts highlight={"1,4,9,10"}
import { tool } from 'ai';
import { z } from 'zod';

export const weatherTool = tool({
  description: 'Get the weather in a location',
  inputSchema: z.object({
    location: z.string().describe('The location to get the weather for'),
  }),
  // location 下方被推断为字符串：
  execute: async ({ location }) => ({
    location,
    temperature: 72 + Math.floor(Math.random() * 21) - 10,
  }),
});
```

## 导入

<Snippet text={`import { tool } from "ai"`} prompt={false} />

## API 签名

### 参数

<PropertiesTable
  content={[
    {
      name: 'tool',
      type: 'Tool',
      description: '工具定义。',
      properties: [
        {
          type: 'Tool',
          parameters: [
            {
              name: 'description',
              isOptional: true,
              type: 'string',
              description:
                '关于工具用途的信息，包括模型如何使用以及何时可以使用该工具的详细信息。',
            },
            {
              name: 'inputSchema',
              type: 'Zod Schema | JSON Schema',
              description:
                '工具期望的输入模式。语言模型将使用此模式生成输入。它也用于验证语言模型的输出。使用描述使输入对语言模型可理解。你可以传入 Zod 模式或 JSON 模式（使用 `jsonSchema` 函数）。',
            },
            {
              name: 'inputExamples',
              isOptional: true,
              type: 'Array<{ input: INPUT }>',
              description:
                '可选的输入示例列表，用于向语言模型展示输入应该是什么样子。',
            },
            {
              name: 'strict',
              isOptional: true,
              type: 'boolean',
              description:
                '工具的严格模式设置。支持严格模式的提供者将使用此设置来确定应如何生成输入。严格模式将始终产生有效的输入，但可能会限制支持的输入模式。',
            },
            {
              name: 'execute',
              isOptional: true,
              type: 'async (input: INPUT, options: ToolExecutionOptions) => RESULT | Promise<RESULT> | AsyncIterable<RESULT>',
              description:
                '一个异步函数，使用工具调用的参数调用，并产生结果或结果迭代器。如果提供了迭代器，则除最后一个结果外的所有结果都被视为初步结果。如果未提供，工具将不会自动执行。',
              properties: [
                {
                  type: 'ToolExecutionOptions',
                  parameters: [
                    {
                      name: 'toolCallId',
                      type: 'string',
                      description:
                        '工具调用的 ID。你可以在使用流数据发送工具调用相关信息时使用它。',
                    },
                    {
                      name: 'messages',
                      type: 'ModelMessage[]',
                      description:
                        '发送给语言模型以启动包含工具调用的响应的消息。这些消息不包括系统提示，也不包括包含工具调用的助手响应。',
                    },
                    {
                      name: 'abortSignal',
                      type: 'AbortSignal',
                      isOptional: true,
                      description:
                        '一个可选的终止信号，表示整个操作应被终止。',
                    },
                    {
                      name: 'experimental_context',
                      type: 'unknown',
                      isOptional: true,
                      description:
                        '传递给工具执行的上下文。实验性功能（可能在补丁版本中发生变更）。',
                    },
                  ],
                },
              ],
            },
            {
              name: 'outputSchema',
              isOptional: true,
              type: 'Zod Schema | JSON Schema',
              description:
                '工具产生的输出模式。用于验证和类型推断。',
            },
            {
              name: 'toModelOutput',
              isOptional: true,
              type: '({toolCallId: string; input: INPUT; output: OUTPUT}) => ToolResultOutput | PromiseLike<ToolResultOutput>',
              description:
                '将工具结果映射为语言模型可使用的输出的可选转换函数。如果未提供，工具结果将作为 JSON 对象发送。',
            },
            {
              name: 'onInputStart',
              isOptional: true,
              type: '(options: ToolExecutionOptions) => void | PromiseLike<void>',
              description:
                '当参数流开始时调用的可选函数。仅在流式上下文中使用工具时调用。',
            },
            {
              name: 'onInputDelta',
              isOptional: true,
              type: '(options: { inputTextDelta: string } & ToolExecutionOptions) => void | PromiseLike<void>',
              description:
                '当参数流增量可用时调用的可选函数。仅在流式上下文中使用工具时调用。',
            },
            {
              name: 'onInputAvailable',
              isOptional: true,
              type: '(options: { input: INPUT } & ToolExecutionOptions) => void | PromiseLike<void>',
              description:
                '当可以启动工具调用时调用的可选函数，即使未提供 execute 函数。',
            },
            {
              name: 'providerOptions',
              isOptional: true,
              type: 'ProviderOptions',
              description:
                '额外的提供者特定元数据。它们通过 AI SDK 传递给提供者，并支持可以完全封装在提供者中的提供者特定功能。',
            },
            {
              name: 'type',
              isOptional: true,
              type: "'function' | 'provider-defined'",
              description:
                '工具的类型。默认为常规工具的 "function"。对于提供者特定工具，使用 "provider-defined"。',
            },
            {
              name: 'id',
              isOptional: true,
              type: 'string',
              description:
                '提供者定义工具的 ID。应遵循格式 `<provider-name>.<unique-tool-name>`。当 type 为 "provider-defined" 时必须提供。',
            },
            {
              name: 'name',
              isOptional: true,
              type: 'string',
              description:
                '用户必须在工具集中使用的工具名称。当 type 为 "provider-defined" 时必须提供。',
            },
            {
              name: 'args',
              isOptional: true,
              type: 'Record<string, unknown>',
              description:
                '用于配置工具的参数。必须符合提供者为该工具定义的预期参数。当 type 为 "provider-defined" 时必须提供。',
            },
          ],
        },
      ],
    },
  ]}
/>

### 返回值

返回传入的工具。


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
