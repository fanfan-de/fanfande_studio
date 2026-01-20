# `createMCPClient()`

创建一个轻量级的模型上下文协议 (MCP) 客户端，用于连接 MCP 服务器。该客户端提供：

- **工具**：自动在 MCP 工具与 AI SDK 工具之间进行转换
- **资源**：列出、读取和发现 MCP 服务器资源模板的方法
- **提示**：列出可用提示并检索提示消息的方法
- **引导**：支持处理工具执行期间服务器请求的额外输入

目前不支持接收来自 MCP 服务器的通知，以及自定义客户端配置。

## 导入

<Snippet
  text={`import { createMCPClient } from "@ai-sdk/mcp"`}
  prompt={false}
/>

## API 签名

### 参数

<PropertiesTable
  content={[
    {
      name: 'config',
      type: 'MCPClientConfig',
      description: 'MCP 客户端的配置。',
      properties: [
        {
          type: 'MCPClientConfig',
          parameters: [
            {
              name: 'transport',
              type: 'TransportConfig = MCPTransport | McpSSEServerConfig',
              description: '消息传输层的配置。',
              properties: [
                {
                  type: 'MCPTransport',
                  description:
                    '客户端传输实例，明确用于 stdio 或自定义传输',
                  parameters: [
                    {
                      name: 'start',
                      type: '() => Promise<void>',
                      description: '启动传输的方法',
                    },
                    {
                      name: 'send',
                      type: '(message: JSONRPCMessage) => Promise<void>',
                      description:
                        '通过传输发送消息的方法',
                    },
                    {
                      name: 'close',
                      type: '() => Promise<void>',
                      description: '关闭传输的方法',
                    },
                    {
                      name: 'onclose',
                      type: '() => void',
                      description:
                        '传输关闭时调用的方法',
                    },
                    {
                      name: 'onerror',
                      type: '(error: Error) => void',
                      description:
                        '传输遇到错误时调用的方法',
                    },
                    {
                      name: 'onmessage',
                      type: '(message: JSONRPCMessage) => void',
                      description:
                        '传输接收到消息时调用的方法',
                    },
                  ],
                },
                {
                  type: 'MCPTransportConfig',
                  parameters: [
                    {
                      name: 'type',
                      type: "'sse' | 'http",
                      description: '使用服务器发送事件 (Server-Sent Events) 进行通信',
                    },
                    {
                      name: 'url',
                      type: 'string',
                      description: 'MCP 服务器的 URL',
                    },
                    {
                      name: 'headers',
                      type: 'Record<string, string>',
                      isOptional: true,
                      description:
                        '随请求发送的额外 HTTP 头部。',
                    },
                    {
                      name: 'authProvider',
                      type: 'OAuthClientProvider',
                      isOptional: true,
                      description:
                        '可选的 OAuth 提供者，用于授权访问受保护的远程 MCP 服务器。',
                    },
                  ],
                },
              ],
            },
            {
              name: 'name',
              type: 'string',
              isOptional: true,
              description: '客户端名称。默认为 "ai-sdk-mcp-client"',
            },
            {
              name: 'onUncaughtError',
              type: '(error: unknown) => void',
              isOptional: true,
              description: '未捕获错误的处理器',
            },
            {
              name: 'capabilities',
              type: 'ClientCapabilities',
              isOptional: true,
              description:
                '可选客户端能力，在初始化期间广播。例如，设置 { elicitation: {} } 以启用处理来自服务器的引导请求。',
            },
          ],
        },
      ],
    },
  ]}
/>

### 返回值

返回一个 Promise，解析为 `MCPClient`，包含以下方法：

