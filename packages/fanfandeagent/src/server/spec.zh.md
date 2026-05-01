# Server 层架构说明

本文说明 `src/server` 当前的实现结构，重点解释请求如何进入系统、路由层如何组织、业务编排放在哪里，以及后续维护时应该遵守的边界。

## 1. 模块定位

`server` 层是 `fanfandeagent` 暴露给桌面端和本地调用方的 HTTP/WebSocket API 层。

它负责：

- 启动 Bun HTTP server。
- 创建 Hono 应用。
- 挂载 `/api/*` 路由。
- 生成 `requestId`、处理 CORS、记录请求日志。
- 统一成功/失败响应格式。
- 把 HTTP 输入转换为领域模块可用的调用。
- 为 Session SSE 和 PTY WebSocket 提供流式传输入口。

它不应该负责：

- 数据库表结构和持久化细节。
- provider、project、session、permission、skill 等领域规则本身。
- LLM 执行、工具执行、权限判定等核心业务实现。

领域逻辑仍然由 `#session/*`、`#project/*`、`#provider/*`、`#permission/*`、`#pty/*`、`#config/*` 等模块承担。

## 2. 请求生命周期

整体调用链如下：

```text
Bun.serve
  -> createServerRuntime()
  -> Hono middleware
  -> route handler
  -> server/usecases/*
  -> domain modules
  -> JSON / SSE / WebSocket response
```

入口文件：

- `start.ts`：命令行启动入口，初始化日志，调用 `startServer()`，并注册 `SIGINT` / `SIGTERM` 优雅退出。
- `server.ts`：创建 Hono runtime、挂载中间件和路由，并管理全局 `activeServer`。

`server.ts` 中的关键函数：

- `createServerRuntime(options)`：创建 Hono app，同时返回 WebSocket runtime。
- `createServerApp(options)`：测试和纯 HTTP 场景使用，只返回 app。
- `startServer(options)`：启动 Bun server，默认监听 `127.0.0.1:4096`。
- `stopServer()`：停止当前 active server。
- `url()`：返回当前 server URL。

## 3. 全局中间件

`createServerRuntime()` 会按顺序注册三类全局行为：

1. Request ID
   - 每个请求生成一个 `crypto.randomUUID()`。
   - 写入 Hono context：`c.set("requestId", requestId)`。
   - 写入响应头：`x-request-id`。

2. CORS
   - 只作用在 `/api/*`。
   - 如果传入 `corsWhitelist`，使用白名单。
   - 否则默认允许 CORS。

3. 请求日志
   - 每个请求结束后记录：
     - method
     - path
     - status
     - duration
     - requestId

## 4. 响应与错误格式

成功响应统一为：

```json
{
  "success": true,
  "data": {},
  "requestId": "..."
}
```

失败响应统一为：

```json
{
  "success": false,
  "error": {
    "code": "INVALID_PAYLOAD",
    "message": "..."
  },
  "requestId": "..."
}
```

相关文件：

- `error.ts`
  - 定义 `ApiError(status, code, message)`。
  - `server.ts` 的 `app.onError()` 会识别 `ApiError` 并输出统一错误 envelope。
  - 非 `ApiError` 会记录日志并返回 `500 INTERNAL_ERROR`。

- `http.ts`
  - `parseJsonBody(c, schema, message, fallback?)`
    - 使用 Zod 校验 JSON body。
    - 校验失败抛出 `400 INVALID_PAYLOAD`。
    - `fallback` 用于允许空 body 的场景，例如 `{}`。
  - `parseQuery(input, schema, code, message)`
    - 使用 Zod 校验 query。
    - 校验失败抛出指定 code，通常是 `INVALID_QUERY`。
  - `ok(c, data, status?)`
    - 输出统一成功 envelope。

## 5. 路由挂载结构

`server.ts` 挂载的路由如下：

```text
GET  /
GET  /healthz

/api                     -> SettingsRoutes()
/api/debug               -> DebugRoutes()
/api/permissions         -> PermissionsRoutes()
/api/pty                 -> PtyRoutes()
/api/projects            -> ProjectRoutes()
/api/sessions            -> SessionRoutes()
```

