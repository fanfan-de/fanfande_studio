# `generateSpeech()`

<Note type="warning">`generateSpeech` 是一个实验性功能。</Note>

从文本生成语音音频。

```ts
import { experimental_generateSpeech as generateSpeech } from 'ai';
import { openai } from '@ai-sdk/openai';

const { audio } = await generateSpeech({
  model: openai.speech('tts-1'),
  text: 'Hello from the AI SDK!',
  voice: 'alloy',
});

console.log(audio);
```

## 示例

### OpenAI

```ts
import { experimental_generateSpeech as generateSpeech } from 'ai';
import { openai } from '@ai-sdk/openai';

const { audio } = await generateSpeech({
  model: openai.speech('tts-1'),
  text: 'Hello from the AI SDK!',
  voice: 'alloy',
});
```

### ElevenLabs

```ts
import { experimental_generateSpeech as generateSpeech } from 'ai';
import { elevenlabs } from '@ai-sdk/elevenlabs';

const { audio } = await generateSpeech({
  model: elevenlabs.speech('eleven_multilingual_v2'),
  text: 'Hello from the AI SDK!',
  voice: 'your-voice-id', // 必填：从您的 ElevenLabs 账户获取此值
});
```

## 导入

<Snippet
  text={`import { experimental_generateSpeech as generateSpeech } from "ai"`}
  prompt={false}
/>

## API 签名

### 参数

<PropertiesTable
  content={[
    {
      name: 'model',
      type: 'SpeechModelV3',
      description: '要使用的语音模型。',
    },
    {
      name: 'text',
      type: 'string',
      description: '用于生成语音的文本。',
    },
    {
      name: 'voice',
      type: 'string',
      isOptional: true,
      description: '用于语音的声线。',
    },
    {
      name: 'outputFormat',
      type: 'string',
      isOptional: true,
      description: '语音的输出格式，例如 "mp3"、"wav" 等。',
    },
    {
      name: 'instructions',
      type: 'string',
      isOptional: true,
      description: '语音生成的指令。',
    },
    {
      name: 'speed',
      type: 'number',
      isOptional: true,
      description: '语音生成的速度。',
    },
    {
      name: 'language',
      type: 'string',
      isOptional: true,
      description: '语音生成的语言。应为 ISO 639-1 语言代码（例如 "en"、"es"、"fr"）或 "auto" 表示自动语言检测。提供商支持情况各异。',
    },
    {
      name: 'providerOptions',
      type: 'Record<string, JSONObject>',
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
      description: '可选的取消信号，用于取消调用。',
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
      name: 'audio',
      type: 'GeneratedAudioFile',
      description: '生成的音频。',
      properties: [
        {
          type: 'GeneratedAudioFile',
          parameters: [
            {
              name: 'base64',
              type: 'string',
              description: '音频的 base64 编码字符串。',
            },
            {
              name: 'uint8Array',
              type: 'Uint8Array',
              description: '音频的 Uint8Array 格式。',
            },
            {
              name: 'mimeType',
              type: 'string',
              description: '音频的 MIME 类型（例如 "audio/mpeg"）。',
            },
            {
              name: 'format',
              type: 'string',
              description: '音频的格式（例如 "mp3"）。',
            },
          ],
        },
      ],
    },
    {
      name: 'warnings',
      type: 'Warning[]',
      description: '来自模型提供商的警告（例如不受支持的设置）。',
    },
    {
      name: 'responses',
      type: 'Array<SpeechModelResponseMetadata>',
      description: '来自提供商的响应元数据。如果对模型进行了多次调用，可能会有多个响应。',
      properties: [
        {
          type: 'SpeechModelResponseMetadata',
          parameters: [
            {
              name: 'timestamp',
              type: 'Date',
              description: '生成响应开始的时间戳。',
            },
            {
              name: 'modelId',
              type: 'string',
              description: '用于生成响应的响应模型的 ID。',
            },
            {
              name: 'body',
              isOptional: true,
              type: 'unknown',
              description: '可选的响应体。',
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
- [流式文本](/docs/reference/ai-sdk-core/stream-text)
- [生成对象](/docs/reference/ai-sdk-core/generate-object)
- [流式对象](/docs/reference/ai-sdk-core/stream-object)
- [嵌入](/docs/reference/ai-sdk-core/embed)
- [批量嵌入](/docs/reference/ai-sdk-core/embed-many)
- [重排序](/docs/reference/ai-sdk-core/rerank)
- [生成图像](/docs/reference/ai-sdk-core/generate-image)
- [转录](/docs/reference/ai-sdk-core/transcribe)
- [生成语音](/docs/reference/ai-sdk-core/generate-speech)
- [代理（接口）](/docs/reference/ai-sdk-core/agent)
- [工具循环代理](/docs/reference/ai-sdk-core/tool-loop-agent)
- [创建代理UI流](/docs/reference/ai-sdk-core/create-agent-ui-stream)
- [创建代理UI流响应](/docs/reference/ai-sdk-core/create-agent-ui-stream-response)
- [将代理UI流传输到响应](/docs/reference/ai-sdk-core/pipe-agent-ui-stream-to-response)
- [工具](/docs/reference/ai-sdk-core/tool)
- [动态工具](/docs/reference/ai-sdk-core/dynamic-tool)
- [创建MCP客户端](/docs/reference/ai-sdk-core/create-mcp-client)
- [实验性_StdioMCP传输](/docs/reference/ai-sdk-core/mcp-stdio-transport)
- [JSON模式](/docs/reference/ai-sdk-core/json-schema)
- [Zod模式](/docs/reference/ai-sdk-core/zod-schema)
- [Valibot模式](/docs/reference/ai-sdk-core/valibot-schema)
- [输出](/docs/reference/ai-sdk-core/output)
- [模型消息](/docs/reference/ai-sdk-core/model-message)
- [UI消息](/docs/reference/ai-sdk-core/ui-message)
- [验证UI消息](/docs/reference/ai-sdk-core/validate-ui-messages)
- [安全验证UI消息](/docs/reference/ai-sdk-core/safe-validate-ui-messages)
- [创建提供商注册表](/docs/reference/ai-sdk-core/provider-registry)
- [自定义提供商](/docs/reference/ai-sdk-core/custom-provider)
- [余弦相似度](/docs/reference/ai-sdk-core/cosine-similarity)
- [包装语言模型](/docs/reference/ai-sdk-core/wrap-language-model)
- [包装图像模型](/docs/reference/ai-sdk-core/wrap-image-model)
- [语言模型V3中间件](/docs/reference/ai-sdk-core/language-model-v2-middleware)
- [提取推理中间件](/docs/reference/ai-sdk-core/extract-reasoning-middleware)
- [模拟流式中间件](/docs/reference/ai-sdk-core/simulate-streaming-middleware)
- [默认设置中间件](/docs/reference/ai-sdk-core/default-settings-middleware)
- [添加工具输入示例中间件](/docs/reference/ai-sdk-core/add-tool-input-examples-middleware)
- [提取JSON中间件](/docs/reference/ai-sdk-core/extract-json-middleware)
- [步数判断](/docs/reference/ai-sdk-core/step-count-is)
- [含有工具调用](/docs/reference/ai-sdk-core/has-tool-call)
- [模拟可读流](/docs/reference/ai-sdk-core/simulate-readable-stream)
- [平滑流](/docs/reference/ai-sdk-core/smooth-stream)
- [生成ID](/docs/reference/ai-sdk-core/generate-id)
- [创建ID生成器](/docs/reference/ai-sdk-core/create-id-generator)

[完整站点地图](/sitemap.md)