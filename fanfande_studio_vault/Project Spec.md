感谢您的配合。通过这四轮深度访谈，我们已经从模糊的想法收敛到了一个具有工程可执行性的详细规格说明。

特别是我们确立了几个具有挑战性但极具价值的特征：
1.  **混合工具策略**：同时支持“万能Shell”和“原子API”，最大限度兼顾了灵活性与安全性。
2.  **Scratchpad 记忆机制**：放弃了复杂的向量库，转向更符合人类直觉的“显式状态维护”，这对 Prompt Engineering 要求较高，但能提供更精准的控制。
3.  **UI 交互的高标准**：结合了折叠式 TUI、状态栏仪表盘和队列输入机制。

以下是为您生成的完整技术规格说明书（Spec）。您可以直接将其保存为 `spec.md` 或 `README_ARCH.md`，作为项目的核心开发文档。

***

# Project Spec: Intelligent CLI Agent (REPL Overlay)

**Version:** 1.0.0
**Status:** Approved
**Date:** 2025-05-20 (Simulated)

## 1. 产品概述 (Executive Summary)
本系统是一个基于 **TypeScript (Bun)** 的终端常驻型 AI Agent。它采用 **REPL (Read-Eval-Print Loop)** 模式接管用户的终端会话。Agent 充当用户与操作系统之间的智能中间层，具备对文件系统、Git 仓库和 Shell 环境的感知能力。

核心设计哲学为 **"Ask-to-Execute"（询问后执行）** 结合 **"Progressive Disclosure"（渐进式披露）**，旨在在保障安全的前提下提供极高的自动化水平。

## 2. 技术栈 (Tech Stack)

*   **Runtime:** `Bun` (利用其快速启动、原生 TypeScript 支持和高效的 `Bun.spawn` 子进程管理)。
*   **AI Framework:** `Vercel AI SDK` (Core & UI)。用于统一管理模型接口（OpenAI/Anthropic/Local）、流式传输和工具调用（Function Calling）。
*   **TUI Rendering:** `Ink` (React for CLI) 或 `Pastel`。用于构建复杂的交互式终端界面（折叠块、状态栏、Spinner）。
*   **State Management:** `Zustand` 或 `Valtio` (如果使用 React/Ink 生态) / 原生 Class (如果使用纯逻辑)。
*   **Validation:** `Zod` (用于定义 AI Tools 的 Schema)。

## 3. 核心架构 (Core Architecture)

### 3.1 交互范式：Overlay REPL
*   **独占模式：** Agent 启动后进入独占循环。用户无法直接在 Prompt 中输入 `ls` 或 `cd`，所有意图必须通过自然语言表达，由 Agent 翻译为系统指令。
*   **输入队列 (Input Queue)：**
    *   当 Agent 处于 `BUSY` 状态（执行命令或思考中）时，终端输入框依然处于激活状态。
    *   用户的输入会被推入 `CommandQueue`。
    *   Agent 完成当前任务后，自动从队列头部取出下一条指令处理。
    *   *例外：* 所有的输入被视为“新的指令”或“对当前执行的反馈”。

### 3.2 记忆与上下文 (Memory & Context)
采用 **Scratchpad (草稿纸)** 策略，而非向量数据库。
*   **System Prompt 结构：**
    ```text
    [Static Role Definition]
    You are an expert CLI agent...

    [Dynamic Context Summary - Scratchpad]
    // Agent 必须通过工具显式更新此区域
    - Current Goal: Refactor login logic
    - Known Files: src/auth.ts, README.md
    - Last Error: 401 Unauthorized in tests

    [Tool Definitions]
    ...

    [Conversation History]
    User: ...
    Assistant: ...
    ```
*   **渐进式披露：** 初始上下文不包含任何文件内容。Agent 必须通过 `list_dir` 和 `read_file` 主动探索，并将关键信息总结写入 Scratchpad。

## 4. 工具系统 (Tool System)

系统支持两种工具模式，用户可在配置中切换或由 Agent 混合使用。

### 4.1 策略 A：通用 Shell 执行器 (Raw Shell)
*   **Tool Name:** `execute_shell_command`
*   **Params:** `{ command: string, description: string }`
*   **行为:** 通过 `Bun.spawn` 执行原生 Shell 命令。
*   **优点:** 极度灵活，支持管道、重定向。
*   **风险:** 注入风险高，难以解析结构化输出。

