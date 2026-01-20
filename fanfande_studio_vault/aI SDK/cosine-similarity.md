# `cosineSimilarity()`

当您想要比较嵌入向量的相似度时，通常会使用标准的向量相似度度量，如余弦相似度。

`cosineSimilarity` 计算两个向量之间的余弦相似度。较高的值（接近1）表示向量非常相似，而较低的值（接近-1）表示它们不同。

```ts
import { cosineSimilarity, embedMany } from 'ai';

const { embeddings } = await embedMany({
  model: 'openai/text-embedding-3-small',
  values: ['sunny day at the beach', 'rainy afternoon in the city'],
});

console.log(
  `cosine similarity: ${cosineSimilarity(embeddings[0], embeddings[1])}`,
);
```

## 导入

<Snippet text={`import { cosineSimilarity } from "ai"`} prompt={false} />

## API 签名

### 参数

<PropertiesTable
  content={[
    {
      name: 'vector1',
      type: 'number[]',
      description: '要比较的第一个向量',
    },
    {
      name: 'vector2',
      type: 'number[]',
      description: '要比较的第二个向量',
    },
  ]}
/>

### 返回值

一个介于 -1 和 1 之间的数字，表示两个向量之间的余弦相似度。

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
- [创建提供者注册表](/docs/reference/ai-sdk-core/provider-registry)
- [自定义提供者](/docs/reference/ai-sdk-core/custom-provider)
- [余弦相似度](/docs/reference/ai-sdk-core/cosine-similarity)
- [包装语言模型](/docs/reference/ai-sdk-core/wrap-language-model)
- [包装图像模型](/docs/reference/ai-sdk-core/wrap-image-model)
- [语言模型V3中间件](/docs/reference/ai-sdk-core/language-model-v2-middleware)
- [提取推理中间件](/docs/reference/ai-sdk-core/extract-reasoning-middleware)
- [模拟流式中间件](/docs/reference/ai-sdk-core/simulate-streaming-middleware)
- [默认设置中间件](/docs/reference/ai-sdk-core/default-settings-middleware)
- [添加工具输入示例中间件](/docs/reference/ai-sdk-core/add-tool-input-examples-middleware)
- [提取JSON中间件](/docs/reference/ai-sdk-core/extract-json-middleware)
- [步骤计数为](/docs/reference/ai-sdk-core/step-count-is)
- [具有工具调用](/docs/reference/ai-sdk-core/has-tool-call)
- [模拟可读流](/docs/reference/ai-sdk-core/simulate-readable-stream)
- [平滑流](/docs/reference/ai-sdk-core/smooth-stream)
- [生成ID](/docs/reference/ai-sdk-core/generate-id)
- [创建ID生成器](/docs/reference/ai-sdk-core/create-id-generator)

[完整站点地图](/sitemap.md)