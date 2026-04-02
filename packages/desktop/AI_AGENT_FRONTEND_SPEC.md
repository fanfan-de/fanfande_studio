# AI Agent Frontend Spec (SSOT)

最后更新: 2026-04-02  
适用范围: `packages/desktop`  
唯一事实来源: 本文档只负责 `renderer` 的 UI、状态和交互规范，不负责 server 内部实现细节。

## 1. 目标与边界

本文档用于统一以下内容：

1. 当前桌面端 UI 的结构和命名。
2. renderer 层的核心状态模型。
3. 启动、切换会话、发送消息、流式渲染的真实行为。
4. 修改前端时必须跑的验证方式。

不属于本文档的内容：

1. `window.desktop` / IPC / server route 的契约细节。
2. Electron main 与 preload 的实现说明。
3. 个人学习笔记或历史方案讨论。

## 2. 当前实现入口

以当前代码为准：

1. 页面入口：`src/renderer/src/main.tsx`
2. 页面装配：`src/renderer/src/App.tsx`
3. 纯展示组件：`src/renderer/src/app/components.tsx`
4. 桌面壳状态：`src/renderer/src/app/use-desktop-shell.ts`
5. 工作区 / 会话 / 会话流状态：`src/renderer/src/app/use-agent-workspace.ts`
6. SSE 与历史消息映射：`src/renderer/src/app/stream.ts`
7. 样式：`src/renderer/src/styles.css`

## 3. 界面结构与命名

当前界面固定为“标题栏 + 左侧文件夹导航 + 中央 thread + 底部 composer”。

| 中文业务名 | Canonical Name | 代码锚点 | 说明 |
| --- | --- | --- | --- |
| 窗口外壳 | Window Shell | `window-shell` | 页面根容器，承载标题栏和主区域 |
| 自定义标题栏 | Titlebar | `titlebar`, `titlebar-surface` | 原生菜单入口、agent 状态、窗口控制 |
| 应用主体壳层 | App Shell | `app-shell` | 侧栏、拖拽分隔条、画布的横向布局 |
| 文件夹侧栏 | Sidebar | `sidebar` | 当前是文件夹工作区导航，不再是旧的 project 卡片墙 |
| 侧栏动作条 | Sidebar Actions | `sidebar-actions`, `sidebar-action` | `Open folder` / `Toggle sidebar density` / `Sort sessions` / `Create session` |
| 文件夹工作区块 | Folder Workspace | `project-block` | 以文件夹为主键，显示文件夹名和所属 project 名 |
| 文件夹行 | Folder Row | `project-row` | 支持选中、展开、折叠、hover 图标切换 |
| 会话树 | Session Tree | `session-tree` | 当前文件夹下的 session 列表 |
| 会话行 | Session Row | `session-row` | 当前激活会话切换入口 |
| 删除会话动作 | Session Delete Action | `row-action` | 删除单个 session |
| 侧栏缩放条 | Sidebar Resizer | `sidebar-resizer` | 鼠标拖拽和键盘调整侧栏宽度 |
| 主画布 | Canvas | `canvas` | 顶部菜单、thread、composer 的容器 |
| 画布顶部菜单 | Canvas Top Menu | `canvas-top-menu` | 当前只承载信息架构，不写业务状态 |
| Thread 容器 | Thread Shell | `thread-shell`, `thread-column` | 渲染用户 turn 和 assistant trace |
| 用户消息气泡 | User Bubble | `user-bubble` | 用户文本消息 |
| Assistant turn | Assistant Turn | `assistant-turn`, `assistant-shell` | 一个 assistant 回复对应一张 trace 卡片 |
| Trace 列表 | Assistant Trace List | `assistant-trace-list` | reasoning / text / tool / error 等事件顺序容器 |
| Trace 项 | Trace Item | `trace-item`, `trace-kind-*` | SSE part 或历史消息 part 的渲染结果 |
| 输入区 | Composer | `composer`, `prompt-input-shell` | 底部任务输入框和操作区 |

命名约束：

