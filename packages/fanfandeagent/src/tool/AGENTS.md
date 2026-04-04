# Tool 模块协作约定

本文件适用于 `packages/fanfandeagent/src/tool/**`。

## 工作起点
- 修改任何对外可观察行为前，先读 `spec.md`。
- `spec.md` 是这个模块唯一的设计规范来源。
- 涉及文件职责、核心数据结构、对外接口、初始化流程、运行时流程时，必须同步更新 `spec.md`。

## 模块目标
- 这里是 agent 的 tool 边界层，只负责工具 contract、工具注册、共享 helper 和内置工具实现。
- 保持高内聚：与 tool 无关的业务流程、领域规则、会话编排不要放进这个目录。
- 保持低耦合：外部模块优先依赖 `tool.ts` 和 `registry.ts`，不要反向依赖某个具体工具文件或 `shared.ts` 的私有细节。
- 必要耦合可以存在，但必须在 `spec.md` 中明确写出原因、方向和约束。

## 代码组织规则
- 一个具体工具一个文件。
- `tool.ts` 只放共用 contract、包装器、归一化逻辑。
- `registry.ts` 只放注册、查找、命名唯一性相关逻辑。
- `shared.ts` 只放多个工具共享且足够通用的 helper。
- 如果能力只服务于一个工具，就放回该工具文件，不要过早抽象到 `shared.ts`。
- 优先增加结构化工具，不要把 `exec_command` 当成默认实现手段。

## 文档同步规则
- 修改工具对外行为时，代码和 spec 必须在同一个改动里一起更新。
- `spec.md` 必须覆盖：
  - 文件整体架构
  - 核心数据结构
  - 暴露的核心接口
  - 数据流水线

## 测试要求
- 修改 `tool.ts`、`registry.ts`、`shared.ts` 或任一内置工具后，至少运行 `bun run test:tool`。
- 如果变更影响真实工具调用链路或 LLM 驱动流程，再运行 `bun run test:tool:e2e`。
- 新增工具时，至少补一条成功路径测试和一条失败路径测试。
- 新测试文件放在 `packages/fanfandeagent/Test/` 下，并使用 `tool.` 前缀命名。
