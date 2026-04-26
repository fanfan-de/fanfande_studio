# Fanfande Monitor 使用说明书

Fanfande Monitor 是一个独立运行的 Vite 前端应用，用来查看本机 `fanfandeagent` server 的运行状态、进程指标、运行会话、最近错误和实时日志。

Monitor 只负责检测、展示和查询状态，不会自动重启 server，也不会修复进程。

## 适用场景

- 确认 agent server 是否在线。
- 查看 server uptime、PID、内存占用和运行会话数量。
- 排查最近的 ERROR 日志。
- 按 level、service 或文本搜索 server 日志。
- 通过 SSE 实时观察新日志，并可临时暂停前端日志流。
- 通过 SSE 接收 server 状态快照，不依赖前端定时轮询。

## 启动前准备

Monitor 默认连接：

```text
http://127.0.0.1:4096
```

请先确认 `fanfandeagent` server 已启动，并且下面接口可访问：

```text
GET http://127.0.0.1:4096/healthz
```

兼容的健康检查响应仍为：

```json
{ "ok": true }
```

在当前 server 包装下，接口通常会被统一包在 JSON envelope 中返回。

## 启动 Monitor

在仓库根目录运行：

```bash
corepack pnpm monitor:dev
```

或者直接运行 monitor 包：

```bash
corepack pnpm --filter fanfande-monitor dev
```

默认本地地址：

```text
http://127.0.0.1:4174/
```

生产构建：

```bash
corepack pnpm monitor:build
```

预览构建产物：

```bash
corepack pnpm monitor:preview
```

## 首次连接

打开 monitor 页面后，顶部的 `Agent base URL` 输入框默认是：

```text
http://127.0.0.1:4096
```

如果 agent server 运行在其他端口，请输入新的 base URL，然后点击 `Connect`。

Monitor 会把最近一次连接地址保存到浏览器 `localStorage`。下次打开页面时会自动使用该地址。

## 页面区域说明

### 顶部状态卡

顶部状态卡展示 server 的核心状态：

- `Server`：当前 server 是否在线。
- `Snapshot`：状态快照请求是否成功。
- `Log stream`：实时日志 SSE 连接状态。
- `Running sessions`：当前正在运行的会话数量。
- `Uptime`：server 进程已运行时间。
- `Heap used`：Node/Bun 进程 heap 已使用内存。

常见状态：

- `ready`：状态快照加载成功。
- `live`：日志流已连接。
- `paused`：前端暂停接收日志流。
- `error`：请求失败或日志流连接异常。

### Running sessions

该区域展示当前 server 内部的运行会话。

每条会话包含：

- 会话标题或 session ID。
- 工作目录。
- 当前阶段或 turn 状态。
- 已运行时长。
- 使用中的 model。
- 最近诊断错误，如果存在。

如果没有正在运行的会话，会显示空状态。

### Recent failures

该区域展示内存日志缓冲区中的最近 ERROR 级别日志。

用于快速判断 server 最近是否出现失败、异常或请求错误。

### Live server output

该区域展示 server 内存日志。

支持以下操作：

- `Pause stream`：暂停前端 SSE 日志流。
- `Resume stream`：恢复实时日志流。
- `Clear visible logs`：清空当前页面上可见的日志，不会清空 server 内存日志。
- `Auto scroll`：新日志到达时自动滚动到底部。
- `Copy raw log line`：复制某条日志的原始文本。

## 日志过滤

日志列表支持三个过滤条件。

### Level

可选择：

- `All`
- `DEBUG`
- `INFO`
- `WARN`
- `ERROR`

选择后，日志查询接口和 SSE 流都会使用该 level 过滤。

### Service

输入 service 名称，例如：

```text
server
server.debug
session
project
```

输入框会根据当前日志中出现过的 service 提供候选项。

### Search

文本搜索会匹配日志消息和常用标识字段，例如：

- message
- raw
- requestId
- sessionID
- projectID

