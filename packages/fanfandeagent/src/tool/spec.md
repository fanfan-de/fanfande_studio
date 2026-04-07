[]() # 工具模块规范

`tool` 模块是 agent 的能力边界层，负责把模型可调用能力组织成统一的 contract、统一的注册入口，以及一组可校验、可执行、可审计的内置工具。它应该保持高内聚，只承载工具定义与工具运行逻辑；同时保持低耦合，只依赖必要的基础设施，避免把业务域规则沉到本目录。

## 文件整体架构
### 工具的类型
bash
read
write
grep

mcp
skill



### 总体分层
- `tool.ts`
  - 定义模块级 contract，是所有工具实现共同依赖的核心抽象。
  - 提供 `define()` 包装器，把参数校验、预校验、授权校验、结果归一化统一收口。
- `registry.ts`
  - 负责注册和暴露工具集合。
  - 对内收集内置工具和自定义工具，对外提供按名称查找、列举名称、校验唯一性的能力。
- `shared.ts`
  - 提供多个工具共享的底层 helper。
  - 当前主要负责路径边界检查、文本文件读写、行范围格式化。

### 具体工具文件
- `read-file.ts`
  - 读取文本文件全文或指定行范围。
- `list-directory.ts`
  - 列出目录内容，必要时识别目标是否是文件。
- `search-files.ts`
  - 在文件或目录范围内做文本搜索。
- `write-file.ts`
  - 写入完整文本文件。
- `replace-text.ts`
  - 对已有文本文件执行精确替换。
- `apply-patch.ts`
  - 应用 unified diff 补丁，支持创建、更新、删除、重命名。
- `exec-command.ts`
  - 作为兜底工具，在项目边界内执行 shell 命令，并负责危险命令拦截、超时和输出截断。

### 架构约束
- 一个工具一个文件，避免工具之间的实现细节互相缠绕。
- 工具文件优先依赖 `tool.ts` 和 `shared.ts`，不要直接依赖其它工具文件。
- 与 tool 无关的业务流程、prompt 编排、session 持久化逻辑不应进入本目录。
- 必要耦合可以存在，但要保持单向依赖，且写清楚原因。

## 数据结构

### 结构总览

| 结构 | 定义位置 | 所属阶段 | 核心职责 | 对外稳定性 |
| --- | --- | --- | --- | --- |
| `Metadata` | `tool.ts` | 通用基础 | 约束结构化元数据为键值对象 | 稳定 |
| `Awaitable<T>` | `tool.ts` | 通用基础 | 统一同步/异步 hook 返回值签名 | 稳定 |
| `ToolCapabilities` | `tool.ts` | 定义阶段 | 描述工具的静态能力标签 | 稳定 |
| `InitContext` | `tool.ts` | 初始化阶段 | 向 `init()` 传入调用方相关信息 | 稳定 |
| `Context` | `tool.ts` | 执行阶段 | 描述一次工具调用的运行上下文 | 稳定 |
| `ToolAttachment` | `tool.ts` | 结果阶段 | 描述工具返回的附件 | 稳定 |
| `ToolOutput` | `tool.ts` | 结果阶段 | 统一工具输出外形 | 稳定 |
| `ToolGuardResult` | `tool.ts` | 校验/授权阶段 | 表达放行或拒绝执行 | 稳定 |
| `ToolModelOutput` | `tool.ts` | 模型适配阶段 | 把结果转换为模型层消费格式 | 稳定 |
| `ToolRuntime` | `tool.ts` | 实例化后 | 承载本次调用的参数 schema 和执行逻辑 | 稳定 |
| `ToolInfo<Parameters, M, D>` | `tool.ts` | 定义阶段 | 描述可注册、可发现、可初始化的工具定义 | 稳定 |
| `state().custom` | `registry.ts` | 注册表运行时 | 保存动态注册的自定义工具 | 内部 |
| `formatLineRange()` 返回值 | `shared.ts` | 文件读取阶段 | 稳定表达行范围渲染结果 | 内部 |
| `FilePatch` / `Hunk` / `HunkLine` / `ApplyAction` / `SplitContent` | `apply-patch.ts` | 补丁应用阶段 | 解析并执行 unified diff | 内部 |

### 核心 contract

#### 基础类型

