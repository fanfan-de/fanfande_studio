# FanfandeAgent Architecture

## 1. 这个项目是什么

`fanfandeagent` 是一个本地运行的 AI Agent 服务包，目标是把「项目上下文、会话历史、工具调用、模型推理、结果持久化」串成一条可持续运行的工作流。

技术栈目前主要是：
- `Bun`
- `TypeScript`
- `Vercel AI SDK`
- `Hono`
- `SQLite`

这份文档的作用不是把每个文件都解释一遍，而是说明：
- 系统由哪些核心模块组成
- 模块之间怎么协作
- 数据从哪里来、到哪里去
- 哪些事情可以改，哪些事情不该改

## 2. 设计目标

这个包的核心目标可以概括为 4 件事：

1. 管理项目上下文，区分不同工作目录、Git 仓库和全局环境
2. 管理会话生命周期，保存 message / part / session 的历史
3. 接入模型和工具，让 LLM 能够流式推理并执行工具调用
4. 让所有状态变化可追踪、可恢复、可调试

## 3. 核心架构

### 3.1 总体结构

可以把系统理解成一条链：

`Project` -> `Instance` -> `Session` -> `LLM` / `Tool` -> `Database` / `Bus`

其中：
- `Project` 负责识别当前目录属于哪个项目
- `Instance` 负责把“某个目录下的上下文”隔离开
- `Session` 负责存储一次对话或一次编码任务的历史
- `LLM` 负责生成结果
- `Tool` 负责让模型调用外部能力
- `Database` 负责持久化
- `Bus` 负责事件广播

### 3.2 运行模式

这个项目更像一个“本地 AI 运行时”，而不是纯静态库：
- 运行时有状态
- 状态既有内存中的临时状态，也有 SQLite 中的持久状态
- 不同项目上下文要隔离
- 同一个项目内的不同会话要能被追踪

## 4. 模块划分

### 4.1 `project`

- 规范: [./src/project/spec.md](./src/project/spec.md)

职责：
- 识别当前目录属于哪个项目
- 维护项目元数据
- 记录 sandboxes / worktree / 初始化时间等信息
- 广播项目更新事件

关键类型：
- `ProjectInfo`
- `fromDirectory()`
- `list()`
- `get()`
- `update()`
- `sandboxes()`
- `setInitialized()`

### 4.2 `session`

- 规范: [./src/session/spec.md](./src/session/spec.md)

职责：
- 定义 session / message / part 的数据模型
- 保存会话历史
- 组织会话 loop
- 把用户输入转成模型可消费的消息
- 把模型输出和工具调用写回数据库

关键类型：
- `SessionInfo`
- `MessageInfo`
- `Part`
- `WithParts`

关键能力：
- `createSession()`
- `prompt()`
- `loop()`
- `toModelMessages()`

### 4.3 `agent`

- 规范: [./src/agent/spec.md](./src/agent/spec.md)

职责：
- 定义 agent 的能力和模式
- 区分 primary / subagent / all
- 提供默认 agent

当前最重要的概念是：
- `plan` 是一个主 agent
- 未来可以扩展更多 agent，比如 build / explore / summary

### 4.4 `provider`

- 规范: [./src/provider/spec.md](./src/provider/spec.md)

职责：
- 管理模型提供方
- 统一模型配置
- 适配不同 provider 的参数和能力

这层的目标不是“发请求”，而是“把不同 provider 的能力抽象成统一结构”。

### 4.5 `tool`

- 规范: [./src/tool/spec.md](./src/tool/spec.md)

职责：
- 维护可用工具清单
- 按项目、按 agent、按配置决定哪些工具可用
- 给 LLM 提供可调用的 tool schema

### 4.6 `server`

- 规范: [./src/server/spec.md](./src/server/spec.md)

职责：
- 暴露 HTTP 接口
- 提供项目、session、配置、权限、provider 等路由
- 支撑前端或外部客户端访问

### 4.7 `config`

- 规范: [./src/config/spec.md](./src/config/spec.md)

职责：
- 读取和组织配置
- 定义项目级配置 schema
- 管理 provider / model / tool / share / compaction 等选项

### 4.8 `database`

- 规范: [./src/database/spec.md](./src/database/spec.md)

职责：
- 负责 SQLite 访问
- 提供基于 Zod schema 的表结构和 CRUD
- 让业务层不直接拼 SQL

### 4.9 `bus`

- 规范: [./src/bus/spec.md](./src/bus/spec.md)

职责：
- 提供事件定义和发布订阅机制
- 让模块之间通过事件解耦
- 支持全局事件和项目实例事件

### 4.10 `snapshot`

- 规范: [./src/snapshot/spec.md](./src/snapshot/spec.md)

职责：
- 记录代码变更快照
- 生成 diff
- 支持恢复、回滚和压缩等能力

### 4.11 `util`

- 规范: [./src/util/spec.md](./src/util/spec.md)

职责：
- 放通用工具
- 包括日志、队列、锁、文件系统、上下文容器、错误封装等

## 5. 关键数据模型

