# 工具模块规范

`tool` 模块是 agent 的能力边界层。它负责定义统一的工具 contract、维护内置工具注册表，并提供少量跨工具共享的 helper。当前实现还通过 `session/resolve-tools.ts -> permission/permission.ts -> session/processor.ts -> session/message.ts` 串起模型侧调用、审批、持久化和历史回放。

本文档以当前代码实现为准，不描述尚未落地的设计。

## 1. 模块边界

- `src/tool/**` 只负责工具定义、工具注册、共享 helper 和内置工具实现。
- prompt 编排、权限策略、消息持久化、模型消息转换不在本目录内实现，但本模块会向这些链路暴露稳定接口。
- 当前模块没有公开的“动态注册 / 注销工具”API；`registry.ts` 中的 `state().custom` 只是内部预留扩展槽位。
- 结构化工具优先，`exec_command` 是兜底执行能力，不是默认实现手段。

## 2. 当前目录结构

### 2.1 核心文件

| 文件 | 作用 |
| --- | --- |
| `tool.ts` | 定义模块级 contract：类型、`define()` 包装器、名称匹配、输出归一化 |
| `registry.ts` | 汇总当前内置工具，暴露 `tools()` / `get()` / `names()` |
| `shared.ts` | 提供路径解析、展示路径、文本读写、行范围渲染等公共 helper |
| `read-file.ts` | 读取文本文件全文或行范围 |
| `list-directory.ts` | 列出目录内容，可递归 |
| `search-files.ts` | 在文件或目录范围内做文本搜索 |
| `write-file.ts` | 写入完整文本文件 |
| `replace-text.ts` | 对现有文本文件做精确替换 |
| `apply-patch.ts` | 应用 Git 风格 unified diff |
| `exec-command.ts` | 在项目边界内执行 Bash 命令 |
| `bash.spec.md` | `exec_command` 的专项设计文档 |

### 2.2 模块外但与 tool 强耦合的协作点

| 文件 | 作用 |
| --- | --- |
| `src/session/resolve-tools.ts` | 把 `ToolInfo` 包装成 AI SDK `tool({...})`，接入权限判断与模型输出适配 |
| `src/permission/permission.ts` | 基于工具能力和输入做权限评估；在审批请求落库时消费 `describeApproval()` |
| `src/session/processor.ts` | 持久化工具调用状态：`pending`、`running`、`waiting-approval`、`completed`、`error`、`denied` |
| `src/session/message.ts` | 历史消息回放时重建 tool result，并调用 `toModelOutput()` |

## 3. 当前内置工具

### 3.1 ToolKind

`tool.ts` 里当前真实存在的工具大类只有：

- `read`
- `write`
- `search`
- `exec`
- `other`

### 3.2 内置工具清单

| id | aliases | kind | 能力标签 | 当前默认行为 |
| --- | --- | --- | --- | --- |
| `read-file` | 无 | `read` | `readOnly=true` `destructive=false` `concurrency=safe` | 默认返回前 250 行；支持 `startLine` / `endLine` / `maxLines` |
| `list-directory` | 无 | `read` | `readOnly=true` `destructive=false` `concurrency=safe` | 默认只列当前层；递归时默认 `maxDepth=3`；默认最多 200 条 |
| `search-files` | 无 | `search` | `readOnly=true` `destructive=false` `concurrency=safe` | 默认 `maxResults=20`；默认大小写不敏感；目录扫描默认跳过 `.git` 和 `node_modules` |
| `write-file` | 无 | `write` | `readOnly=false` `destructive=true` `concurrency=exclusive` | 覆盖写入完整文件内容 |
| `replace-text` | 无 | `write` | `readOnly=false` `destructive=true` `concurrency=exclusive` | 默认只替换首个匹配；`all=true` 时替换所有匹配 |
| `apply_patch` | `apply-patch` | `write` | `readOnly=false` `destructive=true` `concurrency=exclusive` | 顺序处理多文件 unified diff；支持 create/update/delete/move/unchanged |
| `exec_command` | `bash` `exec-command` | `exec` | `readOnly=false` `destructive=true` `concurrency=exclusive` `needsShell=true` | 使用 `bash -lc` 执行命令；Windows 下优先解析 Git Bash；默认超时和输出上限来自 `Flag` |

