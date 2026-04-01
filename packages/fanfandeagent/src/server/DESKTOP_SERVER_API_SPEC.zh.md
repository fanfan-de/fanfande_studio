# Desktop 对接 API 规范（Server 侧）

最后更新: 2026-04-01  
适用范围: `packages/fanfandeagent/src/server`

## 1. 目标

这份文档描述 fanfandeagent 暴露给 desktop 的 HTTP 和 SSE 契约。

这份文档负责：

- 说明 desktop 当前会调用哪些 route
- 说明每个 route 的请求体、响应体、错误码
- 标记哪些 route 已实现，哪些只是部分可用，哪些仍在规划
- 作为后续 desktop <-> server 联动需求的 server 侧 SSOT

这份文档不负责：

- server 内部模块拆分
- Electron 本地能力
- renderer 侧 UI 状态实现

前端配套文档：

- `packages/desktop/DESKTOP_SERVER_API_SPEC.md`

## 2. 基本约束

1. 所有 desktop 消费的 HTTP 接口都走统一 envelope。
2. 所有响应都带 `requestId`。
3. 新增 desktop 对接 route 时，必须同步更新本文件和 desktop 侧 spec。
4. route handler 保持轻量，业务逻辑尽量下沉到 `project`、`session` 等模块。
5. desktop 当前不直接请求 server，请求发起方是 Electron main。

## 3. 统一响应格式

成功：

```json
{
  "success": true,
  "data": {},
  "requestId": "uuid"
}
```

