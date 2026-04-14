# Desktop <-> Server API Spec

最后更新: 2026-04-02  
适用范围: `packages/desktop`

## 1. 目标

本文档描述当前 `renderer -> preload -> electron main -> fanfandeagent server` 的真实契约，重点回答三件事：

1. renderer 现在可以通过 `window.desktop` 调哪些方法。
2. 这些方法分别落到哪个 IPC 通道、哪个 server route。
3. 当前桌面端究竟是按什么数据模型和链路在跑。

本文档不负责：

1. UI 视觉和交互说明。
2. Electron 窗口生命周期的教学内容。
3. server 内部模块实现细节。

相关文档：

- 前端规范：`AI_AGENT_FRONTEND_SPEC.md`
- 架构导图：`FRONTEND_ARCHITECTURE_GUIDE.md`
- server 侧文档：`../fanfandeagent/src/server/DESKTOP_SERVER_API_SPEC.zh.md`

## 2. 对接原则

1. Renderer 不直接 `fetch` server。
2. Renderer 只调用 `window.desktop.*`。
3. Preload 只暴露安全 API，不写业务逻辑。
4. Main 负责系统能力、HTTP/SSE 请求、数据结构整形和事件转发。
5. 改动 bridge / IPC / server route 时，desktop 和 server 两侧文档必须一起更新。

## 3. 当前 bridge 总览

### 3.1 纯桌面能力

| `window.desktop` 方法 | IPC 通道 | server 依赖 | 当前 renderer 使用 | 说明 |
| --- | --- | --- | --- | --- |
| `getInfo()` | `desktop:get-info` | 否 | 是 | 读取平台和运行时版本 |
| `getWindowState()` | `desktop:get-window-state` | 否 | 是 | 读取窗口最大化状态 |
| `showMenu(menuKey, anchor?)` | `desktop:show-menu` | 否 | 是 | 弹出原生菜单 |
| `windowAction(action)` | `desktop:window-action` | 否 | 是 | 窗口最小化 / 最大化 / 关闭 |
| `getAgentConfig()` | `desktop:get-agent-config` | 否 | 是 | 读取 agent base URL 与默认工作目录 |
| `pickProjectDirectory()` | `desktop:pick-project-directory` | 否 | 是 | 打开系统文件夹选择器 |
| `onWindowStateChange(listener)` | Electron event | 否 | 是 | 订阅窗口最大化状态变化 |

### 3.2 当前 renderer 正在使用的后端联动能力

| `window.desktop` 方法 | IPC 通道 | server route | 当前状态 | 说明 |
| --- | --- | --- | --- | --- |
| `getAgentHealth()` | `desktop:agent-health` | `GET /healthz` | 已实现 | 检查 agent 服务是否可达 |
| `listFolderWorkspaces()` | `desktop:list-folder-workspaces` | `GET /api/projects` + `GET /api/projects/:id/sessions` | 已实现 | 启动时拉取文件夹工作区树 |
| `openFolderWorkspace({ directory })` | `desktop:open-folder-workspace` | `POST /api/projects` + `GET /api/projects/:id/sessions` | 已实现 | 从目录创建/打开项目，并返回目标文件夹工作区 |
| `createFolderSession({ projectID, directory, title? })` | `desktop:create-folder-session` | `POST /api/projects/:id/sessions` | 已实现 | 在当前文件夹工作区下新增持久化 session |
| `deleteAgentSession({ sessionID })` | `desktop:delete-agent-session` | `DELETE /api/sessions/:id` | 已实现 | 删除单个 session 及其消息 |
| `getSessionHistory({ sessionID })` | `desktop:get-session-history` | `GET /api/sessions/:id/messages` | 已实现 | 拉取当前 session 的历史消息 |
| `createAgentSession({ directory? })` | `desktop:agent-create-session` | `POST /api/sessions` | 兜底可用 | 只在 UI session 没有 backend session id 时兜底创建 |
| `streamAgentMessage({ streamID, sessionID, text, system?, agent? })` | `desktop:agent-stream-message` | `POST /api/sessions/:id/messages/stream` | 已实现 | 流式读取 SSE 并逐条转发回 renderer |
| `sendAgentMessage({ sessionID, text, system?, agent? })` | `desktop:agent-send-message` | `POST /api/sessions/:id/messages/stream` | 已实现 | 一次性消费完整 SSE 文本的兼容兜底 |
| `onAgentStreamEvent(listener)` | Electron event | 同上 | 已实现 | 订阅 main 转发的流式事件 |

