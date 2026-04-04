# AI Agent Frontend Spec (SSOT)

最后更新: 2026-04-05  
适用范围: `packages/desktop`  
唯一事实来源: 本文档负责 `renderer` 的界面结构、状态模型、交互流程和测试约束，不描述 `main` / `preload` / server 的内部实现细节。

## 1. 目标与边界

本文档统一回答以下问题：

1. 当前桌面端前端到底有哪些稳定界面区域，以及这些区域在代码里的命名。
2. 这些界面区域分别承载什么状态、交互和业务职责。
3. 启动、切换会话、发送消息、打开设置、流式渲染的真实行为是什么。
4. 改动 renderer 时必须补哪些测试或手工验收。

不属于本文档的内容：

1. `window.desktop` / IPC / server route 的契约细节。
2. Electron main 与 preload 的实现说明。
3. 个人学习笔记、历史讨论、未落地方案。

## 2. 当前实现入口

以当前代码为准：

1. 页面入口：`src/renderer/src/main.tsx`
2. 页面装配：`src/renderer/src/App.tsx`
3. 展示组件：`src/renderer/src/app/components.tsx`
4. 桌面壳状态：`src/renderer/src/app/use-desktop-shell.ts`
5. 工作区 / 会话 / thread 状态：`src/renderer/src/app/use-agent-workspace.ts`
6. 设置页状态：`src/renderer/src/app/use-settings-page.ts`
7. 会话状态变更工具：`src/renderer/src/app/conversation-state.ts`
8. 工作区映射与选择工具：`src/renderer/src/app/workspace.ts`
9. SSE 与历史消息映射：`src/renderer/src/app/stream.ts`
10. 回退数据：`src/renderer/src/app/seed-data.ts`
11. 样式：`src/renderer/src/styles.css`

## 3. 当前产品心智模型

1. `packages/desktop` 当前是单窗口、单主页面工作台，没有前端路由。
2. 当前主工作台由 `Titlebar + Sidebar + Sidebar Resizer + Canvas + Settings Page Dialog` 组成。
3. Sidebar 的主视角是文件夹工作区，不是 project dashboard，也不是 project-first 树。
4. Thread 区不是纯聊天记录区，而是“用户 turn + assistant trace”的执行轨迹视图。
5. `SettingsPage` 已实现，且作用域是“当前选中 workspace 对应 project 的模型服务与默认模型设置”，不是全局设置中心。
6. `CanvasTopMenu` 当前只是静态一级菜单条，还没有 `Canvas Tool Panel`、右侧并列面板或对应状态机。

## 4. 界面结构与命名

当前界面结构：

```text
Window Shell
├─ Titlebar
└─ App Shell
   ├─ Sidebar
   │  ├─ Sidebar Actions
   │  ├─ Folder Workspace List
   │  └─ Settings Entry
   ├─ Sidebar Resizer
   ├─ Canvas
   │  ├─ Canvas Top Menu
   │  ├─ Thread Shell
   │  └─ Composer
   └─ Settings Page Dialog
```

### 4.1 Settings Page Dialog 结构细化

```text
Settings Page Dialog
├─ Settings Page Header
│  ├─ Title Block
│  └─ Header Actions
│     ├─ Project Chip (optional)
│     └─ Close Button
└─ Settings Page Shell
   ├─ Settings Primary Nav
   │  ├─ Model Services Nav Item
   │  └─ Default Models Nav Item
   └─ Settings Page Main
      ├─ Feedback Banner (optional)
      ├─ Empty State or Loading State
      ├─ Model Services Layout
      │  ├─ Service List Panel
      │  │  ├─ Section Header
      │  │  ├─ Summary Cards
      │  │  ├─ Provider Search Field
      │  │  └─ Provider Service List
      │  │     └─ Provider Service Item
      │  └─ Service Detail Panel
      │     ├─ Detail Hero
      │     ├─ Detail Meta Grid
      │     │  └─ Detail Meta Card
      │     ├─ Provider Configuration Panel
      │     └─ Provider Models Panel
      └─ Default Models Layout
         ├─ Default Models Panel
         └─ Connected Models Panel
```

补充说明：

