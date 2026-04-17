# Fanfande Agent Debugging

## Goal

这个项目的调试需要同时解决三件事：

1. 快速确认 agent 进程是否健康
2. 快速看到某个 session 当前跑到哪一步
3. 在出错后能够回放最近的 runtime 事件和日志

当前建议把调试分成四层。

## Layer 1: Process And Health

启动服务时默认同时输出到 `stderr` 和日志文件。

常用环境变量：

```powershell
$env:FanFande_LOG_LEVEL="DEBUG"
$env:FanFande_LOG_PRINT="1"
$env:FanFande_LOG_FILE="1"
$env:FanFande_DEBUG_STREAM_STDOUT="1"
```

启动：

```powershell
cd packages/fanfandeagent
bun run dev:server
```

基础健康检查：

```powershell
curl http://127.0.0.1:4096/healthz
```

## Layer 2: Runtime Snapshot

新增了两个调试入口：

```text
GET /api/debug/runtime
GET /api/debug/sessions/:id/runtime
```

用途：

- `/api/debug/runtime`
  - 看当前有哪些 session 正在运行
  - 看当前活跃 turn
  - 看日志输出配置
  - 看每个运行中 session 最近的 runtime event

- `/api/debug/sessions/:id/runtime`
  - 聚焦单个 session
  - 看运行中状态
  - 看活跃 turn
  - 看最近事件摘要

示例：

```powershell
curl "http://127.0.0.1:4096/api/debug/runtime?limit=5"
curl "http://127.0.0.1:4096/api/debug/sessions/<session-id>/runtime?limit=20"
```

## Layer 3: Event Replay

如果你需要看更细的前端流式事件，继续使用现有 SSE：

```text
GET /api/sessions/:id/events/stream
POST /api/sessions/:id/messages/stream
POST /api/sessions/:id/resume/stream
```

推荐用法：

1. 先看 `/api/debug/sessions/:id/runtime` 确认 turn 和最近事件
2. 再接 `/events/stream` 看实时流
3. 如果卡在权限审批，重点看 `tool.call.waiting_approval`

## Layer 4: Desktop Trace

桌面端已经有一层现成的调试能力：

- `Settings > Appearance > Show agent debug trace`

打开后可以直接在线程里看到：

- 隐藏的 backend runtime metadata
- tool call 状态变化
- permission 等待态
- part / message / stream 标识

## Recommended Workflow

定位问题时按这个顺序：

1. `healthz`
   - 先确认服务存活
2. `/api/debug/runtime`
   - 看有没有 session 卡住
3. `/api/debug/sessions/:id/runtime`
   - 看最近事件停在 `turn.started`、`tool.call.waiting_approval`、`turn.failed` 还是 `turn.completed`
4. 日志文件
   - 结合 `logging.path` 看结构化日志
5. 桌面端 debug trace
   - 对照 UI 展示和后端事件是否一致

## What To Watch

几个最关键的卡点信号：

- 长时间只有 `turn.started`
  - 通常是 prompt loop 或模型请求没真正推进
- 卡在 `tool.call.waiting_approval`
  - 权限流没有被恢复
- 出现 `turn.failed`
  - 先看 `error`，再看前一条 tool / part 事件
- `running=true` 但没有新事件
  - 优先查日志，再查外部 provider / tool