### 3.3 已暴露但当前 renderer 未走主路径的方法

这些能力已经在 preload/main 暴露，但当前 `useAgentWorkspace()` 没把它们当主路径使用：

| `window.desktop` 方法 | IPC 通道 | server route | 当前说明 |
| --- | --- | --- | --- |
| `listProjectWorkspaces()` | `desktop:list-project-workspaces` | `GET /api/projects` + `GET /api/projects/:id/sessions` | 返回 project 视角的数据；当前 sidebar 不是 project-first |
| `createProjectWorkspace({ directory })` | `desktop:create-project-workspace` | `POST /api/projects` + `GET /api/projects/:id/sessions` | 返回 project 视角的数据；当前打开文件夹走 `openFolderWorkspace()` |
| `createProjectSession({ projectID, title?, directory? })` | `desktop:create-project-session` | `POST /api/projects/:id/sessions` | 当前 UI 使用的是 `createFolderSession()` |
| `deleteProjectWorkspace({ projectID })` | `desktop:delete-project-workspace` | `DELETE /api/projects/:id` | 当前 renderer 还没有 project 级删除入口 |

## 4. 当前核心数据模型

### 4.1 文件夹工作区

当前 renderer 启动时使用的是文件夹视角：

```ts
interface AgentWorkspaceSession {
  id: string
  projectID: string
  directory: string
  title: string
  created: number
  updated: number
}

interface AgentFolderWorkspace {
  id: string
  directory: string
  name: string
  created: number
  updated: number
  project: {
    id: string
    name: string
    worktree: string
  }
  sessions: AgentWorkspaceSession[]
}
```

`id` 当前直接使用目录路径，sidebar 的选中、展开和排序都以这个 id 为准。

### 4.2 Project 视角数据

main/preload 仍保留 project 视角能力：

```ts
interface AgentProjectWorkspace {
  id: string
  worktree: string
  name?: string
  created: number
  updated: number
  sessions: AgentWorkspaceSession[]
}
```

它不再是当前 sidebar 的主渲染结构，但仍是 bridge 的可用能力。

### 4.3 历史消息

```ts
interface AgentSessionHistoryMessage {
  info: Record<string, unknown>
  parts: unknown[]
}
```

renderer 侧会进一步解析成：

- 用户 turn
- assistant turn
- assistant trace item 列表

### 4.4 SSE 事件

```ts
interface AgentSSEEvent {
  event: string
  data: unknown
}

interface AgentStreamIPCEvent extends AgentSSEEvent {
  streamID: string
}
```

当前实际消费的事件名：

- `started`
- `delta`
- `part`
- `done`
- `error`

## 5. 当前已实现链路

### 5.1 启动时加载文件夹工作区

时序：

1. `useAgentWorkspace()` 挂载。
2. 调 `window.desktop.listFolderWorkspaces()`。
3. preload 转发到 `desktop:list-folder-workspaces`。
4. main 先请求 `GET /api/projects`。
5. main 再为每个 project 请求 `GET /api/projects/:id/sessions`。
6. main 仅根据 session 的 `directory` 组装启动时的 `AgentFolderWorkspace[]`；`sandboxes` 不再参与 sidebar 恢复。
7. renderer 用 `mapLoadedWorkspaces()` 写入侧栏。
8. 如果失败，保留本地 `seedWorkspaces`。

### 5.2 打开文件夹并插入侧栏

时序：

1. 用户点击 `Open folder`。
2. renderer 调 `pickProjectDirectory()`。
3. 用户选中目录后，renderer 调 `openFolderWorkspace({ directory })`。
4. main 先 `POST /api/projects`，确保该目录对应的 project 存在。
5. main 再请求该 project 的 session 列表，并按目标 `directory` 组装 folder workspace。
6. 如果该目录还没有 session，main 返回一个空 session 列表的临时 folder workspace；renderer 再把结果插入本地 `workspaces` 并切到新工作区。

### 5.3 在当前文件夹下创建 session

时序：

1. 用户点击 `Create session`。
2. renderer 基于当前选中文件夹调用 `createFolderSession({ projectID, directory })`。
3. main 请求 `POST /api/projects/:id/sessions`。
4. renderer 把返回 session 插入目标工作区，并初始化本地 conversation 容器。

### 5.4 会话历史回放

