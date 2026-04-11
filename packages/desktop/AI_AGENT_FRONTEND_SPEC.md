# AI Agent Frontend Spec (SSOT)

最后更新: 2026-04-09  
适用范围: `packages/desktop`  
唯一事实来源: 本文档负责 `renderer` 的状态模型、交互流程和测试约束；稳定界面结构与命名已拆分到独立文档维护。

## 1. 目标与边界

本文档统一回答以下问题：

1. `renderer` 当前由哪些状态模型驱动，以及它们分别负责什么。
2. 启动、切换会话、发送消息、审批工具调用、打开设置页时的真实行为是什么。
3. 改动 renderer 时必须补哪些测试或手工验收。

不属于本文档的内容：

1. `window.desktop` / IPC / server route 的协议细节。
2. Electron `main` 与 `preload` 的内部实现说明。
3. 设计草稿、历史讨论、未落地方案。

## 2. 当前实现入口

以当前代码为准：

1. 页面入口：`src/renderer/src/main.tsx`
2. 页面装配：`src/renderer/src/App.tsx`
3. 展示组件：`src/renderer/src/app/components.tsx`
4. 桌面壳状态：`src/renderer/src/app/use-desktop-shell.ts`
5. 工作区 / 会话 / thread / composer 状态：`src/renderer/src/app/use-agent-workspace.ts`
6. 设置页状态：`src/renderer/src/app/use-settings-page.ts`
7. 会话状态变更工具：`src/renderer/src/app/conversation-state.ts`
8. 工作区映射与选择工具：`src/renderer/src/app/workspace.ts`
9. SSE 与历史消息映射：`src/renderer/src/app/stream.ts`
10. 回退数据：`src/renderer/src/app/seed-data.ts`
11. 关键类型：`src/renderer/src/app/types.ts`
12. 常量：`src/renderer/src/app/constants.ts`
13. 样式：`src/renderer/src/styles.css`

## 3. 当前产品心智模型

1. `packages/desktop` 当前仍是单窗口、单主页面工作台，没有前端路由。
2. 当前工作台由 `Titlebar + App Shell` 构成；`App Shell` 内包含可选左侧窄轨、可折叠左侧栏、Canvas、可折叠右侧 Inspector，以及覆盖式 Settings Page。
3. Sidebar 的主视角仍是文件夹工作区，不是 project dashboard，也不是 project-first 树。
4. Thread 区不是纯聊天记录，而是“用户 turn + assistant trace”；如果当前会话有待审批工具调用，thread 末尾还会追加内联审批卡片。
5. Composer 不是纯文本输入框；它同时承载附件选择、项目级模型切换和 agent mode 切换。
6. 右侧栏当前是 Inspector；它现在是“右侧区域 top menu + 当前右侧视图”的结构，不是 `Canvas Tool Panel`。
7. `SettingsPage` 现在是全局 provider / model / shell appearance 设置中心，不再依赖当前选中 workspace 或 project。
8. `Canvas` 现在有两层顶部结构：`Canvas Region Top Menu` 负责 session tabs 与边栏恢复入口，`Session Canvas Top Menu` 负责当前 session canvas 的局部操作。

## 4. 界面结构与命名

该部分已抽离为独立文档：

- [`桌面端界面结构与命名.md`](./桌面端界面结构与命名.md)

涉及以下变化时，先更新该文档，再改代码或测试：

1. 稳定界面分区变化。
2. 类名、ARIA label、稳定按钮文案变化。
3. 影响测试定位的结构层级变化。

## 5. 状态模型

### 5.1 `useDesktopShell()`

`useDesktopShell()` 负责窗口壳层、左右侧栏布局、左侧窄轨可见性和 agent 连通性：

- 窗口壳信息：`platform`、`isWindowMaximized`
- 左右侧栏布局：`sidebarWidth`、`rightSidebarWidth`
- 折叠状态：`isSidebarCollapsed`、`isRightSidebarCollapsed`
- resize 状态：`isSidebarResizing`、`isRightSidebarResizing`
- 左侧窄轨：`isActivityRailVisible`
- agent 连通性：`agentConnected`、`agentDefaultDirectory`、`titlebarCommand`
- 交互处理器：`handleSidebarToggle()`、`handleRightSidebarToggle()`、`handleActivityRailVisibilityChange()`、`handleTitleMenu()`、`handleWindowAction()`
- 布局输出：`appShellRef`、`appShellStyle`