### `/`

返回服务标识：

```json
{ "service": "fanfandeagent-api" }
```

### `/healthz`

返回健康检查：

```json
{ "ok": true }
```

## 6. Routes 与 Use Cases 分层

当前主要 HTTP 路由采用“薄 route + usecase 编排”结构：

```text
routes/*.ts
  只负责：
    - 读取 param/query/body
    - 调用 parseJsonBody / parseQuery
    - 调用 usecase
    - 返回 ok() 或 stream response

usecases/*.ts
  负责：
    - 组合领域模块
    - 处理跨模块业务流程
    - 映射领域错误到 ApiError
    - 构造 route 需要的返回 DTO
```

已经拆出的 usecase：

- `usecases/session.ts`
  - 创建/读取/删除 session。
  - archived session 的归档、恢复、删除。
  - side chat 创建、查询、上下文组装。
  - session message history。
  - session diff。
  - message stream / resume stream 的执行入口。

- `usecases/session-stream.ts`
  - SSE 格式化。
  - runtime event replay。
  - keepalive。
  - terminal runtime event 到 renderer event 的映射。
  - `createSessionExecutionStream()` 和 `createSessionEventStream()`。

- `usecases/projects.ts`
  - project 创建、查询、删除。
  - project sessions。
  - project-scoped providers/models。
  - project-scoped skills/MCP。
  - Git directory 边界校验。
  - Git capabilities、commit、push、branch、checkout、pull request。

- `usecases/settings.ts`
  - global providers/models。
  - provider auth flow / callback / API key / session。
  - global MCP servers。
  - prompt presets。
  - global skills tree/file/create/rename/delete。
  - skill 和 prompt preset 的错误映射。

尚未完全瘦身的路由：

- `routes/permissions.ts`
  - 目前仍直接编排 permission request/rule，并在 approve/deny/resolve 时可触发 `Prompt.resume()`。
  - 后续如果继续治理，应拆出 `usecases/permissions.ts`。

- `routes/pty.ts`
  - 目前直接操作 `PtyRegistry`，并在 route 中定义 WebSocket 事件处理。
  - 因为 PTY 逻辑强依赖 `upgradeWebSocket` 和 socket 生命周期，暂时保留在 route 内。
  - 后续可拆出 message encode/decode 与 session event bridge。

## 7. Session 流式响应

Session 有两类 SSE：

### Event stream

路径：

```text
GET /api/sessions/:id/events/stream
```

用途：

- 订阅某个 session 的 runtime events。
- 支持通过 query `since` 或 header `Last-Event-ID` 回放遗漏事件。
- 只监听事件，不启动新的 prompt 执行。

实现位置：

- route：`routes/session.ts`
- usecase：`usecases/session.ts`
- stream engine：`usecases/session-stream.ts`
- event source：`#session/runtime/live-stream-hub.ts`、`#session/runtime/event-store.ts`
- event mapping：`#session/stream-mapper.ts`

### Execution stream

路径：

```text
POST /api/sessions/:id/messages/stream
POST /api/sessions/:id/resume/stream
```

用途：

- 启动一次 prompt 或 resume。
- 同时订阅该 turn 的 runtime events。
- 如果执行正常产生 terminal event，直接通过 event stream 映射输出。
- 如果没有 terminal event，会 fallback 输出 `done` 或 `error`。

输入支持：

- `text`
- `questionAnswer`
- `attachments`
- `system`
- `agent`
- `skills`
- `permissionMode`
- `reasoningEffort`
- `model`

附件处理在 `usecases/session.ts` 中完成：

- 根据扩展名识别 image/file MIME。
- 读取本地文件。
- 转为 data URL。
- 组装为 `Prompt.PromptInput["parts"]`。

## 8. Project 边界校验

Project Git 路由不能直接信任调用方传入的 `directory`。

`usecases/projects.ts` 会：

1. 读取 project。
2. canonicalize project worktree 和 sandboxes。
3. canonicalize 请求中的 directory。
4. 检查 directory 是否位于 project worktree 或 sandboxes 内。
5. 对 Git 操作额外检查 repository root 也不能越界。

