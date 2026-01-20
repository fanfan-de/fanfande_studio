# `ToolLoopAgent`

创建一个可重用的AI代理，能够生成文本、流式响应，并在多个步骤中使用工具（一个推理-行动循环）。`ToolLoopAgent` 非常适合构建自主的多步骤代理，这些代理可以执行操作、调用工具，并在达到停止条件之前对结果进行推理。

与 `generateText()` 这样的单步调用不同，代理可以迭代调用工具、收集工具结果，并决定下一步操作，直到完成或需要用户批准。

```ts
import { ToolLoopAgent } from 'ai';
__PROVIDER_IMPORT__;

const agent = new ToolLoopAgent({
  model: __MODEL__,
  instructions: 'You are a helpful assistant.',
  tools: {
    weather: weatherTool,
    calculator: calculatorTool,
  },
});

const result = await agent.generate({
  prompt: 'What is the weather in NYC?',
});

console.log(result.text);
```

要查看 `ToolLoopAgent` 的实际应用，请查看[这些示例](#示例)。

## 导入

<Snippet text={`import { ToolLoopAgent } from "ai"`} prompt={false} />

## 构造函数

### 参数

<PropertiesTable
  content={[
    {
      name: 'model',
      type: 'LanguageModel',
      isRequired: true,
      description: '要使用的语言模型实例（例如，来自提供者）。',
    },
    {
      name: 'instructions',
      type: 'string | SystemModelMessage | SystemModelMessage[]',
      isOptional: true,
      description: '代理的指令，通常用于系统提示/上下文。',
    },
    {
      name: 'tools',
      type: 'Record<string, Tool>',
      isOptional: true,
      description: '代理可以调用的一组工具。键是工具名称。工具需要底层模型支持工具调用。',
    },
    {
      name: 'toolChoice',
      type: 'ToolChoice',
      isOptional: true,
      description: "工具调用选择策略。选项：'auto' | 'none' | 'required' | { type: 'tool', toolName: string }。默认：'auto'。",
    },
    {
      name: 'stopWhen',
      type: 'StopCondition | StopCondition[]',
      isOptional: true,
      description: '结束代理循环的条件。默认：stepCountIs(20)。',
    },
    {
      name: 'activeTools',
      type: 'Array<string>',
      isOptional: true,
      description: '限制特定调用中可用的工具子集。',
    },
    {
      name: 'output',
      type: 'Output',
      isOptional: true,
      description: '可选的结构化输出规范，用于将响应解析为类型安全的数据。',
    },
    {
      name: 'prepareStep',
      type: 'PrepareStepFunction',
      isOptional: true,
      description: '可选函数，用于为每个代理步骤修改步骤设置或注入状态。',
    },
    {
      name: 'experimental_repairToolCall',
      type: 'ToolCallRepairFunction',
      isOptional: true,
      description: '当工具调用无法解析时，尝试自动恢复的可选回调。',
    },
    {
      name: 'onStepFinish',
      type: 'GenerateTextOnStepFinishCallback',
      isOptional: true,
      description: '每个代理步骤（LLM/工具调用）完成后调用的回调。',
    },
    {
      name: 'onFinish',
      type: 'ToolLoopAgentOnFinishCallback',
      isOptional: true,
      description: '所有代理步骤完成且响应结束时调用的回调。接收 { steps, result, experimental_context }。',
    },
    {
      name: 'experimental_context',
      type: 'unknown',
      isOptional: true,
      description: '实验性：传递给每个工具调用的自定义上下文对象。',
    },
    {
      name: 'experimental_telemetry',
      type: 'TelemetrySettings',
      isOptional: true,
      description: '实验性：可选的遥测配置。',
    },
    {
      name: 'experimental_download',
      type: 'DownloadFunction | undefined',
      isOptional: true,
      description: '实验性：自定义下载函数，用于获取工具或模型使用的文件/URL。默认情况下，如果模型不支持给定媒体类型的URL，则会下载文件。',
    },
    {
      name: 'maxOutputTokens',
      type: 'number',
      isOptional: true,
      description: '模型允许生成的最大令牌数。',
    },
    {
      name: 'temperature',
      type: 'number',
      isOptional: true,
      description: '采样温度，控制随机性。传递给模型。',
    },
    {
      name: 'topP',
      type: 'number',
      isOptional: true,
      description: 'Top-p（核）采样参数。传递给模型。',
    },
    {
      name: 'topK',
      type: 'number',
      isOptional: true,
      description: 'Top-k 采样参数。传递给模型。',
    },
    {
      name: 'presencePenalty',
      type: 'number',
      isOptional: true,
      description: '存在惩罚参数。传递给模型。',
    },
    {
      name: 'frequencyPenalty',
      type: 'number',
      isOptional: true,
      description: '频率惩罚参数。传递给模型。',
    },
    {
      name: 'stopSequences',
      type: 'string[]',
      isOptional: true,
      description: '停止模型输出的自定义令牌序列。传递给模型。',
    },
    {
      name: 'seed',
      type: 'number',
      isOptional: true,
      description: '确定性生成的种子（如果支持）。',
    },
    {
      name: 'maxRetries',
      type: 'number',
      isOptional: true,
      description: '失败时重试的次数。默认：2。',
    },
    {
      name: 'providerOptions',
      type: 'ProviderOptions',
      isOptional: true,
      description: '额外的提供者特定配置。',
    },
    {
      name: 'id',
      type: 'string',
      isOptional: true,
      description: '自定义代理标识符。',
    },
  ]}
/>

## 方法

### `generate()`

生成响应并根据需要触发工具调用，运行代理循环并返回最终结果。返回一个解析为 `GenerateTextResult` 的 Promise。

```ts
const result = await agent.generate({
  prompt: 'What is the weather like?',
});
```

<PropertiesTable
  content={[
    {
      name: 'prompt',
      type: 'string | Array<ModelMessage>',
      description: '文本提示或消息数组。',
    },
    {
      name: 'messages',
      type: 'Array<ModelMessage>',
      description: '作为模型消息列表的完整对话历史。',
    },
    {
      name: 'abortSignal',
      type: 'AbortSignal',
      isOptional: true,
      description: '可用于取消调用的可选中止信号。',
    },
    {
      name: 'timeout',
      type: 'number | { totalMs?: number }',
      isOptional: true,
      description: '超时时间（毫秒）。可以指定为数字或具有 totalMs 属性的对象。如果调用时间超过指定的超时时间，则将被中止。可以与 abortSignal 一起使用。',
    },
  ]}
/>

#### 返回

`generate()` 方法返回一个 `GenerateTextResult` 对象（详见 [`generateText`](/docs/reference/ai-sdk-core/generate-text#returns)）。

### `stream()`

从代理流式传输响应，包括代理推理和工具调用，实时发生。返回一个 `StreamTextResult`。

```ts
const stream = agent.stream({
  prompt: 'Tell me a story about a robot.',
});

for await (const chunk of stream.textStream) {
  console.log(chunk);
}
```

<PropertiesTable
  content={[
    {
      name: 'prompt',
      type: 'string | Array<ModelMessage>',
      description: '文本提示或消息数组。',
    },
    {
      name: 'messages',
      type: 'Array<ModelMessage>',
      description: '作为模型消息列表的完整对话历史。',
    },
    {
      name: 'abortSignal',
      type: 'AbortSignal',
      isOptional: true,
      description: '可用于取消调用的可选中止信号。',
    },
    {
      name: 'timeout',
      type: 'number | { totalMs?: number }',
      isOptional: true,
      description: '超时时间（毫秒）。可以指定为数字或具有 totalMs 属性的对象。如果调用时间超过指定的超时时间，则将被中止。可以与 abortSignal 一起使用。',
    },
    {
      name: 'experimental_transform',
      type: 'StreamTextTransform | Array<StreamTextTransform>',
      isOptional: true,
      description: '可选的流转换。它们按提供的顺序应用，并且必须保持流结构。详见 `streamText` 文档。',
    },
  ]}
/>

#### 返回

`stream()` 方法返回一个 `StreamTextResult` 对象（详见 [`streamText`](/docs/reference/ai-sdk-core/stream-text#returns)）。

## 类型

### `InferAgentUIMessage`

推断给定代理实例的UI消息类型。适用于类型安全的UI和消息交换。

#### 基本示例

```ts
import { ToolLoopAgent, InferAgentUIMessage } from 'ai';

const weatherAgent = new ToolLoopAgent({
  model: __MODEL__,
  tools: { weather: weatherTool },
});

type WeatherAgentUIMessage = InferAgentUIMessage<typeof weatherAgent>;
```

#### 带有消息元数据的示例

您可以提供第二个类型参数来自定义每个消息的元数据。这对于跟踪代理返回的丰富元数据（例如 createdAt、tokens、finish reason 等）非常有用。

```ts
import { ToolLoopAgent, InferAgentUIMessage } from 'ai';
import { z } from 'zod';

// 消息元数据的示例模式
const exampleMetadataSchema = z.object({
  createdAt: z.number().optional(),
  model: z.string().optional(),
  totalTokens: z.number().optional(),
  finishReason: z.string().optional(),
});
type ExampleMetadata = z.infer<typeof exampleMetadataSchema>;

// 照常定义代理
const metadataAgent = new ToolLoopAgent({
  model: __MODEL__,
  // ...其他选项
});

// 带有自定义元数据的类型安全UI消息类型
type MetadataAgentUIMessage = InferAgentUIMessage<
  typeof metadataAgent,
  ExampleMetadata
>;
```

## 示例

### 带有工具的基本代理

```ts
import { ToolLoopAgent, stepCountIs } from 'ai';
import { weatherTool, calculatorTool } from './tools';

const assistant = new ToolLoopAgent({
  model: __MODEL__,
  instructions: 'You are a helpful assistant.',
  tools: {
    weather: weatherTool,
    calculator: calculatorTool,
  },
  stopWhen: stepCountIs(3),
});

const result = await assistant.generate({
  prompt: 'What is the weather in NYC and what is 100 * 25?',
});

console.log(result.text);
console.log(result.steps); // 代理采取的所有步骤的数组
```

### 流式代理响应

```ts
const agent = new ToolLoopAgent({
  model: __MODEL__,
  instructions: 'You are a creative storyteller.',
});

const stream = agent.stream({
  prompt: 'Tell me a short story about a time traveler.',
});

for await (const chunk of stream.textStream) {
  process.stdout.write(chunk);
}
```

### 带有输出解析的代理

```ts
import { z } from 'zod';

const analysisAgent = new ToolLoopAgent({
  model: __MODEL__,
  output: {
    schema: z.object({
      sentiment: z.enum(['positive', 'negative', 'neutral']),
      score: z.number(),
      summary: z.string(),
    }),
  },
});

const result = await analysisAgent.generate({
  prompt: 'Analyze this review: "The product exceeded my expectations!"',
});

console.log(result.output);
// 类型为 { sentiment: 'positive' | 'negative' | 'neutral', score: number, summary: string }
```

### 示例：批准的工具执行

```ts
import { openai } from '@ai-sdk/openai';
import { ToolLoopAgent } from 'ai';

const agent = new ToolLoopAgent({
  model: __MODEL__,
  instructions: 'You are an agent with access to a weather API.',
  tools: {
    weather: openai.tools.weather({
      /* ... */
    }),
  },
  // 可选择需要批准等
});

const result = await agent.generate({
  prompt: 'Is it raining in Paris today?',
});
console.log(result.text);
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