当前真实约束：

1. 左侧窄轨可见性会持久化到 `localStorage`，键名是 `desktop.activityRailVisible`。
2. 左右侧栏的宽度和折叠状态完全由 `useDesktopShell()` 维护；顶部菜单只消费这些状态，不维护自己的面板状态。
3. 当前没有 `activeCanvasToolPanel` 之类的状态机。

### 5.2 `useAgentWorkspace()`

`useAgentWorkspace()` 负责文件夹工作区、会话、thread、工具审批流，以及 composer 的运行态：

- 工作区与会话：`workspaces`、`selectedFolderID`、`expandedFolderID`、`hoveredFolderID`、`activeSessionID`
- 区域级视图状态：`leftSidebarView`、`rightSidebarView`
- Canvas 区域数据：`canvasSessionTabs`
- thread：`conversations`、`activeTurns`、`draft`、`isSending`
- UI session 映射：`agentSessions`
- 侧栏操作过程：`isCreatingProject`、`isCreatingSession`、`deletingSessionID`
- 工具审批：`activePendingPermissionRequests`、`permissionRequestActionRequestID`、`permissionRequestActionError`
- composer：`composerAttachments`、`composerAgentMode`、`composerModelOptions`、`composerSelectedModel`、`composerSelectedModelLabel`

当前真实约束：

1. `workspaces` 的主视角仍然是“文件夹工作区”。
2. `agentSessions` 维护“前端 UI session id -> backend session id”的映射。
3. 从后端加载出来的 session 默认映射为 `session.id -> session.id`。
4. 选中工作区的 `project.id` 会驱动 composer 模型列表；这部分是项目级，而不是全局设置页级。
5. `composerAgentMode === "Review"` 时，发送链路会注入固定 review system prompt。
6. `composerAttachments` 会在真正提交时被附加到 prompt 文本末尾。
7. 只要存在待审批请求，composer 发送按钮就会禁用。

### 5.3 `useSettingsPage()`

`useSettingsPage()` 负责全局 provider / model 设置页的数据加载、保存和反馈：

- 打开状态：`isOpen`
- provider 数据：`catalog`、`providerDrafts`
- model 数据：`models`、`savedSelection`、`selectionDraft`
- 加载与反馈：`isLoading`、`loadError`、`message`
- provider 动作：`savingProviderID`、`deletingProviderID`
- model 动作：`isSavingSelection`

当前真实约束：

1. 设置页的数据源来自 `getGlobalProviderCatalog()` 和 `getGlobalModels()`，不依赖 `selectedWorkspace`。
2. 如果这些 API 不可用或请求失败，Provider / Models 会显示错误状态，不会回退成伪造数据。
3. `Appearance` 分组不在 `useSettingsPage()` 里管理，它使用的是 `useDesktopShell()` 提供的左侧窄轨状态和切换器。
4. `activeSection`、`selectedProviderID` 和 `providerSearch` 在 `SettingsPage` 组件内部维护。
5. 当前一级分组是 `"services" | "defaults" | "appearance"`，对应 UI 标签 `Provider`、`Models`、`Appearance`。

### 5.4 关键类型

当前 renderer 使用这些关键类型：

- `SessionStatus = "Live" | "Review" | "Ready"`
- `SidebarActionKey = "project" | "sort" | "new"`
- `LeftSidebarView = "workspace"`
- `RightSidebarView = "changes"`
- `AppMode = "Autopilot" | "Review"`
- `Turn = UserTurn | AssistantTurn`
- `AssistantTraceItemKind = "system" | "reasoning" | "text" | "tool" | "file" | "image" | "patch" | "subtask" | "step" | "retry" | "snapshot" | "error"`
- `AssistantTraceStatus = "pending" | "running" | "completed" | "error" | "waiting-approval" | "denied"`

当前真实行为：

1. 后端加载出的 session 会先映射为 `Ready`。
2. 用户在当前会话发送消息后，该会话会被标记为 `Live`。
3. `Review` 仍保留在类型中，用于 seed 数据和 review 语义标记。
4. `AppMode="Review"` 只改变发送时附加的 system prompt，不会切换新的页面或 route。
5. `system` trace item 会保留在 turn 状态里，但常规 assistant 卡片渲染时会过滤掉它们。

## 6. 启动与数据加载

### 6.1 应用启动

页面挂载后会并行完成这些初始化：