1. 新增区域时先更新这张表，再落代码。
2. 新测试优先用 Canonical Name 对应的类名、ARIA label 或稳定文本断言。
3. 不再在文档里混用“project tree”和“folder workspace tree”指代同一件事。

## 4. 状态模型

### 4.1 桌面壳状态

`useDesktopShell()` 负责：

- `platform`
- `isWindowMaximized`
- `isSidebarCondensed`
- `sidebarWidth`
- `isSidebarResizing`
- `agentConnected`
- `agentDefaultDirectory`
- `titlebarCommand`

这部分状态只关心窗口、agent 连通性和布局壳层，不管理业务会话数据。

### 4.2 工作区与会话状态

`useAgentWorkspace()` 负责：

- `workspaces`
- `selectedFolderID`
- `expandedFolderID`
- `activeSessionID`
- `draft`
- `conversations`
- `agentSessions`
- `isCreatingProject`
- `isSending`
- `deletingSessionID`

其中：

1. `workspaces` 的主视角是文件夹工作区，不是 project。
2. `agentSessions` 用来维护“前端 UI session id -> backend session id”的映射。
3. 当 session 是从后端加载出来时，映射默认就是 `session.id -> session.id`。
4. 当 session 只是本地 seed/fallback 数据时，首次发送消息会通过 `createAgentSession()` 惰性拿到 backend session id。

### 4.3 会话与 trace 数据模型

当前 renderer 使用这些关键类型：

- `SessionStatus = "Live" | "Review" | "Ready"`
- `SidebarActionKey = "project" | "density" | "sort" | "new"`
- `Turn = UserTurn | AssistantTurn`
- `AssistantTraceItemKind = "system" | "reasoning" | "text" | "tool" | "file" | "image" | "patch" | "subtask" | "step" | "retry" | "snapshot" | "error"`

当前真实行为：

1. 后端加载出的 session 先映射为 `Ready`。
2. 用户在当前会话发送消息后，该会话会被标记为 `Live`。
3. `Review` 仍保留在类型里，用于兼容 seed 数据与未来扩展，但当前界面没有单独的 Review 切换入口。

## 5. 启动与数据加载

### 5.1 应用启动

页面挂载后会并行完成三类初始化：

1. `useDesktopShell()` 调 `window.desktop.getInfo()` 写入平台信息。
2. `useDesktopShell()` 调 `window.desktop.getWindowState()` 并订阅 `onWindowStateChange()`。
3. `useDesktopShell()` 调 `getAgentConfig()` 和 `getAgentHealth()`，生成标题栏里的 agent 状态文案。

### 5.2 启动时加载工作区

当前启动链路以 `listFolderWorkspaces()` 为准：

1. renderer 调 `window.desktop.listFolderWorkspaces()`。
2. 成功时，用后端返回的文件夹工作区替换 `seedWorkspaces`。
3. 失败时，保留 `seedWorkspaces` 作为回退 UI。
4. 成功加载后，默认选中第一个有 session 的文件夹工作区和它的首个 session。

### 5.3 会话历史回放

当存在激活 session 且 `getSessionHistory()` 可用时：

1. renderer 调 `window.desktop.getSessionHistory({ sessionID })`。
2. `stream.ts` 使用 `buildTurnsFromHistory()` 把持久化消息重建成 `Turn[]`。
3. 切换不同 session 时会重新拉取并覆盖当前 thread。
4. 如果在历史请求返回前，这个会话已经有新的本地追加内容，则旧的历史响应会被丢弃，避免覆盖最新状态。

## 6. 交互流程

### 6.1 标题栏

1. 点击菜单按钮调用 `showMenu(menuKey, anchor)`，由 main 弹出原生菜单。
2. 点击窗口按钮调用 `windowAction(action)`。
3. 最大化状态由 main 通过 `desktop:window-state-changed` 反推回来，renderer 不自己猜测。

### 6.2 侧栏

当前四个侧栏动作的真实含义：

1. `project`
   - 打开系统文件夹选择器。
   - 选中目录后调用 `openFolderWorkspace({ directory })`。
   - 成功后把新的文件夹工作区插入侧栏并切到该工作区。
