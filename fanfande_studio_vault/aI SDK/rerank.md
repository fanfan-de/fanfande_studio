# `rerank()`

使用重排序模型基于文档与查询的相关性对一组文档进行重排序。

这对于通过根据查询和文档的语义理解重新排序文档、电子邮件或其他内容来提高搜索相关性非常理想。

```ts
import { cohere } from '@ai-sdk/cohere';
import { rerank } from 'ai';

const { ranking } = await rerank({
  model: cohere.reranking('rerank-v3.5'),
  documents: ['sunny day at the beach', 'rainy afternoon in the city'],
  query: 'talk about rain',
});
```

## 导入

<Snippet text={`import { rerank } from "ai"`} prompt={false} />

## API 签名

### 参数

<PropertiesTable
  content={[
    {
      name: 'model',
      type: 'RerankingModel',
      description:
        "要使用的重排序模型。示例：cohere.reranking('rerank-v3.5')",
    },
    {
      name: 'documents',
      type: 'Array<VALUE>',
      description:
        '要重排序的文档。可以是字符串数组或JSON对象数组。',
    },
    {
      name: 'query',
      type: 'string',
      description: '用于对文档进行排序的搜索查询。',
    },
    {
      name: 'topN',
      type: 'number',
      isOptional: true,
      description:
        '要返回的顶部文档的最大数量。如果未指定，则返回所有文档。',
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
        '随请求发送的额外HTTP头部。仅适用于基于HTTP的提供商。',
    },
    {
      name: 'providerOptions',
      type: 'ProviderOptions',
      isOptional: true,
      description: '重排序请求的提供商特定选项。',
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
      name: 'originalDocuments',
      type: 'Array<VALUE>',
      description: '原始顺序的原始文档数组。',
    },
    {
      name: 'rerankedDocuments',
      type: 'Array<VALUE>',
      description: '按相关性分数（降序）排序的文档。',
    },
    {
      name: 'ranking',
      type: 'Array<RankingItem<VALUE>>',
      description: '包含分数和索引的排序项数组。',
      properties: [
        {
          type: 'RankingItem<VALUE>',
          parameters: [
            {
              name: 'originalIndex',
              type: 'number',
              description:
                '文档在原始文档数组中的索引。',
            },
            {
              name: 'score',
              type: 'number',
              description:
                '文档的相关性分数（通常在0-1之间，分数越高表示越相关）。',
            },
            {
              name: 'document',
              type: 'VALUE',
              description: '文档本身。',
            },
          ],
        },
      ],
    },
    {
      name: 'response',
      type: 'Response',
      description: '响应数据。',
      properties: [
        {
          type: 'Response',
          parameters: [
            {
              name: 'id',
              isOptional: true,
              type: 'string',
              description: '来自提供商的响应ID。',
            },
            {
              name: 'timestamp',
              type: 'Date',
              description: '响应的时间戳。',
            },
            {
              name: 'modelId',
              type: 'string',
              description: '用于重排序的模型ID。',
            },
            {
              name: 'headers',
              isOptional: true,
              type: 'Record<string, string>',
              description: '响应头部。',
            },
            {
              name: 'body',
              type: 'unknown',
              isOptional: true,
              description: '原始响应体。',
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
        '来自提供商的可选元数据。外层键是提供商名称。内层值是元数据。具体细节取决于提供商。',
    },
  ]}
/>

## 示例

### 字符串文档

```ts
import { cohere } from '@ai-sdk/cohere';
import { rerank } from 'ai';

const { ranking, rerankedDocuments } = await rerank({
  model: cohere.reranking('rerank-v3.5'),
  documents: [
    'sunny day at the beach',
    'rainy afternoon in the city',
    'snowy night in the mountains',
  ],
  query: 'talk about rain',
  topN: 2,
});

console.log(rerankedDocuments);
// ['rainy afternoon in the city', 'sunny day at the beach']

console.log(ranking);
// [
//   { originalIndex: 1, score: 0.9, document: 'rainy afternoon...' },
//   { originalIndex: 0, score: 0.3, document: 'sunny day...' }
// ]
```

### 对象文档

```ts
import { cohere } from '@ai-sdk/cohere';
import { rerank } from 'ai';

const documents = [
  {
    from: 'Paul Doe',
    subject: 'Follow-up',
    text: 'We are happy to give you a discount of 20%.',
  },
  {
    from: 'John McGill',
    subject: 'Missing Info',
    text: 'Here is the pricing from Oracle: $5000/month',
  },
];

const { ranking } = await rerank({
  model: cohere.reranking('rerank-v3.5'),
  documents,
  query: 'Which pricing did we get from Oracle?',
  topN: 1,
});

console.log(ranking[0].document);
// { from: 'John McGill', subject: 'Missing Info', ... }
```

### 使用提供商选项

```ts
import { cohere } from '@ai-sdk/cohere';
import { rerank } from 'ai';

const { ranking } = await rerank({
  model: cohere.reranking('rerank-v3.5'),
  documents: ['sunny day at the beach', 'rainy afternoon in the city'],
  query: 'talk about rain',
  providerOptions: {
    cohere: {
      maxTokensPerDoc: 1000,
    },
  },
});
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