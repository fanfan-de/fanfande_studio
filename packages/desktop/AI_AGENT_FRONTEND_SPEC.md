# AI Agent Frontend Spec (SSOT)

最后更新: 2026-04-01  
适用范围: `packages/desktop`  
唯一事实来源: 本文档为前端 UI/交互/命名规范的唯一事实来源（Single Source of Truth, SSOT）。

## 1. 目标与边界

本规范用于统一以下内容，避免“文档叫法”和“代码叫法”不一致：

1. 开发技术栈与运行时边界。
2. 界面区域命名（中文业务名 + 英文代码名）。
3. 交互流程与核心状态逻辑。

不在本规范范围内：

1. 后端 API 协议细节（当前为前端本地模拟数据）。
2. 视觉设计稿细节（颜色/字体微调以代码为准）。

## 2. 技术栈与版本基线

以 `package.json` 为准：

- Runtime: `Electron 39.2.7`
- Frontend: `React 19.2.0` + `react-dom 19.2.0`
- Build: `electron-vite 5.0.0` + `vite 7.3.1`
- Language: `TypeScript 5.9.3`
- Test: `Vitest 4.0.8` + `@testing-library/react 16.3.0` + `jsdom 27.0.0`

工程入口：

1. 主进程: `src/main/index.ts`
2. 预加载: `src/preload/index.ts`
3. 渲染进程入口: `src/renderer/src/main.tsx`
4. 页面主组件: `src/renderer/src/App.tsx`
5. 样式: `src/renderer/src/styles.css`

## 3. 架构职责

1. Main Process (`src/main/index.ts`)
- 创建 `BrowserWindow`（`frame: false` 自定义标题栏）。
- 处理 IPC：
  - `desktop:get-info`
  - `desktop:get-window-state`
  - `desktop:window-action`
  - `desktop:show-menu`
- 维护窗口最大化状态（含 Windows 手动最大化逻辑）。

2. Preload (`src/preload/index.ts`)
- 通过 `contextBridge` 暴露 `window.desktop` 安全 API。
- 作为 Renderer 与 Main 的唯一桥接层。

3. Renderer (`src/renderer/src/App.tsx`)
- 管理 UI 状态与交互行为。
- 仅通过 `window.desktop` 访问桌面能力。
- 当前业务数据为本地 `seedWorkspaces` + `initialConversations`。

## 4. 界面区域命名规范（文档/代码统一）

命名原则：

1. 文档中每个区域必须有“中文业务名 + 英文 Canonical Name”。
2. 代码中的 `className`、变量名、测试断言优先使用 Canonical Name。
3. 新增区域必须先补充本表，再落代码。

| 中文业务名 | Canonical Name | 代码锚点（class/结构） | 说明 |
| --- | --- | --- | --- |
| 窗口外壳 | Window Shell | `window-shell` | 页面根容器，承载标题栏和主体区 |
| 自定义标题栏 | Titlebar | `titlebar`, `titlebar-surface` | 顶部菜单与窗口控制区 |
| 标题栏菜单区 | Titlebar Menus | `titlebar-menus` | File/Edit/View/Window/Help |
| 窗口控制区 | Window Controls | `titlebar-controls`, `window-control` | 最小化/最大化/关闭 |
| 应用主体壳层 | App Shell | `app-shell` | 左侧栏 + 主画布二栏布局 |
| 项目侧栏 | Sidebar | `sidebar` | 项目与会话导航 |
| 侧栏动作条 | Sidebar Actions | `sidebar-actions`, `sidebar-action` | 密度切换/排序/新建 |
| 项目树 | Project Tree | `sidebar-projects`, `project-block` | 项目分组与展开逻辑 |
| 项目行 | Project Row | `project-row` | 项目一级导航 |
| 会话树 | Session Tree | `session-tree` | 当前项目下会话列表 |
| 会话行 | Session Row | `session-row` | 单会话切换入口 |
| 侧栏设置入口 | Sidebar Settings | `sidebar-settings` | 底部设置按钮 |
| 主画布 | Canvas | `canvas` | 右侧主内容区 |
| 画布顶部菜单 | Canvas Top Menu | `canvas-top-menu`, `canvas-top-menu-group`, `canvas-top-menu-button` | Overview/Artifacts/Changes/Console/Deploy |
| 线程容器 | Thread Shell | `thread-shell` | 消息流容器 |
| 线程列 | Thread Column | `thread-column` | 用户/助手 turn 列表 |
| 用户消息气泡 | User Bubble | `user-bubble` | 用户 turn 展示 |
| 助手消息卡 | Assistant Turn | `assistant-shell` | 结构化 agent 输出 |
| 阶段标签行 | Stage Row | `stage-row`, `stage-chip` | checklist 可视化 |
| 产物网格 | Artifact Grid | `artifact-grid`, `artifact-card` | 交付物卡片 |
| 下一步区块 | Next Step | `assistant-section next-step` | 下一动作建议 |
| 输入器 | Composer | `composer`, `prompt-input-shell` | 底部文本输入与发送 |
| 输入器工具栏 | Composer Toolbar | `composer-toolbar` | 模型标签与操作按钮 |

