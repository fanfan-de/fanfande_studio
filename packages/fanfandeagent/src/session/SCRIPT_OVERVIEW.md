# session 目录脚本职责说明

本文基于 `packages/fanfandeagent/src/session` 当前代码梳理各脚本职责。这个目录整体负责一次 Agent 会话的生命周期：创建/归档 session、记录 message/part、组装系统提示词和上下文窗口、调用 LLM、处理流式事件、执行工具、持久化运行事件，以及维护任务和子任务状态。

## 主流程概览

一轮用户输入大致经过以下链路：

1. `prompt.ts` 接收外部输入，创建 user message 和 parts，并启动 turn。
2. `system.ts`、`prompt-presets.ts`、`context-window.ts` 共同生成本轮 system prompt 和可发送给模型的历史上下文。
3. `resolve-tools.ts` 按 agent、全局配置、session 策略解析可用工具。
4. `llm.ts` 使用 Vercel AI SDK 的 `streamText()` 发起模型流式调用。
5. `processor.ts` 消费 `fullStream`，把文本、reasoning、工具调用、工具结果、文件、来源、usage 等映射成 message part 和 runtime event。
6. `orchestrator.ts`、`runtime-event.ts`、`event-store.ts`、`projector.ts`、`live-stream-hub.ts` 将运行过程持久化、投影回 session 表，并提供实时订阅。
7. `session.ts` 作为 session/message/part 等核心数据的持久化入口，支撑后续 resume、archive、side chat、diff、debug 等能力。

## 核心会话与消息脚本

| 文件 | 主要作用 | 关键入口/导出 |
| --- | --- | --- |
| `session.ts` | session 层的数据模型和持久化入口。负责创建主会话、创建 side chat、读写 `sessions`/`messages`/`parts`/`archived_sessions`/`side_chat_links`，归档/恢复/删除会话，维护 session title、workflow、modelSelection。 | `createSession()`、`createSideChat()`、`DataBaseCreate()`、`DataBaseRead()`、`updateMessage()`、`updatePart()`、`upsertMessage()`、`upsertPart()`、`archiveSessionCascade()`、`restoreArchivedSession()` |
| `message.ts` | 定义会话内消息和 part 的完整 schema。包括 user/assistant/system message，text/reasoning/file/image/tool/permission/subtask/patch/snapshot/compaction 等 part，以及工具状态机。还负责把数据库里的 `WithParts[]` 转成 AI SDK 的 `ModelMessage[]`。 | `MessageInfo`、`Part`、`User`、`Assistant`、`ToolPart`、`ToolState*`、`WithParts`、`toModelMessages()` |
| `prompt.ts` | 会话编排入口。`prompt()` 新建 user message 后驱动模型循环；`resume()` 基于已有历史继续推进；`runLoop()` 每轮从数据库重建上下文、解析 agent/model/tools、调用 processor，并处理阻塞、取消、diff、自动标题等副作用。 | `PromptInput`、`prompt`、`resume`、`cancel()`、`state()` |
| `context-window.ts` | 上下文窗口控制和自动压缩。根据模型上下文限制估算 token，裁剪工具输出，必要时生成 compacted history 内部消息，尽量保留最近 turns 和压缩后的历史摘要。 | `preparePromptContext()`、`PreparedPromptContext`、`CURRENT_SUMMARY_VERSION` |
| `llm.ts` | 模型调用适配层。解析 provider language model，组装 `streamText()` 参数，设置 system prompt、tools、超时、重试、OpenAI reasoning/providerOptions，并返回 AI SDK 流式结果。 | `StreamInput`、`StreamOutput`、`stream()`、`hasToolCalls()` |
| `processor.ts` | 单次 LLM stream 的消费者和落库转换器。处理 text/reasoning 流、tool input/call/result/error/approval、source/file、step、finish、abort/error 事件；维护 assistant draft、工具调用状态、usage、runtime phase，并返回 loop 控制结果。 | `create()` |
| `resolve-tools.ts` | 将工具注册表转换成 AI SDK `ToolSet`。按 agent 工具策略、全局工具开关、side-chat 只读策略过滤工具，并统一注入 session/message/cwd/worktree/abort/toolCallID、权限评估和大输出持久化。 | `resolveTools()` |
| `system.ts` | 生成系统提示词片段。加载 prompt preset，按 plan agent 附加 plan prompt，注入 approved plan、active tasks、环境信息和技能 prompt。 | `defaultPrompt()`、`environment()`、`skills()`、`provider()` |

