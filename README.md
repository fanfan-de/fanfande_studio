# Fanfande Studio

Fanfande Studio 是一个面向本地项目工作的 AI Agent 桌面工作台。项目基于 `Electron + React + TypeScript` 构建桌面端界面，基于 `Bun + Hono + AI SDK` 提供本地 Agent 服务，目标是把项目工作区、会话、终端、模型配置、技能和工具调用整合到一个桌面应用里。

当前仓库采用 `pnpm workspace` 组织，核心由桌面端 `packages/desktop` 和 Agent 服务 `packages/fanfandeagent` 两部分组成。桌面端在开发和打包场景下都支持托管启动本地 Agent，也支持通过环境变量接入外部 Agent 服务。

## 核心能力

- 文件夹工作区与会话管理：按本地目录组织项目、创建会话并回放历史消息。
- 桌面化 AI 对话流：以流式事件渲染 reasoning、文本、工具调用、补丁和错误等 trace。
- 权限审批链路：对需要确认的操作进行审批、拒绝和状态追踪。
- 内置终端能力：通过 `node-pty` 和 `xterm` 提供 PTY 会话、终端回放和多标签终端面板。
- 项目级配置：支持 Provider、模型选择、MCP 服务、Skill 选择等项目侧配置。
- 托管 Agent 运行时：桌面端可自动拉起本地 Agent 服务，也可连接自定义 `baseURL`。
- Git 操作集成：桌面端已接入提交与推送相关能力。

## 项目结构

```text
.
├─ packages/
│  ├─ desktop/              Electron 桌面应用
│  │  ├─ src/main/          主进程、菜单、IPC、托管 Agent、PTY 代理
│  │  ├─ src/preload/       window.desktop 安全桥接层
│  │  └─ src/renderer/      React 界面、工作区、会话、终端、设置页
│  ├─ fanfandeagent/        Bun/Hono Agent 服务与核心能力
│  │  ├─ src/server/        HTTP / WebSocket 接口与路由
│  │  ├─ src/session/       会话处理、Prompt、流式输出
│  │  ├─ src/project/       项目与工作区建模
│  │  ├─ src/tool/          工具注册与执行
│  │  ├─ src/skill/         Skill 管理
│  │  └─ Test/              Agent 侧测试
│  └─ fanfandedesktoptest/  实验/测试包
├─ fanfande_studio_vault/   项目笔记、设计稿与补充文档
└─ package.json             Workspace 入口脚本
```

## 技术栈

- 桌面端：Electron、React 19、TypeScript、Vite、electron-vite
- Agent 服务：Bun、Hono、AI SDK、Model Context Protocol SDK
- 终端与交互：node-pty、xterm
- 测试：Vitest、Testing Library、Bun test
- 构建：pnpm workspace、electron-builder

## 快速开始

### 环境要求

- Node.js 20+
- pnpm 10+
- Bun 1.3+

> 本地开发和桌面端打包都依赖 Bun。桌面端在开发模式下会优先直接启动 `packages/fanfandeagent/src/server/start.ts`。

### 1. 安装依赖

```bash
corepack enable
pnpm install
```

### 2. 启动桌面端

```bash
pnpm --filter fanfande-desktop-agent dev
```

默认情况下，桌面端会尝试自动启动本地 Agent 服务。如果你已经单独启动了 Agent，或希望连接远程服务，可通过环境变量覆盖。

### 3. 单独启动 Agent 服务

```bash
cd packages/fanfandeagent
bun run dev:server
```

服务默认监听 `http://127.0.0.1:4096`。

## 常用命令

### 仓库根目录

```bash
pnpm build
pnpm dist
pnpm test
pnpm typecheck
```

这些命令默认会作用于 `packages/desktop`。

### `packages/desktop`

```bash
pnpm --filter fanfande-desktop-agent dev
pnpm --filter fanfande-desktop-agent build
pnpm --filter fanfande-desktop-agent dist
pnpm --filter fanfande-desktop-agent test
pnpm --filter fanfande-desktop-agent typecheck
```

### `packages/fanfandeagent`

```bash
cd packages/fanfandeagent
bun run dev:server
bun run test:server
bun run test:prompt
bun run test:tool
bun run docs
```

## 环境变量

| 变量名 | 作用 | 默认值 |
| --- | --- | --- |
| `FANFANDE_AGENT_BASE_URL` | 指定桌面端连接的 Agent 服务地址 | `http://127.0.0.1:4096` |
| `FANFANDE_AGENT_WORKDIR` | 新建会话时使用的默认工作目录 | 当前进程工作目录 |
| `FANFANDE_DISABLE_MANAGED_AGENT` | 设为 `1` 后禁用桌面端自动拉起 Agent | 未设置 |
| `FANFANDE_BUN_BINARY` | 指定 Bun 可执行文件路径 | 自动探测 |
| `FanFande_SERVER_HOST` | Agent 服务监听地址 | `127.0.0.1` |
| `FanFande_SERVER_PORT` | Agent 服务监听端口 | `4096` |

## 架构说明

### 桌面端 `packages/desktop`

- `src/main` 负责 Electron 窗口、菜单、IPC、托管 Agent 和 PTY 代理。
- `src/preload` 通过 `window.desktop` 暴露安全桥接接口。
- `src/renderer` 提供工作区侧栏、会话画布、设置页、全局技能管理和终端面板。

### Agent 服务 `packages/fanfandeagent`

- `src/server` 暴露项目、会话、权限、设置和 PTY 相关接口。
- `src/session` 负责消息处理、Prompt 组装、流式输出和工具调用链路。
- `src/project`、`src/skill`、`src/tool` 等模块负责项目状态、技能与工具系统。

## 打包说明

```bash
pnpm dist
```

打包流程会先准备内置 Agent 运行时，再通过 `electron-builder` 生成安装包。当前配置主要面向 `Windows x64`，产物位于 `packages/desktop/dist/`。

## 文档索引

- `packages/desktop/README.md`：桌面端包级说明
- `packages/desktop/AI_AGENT_FRONTEND_SPEC.md`：前端状态模型与交互规范
- `packages/desktop/DESKTOP_SERVER_API_SPEC.md`：桌面端与服务端接口约定
- `packages/desktop/FRONTEND_ARCHITECTURE_GUIDE.md`：前端结构导读
- `packages/fanfandeagent/src/server/spec.zh.md`：服务端路由与接口规范
- `fanfande_studio_vault/`：项目设计记录、架构思考与补充资料

## 当前状态

项目处于持续开发中，现阶段重点已经覆盖：

- 桌面端壳层与工作区/会话主流程
- Agent 服务基础路由与流式消息链路
- Provider / Model / MCP / Skill 配置入口
- PTY 终端与权限审批能力

如果你准备继续扩展这个项目，建议优先阅读：

1. `packages/desktop/src/renderer/src/App.tsx`
2. `packages/desktop/src/main/ipc.ts`
3. `packages/fanfandeagent/src/server/server.ts`
4. `packages/fanfandeagent/src/session/`

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE) for details.
