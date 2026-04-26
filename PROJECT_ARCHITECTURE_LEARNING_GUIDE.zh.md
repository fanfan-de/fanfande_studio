# Fanfande Studio 架构理解知识地图

最后更新: 2026-04-27

这份文档回答一个问题：如果想深度理解当前项目架构，需要补齐哪些知识，以及应该按什么顺序读代码。

当前先按一个默认读者画像来写：你已经能读 TypeScript / React 代码，理解基本前后端请求，但还没有系统梳理过 Electron 桌面端、本地 Agent 服务、流式 AI 工程和工具调用链路。文末有一组自评问题，你回答后可以继续把这份文档改成更贴近你当前水平的版本。

## 1. 先建立项目全局心智模型

Fanfande Studio 不是一个单纯前端项目，也不是一个单纯后端服务。它更像一个本地优先的 AI Agent 桌面工作台。

核心链路可以记成：

```text
React Renderer -> window.desktop Bridge -> Electron Main -> Local Agent Server -> LLM / Tool / DB
```

对应源码是：

```text
C:\Projects\fanfande_studio
├─ packages\desktop
│  ├─ src\main       Electron 主进程、窗口、菜单、IPC、托管 Agent、PTY 代理
│  ├─ src\preload    window.desktop 安全桥接层
│  └─ src\renderer   React 工作台、会话 UI、终端、设置、状态管理
└─ packages\fanfandeagent
   ├─ src\server     Hono HTTP / WebSocket / SSE 接口
   ├─ src\session    会话、消息、Prompt、流式处理、工具调用
   ├─ src\project    项目和工作目录建模
   ├─ src\tool       内建工具注册和执行
   ├─ src\skill      Skill 管理
   ├─ src\mcp        MCP server 连接和工具适配
   └─ src\database   SQLite 持久化
```

如果只能先记一句话：`desktop` 负责用户界面和本机能力入口，`fanfandeagent` 负责 Agent 运行时、会话生命周期、模型调用、工具执行和持久化。

## 2. 必备知识分层

### 2.1 TypeScript 和模块化

你需要掌握：

- TypeScript 类型、接口、联合类型、泛型和类型收窄。
- ESM import/export。
- `package.json` scripts、dependencies、devDependencies。
- `pnpm workspace` 的包组织方式。
- `paths/imports` 风格的模块别名，尤其是 `fanfandeagent` 里的 `#server/*`、`#session/*`。

为什么重要：

- `packages/desktop/src/main/types.ts` 和 `packages/desktop/src/preload/index.ts` 有大量跨进程 API 类型。
- `packages/fanfandeagent/package.json` 使用 `imports` 把领域模块映射成 `#xxx/*`。
- 项目是 monorepo，根目录命令多数通过 `pnpm --filter` 调到具体包。

先读：

- `C:\Projects\fanfande_studio\package.json`
- `C:\Projects\fanfande_studio\pnpm-workspace.yaml`
- `C:\Projects\fanfande_studio\packages\desktop\package.json`
- `C:\Projects\fanfande_studio\packages\fanfandeagent\package.json`

### 2.2 Electron 三进程模型

你需要掌握：

- Electron main process 和 renderer process 的职责差异。
- preload 脚本为什么存在。
- `contextBridge.exposeInMainWorld()` 如何把安全 API 暴露给页面。
- `ipcMain.handle()` / `ipcRenderer.invoke()` 的请求响应模式。
- 为什么 renderer 不应该直接访问 Node.js、文件系统或系统命令。

为什么重要：

- 当前桌面端的真实主链路就是 `renderer -> preload -> main`。
- 新增桌面能力时，通常要按 `main -> preload -> renderer` 的顺序接线。
- 安全边界在 preload，不理解这层就容易把系统能力暴露得过宽。

先读：

- `C:\Projects\fanfande_studio\packages\desktop\src\main\index.ts`
- `C:\Projects\fanfande_studio\packages\desktop\src\main\window.ts`
- `C:\Projects\fanfande_studio\packages\desktop\src\main\ipc.ts`
- `C:\Projects\fanfande_studio\packages\desktop\src\preload\index.ts`

