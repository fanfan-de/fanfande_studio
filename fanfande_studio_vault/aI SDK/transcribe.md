# `transcribe()`

<Note type="warning">`transcribe` 是一个实验性功能。</Note>

从音频文件生成转录文本。

```ts
import { experimental_transcribe as transcribe } from 'ai';
import { openai } from '@ai-sdk/openai';
import { readFile } from 'fs/promises';

const { text: transcript } = await transcribe({
  model: openai.transcription('whisper-1'),
  audio: await readFile('audio.mp3'),
});

console.log(transcript);
```

## 导入

<Snippet
  text={`import { experimental_transcribe as transcribe } from "ai"`}
  prompt={false}
/>

## API 签名

### 参数

<PropertiesTable
  content={[
    {
      name: 'model',
      type: 'TranscriptionModelV3',
      description: '要使用的转录模型。',
    },
    {
      name: 'audio',
      type: 'DataContent (string | Uint8Array | ArrayBuffer | Buffer) | URL',
      description: '要生成转录的音频文件。',
    },
    {
      name: 'providerOptions',
      type: 'Record<string, JSONObject>',
      isOptional: true,
      description: '额外的提供者特定选项。',
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
      description: '请求的额外 HTTP 头部。',
    },
  ]}
/>

### 返回值

<PropertiesTable
  content={[
    {
      name: 'text',
      type: 'string',
      description: '音频输入完整的转录文本。',
    },
    {
      name: 'segments',
      type: 'Array<{ text: string; startSecond: number; endSecond: number }>',
      description:
        '转录片段数组，每个片段包含部分转录文本及其开始和结束时间（秒）。',
    },
    {
      name: 'language',
      type: 'string | undefined',
      description:
        '转录的语言，ISO-639-1 格式，例如 "en" 表示英语。',
    },
    {
      name: 'durationInSeconds',
      type: 'number | undefined',
      description: '转录的持续时间（秒）。',
    },
    {
      name: 'warnings',
      type: 'Warning[]',
      description:
        '模型提供者的警告（例如不受支持的设置）。',
    },
    {
      name: 'responses',
      type: 'Array<TranscriptionModelResponseMetadata>',
      description:
        '来自提供者的响应元数据。如果对模型进行了多次调用，则可能有多个响应。',
      properties: [
        {
          type: 'TranscriptionModelResponseMetadata',
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
                '用于生成响应的响应模型 ID。',
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

- [生成文本](/docs/reference/ai-sdk-core/generate-text)
- [流式生成文本](/docs/reference/ai-sdk-core/stream-text)
- [生成对象](/docs/reference/ai-sdk-core/generate-object)
- [流式生成对象](/docs/reference/ai-sdk-core/stream-object)
- [嵌入](/docs/reference/ai-sdk-core/embed)
- [批量嵌入](/docs/reference/ai-sdk-core/embed-many)
- [重排序](/docs/reference/ai-sdk-core/rerank)
- [生成图像](/docs/reference/ai-sdk-core/generate-image)
- [转录](/docs/reference/ai-sdk-core/transcribe)
- [生成语音](/docs/reference/ai-sdk-core/generate-speech)
- [代理（接口）](/docs/reference/ai-sdk-core/agent)
- [工具循环代理](/docs/reference/ai-sdk-core/tool-loop-agent)
- [创建代理 UI 流](/docs/reference/ai-sdk-core/create-agent-ui-stream)
- [创建代理 UI 流响应](/docs/reference/ai-sdk-core/create-agent-ui-stream-response)
- [将代理 UI 流传输到响应](/docs/reference/ai-sdk-core/pipe-agent-ui-stream-to-response)
- [工具](/docs/reference/ai-sdk-core/tool)
- [动态工具](/docs/reference/ai-sdk-core/dynamic-tool)
- [创建 MCP 客户端](/docs/reference/ai-sdk-core/create-mcp-client)
- [Experimental_StdioMCPTransport](/docs/reference/ai-sdk-core/mcp-stdio-transport)
- [JSON 模式](/docs/reference/ai-sdk-core/json-schema)
- [Zod 模式](/docs/reference/ai-sdk-core/zod-schema)
- [Valibot 模式](/docs/reference/ai-sdk-core/valibot-schema)
- [输出](/docs/reference/ai-sdk-core/output)
- [模型消息](/docs/reference/ai-sdk-core/model-message)
- [UI 消息](/docs/reference/ai-sdk-core/ui-message)
- [验证 UI 消息](/docs/reference/ai-sdk-core/validate-ui-messages)
- [安全验证 UI 消息](/docs/reference/ai-sdk-core/safe-validate-ui-messages)
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
- [提取 JSON 中间件](/docs/reference/ai-sdk-core/extract-json-middleware)
- [步骤计数为](/docs/reference/ai-sdk-core/step-count-is)
- [具有工具调用](/docs/reference/ai-sdk-core/has-tool-call)
- [模拟可读流](/docs/reference/ai-sdk-core/simulate-readable-stream)
- [平滑流](/docs/reference/ai-sdk-core/smooth-stream)
- [生成 ID](/docs/reference/ai-sdk-core/generate-id)
- [创建 ID 生成器](/docs/reference/ai-sdk-core/create-id-generator)

[完整站点地图](/sitemap.md)