时序：

1. startup 选中首个 session，或用户点击其他 session。
2. renderer 调 `getSessionHistory({ sessionID })`。
3. main 请求 `GET /api/sessions/:id/messages`。
4. renderer 把历史消息通过 `buildTurnsFromHistory()` 映射成 UI thread。

### 5.5 流式消息发送

主路径：

1. renderer 先把用户消息写进本地 `conversations`。
2. 如果当前 UI session 没有 backend session id，则调用 `createAgentSession()` 兜底。
3. renderer 先插入一个 streaming assistant turn。
4. renderer 调 `streamAgentMessage({ streamID, sessionID, text })`。
5. main 请求 `POST /api/sessions/:id/messages/stream`。
6. main 通过 `readAgentSSEStream()` 逐块读取 SSE。
7. main 把每个事件通过 `desktop:agent-stream-event` 发送给 renderer。
8. renderer 把 `delta` / `part` / `done` / `error` 增量应用到同一个 assistant turn。

兼容兜底：

1. 如果流式 bridge 不可用，则调用 `sendAgentMessage()`。
2. main 仍请求同一个 `/messages/stream` route。
3. 但这次会先完整读取 SSE 文本，再一次性解析为事件数组返回 renderer。

## 6. SSE part 到 UI trace 的映射

当前 `stream.ts` 能识别的 `part.type`：

| `part.type` | UI trace kind | 说明 |
| --- | --- | --- |
| `reasoning` | `reasoning` | 推理过程文本 |
| `text` | `text` | 最终回复文本 |
| `tool` | `tool` | 工具调用状态与输出 |
| `file` | `file` | 文件结果 |
| `image` | `image` | 图片结果 |
| `patch` | `patch` | 文件改动摘要 |
| `subtask` | `subtask` | 子任务/委派摘要 |
| `step-finish` | `step` | 一次推理步骤完成 |
| `retry` | `retry` | 重试计划 |
| `snapshot` | `snapshot` | 工作区快照 |

如果新增 server 侧 `part.type`，至少要同步更新：

1. `src/renderer/src/app/types.ts`
2. `src/renderer/src/app/stream.ts`
3. `src/renderer/src/styles.css`
4. `src/renderer/src/app/stream.test.ts`

## 7. 当前已知约束

1. 当前正式 UI 是 folder-first，不是 project-first。
2. `createAgentSession()` 只是兼容兜底接口，不是 sidebar 新建 session 的主入口。
3. `deleteProjectWorkspace()` 已经有 bridge，但前端还没有 project 级删除动作。
4. `sendAgentMessage()` 和 `streamAgentMessage()` 指向同一个 server route，只是 main 的消费方式不同。

## 8. 变更检查清单

改动 desktop 与 server 契约时，至少检查这些文件：

1. `src/preload/index.ts`
2. `src/main/ipc.ts`
3. `src/main/agent-client.ts`
4. `src/main/types.ts`
5. `src/renderer/src/app/use-agent-workspace.ts`
6. `src/renderer/src/app/stream.ts`
7. `src/renderer/src/App.test.tsx`
8. `src/renderer/src/app/stream.test.ts`
9. `../fanfandeagent/src/server/routes/*.ts`
10. `../fanfandeagent/Test/server.api.test.ts`
11. 本文档
12. `../fanfandeagent/src/server/DESKTOP_SERVER_API_SPEC.zh.md`

## 9. 测试指令

桌面端：

```powershell
cd C:\Projects\fanfande_studio\packages\desktop
npm run typecheck
npm run test
```

如果本次改动涉及 server route 或响应结构，再执行：

```powershell
cd C:\Projects\fanfande_studio\packages\fanfandeagent
bun test Test/server.api.test.ts
```

建议最低联调验收项：

1. 启动后能加载文件夹工作区。
2. 切换 session 后能回放对应历史消息。
3. 在线发送消息时能先看到流式 reasoning/text，再看到 `done` 收尾。
4. 删除 session 后，desktop 和 backend 的 session 视图保持一致。

## 10. Provider / Model Config Routes

The backend now exposes project-scoped provider configuration routes:

- `GET /api/projects/:id/providers/catalog`
- `GET /api/projects/:id/providers`
- `PUT /api/projects/:id/providers/:providerID`
- `DELETE /api/projects/:id/providers/:providerID`
- `GET /api/projects/:id/models`
- `PATCH /api/projects/:id/model-selection`

