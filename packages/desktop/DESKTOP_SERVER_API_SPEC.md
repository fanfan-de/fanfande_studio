# Desktop <-> Server API Spec

最后更新: 2026-04-01  
适用范围: `packages/desktop`

## 1. 目标

这份文档描述 `desktop renderer -> preload -> electron main -> fanfandeagent server` 的对接契约。

这份文档负责：

- 说明 renderer 可调用的 `window.desktop` 接口
- 标记哪些接口是纯桌面能力，哪些接口会打到 server
- 说明每个接口对应的 IPC 通道和 server route
- 记录当前已实现、部分实现、规划中的前后端联动能力

这份文档不负责：

- UI 视觉和交互细节
- Electron 本地能力的完整设计
- server 内部模块实现细节

server 侧配套文档：

- `packages/fanfandeagent/src/server/DESKTOP_SERVER_API_SPEC.zh.md`

## 2. 对接原则

1. Renderer 不直接 `fetch` server。
2. Renderer 只调用 `window.desktop.*`。
3. Preload 只做安全暴露和转发，不写业务逻辑。
4. Electron main 负责调系统能力、调 server HTTP/SSE、把返回值整理成 renderer 需要的结构。
5. 新增前后端联动需求时，必须同时更新本文件和 server 侧 spec。

## 3. 状态约定

- `已实现`: 前端、IPC、server 已打通，当前可用。
- `部分实现`: 有部分链路存在，但不等价于目标需求，不能当作完整能力使用。
- `规划中`: 还未实现，只在 spec 中定义目标契约。

## 4. 当前接口总览

### 4.1 纯桌面能力

| `window.desktop` 方法 | IPC 通道 | server 依赖 | 状态 | 用途 |
| --- | --- | --- | --- | --- |
| `getInfo()` | `desktop:get-info` | 否 | 已实现 | 读取平台/Electron/Node 版本 |
| `getWindowState()` | `desktop:get-window-state` | 否 | 已实现 | 读取窗口最大化状态 |
| `showMenu(menuKey, anchor?)` | `desktop:show-menu` | 否 | 已实现 | 弹出原生菜单 |
| `windowAction(action)` | `desktop:window-action` | 否 | 已实现 | 最小化/最大化/关闭 |
| `getAgentConfig()` | `desktop:get-agent-config` | 否 | 已实现 | 读取 desktop 侧 agent 配置 |
| `pickProjectDirectory()` | `desktop:pick-project-directory` | 否 | 已实现 | 打开系统文件夹选择器 |
| `onWindowStateChange(listener)` | event subscription | 否 | 已实现 | 订阅窗口状态变化 |

### 4.2 会打到 server 的接口

| `window.desktop` 方法 | IPC 通道 | server route | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| `getAgentHealth()` | `desktop:agent-health` | `GET /healthz` | 已实现 | 检查 server 是否可达 |
| `listProjectWorkspaces()` | `desktop:list-project-workspaces` | `GET /api/projects` + `GET /api/projects/:id/sessions` | 已实现 | 启动时初始化 sidebar 项目树 |
| `createProjectWorkspace({ directory })` | `desktop:create-project-workspace` | `POST /api/projects` + `GET /api/projects/:id/sessions` | 已实现 | 从目录创建项目并插入 sidebar |
| `createAgentSession({ directory? })` | `desktop:agent-create-session` | `POST /api/sessions` | 部分实现 | 当前只在首次发送消息时惰性创建 backend session，不是 sidebar 正式的新建 session 接口 |
| `createProjectSession({ projectID, ... })` | `desktop:create-project-session` | `POST /api/projects/:id/sessions` | 已实现 | 在当前 project 下创建一个真正持久化的 session |
| `deleteProjectWorkspace({ projectID })` | `desktop:delete-project-workspace` | `DELETE /api/projects/:id` | 已实现 | 删除 project，并级联删除其 sessions/messages/parts |
| `deleteAgentSession({ sessionID })` | `desktop:delete-agent-session` | `DELETE /api/sessions/:id` | 已实现 | 删除单个 session，并级联删除其 messages/parts |
| `streamAgentMessage({ streamID, sessionID, text, system?, agent? })` | `desktop:agent-stream-message` | `POST /api/sessions/:id/messages/stream` | 已实现 | 发送消息并把 SSE 增量实时转发给 renderer |
| `onAgentStreamEvent(listener)` | event subscription | `POST /api/sessions/:id/messages/stream` | 已实现 | 订阅 main 转发的 agent SSE 事件 |
| `sendAgentMessage({ sessionID, text, system?, agent? })` | `desktop:agent-send-message` | `POST /api/sessions/:id/messages/stream` | 已实现 | 发送消息并消费 SSE |

