# `generateImage()`

使用图像模型基于给定提示生成图像。

它非常适合需要以编程方式生成图像的用例，例如创建视觉内容或为数据增强生成图像。

```ts
import { generateImage } from 'ai';

const { images } = await generateImage({
  model: openai.image('dall-e-3'),
  prompt: 'A futuristic cityscape at sunset',
  n: 3,
  size: '1024x1024',
});

console.log(images);
```

## 导入

<Snippet text={`import { generateImage } from "ai"`} prompt={false} />

## API 签名

### 参数

<PropertiesTable
  content={[
    {
      name: 'model',
      type: 'ImageModelV3',
      description: '要使用的图像模型。',
    },
    {
      name: 'prompt',
      type: 'string | GenerateImagePrompt',
      description: '用于生成图像的输入提示。',
      properties: [
        {
          type: 'GenerateImagePrompt',
          type: 'object',
          description: '用于图像编辑的提示对象',
          parameters: [
            {
              name: 'images',
              type: 'Array<DataContent>',
              description:
                '图像项可以是以下之一：base64编码字符串、`Uint8Array`、`ArrayBuffer` 或 `Buffer`。',
            },
            {
              name: 'text',
              type: 'string',
              description: '文本提示。',
            },
            {
              name: 'mask',
              type: 'DataContent',
              description:
                'base64编码字符串、`Uint8Array`、`ArrayBuffer` 或 `Buffer`。',
            },
          ],
        },
      ],
    },
    {
      name: 'n',
      type: 'number',
      isOptional: true,
      description: '要生成的图像数量。',
    },
    {
      name: 'size',
      type: 'string',
      isOptional: true,
      description:
        '要生成的图像尺寸。格式：`{宽度}x{高度}`。',
    },
    {
      name: 'aspectRatio',
      type: 'string',
      isOptional: true,
      description:
        '要生成的图像宽高比。格式：`{宽度}:{高度}`。',
    },
    {
      name: 'seed',
      type: 'number',
      isOptional: true,
      description: '图像生成的种子。',
    },
    {
      name: 'providerOptions',
      type: 'ProviderOptions',
      isOptional: true,
      description: '额外的提供商特定选项。',
    },
    {
      name: 'maxRetries',
      type: 'number',
      isOptional: true,
      description: '最大重试次数。默认值：2。',
    },
    {
      name: 'abortSignal',
      type: 'AbortSignal',
      isOptional: true,
      description: '用于取消调用的可选中止信号。',
    },
    {
      name: 'headers',
      type: 'Record<string, string>',
      isOptional: true,
      description: '用于请求的额外 HTTP 头部。',
    },
  ]}
/>

### 返回值

<PropertiesTable
  content={[
    {
      name: 'image',
      type: 'GeneratedFile',
      description: '生成的第一个图像。',
      properties: [
        {
          type: 'GeneratedFile',
          parameters: [
            {
              name: 'base64',
              type: 'string',
              description: '图像作为 base64 编码字符串。',
            },
            {
              name: 'uint8Array',
              type: 'Uint8Array',
              description: '图像作为 Uint8Array。',
            },
            {
              name: 'mediaType',
              type: 'string',
              description: '图像的 IANA 媒体类型。',
            },
          ],
        },
      ],
    },
    {
      name: 'images',
      type: 'Array<GeneratedFile>',
      description: '生成的所有图像。',
      properties: [
        {
          type: 'GeneratedFile',
          parameters: [
            {
              name: 'base64',
              type: 'string',
              description: '图像作为 base64 编码字符串。',
            },
            {
              name: 'uint8Array',
              type: 'Uint8Array',
              description: '图像作为 Uint8Array。',
            },
            {
              name: 'mediaType',
              type: 'string',
              description: '图像的 IANA 媒体类型。',
            },
          ],
        },
      ],
    },
    {
      name: 'warnings',
      type: 'Warning[]',
      description:
        '来自模型提供商的警告（例如，不支持的设置）。',
    },
    {
      name: 'providerMetadata',
      type: 'ImageModelProviderMetadata',
      isOptional: true,
      description:
        '来自提供商的可选元数据。外层键是提供商名称。内层值是元数据。元数据中始终存在一个 `images` 键，它是一个数组，长度与顶层 `images` 键相同。具体细节取决于提供商。',
    },
    {
      name: 'responses',
      type: 'Array<ImageModelResponseMetadata>',
      description:
        '来自提供商的响应元数据。如果我们对模型进行了多次调用，则可能有多个响应。',
      properties: [
        {
          type: 'ImageModelResponseMetadata',
          parameters: [
            {
              name: 'timestamp',
              type: 'Date',
              description: '生成响应开始的时间戳。',
            },
            {
              name: 'modelId',
              type: 'string',
              description:
                '用于生成响应的响应模型的 ID。',
            },
            {
              name: 'headers',
              type: 'Record<string, string>',
              isOptional: true,
              description: '响应头部。',
            },
          ],
        },
      ],
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