适合按请求 ID、session ID 或关键错误文本定位日志。

## Server API

Monitor 使用以下 server-native API。

### 健康检查

```text
GET /healthz
```

保持兼容，继续表示 server 基础可用性。

### 状态快照

```text
GET /api/debug/status
```

返回内容包括：

- `ok`
- `generatedAt`
- `process.pid`
- `process.uptimeMs`
- `process.memory`
- `logging`
- `runningSessions.count`
- `recentErrors`

### 状态快照流

```text
GET /api/debug/status/stream
```

使用 SSE：

- 事件名：`status`
- `data.status`：与 `/api/debug/status` 相同的状态快照。
- `data.runtime`：与 `/api/debug/runtime` 相同的运行会话快照。
- server 会在连接建立时立即推送一次快照。
- 后续由 server 每 1 秒主动推送一次快照，让 uptime、heap 等指标持续更新。
- 日志、RunningState 变化和 runtime event 也会触发即时快照推送。

Monitor 自动状态更新依赖这个接口，不再使用前端定时 pull。

### 日志查询

```text
GET /api/debug/logs?level=&service=&q=&limit=
```

默认 `limit` 为 `200`，最大 `1000`。

返回：

```json
{ "logs": [] }
```

### 实时日志流

```text
GET /api/debug/logs/stream?level=&service=&q=
```

使用 SSE：

- 事件名：`log`
- `data`：单条 `LogEntry`
- server 会定期发送 keepalive comment，避免空闲连接被误判为断开。

## 日志数据说明

每条日志为 `LogEntry`：

```ts
type LogEntry = {
  id: string
  timestamp: number
  level: "DEBUG" | "INFO" | "WARN" | "ERROR"
  service?: string
  message: string
  raw: string
  requestId?: string
  sessionID?: string
  projectID?: string
  extra?: Record<string, unknown>
}
```

server 默认只保留最近 `1000` 条内存日志。

日志不会读取或 tail 本地日志文件。刷新 server 进程后，内存日志会丢失。

## 敏感信息脱敏

server 日志模块会对常见敏感 key 做基础脱敏，例如：

- `password`
- `token`
- `apiKey`
- `authorization`
- `secret`

脱敏后的值会显示为：

```text
[REDACTED]
```

这只是基础保护，不应把 monitor 作为公网 observability 系统使用。

## 常见问题

### 页面显示 offline

确认 agent server 是否启动：

```bash
curl http://127.0.0.1:4096/healthz
```

如果 server 使用了其他端口，请修改顶部 `Agent base URL` 并点击 `Connect`。

### Log stream 显示 error

常见原因：

- agent server 未启动。
- base URL 填写错误。
- `/api/debug/logs/stream` 被代理或浏览器策略中断。
- server 正在重启。

可以点击 `Refresh` 重新拉取状态，也可以点 `Resume stream` 重新建立日志流。

### 暂停日志流后 server 还在产生日志吗

是的。

`Pause stream` 只暂停当前浏览器页面的 SSE 连接，不影响 server 写日志，也不会清空 server 内存日志。

恢复后，页面会重新连接日志流；状态刷新会继续通过 `/api/debug/logs` 拉取当前过滤条件下的最近日志。

### Clear visible logs 会删除 server 日志吗

不会。

它只清空当前页面上的可见日志列表。server 内存环形缓冲区仍然保留最近日志。

### 为什么刷新后只能看到最近一部分日志

server 只保留最近 `1000` 条内存日志，monitor 默认查询最近 `200` 条。

这是本地诊断工具的设计取舍，不用于长期日志归档。

## 开发验证

Server API 测试：

```bash
cd packages/fanfandeagent
bun test Test/server.api.test.ts
```

Monitor 构建：

```bash
corepack pnpm --filter fanfande-monitor build
```

类型检查：

```bash
corepack pnpm --filter fanfande-monitor typecheck
```