1. `useDesktopShell()` 读取左侧窄轨可见性本地偏好。
2. `useDesktopShell()` 调 `window.desktop.getInfo()` 写入平台信息。
3. `useDesktopShell()` 调 `window.desktop.getWindowState()` 并订阅 `onWindowStateChange()`。
4. `useDesktopShell()` 调 `getAgentConfig()` 和 `getAgentHealth()`，生成标题栏里的 agent 状态文案。
5. `useAgentWorkspace()` 调 `window.desktop.listFolderWorkspaces()`，尝试替换 `seedWorkspaces`。

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

### 6.4 待审批请求加载

当存在激活 session 且 `getSessionPermissionRequests()` 可用时：

1. renderer 调 `window.desktop.getSessionPermissionRequests({ sessionID })`。
2. 只保留 `status === "pending"` 的请求。
3. 切换会话、流式执行完成或审批完成后，都会触发刷新。

### 6.5 Composer 模型加载与即时保存

当 `selectedWorkspace?.project.id` 变化时：

1. renderer 调 `window.desktop.getProjectModels({ projectID })`。
2. `composerModelOptions` 只暴露当前项目下 `available === true` 的模型。
3. 如果没有 workspace、没有 project，或 API 不可用，则 composer 模型列表会清空并退回 `Server default`。
4. 用户在 composer 菜单里切换模型时，会立即调用 `updateProjectModelSelection()` 保存。
5. 若存在未完成的模型选择保存任务，`handleSend()` 会先等待保存完成再真正发送。

### 6.6 设置页数据加载

设置页打开后，以全局 provider / model 设置为准加载：

1. 若 API 可用，则并行调用 `getGlobalProviderCatalog()` 和 `getGlobalModels()`。
2. `savedSelection` 与 `selectionDraft` 都来自 `getGlobalModels()` 返回的 `selection`。
3. `providerDrafts` 会按最新 `catalog` 重建。
4. 如果 API 不可用或加载失败，provider / model 数据会清空并显示错误 banner。
5. `Appearance` 分组不依赖这些数据，即使 Provider / Models 报错仍可使用。

## 7. 交互流程

### 7.1 标题栏

1. 点击菜单按钮调用 `showMenu(menuKey, anchor)`，由 main 弹出原生菜单。
2. 点击窗口按钮调用 `windowAction(action)`。
3. 最大化状态由 main 通过 `onWindowStateChange()` 推回 renderer。
4. 标题栏命令文案来自 `agentConnected + agentBaseURL`，格式为 `agent://...` 或 `agent://offline (...)`。

### 7.2 壳层切换与缩放

1. 左侧窄轨可见时，左侧栏折叠/恢复按钮固定放在窄轨中。
2. 左侧窄轨隐藏时：
   - 左侧栏展开态下，折叠按钮显示在 `Left Sidebar Top Menu` 内。
   - 左侧栏折叠态下，恢复按钮显示在 `Canvas Region Top Menu` 左侧。
3. 右侧 Inspector 没有窄轨：
   - 展开态下，折叠按钮显示在 `Right Sidebar Top Menu` 内。
   - 折叠态下，恢复按钮显示在 `Canvas Region Top Menu` 右侧。
4. 左右分隔条都支持鼠标拖拽和键盘调整，键盘交互包含 `ArrowLeft` / `ArrowRight` / `Home` / `End`。

### 7.3 侧栏动作

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

### 7.4 文件夹行与工作区移除

文件夹行行为：

1. 点击已选中且已展开的文件夹，会折叠 session 列表。
2. 点击未展开的文件夹，会展开并优先激活该文件夹内当前 session 或首个 session。
3. hover 或 focus 文件夹行时，leading icon 会在 `folder / expanded / collapsed` 之间切换。

工作区移除行为：

1. 点击文件夹行右侧移除按钮时，只从当前 renderer 状态里删除该工作区。
2. 当前实现不会调用后端删除工作区接口。
3. 如果删除的工作区包含当前激活 session，会重新选择其他可用工作区和 session。

### 7.5 删除会话

1. 点击会话行右侧删除按钮时，调用 `deleteAgentSession({ sessionID })`。
2. 成功后从侧栏移除该 session，并清理本地 `conversations`、`agentSessions` 和待审批请求缓存。
3. 如果删除的是当前激活会话，会通过 `selectAfterSessionDelete()` 重新选择下一个 session 或其他工作区。

### 7.6 发送消息

发送逻辑以 `handleSend()` 为准：