### 4.2 策略 B：原子化工具组 (Atomic Tools)
为了更细粒度的安全控制，预定义以下工具：
*   `read_file(path)`: 读取文件内容。
*   `write_file(path, content)`: **(高危)** 写入文件。
*   `list_directory(path)`: 列出目录。
*   `file_search(pattern)`: 模糊搜索文件。
*   `git_operation(action, args)`: 执行 git 命令。

## 5. 权限与安全 (Permissions & Safety)

实现 **Permission Middleware (权限中间件)**，拦截 Vercel AI SDK 的 `onToolCall` 事件。

### 5.1 自主权分级 (Autonomy Levels)
用户可在启动时或运行时调整：
*   **Level 1 (Paranoid):** 所有工具调用（包括 `ls`）均需用户按 `Y` 确认。
*   **Level 2 (Balanced - Default):**
    *   Read-only 操作（读取、搜索、列出）自动放行。
    *   Side-effect 操作（写入、删除、执行脚本、Shell命令）需用户确认。
*   **Level 3 (Autonomous):**
    *   Agent 生成一个 Plan（包含多步操作）。
    *   用户批准 Plan 后，Agent 自动执行序列，仅在出错时暂停。

### 5.2 信号处理 (Interrupts)
*   **SIGINT (Ctrl+C):** 遵循用户设定的严格模式。
    *   行为：直接终止 Agent 进程 (Exit code 0)。
    *   *User Note:* 用户接受由此带来的上下文丢失风险。

## 6. 用户界面 (UI/UX) - TUI Spec

界面垂直划分为三个区域：

### 6.1 顶部状态栏 (Sticky Header)
*   **Context Summary:** 显示当前 Agent 认知的“任务摘要” (从 Scratchpad 提取)。
*   **Token Dashboard:** 实时显示本次会话消耗的 Token 数量及预估费用（例如：`$0.02`）。
*   **Mode Indicator:** 显示当前权限等级 (e.g., `[Level 2: Auto-Read]` )。

### 6.2 中央交互区 (Scrollable Body)
*   **User Message:** 高亮显示用户输入。
*   **Thought Chain (折叠式):**
    *   默认状态：`> Thinking... (3 steps)` [折叠]
    *   展开状态：显示具体的推理过程、工具调用参数。
*   **Tool Execution:**
    *   显示：`$ npm run test`
    *   状态：Spinner (运行中) -> Checkmark (成功) / Cross (失败)。
    *   Output: 默认截断长输出，提供 `[View Full Output]` 选项。

### 6.3 底部输入区 (Sticky Footer)
*   输入框支持多行编辑。
*   显示当前队列状态（如果队列中有积压命令）。

## 7. 错误处理与健壮性 (Error Handling)

### 7.1 自动重试机制
*   **策略:** 当 Tool Execution 返回 exit code != 0 时。
*   **Loop:**
    1.  捕获 Stderr。
    2.  将错误反馈给 LLM。
    3.  LLM 生成新的修正指令。
*   **熔断:** 连续 **3次** 尝试解决同一任务失败，强制暂停。
    *   Action: 输出错误日志，向用户发送消息："我尝试了3次都失败了，请人工接手。"

### 7.2 模型回退 (Model Fallback) - (Vercel AI SDK Feature)
*   配置主模型 (e.g., Claude 3.5 Sonnet / GPT-4o)。
*   (可选) 当主模型 API 报错或 Rate Limit 时，自动降级到次选模型或本地模型。

## 8. 开发路线图 (Phase Plan)

1.  **Phase 1 (Skeleton):**
    *   搭建 Bun + Ink 项目结构。
    *   实现基本的 REPL 循环。
    *   集成 Vercel AI SDK，跑通简单的 Chat。

2.  **Phase 2 (Tools & Execution):**
    *   实现 `execute_shell` 和 `fs` 工具。
    *   实现 Level 2 权限拦截器 (Ask-to-Execute)。

3.  **Phase 3 (UI Polish):**
    *   实现 TUI 的折叠逻辑。
    *   实现 Token 计数器。
    *   实现 Scratchpad 的 Prompt 注入逻辑。

4.  **Phase 4 (Advanced):**
    *   实现输入队列机制。
    *   完善错误重试熔断。

---
*End of Specification*