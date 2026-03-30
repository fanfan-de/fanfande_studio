# FanfandeAgent TODO

更新日期：2026-03-28

这个文档只记录项目当前最重要的工作顺序，目标是先把最小闭环跑稳，再逐步扩展能力。

## 总原则

- 先保证“能跑通一次完整对话”，再扩展更多入口和能力。
- 核心域模型优先稳定，字段含义先定清楚，字段数量尽量少变。
- SQLite 作为唯一持久化入口，先保证写入正确、读回正确，再做索引、迁移、优化。
- `processor` 负责事件归档和状态推进，`llm` 只负责模型调用，职责要分开。
- CLI、HTTP、UI 都属于使用层，必须放在核心稳定之后再展开。

## 优先级 1：补“可运行主链路”

目标：先形成一个最小闭环。

`入口 -> Instance -> Project -> Session -> LLM -> Tool -> SQLite -> 返回结果`

### 任务清单

- [] 让 `src\dev\bootstrap-smoke.ts` 真正成为可执行入口
- [ ] 让 `src/server/server.ts` 不只是骨架，而是能驱动一条完整链路
- [ ] 打通入口到 `Instance` 的初始化
- [ ] 打通 `Instance` 到 `Project` 的定位与加载
- [ ] 打通 `Project` 到 `Session` 的创建、恢复、持久化
- [ ] 打通 `Session` 到 `LLM` 的一次完整调用
- [ ] 打通 `Tool` 调用结果回写
- [ ] 打通 SQLite 的落库与读回
- [ ] 确保最终能返回一次完整对话结果

### 完成标准

- 能稳定完成一次对话。
- 能把本次对话正确写入 SQLite。
- 能从 SQLite 回放这次对话。
- 入口执行时不依赖手工拼装内部对象。

## 优先级 2：稳定核心领域模型

目标：把 `project / session / message / part / tool / provider / agent` 的域对象定死。

### 任务清单

- [ ] 稳定 `src/session/message.ts` 的 schema 和字段含义
- [ ] 稳定 `src/session/session.ts` 的 schema 和字段含义
- [ ] 稳定 `src/agent/agent.ts` 的 schema 和字段含义
- [ ] 统一定义 `project` 的领域边界
- [ ] 统一定义 `part` 的语义
- [ ] 统一定义 `tool` 的调用与结果结构
- [ ] 统一定义 `provider` 的配置与能力描述
- [ ] 统一定义 `agent` 的职责和类型

### 说明

- 这一阶段尽量少改字段。
- 优先把“字段是什么意思”写清楚。
- 先稳定语义，再考虑兼容历史数据。

### 完成标准

- 每个核心域对象都有明确职责。
- 重要字段有稳定定义，不再随意增删改。
- 新代码可以根据文档直接理解数据结构含义。

## 优先级 3：持久化和回放

目标：让 SQLite 里的项目、会话、消息、parts 能可靠保存和读回。

### 任务清单

- [ ] 统一通过 `src/database/Sqlite.ts` 访问数据库
- [ ] 把 `src/database/Sqlite.ts` 变成唯一的数据入口
- [ ] 保证项目数据能正确写入 SQLite
- [ ] 保证会话数据能正确写入 SQLite
- [ ] 保证消息数据能正确写入 SQLite
- [ ] 保证 parts 数据能正确写入 SQLite
- [ ] 保证项目、会话、消息、parts 能按原样读回
- [ ] 补充最小回放能力，验证历史消息链路可恢复

### 说明

- 先做正确性，再做性能和结构优化。
- 先做最小可用 CRUD，再考虑索引、迁移、分表等问题。
- 回放的重点不是“展示得漂亮”，而是“数据没丢、顺序没乱、语义没变”。

### 完成标准

- SQLite 中的数据结构能稳定支撑回放。
- 读回结果和写入结果语义一致。
- 回放可以恢复一次会话的历史上下文。

## 优先级 4：补 LLM 执行循环

目标：把 `prompt -> stream -> tool call -> tool result -> finish` 跑完整。

### 任务清单