1. 设置页不是固定三栏，而是“一级导航 + 动态内容区”的框架。
2. `Model Services` 一级项使用“服务商列表栏 + 详情配置区”的双栏布局。
3. `Default Models` 一级项使用纵向 panel 布局，展示模型选择和可用模型列表。
4. 当前设置页没有嵌套的二级 provider modal，provider 编辑直接发生在右侧详情区。

| 中文业务名          | Canonical Name         | 代码锚点                                                 | 说明                                                      |
| -------------- | ---------------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| 窗口外壳           | Window Shell           | `window-shell`                                       | 页面根容器，承载标题栏和应用主区域                                       |
| 自定义标题栏         | Titlebar               | `titlebar`, `titlebar-surface`                       | 原生菜单入口、agent 状态文案、窗口控制                                  |
| 应用主体壳层         | App Shell              | `app-shell`                                          | 侧栏、分隔条、Canvas、设置页挂载的横向布局容器                              |
| 文件夹侧栏          | Sidebar                | `sidebar`                                            | 当前文件夹工作区导航，不是 project 卡片墙                               |
| 侧栏动作条          | Sidebar Actions        | `sidebar-actions`, `sidebar-action`                  | 当前只有 `Open folder` / `Sort sessions` / `Create session` |
| 文件夹工作区块        | Folder Workspace       | `project-block`                                      | 以文件夹为主键，显示文件夹名和所属 project 名                             |
| 文件夹行           | Folder Row             | `project-row`, `project-row-trigger`                 | 负责选中、展开、折叠以及 hover 图标切换                                 |
| 文件夹行动作         | Folder Row Actions     | `project-row-actions`, `project-row-action`          | 本地移除工作区、在该文件夹下新建 session                                |
| 会话树            | Session Tree           | `session-tree`                                       | 当前文件夹下的 session 列表                                      |
| 会话行            | Session Row            | `session-row`                                        | 切换激活会话                                                  |
| 会话删除动作         | Session Delete Action  | `row-action`                                         | 删除单个 session                                            |
| 设置入口           | Settings Entry         | `sidebar-settings`                                   | 打开 `SettingsPage` 的稳定入口                                 |
| 侧栏缩放条          | Sidebar Resizer        | `sidebar-resizer`                                    | 鼠标拖拽和键盘调整侧栏宽度                                           |
| 主画布            | Canvas                 | `canvas`                                             | 顶部菜单、thread、composer 的容器                                |
| 画布顶部菜单         | Canvas Top Menu        | `canvas-top-menu`, `canvas-top-menu-button`          | 当前只有静态信息架构，没有面板切换逻辑                                     |
| Thread 容器      | Thread Shell           | `thread-shell`, `thread-column`                      | 渲染用户 turn 和 assistant trace                             |
| 用户消息气泡         | User Bubble            | `user-bubble`                                        | 用户文本消息                                                  |
| Assistant turn | Assistant Turn         | `assistant-turn`, `assistant-shell`                  | 一个 assistant 回复对应一张 trace 卡片                            |
| Trace 列表       | Assistant Trace List   | `assistant-trace-list`                               | reasoning / text / tool / error 等事件顺序容器                 |
| Trace 项        | Trace Item             | `trace-item`, `trace-kind-*`                         | SSE part 或历史消息 part 的渲染结果                               |
| 输入区            | Composer               | `composer`, `prompt-input-shell`                     | 底部任务输入框与操作区                                             |
| 设置页            | Settings Page          | `settings-page-overlay`, `settings-page`             | 当前 project 的模型服务与默认模型设置 dialog，居中覆盖在当前工作台之上       |
| 设置页主壳        | Settings Page Shell    | `settings-page-shell`, `settings-page-main`          | 左侧一级导航与右侧动态内容区的横向布局容器                               |
| 设置一级导航      | Settings Primary Nav   | `settings-page-primary-nav`, `settings-primary-nav-item` | 固定承载 `Model Services` 与 `Default Models` 两个一级设置项            |
| 模型服务布局      | Model Services Layout  | `settings-services-layout`                           | 模型服务设置页的双栏布局：左侧列表，右侧详情                             |
| 服务商列表项      | Provider Service Item  | `settings-service-item`                              | 展示服务商名称、连接状态、来源与模型数量，并负责切换右侧详情                 |
| 服务商详情头部    | Service Detail Hero    | `settings-detail-hero`                               | 当前选中服务商的名称、来源、连接状态与说明                               |
| 服务商详情元信息   | Detail Meta Grid       | `settings-detail-meta-grid`, `settings-detail-meta-card` | 展示 provider id、环境变量与默认 endpoint 等摘要                     |
| 默认模型布局      | Default Models Layout  | `settings-default-layout`                            | 默认模型页面的纵向双 panel 结构                                      |

