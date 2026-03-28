# Session Module Spec

## 概述
`session` 模块负责一次对话或一次编码任务的完整生命周期。它要把用户输入、模型输出、工具调用、文件变更和持久化记录串起来，并且保证这些历史可以回放、恢复和继续执行。

更详细的设计说明见 [SESSION_ARCHITECTURE.md](./SESSION_ARCHITECTURE.md)。

## 核心职责
- 定义 `SessionInfo`、`MessageInfo`、`Part` 等数据模型
- 创建和维护 session 记录
- 将聊天循环组织成可恢复的流程
- 把模型消息转换为 AI SDK 可消费的消息格式
- 将 message / part 写回 SQLite

## 主要文件
- `session.ts`：session 记录、CRUD、事件定义
- `message.ts`：message / part 数据结构和转换
- `llm.ts`：模型流式输出适配
- `prompt.ts`：session prompt 与循环编排
- `processor.ts`：消息处理与状态推进
- `status.ts`：运行状态查询与管理
- `shell.ts`：shell 相关执行封装

## 对外 API
- `createSession()`：创建新的 session 记录
- `toModelMessages()`：把历史消息转换为模型输入
- `prompt()`：启动一次 session 交互
- `loop()`：持续驱动模型和工具循环

## 约束
- 运行时状态和持久化状态必须分离
- 所有历史记录都应能回放
- 对工具调用和模型输出的写入必须保持顺序一致
- session 的生命周期变更应通过事件或状态层统一表达