### 5.1 Project

`ProjectInfo` 表示一个项目实体，重点字段：
- `id`
- `worktree`
- `vcs`
- `name`
- `icon`
- `created`
- `updated`
- `initialized`
- `sandboxes`

### 5.2 Session

`SessionInfo` 表示一次会话，重点字段：
- `id`
- `projectID`
- `directory`
- `title`
- `version`
- `time`
- `summary`
- `share`
- `revert`

### 5.3 Message / Part

消息采用“元信息 + parts”的方式表达：
- `MessageInfo` 保存角色、模型、agent、时间等元数据
- `Part` 保存具体内容

常见 part 类型：
- `text`
- `reasoning`
- `file`
- `image`
- `tool`
- `subtask`
- `snapshot`
- `patch`
- `agent`
- `retry`
- `compaction`

这种结构的意义是：
- message 负责“谁说的”
- part 负责“说了什么”
- tool / file / image / snapshot 可以统一纳入会话历史

### 5.4 State

运行时状态不要和持久化状态混在一起：
- SQLite 里保存长期数据
- `Instance.state()` 保存当前上下文的内存状态

这是整个项目最重要的隔离原则之一。

## 6. 数据流

### 6.1 项目识别流程

1. 从当前目录向上查找 `.git`
2. 如果找到 Git 仓库，读取或生成项目 ID
3. 计算 worktree 和 sandbox
4. 读取或创建项目记录
5. 更新 `updated`
6. 广播 `project.updated`

### 6.2 会话处理流程

1. 用户发起 prompt
2. 构造 `User` message 和 parts
3. 写入 `messages` / `parts`
4. 收集历史消息
5. 转换成 AI SDK 可用的 `ModelMessage[]`
6. 解析当前可用 tools
7. 调用模型流式生成
8. 根据输出更新 assistant message 和 tool state
9. 继续下一轮，直到完成或中断

### 6.3 工具调用流程

1. 根据 agent 和配置筛选工具
2. 为工具生成 schema
3. LLM 发起 tool call
4. 工具执行
5. 工具结果写回 part
6. 触发事件和后续处理

### 6.4 事件流

事件的目的不是“多此一举”，而是为了把模块间耦合降低：
- `project.updated`
- `session.created`
- `session.updated`
- `message.updated`
- `message.part.updated`
- `server.instance.disposed`

## 7. 约束与不变量

写这个项目时，最好始终遵守下面几条：

1. 运行时状态和持久化状态分开
2. 所有和目录相关的逻辑都要经过 `Instance`
3. 工具能力必须受 agent / config / permission 约束
4. 会话历史必须可回放、可恢复
5. 任何跨模块通知优先走 `Bus`
6. 不要把实现细节散落到多个地方，尽量让每层只负责自己的事

## 8. 当前实现状态

这份仓库里有不少功能已经有数据模型和流程雏形，但仍然存在“实现中”或“只做了一半”的部分。

写文档时建议区分：
- 已实现
- 部分实现
- 计划实现

这样可以避免把“愿景”误写成“事实”。

## 9. 给 AI 的协作方式

如果你希望 AI 更准确地理解你的意图，最有效的方式不是只说“帮我改一下”，而是明确给出下面 6 项：

1. 目标
2. 现状
3. 改动范围
4. 约束
5. 验收标准
6. 不要做什么

### 9.1 推荐提问模板

你可以这样问 AI：

```text
请基于当前仓库的架构，帮我实现/修改 X。

目标：
- 我想达成什么

现状：
- 现在代码里已经有什么

范围：
- 只允许改哪些文件 / 模块

约束：
- 不能破坏哪些行为
- 必须兼容哪些数据结构

验收标准：
- 什么情况算完成

不要做的事：
- 不要重构哪些部分
- 不要引入哪些依赖
```

### 9.2 如果你想让 AI 写架构文档

建议直接给它这些信息：
- 项目定位：这是做什么的
- 技术栈：Bun / TS / AI SDK / Hono / SQLite
- 核心模块：project / session / agent / provider / tool / server / config / bus
- 数据模型：ProjectInfo / SessionInfo / Message / Part
- 运行约束：内存态、持久态、上下文隔离
- 你的写作偏好：更偏设计说明、还是更偏开发手册

### 9.3 适合交给 AI 的写作要求

你可以要求 AI：
- 先输出大纲，再写正文
- 先列出它理解到的架构，再等待你确认
- 明确标记“已实现”和“推测”
- 用表格或分节写，不要写成流水账

## 10. 建议的文档结构

如果以后你要继续补全这份文档，推荐固定成下面的结构：

1. 项目是什么
2. 设计目标
3. 总体架构
4. 模块划分
5. 数据模型
6. 数据流
7. 事件与状态
8. 约束与不变量
9. 当前实现状态
10. AI 协作约定

## 11. 一句话总结

这份 `ARCHITECTURE.md` 最重要的任务不是“把文件列表写全”，而是把这个项目的边界、数据流和协作规则写清楚，让人和 AI 都能据此做一致的判断。