| 类型             | 实际定义                      | 用途                             |
| -------------- | ------------------------- | ------------------------------ |
| `Metadata`     | `Record<string, unknown>` | 约束 `metadata` 只能承载可序列化的结构化键值信息 |
| `Awaitable<T>` | `T \| Promise<T>`         | 允许 hook 和执行函数同时支持同步返回与异步返回     |

#### `ToolCapabilities`

`ToolCapabilities` 不重复描述实现细节，只向上层暴露稳定的静态信号，供工具选择、调度、风险控制和界面展示使用。

| 关联类型 | 可选值 | 说明 |
| --- | --- | --- |
| `ToolKind` | `read` / `write` / `search` / `exec` / `other` | 工具的大类语义，用于粗粒度能力路由 |
| `ToolConcurrency` | `safe` / `exclusive` | `safe` 表示可并发，`exclusive` 表示需要串行独占 |

| 字段 | 类型 | 是否必填 | 含义 | 设计目的 |
| --- | --- | --- | --- | --- |
| `kind` | `ToolKind` | 否 | 声明工具属于读取、写入、搜索、执行等哪一类 | 让上层优先选择结构化工具，并支持界面按能力分组 |
| `readOnly` | `boolean` | 否 | 声明工具是否只读、不会修改项目状态 | 让上层快速区分“安全探索”和“有副作用操作” |
| `destructive` | `boolean` | 否 | 声明工具是否可能删除、覆盖或产生不可逆副作用 | 在执行前识别高风险操作，触发更保守的策略 |
| `concurrency` | `ToolConcurrency` | 否 | 声明工具是否适合并发执行 | 避免多个写工具或 shell 工具同时运行导致竞争和污染 |
| `needsShell` | `boolean` | 否 | 声明工具是否依赖外部 shell 或子进程环境 | 让上层提前判断运行环境是否满足前置条件 |

#### `InitContext` 与 `Context`

两者都属于“上下文”，但生命周期不同：`InitContext` 只在工具实例化时使用，`Context` 会贯穿单次执行过程。

| 结构 | 创建时机 | 消费方 | 作用 |
| --- | --- | --- | --- |
| `InitContext` | 调用 `ToolInfo.init(ctx?)` 时 | `init()` | 基于调用方信息生成本次可用的 `ToolRuntime` |
| `Context` | 调用 `runtime.execute(args, ctx)` 时 | `execute()` / `validate()` / `authorize()` | 传递会话、目录、取消信号等单次执行上下文 |

`InitContext` 字段：

| 字段 | 类型 | 是否必填 | 含义 |
| --- | --- | --- | --- |
| `agent` | `Agent.AgentInfo` | 否 | 当前调用工具的 agent 信息，用于按调用方生成 runtime |

`Context` 字段：

| 字段 | 类型 | 是否必填 | 含义 |
| --- | --- | --- | --- |
| `sessionID` | `string` | 是 | 当前会话标识 |
| `messageID` | `string` | 是 | 当前消息标识 |
| `cwd` | `string` | 否 | 本次调用的工作目录 |
| `worktree` | `string` | 否 | 当前 worktree 标识或路径信息 |
| `abort` | `AbortSignal` | 否 | 外部取消信号，供长时间任务中止执行 |
| `toolCallID` | `string` | 否 | 单次工具调用标识，便于日志和追踪 |

#### `ToolAttachment` 与 `ToolOutput`

`ToolOutput` 是模块层最重要的稳定返回结构，要求始终至少包含 `text`；其余字段用于补充结构化信息和附件。

`ToolAttachment` 字段：

| 字段 | 类型 | 是否必填 | 含义 |
| --- | --- | --- | --- |
| `url` | `string` | 是 | 附件资源地址 |
| `mime` | `string` | 是 | 附件 MIME 类型 |
| `filename` | `string` | 否 | 附件展示或落盘时使用的文件名 |
| `metadata` | `M` | 否 | 与附件关联的附加结构化信息 |

`ToolOutput` 字段：

| 字段 | 类型 | 是否必填 | 含义 | 设计约束 |
| --- | --- | --- | --- | --- |
| `text` | `string` | 是 | 面向人类和日志的主文本结果 | 所有工具最终都必须能归一到该字段 |
| `title` | `string` | 否 | 结果标题 | 用于 UI 展示，不替代 `text` |
| `metadata` | `M` | 否 | 面向程序消费的结构化附加信息 | 保持键值对象外形，便于审计和扩展 |
| `data` | `D` | 否 | 更贴近业务结果的结构化载荷 | 允许上层直接消费，不必从 `text` 反解析 |
| `attachments` | `ToolAttachment<M>[]` | 否 | 附件列表 | 用于承载文件、链接或其它外部资源 |