命名约束：

1. 新增稳定区域时，先更新这张表，再落代码。
2. 测试优先使用 Canonical Name 对应的类名、ARIA label 或稳定文本断言。
3. 文档里统一使用“文件夹工作区”“workspace”“session”这些词，不混用 project tree / folder tree 指代同一对象。

## 5. 状态模型

### 5.1 `useDesktopShell()`

`useDesktopShell()` 只负责窗口壳层、布局和 agent 连通性：

- `platform`
- `isWindowMaximized`
- `sidebarWidth`
- `isSidebarResizing`
- `agentConnected`
- `agentDefaultDirectory`
- `titlebarCommand`

当前没有以下状态：

- `isSidebarCondensed`
- `activeCanvasToolPanel`

这意味着：

1. “侧栏密度切换”不再是当前实现的一部分。
2. `CanvasTopMenu` 没有驱动任何右侧面板状态。

### 5.2 `useAgentWorkspace()`

`useAgentWorkspace()` 负责文件夹工作区、会话和 thread：

- `workspaces`
- `selectedFolderID`
- `expandedFolderID`
- `hoveredFolderID`
- `activeSessionID`
- `draft`
- `conversations`
- `agentSessions`
- `isSending`
- `isCreatingProject`
- `isCreatingSession`
- `deletingSessionID`

其中：

1. `workspaces` 的主视角是文件夹工作区，不是 project。
2. `agentSessions` 维护“前端 UI session id -> backend session id”的映射。
3. 从后端加载出来的 session 默认映射为 `session.id -> session.id`。
4. 对于本地 seed/fallback session，首次发送消息会通过 `createAgentSession()` 惰性申请 backend session id。

### 5.3 `useSettingsPage()`

`useSettingsPage()` 负责设置页覆盖层和 project 级模型服务 / 默认模型设置：

- `isOpen`
- `catalog`
- `models`
- `savedSelection`
- `selectionDraft`
- `providerDrafts`
- `isLoading`
- `loadError`
- `message`
- `savingProviderID`
- `deletingProviderID`
- `isSavingSelection`

作用域约束：

1. 设置页的数据源来自 `selectedWorkspace?.project`。
2. 没有选中 workspace 时，设置页会打开空态并给出错误提示，不会退化成全局设置页。
3. 当前设置页只覆盖 `Model Services` 与 `Default Models` 两个一级分组，没有 `Personalization` 或 `Advanced / Labs`。

当前不在 `useSettingsPage()` 中的局部视图状态：

1. `activeSection` 在 `SettingsPage` 组件内维护，当前只可能是 `"services"` 或 `"defaults"`。
2. `selectedProviderID` 与 `providerSearch` 在 `SettingsPage` 组件内维护，用来控制服务商列表过滤和右侧详情切换。
3. 这意味着 `useSettingsPage()` 负责数据加载、保存与反馈，`SettingsPage` 组件负责一级导航切换、服务商选择和动态内容布局。

### 5.4 关键类型

当前 renderer 使用这些关键类型：

- `SessionStatus = "Live" | "Review" | "Ready"`
- `SidebarActionKey = "project" | "sort" | "new"`
- `CanvasMenuKey = "overview" | "artifacts" | "changes" | "console" | "deploy"`
- `Turn = UserTurn | AssistantTurn`
- `AssistantTraceItemKind = "system" | "reasoning" | "text" | "tool" | "file" | "image" | "patch" | "subtask" | "step" | "retry" | "snapshot" | "error"`

当前真实行为：

