# session 目录脚本职责说明

本文基于 `packages/fanfandeagent/src/session` 当前代码状态整理。`runtime/` 已按重构准备要求删除，因此现阶段所有 `#session/runtime/*` 引用都会报错，这是后续重建 runtime API 时需要逐步消化的边界。

## 目录结构

| 子目录 | 职责 |
| --- | --- |
| `core/` | 主会话链路：session/message 数据模型、prompt loop、上下文窗口、LLM 调用、processor、工具解析和 system prompt。 |
| `tasks/` | session task 与 subtask：任务 schema、任务依赖/状态管理、子代理生命周期。 |
| `diff/` | snapshot diff 与 diff 摘要。 |
| `support/` | 辅助能力：prompt preset、自动标题、大型工具输出持久化、旧 shell 草稿。 |
| `prompt/` | 内置 prompt 文本模板。 |
| `documentation/` | session 模块说明文档。 |

## runtime 删除状态

已删除的 runtime 文件包括：

| 原文件 | 原职责 |
| --- | --- |
| `runtime/runtime-event.ts` | 运行时事件协议、cursor、terminal event 判断。 |
| `runtime/orchestrator.ts` | active turn 管理、turnID/seq 分配、emit 入口。 |
| `runtime/event-store.ts` | runtime event 持久化、投影和订阅。 |
| `runtime/projector.ts` | 将 runtime event 投影回 message/part/permission/task 等旧表。 |
| `runtime/live-stream-hub.ts` | session/turn 维度的内存实时事件订阅。 |
| `runtime/stream-events.ts` | processor 内部通过 bus 派发的流式辅助事件。 |
| `runtime/runtime-debug.ts` | session runtime 调试快照。 |
| `runtime/running-state.ts` | 正在运行的 session 状态、取消、等待停止和快照。 |
| `runtime/status.ts` | 较早的 idle/busy/retry session status 层。 |

后续重建时可以从编译错误开始恢复最小接口：先定义 runtime event schema，再恢复 turn orchestrator，然后接回 event store/live stream，最后恢复 debug/status 等外围能力。

## 主流程概览

一轮用户输入原本大致经过以下链路：

1. `core/prompt.ts` 接收外部输入，创建 user message 和 parts，并启动 turn。
2. `core/system.ts`、`support/prompt-presets.ts`、`core/context-window.ts` 共同生成本轮 system prompt 和可发送给模型的历史上下文。
3. `core/resolve-tools.ts` 按 agent、全局配置、session 策略解析可用工具。
4. `core/llm.ts` 使用 Vercel AI SDK 的 `streamText()` 发起模型流式调用。
5. `core/processor.ts` 消费 `fullStream`，把文本、reasoning、工具调用、工具结果、文件、来源、usage 等映射成 message part 和 runtime event。
6. runtime 层原本负责把运行过程持久化、投影回 session 表，并提供实时订阅；该层当前已删除。
7. `core/session.ts` 作为 session/message/part 等核心数据的持久化入口，支撑 resume、archive、side chat、diff、debug 等能力。

## core