## 运行事件、流式订阅与调试

| 文件 | 主要作用 | 关键入口/导出 |
| --- | --- | --- |
| `runtime-event.ts` | 定义运行时事件协议。包含 turn、message、part、permission、LLM call、text/reasoning delta、tool lifecycle、source/file/patch/snapshot、task state、错误上下文等事件 schema，并提供 cursor 和终止事件判断。 | `RuntimeEvent`、`RuntimeEventType`、`TurnRuntimePhase`、`createRuntimeEventFactory()`、`cursorOf()`、`parseCursor()` |
| `orchestrator.ts` | 管理单个 session 的 active turn。为 turn 分配 `turnID` 和递增 seq，提供 `emit()` 统一创建并追加 runtime event，防止同一 session 并发启动多个 turn。 | `startTurn()`、`activeTurn()`、`finishTurn()`、`TurnContext` |
| `event-store.ts` | runtime event 持久化和分发层。普通事件写入 `session_events` 并投影，text/reasoning delta 这类瞬时流事件走 fast path，只推送 live stream 和内存订阅，避免高频落库。 | `append()`、`appendAndProject()`、`subscribe()`、`listSessionEvents()`、`listTurnEvents()` |
| `projector.ts` | 事件投影器。把 runtime event 投影回旧的数据表，例如 message/part 入库、permission request upsert、task state 替换、part 删除等，让 event 流和现有 session 表保持同步。 | `project()` |
| `live-stream-hub.ts` | 内存中的 runtime event 订阅队列。按 `sessionID`/可选 `turnID` 过滤事件，支持 `next()` 异步消费，并在 terminal turn event 后自动关闭订阅。 | `subscribe()`、`publish()`、`LiveStreamSubscription` |
| `stream-events.ts` | 项目总线上的流式辅助事件定义。用于 processor 将 chunk、part 持久化请求、工具审批注册请求通过 bus 异步派发，降低 stream 消费路径上的阻塞。 | `Event.ChunkReceived`、`Event.PartPersistenceRequested`、`Event.ToolApprovalRegistrationRequested` |
| `runtime-debug.ts` | 将 session runtime events 汇总成调试快照。生成最近 turn、LLM call、工具状态、错误上下文、recent events、任务状态和诊断字段，供 UI 或诊断接口查看。 | `getSessionRuntimeDebugSnapshot()` |
| `running-state.ts` | 内存中的运行状态表。记录每个正在运行 session 的 `AbortController`、启动时间和原因，支持取消、等待停止、快照和订阅。 | `register()`、`finish()`、`cancel()`、`waitForStop()`、`snapshot()` |
| `status.ts` | 较早的 session status 状态层。维护 `idle`/`busy`/`retry` 状态，并通过 project bus 发布 `session.status`。当前主流程也会在 prompt loop 中设置 busy/idle。 | `get()`、`set()`、`list()`、`Event.Status` |

## 任务、子任务与差异追踪

| 文件 | 主要作用 | 关键入口/导出 |
| --- | --- | --- |
| `task-schema.ts` | session task 的纯 schema 定义。描述任务状态、依赖关系、owner 活动、队友活动和列表视图结构。 | `SessionTaskRecord`、`SessionTaskView`、`SessionTaskListView`、`SessionTaskStatus` |
| `task.ts` | session task 的业务逻辑和持久化。创建/更新/替换任务，维护 blocks/blockedBy 双向依赖，校验循环依赖和状态流转，生成按 owner/current/next/blocked 汇总的任务视图。 | `listSessionTasks()`、`getSessionTask()`、`createSessionTasks()`、`updateSessionTask()`、`replaceTasksFromState()` |
| `subtask.ts` | 子代理任务生命周期。创建子 session，启动指定 agent/model 的 delegated prompt，可前台等待或后台运行；完成后推断状态/摘要，并可把后台结果作为内部通知写回父 session。 | `startSubtask()`、`readSubtask()`、`listSubtasksByParentSession()`、`cancelSubtask()` |
| `diff-summary.ts` | 纯函数 diff 摘要工具。把文件 diff 压缩成 additions/deletions/files 统计、标题、预览正文。 | `summarizeSnapshotFileDiffs()`、`collectDiffStats()`、`buildDiffSummary()`、`buildDetailedDiffSummary()` |
| `diff.ts` | session/snapshot 相关 diff 计算。查找 session 起始 snapshot 或最新 user snapshot，并基于当前 workspace snapshot 计算简略或详细 diff。 | `computeSessionDiffSummary()`、`computeSessionDetailedDiff()`、`findEarliestSessionSnapshot()`、`findLatestUserMessageWithSnapshot()` |