1. 后端加载出的 session 先映射为 `Ready`。
2. 用户在当前会话发送消息后，该会话会被标记为 `Live`。
3. `Review` 仍保留在类型里用于兼容 seed 数据和未来扩展，但当前界面没有单独的 Review 切换入口。

## 6. 启动与数据加载

### 6.1 应用启动

页面挂载后会并行完成这些初始化：

1. `useDesktopShell()` 调 `window.desktop.getInfo()` 写入平台信息。
2. `useDesktopShell()` 调 `window.desktop.getWindowState()` 并订阅 `onWindowStateChange()`。
3. `useDesktopShell()` 调 `getAgentConfig()` 和 `getAgentHealth()`，生成标题栏里的 agent 状态文案。
4. `useAgentWorkspace()` 调 `window.desktop.listFolderWorkspaces()`，尝试替换 `seedWorkspaces`。

### 6.2 启动时加载文件夹工作区

当前启动链路以 `listFolderWorkspaces()` 为准：

1. renderer 调 `window.desktop.listFolderWorkspaces()`。
2. 成功时，用后端返回的文件夹工作区替换 `seedWorkspaces`。
3. 失败时，保留 `seedWorkspaces` 作为回退 UI。
4. 成功加载后，默认选中第一个有 session 的文件夹工作区和它的首个 session。
5. 同时补齐 `conversations` 与 `agentSessions` 的 session 容器。

### 6.3 会话历史回放

当存在激活 session 且 `getSessionHistory()` 可用时：

1. renderer 调 `window.desktop.getSessionHistory({ sessionID })`。
2. `stream.ts` 用 `buildTurnsFromHistory()` 把持久化消息重建成 `Turn[]`。
3. 切换不同 session 时会重新拉取并覆盖当前 thread。
4. 如果历史请求返回前，这个 session 已经有新的本地追加内容，则旧响应会被丢弃，避免覆盖最新状态。

### 6.4 设置页数据加载

设置页打开后，以当前 `selectedWorkspace?.project.id` 为准加载：

1. 有 project 时，并行调用 `getProjectProviderCatalog({ projectID })` 和 `getProjectModels({ projectID })`。
2. `savedSelection` 与 `selectionDraft` 都来自 `getProjectModels()` 返回的 `selection`。
3. `providerDrafts` 以当前 catalog 初始化。
4. 没有 project 时，设置页显示空态和错误提示。
5. 如果加载失败，设置页显示错误 banner，不回退成伪造数据。

## 7. 交互流程

### 7.1 标题栏

1. 点击菜单按钮调用 `showMenu(menuKey, anchor)`，由 main 弹出原生菜单。
2. 点击窗口按钮调用 `windowAction(action)`。
3. 最大化状态由 main 通过 `onWindowStateChange()` 推回 renderer。
4. 标题栏命令文案来自 `agentConnected + agentBaseURL`，格式为 `agent://...` 或 `agent://offline (...)`。

### 7.2 侧栏动作

当前三个侧栏动作的真实含义：

1. `project`
   - 打开系统文件夹选择器。
   - 选中目录后调用 `openFolderWorkspace({ directory })`。
   - 成功后把新的文件夹工作区插入侧栏并切到该工作区。
2. `sort`
   - 按 `updated` 对每个文件夹下的 session 倒序重排。
3. `new`
   - 在当前选中文件夹下调用 `createFolderSession()`。
   - 成功后插入新 session，切为激活会话，并初始化本地 conversation 容器。

当前不存在 `density` 动作，也不存在“切换侧栏密度”的状态流。

### 7.3 文件夹行与工作区移除

文件夹行行为：

1. 点击已选中且已展开的文件夹，会折叠 session 列表。
2. 点击未展开的文件夹，会展开并优先激活该文件夹内当前 session 或首个 session。
3. hover 或 focus 文件夹行时，leading icon 会在 `folder / expanded / collapsed` 之间切换。

工作区移除行为：

1. 点击文件夹行右侧移除按钮时，只从当前 renderer 状态里删除该工作区。
2. 当前实现不会调用后端删除工作区接口。
3. 如果删除的工作区包含当前激活 session，会重新选择其他可用工作区和 session。