#### `ToolGuardResult` 与 `ToolModelOutput`

`ToolGuardResult` 是 `validate()` 和 `authorize()` 的统一返回结构；它不表达“成功结果”，只表达“是否拒绝继续执行”。

| 结构 | 允许形态 | 含义 | `define()` 中的处理方式 |
| --- | --- | --- | --- |
| `ToolGuardResult` | `void` | 放行 | 继续后续步骤 |
| `ToolGuardResult` | `string` | 拒绝，并携带错误信息 | trim 后抛出为执行错误 |
| `ToolGuardResult` | `{ message: string }` | 拒绝，并携带结构化错误信息 | 读取 `message` 后抛出为执行错误 |

`ToolModelOutput` 用于把 `ToolOutput` 再转换成更适合模型层直接消费的结果形态。

| 形态 | 示例结构 | 用途 |
| --- | --- | --- |
| 文本快捷写法 | `string` | 作为 `{ type: "text", value }` 的简写 |
| 文本结果 | `{ type: "text"; value: string }` | 返回普通文本 |
| JSON 结果 | `{ type: "json"; value: JSONValue }` | 返回结构化 JSON |
| 错误文本 | `{ type: "error-text"; value: string }` | 返回面向模型的文本错误 |
| 错误 JSON | `{ type: "error-json"; value: JSONValue }` | 返回结构化错误信息 |
| 执行拒绝 | `{ type: "execution-denied"; reason?: string }` | 显式表达工具因策略或权限被拒绝 |

#### `ToolRuntime`

`ToolRuntime` 是工具经过 `init()` 实例化后的运行时定义，描述“这一次调用具体如何执行”。

| 字段 / 方法 | 类型 | 是否必填 | 含义 |
| --- | --- | --- | --- |
| `description` | `string` | 是 | 工具描述，供模型和上层理解用途 |
| `title` | `string` | 否 | 工具展示标题 |
| `parameters` | `Parameters` | 是 | 本次 runtime 使用的 Zod 参数 schema |
| `execute(args, ctx)` | `Awaitable<ToolOutput<M, D> \| string>` | 是 | 真正的执行入口 |
| `formatValidationError(error)` | `(error: z.ZodError) => string` | 否 | 自定义 schema 校验失败时的报错文案 |
| `validate(args, ctx)` | `Promise<ToolGuardResult> \| ToolGuardResult` | 否 | 执行前的预校验 |
| `authorize(args, ctx)` | `Promise<ToolGuardResult> \| ToolGuardResult` | 否 | 执行前的授权校验 |
| `toModelOutput(result)` | `Awaitable<ToolModelOutput>` | 否 | 把标准结果转换为模型层输出 |

#### `ToolInfo<Parameters, M, D>`

`ToolInfo` 是注册表真正管理的对象。它描述的不是“一次执行”，而是“一个可被系统识别、初始化和调用的工具定义”。

`ToolInfo` 与 `ToolRuntime` 的分工：

| 维度 | `ToolInfo` | `ToolRuntime` |
| --- | --- | --- |
| 面向对象 | 静态工具定义 | 单次调用的运行时实例 |
| 创建时机 | 模块加载或注册时 | `ToolInfo.init(ctx?)` 被调用时 |
| 持有方 | `registry.ts` | 执行链路 |
| 关注点 | 身份、别名、能力标签、初始化入口 | 参数 schema、描述、校验钩子、执行逻辑 |
| 是否应长期持有 | 是 | 否，只服务于当前调用 |

泛型参数：

| 泛型参数 | 约束 | 含义 | 设计目的 |
| --- | --- | --- | --- |
| `Parameters` | `extends z.ZodType` | 工具输入 schema 类型 | 让 schema 与 `execute()` / `validate()` / `authorize()` 的参数类型保持一致 |
| `M` | `extends Metadata` | `metadata` 的结构类型 | 允许工具返回更精确的结构化附加信息 |
| `D` | `= unknown` | `data` 的结构类型 | 允许工具输出程序更易消费的结构化结果 |

