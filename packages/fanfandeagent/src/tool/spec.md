# 工具模块规范

## 目标
`tool` 模块将模型可调用能力暴露为可校验、可执行、可审计的接口。
它是 agent 的能力边界，而不是业务实现层。

## 设计原则
1. 每个工具独立成文件，便于单独维护和测试。
2. 所有输入都必须通过 Zod 校验。
3. 输出应简洁、确定，并且便于回写到会话历史中。
4. 优先使用结构化文件工具；`exec_command` 只是兜底工具。
5. 所有文件系统路径都必须通过项目边界检查。

## 目录职责
- `tool.ts`
  - 定义 `ToolInfo` 和 `define()` 包装器。
  - 统一处理参数校验和错误包装。
- `registry.ts`
  - 收集内置工具和自定义工具。
  - 提供基于工具 id 的列出与查找能力。
- `shared.ts`
  - 提供共享的路径解析、文件读写和行范围格式化能力。
- `read-file.ts`
  - 读取完整文件或指定行范围。
- `write-file.ts`
  - 写入完整文本文件。
- `replace-text.ts`
  - 在文件中执行精确文本替换。
- `apply-patch.ts`
  - 对文件应用 unified diff 补丁（`apply_patch`）。
- `list-directory.ts`
  - 列出目录条目。
- `search-files.ts`
  - 在文件中搜索文本。
- `exec-command.ts`
  - 作为兜底手段，在项目边界内执行 bash 命令。

## ToolInfo 结构
- `id`：工具名称。
- `init()`：基于上下文初始化运行时工具行为。
- `description`：面向模型和界面的工具说明。
- `parameters`：Zod 输入 schema。
- `execute()`：工具执行逻辑。
- `formatValidationError()`：可选的自定义参数校验错误格式化函数。

## 运行时上下文
`Context` 包含：
- `sessionID`
- `messageID`
- `cwd`
- `worktree`
- `abort`

## 推荐核心工具集
1. `read-file`
2. `list-directory`
3. `search-files`
4. `write-file`
5. `replace-text`
6. `apply_patch`
7. `exec_command`

职责划分：
- 探索：`read-file`、`list-directory`、`search-files`
- 修改：`write-file`、`replace-text`、`apply_patch`
- 兜底 Shell 执行：`exec_command`

## `exec_command` 规范
### 工具 ID
`exec_command`

### 参数
- `command: string`
  - 必填，bash 命令文本。
- `workdir?: string`
  - 可选，工作目录；默认是当前项目目录。
- `timeoutMs?: number`
  - 可选，命令超时时间，单位毫秒。
- `maxOutputChars?: number`
  - 可选，每个输出流（`stdout` 和 `stderr`）保留的最大字符数。
- `allowUnsafe?: boolean`
  - 可选，是否允许已知的高风险命令模式。
- `description?: string`
  - 可选，用于结果标题的人类可读摘要。

### 行为约束
- 只能在项目边界内执行。
- 必须支持通过 abort signal 取消执行。
- 默认必须拦截已知的危险命令模式。
- 必须返回清晰的执行摘要：
  - command
  - workdir
  - shell path
  - exit status
  - stdout
  - stderr
- 输出被截断时必须明确说明。

### 失败处理
- 如果 `workdir` 不是目录，则报错。
- 如果找不到 bash 可执行文件，则报错。
- schema 错误由 `define()` 包装器统一抛出。
- 超时和取消都必须终止子进程，并在输出中标记状态。

## `apply_patch` 规范
### 工具 ID
`apply_patch`

### 参数
- `patch: string`
  - unified diff 文本，可包含一个或多个文件补丁。

### DSL
Unified diff 的关键语法：
- 文件头：`--- <old>` 和 `+++ <new>`
- Hunk 头：`@@ -<oldStart>,<oldCount> +<newStart>,<newCount> @@`
- 行类型：
  - ` ` 表示上下文行
  - `-` 表示删除行
  - `+` 表示新增行

### 支持的变更类型
- 更新已有文件。
- 创建文件（`--- /dev/null`）。
- 删除文件（`+++ /dev/null`）。
- 移动/重命名文件（`oldPath != newPath`）。

### 安全和行为约束
- 所有路径都必须通过项目边界检查。
- Hunk 必须严格匹配上下文。
- 解析不匹配或上下文不匹配时必须快速失败，不能静默做部分修复。

### 示例
```diff
--- a/src/example.txt
+++ b/src/example.txt
@@ -1,2 +1,2 @@
 hello
-world
+agent
```

## 扩展方向
1. `delete-file`
2. `move-file`
3. `git-status` / `git-diff`
4. 二进制或图片相关工具