## 5. 核心数据模型

### 5.1 Sidebar 项目树

```ts
interface LoadedSessionSnapshot {
  id: string
  projectID: string
  directory: string
  title: string
  created: number
  updated: number
}

interface LoadedProjectWorkspace {
  id: string
  worktree: string
  name?: string
  created: number
  updated: number
  sessions: LoadedSessionSnapshot[]
}
```

用途：

- `listProjectWorkspaces()`
- `createProjectWorkspace()`
- 未来的 `createProjectSession()` 返回值也应可直接映射到这个结构

### 5.2 Agent SSE 事件

```ts
interface AgentStreamEvent {
  event: string
  data: unknown
}

interface AgentStreamIPCEvent extends AgentStreamEvent {
  streamID: string
}
```

当前 renderer 重点消费：

- `started`
- `error`
- `delta`
- `part`
- `done`

## 6. 当前已实现链路

### 6.1 启动时加载 sidebar 项目树

时序：

1. `App.tsx` 挂载。
2. `useEffect()` 调 `window.desktop.listProjectWorkspaces()`。
3. preload 转发到 `desktop:list-project-workspaces`。
4. main 请求 `GET /api/projects`。
5. main 对每个 project 请求 `GET /api/projects/:id/sessions`。
6. main 聚合为 `LoadedProjectWorkspace[]`。
7. renderer 用 `mapLoadedWorkspaces()` 刷新 sidebar。
8. 如果失败，保留本地 `seedWorkspaces` 作为 fallback。

### 6.2 从 sidebar 新建 project

时序：

1. 用户点击 sidebar 顶部文件夹按钮。
2. renderer 调 `window.desktop.pickProjectDirectory()`。
3. main 打开系统文件夹选择器。
4. renderer 调 `window.desktop.createProjectWorkspace({ directory })`。
5. main 请求 `POST /api/projects`。
6. main 再请求 `GET /api/projects/:id/sessions`，补齐完整 workspace。
7. renderer 把新 workspace 插入当前 sidebar。

### 6.3 当前消息发送链路

时序：

1. 用户在某个 UI session 中发送消息。
2. 如果当前 UI session 还没有 backend session id，renderer 会先调 `window.desktop.createAgentSession({ directory })`。
3. main 请求 `POST /api/sessions`。
4. renderer 把返回的 backend session id 暂存到本地 `agentSessions` 映射。
5. renderer 先为当前消息插入一条占位 assistant turn，并生成 `streamID`。
6. renderer 调 `window.desktop.streamAgentMessage(...)`。
7. main 请求 `POST /api/sessions/:id/messages/stream`。
8. main 逐块读取 SSE，并通过 `onAgentStreamEvent()` 把 `started/delta/part/done/error` 转发给 renderer。
9. renderer 将这些事件增量写回同一条 assistant turn。

兼容兜底：

1. 如果 preload 没有暴露流式接口，renderer 回退到 `window.desktop.sendAgentMessage(...)`。
2. main 请求 `POST /api/sessions/:id/messages/stream`。
3. main 读取完整 SSE 文本。
4. renderer 在请求结束后一次性组装 assistant turn。

说明：

- 这条链路已经可以“发送消息”。
- 但这里的 session 创建是消息发送前的惰性创建，不等价于 sidebar 的“显式新建 session”。

## 7. 当前已知缺口

### 7.1 `createAgentSession()` 仍然是消息发送链路的兜底接口

当前 `createAgentSession({ directory? })` 仍保留为“当 UI session 还没有 backend session id 时，由消息发送链路兜底创建”的兼容接口。

它不是 sidebar 的主创建接口，正式的 sidebar 新建 session 现在应使用 `createProjectSession({ projectID })`。

