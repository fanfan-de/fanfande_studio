这段代码是名为 "Opencode" 项目中处理 **LLM（大语言模型）流式响应**的核心模块。它基于 Vercel 的 AI SDK (`streamText`, `wrapLanguageModel`) 构建，封装了复杂的配置管理、插件系统、工具调用（Tool Calling）以及针对不同提供商（Provider）的适配逻辑。

以下是对该代码的详细分析：

### 1. 核心功能概述
`LLM.stream` 函数是入口点，负责：
1.  **初始化上下文**：获取模型、配置、认证信息。
2.  **构建 System Prompt**：合并 Agent 设定、用户设定、插件注入的 Prompt。
3.  **计算参数**：动态计算 Temperature、TopP、MaxTokens 等，并支持通过插件修改。
4.  **处理工具（Tools）**：解析可用工具，处理权限，并针对特定代理（LiteLLM）做兼容性修复。
5.  **执行流式生成**：调用 Vercel AI SDK，并挂载中间件（Middleware）处理推理内容和参数转换。

### 2. 关键逻辑与特性

#### A. 系统提示词（System Prompt）构建
代码非常注重 System Prompt 的灵活性：
*   **分层合并**：`Header` + `Agent Prompt` (或 Provider 默认) + `Custom System` + `User Message System`。
*   **特殊处理**：如果是 "Codex" 模式（OpenAI OAuth），则跳过常规 Provider Prompt，改用 `options.instructions`。
*   **插件干预**：通过 `experimental.chat.system.transform` 允许外部插件在运行时修改 System Prompt。
*   **缓存优化**：代码尝试保持 prompt 的两段式结构（Header + Body），以便于底层可能的缓存机制。

#### B. 配置与参数计算
使用了 `remeda` 库的 `pipe` 和 `mergeDeep` 进行深度的配置合并：
*   **优先级**：`Variant` (变体) > `Agent Options` > `Model Options` > `Base Options`。
*   **动态调整**：通过 `ProviderTransform` 类针对不同模型计算 `maxOutputTokens`，防止超出上下文限制。
*   **插件钩子**：`chat.params` 钩子允许在最后时刻修改 temperature、topP 等参数。

#### C. 工具调用（Tool Calling）与 兼容性修复
这是代码中非常健壮的一部分：
1.  **权限控制 (`resolveTools`)**：检查 `PermissionNext`，确保 Agent 只能使用被允许的工具。
2.  **LiteLLM/Anthropic 兼容性 Hack**：
    *   **问题**：某些代理（如 LiteLLM）或模型（Anthropic）在其 API 历史记录中包含 `tool-call` 但当前请求没有提供 `tools` 参数时会报错。
    *   **检测**：`isLiteLLMProxy` 检测是否为 LiteLLM 提供商，并结合 `hasToolCalls` 扫描历史记录。
    *   **修复**：如果满足条件且当前无工具可用，自动注入一个 `_noop`（空操作）工具来满足 API 校验要求。
3.  **工具自动修复 (`experimental_repairToolCall`)**：
    *   如果模型生成的工具名称大小写错误（例如 `GetWeather` vs `getWeather`），代码会自动尝试匹配正确的大小写并修复，而不是直接抛错。

#### D. 推理与中间件 (Reasoning & Middleware)
在 `streamText` 的 `model` 参数中使用了 `wrapLanguageModel`：
*   **`extractReasoningMiddleware`**：这表明该系统支持 **推理模型**（如 DeepSeek R1 或 OpenAI o1），能够提取 `<think>` 标签内的思维链内容，并不显示给普通用户（`startWithReasoning: false`）。
*   **`transformParams`**：在发送请求前对参数进行最后一次转换，确保符合特定 Provider 的格式。

#### E. 特殊模式：Codex
代码中定义了 `isCodex` 变量 (`openai` provider 且 `oauth` auth)：
*   这种模式下，System Prompt 被作为 User 消息发送（可能是为了规避某些限制或利用特定的微调行为）。
*   使用 `SystemPrompt.instructions()` 填充 `options.instructions`。

### 3. 代码片段解析

**工具修复逻辑：**
```typescript
async experimental_repairToolCall(failed) {
  const lower = failed.toolCall.toolName.toLowerCase()
  // 尝试不区分大小写匹配
  if (lower !== failed.toolCall.toolName && tools[lower]) {
    // ...日志记录...
    return { ...failed.toolCall, toolName: lower } // 修复成功
  }
  // 无法修复，返回特定格式的错误输入，让模型知道调用失败
  return {
    ...failed.toolCall,
    input: JSON.stringify({ tool: failed.toolCall.toolName, error: failed.error.message }),
    toolName: "invalid",
  }
},
```

**LiteLLM 兼容性 Hack：**
```typescript
if (isLiteLLMProxy && Object.keys(tools).length === 0 && hasToolCalls(input.messages)) {
  tools["_noop"] = tool({
    description: "Placeholder...", // 描述这是为了兼容性
    inputSchema: jsonSchema({ type: "object", properties: {} }),
    execute: async () => ({ output: "", title: "", metadata: {} }),
  })
}
```

### 4. 总结
这段代码是一个生产环境级别的 LLM 抽象层。它不仅仅是简单的调用 API，而是解决了很多实际工程问题：
*   **多模型统一**：屏蔽了不同 Provider 的参数差异。
*   **鲁棒性**：处理了工具调用格式错误、API 历史记录校验等边缘情况。
*   **可扩展性**：通过 Plugin 系统允许外部干预 Prompt 和参数。
*   **可观测性**：集成了详细的结构化日志（Log）和 OpenTelemetry 支持。