1. 空输入、不存在激活会话、正在发送，或存在待审批请求时都不会发送。
2. 如果存在待完成的 composer 模型保存任务，会先等待它结束。
3. 先立即把用户 turn 追加到 thread，并清空输入框和已选附件。
4. 同步更新当前 session 的 `summary`、`updated`、`status = "Live"`。
5. 如果后端不可用，生成本地 fallback assistant turn。
6. 如果后端可用：
   - 没有 backend session id 时，先走 `createAgentSession()` 兜底创建。
   - `Review` 模式会附加固定 review system prompt。
   - 附件会被编码进 prompt 末尾的 `Attached files:` 段落。
   - 优先走 `streamAgentMessage()` + `onAgentStreamEvent()`。
   - 若流式接口不可用，再退回 `sendAgentMessage()` 一次性消费事件数组。

### 7.7 流式 trace 渲染

1. 每次发送只对应一个 streaming assistant turn，不为每个 chunk 新建卡片。
2. `delta` 事件会持续追加到当前 reasoning/text trace item。
3. `part` 事件会映射为 `tool`、`file`、`image`、`patch`、`subtask`、`step`、`retry`、`snapshot` 等结构化 trace。
4. `done` 会对齐匿名流式 item 与最终 part；`error` 会把当前 turn 落成失败态。
5. `ThreadView` 在常规 assistant 卡片里只渲染非 `system` trace item；`system` item 仍保留在状态模型中。

### 7.8 工具审批流

1. 当前会话存在待审批请求时，thread 末尾会追加内联审批卡片。
2. `Send task` 在存在待审批请求或审批动作处理中都会禁用。
3. 主操作只提供 `Deny` 和 `Allow once`；持久化授权选项放在 disclosure 内。
4. 审批提交会调用 `respondPermissionRequest()`，随后刷新历史和待审批列表。
5. 如果 preload 暴露 `resumeAgentMessageStream()`，审批成功后会追加一个新的 streaming assistant turn 并恢复流式执行。
6. 如果审批请求在真正落盘前失败，请求会被恢复到列表中，并显示错误文案。

### 7.9 设置页

设置页以 `SettingsPage` + `useSettingsPage()` 为准：

1. 点击侧栏左下角 `Open settings` 打开设置页；它是覆盖在当前工作台上的居中 modal，不是路由页。
2. 当前设置页头部只有关闭按钮，没有 project chip、workspace 标题块或二级 header actions。
3. 左侧一级导航固定包含 `Provider`、`Models`、`Appearance` 三个分组。
4. `Provider` 页面使用“搜索 + provider 列表 + 右侧详情”的双栏布局。
5. 保存 provider 调 `updateGlobalProvider()`；只有当 provider `source === "config"` 时才显示 `Reset`，并调用 `deleteGlobalProvider()`。
6. `Models` 页面维护全局 `Primary model` 和 `Small model`，保存时调用 `updateGlobalModelSelection()`。
7. `Appearance` 页面当前只有 `Show left rail` 一个开关，它直接驱动 `useDesktopShell()` 的左侧窄轨状态。
8. 设置页按 `Escape` 或点击 backdrop 时会直接关闭，没有嵌套的二级 modal。

### 7.10 Canvas Region Top Menu + Session Canvas Top Menu

当前 Canvas 顶部结构分成两层：

1. `Canvas Region Top Menu`
   - 负责渲染当前 `selectedWorkspace.sessions` 对应的 session tabs。
   - `activeSessionID` 决定当前激活 tab。
   - 当左侧栏或右侧 Inspector 处于折叠态时，顶部菜单会承载对应的恢复按钮。
2. `Session Canvas Top Menu`
   - 属于当前 session canvas 的局部 top menu。
   - 当前主要承载 Git quick menu。
   - 不负责切换 session，也不负责切换左右区域视图。

### 7.11 Right Sidebar / Inspector

1. Inspector 展开时先渲染 `Right Sidebar Top Menu`，再渲染当前激活的右侧视图。
2. 当前唯一已实现的右侧视图是 `changes`。
3. `changes` 视图展示 `Changed Files` 区块和 diff preview。
4. 当前右侧 top menu 负责切换右侧视图，并承载右栏折叠按钮。
5. 当前没有右侧窄轨。

## 8. 关键界面状态

### 8.1 启动态

用户看到：

1. 先渲染本地 `seedWorkspaces`。
2. 如果后端成功返回，再切成真实工作区数据。

