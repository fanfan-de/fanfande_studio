这份代码文件 `session.prompt.ts` 是一个 **AI 编程助手（类似 Cursor 或 OpenCode Interpreter）的核心会话管理模块**。

它的主要职责是处理用户输入，管理与大语言模型（LLM）的交互循环（Loop），执行工具（Tools），处理上下文（Context），并管理会话状态（如取消、繁忙状态）。

以下是代码的详细功能拆解：

### 1. 核心职责与入口

*   **命名空间 `SessionPrompt`**: 所有的逻辑都封装在这个命名空间下，表明这是处理会话提示词（Prompting）的核心逻辑。
*   **入口函数 `prompt`**:
    *   这是外部调用此模块的主要入口。
    *   它接收用户输入（`PromptInput`），包括 Session ID、模型、文本、文件附件等。
    *   它会清理之前的“撤销”状态（`SessionRevert.cleanup`）。
    *   它将用户输入转化为存储的消息对象（`createUserMessage`）。
    *   最后调用 `loop` 函数开始与 AI 的交互循环。

### 2. 交互主循环 (`loop`)

这是整个系统的心脏。当用户发一条消息后，AI 可能会进行多次思考、调用工具、再思考，直到最终回复。

*   **状态锁定**: 使用 `assertNotBusy` 和 `state` 变量来确保同一个 Session 不会被并发处理（防止冲突）。
*   **循环逻辑 (`while(true)`)**:
    1.  **加载历史消息**: 获取当前 Session 的消息流。
    2.  **压缩检测 (`Compaction`)**:
        *   如果检测到待处理的压缩任务（`compaction`），或者上下文 Token 超出限制（`SessionCompaction.isOverflow`），会触发历史记录压缩，以节省 Token 和上下文窗口。
    3.  **子任务处理 (`Subtask`)**:
        *   如果消息中包含 `subtask`（子任务）类型的 Part，系统会初始化一个 `TaskTool` 来执行这个子任务。
        *   这允许 AI 将大任务分解，或者通过特定的 Agent 执行命令。
        *   执行结果会作为新的 Tool 消息插入历史记录。
    4.  **环境与提醒 (`insertReminders`)**:
        *   在发送给 LLM 之前，会根据当前的 Agent（如 `plan` 模式）插入特定的系统提示词。
        *   **Plan Mode (实验性功能)**: 代码中包含大量关于 "Plan Workflow" 的逻辑。如果处于计划模式，系统会强制 AI 遵循 "探索 -> 设计 -> 审查 -> 计划 -> 退出" 的五步工作流，并禁止直接修改代码（除了计划文件）。
    5.  **调用处理器 (`SessionProcessor`)**:
        *   将处理后的消息、系统提示词、工具列表发送给 LLM。
        *   LLM 可能会返回文本回复，或者请求调用工具。
    6.  **终止条件**: 当 LLM 返回非 Tool Call 的结束标志，且没有挂起的任务时，跳出循环。

### 3. 工具解析与执行 (`resolveTools`)

*   **动态工具加载**: 根据当前的 Agent 和 Model，从 `ToolRegistry` 加载可用的工具（如读文件、写文件、列出目录等）。
*   **MCP 支持**: 集成了 **Model Context Protocol (MCP)**。代码遍历 `MCP.tools()`，将外部 MCP 服务器提供的工具注入到会话中。
    *   **特殊处理**: 对 MCP 工具的执行结果进行了截断（`Truncate.output`）和格式化（支持文本、图片、资源 blob），防止输出过长撑爆上下文。
*   **权限控制**: 在执行工具前，通过 `PermissionNext` 检查权限，或者询问用户是否允许执行。
*   **生命周期钩子**: 在工具执行前后触发 `Plugin.trigger`，允许插件干预。

### 4. 消息创建与预处理 (`createUserMessage`)

当用户输入被接收时，需要将其转化为系统内部的消息格式。

*   **文件与附件处理**:
    *   **Local Files**: 如果用户上传或引用了本地文件，会读取文件内容。
    *   **Read Tool 模拟**: 如果是文本文件，代码会模拟一个 "Read Tool" 的调用过程（生成假的 Tool Call 和 Tool Output），这样 AI 就能在上下文中看到文件内容，就像是它自己读取的一样。
    *   **MCP Resources**: 支持读取 MCP 提供的资源（`mcp://...`），并将其转化为文本或二进制内容。
    *   **Data URLs**: 处理 Base64 编码的文件上传。
*   **符号解析**: 如果 URL 带有行号参数（LSP 符号跳转），会尝试读取特定范围的代码行。
*   **Agent 委托**: 如果用户通过 `@AgentName` 提到某个 Agent，会生成提示词引导 AI 调用子任务工具。

### 5. 命令行与 Shell 集成

*   **`shell` 函数**:
    *   允许直接在 Session 中执行 Shell 命令。
    *   它不直接调用 `exec`，而是**伪造**一段对话历史：用户发送请求 -> Assistant 回复说要调用 bash 工具 -> Tool 执行命令并返回结果。
    *   **Shell 兼容性**: 针对 `zsh`, `bash`, `fish`, `powershell`, `cmd` 等不同 Shell 做了特定的参数适配（如加载 `.zshrc` 配置文件）。
*   **`command` 函数 (Slash Commands)**:
    *   处理如 `/edit`, `/review` 等以斜杠开头的命令。
    *   支持模板替换（将参数填入预设的 Prompt 模板）。
    *   支持 Shell 脚本预执行（在模板中运行 `!ls` 并替换结果）。
    *   可以将命令路由给特定的 Agent 或 Model 执行。

### 6. 其他辅助功能

*   **自动生成标题 (`ensureTitle`)**:
    *   在会话的第一轮交互结束后，使用一个小模型（Small Model）根据对话内容自动生成一个简短的会话标题。
*   **取消机制 (`cancel`)**:
    *   利用 `AbortController` 可以在中途打断 LLM 的生成或工具的执行。
*   **Prompt 解析 (`resolvePromptParts`)**:
    *   解析用户输入中的文件路径（支持 `~` 目录展开），自动识别这是一个文件、目录还是 Agent。

### 总结

这份代码是 **AI 编码助手的“大脑中枢”**。它不仅仅是简单的“发消息给 GPT”，而是构建了一个复杂的运行时环境：
1.  **它让 AI 拥有“手”**：通过 `resolveTools` 和 `loop`，AI 可以连续操作文件系统。
2.  **它管理“记忆”**：通过 `Compaction` 和消息历史管理，确保上下文有效。
3.  **它支持“感知”**：通过 `createUserMessage` 处理文件读取和 MCP 资源，让 AI 能看到项目代码。
4.  **它规范“行为”**：通过 `insertReminders` 中的 Plan Mode，强制 AI 遵守最佳工程实践（先思考再动手）。