# 持久化 Task V2 设计实现

本文整理 `C:\Projects\claude_code_annotated` 项目中持久化 Task V2 的设计方法。Task V2 是对早期 `TodoWrite` 会话内 checklist 的升级：它把任务状态从内存迁移到磁盘 JSON 文件，并扩展出 owner、依赖关系、并发锁、任务列表监听、多 agent 协作等能力。

## 1. 定位

Task V2 不是单纯的 UI 进度条，而是一个工具化的任务状态系统。

它解决的问题：

- 让模型用结构化工具维护任务进度，而不是只在自然语言里说“正在做”。
- 让任务状态脱离单轮上下文，保存到磁盘，支持恢复和跨进程读取。
- 支持多 agent 并行协作：任务可分配、可领取、可阻塞、可完成。
- 让终端 UI 可以实时展示当前任务、下一任务、完成数量、阻塞关系和 teammate 活动。

V1 和 V2 的关系是“代码共存，运行时互斥”：

- 非交互 / SDK / `--print` 默认使用 V1 `TodoWrite`。
- 交互式 CLI 默认使用 V2 `TaskCreate / TaskGet / TaskList / TaskUpdate`。
- `CLAUDE_CODE_ENABLE_TASKS=true` 可以强制非交互场景启用 V2。

关键开关在：

```ts
export function isTodoV2Enabled(): boolean {
  if (isEnvTruthy(process.env.CLAUDE_CODE_ENABLE_TASKS)) {
    return true
  }
  return !getIsNonInteractiveSession()
}
```

来源：`C:\Projects\claude_code_annotated\src\utils\tasks.ts`

## 2. 工具注册方式

工具列表里始终注册旧的 `TodoWriteTool`，但它自己会根据 `isTodoV2Enabled()` 决定是否启用。

Task V2 工具只在 `isTodoV2Enabled()` 为 true 时加入工具列表：

```ts
...(isTodoV2Enabled()
  ? [TaskCreateTool, TaskGetTool, TaskUpdateTool, TaskListTool]
  : [])
```

来源：`C:\Projects\claude_code_annotated\src\tools.ts`

因此模型在同一个运行模式下通常只会看到一套任务工具：

- V1：`TodoWrite`
- V2：`TaskCreate`、`TaskGet`、`TaskList`、`TaskUpdate`

## 3. 数据模型

Task V2 的任务结构定义在 `src/utils/tasks.ts`：

```ts
export const TaskSchema = lazySchema(() =>
  z.object({
    id: z.string(),
    subject: z.string(),
    description: z.string(),
    activeForm: z.string().optional(),
    owner: z.string().optional(),
    status: TaskStatusSchema(),
    blocks: z.array(z.string()),
    blockedBy: z.array(z.string()),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
)
```

字段含义：

| 字段            | 含义                                  |
| ------------- | ----------------------------------- |
| `id`          | 任务编号，字符串形式，通常是递增数字                  |
| `subject`     | 简短标题，适合展示在任务列表里                     |
| `description` | 完整任务说明，给 agent 执行时使用                |
| `activeForm`  | 进行中展示文案，例如 `Running tests`          |
| `owner`       | 任务归属 agent 名称或 ID                   |
| `status`      | `pending`、`in_progress`、`completed` |
| `blocks`      | 当前任务完成后会解除阻塞的任务 ID                  |
| `blockedBy`   | 当前任务开始前必须完成的任务 ID                   |
| `metadata`    | 扩展信息，可存内部标记或业务字段                    |

状态机很简单：

```text
pending -> in_progress -> completed
```

`TaskUpdate` 额外支持特殊状态 `deleted`，表示删除任务文件。

## 4. 磁盘存储

Task V2 把每个任务写成一个 JSON 文件。

默认目录结构：

```text
{claude_config_home}/tasks/{taskListId}/
  .lock
  .highwatermark
  1.json
  2.json
  3.json
```

路径生成逻辑：

```ts
export function getTasksDir(taskListId: string): string {
  return join(
    getClaudeConfigHomeDir(),
    'tasks',
    sanitizePathComponent(taskListId),
  )
}

export function getTaskPath(taskListId: string, taskId: string): string {
  return join(getTasksDir(taskListId), `${sanitizePathComponent(taskId)}.json`)
}
```

实现重点：

