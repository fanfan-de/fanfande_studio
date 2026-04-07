# Bash Tool 设计说明

本文档专门描述 `src/tool/exec-command.ts` 提供的 Bash 工具设计与实现。它补充 `src/tool/spec.md` 中对工具模块的整体约束，聚焦 `exec_command` 这一项具体能力的目标、契约、执行流程、权限接入和平台行为。

## 1. 目标与定位

`exec_command` 是工具模块中的兜底执行工具。它的目标不是替代结构化文件工具，而是在以下场景中提供受控的 shell 执行能力：

- 需要运行现成的 CLI，如 `git`、`node`、`npm`、`python`
- 需要使用管道、重定向、环境变量展开等 Bash 语义
- 需要在项目边界内执行一段一次性的命令串
- 结构化工具无法高效覆盖的操作，需要一个统一的 fallback

它的设计重点是：

- 统一接口：接入 `Tool.define()` 约定，具备标准 schema、校验、授权和输出归一化流程
- 受控执行：限制工作目录在项目边界内，接入权限系统，拦截已知危险命令模式
- 跨平台：在不同平台上都尽量落到 Bash 语义，尤其兼容 Windows 上的 Git Bash
- 可审计：返回结构化 metadata，供 UI、日志、权限系统和模型消费
- 可终止：支持超时和外部取消信号

## 2. 非目标

这个工具明确不解决以下问题：

- 不提供 OS 级沙箱隔离
- 不自动兼容 PowerShell 或 CMD 语法
- 不提供交互式 TTY 会话
- 不流式向模型持续推送 stdout/stderr
- 不保证命令只访问项目目录中的文件

最后一条非常关键：当前实现只约束 `workdir` 必须位于项目边界内，但命令本身仍可能通过绝对路径、相对路径或外部程序访问项目外资源。因此它属于“受控执行”，不是“完全隔离执行”。

## 3. 工具身份与静态能力

工具定义位于 `src/tool/exec-command.ts`，通过 `Tool.define()` 导出。

静态身份如下：

- `id`: `exec_command`
- `title`: `Bash`
- `aliases`: `bash`, `exec-command`

静态能力标签如下：

- `kind: "exec"`
- `readOnly: false`
- `destructive: true`
- `concurrency: "exclusive"`
- `needsShell: true`

这些标签不只是展示信息，还会被上层权限系统、调度逻辑和工具选择逻辑使用：

- `kind: "exec"` 表示这是执行类工具，风险默认高于 read/search
- `destructive: true` 表示默认按有副作用能力处理
- `concurrency: "exclusive"` 表示它不适合与其他互斥工具并发执行
- `needsShell: true` 让权限层和运行时知道该工具依赖外部 shell 环境

## 4. 与工具框架的关系

`exec_command` 不是直接暴露一个裸执行函数，而是嵌入统一工具框架中。

### 4.1 `Tool.define()` 提供的统一包装

`src/tool/tool.ts` 中的 `define()` 负责把工具实现包装成统一 contract。对于 `exec_command`，它自动提供以下行为：

1. 使用 Zod schema 校验输入参数
2. 调用 `validate()` 执行前置校验
3. 调用 `authorize()` 执行工具内授权检查
4. 调用真正的 `execute()` 执行命令
5. 把返回值归一化成 `ToolOutput`

因此 `exec-command.ts` 只需要专注于 Bash 工具自己的策略，而不必重复实现统一入口逻辑。

### 4.2 注册与暴露

`src/tool/registry.ts` 将 `ExecCommandTool` 注册为内置工具的一部分。工具会同时以 `id` 和 `aliases` 暴露给上层。

### 4.3 模型侧适配

`src/session/resolve-tools.ts` 会把工具注册表中的定义转换为 AI SDK 需要的工具对象，并统一接入权限评估：

- `needsApproval()` 先问权限层是否需要人工批准
- `execute()` 在真正执行前再次检查 allow/deny/ask
- `toModelOutput()` 把结果转换成模型更容易消费的稳定格式

## 5. 输入契约

