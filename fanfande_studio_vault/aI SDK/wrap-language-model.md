# `wrapLanguageModel()`

`wrapLanguageModel` 函数通过用中间件包装语言模型，提供了一种增强语言模型行为的方式。
有关中间件的更多信息，请参阅 [语言模型中间件](/docs/ai-sdk-core/middleware)。

```ts
import { wrapLanguageModel, gateway } from 'ai';

const wrappedLanguageModel = wrapLanguageModel({
  model: gateway('openai/gpt-4.1'),
  middleware: yourLanguageModelMiddleware,
});
```

## 导入

<Snippet text={`import { wrapLanguageModel } from "ai"`} prompt={false} />

## API 签名

### 参数

<PropertiesTable
  content={[
    {
      name: 'model',
      type: 'LanguageModelV3',
      description: '要包装的原始 LanguageModelV3 实例。',
    },
    {
      name: 'middleware',
      type: 'LanguageModelV3Middleware | LanguageModelV3Middleware[]',
      description:
        '要应用于语言模型的中间件。当提供多个中间件时，第一个中间件将首先转换输入，最后一个中间件将直接包装在模型周围。',
    },
    {
      name: 'modelId',
      type: 'string',
      description:
        '可选的自定义模型 ID，用于覆盖原始模型的 ID。',
    },
    {
      name: 'providerId',
      type: 'string',
      description:
        '可选的自定义提供者 ID，用于覆盖原始模型的提供者。',
    },
  ]}
/>

### 返回值

一个应用了中间件的新 `LanguageModelV3` 实例。


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