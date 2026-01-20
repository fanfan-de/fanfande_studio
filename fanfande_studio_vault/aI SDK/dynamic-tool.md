# dynamicTool() 动态工具函数

`dynamicTool` 函数创建在编译时输入和输出类型未知的工具。这适用于以下场景：

- MCP（模型上下文协议）工具，无需模式
- 运行时加载的用户自定义函数
- 从外部源或数据库加载的工具
- 基于用户输入的动态工具生成

与常规的 `tool` 函数不同，`dynamicTool` 接受并返回 `unknown` 类型，允许您处理运行时确定模式的工具。

```ts highlight={"1,4,9,10,11"}
import { dynamicTool } from 'ai';
import { z } from 'zod';

export const customTool = dynamicTool({
  description: 'Execute a custom user-defined function',
  inputSchema: z.object({}),
  // input is typed as 'unknown'
  execute: async input => {
    const { action, parameters } = input as any;

    // Execute your dynamic logic
    return {
      result: `Executed ${action} with ${JSON.stringify(parameters)}`,
    };
  },
});
```

## 导入

<Snippet text={`import { dynamicTool } from "ai"`} prompt={false} />

## API 签名

### 参数

<PropertiesTable
  content={[
    {
      name: 'tool',
      type: 'Object',
      description: '动态工具定义。',
      properties: [
        {
          type: 'Object',
          parameters: [
            {
              name: 'description',
              isOptional: true,
              type: 'string',
              description:
                '关于工具用途的信息，包括模型如何使用和何时使用的细节。'
            },
            {
              name: 'inputSchema',
              type: 'FlexibleSchema<unknown>',
              description:
                '工具期望的输入模式。虽然类型未知，但仍需要模式进行验证。对于完全动态的输入，可以使用带有 z.unknown() 或 z.any() 的 Zod 模式。'
            },
            {
              name: 'execute',
              type: 'ToolExecuteFunction<unknown, unknown>',
              description:
                '一个异步函数，使用工具调用的参数调用。输入类型为 unknown，必须在运行时验证/转换。',
                properties: [
                  {
                    type: "ToolExecutionOptions",
                    parameters: [
                      {
                      name: 'toolCallId',
                      type: 'string',
                      description: '工具调用的 ID。',
                    },
                    {
                        name: "messages",
                        type: "ModelMessage[]",
                        description: "发送给语言模型的消息。"
                      },
                      {
                        name: "abortSignal",
                        type: "AbortSignal",
                        isOptional: true,
                        description: "可选的终止信号。"
                      }
                    ]
                  }
                ]
            },
            {
              name: 'toModelOutput',
              isOptional: true,
              type: '({toolCallId: string; input: unknown; output: unknown}) => ToolResultOutput | PromiseLike<ToolResultOutput>',
              description: '可选转换函数，将工具结果映射到语言模型可用的输出。'
            },
            {
              name: 'providerOptions',
              isOptional: true,
              type: 'ProviderOptions',
              description: '额外的提供者特定元数据。'
            }
          ]
        }
      ]
    }

]}
/>

### 返回值

一个 `Tool<unknown, unknown>` 类型，`type: 'dynamic'`，可与 `generateText`、`streamText` 和其他 AI SDK 函数一起使用。

## 类型安全使用

当动态工具与静态工具一起使用时，您需要检查 `dynamic` 标志以进行正确的类型收窄：

```ts
const result = await generateText({
  model: __MODEL__,
  tools: {
    // 静态工具，类型已知
    weather: weatherTool,
    // 动态工具，类型未知
    custom: dynamicTool({
      /* ... */
    }),
  },
  onStepFinish: ({ toolCalls, toolResults }) => {
    for (const toolCall of toolCalls) {
      if (toolCall.dynamic) {
        // 动态工具：输入/输出为 'unknown'
        console.log('Dynamic tool:', toolCall.toolName);
        console.log('Input:', toolCall.input);
        continue;
      }

      // 静态工具具有完整的类型推断
      switch (toolCall.toolName) {
        case 'weather':
          // TypeScript 知道确切的类型
          console.log(toolCall.input.location); // string
          break;
      }
    }
  },
});
```

## 与 `useChat` 一起使用

当与 useChat (`UIMessage` 格式) 一起使用时，动态工具显示为 `dynamic-tool` 部分：

```tsx
{
  message.parts.map(part => {
    switch (part.type) {
      case 'dynamic-tool':
        return (
          <div>
            <h4>工具: {part.toolName}</h4>
            <pre>{JSON.stringify(part.input, null, 2)}</pre>
          </div>
        );
      // ... 处理其他部分类型
    }
  });
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