### 3.3 审批描述能力

当前 7 个内置工具都实现了 `describeApproval()`。权限系统在真正创建审批请求时会优先读取工具提供的审批描述；若工具未实现或运行失败，再退回 permission 层的通用描述。

## 4. 核心 contract

### 4.1 基础类型

| 名称 | 定义位置 | 说明 | 稳定性 |
| --- | --- | --- | --- |
| `Metadata` | `tool.ts` | 模块内部别名：`Record<string, unknown>`；被 `ToolOutput` / `ToolAttachment` 等泛型使用，但未单独导出 | 内部 |
| `Awaitable<T>` | `tool.ts` | `T \| Promise<T>`，统一同步 / 异步 hook 返回值 | 稳定 |
| `ToolKind` | `tool.ts` | `read` / `write` / `search` / `exec` / `other` | 稳定 |
| `ToolConcurrency` | `tool.ts` | `safe` / `exclusive` | 稳定 |

### 4.2 `ToolCapabilities`

`ToolCapabilities` 是工具定义阶段的静态标签，当前主要被 `permission.evaluate()` 消费。

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `kind` | `ToolKind` | 工具大类 |
| `readOnly` | `boolean` | 是否只读 |
| `destructive` | `boolean` | 是否有显著副作用 |
| `concurrency` | `ToolConcurrency` | 是否适合并发执行 |
| `needsShell` | `boolean` | 是否依赖外部 shell 环境 |

### 4.3 初始化与执行上下文

| 结构 | 字段 | 说明 |
| --- | --- | --- |
| `InitContext` | `agent?: Agent.AgentInfo` | `ToolInfo.init(ctx?)` 的输入。当前主要用于按 agent 初始化 runtime |
| `Context` | `sessionID` `messageID` `cwd?` `worktree?` `abort?` `toolCallID?` | 单次执行上下文。`resolve-tools.ts` 会在真正执行时注入这些字段 |

### 4.4 输出与审批描述

| 结构 | 字段 | 说明 |
| --- | --- | --- |
| `ToolAttachment<M>` | `url` `mime` `filename?` `metadata?` | 工具返回的附件描述 |
| `ToolApprovalDetails` | `command?` `paths?` `workdir?` | 审批弹窗和权限记录可直接展示的细节 |
| `ToolApprovalDescriptor` | `title?` `summary` `details?` | 工具可选提供的审批摘要 |
| `ToolOutput<M, D>` | `text` `title?` `metadata?` `data?` `attachments?` | 模块层统一输出结构；`text` 始终必需 |
| `ToolGuardResult` | `void` / `string` / `{ message: string }` | `validate()` 和 `authorize()` 的统一返回值 |
| `ToolModelOutput` | `string` 或结构化 union | 模型侧消费的结果形态：`text` / `json` / `error-text` / `error-json` / `execution-denied` |

### 4.5 `ToolRuntime`

`ToolRuntime` 描述“这一次调用具体怎么执行”。

| 字段 / 方法 | 是否必需 | 说明 |
| --- | --- | --- |
| `description` | 是 | 工具描述，提供给模型和上层 |
| `title` | 否 | 展示标题 |
| `parameters` | 是 | 当前 runtime 使用的 Zod schema |
| `execute(args, ctx)` | 是 | 真正执行工具逻辑 |
| `formatValidationError(error)` | 否 | 自定义 schema 错误文案 |
| `validate(args, ctx)` | 否 | 执行前预校验 |
| `authorize(args, ctx)` | 否 | 工具内部额外授权检查 |
| `describeApproval(args, ctx)` | 否 | 生成审批标题、摘要和详情；由 permission 层消费 |
| `toModelOutput(result)` | 否 | 把标准 `ToolOutput` 转成模型侧稳定格式 |

### 4.6 `ToolInfo`

`ToolInfo` 是注册表保存的静态定义，不等于一次运行实例。