输入 schema 由 `ExecCommandParameters` 定义。

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `command` | `string` | 是 | 要执行的 Bash 命令 |
| `workdir` | `string` | 否 | 工作目录，默认取当前项目目录 |
| `timeoutMs` | `number` | 否 | 超时时间，单位毫秒，最大 10 分钟 |
| `maxOutputChars` | `number` | 否 | `stdout`/`stderr` 的最大保留字符数 |
| `allowUnsafe` | `boolean` | 否 | 是否允许已知危险模式命令 |
| `description` | `string` | 否 | 本次命令的简短用途说明，用作结果标题 |

默认值来自环境配置：

- `DEFAULT_TIMEOUT_MS = FanFande_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS ?? 60000`
- `DEFAULT_MAX_OUTPUT_CHARS = FanFande_EXPERIMENTAL_BASH_MAX_OUTPUT_LENGTH ?? 12000`

设计意图如下：

- `command` 与 `workdir` 负责描述“做什么”和“在哪做”
- `timeoutMs` 与 `maxOutputChars` 控制资源占用
- `allowUnsafe` 是显式风险豁免开关
- `description` 让上层 UI 和日志有更可读的标题

## 6. 输出契约

### 6.1 标准 `ToolOutput`

执行完成后，工具会返回标准 `ToolOutput`，主要包含：

- `title`
- `text`
- `metadata`

`text` 是面向人类和日志的摘要，内容包括：

- 命令内容
- 工作目录
- 使用的 shell 路径
- 退出码及超时/取消状态
- 截断说明
- `STDOUT`
- `STDERR`

### 6.2 `metadata` 字段

工具还会返回结构化 metadata：

| 字段 | 含义 |
| --- | --- |
| `command` | 实际执行的命令 |
| `shell` | 实际使用的 Bash 可执行文件 |
| `cwd` | 归一化后的绝对工作目录 |
| `displayCwd` | 面向展示的相对路径 |
| `timeoutMs` | 实际采用的超时时间 |
| `exitCode` | 进程退出码 |
| `signal` | 进程关闭信号 |
| `timedOut` | 是否超时终止 |
| `aborted` | 是否被外部取消 |
| `stdoutTruncated` | `stdout` 是否被截断 |
| `stderrTruncated` | `stderr` 是否被截断 |
| `stdout` | 规范化后的标准输出 |
| `stderr` | 规范化后的标准错误 |

### 6.3 模型输出

如果上层需要面向模型的结构化结果，`toModelOutput()` 会把结果转成 JSON，额外给出：

- `status: "ok" | "failed" | "timed_out" | "aborted"`

这里有个重要语义：

- 非零退出码不会自动抛异常
- 只要进程成功启动并正常结束，工具会返回结果
- 由 `status` 和 `exitCode` 表达成功或失败

这样做的好处是，模型仍然能读取命令失败时的 `stdout`/`stderr` 并据此继续推理，而不是只收到一个抛出的异常。

## 7. Bash 可执行文件解析策略

工具通过 `resolveBashExecutable()` 定位真正要执行的 Bash，可按以下顺序解析：

1. 读取 `process.env.SHELL`
   - 只有当 basename 匹配 `bash` 或 `bash.exe` 时才接受
2. 读取环境变量 `FanFande_GIT_BASH_PATH`
   - 仅当该路径存在且是文件时接受
3. 从 `PATH` 查找 `bash` 或 `bash.exe`
4. 若当前平台为 Windows
   - 先查找 `git`
   - 再从 Git 安装路径推导 `../../bin/bash.exe`
5. 仍找不到则报错

设计原因：

- 明确要求 Bash 语义，避免不同 shell 的语义差异
- Windows 上优先支持 Git Bash，降低部署要求
- 通过显式解析路径，减少依赖宿主 shell 默认行为

## 8. 平台行为说明

### 8.1 Linux / macOS

在类 Unix 系统上，通常会优先使用：

- `SHELL` 中指向的 bash
- 或者 `PATH` 中可找到的 bash

### 8.2 Windows

Windows 是这个工具最需要解释的平台。当前实现的策略是：

- 宿主进程可以运行在 PowerShell、CMD 或其他环境中
- 但 `exec_command` 自身不会切换到 PowerShell/CMD 语义
- 它始终尝试定位 `bash.exe`
- 优先接受 Git Bash
- 最终用 `bash -lc "<command>"` 执行

因此在 Windows 上：