这保证了：

- A project 不能操作 B project 的目录。
- project 内部 symlink 指向外部 Git repo 时会被拒绝。
- worktree/sandbox 都可以作为合法边界。

相关错误：

- `PROJECT_NOT_FOUND`
- `DIRECTORY_NOT_IN_PROJECT`
- `INVALID_PAYLOAD`
- `INVALID_QUERY`

## 9. Settings 与 Project 的作用域区别

Provider、model、MCP、skill 同时存在 global 和 project 两类接口。

Global settings：

```text
/api/providers/*
/api/models
/api/model-selection
/api/mcp/servers/*
/api/prompts/*
/api/skills/*
```

Project settings：

```text
/api/projects/:id/providers/*
/api/projects/:id/models
/api/projects/:id/model-selection
/api/projects/:id/mcp/*
/api/projects/:id/skills/*
```

区别：

- global 使用 `Config.GLOBAL_CONFIG_ID`。
- project 使用具体 `projectID`。
- project routes 会先校验 project 是否存在。
- project skills 以 project worktree 为根解析。
- project MCP diagnostic 会在 `Instance.provide({ directory: project.worktree })` 中运行。

## 10. PTY WebSocket

PTY API 同时提供 JSON 和 WebSocket：

```text
POST   /api/pty
GET    /api/pty/:id
PUT    /api/pty/:id
DELETE /api/pty/:id
GET    /api/pty/:id/connect
```

`PtyRoutes()` 接收：

- `registry: PtyRegistry`
- `upgradeWebSocket`

WebSocket 行为：

- open 时发送 `ready`，包含 session info 和 cursor replay。
- PTY output 会转成 `output` message。
- PTY 状态变化会转成 `state`。
- 退出转成 `exited`。
- 删除转成 `deleted`，然后关闭 socket。
- client message 必须是 JSON text。
- 无效 client message 返回 `INVALID_MESSAGE`。

测试可通过 `createServerRuntime({ ptyRegistry })` 注入 fake registry/runtime。

## 11. 测试策略

主要测试入口：

- `Test/server.api.test.ts`
  - 覆盖主 HTTP API contract。
  - 包含 session、project、settings、provider、prompt、git 等路由。

- `Test/server.pty.test.ts`
  - 覆盖 PTY JSON API 和 WebSocket 行为。

- `Test/permission.api.test.ts`
  - 覆盖 permission approve/deny/resolve 与工具状态联动。

- `Test/server.route-refactor.test.ts`
  - 覆盖 server helper 与拆分后的 schema/error mapping。

推荐回归命令：

```bash
corepack pnpm --filter fanfandeagent exec tsc -p tsconfig.json --noEmit
corepack pnpm --filter fanfandeagent test:server
bun test Test/permission.api.test.ts
bun test Test/server.pty.test.ts
bun test Test/server.route-refactor.test.ts
```

注意：部分测试共享本地运行态或 SQLite 清理逻辑，优先串行运行关键 server 测试，避免并行造成瞬时干扰。

## 12. 后续维护约定

新增 HTTP endpoint 时优先遵守：

1. route handler 只做 HTTP 适配。
2. body 用 `parseJsonBody()`。
3. query 用 `parseQuery()`。
4. 成功 JSON 用 `ok()`。
5. 可预期业务错误抛 `ApiError`。
6. 跨模块编排放入 `server/usecases/*`。
7. 领域规则不要写进 route。
8. 不改变既有 envelope，除非同步更新桌面端和 API spec。

如果某个 route 开始出现以下特征，应拆 usecase：

- 需要调用 2 个以上领域模块。
- 需要做文件读取、目录 canonicalize、stream 组包等非 HTTP 逻辑。
- 需要映射领域错误为 API 错误。
- 单个 handler 超过约 30 行。
- 多个 handler 重复相同校验或映射。

当前 server 层的核心目标是：HTTP 边界清晰、API contract 稳定、业务编排集中、领域模块保持独立。