### 2.3 React 工作台架构

你需要掌握：

- React function component、hooks、状态提升和副作用。
- `useState`、`useEffect`、`useRef`、`useSyncExternalStore` 的职责差异。
- 组件层和业务 hook 层如何拆分。
- UI 状态、服务端状态、临时交互状态之间的区别。

为什么重要：

- `App.tsx` 现在更像装配层，不应该继续堆业务逻辑。
- `useDesktopShell()` 管桌面壳状态。
- `useAgentWorkspace()` 管工作区、会话、发送消息、权限请求、diff、模型选择等主业务状态。
- `agent-session` 子目录开始把会话订阅状态拆成 store / event router。

先读：

- `C:\Projects\fanfande_studio\packages\desktop\src\renderer\src\App.tsx`
- `C:\Projects\fanfande_studio\packages\desktop\src\renderer\src\app\use-desktop-shell.ts`
- `C:\Projects\fanfande_studio\packages\desktop\src\renderer\src\app\use-agent-workspace.ts`
- `C:\Projects\fanfande_studio\packages\desktop\src\renderer\src\app\components.tsx`
- `C:\Projects\fanfande_studio\packages\desktop\src\renderer\src\app\agent-session\store.ts`
- `C:\Projects\fanfande_studio\packages\desktop\src\renderer\src\app\agent-session\event-router.ts`

### 2.4 桌面端和 Agent 服务通信

你需要掌握：

- HTTP JSON API。
- SSE 流式响应。
- WebSocket 和 SSE 的适用差异。
- 请求失败、重连、订阅恢复、事件去重的基本策略。
- 前端如何把服务端事件映射成 UI trace。

为什么重要：

- 桌面端 main 层通过 `agent-client.ts` 和 `ipc.ts` 调用 Agent 服务。
- 会话消息走 `/api/sessions/:id/messages/stream` 这类流式接口。
- renderer 不是直接 fetch server，而是通过 `window.desktop` 间接调用。
- 实时事件和历史回放最终都需要映射成同一套会话 UI 模型。

先读：

- `C:\Projects\fanfande_studio\packages\desktop\src\main\agent-client.ts`
- `C:\Projects\fanfande_studio\packages\desktop\src\main\ipc.ts`
- `C:\Projects\fanfande_studio\packages\desktop\src\renderer\src\app\stream.ts`
- `C:\Projects\fanfande_studio\packages\fanfandeagent\src\server\server.ts`
- `C:\Projects\fanfande_studio\packages\fanfandeagent\src\server\routes\session.ts`

### 2.5 Bun + Hono 服务端架构

你需要掌握：

- Bun 作为 TypeScript 运行时的基本使用方式。
- Hono 路由、中间件、错误处理和响应对象。
- 服务端分层：route、use case、domain module、persistence。
- 环境变量如何决定监听地址、端口、日志等运行行为。

为什么重要：

- `fanfandeagent` 是本地 Agent 运行时，不是普通静态库。
- `desktop` 在开发和打包时都可能托管启动这个服务。
- 服务端路由是前端 bridge 契约的另一端。

先读：

- `C:\Projects\fanfande_studio\packages\fanfandeagent\src\server\start.ts`
- `C:\Projects\fanfande_studio\packages\fanfandeagent\src\server\server.ts`
- `C:\Projects\fanfande_studio\packages\fanfandeagent\src\server\spec.zh.md`
- `C:\Projects\fanfande_studio\packages\desktop\src\main\managed-agent.ts`

### 2.6 Agent 会话、消息和流式处理

你需要掌握：

- Session、Message、Part 的区别。
- 一轮用户输入如何进入模型。
- 模型输出如何拆成 text、reasoning、tool-call、tool-result、error 等事件。
- 历史消息如何重新投喂模型。
- 为什么需要运行时 debug、event store、live stream hub。

为什么重要：

- 这个项目的核心不是“聊天 UI”，而是可恢复、可追踪的 Agent 会话。
- UI 看到的 trace 只是后端 session state 和 streaming events 的投影。
- 深入理解架构时，`session` 是后端最关键模块。

