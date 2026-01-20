# `zodSchema()`

`zodSchema` 是一个辅助函数，用于将 Zod 模式转换为与 AI SDK 兼容的 JSON 模式对象。它接收一个 Zod 模式和可选的配置作为输入，并返回一个带类型的模式。

您可以在[生成结构化数据](/docs/ai-sdk-core/generating-structured-data)和[工具](/docs/ai-sdk-core/tools-and-tool-calling)中使用它。

<Note>
  您也可以直接将 Zod 对象传递给 AI SDK 函数。在内部，AI SDK 会使用 `zodSchema()` 将 Zod 模式转换为 JSON 模式。
  但是，如果您想指定诸如 `useReferences` 之类的选项，可以传递 `zodSchema()` 辅助函数。
</Note>

<Note type="warning">
  当使用 `.meta()` 或 `.describe()` 向 Zod 模式添加元数据时，请确保这些方法在模式链的**末尾**调用。

  元数据附加到特定的模式实例上，而大多数模式方法（`.min()`、`.optional()`、`.extend()` 等）会返回一个新的模式实例，该实例不会继承前一个实例的元数据。
  由于 Zod 的不可变性，只有当 `.meta()` 或 `.describe()` 是链中的最后一个方法时，元数据才会包含在 JSON 模式输出中。

```ts
// ❌ 元数据将丢失 - .min() 返回一个不含元数据的新实例
z.string().meta({ describe: 'first name' }).min(1);

// ✅ 元数据被保留 - .meta() 是最后一个方法
z.string().min(1).meta({ describe: 'first name' });
```

</Note>

## 递归模式示例

```ts
import { zodSchema } from 'ai';
import { z } from 'zod';

// 定义基础分类模式
const baseCategorySchema = z.object({
  name: z.string(),
});

// 定义递归的 Category 类型
type Category = z.infer<typeof baseCategorySchema> & {
  subcategories: Category[];
};

// 使用 z.lazy 创建递归模式
const categorySchema: z.ZodType<Category> = baseCategorySchema.extend({
  subcategories: z.lazy(() => categorySchema.array()),
});

// 创建最终模式，启用 useReferences 以支持递归
const mySchema = zodSchema(
  z.object({
    category: categorySchema,
  }),
  { useReferences: true },
);
```

## 导入

<Snippet text={`import { zodSchema } from "ai"`} prompt={false} />

## API 签名

### 参数

<PropertiesTable
  content={[
    {
      name: 'zodSchema',
      type: 'z.Schema',
      description: 'Zod 模式定义。',
    },
    {
      name: 'options',
      type: 'object',
      description: '模式转换的附加选项。',
      properties: [
        {
          type: 'object',
          parameters: [
            {
              name: 'useReferences',
              isOptional: true,
              type: 'boolean',
              description:
                '启用模式中的引用支持。这对于递归模式（例如使用 `z.lazy`）是必需的。然而，并非所有语言模型和提供者都支持此类引用。默认为 `false`。',
            },
          ],
        },
      ],
    },
  ]}
/>

### 返回值

一个与 AI SDK 兼容的模式对象，包含 JSON 模式表示和验证功能。

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