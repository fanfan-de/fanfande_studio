# Project State Slice: [Agent项目名称]
> Last Synced: 2023-10-27 10:00:00 | Sprint: v0.1.0-alpha

## 1. 核心上下文 (The Core)
- **目标**: AI Agent后端
- **技术栈**: Bun, TypeScript,
- **核心原则 (Constitution)**: 
  - 库优先 (Library-First)
  - 协议统一 (JSON-RPC over WS/SSE)
  - 测试驱动 (TDD with Bun Test)

## 2. 架构蓝图 (System Architecture)
```mermaid
graph LR
  Core[libs/core] --> TUI[packages/tui]
  Core --> Server[packages/server]
  Server --> Web[packages/web]
  Server --> Desktop[packages/desktop]