| 字段 | 说明 |
| --- | --- |
| `id` | 工具主标识 |
| `title` | 展示标题 |
| `aliases` | 兼容名称或短名 |
| `capabilities` | 静态能力标签 |
| `init(ctx?)` | 基于 `InitContext` 生成 `ToolRuntime` |

`ToolInfo` 与 `ToolRuntime` 的分工：

- `ToolInfo`：静态定义，负责被注册、发现和初始化
- `ToolRuntime`：运行时实例，负责参数 schema、审批描述、执行和模型输出转换

### 4.7 `define()` 的包装行为

`define(id, init, options)` 是模块级统一入口。它会在 `init()` 返回 runtime 之后，重写 runtime 的 `execute()`，统一收口以下逻辑：

1. 用 `runtime.parameters.safeParse(args)` 做 schema 校验
2. 如存在 `formatValidationError()`，优先使用工具自定义错误文案
3. 调用 `validate()`；返回 `string` 或 `{ message }` 时直接抛错
4. 调用 `authorize()`；返回 `string` 或 `{ message }` 时直接抛错
5. 执行原始 `execute()`
6. 通过 `normalizeToolOutput()` 统一成标准 `ToolOutput`

`define()` 不会替工具自动生成 `describeApproval()` 或 `toModelOutput()`；这两个能力仍由具体工具自行实现。

### 4.8 归一化 helper

| 接口 | 作用 |
| --- | --- |
| `toolMatchesName(tool, name)` | 同时匹配 `id` 和 `aliases` |
| `normalizeToolOutput(result)` | 把 `string` 或 `ToolOutput` 统一成标准 `ToolOutput` |
| `normalizeToolModelOutput(output)` | 把模型输出的字符串快捷写法统一成 `{ type: "text", value }` |

## 5. 注册表与共享 helper

### 5.1 `registry.ts`

当前对外暴露的注册表接口只有：

- `tools()`：返回内置工具列表与内部 `state().custom` 的合并结果，并校验 `id` / `alias` 唯一性
- `get(id)`：按 `id` 或 `alias` 查找工具
- `names()`：返回所有已暴露名称

`state().custom` 当前只是 `Instance.state(async () => ({ custom: [] as Tool.ToolInfo[] }))` 的内部存储，没有公开的注册 / 注销函数。文档和调用方都不应把它当成稳定扩展 API。

### 5.2 `shared.ts`

`shared.ts` 当前只包含多工具共用、且足够稳定的文件 helper：

| 接口 | 当前行为 |
| --- | --- |
| `resolveToolPath(inputPath)` | 相对路径始终以 `Instance.directory` 解析；绝对路径会被标准化；越过项目边界则抛错 |
| `toDisplayPath(resolvedPath)` | 将绝对路径折叠为项目相对路径；根目录显示为 `.` |
| `readTextFile(inputPath)` | 解析路径后按 UTF-8 读取文本 |
| `writeTextFile(inputPath, content)` | 自动创建父目录，按 UTF-8 写入，返回绝对路径与字节数 |
| `formatLineRange(text, startLine, endLine)` | 统一行号渲染、范围裁剪和越界标记 |

`formatLineRange()` 返回：

| 字段 | 含义 |
| --- | --- |
| `rendered` | 带行号的文本片段 |
| `totalLines` | 原文总行数 |
| `startLine` | 实际生效的起始行号 |
| `endLine` | 实际生效的结束行号 |
| `outOfRange` | 请求起始行是否超出文件末尾 |

## 6. 各内置工具的真实行为

### 6.1 `read-file`

- 参数：`path` 必填；`startLine`、`endLine`、`maxLines` 可选
- 默认行为：
  - `startLine` 默认 `1`
  - `maxLines` 默认 `250`
  - 未传 `endLine` 时：
    - 若传了 `startLine`，默认读取 `startLine + maxLines - 1`
    - 否则默认读取前 `maxLines` 行
- 会在文本结果里明确输出：
  - 解析后的展示路径
  - 实际返回行范围
  - 是否越界
  - 是否被截断

### 6.2 `list-directory`