- `taskListId` 和 `taskId` 都会经过 `sanitizePathComponent()` 清洗，只保留字母、数字、下划线和连字符。
- 每个任务一个 JSON 文件，便于跨进程读取和单任务锁定。
- `.highwatermark` 保存曾经分配过的最大 ID，避免任务删除或 reset 后复用旧 ID。
- `.lock` 是任务列表级别的锁文件，用于创建任务、批量 reset、原子 claim 等操作。

## 5. taskListId 选择策略

Task V2 使用 `taskListId` 把不同会话或团队的任务隔离开。

优先级：

1. `CLAUDE_CODE_TASK_LIST_ID`
2. in-process teammate 的 teamName
3. `CLAUDE_CODE_TEAM_NAME`
4. leader 创建 team 后记录的 teamName
5. 当前 session id

核心逻辑：

```ts
export function getTaskListId(): string {
  if (process.env.CLAUDE_CODE_TASK_LIST_ID) {
    return process.env.CLAUDE_CODE_TASK_LIST_ID
  }
  const teammateCtx = getTeammateContext()
  if (teammateCtx) {
    return teammateCtx.teamName
  }
  return getTeamName() || leaderTeamName || getSessionId()
}
```

这个设计使得：

- 单人会话默认拥有自己的任务目录。
- team 模式下 leader 和 teammates 共享同一个任务板。
- 外部脚本可通过环境变量指定固定任务列表。

## 6. 工具 API 分层

### TaskCreate

职责：创建一个 `pending` 任务。

输入：

```ts
{
  subject: string
  description: string
  activeForm?: string
  metadata?: Record<string, unknown>
}
```

行为：

- 调用 `createTask(getTaskListId(), taskData)`。
- 自动设置 `status: 'pending'`。
- 初始化 `owner: undefined`、`blocks: []`、`blockedBy: []`。
- 执行 task-created hooks；如果 hook 返回 blocking error，则删除刚创建的任务并抛错。
- 创建后自动展开任务列表 UI。

### TaskGet

职责：读取单个任务的完整信息。

输入：

```ts
{
  taskId: string
}
```

输出包括：

- `id`
- `subject`
- `description`
- `status`
- `blocks`
- `blockedBy`

用途：

- agent 接到任务后先读取完整描述。
- 更新任务前确认最新状态。
- 查看依赖关系。

### TaskList

职责：列出任务列表摘要。

输出字段：

- `id`
- `subject`
- `status`
- `owner`
- `blockedBy`

实现细节：

- 会过滤 `metadata._internal` 为 true 的内部任务。
- `blockedBy` 输出时会过滤已完成的 blocker，只展示仍未完成的阻塞项。
- 返回文本形如：

```text
#1 [completed] Prepare project structure
#2 [in_progress] Implement task watcher (@worker-a)
#3 [pending] Run verification [blocked by #2]
```

### TaskUpdate

职责：更新任务状态、标题、描述、owner、依赖和 metadata。

输入字段：

```ts
{
  taskId: string
  subject?: string
  description?: string
  activeForm?: string
  status?: 'pending' | 'in_progress' | 'completed' | 'deleted'
  addBlocks?: string[]
  addBlockedBy?: string[]
  owner?: string
  metadata?: Record<string, unknown>
}
```

行为：

- 更新前先读取任务，任务不存在时返回非错误结果，避免中断并行工具调用。
- `status: 'deleted'` 会删除任务文件。
- 标记 `completed` 前执行 task-completed hooks；hook 阻塞时不更新为完成。
- teammate 把任务设为 `in_progress` 且任务没有 owner 时，会自动填入当前 agent name。
- owner 改变时会通过 mailbox 通知新 owner。
- `addBlocks` 和 `addBlockedBy` 会通过 `blockTask()` 双向维护依赖关系。

## 7. 并发控制

Task V2 明显面向多进程 / 多 agent 场景，因此加了文件锁。

创建任务：

- 使用任务列表级锁 `.lock`。
- 持锁读取当前最大 ID 和 `.highwatermark`。
- 分配 `highest + 1`。
- 写入 `{id}.json`。

更新任务：

- 普通更新使用任务文件级锁。
- 先检查文件是否存在，避免 `proper-lockfile.lock()` 对不存在文件抛出底层错误。
- 持锁后再次读取并写回。

领取任务：

