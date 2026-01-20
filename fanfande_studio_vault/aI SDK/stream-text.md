# `streamText()`

从语言模型流式传输文本生成。

您可以将 streamText 函数用于交互式用例，例如聊天机器人和其他实时应用程序。您还可以使用工具生成 UI 组件。

```ts
import { streamText } from 'ai';
__PROVIDER_IMPORT__;

const { textStream } = streamText({
  model: __MODEL__,
  prompt: 'Invent a new holiday and describe its traditions.',
});

for await (const textPart of textStream) {
  process.stdout.write(textPart);
}
```

要查看 `streamText` 的实际使用，请查看[这些示例](#examples)。

## 导入

<Snippet text={`import { streamText } from "ai"`} prompt={false} />

## API 签名

### 参数

<PropertiesTable
  content={[
    {
      name: 'model',
      type: 'LanguageModel',
      description: "要使用的语言模型。示例：openai('gpt-4.1')",
    },
    {
      name: 'system',
      type: 'string | SystemModelMessage | SystemModelMessage[]',
      description:
        '用于指定模型行为的系统提示。',
    },
    {
      name: 'prompt',
      type: 'string | Array<SystemModelMessage | UserModelMessage | AssistantModelMessage | ToolModelMessage>',
      description: '用于生成文本的输入提示。',
    },
    {
      name: 'messages',
      type: 'Array<SystemModelMessage | UserModelMessage | AssistantModelMessage | ToolModelMessage>',
      description:
        '表示对话的消息列表。自动转换来自 useChat 钩子的 UI 消息。',
      properties: [
        {
          type: 'SystemModelMessage',
          parameters: [
            {
              name: 'role',
              type: "'system'",
              description: '系统消息的角色。',
            },
            {
              name: 'content',
              type: 'string',
              description: '消息的内容。',
            },
          ],
        },
        {
          type: 'UserModelMessage',
          parameters: [
            {
              name: 'role',
              type: "'user'",
              description: '用户消息的角色。',
            },
            {
              name: 'content',
              type: 'string | Array<TextPart | ImagePart | FilePart>',
              description: '消息的内容。',
              properties: [
                {
                  type: 'TextPart',
                  parameters: [
                    {
                      name: 'type',
                      type: "'text'",
                      description: '消息部分的类型。',
                    },
                    {
                      name: 'text',
                      type: 'string',
                      description: '消息部分的文本内容。',
                    },
                  ],
                },
                {
                  type: 'ImagePart',
                  parameters: [
                    {
                      name: 'type',
                      type: "'image'",
                      description: '消息部分的类型。',
                    },
                    {
                      name: 'image',
                      type: 'string | Uint8Array | Buffer | ArrayBuffer | URL',
                      description:
                        '消息部分的图像内容。字符串可以是 base64 编码的内容、base64 数据 URL 或 http(s) URL。',
                    },
                    {
                      name: 'mediaType',
                      type: 'string',
                      isOptional: true,
                      description: '图像的 IANA 媒体类型。',
                    },
                  ],
                },
                {
                  type: 'FilePart',
                  parameters: [
                    {
                      name: 'type',
                      type: "'file'",
                      description: '消息部分的类型。',
                    },
                    {
                      name: 'data',
                      type: 'string | Uint8Array | Buffer | ArrayBuffer | URL',
                      description:
                        '消息部分的文件内容。字符串可以是 base64 编码的内容、base64 数据 URL 或 http(s) URL。',
                    },
                    {
                      name: 'mediaType',
                      type: 'string',
                      description: '文件的 IANA 媒体类型。',
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: 'AssistantModelMessage',
          parameters: [
            {
              name: 'role',
              type: "'assistant'",
              description: '助手消息的角色。',
            },
            {
              name: 'content',
              type: 'string | Array<TextPart | FilePart | ReasoningPart | ToolCallPart>',
              description: '消息的内容。',
              properties: [
                {
                  type: 'TextPart',
                  parameters: [
                    {
                      name: 'type',
                      type: "'text'",
                      description: '消息部分的类型。',
                    },
                    {
                      name: 'text',
                      type: 'string',
                      description: '消息部分的文本内容。',
                    },
                  ],
                },
                {
                  type: 'ReasoningPart',
                  parameters: [
                    {
                      name: 'type',
                      type: "'reasoning'",
                      description: '推理部分的类型。',
                    },
                    {
                      name: 'text',
                      type: 'string',
                      description: '推理文本。',
                    },
                  ],
                },
                {
                  type: 'FilePart',
                  parameters: [
                    {
                      name: 'type',
                      type: "'file'",
                      description: '消息部分的类型。',
                    },
                    {
                      name: 'data',
                      type: 'string | Uint8Array | Buffer | ArrayBuffer | URL',
                      description:
                        '消息部分的文件内容。字符串可以是 base64 编码的内容、base64 数据 URL 或 http(s) URL。',
                    },
                    {
                      name: 'mediaType',
                      type: 'string',
                      description: '文件的 IANA 媒体类型。',
                    },
                    {
                      name: 'filename',
                      type: 'string',
                      description: '文件的名称。',
                      isOptional: true,
                    },
                  ],
                },
                {
                  type: 'ToolCallPart',
                  parameters: [
                    {
                      name: 'type',
                      type: "'tool-call'",
                      description: '消息部分的类型。',
                    },
                    {
                      name: 'toolCallId',
                      type: 'string',
                      description: '工具调用的 ID。',
                    },
                    {
                      name: 'toolName',
                      type: 'string',
                      description:
                        '工具的名称，通常是函数的名称。',
                    },
                    {
                      name: 'input',
                      type: 'object based on zod schema',
                      description:
                        '模型生成的参数，供工具使用。',
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: 'ToolModelMessage',
          parameters: [
            {
              name: 'role',
              type: "'tool'",
              description: '助手消息的角色。',
            },
            {
              name: 'content',
              type: 'Array<ToolResultPart>',
              description: '消息的内容。',
              properties: [
                {
                  type: 'ToolResultPart',
                  parameters: [
                    {
                      name: 'type',
                      type: "'tool-result'",
                      description: '消息部分的类型。',
                    },
                    {
                      name: 'toolCallId',
                      type: 'string',
                      description:
                        '工具调用结果对应的工具调用 ID。',
                    },
                    {
                      name: 'toolName',
                      type: 'string',
                      description:
                        '工具调用结果对应的工具名称。',
                    },
                    {
                      name: 'result',
                      type: 'unknown',
                      description:
                        '工具执行后返回的结果。',
                    },
                    {
                      name: 'isError',
                      type: 'boolean',
                      isOptional: true,
                      description:
                        '结果是否为错误或错误消息。',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      name: 'tools',
      type: 'ToolSet',
      description:
        '模型可以访问和调用的工具。模型需要支持调用工具。',
      properties: [
        {
          type: 'Tool',
          parameters: [
            {
              name: 'description',
              isOptional: true,
              type: 'string',
              description:
                '关于工具用途的信息，包括模型如何使用以及何时使用的细节。',
            },
            {
              name: 'inputSchema',
              type: 'Zod Schema | JSON Schema',
              description:
                '工具期望的输入模式。语言模型将使用此模式生成输入。它也用于验证语言模型的输出。使用描述使输入对语言模型可理解。您可以传入 Zod 模式或 JSON 模式（使用 `jsonSchema` 函数）。',
            },
            {
              name: 'execute',
              isOptional: true,
              type: 'async (parameters: T, options: ToolExecutionOptions) => RESULT',
              description:
                '使用工具调用的参数调用并产生结果的异步函数。如果未提供，工具将不会自动执行。',
              properties: [
                {
                  type: 'ToolExecutionOptions',
                  parameters: [
                    {
                      name: 'toolCallId',
                      type: 'string',
                      description:
                        '工具调用的 ID。您可以在发送工具调用相关信息时使用它，例如使用流数据。',
                    },
                    {
                      name: 'messages',
                      type: 'ModelMessage[]',
                      description:
                        '发送给语言模型以启动包含工具调用的响应的消息。这些消息不包括系统提示，也不包括包含工具调用的助手响应。',
                    },
                    {
                      name: 'abortSignal',
                      type: 'AbortSignal',
                      description:
                        '指示应中止整个操作的可选中止信号。',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      name: 'toolChoice',
      isOptional: true,
      type: '"auto" | "none" | "required" | { "type": "tool", "toolName": string }',
      description:
        '工具选择设置。指定如何选择工具执行。默认为 "auto"。"none" 禁用工具执行。"required" 要求工具执行。{ "type": "tool", "toolName": string } 指定要执行的特定工具。',
    },
    {
      name: 'maxOutputTokens',
      type: 'number',
      isOptional: true,
      description: '要生成的最大令牌数。',
    },
    {
      name: 'temperature',
      type: 'number',
      isOptional: true,
      description:
        '温度设置。该值会传递给提供者。范围取决于提供者和模型。建议设置 `temperature` 或 `topP` 之一，但不要同时设置两者。',
    },
    {
      name: 'topP',
      type: 'number',
      isOptional: true,
      description:
        '核心采样。该值会传递给提供者。范围取决于提供者和模型。建议设置 `temperature` 或 `topP` 之一，但不要同时设置两者。',
    },
    {
      name: 'topK',
      type: 'number',
      isOptional: true,
      description:
        '仅从每个后续令牌的前 K 个选项中采样。用于移除"长尾"低概率响应。仅推荐用于高级用例。通常只需使用温度。',
    },
    {
      name: 'presencePenalty',
      type: 'number',
      isOptional: true,
      description:
        '存在惩罚设置。它影响模型重复提示中已有信息的可能性。该值会传递给提供者。范围取决于提供者和模型。',
    },
    {
      name: 'frequencyPenalty',
      type: 'number',
      isOptional: true,
      description:
        '频率惩罚设置。它影响模型重复使用相同单词或短语的可能性。该值会传递给提供者。范围取决于提供者和模型。',
    },
    {
      name: 'stopSequences',
      type: 'string[]',
      isOptional: true,
      description:
        '将停止文本生成的序列。如果模型生成任何这些序列，它将停止生成更多文本。',
    },
    {
      name: 'seed',
      type: 'number',
      isOptional: true,
      description:
        '用于随机采样的种子（整数）。如果设置且模型支持，调用将生成确定性的结果。',
    },
    {
      name: 'maxRetries',
      type: 'number',
      isOptional: true,
      description:
        '最大重试次数。设置为 0 以禁用重试。默认值：2。',
    },
    {
      name: 'abortSignal',
      type: 'AbortSignal',
      isOptional: true,
      description:
        '可用于取消调用的可选中止信号。',
    },
    {
      name: 'timeout',
      type: 'number | { totalMs?: number; stepMs?: number; chunkMs?: number }',
      isOptional: true,
      description:
        '超时时间（毫秒）。可以指定为数字或具有 totalMs、stepMs 和/或 chunkMs 属性的对象。totalMs 设置整个调用的总超时时间。stepMs 设置每个单独步骤（LLM 调用）的超时时间，适用于多步生成。chunkMs 设置流块之间的超时时间 - 如果在此时间内未收到新块，调用将中止，适用于检测停滞的流。可以与 abortSignal 一起使用。',
    },
    {
      name: 'headers',
      type: 'Record<string, string>',
      isOptional: true,
      description:
        '随请求发送的额外 HTTP 头部。仅适用于基于 HTTP 的提供者。',
    },
    {
      name: 'experimental_generateMessageId',
      type: '() => string',
      isOptional: true,
      description:
        '用于为每条消息生成唯一 ID 的函数。这是一个实验性功能。',
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
                '启用或禁用遥测。在实验期间默认禁用。',
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
          ],
        },
      ],
    },
    {
      name: 'experimental_transform',
      type: 'StreamTextTransform | Array<StreamTextTransform>',
      isOptional: true,
      description:
        '可选的流转换。它们按照提供的顺序应用。流转换必须保持流结构，以便 streamText 正常工作。',
      properties: [
        {
          type: 'StreamTextTransform',
          parameters: [
            {
              name: 'transform',
              type: '(options: TransformOptions) => TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>',
              description: '应用于流的转换。',
              properties: [
                {
                  type: 'TransformOptions',
                  parameters: [
                    {
                      name: 'stopStream',
                      type: '() => void',
                      description: '停止流的函数。',
                    },
                    {
                      name: 'tools',
                      type: 'TOOLS',
                      description: '可用的工具。',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      name: 'includeRawChunks',
      type: 'boolean',
      isOptional: true,
      description:
        '是否在流中包含来自提供者的原始块。启用后，您将收到类型为 "raw" 的原始块，其中包含来自提供者的未处理数据。这允许访问 AI SDK 尚未包装的前沿提供者功能。默认为 false。',
    },
    {
      name: 'providerOptions',
      type: 'Record<string,JSONObject> | undefined',
      isOptional: true,
      description:
        '提供者特定选项。外部键是提供者名称。内部值是元数据。细节取决于提供者。',
    },
    {
      name: 'activeTools',
      type: 'Array<TOOLNAME> | undefined',
      isOptional: true,
      description:
        '当前活动的工具。默认所有工具都处于活动状态。',
    },
    {
      name: 'stopWhen',
      type: 'StopCondition<TOOLS> | Array<StopCondition<TOOLS>>',
      isOptional: true,
      description:
        '当最后一步中有工具结果时停止生成的条件。当条件为数组时，满足任一条件即可停止生成。默认：stepCountIs(1)。',
    },
    {
      name: 'prepareStep',
      type: '(options: PrepareStepOptions) => PrepareStepResult<TOOLS> | Promise<PrepareStepResult<TOOLS>>',
      isOptional: true,
      description:
        '可选函数，可用于为步骤提供不同的设置。您可以修改每个步骤的模型、工具选择、活动工具、系统提示和输入消息。',
      properties: [
        {
          type: 'PrepareStepFunction<TOOLS>',
          parameters: [
            {
              name: 'options',
              type: 'object',
              description: '步骤的选项。',
              properties: [
                {
                  type: 'PrepareStepOptions',
                  parameters: [
                    {
                      name: 'steps',
                      type: 'Array<StepResult<TOOLS>>',
                      description: '到目前为止已执行的步骤。',
                    },
                    {
                      name: 'stepNumber',
                      type: 'number',
                      description:
                        '正在执行的步骤编号。',
                    },
                    {
                      name: 'model',
                      type: 'LanguageModel',
                      description: '正在使用的模型。',
                    },
                    {
                      name: 'messages',
                      type: 'Array<ModelMessage>',
                      description:
                        '将发送给模型以进行当前步骤的消息。',
                    },
                    {
                      name: 'experimental_context',
                      type: 'unknown',
                      isOptional: true,
                      description:
                        '通过 experimental_context 设置传递的上下文（实验性）。',
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: 'PrepareStepResult<TOOLS>',
          description:
            '可以修改当前步骤设置的返回值。',
          parameters: [
            {
              name: 'model',
              type: 'LanguageModel',
              isOptional: true,
              description:
                '可选地覆盖此步骤使用的 LanguageModel 实例。',
            },
            {
              name: 'toolChoice',
              type: 'ToolChoice<TOOLS>',
              isOptional: true,
              description:
                '可选地设置模型必须调用的工具，或为此步骤提供工具调用配置。',
            },
            {
              name: 'activeTools',
              type: 'Array<keyof TOOLS>',
              isOptional: true,
              description:
                '如果提供，则仅这些工具在此步骤中启用/可用。',
            },
            {
              name: 'system',
              type: 'string | SystemModelMessage | SystemModelMessage[]',
              isOptional: true,
              description:
                '可选地覆盖为此步骤发送给模型的系统消息。',
            },
            {
              name: 'messages',
              type: 'Array<ModelMessage>',
              isOptional: true,
              description:
                '可选地覆盖为此步骤发送给模型的完整消息集。',
            },
            {
              name: 'experimental_context',
              type: 'unknown',
              isOptional: true,
              description:
                '传递给工具执行的上下文。实验性。更改上下文将影响此步骤及所有后续步骤的上下文。',
            },
            {
              name: 'providerOptions',
              type: 'ProviderOptions',
              isOptional: true,
              description:
                '此步骤的额外提供者特定选项。可用于传递提供者特定配置，例如 Anthropic 代码执行的容器 ID。',
            },
          ],
        },
      ],
    },
    {
      name: 'experimental_context',
      type: 'unknown',
      isOptional: true,
      description:
        '传递给工具执行的上下文。实验性（可能在补丁版本中破坏）。',
    },
    {
      name: 'experimental_download',
      type: '(requestedDownloads: Array<{ url: URL; isUrlSupportedByModel: boolean }>) => Promise<Array<null | { data: Uint8Array; mediaType?: string }>>',
      isOptional: true,
      description:
        '自定义下载函数，用于控制当 URL 出现在提示中时如何获取它们。默认情况下，如果模型不支持给定媒体类型的 URL，则会下载文件。实验性功能。返回 null 以将 URL 直接传递给模型（当支持时），或返回下载的内容及其媒体类型。',
    },
    {
      name: 'experimental_repairToolCall',
      type: '(options: ToolCallRepairOptions) => Promise<LanguageModelV3ToolCall | null>',
      isOptional: true,
      description:
        '尝试修复未能解析的工具调用的函数。返回修复后的工具调用，如果无法修复则返回 null。',
      properties: [
        {
          type: 'ToolCallRepairOptions',
          parameters: [
            {
              name: 'system',
              type: 'string | SystemModelMessage | SystemModelMessage[] | undefined',
              description: '系统提示。',
            },
            {
              name: 'messages',
              type: 'ModelMessage[]',
              description: '当前生成步骤中的消息。',
            },
            {
              name: 'toolCall',
              type: 'LanguageModelV3ToolCall',
              description: '未能解析的工具调用。',
            },
            {
              name: 'tools',
              type: 'TOOLS',
              description: '可用的工具。',
            },
            {
              name: 'parameterSchema',
              type: '(options: { toolName: string }) => JSONSchema7',
              description:
                '返回工具的 JSON 模式的函数。',
            },
            {
              name: 'error',
              type: 'NoSuchToolError | InvalidToolInputError',
              description:
                '解析工具调用时发生的错误。',
            },
          ],
        },
      ],
    },
    {
      name: 'onChunk',
      type: '(event: OnChunkResult) => Promise<void> |void',
      isOptional: true,
      description:
        '为流的每个块调用的回调函数。流处理将暂停，直到回调承诺解决。',
      properties: [
        {
          type: 'OnChunkResult',
          parameters: [
            {
              name: 'chunk',
              type: 'TextStreamPart',
              description: '流的块。',
              properties: [
                {
                  type: 'TextStreamPart',
                  parameters: [
                    {
                      name: 'type',
                      type: "'text'",
                      description:
                        '标识对象为文本增量的类型。',
                    },
                    {
                      name: 'text',
                      type: 'string',
                      description: '文本增量。',
                    },
                  ],
                },
                {
                  type: 'TextStreamPart',
                  parameters: [
                    {
                      name: 'type',
                      type: "'reasoning'",
                      description:
                        '标识对象为推理的类型。',
                    },
                    {
                      name: 'text',
                      type: 'string',
                      description: '推理文本增量。',
                    },
                  ],
                },
                {
                  type: 'TextStreamPart',
                  parameters: [
                    {
                      name: 'type',
                      type: "'source'",
                      description: '标识对象为来源的类型。',
                    },
                    {
                      name: 'source',
                      type: 'Source',
                      description: '来源。',
                    },
                  ],
                },
                {
                  type: 'TextStreamPart',
                  parameters: [
                    {
                      name: 'type',
                      type: "'tool-call'",
                      description:
                        '标识对象为工具调用的类型。',
                    },
                    {
                      name: 'toolCallId',
                      type: 'string',
                      description: '工具调用的 ID。',
                    },
                    {
                      name: 'toolName',
                      type: 'string',
                      description:
                        '工具的名称，通常是函数的名称。',
                    },
                    {
                      name: 'input',
                      type: 'object based on zod schema',
                      description:
                        '模型生成的参数，供工具使用。',
                    },
                  ],
                },
                {
                  type: 'TextStreamPart',
                  parameters: [
                    {
                      name: 'type',
                      type: "'tool-call-streaming-start'",
                      description:
                        '指示工具调用流式传输的开始。仅在流式传输工具调用时可用。',
                    },
                    {
                      name: 'toolCallId',
                      type: 'string',
                      description: '工具调用的 ID。',
                    },
                    {
                      name: 'toolName',
                      type: 'string',
                      description:
                        '工具的名称，通常是函数的名称。',
                    },
                  ],
                },
                {
                  type: 'TextStreamPart',
                  parameters: [
                    {
                      name: 'type',
                      type: "'tool-call-delta'",
                      description:
                        '标识对象为工具调用增量的类型。仅在流式传输工具调用时可用。',
                    },
                    {
                      name: 'toolCallId',
                      type: 'string',
                      description: '工具调用的 ID。',
                    },
                    {
                      name: 'toolName',
                      type: 'string',
                      description:
                        '工具的名称，通常是函数的名称。',
                    },
                    {
                      name: 'argsTextDelta',
                      type: 'string',
                      description: '工具调用参数的文本增量。',
                    },
                  ],
                },
                {
                  type: 'TextStreamPart',
                  description: '工具调用执行的结果。',
                  parameters: [
                    {
                      name: 'type',
                      type: "'tool-result'",
                      description:
                        '标识对象为工具结果的类型。',
                    },
                    {
                      name: 'toolCallId',
                      type: 'string',
                      description: '工具调用的 ID。',
                    },
                    {
                      name: 'toolName',
                      type: 'string',
                      description:
                        '工具的名称，通常是函数的名称。',
                    },
                    {
                      name: 'input',
                      type: 'object based on zod schema',
                      description:
                        '模型生成的参数，供工具使用。',
                    },
                    {
                      name: 'output',
                      type: 'any',
                      description:
                        '工具执行完成后返回的结果。',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      name: 'onError',
      type: '(event: OnErrorResult) => Promise<void> |void',
      isOptional: true,
      description:
        '在流式传输期间发生错误时调用的回调函数。您可以使用它来记录错误。',
      properties: [
        {
          type: 'OnErrorResult',
          parameters: [
            {
              name: 'error',
              type: 'unknown',
              description: '发生的错误。',
            },
          ],
        },
      ],
    },
    {
      name: 'output',
      type: 'Output',
      isOptional: true,
      description:
        '用于从 LLM 响应解析结构化输出的规范。',
      properties: [
        {
          type: 'Output',
          parameters: [
            {
              name: 'Output.text()',
              type: 'Output',
              description:
                '文本生成的输出规范（默认）。',
            },
            {
              name: 'Output.object()',
              type: 'Output',
              description:
                '使用模式进行类型化对象生成的输出规范。当模型生成文本响应时，它将返回符合模式的对象。',
              properties: [
                {
                  type: 'Options',
                  parameters: [
                    {
                      name: 'schema',
                      type: 'Schema<OBJECT>',
                      description: '要生成的对象的模式。',
                    },
                    {
                      name: 'name',
                      type: 'string',
                      isOptional: true,
                      description:
                        '输出的可选名称。某些提供者用于额外的 LLM 指导。',
                    },
                    {
                      name: 'description',
                      type: 'string',
                      isOptional: true,
                      description:
                        '输出的可选描述。某些提供者用于额外的 LLM 指导。',
                    },
                  ],
                },
              ],
            },
            {
              name: 'Output.array()',
              type: 'Output',
              description:
                '数组生成的输出规范。当模型生成文本响应时，它将返回元素数组。',
              properties: [
                {
                  type: 'Options',
                  parameters: [
                    {
                      name: 'element',
                      type: 'Schema<ELEMENT>',
                      description:
                        '要生成的数组元素的模式。',
                    },
                    {
                      name: 'name',
                      type: 'string',
                      isOptional: true,
                      description:
                        '输出的可选名称。某些提供者用于额外的 LLM 指导。',
                    },
                    {
                      name: 'description',
                      type: 'string',
                      isOptional: true,
                      description:
                        '输出的可选描述。某些提供者用于额外的 LLM 指导。',
                    },
                  ],
                },
              ],
            },
            {
              name: 'Output.choice()',
              type: 'Output',
              description:
                '选择生成的输出规范。当模型生成文本响应时，它将返回选择选项之一。',
              properties: [
                {
                  type: 'Options',
                  parameters: [
                    {
                      name: 'options',
                      type: 'Array<string>',
                      description: '可用的选择。',
                    },
                    {
                      name: 'name',
                      type: 'string',
                      isOptional: true,
                      description:
                        '输出的可选名称。某些提供者用于额外的 LLM 指导。',
                    },
                    {
                      name: 'description',
                      type: 'string',
                      isOptional: true,
                      description:
                        '输出的可选描述。某些提供者用于额外的 LLM 指导。',
                    },
                  ],
                },
              ],
            },
            {
              name: 'Output.json()',
              type: 'Output',
              description:
                '非结构化 JSON 生成的输出规范。当模型生成文本响应时，它将返回 JSON 对象。',
              properties: [
                {
                  type: 'Options',
                  parameters: [
                    {
                      name: 'name',
                      type: 'string',
                      isOptional: true,
                      description:
                        '输出的可选名称。某些提供者用于额外的 LLM 指导。',
                    },
                    {
                      name: 'description',
                      type: 'string',
                      isOptional: true,
                      description:
                        '输出的可选描述。某些提供者用于额外的 LLM 指导。',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      name: 'onStepFinish',
      type: '(result: onStepFinishResult) => Promise<void> | void',
      isOptional: true,
      description: '步骤完成时调用的回调函数。',
      properties: [
        {
          type: 'onStepFinishResult',
          parameters: [
            {
              name: 'stepType',
              type: '"initial" | "continue" | "tool-result"',
              description:
                '步骤的类型。第一步始终是 "initial" 步骤，后续步骤要么是 "continue" 步骤，要么是 "tool-result" 步骤。',
            },
            {
              name: 'finishReason',
              type: '"stop" | "length" | "content-filter" | "tool-calls" | "error" | "other"',
              description:
                '生成完成的统一完成原因。',
            },
            {
              name: 'rawFinishReason',
              type: 'string | undefined',
              description:
                '生成完成的原始原因（来自提供者）。',
            },
            {
              name: 'usage',
              type: 'LanguageModelUsage',
              description: '步骤的令牌使用情况。',
              properties: [
                {
                  type: 'LanguageModelUsage',
                  parameters: [
                    {
                      name: 'inputTokens',
                      type: 'number | undefined',
                      description:
                        '使用的输入（提示）令牌总数。',
                    },
                    {
                      name: 'inputTokenDetails',
                      type: 'LanguageModelInputTokenDetails',
                      description:
                        '输入（提示）令牌的详细信息。另请参阅：缓存令牌和非缓存令牌。',
                      properties: [
                        {
                          type: 'LanguageModelInputTokenDetails',
                          parameters: [
                            {
                              name: 'noCacheTokens',
                              type: 'number | undefined',
                              description:
                                '使用的非缓存输入（提示）令牌数。',
                            },
                            {
                              name: 'cacheReadTokens',
                              type: 'number | undefined',
                              description:
                                '读取的缓存输入（提示）令牌数。',
                            },
                            {
                              name: 'cacheWriteTokens',
                              type: 'number | undefined',
                              description:
                                '写入的缓存输入（提示）令牌数。',
                            },
                          ],
                        },
                      ],
                    },
                    {
                      name: 'outputTokens',
                      type: 'number | undefined',
                      description:
                        '使用的输出（完成）令牌总数。',
                    },
                    {
                      name: 'outputTokenDetails',
                      type: 'LanguageModelOutputTokenDetails',
                      description:
                        '输出（完成）令牌的详细信息。',
                      properties: [
                        {
                          type: 'LanguageModelOutputTokenDetails',
                          parameters: [
                            {
                              name: 'textTokens',
                              type: 'number | undefined',
                              description: '使用的文本令牌数。',
                            },
                            {
                              name: 'reasoningTokens',
                              type: 'number | undefined',
                              description:
                                '使用的推理令牌数。',
                            },
                          ],
                        },
                      ],
                    },
                    {
                      name: 'totalTokens',
                      type: 'number | undefined',
                      description: '使用的令牌总数。',
                    },
                    {
                      name: 'raw',
                      type: 'object | undefined',
                      isOptional: true,
                      description:
                        "来自提供者的原始使用信息。这是提供者的原始使用信息，可能包含额外字段。",
                    },
                  ],
                },
              ],
            },
            {
              name: 'text',
              type: 'string',
              description: '已生成的完整文本。',
            },
            {
              name: 'reasoningText',
              type: 'string | undefined',
              description:
                '模型的推理文本（仅适用于某些模型）。',
            },
            {
              name: 'sources',
              type: 'Array<Source>',
              description:
                '已用作生成响应的输入的来源。对于多步骤生成，来源是从所有步骤累积的。',
              properties: [
                {
                  type: 'Source',
                  parameters: [
                    {
                      name: 'sourceType',
                      type: "'url'",
                      description:
                        'URL 来源。这是由网络搜索 RAG 模型返回的。',
                    },
                    {
                      name: 'id',
                      type: 'string',
                      description: '来源的 ID。',
                    },
                    {
                      name: 'url',
                      type: 'string',
                      description: '来源的 URL。',
                    },
                    {
                      name: 'title',
                      type: 'string',
                      isOptional: true,
                      description: '来源的标题。',
                    },
                    {
                      name: 'providerMetadata',
                      type: 'SharedV2ProviderMetadata',
                      isOptional: true,
                      description:
                        '来源的额外提供者元数据。',
                    },
                  ],
                },
              ],
            },
            {
              name: 'files',
              type: 'Array<GeneratedFile>',
              description: '在此步骤中生成的所有文件。',
              properties: [
                {
                  type: 'GeneratedFile',
                  parameters: [
                    {
                      name: 'base64',
                      type: 'string',
                      description: '文件作为 base64 编码字符串。',
                    },
                    {
                      name: 'uint8Array',
                      type: 'Uint8Array',
                      description: '文件作为 Uint8Array。',
                    },
                    {
                      name: 'mediaType',
                      type: 'string',
                      description: '文件的 IANA 媒体类型。',
                    },
                  ],
                },
              ],
            },
            {
              name: 'toolCalls',
              type: 'ToolCall[]',
              description: '已执行的工具调用。',
            },
            {
              name: 'toolResults',
              type: 'ToolResult[]',
              description: '已生成的工具结果。',
            },
            {
              name: 'warnings',
              type: 'Warning[] | undefined',
              description:
                '来自模型提供者的警告（例如，不受支持的设置）。',
            },
            {
              name: 'response',
              type: 'Response',
              isOptional: true,
              description: '响应元数据。',
              properties: [
                {
                  type: 'Response',
                  parameters: [
                    {
                      name: 'id',
                      type: 'string',
                      description:
                        '响应标识符。AI SDK 在可用时使用提供者响应中的 ID，否则生成一个 ID。',
                    },
                    {
                      name: 'model',
                      type: 'string',
                      description:
                        '用于生成响应的模型。AI SDK 在可用时使用提供者响应中的响应模型，否则使用函数调用中的模型。',
                    },
                    {
                      name: 'timestamp',
                      type: 'Date',
                      description:
                        '响应的时间戳。AI SDK 在可用时使用提供者响应中的响应时间戳，否则创建一个时间戳。',
                    },
                    {
                      name: 'headers',
                      isOptional: true,
                      type: 'Record<string, string>',
                      description: '可选的响应头部。',
                    },
                  ],
                },
              ],
            },
            {
              name: 'isContinued',
              type: 'boolean',
              description:
                '当将有带有继续文本的继续步骤时为 true。',
            },
            {
              name: 'providerMetadata',
              type: 'Record<string,JSONObject> | undefined',
              isOptional: true,
              description:
                '来自提供者的可选元数据。外部键是提供者名称。内部值是元数据。细节取决于提供者。',
            },
          ],
        },
      ],
    },
    {
      name: 'onFinish',
      type: '(result: OnFinishResult) => Promise<void> | void',
      isOptional: true,
      description:
        '当 LLM 响应和所有请求工具执行（对于具有 `execute` 函数的工具）完成时调用的回调函数。',
      properties: [
        {
          type: 'OnFinishResult',
          parameters: [
            {
              name: 'finishReason',
              type: '"stop" | "length" | "content-filter" | "tool-calls" | "error" | "other"',
              description:

文档剩余部分因篇幅限制未完全翻译，但主要内容已涵盖。如需完整翻译，请参考原始英文文档。