先读：

- `C:\Projects\fanfande_studio\packages\fanfandeagent\ARCHITECTURE.md`
- `C:\Projects\fanfande_studio\packages\fanfandeagent\src\session\SESSION_ARCHITECTURE.md`
- `C:\Projects\fanfande_studio\packages\fanfandeagent\src\session\session.ts`
- `C:\Projects\fanfande_studio\packages\fanfandeagent\src\session\message.ts`
- `C:\Projects\fanfande_studio\packages\fanfandeagent\src\session\processor.ts`
- `C:\Projects\fanfande_studio\packages\fanfandeagent\src\session\llm.ts`

### 2.7 LLM Provider、AI SDK 和工具调用

你需要掌握：

- Provider / Model / capability 的抽象。
- Vercel AI SDK 的 message、tool、stream 基本概念。
- 工具 schema 如何提供给模型。
- 工具调用结果如何回写成消息历史。
- 权限审批为什么要接在工具执行前。

为什么重要：

- 当前模型不是写死一个 API，而是通过 provider / model selection 做抽象。
- 工具调用是 Agent 能力的核心，不理解工具链路就只能理解 UI 表面。
- 权限系统、MCP、内建工具最终都会汇入工具执行链。

先读：

- `C:\Projects\fanfande_studio\packages\fanfandeagent\src\provider\provider.ts`
- `C:\Projects\fanfande_studio\packages\fanfandeagent\src\provider\modelsdev.ts`
- `C:\Projects\fanfande_studio\packages\fanfandeagent\src\tool\registry.ts`
- `C:\Projects\fanfande_studio\packages\fanfandeagent\src\session\resolve-tools.ts`
- `C:\Projects\fanfande_studio\packages\fanfandeagent\src\permission\permission.ts`

### 2.8 MCP 和 Skill 系统

你需要掌握：

- Skill 是“提示词/文档型能力注入”，不是独立执行引擎。
- MCP 是外部工具服务协议，需要连接、列工具、执行工具、转换结果。
- MCP tool 最终要适配成内部 ToolInfo，再交给模型调用。
- Project 级和 Global 级配置的区别。

为什么重要：

- 项目设置页已经暴露 Skills 和 MCP 配置。
- 深入架构时，要区分“给模型更多上下文”和“给模型更多可执行工具”。
- MCP、内建工具、权限系统最终会在 session processor 里汇合。

先读：

- `C:\Projects\fanfande_studio\packages\fanfandeagent\docs\skills-mcp-architecture.zh.md`
- `C:\Projects\fanfande_studio\packages\fanfandeagent\src\skill\skill.ts`
- `C:\Projects\fanfande_studio\packages\fanfandeagent\src\skill\manage.ts`
- `C:\Projects\fanfande_studio\packages\fanfandeagent\src\mcp\client.ts`
- `C:\Projects\fanfande_studio\packages\fanfandeagent\src\mcp\manager.ts`

### 2.9 PTY、终端和本机进程

你需要掌握：

- PTY 和普通 child process 的区别。
- `node-pty` 如何创建伪终端。
- xterm 如何渲染终端输出。
- 终端输出回放、cursor、attach/detach、resize 的基本概念。
- WebSocket / IPC 在终端链路里的角色。

为什么重要：

- 当前项目内置终端不是 UI 假面，而是真实 PTY 会话。
- Agent 侧负责 PTY session runtime，desktop 侧负责代理和 UI 面板。
- 终端状态要支持恢复和多标签，因此会比普通命令执行复杂。

先读：