## Prompt 与辅助能力

| 文件 | 主要作用 | 关键入口/导出 |
| --- | --- | --- |
| `prompt-presets.ts` | prompt preset 管理。登记内置 prompt 文本，支持读取、选择、覆盖、创建/更新/删除自定义 preset，并从全局配置解析当前 system/plan prompt。 | `getResolvedPromptPresetContent()`、`getPromptPresetSelection()`、`updatePromptPresetSelection()`、`listPromptPresetSummaries()`、`createPromptPreset()`、`updatePromptPreset()` |
| `title.ts` | 自动生成 session 标题。基于首轮用户文本/附件名构造标题 prompt，优先使用配置里的 small model，失败或超时时回退到用户输入截断标题。 | `generateSessionTitle()`、`internal` |
| `tool-result-persistence.ts` | 大型工具输出持久化。超过阈值的工具输出保存到 state 目录，只把预览和读取提示放入上下文，同时清理 metadata 中可能过大的字段。 | `maybePersistToolResult()`、`readPersistedOutputMetadata()`、`removeSessionOutputDirectory()` |
| `shell.ts` | 当前没有实际可用逻辑，文件内容基本是被注释掉的早期 shell command 入口草稿。 | 无有效导出 |

## prompt 子目录模板

| 文件 | 主要作用 |
| --- | --- |
| `prompt/default.txt` | 默认系统提示词。定义 Anybox/opencode 风格的工程任务行为、沟通风格、工具使用、修改代码、验证、输出长度等基础规则。当前 `system-default` preset 使用它。 |
| `prompt/plan.txt` | plan agent 的附加提示词。强调 Plan Mode 只读、先分析和形成计划，不做文件修改。当前 `plan-mode` preset 使用它。 |
| `prompt/plan-reminder-anthropic.txt` | 面向 Anthropic 规划模式的提醒模板，内容是更完整的 plan workflow 和只读约束，目前作为 helper preset 注册备用。 |
| `prompt/trinity.txt` | 另一套较完整的 opencode 风格系统提示词模板，注册为 provider-trinity 备用 preset。 |
| `prompt/anthropic.txt`、`prompt/beast.txt`、`prompt/codex.txt`、`prompt/gemini.txt`、`prompt/gpt.txt`、`prompt/kimi.txt` | provider-specific prompt 占位模板，当前文本很短，主要用于预留不同 provider 的自定义提示入口。 |

## 现有 Markdown 文档

| 文件 | 主要作用 |
| --- | --- |
| `spec.md` | 记录 session 主链路的执行规格，描述 prompt、loop、tools、processor、message 转换等实际路径。 |
| `SESSION_ARCHITECTURE.md` | 早期/概念层架构说明，描述 session 模块边界、组件划分和状态机。 |
| `processor.fullstream.md` | 针对 processor 消费 fullStream 的设计或说明文档。 |
| `PLAN_MODE_TOOLS_DESIGN.md` | Plan Mode 工具设计相关文档。 |

## 阅读建议

如果要理解一次用户输入如何变成模型回复，优先读：

1. `prompt.ts`
2. `context-window.ts`
3. `message.ts`
4. `resolve-tools.ts`
5. `llm.ts`
6. `processor.ts`
7. `runtime-event.ts`、`event-store.ts`、`projector.ts`

如果要理解数据落库和会话管理，优先读 `session.ts`、`message.ts`、`event-store.ts`。

如果要理解任务拆解和子代理，优先读 `task-schema.ts`、`task.ts`、`subtask.ts`、`system.ts`。
