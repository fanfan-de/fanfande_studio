# Backend Maintenance Baseline

更新日期：2026-04-26

这份文档记录当前后端维护的基线。目标不是描述理想架构，而是给后续维护提供一个稳定参照：主链路是什么、改动前后要跑哪些验证、模块边界在哪里，以及哪些事情暂时不要做。

## 当前定位

`fanfandeagent` 是本地运行的 AI Agent 后端服务包，核心技术栈是：

- `Bun`
- `TypeScript`
- `Hono`
- `SQLite`
- `Vercel AI SDK`

当前系统已经具备可运行的 Agent 后端雏形，但还处在维护收敛阶段。后续改动优先目标是提高可读性、可测试性和故障定位效率，而不是快速堆新功能。

## 主链路

当前后端主链路可以理解为：

```text
HTTP API
  -> server/routes
  -> project / config / provider / session / tool / permission
  -> session prompt loop
  -> LLM stream
  -> tool execution / approval
  -> runtime events
  -> SQLite persistence
  -> HTTP JSON / SSE response
```

关键运行链路：

```text
Project
  -> Instance
  -> Session
  -> Prompt
  -> Processor
  -> LLM
  -> Tool
  -> RuntimeEvent / EventStore / Projector
  -> SQLite
```

关键调试链路：

```text
GET /healthz
GET /api/debug/runtime
GET /api/debug/sessions/:id/runtime
GET /api/sessions/:id/events/stream
POST /api/sessions/:id/messages/stream
POST /api/sessions/:id/resume/stream
```

## 验证命令

维护后端时，至少跑：

```powershell
corepack pnpm --filter fanfandeagent exec tsc --noEmit
corepack pnpm --filter fanfandeagent test:server
```

涉及工具执行、prompt loop、权限、模型适配时，追加：

```powershell
corepack pnpm --filter fanfandeagent test:tool
corepack pnpm --filter fanfandeagent test:prompt
corepack pnpm --filter fanfandeagent test:provider
```

本地启动服务：

```powershell
corepack pnpm --filter fanfandeagent dev:server
```

健康检查：

```powershell
curl http://127.0.0.1:4096/healthz
```

## 模块边界

### `src/server`

职责：

- 创建 Hono app
- 注册中间件、CORS、日志、错误处理
- 挂载 API routes
- 处理 HTTP request / response / SSE / websocket 边界

约束：

- route 只做参数解析、调用领域模块、组装响应
- 不在 route 里沉淀复杂业务规则
- 不在 route 里直接复制底层存储逻辑

### `src/project`

职责：

- 识别目录所属项目
- 管理 worktree / sandbox / git 项目身份
- 维护项目元数据

约束：

- 所有目录归属判断优先走 project / instance
- 不在 server route 里重复实现项目边界规则

### `src/session`

职责：

- 定义 session / message / part 数据结构
- 维护会话生命周期
- 组织 prompt loop
- 将 LLM stream、tool call、runtime event 写回持久化层

约束：

- runtime state 和 SQLite state 分开
- message / part schema 是跨模块契约，修改必须补测试
- prompt loop、processor、runtime event 的状态流必须可追踪

### `src/tool`

职责：

- 定义工具契约
- 执行工具参数校验、授权、输出标准化
- 暴露可供 LLM 调用的 tool runtime

约束：

- 工具返回结果统一标准化为 `ToolOutput`
- 危险操作必须保留授权/审批边界
- 工具执行结果要能进入 message part 和 runtime event

### `src/permission`

职责：

- 评估工具权限
- 创建、读取、审批 permission request
- 支持等待用户输入后的恢复

约束：

- 不把权限判断散落到各个工具或 route
- 权限状态必须可恢复、可审计

### `src/provider`

职责：

- 管理 provider catalog
- 合并 global / project / env / auth credential
- 创建运行时 model adapter

约束：

- provider 选择、认证状态、运行时 key/baseURL/header 必须走统一入口
- 不在 session processor 里直接读取 API key 或 provider config

### `src/config`

职责：

- 管理全局配置与项目配置
- 定义 provider / model / prompt / skill / mcp 等配置 schema

约束：

- 后续维护要继续收敛 global config 和 project config 的覆盖关系
- 不新增隐式配置来源

### `src/database`

职责：

- 管理 SQLite 连接
- 基于 Zod schema 建表、同步列、读写数据

约束：

- 业务模块不要拼散乱 SQL
- schema 演进必须考虑迁移和旧数据兼容

## 禁止事项

维护期间暂时不要做这些事：

- 不要重写整个后端
- 不要一次性大规模移动目录
- 不要把 route、service、database、tool 同时重构
- 不要为了通过测试删除真实业务断言
- 不要引入新的全局状态，除非有明确生命周期和重置机制
- 不要绕过 `Instance` 直接判断项目目录边界
- 不要绕过 provider/config/auth 统一入口直接读取模型配置
- 不要让工具返回未标准化结构
- 不要把错误吞掉后只返回通用失败
- 不要在没有测试保护的情况下修改 message / part / session schema

## 推荐维护顺序

1. 先保持 `tsc --noEmit` 通过。
2. 再保持 `test:server` 通过。
3. 每次只处理一个边界，例如 route 减重、provider 解析、session runtime event、tool output。
4. 修改共享契约时，先补或更新测试，再改实现。
5. 重构时保持 HTTP API 行为不变。

## 当前基线

截至本文件更新时，以下验证通过：

```powershell
corepack pnpm --filter fanfandeagent exec tsc --noEmit
corepack pnpm --filter fanfandeagent test:server
```

