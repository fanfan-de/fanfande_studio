# `embedMany()`

使用嵌入模型对多个值进行嵌入。值的类型由嵌入模型定义。

`embedMany` 会自动将大型请求拆分成较小的块，如果模型对单次调用中可生成的嵌入数量有限制。

```ts
import { embedMany } from 'ai';

const { embeddings } = await embedMany({
  model: 'openai/text-embedding-3-small',
  values: [
    'sunny day at the beach',
    'rainy afternoon in the city',
    'snowy night in the mountains',
  ],
});
```

## 导入

<Snippet text={`import { embedMany } from "ai"`} prompt={false} />

## API签名

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
      name: 'values',
      type: 'Array<VALUE>',
      description: '要进行嵌入的值。类型取决于模型。',
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
        '可选的取消信号，可用于取消调用。',
    },
    {
      name: 'headers',
      type: 'Record<string, string>',
      isOptional: true,
      description:
        '随请求发送的附加HTTP请求头。仅适用于基于HTTP的提供商。',
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
                '启用或禁用遥测。在实验期间默认禁用。',
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
                '要包含在遥测数据中的附加信息。',
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
      name: 'values',
      type: 'Array<VALUE>',
      description: '被嵌入的值。',
    },
    {
      name: 'embeddings',
      type: 'number[][]',
      description: '嵌入向量。它们与值的顺序相同。',
    },
    {
      name: 'usage',
      type: 'EmbeddingModelUsage',
      description: '生成嵌入向量的令牌使用情况。',
      properties: [
        {
          type: 'EmbeddingModelUsage',
          parameters: [
            {
              name: 'tokens',
              type: 'number',
              description: '输入令牌的总数。',
            },
          ],
        },
      ],
    },
    {
      name: 'warnings',
      type: 'Warning[]',
      description:
        '来自模型提供商的警告（例如不受支持的设置）。',
    },
    {
      name: 'providerMetadata',
      type: 'ProviderMetadata | undefined',
      isOptional: true,
      description:
        '来自提供商的可选元数据。外键是提供商名称。内部值是元数据。详细信息取决于提供商。',
    },
  ]}
/>


## 导航

- [生成文本](/docs/reference/ai-sdk-core/generate-text)
- [流式文本](/docs/reference/ai-sdk-core/stream-text)
- [生成对象](/docs/reference/ai-sdk-core/generate-object)
- [流式对象](/docs/reference/ai-sdk-core/stream-object)
- [嵌入](/docs/reference/ai-sdk-core/embed)
- [嵌入多个](/docs/reference/ai-sdk-core/embed-many)
- [重排序](/docs/reference/ai-sdk-core/rerank)
- [生成图像](/docs/reference/ai-sdk-core/generate-image)
- [转录](/docs/reference/ai-sdk-core/transcribe)
- [生成语音](/docs/reference/ai-sdk-core/generate-speech)
- [代理（接口）](/docs/reference/ai-sdk-core/agent)
- [工具循环代理](/docs/reference/ai-sdk-core/tool-loop-agent)
- [创建代理UI流](/docs/reference/ai-sdk-core/create-agent-ui-stream)
- [创建代理UI流响应](/docs/reference/ai-sdk-core/create-agent-ui-stream-response)
- [管道代理UI流到响应](/docs/reference/ai-sdk-core/pipe-agent-ui-stream-to-response)
- [工具](/docs/reference/ai-sdk-core/tool)
- [动态工具](/docs/reference/ai-sdk-core/dynamic-tool)
- [创建MCP客户端](/docs/reference/ai-sdk-core/create-mcp-client)
- [Experimental_StdioMCPTransport](/docs/reference/ai-sdk-core/mcp-stdio-transport)
- [jsonSchema](/docs/reference/ai-sdk-core/json-schema)
- [zodSchema](/docs/reference/ai-sdk-core/zod-schema)
- [valibotSchema](/docs/reference/ai-sdk-core/valibot-schema)
- [输出](/docs/reference/ai-sdk-core/output)
- [模型消息](/docs/reference/ai-sdk-core/model-message)
- [UI消息](/docs/reference/ai-sdk-core/ui-message)
- [验证UI消息](/docs/reference/ai-sdk-core/validate-ui-messages)
- [安全验证UI消息](/docs/reference/ai-sdk-core/safe-validate-ui-messages)
- [创建提供者注册表](/docs/reference/ai-sdk-core/provider-registry)
- [自定义提供者](/docs/reference/ai-sdk-core/custom-provider)
- [余弦相似度](/docs/reference/ai-sdk-core/cosine-similarity)
- [包装语言模型](/docs/reference/ai-sdk-core/wrap-language-model)
- [包装图像模型](/docs/reference/ai-sdk-core/wrap-image-model)
- [LanguageModelV3Middleware](/docs/reference/ai-sdk-core/language-model-v2-middleware)
- [提取推理中间件](/docs/reference/ai-sdk-core/extract-reasoning-middleware)
- [模拟流式中间件](/docs/reference/ai-sdk-core/simulate-streaming-middleware)
- [默认设置中间件](/docs/reference/ai-sdk-core/default-settings-middleware)
- [添加工具输入示例中间件](/docs/reference/ai-sdk-core/add-tool-input-examples-middleware)
- [提取JSON中间件](/docs/reference/ai-sdk-core/extract-json-middleware)
- [stepCountIs](/docs/reference/ai-sdk-core/step-count-is)
- [hasToolCall](/docs/reference/ai-sdk-core/has-tool-call)
- [simulateReadableStream](/docs/reference/ai-sdk-core/simulate-readable-stream)
- [smoothStream](/docs/reference/ai-sdk-core/smooth-stream)
- [generateId](/docs/reference/ai-sdk-core/generate-id)
- [createIdGenerator](/docs/reference/ai-sdk-core/create-id-generator)


[完整站点地图](/sitemap.md)