- 参数：`path?`、`recursive?`、`maxDepth?`、`maxEntries?`、`includeHidden?`
- 默认行为：
  - `path` 默认项目根目录
  - `recursive=false` 时，`maxDepth=0`
  - `recursive=true` 时，`maxDepth` 默认 `3`
  - `maxEntries` 默认 `200`
  - `includeHidden` 默认 `false`
- 如果目标路径是文件，不抛错，而是返回“这是一个文件”
- 遍历顺序直接来自文件系统读取结果，当前未额外排序

### 6.3 `search-files`

- 参数：`query` 必填；`path?`、`glob?`、`caseSensitive?`、`maxResults?`、`includeHidden?`
- 默认行为：
  - `path` 默认项目根目录
  - `glob` 默认 `**/*`
  - `caseSensitive` 默认 `false`
  - `maxResults` 默认 `20`
  - `includeHidden` 默认 `false`
- 若 `path` 是单文件，只扫描该文件
- 若 `path` 是目录，使用 `Bun.Glob` 扫描文件，并默认跳过 `.git` 与 `node_modules`
- 无法按 UTF-8 读取的文件当前会被静默跳过

### 6.4 `write-file`

- 参数：`path`、`content`
- 当前行为是完整覆盖写入，不做合并或增量编辑
- 会自动创建缺失的父目录

### 6.5 `replace-text`

- 参数：`path`、`search`、`replace`、`all?`
- `all=true` 时替换全部匹配；否则只替换首个匹配
- 如果未找到匹配文本，会抛错，不会创建文件

### 6.6 `apply_patch`

- 参数只有 `patch`
- 当前支持的 patch 行为：
  - 创建文件
  - 更新文件
  - 删除文件
  - 重命名 / 移动文件
  - 内容未变时记录为 `unchanged`
- 当前支持处理 `\ No newline at end of file`
- 多文件 patch 按顺序逐个执行；当前实现不是事务性的
- rename 的实现是“先写入目标，再删除源文件”

`apply-patch.ts` 中与 patch 解析直接相关的内部结构：

| 结构 | 作用 |
| --- | --- |
| `HunkLine` | 表示 `context` / `add` / `remove` 单行 |
| `Hunk` | 表示一个 `@@ ... @@` 区块 |
| `FilePatch` | 表示单个文件级 patch |
| `ApplyAction` | 汇总创建、更新、删除、移动、未变更等结果 |
| `SplitContent` | 保存拆分后的行数组、换行风格和末尾换行状态 |

### 6.7 `exec_command`

- 使用 `bash -lc <command>` 执行，不依赖宿主 shell 语义
- `workdir` 默认当前项目目录
- `timeoutMs` 默认 `Flag.FanFande_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS ?? 60000`
- `maxOutputChars` 默认 `Flag.FanFande_EXPERIMENTAL_BASH_MAX_OUTPUT_LENGTH ?? 12000`
- `validate()` 负责检查：
  - 调用是否已取消
  - 命令是否为空白
  - `workdir` 是否在项目边界内、是否为目录
  - Bash 是否可用
- `authorize()` 默认拦截已知危险模式；只有显式传入 `allowUnsafe=true` 才会放行
- 非零退出码不会自动抛错；只要命令已成功启动并结束，就返回结果，由 `exitCode` / `status` 表达失败
- `toModelOutput()` 当前会返回 JSON，暴露命令、工作目录、shell、退出状态、截断标记、stdout、stderr

## 7. 执行、审批与结果回放链路

### 7.1 定义发现阶段

1. 具体工具文件导出各自的 `ToolInfo`
2. `registry.ts` 汇总内置工具
3. 上层通过 `tools()` / `get()` / `names()` 发现当前可用工具

这一阶段只处理静态定义，不涉及真正执行。

### 7.2 模型工具包装阶段

`session/resolve-tools.ts` 会：

1. 读取 `ToolRegistry.tools()`
2. 对每个 `ToolInfo` 调用 `init({ agent })`
3. 将 `ToolRuntime` 包装为 AI SDK `tool({...})`
4. 把同一个工具同时注册到 `id` 和 `aliases`