<PropertiesTable
  content={[
    {
      name: 'tools',
      type: `async (options?: {
        schemas?: TOOL_SCHEMAS
      }) => Promise<McpToolSet<TOOL_SCHEMAS>>`,
      description: '获取 MCP 服务器可用的工具。',
      properties: [
        {
          type: 'options',
          parameters: [
            {
              name: 'schemas',
              type: 'TOOL_SCHEMAS',
              isOptional: true,
              description:
                '用于编译时类型检查的模式定义。未提供时，模式从服务器推断。每个工具模式可以包含用于类型化输入的 inputSchema，以及可选的 outputSchema（当服务器返回 structuredContent 时用于类型化输出）。',
            },
          ],
        },
        {
          type: 'TOOL_SCHEMAS',
          parameters: [
            {
              name: 'inputSchema',
              type: 'FlexibleSchema',
              description:
                '定义工具期望输入参数的 Zod 模式或 JSON 模式。',
            },
            {
              name: 'outputSchema',
              type: 'FlexibleSchema',
              isOptional: true,
              description:
                '定义期望输出结构的 Zod 模式或 JSON 模式。提供时，客户端从工具结果中提取并验证 structuredContent，提供类型化输出。',
            },
          ],
        },
      ],
    },
    {
      name: 'listResources',
      type: `async (options?: {
        params?: PaginatedRequest['params'];
        options?: RequestOptions;
      }) => Promise<ListResourcesResult>`,
      description: '列出 MCP 服务器所有可用的资源。',
      properties: [
        {
          type: 'options',
          parameters: [
            {
              name: 'params',
              type: "PaginatedRequest['params']",
              isOptional: true,
              description: '可选的分页参数，包括游标。',
            },
            {
              name: 'options',
              type: 'RequestOptions',
              isOptional: true,
              description:
                '可选的请求选项，包括信号和超时。',
            },
          ],
        },
      ],
    },
    {
      name: 'readResource',
      type: `async (args: {
        uri: string;
        options?: RequestOptions;
      }) => Promise<ReadResourceResult>`,
      description: '通过 URI 读取特定资源的内容。',
      properties: [
        {
          type: 'args',
          parameters: [
            {
              name: 'uri',
              type: 'string',
              description: '要读取的资源的 URI。',
            },
            {
              name: 'options',
              type: 'RequestOptions',
              isOptional: true,
              description:
                '可选的请求选项，包括信号和超时。',
            },
          ],
        },
      ],
    },
    {
      name: 'listResourceTemplates',
      type: `async (options?: {
        options?: RequestOptions;
      }) => Promise<ListResourceTemplatesResult>`,
      description:
        '列出 MCP 服务器所有可用的资源模板。',
      properties: [
        {
          type: 'options',
          parameters: [
            {
              name: 'options',
              type: 'RequestOptions',
              isOptional: true,
              description:
                '可选的请求选项，包括信号和超时。',
            },
          ],
        },
      ],
    },
    {
      name: 'experimental_listPrompts',
      type: `async (options?: {
        params?: PaginatedRequest['params'];
        options?: RequestOptions;
      }) => Promise<ListPromptsResult>`,
      description:
        '列出 MCP 服务器可用的提示。此方法是实验性的，未来可能更改。',
      properties: [
        {
          type: 'options',
          parameters: [
            {
              name: 'params',
              type: "PaginatedRequest['params']",
              isOptional: true,
              description: '可选的分页参数，包括游标。',
            },
            {
              name: 'options',
              type: 'RequestOptions',
              isOptional: true,
              description:
                '可选的请求选项，包括信号和超时。',
            },
          ],
        },
      ],
    },
    {
      name: 'experimental_getPrompt',
      type: `async (args: {
        name: string;
        arguments?: Record<string, unknown>;
        options?: RequestOptions;
      }) => Promise<GetPromptResult>`,
      description:
        '按名称检索提示，可选地传递参数。此方法是实验性的，未来可能更改。',
      properties: [
        {
          type: 'args',
          parameters: [
            {
              name: 'name',
              type: 'string',
              description: '要检索的提示名称。',
            },
            {
              name: 'arguments',
              type: 'Record<string, unknown>',
              isOptional: true,
              description: '可选参数，用于填充提示。',
            },
            {
              name: 'options',
              type: 'RequestOptions',
              isOptional: true,
              description:
                '可选的请求选项，包括信号和超时。',
            },
          ],
        },
      ],
    },
    {
      name: 'onElicitationRequest',
      type: `(
        schema: typeof ElicitationRequestSchema,
        handler: (request: ElicitationRequest) => Promise<ElicitResult> | ElicitResult
      ) => void`,
      description:
        '注册 MCP 服务器引导请求的处理器。当服务器在工具执行期间需要额外输入时，处理器会接收请求。',
      properties: [
        {
          type: 'parameters',
          parameters: [
            {
              name: 'schema',
              type: 'typeof ElicitationRequestSchema',
              description:
                '用于验证请求的模式。必须为 ElicitationRequestSchema。',
            },
            {
              name: 'handler',
              type: '(request: ElicitationRequest) => Promise<ElicitResult> | ElicitResult',
              description:
                '处理引导请求的函数。请求包含 message 和 requestedSchema。处理器必须返回一个包含 action（"accept"、"decline" 或 "cancel"）的对象，接受时可选地包含 content。',
            },
          ],
        },
      ],
    },
    {
      name: 'close',
      type: 'async () => void',
      description:
        '关闭与 MCP 服务器的连接并清理资源。',
    },
  ]}
/>

## 示例

```typescript
import { createMCPClient } from '@ai-sdk/mcp';
import { generateText } from 'ai';
import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';

let client;

try {
  client = await createMCPClient({
    transport: new Experimental_StdioMCPTransport({
      command: 'node server.js',
    }),
  });

  const tools = await client.tools();

  const response = await generateText({
    model: __MODEL__,
    tools,
    messages: [{ role: 'user', content: '查询数据' }],
  });

  console.log(response);
} catch (error) {
  console.error('错误：', error);
} finally {
  // 确保即使发生错误也关闭客户端
  if (client) {
    await client.close();
  }
}
```

## 错误处理

客户端在以下情况下抛出 `MCPClientError`：

- 客户端初始化失败
- 协议版本不匹配
- 缺少服务器能力
- 连接失败

对于工具执行，错误会作为 `CallToolError` 错误传播。

对于未知错误，客户端暴露一个 `onUncaughtError` 回调，可用于手动记录或处理未被已知错误类型覆盖的错误。

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
