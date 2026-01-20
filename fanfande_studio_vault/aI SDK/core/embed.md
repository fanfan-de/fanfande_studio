# `embed()`

使用嵌入模型为单个值生成嵌入向量。

这非常适合需要嵌入单个值的用例，例如检索相似项或将嵌入向量用于下游任务。

```ts
import { embed } from 'ai';

const { embedding } = await embed({
  model: 'openai/text-embedding-3-small',
  value: 'sunny day at the beach',
});
```

## 导入

<Snippet text={`import { embed } from "ai"`} prompt={false} />

## API 签名

### 参数

<PropertiesTable
  content={[
    {
      name: 'model',
      type: 'EmbeddingModel',
      description:
        "要使用的嵌入模型。示例：openai.embeddingModel('text-embedding-3-small')",
    },
    {
      name: 'value',
      type: 'VALUE',
      description: '要嵌入的值。类型取决于模型。',
    },
    {
      name: 'maxRetries',
      type: 'number',
      isOptional: true,
      description:
        '最大重试次数。设置为0以禁用重试。默认值：2。',
    },
    {
      name: 'abortSignal',
      type: 'AbortSignal',
      isOptional: true,
      description:
        '可用于取消调用的可选中止信号。',
    },
    {
      name: 'headers',
      type: 'Record<string, string>',
      isOptional: true,
      description:
        '随请求发送的额外HTTP头。仅适用于基于HTTP的提供商。',
    },
    {
      name: 'experimental_telemetry',
      type: 'TelemetrySettings',
      isOptional: true,
      description: '遥测配置。实验性功能。',
      properties: [
        {
          type: 'TelemetrySettings',
          parameters: [
            {
              name: 'isEnabled',
              type: 'boolean',
              isOptional: true,
              description:
                '启用或禁用遥测。实验期间默认禁用。',
            },
            {
              name: 'recordInputs',
              type: 'boolean',
              isOptional: true,
              description:
                '启用或禁用输入记录。默认启用。',
            },
            {
              name: 'recordOutputs',
              type: 'boolean',
              isOptional: true,
              description:
                '启用或禁用输出记录。默认启用。',
            },
            {
              name: 'functionId',
              type: 'string',
              isOptional: true,
              description:
                '此函数的标识符。用于按函数分组遥测数据。',
            },
            {
              name: 'metadata',
              isOptional: true,
              type: 'Record<string, string | number | boolean | Array<null | undefined | string> | Array<null | undefined | number> | Array<null | undefined | boolean>>',
              description:
                '要包含在遥测数据中的额外信息。',
            },
            {
              name: 'tracer',
              type: 'Tracer',
              isOptional: true,
              description: '用于遥测数据的自定义追踪器。',
            },
          ],
        },
      ],
    },
  ]}
/>

### 返回值

<PropertiesTable
  content={[
    {
      name: 'value',
      type: 'VALUE',
      description: '被嵌入的值。',
    },
    {
      name: 'embedding',
      type: 'number[]',
      description: '值的嵌入向量。',
    },
    {
      name: 'usage',
      type: 'EmbeddingModelUsage',
      description: '生成嵌入向量的令牌使用量。',
      properties: [
        {
          type: 'EmbeddingModelUsage',
          parameters: [
            {
              name: 'tokens',
              type: 'number',
              description: '嵌入中使用的令牌数量。',
            },
          ],
        },
      ],
    },
    {
      name: 'warnings',
      type: 'Warning[]',
      description:
        '来自模型提供商的警告（例如不支持的设置）。',
    },
    {
      name: 'response',
      type: 'Response',
      isOptional: true,
      description: '可选的响应数据。',
      properties: [
        {
          type: 'Response',
          parameters: [
            {
              name: 'headers',
              isOptional: true,
              type: 'Record<string, string>',
              description: '响应头。',
            },
            {
              name: 'body',
              type: 'unknown',
              isOptional: true,
              description: '响应体。',
            },
          ],
        },
      ],
    },
    {
      name: 'providerMetadata',
      type: 'ProviderMetadata | undefined',
      isOptional: true,
      description:
        '来自提供商的可选元数据。外层键是提供商名称。内层值是元数据。详细信息取决于提供商。',
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