- `C:\Projects\fanfande_studio\packages\desktop\src\main\pty-proxy.ts`
- `C:\Projects\fanfande_studio\packages\desktop\src\renderer\src\app\terminal\`
- `C:\Projects\fanfande_studio\packages\fanfandeagent\src\pty\`
- `C:\Projects\fanfande_studio\packages\fanfandeagent\Test\server.pty.test.ts`

### 2.10 持久化、事件和状态恢复

你需要掌握：

- SQLite 的基本表、事务、查询。
- 服务端内存状态和持久状态的区别。
- Event bus 的作用。
- 应用重启后如何恢复项目、会话、消息和运行态。
- 为什么 UI 不应该只依赖内存里的一份 conversation state。

为什么重要：

- Agent 服务需要保存会话历史、消息 part、项目配置和运行状态。
- 桌面端启动时会加载 project/workspace/session，再回放历史。
- 流式执行时还要处理断线、重连、重复事件和已完成 turn。

先读：

- `C:\Projects\fanfande_studio\packages\fanfandeagent\src\database\Sqlite.ts`
- `C:\Projects\fanfande_studio\packages\fanfandeagent\src\database\spec.md`
- `C:\Projects\fanfande_studio\packages\fanfandeagent\src\bus\`
- `C:\Projects\fanfande_studio\packages\fanfandeagent\src\session\event-store.ts`
- `C:\Projects\fanfande_studio\packages\fanfandeagent\src\session\live-stream-hub.ts`

### 2.11 构建、打包和运行时分发

你需要掌握：

- Vite 和 electron-vite 的三段构建：main、preload、renderer。
- Electron 应用打包的基本概念。
- 桌面端如何把 Agent runtime 打进产物。
- 开发态 source runtime 和打包态 bundled runtime 的差异。

为什么重要：

- 项目不是只要 `vite build` 就结束，桌面端还要准备 Agent runtime。
- `managed-agent.ts` 会在开发态优先启动源码里的 `fanfandeagent`。
- 打包后需要从 resources 目录寻找 bundled runtime。

先读：

- `C:\Projects\fanfande_studio\packages\desktop\electron.vite.config.ts`
- `C:\Projects\fanfande_studio\packages\desktop\electron-builder.yml`
- `C:\Projects\fanfande_studio\packages\desktop\scripts\prepare-agent-runtime.mjs`
- `C:\Projects\fanfande_studio\packages\desktop\src\main\managed-agent.ts`

### 2.12 测试和调试

你需要掌握：

- Vitest 单元测试和 React Testing Library。
- Bun test。
- 如何为纯函数、IPC 契约、服务端路由、流式事件分别设计测试。
- 日志、运行时 debug、最小复现和契约测试。

为什么重要：

- 桌面端测试偏 UI、状态映射、main 层工具函数。
- Agent 侧测试偏 server API、session processor、tool contract、provider adapter。
- 架构理解最终要能落到“改哪里、测哪里、怎么验证”。

先读：

- `C:\Projects\fanfande_studio\packages\desktop\src\renderer\src\App.test.tsx`
- `C:\Projects\fanfande_studio\packages\desktop\src\renderer\src\app\stream.test.ts`
- `C:\Projects\fanfande_studio\packages\desktop\src\main\agent-client.test.ts`
- `C:\Projects\fanfande_studio\packages\fanfandeagent\Test\server.api.test.ts`
- `C:\Projects\fanfande_studio\packages\fanfandeagent\Test\tool.contract.test.ts`
- `C:\Projects\fanfande_studio\packages\fanfandeagent\Test\processor.test.ts`

## 3. 推荐学习顺序

### 阶段 A: 跑起来并看清边界

目标：知道每个进程是谁、怎么启动、怎么通信。

要掌握：

1. 根目录 `package.json` scripts。
2. `packages/desktop` 的 Electron 启动入口。
3. `packages/fanfandeagent` 的 Hono server 启动入口。
4. `FANFANDE_AGENT_BASE_URL`、`FANFANDE_DISABLE_MANAGED_AGENT` 等环境变量。

读代码顺序：

1. `C:\Projects\fanfande_studio\README.md`
2. `C:\Projects\fanfande_studio\packages\desktop\src\main\index.ts`
3. `C:\Projects\fanfande_studio\packages\desktop\src\main\managed-agent.ts`
4. `C:\Projects\fanfande_studio\packages\fanfandeagent\src\server\start.ts`
5. `C:\Projects\fanfande_studio\packages\fanfandeagent\src\server\server.ts`

### 阶段 B: 读懂桌面端主链路

目标：知道 UI 的一个动作如何穿过 bridge 到 main，再到 Agent server。

建议拿“发送一条消息”作为样例：

```text
Composer submit
-> useAgentWorkspace()
-> window.desktop.agentSession.sendTurn() 或 streamAgentMessage()
-> preload ipcRenderer.invoke()
-> main ipcMain.handle()
-> POST /api/sessions/:id/messages/stream
-> SSE event
-> renderer event handler
-> stream.ts 映射为 UI trace
```

重点文件：

1. `C:\Projects\fanfande_studio\packages\desktop\src\renderer\src\app\composer\Composer.tsx`
2. `C:\Projects\fanfande_studio\packages\desktop\src\renderer\src\app\use-agent-workspace.ts`
3. `C:\Projects\fanfande_studio\packages\desktop\src\preload\index.ts`
4. `C:\Projects\fanfande_studio\packages\desktop\src\main\ipc.ts`
5. `C:\Projects\fanfande_studio\packages\desktop\src\renderer\src\app\stream.ts`

### 阶段 C: 读懂 Agent 会话核心

目标：知道一次用户输入如何变成模型调用、工具调用、消息持久化和流式事件。

重点问题：

1. Session 和 Message 的关系是什么？
2. 用户输入在哪里进入后端？
3. Prompt 在哪里组装？
4. Tool schema 在哪里生成？
5. 模型输出在哪里被拆成 part？
6. 哪些事件会发给 desktop？
7. 历史消息如何恢复？

重点文件：

1. `C:\Projects\fanfande_studio\packages\fanfandeagent\src\server\routes\session.ts`
2. `C:\Projects\fanfande_studio\packages\fanfandeagent\src\session\processor.ts`
3. `C:\Projects\fanfande_studio\packages\fanfandeagent\src\session\llm.ts`
4. `C:\Projects\fanfande_studio\packages\fanfandeagent\src\session\message.ts`
5. `C:\Projects\fanfande_studio\packages\fanfandeagent\src\session\resolve-tools.ts`

### 阶段 D: 读懂配置、权限、Skill、MCP

目标：知道模型、Skill、MCP、权限如何影响一轮 Agent 执行。

重点问题：

1. Global 配置和 Project 配置如何区分？
2. Provider catalog 和 model selection 从哪里来？
3. Skill 是如何被发现、选择、注入 prompt 的？
4. MCP server 是如何变成 tool 的？
5. 哪些工具调用需要权限审批？
6. 被拒绝或等待审批时，session 如何暂停和恢复？

重点文件：

1. `C:\Projects\fanfande_studio\packages\fanfandeagent\docs\skills-mcp-architecture.zh.md`
2. `C:\Projects\fanfande_studio\packages\fanfandeagent\src\config\config.ts`
3. `C:\Projects\fanfande_studio\packages\fanfandeagent\src\provider\provider.ts`
4. `C:\Projects\fanfande_studio\packages\fanfandeagent\src\skill\skill.ts`
5. `C:\Projects\fanfande_studio\packages\fanfandeagent\src\mcp\manager.ts`
6. `C:\Projects\fanfande_studio\packages\fanfandeagent\src\permission\permission.ts`

### 阶段 E: 读懂终端、文件、Git 和系统能力

目标：知道哪些能力属于 desktop main，哪些能力属于 Agent server，哪些能力只是 UI 展示。

重点问题：

1. 文件选择、菜单、窗口控制为什么放在 Electron main？
2. 终端 session 为什么由 Agent 侧 runtime 管？
3. desktop 的 PTY proxy 解决什么问题？
4. Git 能力在哪些层暴露？
5. workspace diff、workspace files、file watch 如何触发 UI 更新？

重点文件：

1. `C:\Projects\fanfande_studio\packages\desktop\src\main\workspace-files.ts`
2. `C:\Projects\fanfande_studio\packages\desktop\src\main\workspace-watch.ts`
3. `C:\Projects\fanfande_studio\packages\desktop\src\main\workspace-diff.ts`
4. `C:\Projects\fanfande_studio\packages\desktop\src\main\git.ts`
5. `C:\Projects\fanfande_studio\packages\desktop\src\main\pty-proxy.ts`
6. `C:\Projects\fanfande_studio\packages\fanfandeagent\src\pty\`

## 4. 深度理解时必须回答的架构问题

读完一轮后，应该能回答这些问题：

1. 为什么项目要拆成 `desktop` 和 `fanfandeagent` 两个核心包？
2. 为什么 renderer 不直接调用 Agent server？
3. preload 层暴露 API 时，哪些参数需要保持类型稳定？
4. 新增一个后端接口时，需要同步改哪些 desktop 文件？
5. 发送消息和会话订阅是同一条链路还是两条链路？
6. 历史消息回放和实时流式事件如何共享 UI trace 模型？
7. Agent 侧为什么要区分 Project、Instance、Session？
8. Tool、Skill、MCP 三者的边界是什么？
9. 权限审批为什么不能只做在 UI 层？
10. PTY 终端为什么需要 cursor、replay、attach/detach？
11. 如果桌面端重启，哪些状态从 SQLite 恢复，哪些状态从本地 UI preference 恢复？
12. 如果 Agent 服务不可用，desktop 如何降级？
13. 打包后 Agent runtime 从哪里启动？
14. 改一个功能时，如何判断测试应该写在 desktop 还是 fanfandeagent？

## 5. 不同目标对应的学习重点

### 只想改 UI

重点学：

- React component / hook。
- CSS tokens 和现有样式组织。
- `useDesktopShell()` / `useAgentWorkspace()` 返回的数据结构。
- renderer 测试。

暂时可以浅读：

- Agent session processor。
- MCP client 内部细节。
- SQLite schema。

### 想改桌面能力

重点学：

- Electron main / preload / IPC。
- 系统菜单、窗口、dialog、shell。
- `window.desktop` API 设计。
- main 层测试。

必须注意：

- 不要让 renderer 直接绕过 preload。
- 不要随便扩大 preload 暴露面。
- 新 API 要同步类型、实现、调用和文档。

### 想改 Agent 能力

重点学：

- Hono routes。
- Project / Session 数据模型。
- AI SDK stream。
- Tool registry 和 permission。
- SQLite persistence。

必须注意：

- 不要只改路由返回，不改 desktop bridge 契约。
- 不要只改实时流，不考虑历史回放。
- 不要只改内存状态，不考虑重启恢复。

### 想做架构演进

重点学：

- Monorepo 边界和包职责。
- IPC / HTTP / SSE / WebSocket 的契约设计。
- 数据模型不变量。
- 事件流和恢复策略。
- 测试分层。

必须注意：

- 先写清楚不变量，再动共享模型。
- 先确认现有文档里的 SSOT，避免多个文档互相打架。
- 大改动要从一条端到端链路验证，而不是只看单层测试通过。

## 6. 推荐文档阅读路线

第一轮，只读总览：

1. `C:\Projects\fanfande_studio\README.md`
2. `C:\Projects\fanfande_studio\PROJECT_ANALYSIS.md`
3. `C:\Projects\fanfande_studio\packages\desktop\FRONTEND_ARCHITECTURE_GUIDE.md`
4. `C:\Projects\fanfande_studio\packages\fanfandeagent\ARCHITECTURE.md`

第二轮，读契约：

1. `C:\Projects\fanfande_studio\packages\desktop\DESKTOP_SERVER_API_SPEC.md`
2. `C:\Projects\fanfande_studio\packages\desktop\AI_AGENT_FRONTEND_SPEC.md`
3. `C:\Projects\fanfande_studio\packages\fanfandeagent\src\server\spec.zh.md`
4. `C:\Projects\fanfande_studio\packages\fanfandeagent\src\session\spec.md`

第三轮，读专项：

1. `C:\Projects\fanfande_studio\packages\fanfandeagent\src\session\SESSION_ARCHITECTURE.md`
2. `C:\Projects\fanfande_studio\packages\fanfandeagent\docs\skills-mcp-architecture.zh.md`
3. `C:\Projects\fanfande_studio\packages\desktop\docs\ui-design\appearance-semantic-tokens.md`
4. `C:\Projects\fanfande_studio\packages\desktop\docs\ui-design\dropdown-select-spec.md`

## 7. 建议的实战练习

### 练习 1: 追踪一个窗口动作

任务：从 renderer 的关闭窗口按钮开始，追到 Electron main。

你应该能说清：

- 哪个组件触发动作。
- 调用了 `window.desktop` 的哪个方法。
- preload 如何转发。
- main 层哪个 `ipcMain.handle()` 处理。
- 最终调用了哪个 Electron API。

### 练习 2: 追踪一次消息发送

任务：输入一条消息并发送，从 UI 追到 Agent session processor。

你应该能说清：

- user turn 在 renderer 里如何创建。
- backend session id 和 UI session id 如何对应。
- 请求走哪个 IPC channel。
- 后端走哪个 HTTP route。
- SSE 事件如何回到 renderer。
- `stream.ts` 如何生成 trace。

### 练习 3: 新增一个只读 bridge 能力

任务：新增一个简单的 desktop API，比如返回当前 app path 或 agent config 的一个只读字段。

你应该练到：

- main 注册 IPC。
- preload 暴露方法。
- renderer 调用方法。
- 补类型。
- 补最小测试或手动验证步骤。

### 练习 4: 新增一种 trace 映射

任务：在 `stream.ts` 中支持一种新的后端 event / part，并让历史回放和实时流都一致。

你应该练到：

- 不把映射逻辑写散到组件里。
- 给纯函数补测试。
- 确认 UI 展示和历史回放一致。

### 练习 5: 读懂一个 MCP tool 的进入路径

任务：从 MCP server 配置开始，追到模型可调用的 tool schema。

你应该能说清：

- MCP server 配置在哪里保存。
- client 如何连接 server。
- manager 如何列工具并转换。
- registry 如何合并内建工具和 MCP 工具。
- permission 如何参与执行。

## 8. 自评问题

为了把这份文档改成更适合你的版本，可以回答下面问题。你不需要一次全部回答，回答最有把握的几项也可以。

1. 你现在主要熟悉哪一块：前端、后端、桌面端、AI/LLM、还是全栈？
2. TypeScript 你能读到什么程度：只会基础类型、能写 React 业务、还是能设计复杂类型？
3. React hooks、组件拆分、状态管理你是否熟悉？
4. 你以前是否写过 Electron？是否理解 main / preload / renderer？
5. 你是否熟悉 HTTP API、SSE、WebSocket？
6. 你是否用过 Bun、Hono 或类似的 Node.js 服务端框架？
7. 你是否理解 LLM streaming、tool calling、AI SDK 这类概念？
8. 你是否接触过 MCP？
9. 你是否熟悉 SQLite、事件总线、状态持久化？
10. 你的目标是读懂架构、能改 UI、能改 Agent 后端、还是能做整体架构设计？

## 9. 当前最短路径

如果你想用最少时间进入状态，建议按这个顺序：

1. 跑起来：`pnpm --filter fanfande-desktop-agent dev`。
2. 看总链路：读 `packages\desktop\FRONTEND_ARCHITECTURE_GUIDE.md` 的启动流程和发送消息流程。
3. 看 bridge：对照 `src\preload\index.ts` 和 `src\main\ipc.ts`。
4. 看后端入口：读 `packages\fanfandeagent\src\server\server.ts` 和 session route。
5. 看核心会话：读 `src\session\processor.ts`、`message.ts`、`llm.ts`。
6. 做一个小改动：优先选择 trace 映射、只读 IPC 或 UI 展示类改动。
7. 补测试：desktop 用 Vitest，Agent 用 Bun test。

真正深度理解这套项目，不是把每个文件都背下来，而是能在脑子里稳定还原三条链路：

```text
启动链路: dev/build -> Electron main -> managed agent -> renderer
交互链路: React UI -> preload -> main IPC -> Agent HTTP/SSE -> UI trace
执行链路: Session -> LLM -> Tool / Permission / MCP -> Message / Event / Database
```

掌握这三条链路后，再读局部模块会容易很多。