### 7.4 删除会话

1. 点击会话行右侧删除按钮时，调用 `deleteAgentSession({ sessionID })`。
2. 成功后从侧栏移除该 session，并清理本地 `conversations` / `agentSessions`。
3. 如果删除的是当前激活会话，会通过 `selectAfterSessionDelete()` 重新选择下一个 session 或其他工作区。

### 7.5 发送消息

发送逻辑以 `handleSend()` 为准：

1. 空输入不发送。
2. 先立即把用户 turn 追加到 thread，并清空输入框。
3. 同步更新当前 session 的 `summary`、`updated`、`status = "Live"`。
4. 如果后端不可用，生成本地 fallback assistant turn。
5. 如果后端可用：
   - 没有 backend session id 时，先走 `createAgentSession()` 兜底创建。
   - 优先走 `streamAgentMessage()` + `onAgentStreamEvent()`。
   - 若流式接口不可用，再退回 `sendAgentMessage()` 一次性消费事件数组。

### 7.6 流式 trace 渲染

1. 每次发送只对应一个 streaming assistant turn，不为每个 chunk 新建卡片。
2. `delta` 事件会持续追加到当前 reasoning/text trace item。
3. `part` 事件会映射为 `tool`、`file`、`image`、`patch`、`subtask`、`step`、`retry`、`snapshot` 等结构化 trace。
4. `done` 会把匿名流式 text/reasoning 与最终 part 对齐，并补一个 `Response complete` 系统项。
5. `error` 会把当前 turn 落成失败态，而不是静默丢失。

### 7.7 设置页

设置页以 `SettingsPage` + `useSettingsPage()` 为准：

1. 点击侧栏左下角 `Open settings` 打开设置页 dialog；它是覆盖在当前工作台上的居中 modal，不是路由页。
2. 设置页 header 固定包含 `Workspace settings` label、`Settings` 标题、副文案，以及右侧的 project chip（若存在）和关闭按钮。
3. 设置页主体固定采用“左侧一级导航 + 右侧动态内容区”的框架；左侧是 `Model Services` / `Default Models` 导航，右侧是反馈 banner、空态 / 加载态与当前一级设置对应的内容布局。
4. `Model Services` 页面使用双栏布局：左侧是服务商列表栏，右侧是当前选中服务商的详情配置区。
5. 服务商列表栏包含 section header、summary cards、provider 搜索框和服务商列表；每个列表项显示 provider 名称、来源、连接状态和模型数量，并负责切换右侧详情。
6. 右侧详情区由 `Detail Hero`、`Detail Meta Grid`、`Provider Configuration` panel 和 `Provider Models` panel 组成；provider 的编辑不再通过二级 modal 完成，而是直接在详情区完成。
7. `Provider Configuration` panel 包含 `API key` / `Base URL` 字段，以及 `Save` / `Reset` 动作；保存调用 `updateProjectProvider()`，成功后重载 catalog 与 models；重置调用 `deleteProjectProvider()`。
8. `Provider Models` panel 展示当前选中 provider 的模型列表；每个 model row 包含 provider 名、family、status badges、capability tags，以及 `Primary` / `Small` 高亮标记；若该 provider 暂无可见模型则显示空态。
9. `Default Models` 页面使用纵向双 panel 布局：上方是 `Default Models` 选择 panel，下方是 `Connected Models` 列表 panel。
10. `Default Models` panel 包含 `Primary model` / `Small model` 两个选择字段和 `Save model selection` 动作行。
11. `Connected Models` panel 展示当前 project 下所有已可用模型；若无可用模型则显示空态。
12. 设置页按 `Escape` 或点击 backdrop 时会直接关闭外层 settings dialog，不存在需要优先关闭的二级 provider modal。
13. 设置页关闭后只关闭 dialog，不改当前 workspace / session 选择。

### 7.8 Canvas Top Menu

`CanvasTopMenu` 当前真实行为：

1. 只根据 `canvasMenuItems` 渲染一排按钮。
2. 第一项 `Overview` 通过静态类名呈现激活态。
3. 当前没有 click handler、没有活跃菜单状态、没有右侧 `Canvas Tool Panel`。

