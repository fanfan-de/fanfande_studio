# `Output`

`Output` 对象为使用 [`generateText`](/docs/reference/ai-sdk-core/generate-text) 和 [`streamText`](/docs/reference/ai-sdk-core/stream-text) 进行结构化数据生成提供了输出规范。它允许您指定生成数据的预期形状，并自动处理验证。

```ts
import { generateText, Output } from 'ai';
__PROVIDER_IMPORT__;
import { z } from 'zod';

const { output } = await generateText({
  model: __MODEL__,
  output: Output.object({
    schema: z.object({
      name: z.string(),
      age: z.number(),
    }),
  }),
  prompt: 'Generate a user profile.',
});
```

## 导入

<Snippet text={`import { Output } from "ai"`} prompt={false} />

## 输出类型

### `Output.text()`

用于纯文本生成的输出规范。当未指定 `output` 时的默认行为。

```ts
import { generateText, Output } from 'ai';

const { output } = await generateText({
  model: yourModel,
  output: Output.text(),
  prompt: 'Tell me a joke.',
});
// output is a string
```

#### 参数

无需参数。

#### 返回

一个 `Output<string, string>` 规范，生成纯文本且无需模式验证。

---

### `Output.object()`

使用模式进行类型化对象生成的输出规范。输出会根据提供的模式进行验证以确保类型安全。

```ts
import { generateText, Output } from 'ai';
import { z } from 'zod';

const { output } = await generateText({
  model: yourModel,
  output: Output.object({
    schema: z.object({
      name: z.string(),
      age: z.number().nullable(),
      labels: z.array(z.string()),
    }),
  }),
  prompt: 'Generate information for a test user.',
});
// output matches the schema type
```

#### 参数

<PropertiesTable
  content={[
    {
      name: 'schema',
      type: 'FlexibleSchema<OBJECT>',
      description:
        '定义要生成的对象结构的模式。支持 Zod 模式、标准 JSON 模式和自定义 JSON 模式。',
    },
    {
      name: 'name',
      type: 'string',
      isOptional: true,
      description:
        '应生成的输出的可选名称。某些提供商用于额外的 LLM 指导，例如通过工具或模式名称。',
    },
    {
      name: 'description',
      type: 'string',
      isOptional: true,
      description:
        '应生成的输出的可选描述。某些提供商用于额外的 LLM 指导，例如通过工具或模式描述。',
    },
  ]}
/>

#### 返回

一个 `Output<OBJECT, DeepPartial<OBJECT>>` 规范，其中：

- 完整输出会完全根据模式进行验证
- 部分输出（在流式传输期间）是模式类型的深层部分版本

<Note>
  通过 `streamText` 流式传输的部分输出无法根据您提供的模式进行验证，因为不完整的数据可能尚未符合预期的结构。
</Note>

---

### `Output.array()`

用于生成类型化元素数组的输出规范。每个元素都会根据提供的元素模式进行验证。

```ts
import { generateText, Output } from 'ai';
import { z } from 'zod';

const { output } = await generateText({
  model: yourModel,
  output: Output.array({
    element: z.object({
      location: z.string(),
      temperature: z.number(),
      condition: z.string(),
    }),
  }),
  prompt: 'List the weather for San Francisco and Paris.',
});
// output is an array of weather objects
```

#### 参数

<PropertiesTable
  content={[
    {
      name: 'element',
      type: 'FlexibleSchema<ELEMENT>',
      description:
        '定义每个数组元素结构的模式。支持 Zod 模式、Valibot 模式或 JSON 模式。',
    },
    {
      name: 'name',
      type: 'string',
      isOptional: true,
      description:
        '应生成的输出的可选名称。某些提供商用于额外的 LLM 指导，例如通过工具或模式名称。',
    },
    {
      name: 'description',
      type: 'string',
      isOptional: true,
      description:
        '应生成的输出的可选描述。某些提供商用于额外的 LLM 指导，例如通过工具或模式描述。',
    },
  ]}
/>

#### 返回

一个 `Output<Array<ELEMENT>, Array<ELEMENT>>` 规范，其中：

- 完整输出是一个所有元素都经过验证的数组
- 部分输出仅包含完全验证的元素（不完整的元素会被排除）

#### 使用 `elementStream` 进行流式传输

当将 `streamText` 与 `Output.array()` 一起使用时，您可以使用 `elementStream` 在元素生成时进行迭代：