## 5. 数据模型（当前前端状态）

来自 `App.tsx`：

1. Session Status: `Live | Review | Ready`
2. Titlebar Menu Key: `file | edit | view | window | help`
3. Sidebar Action Key: `density | sort | new`
4. Canvas Menu Key: `overview | artifacts | changes | console | deploy`
5. Turn 类型：
- `UserTurn`
- `AssistantTurn`（包含 `summary/reasoning/checklist/artifacts/nextStep`）

核心 state：

1. `platform` 平台信息（来自 `window.desktop.getInfo()`）。
2. `isWindowMaximized` 窗口状态（来自 IPC + 订阅）。
3. `isSidebarCondensed` 侧栏密度状态。
4. `workspaces` 项目与会话树。
5. `activeSessionID` 当前会话。
6. `mode` (`Autopilot`/`Review`)。
7. `draft` 输入框草稿。
8. `conversations` 会话消息流。

## 6. 交互流程与逻辑

### 6.1 应用启动流程

1. Renderer 挂载后调用 `window.desktop.getInfo()` 写入 `platform`。
2. 调用 `window.desktop.getWindowState()` 初始化最大化状态。
3. 订阅 `onWindowStateChange`，实时同步 `isWindowMaximized`。
4. 若 API 不可用，保持降级展示（不阻塞 UI）。

### 6.2 标题栏流程

1. 点击菜单按钮 -> `showMenu(menuKey)` -> Main 弹出对应原生菜单。
2. 点击窗口按钮 -> `windowAction(action)`：
- `minimize`
- `toggle-maximize`
- `close`
3. 最大化切换后由 Main 下发 `desktop:window-state-changed`，Renderer 更新外壳 class。

### 6.3 侧栏流程

1. `density`：切换 `isSidebarCondensed`，仅影响密度样式。
2. `sort`：按 `updated` 倒序重排每个 workspace 的 `sessions`。
3. `new`：在当前 workspace 顶部插入新会话，并初始化一条 assistant welcome turn，同时切换为 active。
4. 点击项目行：激活该项目第一条会话。
5. 点击会话行：切换 `activeSessionID`。

### 6.4 画布顶部菜单流程

1. 顶部菜单由 `canvasMenuItems` 渲染为 `canvas-top-menu-button`。
2. 当前仅用于信息架构展示：首项 `Overview` 为默认激活态（`is-active`），其余为占位入口。

### 6.5 发送流程

1. 点击 `Send task`：
- 若 `draft.trim()` 为空，直接返回。
- 追加一条 `UserTurn`。
- 基于当前上下文生成一条 `AssistantTurn`（`buildAgentTurn`）。
- 更新当前 session：
  - `status = Live`（Autopilot）或 `Review`（Review 模式）
  - `summary = 用户输入`
  - `updated = now`
- 清空 `draft`。

### 6.6 状态转移规则

1. 新建会话默认 `Ready`。
2. 一次发送后，状态由 `Ready -> Live/Review`（取决于 mode）。
3. 会话切换不改变状态，仅切换显示上下文。

## 7. 规范约束（必须遵守）

1. 所有桌面能力访问必须走 `window.desktop`，禁止 Renderer 直接调用 Node/Electron API。
2. 新增 UI 区域时，必须先在本文档“命名规范表”登记，再实现代码。
3. 新增交互时，必须补充“交互流程与逻辑”章节，明确状态读写点。
4. 若代码与文档冲突，以“先更新文档再改代码”或“代码变更同 PR 同步文档”为准，不允许长期漂移。

## 8. 测试指令

标准命令（在 `packages/desktop` 目录执行）：

```bash
npm run typecheck
npm run test
```

开发预览：

```bash
npm run dev
```

最低验收点（与现有测试一致）：

1. 能渲染标题栏与核心工作区。
2. 窗口初始最大化状态能反映到 `window-shell is-maximized`。
3. 发送任务后，消息追加且输入框清空。
4. `prompt-input-shell` 是唯一保留圆角的容器（`28px`）。

## 9. 文档维护规则

变更任一项需同步更新本文档并在 PR 描述标注：

1. 技术栈版本变化。
2. UI 区域命名变化。
3. 交互流程/状态逻辑变化。