### 8.2 默认工作台态

用户看到：

1. 可选的左侧窄轨。
2. 左侧文件夹与 session。
3. 中间当前会话 thread。
4. 底部带模型、模式和附件能力的 composer。
5. composer 下方可展开的 terminal panel；折叠态入口固定在 canvas 左下角，展开态入口固定在 terminal 菜单栏最左侧。
5. 右侧 Inspector。

### 8.3 无会话空态

用户看到：

1. `No session selected`
2. `Send task` 按钮禁用。

### 8.4 在线流式执行态

用户看到：

1. 用户消息先出现。
2. 同一张 assistant 卡片里持续追加 reasoning / text / tool 等非 system trace。
3. `Send task` 在流式过程中禁用，结束后恢复。

### 8.5 待审批态

用户看到：

1. thread 末尾出现 `Tool approval request` 卡片。
2. `Send task` 按钮禁用。
3. 审批完成后，卡片消失，并可能继续恢复流式输出。

### 8.6 离线回退态

用户看到：

1. 仍可发送消息。
2. 收到的是本地构造的 fallback assistant turn。

### 8.7 设置页加载与反馈态

用户看到：

1. `Provider` / `Models` 打开后会先进入加载态。
2. 加载失败时显示 error banner。
3. 保存 provider 或 global model selection 后显示 success / error banner。
4. `Appearance` 不依赖 provider/model 接口，可单独使用。

### 8.8 壳层折叠态

用户看到：

1. 左侧栏折叠后，其恢复按钮要么在左侧窄轨，要么在 `Canvas Region Top Menu` 左侧。
2. 右侧 Inspector 折叠后，其恢复按钮在 `Canvas Region Top Menu` 右侧。
3. 左右侧栏的恢复宽度会回到最近一次展开宽度，而不是固定默认值。

## 9. 约束

1. Renderer 只通过 `window.desktop` 访问桌面和后端能力。
2. `preload` 是唯一桥接层，renderer 不直接访问 `ipcRenderer`、Node API 或 Electron API。
3. 文件夹工作区是当前 Sidebar 的主视角；如果未来改成 project-first，必须先更新本文档和界面结构命名文档。
4. session 历史回放和流式更新都要落到同一套 `Turn / AssistantTraceItem` 模型里，不能各自维护一套 UI 结构。
5. `system` trace item 当前属于状态模型的一部分，但不在常规 assistant 卡片中渲染；如果未来要展示它们，必须同步更新本文档和测试。
6. 新增 trace 类型时，必须同步更新 `types.ts`、`stream.ts`、样式和测试。
7. 如果未来调整 `Canvas Region Top Menu`、`Session Canvas Top Menu`、Inspector top menu 或新增左右区域视图，必须先更新文档。
8. 如果设置页重新改回 workspace / project 级作用域，必须先更新本文档和 API spec。

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
4. 工具审批加载、审批提交、恢复流式执行与发送禁用：`src/renderer/src/App.test.tsx`
5. 左右侧栏折叠、恢复、拖拽与键盘缩放：`src/renderer/src/App.test.tsx`
6. composer 模型菜单、agent mode、附件行为：`src/renderer/src/App.test.tsx`
7. 设置页 Provider / Models / Appearance 三个分组：`src/renderer/src/App.test.tsx`

建议的最低手工验收项：

1. 后端不可用时仍能看到 seed 侧栏，并能发送本地 fallback 回复。
2. 后端可用时能加载文件夹工作区并切换会话历史。
3. 在线发送消息时，`Send task` 在流式过程中会禁用，结束后恢复。
4. 待审批工具调用出现时，thread 内能直接审批，审批后能刷新历史并继续执行。
5. 打开设置页后，能够验证 `Provider`、`Models`、`Appearance` 三个分组都可正常使用。
6. 左右侧栏都能正确折叠、恢复和调整宽度。

## 11. 文档维护规则

以下情况必须同步更新本文档：

1. `useDesktopShell()`、`useAgentWorkspace()`、`useSettingsPage()` 的核心状态职责变化。
2. 会话历史回放策略、流式 trace 映射规则、审批流或发送流程变化。
3. 设置页的作用域、分组、保存链路或 Appearance 能力变化。
4. Composer 的模型选择、附件、agent mode 行为变化。
5. `Canvas Region Top Menu`、`Session Canvas Top Menu`、Inspector、左右侧栏之间的切换关系变化。