- 可调用环境可以是 PowerShell
- 但命令内容必须是 Bash 语法
- `dir`、`copy`、`Get-ChildItem`、`$env:FOO` 等并不是此工具的目标语法
- `ls`、`cat`、`export FOO=bar`、`grep`、`find`、管道与重定向才是预期用法

这是一种“宿主 shell 无关，执行 shell 固定为 Bash”的设计。

## 9. 路径边界与工作目录控制

工具允许传入 `workdir`，但会先调用 `resolveToolPath()` 做归一化和边界检查。

`resolveToolPath()` 的约束如下：

- 相对路径基于 `Instance.directory` 解析
- 绝对路径会被标准化
- 路径必须通过 `Instance.containsPath()` 检查
- 不在当前项目目录或 worktree 中的路径会被拒绝

然后 `validate()` 和 `execute()` 都会再次确认：

- 解析出来的 `cwd` 必须存在
- 且必须是目录

这样做的目的不是保证命令只访问此目录，而是保证工具起始上下文稳定且可审计。

## 10. 前置校验设计

`validate()` 负责拦截那些在真正启动进程前就能明确判断为无效的调用。

它主要检查：

1. 调用是否已经被取消
2. `command.trim()` 后是否为空
3. `workdir` 能否被解析到项目边界内
4. `workdir` 是否存在且为目录
5. 当前环境是否能找到可执行的 Bash

把这些逻辑放在 `validate()` 而不是 `execute()` 的目的有两个：

- 尽早失败，减少不必要的进程创建
- 让错误语义更明确，区分“输入无效”与“执行期间失败”

## 11. 危险命令授权策略

工具内部还实现了一层轻量授权检查，即 `authorize()`。

默认情况下，它会拦截以下已知危险模式：

- `rm -rf /`
- `mkfs`
- 向 `/dev/...` 写入的 `dd`
- `shutdown`
- `reboot`
- `poweroff`
- `halt`
- fork bomb

如果命令命中任一模式，并且没有显式传入 `allowUnsafe=true`，工具将拒绝执行。

这个机制的目的不是做完整安全审计，而是：

- 快速拦截非常明确的灾难性命令
- 让调用方必须显式表态，才允许越过该层保护

## 12. 与权限系统的集成

`exec_command` 不只靠内部正则做保护，它还接入了统一权限系统。

权限层看到的关键信息包括：

- `kind = exec`
- `destructive = true`
- `needsShell = true`
- 输入参数中的 `command`
- 派生出的路径与命令信息

权限层会根据这些信息进行风险分类：

- 任意 `exec` 默认至少是 `high`
- 命中危险命令模式时会提升到 `critical`

同时，批准记录还会把以下信息沉淀为可复用规则：

- 工具名
- 工具种类
- 命令模式
- 派生路径
- 风险等级
- `needsShell`

因此这个工具的实际风险控制是双层的：

1. 工具内的已知危险模式拦截
2. 系统级 permission evaluate / approval / audit

## 13. 执行模型

工具最终使用 `spawn()` 启动子进程：

```ts
spawn(bash, ["-lc", command], {
  cwd,
  windowsHide: true,
})
```

这几个选择各自有明确目的：

- 使用 `spawn()` 而不是 `exec()`
  - 便于监听流式 `stdout`/`stderr`
  - 避免一次性缓冲所有输出
- 显式执行 `bash`
  - 不依赖 `shell: true`
  - 不受宿主默认 shell 干扰
- 使用 `-lc`
  - 保持 Bash 命令语义一致
- 传入 `cwd`
  - 明确工作目录
- `windowsHide: true`
  - Windows 上避免弹出额外控制台窗口

## 14. 输出采集与截断

工具会分别监听 `stdout` 和 `stderr` 的 `data` 事件，并按字符数做截断。

当前策略：

- `stdout` 和 `stderr` 各自独立计数
- 达到 `maxOutputChars` 后不再继续累积
- 设置对应的 `stdoutTruncated` / `stderrTruncated`
- 最终在 `text` 中提示输出已截断

这样做的好处：

- 避免超大输出撑爆上下文和内存
- 仍然保留最前面的关键信息用于诊断

局限性：

- 按 JavaScript 字符长度截断，不是按字节也不是按 token
- 截断保留的是输出前缀，不是最有信息量的部分