因此以下内容都不是当前实现：

1. `Canvas Tool Panel`
2. Canvas 内右侧并列工作层
3. Top menu 驱动的面板打开、关闭、切换

## 8. 关键界面状态

### 8.1 启动态

用户看到：

1. 先渲染本地 `seedWorkspaces`。
2. 如果后端成功返回，再切成真实工作区数据。

### 8.2 默认工作台态

用户看到：

1. 左侧文件夹与 session。
2. 中间当前会话 thread。
3. 底部可发送任务的 composer。

### 8.3 无会话空态

用户看到：

1. `No session selected`
2. `Send task` 按钮禁用。

### 8.4 在线流式执行态

用户看到：

1. 用户消息先出现。
2. 同一张 assistant 卡片里持续追加 reasoning / text / tool 等 trace。
3. `Send task` 在流式过程中禁用，结束后恢复。

### 8.5 离线回退态

用户看到：

1. 仍可发送消息。
2. 收到的是本地构造的 fallback assistant turn。

### 8.6 设置页空态

用户看到：

1. 设置页可以打开。
2. 如果当前没有选中 workspace，对话框显示 `Select a workspace first` 空态。

### 8.7 设置页加载与反馈态

用户看到：

1. `Fetching provider catalog` 加载态。
2. 加载失败时显示 error banner。
3. 保存 provider 或 model selection 后显示 success / error banner。
4. 打开设置页后，`Model Services` 会自动选中首个可见服务商，并在右侧显示其详情；搜索服务商时，右侧详情会跟随列表结果切换或退化为空态。

## 9. 约束

1. Renderer 只通过 `window.desktop` 访问桌面和后端能力。
2. `preload` 是唯一桥接层，renderer 不直接访问 `ipcRenderer`、Node API 或 Electron API。
3. 文件夹工作区是当前 Sidebar 的主视角；如果未来改回 project-first，必须先更新本文档和 API spec。
4. session 历史回放和流式更新都要落到同一套 `Turn / AssistantTraceItem` 模型里，不能各自维护一套 UI 结构。
5. 新增 trace 类型时，必须同步更新 `types.ts`、`stream.ts`、样式和测试。
6. 如果未来真的实现 `Canvas Tool Panel` 或新的 Settings 分组，必须先删除本文档里“未实现”的描述，再补充新的状态与交互流。

## 10. 测试指令

在 `packages/desktop` 目录执行：

```powershell
npm run typecheck
npm run test
```

需要手动观察桌面行为时执行：

```powershell
npm run dev
```

修改以下能力时，至少补或确认对应测试：

1. 侧栏加载、回退与默认选中：`src/renderer/src/App.test.tsx`
2. 会话历史回放与切换：`src/renderer/src/App.test.tsx`、`src/renderer/src/app/stream.test.ts`
3. 流式 SSE 增量渲染与 trace 合并：`src/renderer/src/App.test.tsx`、`src/renderer/src/app/stream.test.ts`
4. 设置页加载、一级导航切换、模型服务列表/详情交互、provider 保存、model selection 保存：`src/renderer/src/App.test.tsx`
5. 侧栏缩放与无障碍属性：`src/renderer/src/App.test.tsx`

建议的最低手工验收项：

1. 后端不可用时仍能看到 seed 侧栏。
2. 后端可用时能加载文件夹工作区并切换会话历史。
3. 在线发送消息时，`Send task` 在流式过程中会禁用，结束后恢复。
4. 连续两次流式回复不会串到同一张 assistant 卡片里。
5. 打开设置页后，能够看到当前 project 的模型服务列表和右侧详情区，并成功保存 provider 或 model selection。

## 11. 文档维护规则

以下情况必须同步更新本文档：

1. 界面分区、命名、主视角或稳定入口变化。
2. `useDesktopShell()`、`useAgentWorkspace()`、`useSettingsPage()` 的核心状态职责变化。
3. 会话历史回放策略、流式 trace 映射规则或发送流程变化。
4. 设置页的作用域、分组或保存链路变化。
5. `CanvasTopMenu` 如果从静态菜单升级成真实状态驱动界面。