- `claimTask()` 会检查：
  - 任务是否存在
  - 是否已被其他 agent 领取
  - 是否已经完成
  - 是否被未完成任务阻塞

如果启用 `checkAgentBusy`，会使用任务列表级锁，把“检查 agent 是否已有任务”和“领取当前任务”做成一个原子操作，避免 TOCTOU 竞态。

## 8. 依赖关系设计

依赖通过两个数组维护：

- A 的 `blocks` 包含 B：表示 A 完成后 B 才能继续。
- B 的 `blockedBy` 包含 A：表示 B 被 A 阻塞。

`blockTask(taskListId, fromTaskId, toTaskId)` 会同时维护双向关系：

```text
from.blocks += to
to.blockedBy += from
```

任务列表展示时，已经 completed 的 blocker 不再展示为阻塞。

这样可以支持简单 DAG 任务流：

```text
#1 设计接口
  blocks #2

#2 实现接口
  blockedBy #1
  blocks #3

#3 写测试
  blockedBy #2
```

## 9. UI watcher 和实时展示

Task V2 的 UI 不是每个组件自己读磁盘，而是通过 singleton store 统一维护。

位置：`src/hooks/useTasksV2.ts`

核心组件：`TasksV2Store`

职责：

- 保存当前任务列表快照。
- 监听任务目录 `fs.watch`。
- 订阅进程内 `onTasksUpdated` signal。
- 用 5 秒 fallback poll 兜底，防止 `fs.watch` 丢事件。
- 当所有任务完成超过 5 秒后，自动 reset 并隐藏任务列表。

刷新逻辑：

```text
TaskCreate / TaskUpdate / resetTaskList
        |
        v
notifyTasksUpdated()
        |
        v
TasksV2Store debounced fetch
        |
        v
listTasks(taskListId)
        |
        v
React useSyncExternalStore subscribers update
```

为什么用 singleton store：

- `REPL`、`Spinner`、`PromptInputFooter` 等多个组件都需要任务状态。
- 如果每个组件都建 `fs.watch`，会造成 watcher 抖动和重复 I/O。
- singleton store 让多个组件共享同一份缓存和监听器。

## 10. Spinner 集成

Spinner 会从 Task V2 中找当前任务：

```ts
const currentTodo = tasksV2?.find(
  task => task.status !== 'pending' && task.status !== 'completed',
)
```

展示文案优先级：

```text
overrideMessage
currentTodo.activeForm
currentTodo.subject
randomVerb
```

也会找下一个 pending task，用于展示 `Next: xxx`。

任务展开视图由 `TaskListV2` 渲染，支持：

- completed：tick 图标，成功色，文字删除线
- in_progress：实心方块，强调色，文字加粗
- pending：空方块
- blocked：灰色展示，并标出 `blocked by #id`
- owner：宽度足够时展示 `@owner`
- teammate activity：任务进行中时展示 agent 最近活动
- 小终端下自动截断任务列表，并汇总隐藏项数量

## 11. 多 agent 协作

Task V2 与 team / teammate 系统结合较深。

主要机制：

- team 创建时 reset 对应 task list。
- leader 和 teammates 共享 teamName 对应的任务目录。
- leader 可用 `TaskCreate` 创建任务，用 `TaskUpdate owner` 分配任务。
- owner 改变时写 mailbox 给对应 teammate。
- teammate 完成任务后，工具结果会提示它调用 `TaskList` 查找下一个可做任务。
- teammate 退出时，未完成任务会被 unassign，状态重置为 `pending`。

任务领取策略：

```text
TaskList -> 找 pending、无 owner、无 unresolved blockedBy 的任务
TaskUpdate -> 设置 owner 或 status=in_progress
执行任务
TaskUpdate -> status=completed
TaskList -> 继续找下一项
```

## 12. 质量兜底

Task V2 延续了 V1 的 verification nudge 设计。

当主线程 agent 完成 3 个以上任务，且所有任务已完成，但没有任何任务 subject 包含 `verif` 时，`TaskUpdate` 的工具结果会提示启动 verification agent。

目的：

- 防止模型完成实现任务后直接总结。
- 强制把验证作为任务闭环的一部分。
- 避免模型用“我有一些 caveats”替代真实验证。

## 13. 生命周期

一个典型 Task V2 生命周期：