## 15. 超时与取消

工具支持两种主动停止机制。

### 15.1 超时

会创建一个定时器：

- 到达 `timeoutMs` 后
- 标记 `timedOut = true`
- 调用 `proc.kill()`

### 15.2 外部取消

会监听 `ctx.abort`：

- 一旦上层 `AbortSignal` 触发
- 标记 `aborted = true`
- 调用 `proc.kill()`

无论哪种终止方式，最终都会把状态沉淀到 metadata 和模型输出中。

## 16. 结果文本的构成原则

人类可读的 `text` 结果遵循“摘要优先”的格式：

1. 命令
2. 工作目录
3. Shell 路径
4. 退出状态
5. 截断提示
6. `STDOUT`
7. `STDERR`

其中：

- 工作目录使用 `toDisplayPath()` 渲染为相对项目根目录的短路径
- `stdout` / `stderr` 在输出前会 `trimEnd()`
- 如果某一项为空，会明确显示 `(no stdout)` 或 `(no stderr)`

这使得日志和 UI 能够稳定展示执行结果，也便于人工排查。

## 17. 错误语义

`exec_command` 的错误来源大致分为三类。

### 17.1 调用前错误

这些错误通常来自 schema、`validate()` 或 `authorize()`：

- 参数类型不匹配
- 空命令
- `workdir` 非法
- `workdir` 不存在
- 找不到 Bash
- 命中危险命令模式且未显式允许

这类错误会直接抛出，命令不会启动。

### 17.2 启动期错误

如果 `spawn()` 期间发生底层错误，Promise 会 reject。

### 17.3 执行期失败

如果命令已经启动，但以非零退出码结束：

- 不会直接抛错
- 会返回结果
- 由 `exitCode` 和 `status = failed` 表达失败

这种设计有利于 agent 读取失败输出后继续修正命令。

## 18. 并发模型

工具静态声明 `concurrency: "exclusive"`，说明它不适合安全并发执行。原因包括：

- shell 命令往往带副作用
- 可能修改同一工作目录
- 可能争用锁、缓存、临时文件或构建产物
- 输出难以可靠归因

因此调度层应将其视为串行型、互斥型工具。

## 19. 已知设计取舍

### 19.1 为什么只支持 Bash，不自动适配 PowerShell/CMD

原因是统一语义比“支持所有宿主 shell”更重要：

- 模型更容易学习单一命令风格
- 不同平台行为更稳定
- 工具描述可以更简洁
- 安全与权限策略更容易统一

代价是 Windows 用户必须具备 Bash 环境，且命令必须写成 Bash 语法。

### 19.2 为什么不使用 `shell: true`

因为那会把解释权交给宿主环境的默认 shell，带来以下问题：

- Windows 和 Unix 行为差异更大
- 宿主环境切换时行为不稳定
- 命令转义规则更难预测

显式执行 `bash -lc` 更可控。

### 19.3 为什么非零退出码不抛错

对 agent 来说，命令失败时的输出通常比异常本身更有价值。保留结果对象而不是直接抛出，有助于后续自动修复和连续推理。

## 20. 已知边界与后续可演进方向

当前实现已经满足常见 fallback shell 工具需求，但仍有一些明确边界：

- 没有 stdin 交互能力
- 没有 PTY / TTY 模拟
- 没有进程树级别的强制清理保证
- 没有对命令访问路径做完整沙箱限制
- 危险命令模式是启发式，不是完整策略语言
- 输出只保留前缀，不支持分页或续取

后续可考虑的演进方向：

- 引入更强的进程树清理
- 为大输出提供分页/续读机制
- 增加更细粒度的命令白名单或策略 DSL
- 引入独立 `powershell` 工具，而不是让一个工具兼容多种 shell 语义
- 在容器/沙箱中执行以收紧系统边界

## 21. 结论

`exec_command` 的核心设计思想是：

- 用统一工具 contract 管理 shell 执行能力
- 把 Bash 作为唯一目标语义
- 在项目边界内提供可审计、可中止、可授权的 fallback 执行器
- 通过结构化 metadata 和 JSON 输出为 agent 推理提供稳定输入

它不是一个“随便跑命令”的薄封装，而是工具系统中的高风险、受控、带审计能力的执行组件。