```ts
import { streamText, Output } from 'ai';
import { z } from 'zod';

const { elementStream } = streamText({
  model: yourModel,
  output: Output.array({
    element: z.object({
      name: z.string(),
      class: z.string(),
      description: z.string(),
    }),
  }),
  prompt: 'Generate 3 hero descriptions for a fantasy role playing game.',
});

for await (const hero of elementStream) {
  console.log(hero); // 每个英雄都是完整且经过验证的
}
```

<Note>
  `elementStream` 发出的每个元素都是完整的，并根据您的元素模式进行了验证，确保每个项目在生成时都是类型安全的。
</Note>

---

### `Output.choice()`

用于从预定义的字符串选项中选择的输出规范。适用于分类任务或固定枚举答案。

```ts
import { generateText, Output } from 'ai';

const { output } = await generateText({
  model: yourModel,
  output: Output.choice({
    options: ['sunny', 'rainy', 'snowy'] as const,
  }),
  prompt: 'Is the weather sunny, rainy, or snowy today?',
});
// output is 'sunny' | 'rainy' | 'snowy'
```

#### 参数

<PropertiesTable
  content={[
    {
      name: 'options',
      type: 'Array<CHOICE>',
      description:
        '模型可以选择的一组字符串选项数组。输出将恰好是这些值之一。',
    },
    {
      name: 'name',
      type: 'string',
      isOptional: true,
      description:
        '应生成的输出的可选名称。某些提供商用于额外的 LLM 指导，例如通过工具或模式名称。',
    },
    {
      name: 'description',
      type: 'string',
      isOptional: true,
      description:
        '应生成的输出的可选描述。某些提供商用于额外的 LLM 指导，例如通过工具或模式描述。',
    },
  ]}
/>

#### 返回

一个 `Output<CHOICE, CHOICE>` 规范，其中：

- 完整输出经过验证，恰好是提供的选项之一

---

### `Output.json()`

用于非结构化 JSON 生成的输出规范。当您希望生成任意 JSON 而不强制使用特定模式时使用此选项。

```ts
import { generateText, Output } from 'ai';

const { output } = await generateText({
  model: yourModel,
  output: Output.json(),
  prompt:
    'For each city, return the current temperature and weather condition as a JSON object.',
});
// output is any valid JSON value
```

#### 参数

<PropertiesTable
  content={[
    {
      name: 'name',
      type: 'string',
      isOptional: true,
      description:
        '应生成的输出的可选名称。某些提供商用于额外的 LLM 指导，例如通过工具或模式名称。',
    },
    {
      name: 'description',
      type: 'string',
      isOptional: true,
      description:
        '应生成的输出的可选描述。某些提供商用于额外的 LLM 指导，例如通过工具或模式描述。',
    },
  ]}
/>

#### 返回

一个 `Output<JSONValue, JSONValue>` 规范，该规范：

- 验证输出是否为有效的 JSON
- 不强制执行任何特定结构

<Note>
  使用 `Output.json()` 时，AI SDK 仅检查响应是否为有效的 JSON；它不验证值的结构或类型。如果您需要模式验证，请改用 `Output.object()` 或 `Output.array()`。
</Note>

## 错误处理

当带有结构化输出的 `generateText` 无法生成有效对象时，它会抛出 [`NoObjectGeneratedError`](/docs/reference/ai-sdk-errors/ai-no-object-generated-error)。

```ts
import { generateText, Output, NoObjectGeneratedError } from 'ai';

try {
  await generateText({
    model: yourModel,
    output: Output.object({ schema }),
    prompt: 'Generate a user profile.',
  });
} catch (error) {
  if (NoObjectGeneratedError.isInstance(error)) {
    console.log('NoObjectGeneratedError');
    console.log('Cause:', error.cause);
    console.log('Text:', error.text);
    console.log('Response:', error.response);
    console.log('Usage:', error.usage);
  }
}
```

## 另请参阅

- [生成结构化数据](/docs/ai-sdk-core/generating-structured-data)
- [`generateText()`](/docs/reference/ai-sdk-core/generate-text)
- [`streamText()`](/docs/reference/ai-sdk-core/stream-text)
- [`zod-schema`](/docs/reference/ai-sdk-core/zod-schema)
- [`json-schema`](/docs/reference/ai-sdk-core/json-schema)

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