| 文件 | 主要作用 | 关键入口/导出 |
| --- | --- | --- |
| `core/session.ts` | session 层的数据模型和持久化入口。负责创建主会话、side chat，读写 `sessions`/`messages`/`parts`/`archived_sessions`/`side_chat_links`，维护 session title、workflow、modelSelection。 | `createSession()`、`createSideChat()`、`DataBaseCreate()`、`DataBaseRead()`、`updateMessage()`、`updatePart()`、`archiveSessionCascade()`、`restoreArchivedSession()` |
| `core/message.ts` | 定义会话内消息和 part schema，并把数据库里的 `WithParts[]` 转成 AI SDK 的 `ModelMessage[]`。 | `MessageInfo`、`Part`、`ToolPart`、`WithParts`、`toModelMessages()` |
| `core/prompt.ts` | 会话编排入口。创建 user message，驱动模型循环，处理 resume/cancel/diff/title 等副作用。当前仍依赖已删除的 runtime API。 | `PromptInput`、`prompt()`、`resume()`、`cancel()`、`state()` |
| `core/context-window.ts` | 上下文窗口控制和自动压缩。估算 token、裁剪工具输出，必要时生成 compacted history 内部消息。 | `preparePromptContext()`、`PreparedPromptContext` |
| `core/llm.ts` | 模型调用适配层。解析 provider/model，组装 `streamText()` 参数，并返回 AI SDK 流式结果。 | `stream()`、`hasToolCalls()` |
| `core/processor.ts` | 单次 LLM stream 的消费者和落库转换器。当前仍依赖已删除的 runtime event/stream event API。 | `create()` |
| `core/resolve-tools.ts` | 将工具注册表转换成 AI SDK `ToolSet`，并注入 session/message/cwd/worktree/abort 等运行上下文。 | `resolveTools()` |
| `core/system.ts` | 生成系统提示词片段，加载 preset、plan prompt、approved plan、active tasks、环境信息和技能 prompt。 | `defaultPrompt()`、`environment()`、`skills()`、`provider()` |

## tasks

| 文件 | 主要作用 | 关键入口/导出 |
| --- | --- | --- |
| `tasks/task-schema.ts` | session task 的纯 schema 定义。 | `SessionTaskRecord`、`SessionTaskView`、`SessionTaskStatus` |
| `tasks/task.ts` | session task 的业务逻辑和持久化。 | `listSessionTasks()`、`getSessionTask()`、`createSessionTasks()`、`updateSessionTask()` |
| `tasks/subtask.ts` | 子代理任务生命周期。当前仍依赖已删除的 running-state。 | `startSubtask()`、`readSubtask()`、`listSubtasksByParentSession()`、`cancelSubtask()` |

## diff

| 文件 | 主要作用 | 关键入口/导出 |
| --- | --- | --- |
| `diff/diff-summary.ts` | 纯函数 diff 摘要工具。 | `summarizeSnapshotFileDiffs()`、`collectDiffStats()`、`buildDiffSummary()` |
| `diff/diff.ts` | session/snapshot 相关 diff 计算。 | `computeSessionDiffSummary()`、`computeSessionDetailedDiff()` |

## support 与 prompt

| 文件 | 主要作用 | 关键入口/导出 |
| --- | --- | --- |
| `support/prompt-presets.ts` | prompt preset 管理和当前 system/plan prompt 解析。 | `getResolvedPromptPresetContent()`、`listPromptPresetSummaries()` |
| `support/title.ts` | 自动生成 session 标题。 | `generateSessionTitle()` |
| `support/tool-result-persistence.ts` | 大型工具输出持久化。 | `maybePersistToolResult()`、`readPersistedOutputMetadata()` |
| `support/shell.ts` | 早期 shell command 入口草稿，当前基本全是注释。 | 无有效导出 |
| `prompt/*.txt` | 内置 system/plan/provider-specific prompt 模板。 | 文本模板 |

## documentation

| 文件 | 主要作用 |
| --- | --- |
| `documentation/spec.md` | session 主链路执行规格。 |
| `documentation/SESSION_ARCHITECTURE.md` | 早期/概念层架构说明。 |
| `documentation/processor.fullstream.md` | processor 消费 fullStream 的设计说明。 |
| `documentation/PLAN_MODE_TOOLS_DESIGN.md` | Plan Mode 工具设计相关文档。 |
| `documentation/SCRIPT_OVERVIEW.md` | 当前文件。 |

## 重建建议

1. 先恢复 `runtime-event.ts` 的最小事件 schema。
2. 再恢复 `orchestrator.ts` 的 `startTurn()`、`activeTurn()`、`finishTurn()` 和 `TurnContext`。
3. 接回 `event-store.ts` 与 `live-stream-hub.ts`，让 prompt/server stream 能重新编译。
4. 最后恢复 `projector.ts`、`runtime-debug.ts`、`running-state.ts`、`status.ts` 等外围能力。