包装后的模型侧工具具备三条关键链路：

- `needsApproval()`：调用 `permission.evaluate()` 判断是否需要人工批准
- `execute()`：再次调用 `permission.evaluate()`，只在 `allow` 时真正执行 runtime
- `toModelOutput()`：先标准化 `ToolOutput`，再按需调用 runtime 的 `toModelOutput()`

### 7.3 权限与审批阶段

`permission.evaluate()` 当前会消费这些静态 / 运行时信息：

- `tool.id`
- `tool.kind`
- `tool.readOnly`
- `tool.destructive`
- `tool.needsShell`
- 输入中派生出的路径、命令、workdir

当前默认权限策略：

- `read` / `search`：默认 `allow`
- `write` / `exec` / `other`：默认 `ask`
- `critical` 风险：默认 `deny`

当模型流里出现 `tool-approval-request` 事件时，`session/processor.ts` 会把工具状态落成 `waiting-approval`，随后 `permission.registerApprovalRequest()` 会：

1. 再次调用 `evaluate()`
2. 尝试读取 `runtime.describeApproval()`
3. 生成审批快照并写入 `permission_requests`
4. 追加一条 `permission` part，动作是 `ask`

如果工具没有实现 `describeApproval()`，或该方法执行失败，permission 层会生成通用 fallback 描述。

### 7.4 持久化阶段

`session/processor.ts` 当前维护的工具状态机：

| 状态 | 触发时机 |
| --- | --- |
| `pending` | 收到 `tool-input-start` |
| `running` | 收到 `tool-call` |
| `waiting-approval` | 收到 `tool-approval-request` |
| `completed` | 收到 `tool-result` |
| `error` | 收到 `tool-error`，或响应结束时仍有悬空 tool call |
| `denied` | 收到 `tool-output-denied`，或审批被用户拒绝 |

持久化时，processor 会从工具输出中提取：

- `text`
- `title`
- `metadata`
- `attachments`

并把附件映射成消息系统里的 `file` part 结构。

### 7.5 历史消息回放阶段

`session/message.ts` 在把内部消息转换成 AI SDK `ModelMessage[]` 时，会对已完成的 tool part 做重建：

1. 从注册表重新找到对应工具
2. 再次 `init()` 出 runtime
3. 用持久化的 `output`、`title`、`metadata`、`attachments` 重建标准输出
4. 如果 runtime 提供了 `toModelOutput()`，则调用它
5. 否则退回到纯文本输出

因此，`toModelOutput()` 不只影响实时执行，也影响历史 tool result 的回放格式。

## 8. 当前实现约束

- 一个具体工具一个文件
- 具体工具优先依赖 `tool.ts` 和 `shared.ts`，不互相调用其它工具文件
- 工具的能力标签必须和真实副作用保持一致，因为 permission 直接依赖这些标签
- 当前所有文件类工具的相对路径解析都基于 `Instance.directory`，不是 `ctx.cwd`
- `state().custom` 目前不是公开扩展点，不能在其它模块里当正式 API 使用

## 9. Tool 模块 TODO

### P0

- `apply_patch` 的多文件应用目前不是事务性的；中途失败时，前面已经写入的文件不会自动回滚。
- 现有直接测试覆盖偏向 `exec_command` 和流程层，缺少对 `read-file`、`list-directory`、`search-files`、`write-file`、`replace-text`、`apply_patch` 的细粒度成功 / 失败用例。

### P1

- `describeApproval()` 已进入真实链路，但缺少针对审批快照内容的专门测试。
- `state().custom` 已有内部存储，但没有正式的注册 / 注销 API；需要决定是补公开扩展接口，还是收敛这块设计。
- 文件类工具当前统一以 `Instance.directory` 解析相对路径，而不是按 `ctx.cwd`；需要明确这是最终语义还是后续要支持 cwd-relative。

### P2

- 多数工具只返回 `text` / `title`，结构化 `metadata` / `data` 的约定还不统一；后续可以补稳定的 machine-readable 输出。
- `list-directory` / `search-files` 的输出顺序与截断信息还不够稳定；后续可补排序策略与结构化统计。