```text
用户提出复杂需求
  |
  v
模型使用 TaskCreate 拆分任务
  |
  v
任务 JSON 写入 tasks/{taskListId}/
  |
  v
UI watcher 刷新任务面板
  |
  v
模型或 teammate 用 TaskUpdate 标记 in_progress
  |
  v
Spinner 展示 activeForm / subject
  |
  v
任务完成后 TaskUpdate -> completed
  |
  v
依赖被解除，TaskList 中后续任务可执行
  |
  v
全部 completed 后延迟 5 秒 reset / 隐藏
```

## 14. 可复用实现方案

如果要在自己的项目中复刻类似能力，可以按下面模块拆分。

### 14.1 数据层

定义任务 schema：

```ts
type TaskStatus = 'pending' | 'in_progress' | 'completed'

type Task = {
  id: string
  subject: string
  description: string
  activeForm?: string
  owner?: string
  status: TaskStatus
  blocks: string[]
  blockedBy: string[]
  metadata?: Record<string, unknown>
}
```

### 14.2 存储层

目录：

```text
app_data/tasks/{taskListId}/
  .lock
  .highwatermark
  {taskId}.json
```

函数：

- `getTaskListId()`
- `getTasksDir(taskListId)`
- `getTaskPath(taskListId, taskId)`
- `createTask(taskListId, taskData)`
- `getTask(taskListId, taskId)`
- `listTasks(taskListId)`
- `updateTask(taskListId, taskId, updates)`
- `deleteTask(taskListId, taskId)`
- `claimTask(taskListId, taskId, owner)`
- `blockTask(taskListId, fromTaskId, toTaskId)`

### 14.3 工具层

面向模型或业务逻辑暴露 4 个操作：

- `TaskCreate`
- `TaskGet`
- `TaskList`
- `TaskUpdate`

不要让模型直接写 JSON 文件。模型只调用工具，工具负责校验、加锁、写盘、触发 UI 更新。

### 14.4 UI 层

建立一个统一 watcher store：

- `fs.watch` 监听目录。
- 本进程内 mutation 发 signal。
- 定时 poll 兜底。
- 对外提供 `subscribe/getSnapshot`。
- UI 组件只订阅 store，不直接读磁盘。

### 14.5 协作层

多 agent 场景需要额外处理：

- owner 字段
- claim 原子性
- agent busy 检查
- mailbox / event bus 通知
- agent 退出后的任务释放
- blockedBy 过滤和依赖解除

## 15. 设计优点

- 状态持久化：任务不依赖模型上下文。
- 可恢复：进程重启后可从磁盘读取。
- 可协作：多 agent 共享 task list。
- 可观察：UI watcher 能实时展示进度。
- 可控：模型只能通过工具更新状态，减少自然语言漂移。
- 可扩展：metadata 可承载业务扩展字段。

## 16. 设计代价

- 文件锁和 watcher 增加实现复杂度。
- 每个任务一个文件，任务量极大时需要考虑目录扫描成本。
- 依赖关系是手动维护的双向数组，需要保证 `blockTask()` 是唯一写入口。
- UI 隐藏完成任务时会 reset task list，不适合需要长期保留历史任务的产品场景。
- 多 agent 协作依赖 owner 命名一致性，需要统一 agent name / agent id 规范。

## 17. 关键源码位置

| 模块 | 路径 |
| --- | --- |
| Task 数据模型和磁盘操作 | `C:\Projects\claude_code_annotated\src\utils\tasks.ts` |
| TaskCreate 工具 | `C:\Projects\claude_code_annotated\src\tools\TaskCreateTool\TaskCreateTool.ts` |
| TaskGet 工具 | `C:\Projects\claude_code_annotated\src\tools\TaskGetTool\TaskGetTool.ts` |
| TaskList 工具 | `C:\Projects\claude_code_annotated\src\tools\TaskListTool\TaskListTool.ts` |
| TaskUpdate 工具 | `C:\Projects\claude_code_annotated\src\tools\TaskUpdateTool\TaskUpdateTool.ts` |
| 工具注册 | `C:\Projects\claude_code_annotated\src\tools.ts` |
| UI watcher | `C:\Projects\claude_code_annotated\src\hooks\useTasksV2.ts` |
| 任务列表 UI | `C:\Projects\claude_code_annotated\src\components\TaskListV2.tsx` |
| Spinner 集成 | `C:\Projects\claude_code_annotated\src\components\Spinner.tsx` |