失败：

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "human readable message"
  },
  "requestId": "uuid"
}
```

## 4. route 状态总览

| Route | desktop 消费方 | 状态 | 用途 |
| --- | --- | --- | --- |
| `GET /healthz` | `desktop:get-agent-health` | 已实现 | 检查 server 可达性 |
| `GET /api/projects` | `desktop:list-project-workspaces` | 已实现 | 获取 project 列表 |
| `POST /api/projects` | `desktop:create-project-workspace` | 已实现 | 从目录创建或识别 project |
| `GET /api/projects/:id/sessions` | `desktop:list-project-workspaces` / `desktop:create-project-workspace` | 已实现 | 获取 project 下 session 列表 |
| `POST /api/sessions` | `desktop:agent-create-session` | 部分实现 | 当前只支持按 directory 创建 session，用于发消息前兜底，不等价于 sidebar 新建 session |
| `POST /api/projects/:id/sessions` | `desktop:create-project-session` | 已实现 | 在某个 project 下正式创建 session |
| `DELETE /api/projects/:id` | `desktop:delete-project-workspace` | 已实现 | 删除 project 及其关联数据 |
| `GET /api/sessions/:id` | 当前 desktop 未直接消费 | 已实现 | 获取单个 session |
| `DELETE /api/sessions/:id` | `desktop:delete-agent-session` | 已实现 | 删除单个 session 及其关联数据 |
| `POST /api/sessions/:id/messages/stream` | `desktop:agent-stream-message` / `desktop:agent-send-message` | 已实现 | 发送消息并返回 SSE |

## 5. 当前已实现 route 细则

### 5.1 `GET /healthz`

用途：

- desktop 检查 server 是否在线

请求体：

- 无

成功响应：

```json
{
  "success": true,
  "data": {
    "ok": true
  },
  "requestId": "uuid"
}
```

### 5.2 `GET /api/projects`

用途：

- desktop 启动时加载 sidebar 项目列表

请求体：

- 无

成功响应 `data`：

```ts
Array<{
  id: string
  worktree: string
  name?: string
  created: number
  updated: number
  sandboxes: string[]
}>
```

当前 desktop 消费方式：

- main 拿到 project 列表后，会继续逐个请求 `GET /api/projects/:id/sessions`

### 5.3 `POST /api/projects`

用途：

- desktop 用户选择一个文件夹后创建 project

请求体：

```json
{
  "directory": "C:\\Projects\\Example"
}
```

当前行为：

1. 校验 `directory` 非空。
2. 调用 `Project.fromDirectory(directory)`。
3. 返回 project 信息。

成功响应 `data`：

```ts
{
  id: string
  worktree: string
  name?: string
  created: number
  updated: number
  initialized?: number
  sandboxes: string[]
}
```

错误码：

- `INVALID_PAYLOAD`

说明：

- 这个接口只保证“project 被识别并记录”。
- desktop 为了补齐 sidebar 结构，还会继续请求 `GET /api/projects/:id/sessions`。

### 5.4 `GET /api/projects/:id/sessions`

用途：

- desktop 构建 sidebar 项目树

请求体：

- 无

成功响应 `data`：

```ts
Array<{
  id: string
  projectID: string
  directory: string
  title: string
  version: string
  time: {
    created: number
    updated: number
  }
}>
```

错误码：

- `PROJECT_NOT_FOUND`

### 5.5 `POST /api/sessions`

用途：

- 当前给消息发送链路兜底创建 backend session

请求体：

```json
{
  "directory": "C:\\Projects\\Example"
}
```

当前行为：

1. 校验 `directory` 非空。
2. 调用 `Project.fromDirectory(directory)`，确保归属 project 存在。
3. 调用 `Session.createSession({ directory, projectID })`。
4. 返回 session。

成功响应 `data`：

```ts
{
  id: string
  projectID: string
  directory: string
  title: string
  version: string
  time: {
    created: number
    updated: number
  }
}
```

错误码：

- `INVALID_PAYLOAD`

当前限制：

- 必须传 `directory`
- 不能表达“在 sidebar 当前 project 下新建 session”
- desktop 当前没有在 sidebar 点击“新建 session”时调用这个接口

结论：

- 这个接口当前是“部分实现”，保留用于发消息前兜底创建 session
- 它不能替代正式的 `POST /api/projects/:id/sessions`

### 5.6 `GET /api/sessions/:id`

用途：

- 当前 desktop 未直接使用
- 可作为单 session 查询接口保留

错误码：

- `SESSION_NOT_FOUND`

### 5.7 `POST /api/sessions/:id/messages/stream`

用途：

- desktop 发送消息并消费 SSE
- 主链路由 `desktop:agent-stream-message` 逐块转发到 renderer，`desktop:agent-send-message` 保留为整包兜底

请求体：

```json
{
  "text": "hello",
  "system": "optional",
  "agent": "optional",
  "model": {
    "providerID": "optional",
    "modelID": "optional"
  }
}
```

响应类型：

- `text/event-stream`

当前已定义事件：

| event | 说明 |
| --- | --- |
| `started` | 开始处理本次消息 |
| `delta` | 文本或 reasoning 增量 |
| `part` | 非增量 part 更新 |
| `done` | 处理完成 |
| `error` | 处理失败 |

`delta` 示例：

```json
{
  "sessionID": "ses_xxx",
  "messageID": "msg_xxx",
  "partID": "part_xxx",
  "kind": "text",
  "delta": "hello",
  "text": "hello"
}
```

错误码：

- `INVALID_PAYLOAD`
- `SESSION_NOT_FOUND`

## 6. 当前已知缺口

### 6.1 `POST /api/sessions` 仍然只是兜底接口

虽然 `POST /api/projects/:id/sessions` 已经实现，但 `POST /api/sessions` 仍保留为按 `directory` 创建 session 的兼容入口，主要用于消息发送链路的兜底。

当前建议：

- sidebar 显式新建 session: `POST /api/projects/:id/sessions`
- 兜底创建 backend session: `POST /api/sessions`

### 6.2 当前还没有 session 历史消息查询接口

desktop 启动时只拉取 session 列表，不拉消息历史。

后续仍需要补：

- `GET /api/sessions/:id/messages`
- 或等价的历史回放接口

## 7. 已实现的 route 契约

### 7.1 `POST /api/projects/:id/sessions`

行为：

- 在某个 project 下正式创建 session

请求体：

```json
{
  "title": "optional",
  "directory": "optional"
}
```

当前行为：

1. 校验 `projectID` 存在。
2. 解析 session 目录：
   - `body.directory ?? project.worktree`
3. 校验目录属于该 project。
4. 调用 `Session.createSession({ projectID, directory })`。
5. 如果传入 `title`，补充更新 session 标题。

成功响应：

```json
{
  "success": true,
  "data": {
    "id": "session_xxx",
    "projectID": "project_xxx",
    "directory": "C:\\Projects\\Example",
    "title": "New chat",
    "version": "x.y.z",
    "time": {
      "created": 0,
      "updated": 0
    }
  },
  "requestId": "uuid"
}
```

错误码：

- `PROJECT_NOT_FOUND`
- `INVALID_PAYLOAD`
- `DIRECTORY_NOT_IN_PROJECT`

### 7.2 `DELETE /api/projects/:id`

行为：

- 删除一个 project，并级联删除其数据

当前行为：

1. 校验 project 存在。
2. 找出该 project 下所有 sessions。
3. 删除 project。
4. 删除这些 sessions。
5. 删除这些 sessions 关联的 messages 和 parts。

成功响应：

```json
{
  "success": true,
  "data": {
    "projectID": "project_xxx",
    "deletedSessionIDs": ["session_a", "session_b"]
  },
  "requestId": "uuid"
}
```

错误码：

- `PROJECT_NOT_FOUND`

### 7.3 `DELETE /api/sessions/:id`

行为：

- 删除单个 session，并级联删除其消息数据

当前行为：

1. 校验 session 存在。
2. 删除 session。
3. 删除关联 messages。
4. 删除关联 parts。

成功响应：

```json
{
  "success": true,
  "data": {
    "sessionID": "session_xxx",
    "projectID": "project_xxx"
  },
  "requestId": "uuid"
}
```

错误码：

- `SESSION_NOT_FOUND`

## 8. 变更检查清单

新增或修改 desktop 对接 route 时，至少检查：

1. `packages/fanfandeagent/src/server/routes/projects.ts`
2. `packages/fanfandeagent/src/server/routes/session.ts`
3. `packages/fanfandeagent/src/project/project.ts`
4. `packages/fanfandeagent/src/session/session.ts`
5. `packages/fanfandeagent/Test/server.api.test.ts`
6. 本文档
7. `packages/desktop/DESKTOP_SERVER_API_SPEC.md`

## 9. 新需求补充模板

~~~md
## X.Y 需求名

状态:

- 已实现 / 部分实现 / 规划中

目标:

- 用户动作
- desktop 预期
- server 预期

Route:

- `METHOD /api/...`

请求体:

```json
{}
```

成功响应:

```json
{}
```

错误码:

- `...`

数据约束:

- 是否持久化
- 是否级联删除
- 是否影响 sidebar 排序/选中态

测试:

- route test
- desktop 联调验证
~~~

## 10. 测试指令

当前已有对接相关的基础验证命令：

```bash
cd C:\Projects\fanfande_studio\packages\fanfandeagent
bun test Test/server.api.test.ts

cd C:\Projects\fanfande_studio\packages\desktop
npm run typecheck
npm run test
```
