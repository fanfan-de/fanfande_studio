# Agent 模块开发计划

## 概述

基于 OpenCode 现有 Session 模块的架构，计划开发一个独立的 Agent 模块。该模块负责管理、注册、执行和监控各种 AI 代理（Agent），支持动态加载、配置、工具绑定、状态跟踪和事件通知。目标是为系统提供可扩展的、多代理协作的基础设施。

## 设计原则

1. **模块化**：每个文件职责单一，便于维护和测试。
2. **事件驱动**：使用 BusEvent 发布代理状态变更、执行结果等事件。
3. **存储抽象**：通过 Storage 统一持久化代理配置、状态和历史。
4. **配置驱动**：支持通过 Config 和 Flag 动态调整代理行为。
5. **插件扩展**：预留 Plugin 钩子，允许外部定制代理行为。

## 文件结构规划

| 文件              | 职责                                                                                 |
| --------------- | ---------------------------------------------------------------------------------- |
| `index.ts`      | 模块主入口，定义 `Agent` 命名空间，提供代理的 CRUD、查询、执行等核心 API。                                     |
| `types.ts`      | 定义代理相关的数据类型（Zod Schema）：`Agent.Info`、`Agent.Config`、`Agent.Status`、`Agent.Tool` 等。 |
| `registry.ts`   | 代理注册表，管理内置和自定义代理的注册、发现、加载。                                                         |
| `executor.ts`   | 代理执行器，负责调度代理运行、处理工具调用、管理执行上下文。                                                     |
| `prompt.ts`     | 代理专属提示管理，根据代理类型和配置生成系统提示和指令。                                                       |
| `tools.ts`      | 定义代理专属工具集，提供与代理强相关的工具函数（如 `agent.invoke`、`agent.plan` 等）。                          |
| `config.ts`     | 代理配置管理，加载默认配置、用户配置，并处理配置合并与验证。                                                     |
| `events.ts`     | 定义代理相关事件：`agent.created`、`agent.updated`、`agent.executed`、`agent.error` 等。         |
| `storage.ts`    | 代理数据存储层，封装对 Storage 的读写操作，管理代理状态、历史记录。                                             |
| `status.ts`     | 代理状态机，跟踪代理的 `idle`、`running`、`paused`、`error` 等状态，并提供状态查询 API。                     |
| `summary.ts`    | 代理执行摘要，统计代理的执行次数、耗时、工具调用情况，并生成报告。                                                  |
| `retry.ts`      | 代理执行重试逻辑，针对可恢复错误实现退避重试机制。                                                          |
| `compaction.ts` | 代理上下文压缩，当代理历史过长时自动修剪旧记录以节省令牌。                                                      |

## 核心数据结构（Zod Schema）

Session.Info
```typescript
{
  id: string;                     // 代理唯一标识
  name: string;                   // 代理名称（人类可读）
  slug: string;                   // URL 友好标识
  version: string;                // 代理版本
  description?: string;           // 代理描述
  config: Agent.Config;           // 代理配置
  tools: string[];                // 绑定的工具列表
  prompt?: string;                // 自定义提示模板
  model: {                        // 默认模型配置
    providerID: string;
    modelID: string;
  };
  time: {
    created: number;
    updated: number;
    lastExecuted?: number;
  };
  status: Agent.Status;           // 当前状态
  metadata?: Record<string, any>; // 扩展元数据
}
```

### Session.Config
```typescript
{
  maxSteps?: number;              // 最大执行步骤
  timeout?: number;               // 执行超时（毫秒）
  autoRetry?: boolean;            // 是否自动重试
  compression?: boolean;          // 是否启用上下文压缩
  permissions?: PermissionNext.Ruleset; // 权限规则
}
```

### Agent.Status
```typescript
{
  type: 'idle' | 'running' | 'paused' | 'error';
  currentStep?: number;
  error?: MessageV2.Assistant['error'];
  startedAt?: number;
}
```

## 实现步骤（Todo List）

### 第一阶段：基础框架搭建
- [ ] **1.1 创建模块目录结构**
  - 在 `src/agent/` 下建立上述文件骨架（空文件或简单导出）。
- [ ] **1.2 定义核心类型（types.ts）**
  - 编写 Zod Schema 定义 `Agent.Info`、`Agent.Config`、`Agent.Status`、`Agent.Tool`。
  - 导出对应的 TypeScript 类型。
- [ ] **1.3 实现存储层（storage.ts）**
  - 封装 `Storage` 操作：`readAgent`、`writeAgent`、`listAgents`、`removeAgent`。
  - 定义存储键前缀：`["agent", projectID, agentID]`。
- [ ] **1.4 创建主入口（index.ts）**
  - 定义 `Agent` 命名空间，导出所有公共 API。
  - 实现基础 CRUD：`create`、`get`、`update`、`remove`。
  - 添加 `list` 迭代器和 `find` 查询方法。

### 第二阶段：注册与发现
- [ ] **2.1 实现代理注册表（registry.ts）**
  - 内置默认代理（如 "default"、"title"、"summary" 等）的注册。
  - 提供 `register`、`get`、`list` 方法。
  - 支持从文件系统加载自定义代理（如 `agents/*.json` 或 `agents/*.ts`）。