字段：

| 字段 | 类型 | 是否必填 | 含义 | 设计目的 |
| --- | --- | --- | --- | --- |
| `id` | `string` | 是 | 工具主标识 | 保证注册、查找、调用和审计日志中的唯一身份 |
| `title` | `string` | 否 | 面向界面或人类阅读的标题 | 将内部 `id` 与展示名称分离 |
| `aliases` | `string[]` | 否 | 兼容名称或别名 | 支持历史命名兼容和更友好的调用映射 |
| `capabilities` | `ToolCapabilities` | 否 | 工具能力标签集合 | 让上层在执行前理解风险、类别和调度约束 |
| `init(ctx?)` | `(ctx?: InitContext) => Promise<ToolRuntime<Parameters, M, D>>` | 是 | 根据初始化上下文生成本次调用使用的 runtime | 把定义阶段与实例化阶段分离，避免静态定义被调用态污染 |

### 注册表内部状态

`registry.ts` 除了暴露 `tools()`、`get()`、`names()`，还维护一份动态注册状态，用于合并内置工具与自定义工具。

| 结构 | 类型 | 定义位置 | 作用 | 备注 |
| --- | --- | --- | --- | --- |
| `state().custom` | `Tool.ToolInfo[]` | `registry.ts` | 保存运行时追加的自定义工具定义 | `tools()` 会把它与内置工具合并，并校验 `id` / `alias` 唯一性 |

### 共享内部数据

#### `shared.ts` 产出的共享结果

| 数据 | 来源 | 结构 | 消费方 | 说明 |
| --- | --- | --- | --- | --- |
| 规范化绝对路径 | `resolveToolPath(inputPath)` | `string` | 所有文件类工具、`exec_command` | 已经过项目边界校验，且做过路径规范化 |
| 稳定展示路径 | `toDisplayPath(resolvedPath)` | `string` | 所有需要输出路径的工具 | 将绝对路径收敛为项目内相对路径；根目录显示为 `.` |
| 文本写入结果 | `writeTextFile(inputPath, content)` | `{ path: string; bytes: number }` | 写文件类工具、`apply_patch` | 返回写入后的绝对路径与 UTF-8 字节数 |
| 行范围渲染结果 | `formatLineRange(text, startLine, endLine)` | 对象 | `read-file` | 统一行号渲染、范围裁剪和越界信息 |

`formatLineRange()` 返回值字段：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `rendered` | `string` | 带行号的文本片段 |
| `totalLines` | `number` | 原文本总行数 |
| `startLine` | `number` | 实际生效的起始行号 |
| `endLine` | `number` | 实际生效的结束行号 |
| `outOfRange` | `boolean` | 请求起始行是否已超出文件末尾 |

#### `apply-patch.ts` 内部结构

以下结构只服务于 `apply_patch` 的内部实现，不作为模块级稳定接口暴露，但它们决定了 unified diff 的解析和落盘方式。

| 结构 | 主要字段 | 作用 |
| --- | --- | --- |
| `HunkLine` | `type`、`text` | 表示补丁中的单行变更 |
| `Hunk` | `oldStart`、`oldCount`、`newStart`、`newCount`、`lines` | 表示一个 `@@ ... @@` hunk 的范围与内容 |
| `FilePatch` | `oldPath`、`newPath`、`hunks`、`oldNoNewlineAtEnd`、`newNoNewlineAtEnd` | 表示单个文件级补丁 |
| `ApplyAction` | 见下表 | 表示补丁应用后的结果摘要，用于最终输出 |
| `SplitContent` | `lines`、`newline`、`hasFinalNewline` | 表示被拆分后的文件内容和换行风格 |

`HunkLine.type` 可选值：

| 值 | 含义 |
| --- | --- |
| `context` | 上下文行，必须与原文件内容完全匹配 |
| `add` | 新增行 |
| `remove` | 删除行 |

`ApplyAction.kind` 可选值：

| 值 | 结果形态 | 额外字段 |
| --- | --- | --- |
| `created` | 创建文件 | `path` |
| `updated` | 更新文件 | `path` |
| `deleted` | 删除文件 | `path` |
| `moved` | 重命名或移动文件 | `from`、`to` |
| `unchanged` | 补丁应用后内容未变化 | `path` |

## 暴露的核心接口