Recommended desktop integration order:

1. Load `providers/catalog` when opening the project settings view.
2. Save a provider form with `PUT /providers/:providerID`.
3. Populate the model picker from `GET /models`.
4. Persist default model choice with `PATCH /model-selection`.
5. Pass `{ providerID, modelID }` to `POST /api/sessions/:id/messages/stream` when sending a chat message.

## 11. PTY / Terminal Panel API

The desktop app now exposes a first-stage terminal flow that strictly stays on the existing chain:

`renderer -> window.desktop -> preload -> Electron main -> fanfandeagent`

The renderer does not call the sidecar PTY HTTP API directly and does not open a WebSocket to the agent directly.

### 11.1 Bridge methods

| `window.desktop` method | IPC channel | Server/API dependency | Purpose |
| --- | --- | --- | --- |
| `createPtySession({ cwd?, rows?, cols?, shell?, title? })` | `desktop:create-pty-session` | `POST /api/pty` | Create a PTY session in the agent |
| `getPtySession({ id })` | `desktop:get-pty-session` | `GET /api/pty/:id` | Query PTY session metadata |
| `updatePtySession({ id, rows?, cols?, title? })` | `desktop:update-pty-session` | `PUT /api/pty/:id` | Resize or retitle a PTY session |
| `deletePtySession({ id })` | `desktop:delete-pty-session` | `DELETE /api/pty/:id` | Destroy a PTY session |
| `attachPtySession({ id, cursor? })` | `desktop:attach-pty-session` | `GET /api/pty/:id` + `GET /api/pty/:id/connect` | Ask main to create a proxied PTY socket for the current renderer |
| `detachPtySession({ id })` | `desktop:detach-pty-session` | proxied socket cleanup | Close the proxied PTY socket for the current renderer |
| `writePtyInput({ id, data })` | `desktop:write-pty-input` | proxied socket message | Send terminal stdin through the main-owned WebSocket |
| `onPtyEvent(listener)` | `desktop:pty-event` | main forwarded socket events | Subscribe to PTY transport and output events |

### 11.2 Agent routes used by desktop

| Route | Used by | Notes |
| --- | --- | --- |
| `POST /api/pty` | `createPtySession()` | Returns PTY session info in the standard JSON envelope |
| `GET /api/pty/:id` | `getPtySession()` and `attachPtySession()` | Used to validate existence and hydrate metadata |
| `PUT /api/pty/:id` | `updatePtySession()` | Current desktop usage is terminal resize |
| `DELETE /api/pty/:id` | `deletePtySession()` | PTY lifecycle stays in the agent |
| `GET /api/pty/:id/connect` | `attachPtySession()` via main proxy | Main owns the WebSocket and forwards events to renderer |

### 11.3 Renderer event model

The proxied PTY event stream follows the same "main forwards, renderer consumes" principle as `onAgentStreamEvent()`.

Current event families:

- `transport`: main-side socket state changes (`connecting`, `connected`, `disconnected`, `error`)
- `ready`: initial attach success, session metadata, and replay payload
- `output`: incremental PTY output with the latest cursor
- `state`: session metadata refresh
- `exited`: PTY exit notification with `exitCode`
- `deleted`: PTY deleted notification
- `error`: protocol/runtime error for this PTY

### 11.4 Recovery contract

- Renderer persists a terminal workspace snapshot in `localStorage`.
- Snapshot fields include `ptyID`, `buffer`, `cursor`, `rows`, `cols`, `scrollTop`, `title`, and `status`.
- Re-mount first restores the local snapshot, then asks main to attach with the last known `cursor`.
- Main does not own terminal business state; it only owns the renderer <-> socket mapping.
- The agent keeps the PTY buffer and cursor and only replays missing output on reconnect.

### 11.5 Verification commands

```powershell
cd C:\Projects\fanfande_studio\packages\desktop
npm run typecheck
npm run test

cd C:\Projects\fanfande_studio\packages\fanfandeagent
bun test Test/server.pty.test.ts
```

## 12. Git Route Ownership

As of 2026-04-15, desktop git routes under `/api/projects/:id/git/*` are project-scoped again.

- `projectID` is the resource boundary.
- `directory` is the active folder/worktree context inside that project.
- The server must reject git requests when `directory` is outside `project.worktree` and outside every entry in `project.sandboxes`.
- Desktop should not rely on stale project ids continuing to work after a directory changes project identity.