- [ ] **2.2 配置管理（config.ts）**
  - 加载默认配置文件 `config/agent.default.json`。
  - 合并用户配置（来自 `Config.get().agents`）。
  - 提供 `getConfig(agentID)` 方法。

### 第三阶段：执行引擎
- [ ] **3.1 实现执行器（executor.ts）**
  - 设计 `execute(agentID, input, options)` 方法。
  - 管理执行上下文：会话 ID、消息历史、工具绑定。
  - 集成 `SessionProcessor` 处理 LLM 流式调用。
- [ ] **3.2 工具集成（tools.ts）**
  - 定义代理专用工具：`agent.invoke`、`agent.plan`、`agent.delegate` 等。
  - 实现工具调用与结果收集的逻辑。
- [ ] **3.3 提示管理（prompt.ts）**
  - 根据代理配置生成系统提示。
  - 支持从文件加载模板（如 `prompt/agent/*.txt`）。
  - 提供 `buildPrompt(agent, context)` 方法。

### 第四阶段：状态与事件
- [ ] **4.1 状态管理（status.ts）**
  - 实现全局状态存储（使用 `Instance.state`）。
  - 提供 `setStatus`、`getStatus`、`listStatuses` 方法。
  - 发布 `agent.status` 事件。
- [ ] **4.2 事件定义（events.ts）**
  - 使用 `BusEvent.define` 定义代理相关事件。
  - 包括 `created`、`updated`、`executed`、`error`、`status` 等。
- [ ] **4.3 集成事件总线**
  - 在 `index.ts` 的 CRUD 方法中发布相应事件。
  - 在 `executor.ts` 中发布执行开始、结束、错误事件。

### 第五阶段：高级功能
- [ ] **5.1 重试机制（retry.ts）**
  - 实现 `retryable` 错误判断。
  - 提供 `delay` 计算和 `sleep` 方法。
  - 在 `executor.ts` 中集成自动重试。
- [ ] **5.2 上下文压缩（compaction.ts）**
  - 检测代理历史是否超出令牌限制。
  - 实现 `prune` 方法修剪旧工具调用输出。
  - 提供 `isOverflow` 判断函数。
- [ ] **5.3 摘要生成（summary.ts）**
  - 统计代理执行次数、平均耗时、工具调用分布。
  - 生成 JSON 或 Markdown 格式的报告。
  - 提供 `summarize(agentID, period)` 方法。

### 第六阶段：集成与测试
- [ ] **6.1 与现有模块集成**
  - 在 `SessionPrompt` 中调用代理执行。
  - 在 `SessionProcessor` 中支持代理切换。
  - 在 `LLM` 模块中根据代理配置调整模型参数。
- [ ] **6.2 单元测试**
  - 为每个文件编写单元测试（使用 Jest 或 Bun test）。
  - 覆盖核心 API 和边界情况。
- [ ] **6.3 集成测试**
  - 测试代理从注册到执行的全流程。
  - 测试多代理协作场景。
  - 测试错误处理和恢复机制。
- [ ] **6.4 文档与示例**
  - 编写模块使用文档（README.md）。
  - 创建示例代理配置和自定义代理模板。
  - 提供常见用例代码片段。

### 第七阶段：优化与扩展
- [ ] **7.1 性能优化**
  - 缓存代理配置和提示模板。
  - 优化存储读写（批量操作、惰性加载）。
- [ ] **7.2 插件扩展点**
  - 定义插件钩子：`agent.beforeExecute`、`agent.afterExecute`、`agent.toolCall`。
  - 在 `Plugin` 模块中注册这些钩子。
- [ ] **7.3 权限集成**
  - 将 `PermissionNext.Ruleset` 集成到代理配置中。
  - 在执行前检查代理权限。
- [ ] **7.4 监控与日志**
  - 增加详细日志记录（使用 `Log` 模块）。
  - 发布监控指标（执行时间、成功率等）。

## 依赖关系

- **Session 模块**：代理执行依赖于会话上下文（`sessionID`、`messageID`）。
- **Provider 模块**：获取模型配置和调用 LLM。
- **Tool 模块**：绑定工具并执行工具调用。
- **Storage 模块**：持久化代理数据和状态。
- **Bus 模块**：发布和订阅代理事件。
- **Config 模块**：读取用户配置和标志。

## 参考实现

- 参考 `Session` 模块的 `index.ts` 组织方式。
- 参考 `SessionProcessor` 的流式处理和工具调用循环。
- 参考 `SessionPrompt` 的繁忙状态管理和提示构建。
- 参考 `SessionStatus` 的状态机实现。

## 预期产出

1. 一个完整的、可扩展的 Agent 模块，支持多代理管理和协作。
2. 与现有 Session 模块无缝集成，增强系统的代理能力。
3. 提供丰富的 API 和事件，便于二次开发和定制。
4. 详细的文档和示例，降低使用门槛。

## 风险评估

- **复杂度**：代理模块涉及多个子系统，需精心设计接口。
- **性能**：频繁的代理切换和上下文管理可能影响响应速度。
- **兼容性**：需确保与现有 Session、Tool、Provider 模块的兼容。

## 下一步行动

1. 评审本计划，确认架构合理性。
2. 按阶段分步实施，每阶段完成后进行代码审查。
3. 编写测试用例，确保质量。
4. 逐步替换现有代码中硬编码的代理逻辑。