### 通用接口
- `define(id, init, options)`
  - 模块最核心的入口。
  - 负责把工具实现包装成统一 contract，并自动执行 schema 校验、预校验、授权检查和结果归一化。
- `toolMatchesName(tool, name)`
  - 用于同时匹配 `id` 和 `aliases`。
- `normalizeToolOutput(result)`
  - 把字符串或结构化结果统一归一成 `ToolOutput`。
- `normalizeToolModelOutput(output)`
  - 把工具返回的模型输出统一归一成结构化结果。

### 注册表接口
- `tools()`
  - 返回当前可用工具列表，包括内置工具和自定义工具。
- `get(id)`
  - 按工具名或别名查找工具。
- `names()`
  - 返回当前所有已暴露的工具名与别名。

### 模块提供的核心服务
- 探索类服务
  - `read-file`
  - `list-directory`
  - `search-files`
- 修改类服务
  - `write-file`
  - `replace-text`
  - `apply_patch`
- 兜底执行服务
  - `exec_command`

### 服务边界
- 所有文件类服务都必须先通过项目边界检查。
- 所有工具输入都必须走 Zod schema。
- `exec_command` 不应替代结构化工具，它只在没有更合适结构化能力时兜底使用。

## 数据流水线

### 初始化逻辑
### 定义阶段
1. 模块加载后，具体工具文件先各自导出 `ToolInfo`。
2. `registry.ts` 收集内置工具和运行时注册的自定义工具。
3. 调用 `tools()` 时，注册表会合并所有工具，并校验 `id` 和 `alias` 的唯一性。
4. 上层通过 `get()` 或 `names()` 获取工具目录信息。
5. 这一阶段系统持有的是工具的静态定义，用于注册、列举、查找和能力理解。

### 实例化阶段
1. 当上层真正要执行某个工具时，先通过 `registry.get()` 按 `id` 或 `alias` 找到对应 `ToolInfo`。
2. 调用 `ToolInfo.init(ctx?)`，生成本次执行要使用的 `ToolRuntime`。
3. 这一阶段完成的是从静态定义到运行时对象的转换，让工具绑定本次调用上下文并准备执行入口。

### 运行时逻辑
#### 执行阶段
1. 调用 `runtime.execute(args, ctx)` 时，先由 `define()` 包装器执行参数 schema 校验。
2. 如工具实现了 `validate()`，先执行预校验；返回失败则直接拒绝。
3. 如工具实现了 `authorize()`，再执行授权校验；返回失败则直接拒绝。
4. 进入真实 `execute()` 逻辑，完成文件读取、写入、搜索、补丁应用或命令执行。
5. 执行结果被归一为 `ToolOutput`；如需要面向模型输出，再走 `toModelOutput()`。
6. 上层会把归一后的结果回写到消息处理链路与会话历史中。

### 文件类工具流水线
1. 接收用户输入路径。
2. 通过 `resolveToolPath()` 转成绝对路径。
3. 使用 `Instance.containsPath()` 保证路径在项目边界内。
4. 执行读写或搜索。
5. 通过 `toDisplayPath()` 和统一文本格式输出结果。

### `exec_command` 运行逻辑
1. `formatValidationError()` 将 Zod schema 失败转换成更适合 `exec_command` 的错误文案。
2. `validate()` 负责拒绝仅空白字符命令、无效工作目录、已取消调用和缺失 bash 可执行文件等前置条件问题。
3. `authorize()` 在默认情况下拦截已知危险命令模式；只有显式传入 `allowUnsafe=true` 才会放行。
4. `execute()` 解析 bash 路径，使用 `bash -lc` 启动子进程，并绑定超时与 `abort` 取消信号。
5. `execute()` 对 `stdout` 和 `stderr` 做长度截断控制，并返回面向用户的摘要文本与结构化 metadata。
6. `toModelOutput()` 把标准结果转换成结构化 JSON，向模型暴露命令、工作目录、退出状态和捕获到的输出。

## 约束与演进
- 修改任何文件职责、核心数据结构、核心接口或流水线时，都要同步更新本文件。
- 如果新增工具，必须同时补注册、补测试、补本规范中的对应说明。
- 后续可以扩展 `delete-file`、`move-file`、`git-status`、`git-diff` 等工具，但仍要遵守当前 contract 和边界约束。