2. `density`
   - 只切换侧栏密度样式，不改数据排序。
3. `sort`
   - 按 `updated` 对每个文件夹下的 session 倒序重排。
4. `new`
   - 在当前选中文件夹下调用 `createFolderSession()`。
   - 成功后插入新 session，切换为激活会话，并初始化本地 conversation 容器。

文件夹行行为：

1. 点击已选中且已展开的文件夹，会折叠 session 列表。
2. 点击未展开的文件夹，会展开并优先激活该文件夹的首个 session。
3. hover 或 focus 文件夹行时，leading icon 会在 `folder / expanded / collapsed` 之间切换。

### 6.3 删除会话

1. 点击会话行右侧删除按钮时，调用 `deleteAgentSession({ sessionID })`。
2. 成功后从侧栏移除该 session，并清理本地 `conversations` / `agentSessions`。
3. 如果删除的是当前激活会话，需要重新选择同文件夹下的下一个 session，或者回退到其他文件夹的首个 session。

### 6.4 发送消息

发送逻辑以 `handleSend()` 为准：

1. 空输入不发送。
2. 先立即把用户 turn 追加到 thread，并清空输入框。
3. 同步更新当前 session 的 `summary`、`updated`、`status = "Live"`。
4. 如果后端不可用，生成本地 fallback assistant turn。
5. 如果后端可用：
   - 没有 backend session id 时，先走 `createAgentSession()` 兜底创建。
   - 优先走 `streamAgentMessage()` + `onAgentStreamEvent()`。
   - 若流式接口不可用，再退回 `sendAgentMessage()` 一次性消费 SSE 文本。

### 6.5 流式 trace 渲染

1. 每次发送只对应一个 streaming assistant turn，不为每个 chunk 新建卡片。
2. `delta` 事件会持续追加到当前 reasoning/text trace item。
3. `part` 事件会映射为 `tool`、`file`、`image`、`patch`、`subtask`、`step`、`retry`、`snapshot` 等结构化 trace。
4. `done` 会把匿名流式 text/reasoning 与最终 part 对齐，并补一个“Response complete”系统项。
5. `error` 会把当前 turn 落成失败态，而不是静默丢失。

## 7. 约束

1. Renderer 只通过 `window.desktop` 访问桌面和后端能力。
2. `preload` 是唯一桥接层，renderer 不直接访问 `ipcRenderer`、Node API 或 Electron API。
3. 文件夹工作区是当前 sidebar 的主视角；如果未来改回 project 视角，必须先更新本文档和 API spec。
4. session 历史回放和流式更新都要落到同一套 `Turn / AssistantTraceItem` 模型里，不能各自维护一套 UI 结构。
5. 新增 trace 类型时，必须同步更新 `types.ts`、`stream.ts`、样式和测试。

## 8. 测试指令

在 `packages/desktop` 目录执行：

```powershell
npm run typecheck
npm run test
```

修改以下能力时，至少补或确认对应测试：

1. 侧栏加载与回退：`App.test.tsx`
2. 会话历史回放：`App.test.tsx`、`stream.test.ts`
3. 流式 SSE 增量渲染：`App.test.tsx`、`stream.test.ts`
4. trace item 合并规则：`stream.test.ts`
5. 侧栏缩放与无障碍属性：`App.test.tsx`

建议的最低手工验收项：

1. 后端不可用时仍能看到 seed 侧栏。
2. 后端可用时能加载文件夹工作区并切换会话历史。
3. 在线发送消息时，`Send task` 在流式过程中会禁用，结束后恢复。
4. 连续两次流式回复不会串到同一张 assistant 卡片里。

## 9. 文档维护规则

以下情况必须同步更新本文档：

1. 侧栏主视角、激活规则或命名变化。
2. `useDesktopShell()` 或 `useAgentWorkspace()` 的核心状态职责变化。
3. 会话历史回放策略变化。
4. SSE 事件如何映射为 trace item 的规则变化。