### 7.2 当前还没有 session 历史消息回放

启动加载 sidebar 时，只会拉取 project 和 session 列表，不会同步拉取每个 session 的消息历史。

当前行为：

- 已存在 session 会显示在 sidebar 中
- 打开后线程区显示 `Session loaded` 占位
- 真正的消息内容仍需后续补充单独接口

## 8. 已实现的新增接口

### 8.1 在 project 下新建 session

行为：

- 用户在 sidebar 的某个 project 下点击“新建 session”
- 前端调用 `window.desktop.createProjectSession({ projectID })`
- 后端写入 `sessions` 表
- 前端立即把新 session 显示到该 project 下

建议 desktop 接口：

```ts
createProjectSession(input: {
  projectID: string
  title?: string
  directory?: string
}): Promise<{
  session: LoadedSessionSnapshot
  requestId?: string
}>
```

对应 IPC：

- `desktop:create-project-session`

对应 server route：

- `POST /api/projects/:id/sessions`

当前前端行为：

- 成功后把 `session` 插入对应 `workspace.sessions`
- 同步初始化 `conversations[session.id]`
- 把当前选中切到新 session

### 8.2 删除一个 project

行为：

- 用户在 sidebar 删除某个 project
- server 删除 project 及其关联 sessions/messages/parts
- 前端把整个 project 从 sidebar 移除

建议 desktop 接口：

```ts
deleteProjectWorkspace(input: {
  projectID: string
}): Promise<{
  projectID: string
  deletedSessionIDs: string[]
  requestId?: string
}>
```

对应 IPC：

- `desktop:delete-project-workspace`

对应 server route：

- `DELETE /api/projects/:id`

当前前端行为：

- 删除该 `workspace`
- 清理本地 `conversations`
- 清理 `agentSessions`
- 如果删掉的是当前激活项，需要重新选择下一个可用 session

### 8.3 删除一个 session

行为：

- 用户在某个 project 下删除单个 session
- server 删除 `sessions/messages/parts`
- 前端只移除该 session，不影响 project 本身

建议 desktop 接口：

```ts
deleteAgentSession(input: {
  sessionID: string
}): Promise<{
  sessionID: string
  projectID: string
  requestId?: string
}>
```

对应 IPC：

- `desktop:delete-agent-session`

对应 server route：

- `DELETE /api/sessions/:id`

当前前端行为：

- 从对应 `workspace.sessions` 移除该 session
- 清理 `conversations[sessionID]`
- 清理 `agentSessions[sessionID]`
- 如果删掉的是当前激活 session，需要重新选择同 project 的其他 session 或下一个 project

## 9. 变更检查清单

新增或修改任意 desktop <-> server 接口时，至少检查：

1. `packages/desktop/src/preload/index.ts`
2. `packages/desktop/src/main/ipc.ts`
3. `packages/desktop/src/main/agent-client.ts`
4. `packages/desktop/src/renderer/src/App.tsx`
5. `packages/desktop/src/renderer/src/App.test.tsx`
6. `packages/fanfandeagent/src/server/routes/*.ts`
7. `packages/fanfandeagent/Test/server.api.test.ts`
8. 本文档
9. `packages/fanfandeagent/src/server/DESKTOP_SERVER_API_SPEC.zh.md`

## 10. 新需求记录模板

~~~md
## X.Y 需求名

状态:

- 已实现 / 部分实现 / 规划中

目标:

- 用户动作
- 前端预期
- server 预期

新增或修改的 `window.desktop` 接口:

```ts
methodName(input): Promise<...>
```

对应 IPC:

- `desktop:...`

对应 server route:

- `METHOD /api/...`

请求:

```json
{}
```

响应:

```json
{}
```

前端落地要求:

- renderer 如何更新 state
- 是否要刷新 sidebar
- 是否要切换当前选中项

测试:

- desktop renderer test
- desktop main/ipc test
- server route test
~~~

## 11. 测试指令

当前已有联动变更的基础验证命令：

```bash
cd C:\Projects\fanfande_studio\packages\desktop
npm run typecheck
npm run test

cd C:\Projects\fanfande_studio\packages\fanfandeagent
bun test Test/server.api.test.ts
```