- [ ] 明确 `src/session/processor.ts` 的职责边界
- [ ] 明确 `src/session/llm.ts` 的职责边界
- [ ] 让 `llm` 只负责模型调用
- [ ] 让 `processor` 只负责流事件归档和状态推进
- [ ] 接通 prompt 输入
- [ ] 接通流式输出事件
- [ ] 接通 tool call 事件
- [ ] 接通 tool result 回写
- [ ] 接通 finish 收尾逻辑

### 说明

- 这一层的重点是责任分离，不是把逻辑堆在一个文件里。
- 先让循环闭合，再考虑更多模型适配和复杂中间态。

### 完成标准

- 一次模型调用可以完整走到结束。
- 工具调用和工具结果能被正确归档。
- 流式事件不会丢失。

## 优先级 5：最后再做 CLI / HTTP / UI

目标：把使用层放到核心之上，避免业务逻辑散落在多个入口。

### 任务清单

- [ ] 先保持 CLI 只做薄封装
- [ ] 先保持 Server 只做薄封装
- [ ] 先保持 TUI / UI 只做薄封装
- [ ] 统一复用核心链路，不在入口层重复写业务逻辑
- [ ] 再补 `src/cli/cmd/agent.ts`
- [ ] 再补 `src/server/routes/session.ts`

### 说明

- CLI、Server、TUI 都应该依赖核心，不应该反过来驱动核心设计。
- 入口层越薄，后续维护成本越低。

### 完成标准

- 核心能力可以被多个入口复用。
- 不同入口的行为保持一致。
- 入口层不再承载主要业务规则。

## 长期维护规则

- 新功能优先判断属于哪一层，再决定是否进入本文件。
- 如果发现某个文件同时承担“模型、流程、持久化、入口”多种职责，要优先拆分。
- 如果一个改动会让字段语义变模糊，先停下来补定义，再继续实现。
- 如果一个改动只是优化体验，但会打断主链路稳定性，先延后。

## 当前建议顺序

1. 先跑通最小闭环。
2. 再稳定领域模型。
3. 再补持久化和回放。
4. 再补 LLM 执行循环。
5. 最后统一入口层。


## 新增待办：前后端 Contract-First 解耦（暂不实施）

> 状态：暂缓，先记录设计与测试边界，后续再落地实现。

### 目标

前端需要知道后端请求/响应格式，但前端代码不直接引用后端实现文件（`packages/fanfandeagent/src/**`）。

### 任务清单

- [ ] 新建独立协议包 `packages/fanfande-contracts`（只放 schema/type/error-code，不放业务实现）
- [ ] 在协议包中定义 `projects`、`sessions`、`messages/stream` 的请求/响应与 SSE 事件 schema
- [ ] 后端 `packages/fanfandeagent` 改为依赖 `fanfande-contracts` 做输入输出校验
- [ ] 前端 `packages/fanfandedesktop` 仅依赖 `fanfande-contracts`（或由其生成的 SDK）
- [ ] 前端增加 `AgentGateway` 抽象：`MockGateway` / `HttpGateway`，UI 层只调用网关接口
- [ ] 增加 ESLint 规则：禁止前端直接 import `fanfandeagent` 源码
- [ ] 增加 CI 合约漂移检查：后端实际响应必须通过 contracts 校验

### 验收标准

- [ ] `ADAPTER=mock` 时，前端不启动后端也可本地开发与跑测
- [ ] `ADAPTER=http` 时，前端仅通过协议层与后端通信，无跨包源码依赖
- [ ] 前端仓库中无 `import` 指向 `packages/fanfandeagent/src/**`
- [ ] 合约测试与联调测试均通过

### 测试指令（规划）

```bash
# 1) 协议/合约测试：验证后端响应与 contracts 一致
bun run test:contract

# 2) 前端离线能力：mock 模式不依赖后端
ADAPTER=mock bun run test

# 3) 前后端联调：HTTP 适配器符合协议
ADAPTER=http bun run test:integration

# 4) 依赖边界检查：禁止前端直引后端源码
bun run lint
```
