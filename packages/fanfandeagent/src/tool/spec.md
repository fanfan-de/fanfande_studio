# Tool Module Spec

## 目标
`tool` 模块负责把模型可调用的能力收敛为可校验、可执行、可审计的接口。
它不是业务实现本身，而是 Agent 的能力边界层。

## 设计原则
1. 每个工具一个文件，便于独立维护与测试。
2. 所有入参必须通过 Zod 校验。
3. 输出尽量短、确定、可直接回写会话。
4. 优先提供文件级结构化工具，`exec_command` 仅作为兜底。
5. 所有路径必须经过项目边界校验。

## 目录职责
- `tool.ts`
  - 定义 `ToolInfo` 接口和 `define()` 包装器。
  - 统一参数校验与错误包装。
- `registry.ts`
  - 汇总内置工具与扩展工具。
  - 提供按名称查询与枚举能力。
- `shared.ts`
  - 提供路径解析、读写文件、行范围格式化等共享能力。
- `read-file.ts`
  - 按文件或行范围读取文本。
- `write-file.ts`
  - 整体写入文本文件。
- `replace-text.ts`
  - 按精确文本执行替换。
- `apply-patch.ts`
  - 使用 Git 风格 Unified Diff（`apply_patch`）对文件执行增量修改。
- `list-directory.ts`
  - 列出目录内容。
- `search-files.ts`
  - 在文件中搜索文本。
- `exec-command.ts`
  - 在项目边界内执行 bash 命令（兜底能力）。

## ToolInfo 结构
- `id`
  - 工具名称。
- `init()`
  - 根据上下文初始化运行时工具信息。
- `description`
  - 面向模型和 UI 的工具说明。
- `parameters`
  - Zod 参数 schema。
- `execute()`
  - 执行工具逻辑。
- `formatValidationError()`
  - 可选，自定义参数校验失败信息。

## 运行上下文
`Context` 表示一次工具调用可用的信息：
- `sessionID`
- `messageID`
- `cwd`
- `worktree`
- `abort`

## 建议的基础工具集
1. `read-file`
2. `list-directory`
3. `search-files`
4. `write-file`
5. `replace-text`
6. `apply_patch`
7. `exec_command`

其中：
- `read-file`、`list-directory`、`search-files` 负责探索。
- `write-file`、`replace-text`、`apply_patch` 负责修改。
- `exec_command` 仅在结构化工具不适用时使用。

## `apply_patch` 规范
### Tool ID
`apply_patch`

### 参数
- `patch: string`
  - Git 风格 Unified Diff 文本，可包含一个或多个文件 patch。

### DSL
遵循 Unified Diff 关键结构：
- 文件头：`--- <old>` 与 `+++ <new>`
- Hunk 头：`@@ -<oldStart>,<oldCount> +<newStart>,<newCount> @@`
- 行类型：
  - ` `（空格开头）：上下文行
  - `-`：删除行
  - `+`：新增行

### 支持的变更类型
- 更新现有文件内容。
- 创建新文件（`--- /dev/null`）。
- 删除文件（`+++ /dev/null`）。
- 重命名/移动文件（`oldPath != newPath`）。

### 安全与行为约束
- 所有路径都必须通过项目边界校验。
- hunk 采用严格上下文匹配，防止误改。
- patch 解析失败或上下文不匹配时立即报错，不做部分静默修复。

### 示例
```diff
--- a/src/example.txt
+++ b/src/example.txt
@@ -1,2 +1,2 @@
 hello
-world
+agent
```

## 扩展建议
后续可按需补充：
1. `delete-file`（纯删除工具）
2. `move-file`（纯移动工具）
3. `git-status` / `git-diff`
4. 二进制文件与图片相关工具
