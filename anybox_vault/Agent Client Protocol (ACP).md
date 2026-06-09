**Agent Client Protocol (ACP)** 是一个开放标准协议，旨在标准化**代码编辑器（Client）**与**AI 编程 Agent（Agent）**之间的通信。[[1](https://www.google.com/url?sa=E&q=https%3A%2F%2Fvertexaisearch.cloud.google.com%2Fgrounding-api-redirect%2FAUZIYQHRJyYd2dqHoUqbs1wUwIcrOROIG-POmr9OOHWgXHrDjlfCCJCsUGHUXOUYPgQHnZZiyfdJ7yShceijWmiSNSJCt9vaQSB3peirxHH1HKk81IwLB66XXCPkQhzoOCbKtq_PzmyYHkIw6YHVjnngd-uS40495P1rfDaOhOPQijTw-h5eFx19J58JGh-luw%3D%3D)][[2](https://www.google.com/url?sa=E&q=https%3A%2F%2Fvertexaisearch.cloud.google.com%2Fgrounding-api-redirect%2FAUZIYQHPb6SegYxhyBoCunB1Ap7qm0bio1OjQP5l1Q2-MMkKRb23H7u2I0Y5X_usGApryek6rr8ohW8ic1gqMEG8OIsl_vd2cPrw9FA2F_V0e3HYLbwmjOC1cvoL3VoQTipxjzo30BhjnWaLi1P7HpbAlgzfe00CkycoGw%3D%3D)][[3](https://www.google.com/url?sa=E&q=https%3A%2F%2Fvertexaisearch.cloud.google.com%2Fgrounding-api-redirect%2FAUZIYQEkQIBmqOyFHD-R6VNStiRsi1AFjvYzvaUZVHtKj0c51-ctw2qMzenLZhjc8tI3cqIS-tVfiNCs-qRurG422tpgrm3-qVKiPqFwfG4qdzw%3D)][[4](https://www.google.com/url?sa=E&q=https%3A%2F%2Fvertexaisearch.cloud.google.com%2Fgrounding-api-redirect%2FAUZIYQFTzd-GkRO_PB4CJzSUxAFd-cREUeBRUETAHTT35ot6B3hAgdLpJ0SqrX7WDBLFU2LVnrWmiv-OVuHQO8rhqPcdYBH6ElT3PqQqyUke2elrWIE-NHdYmhdV)]

简单来说，它的目标是像 **LSP (Language Server Protocol)** 统一了编辑器与编程语言支持（如自动补全、跳转定义）那样，统一编辑器与 AI Agent 的交互。

以下是关于 ACP 的详细介绍：

### 1. 核心目标：解决 "N x M" 问题
在 ACP 出现之前，如果你开发了一个 AI 编程 Agent（例如 Claude Code 或 OpenCode），你需要为 VS Code 写一个插件，为 JetBrains 写一个插件，为 Zed 写一个插件……每个编辑器都有不同的 API。

ACP 通过定义一套通用的 JSON-RPC 消息标准，实现了：
*   **一次编写，到处运行**：Agent 开发者只需实现 ACP 接口，就可以在任何支持 ACP 的编辑器（如 Zed, JetBrains IDEs, Neovim）中运行。
*   **编辑器中立**：用户可以在自己喜欢的编辑器中使用自己喜欢的 AI Agent，而不必被绑定在某个特定的生态系统中（例如 Copilot 绑定 VS Code，JetBrains AI 绑定 IntelliJ）。

### 2. ACP vs. MCP (Model Context Protocol)
这是最容易混淆的一点。两者都是 AI 协议，但侧重点完全不同，实际上是互补关系：

| 特性 | **MCP (Model Context Protocol)** | **ACP (Agent Client Protocol)** |
| :--- | :--- | :--- |
| **主要功能** | 连接 **LLM** 与 **数据/工具** | 连接 **编辑器** 与 **Agent** |
| **关注点** | **上下文获取** ("What")<br>例如：读取数据库、查询 API、读取 Git 历史 | **用户体验与工作流** ("Where")<br>例如：处理用户 Prompt、管理会话、申请权限、修改文件 |
| **角色** | Server 提供工具，Client (LLM) 调用工具 | Client (编辑器) 提供环境，Agent 执行任务 |
| **比喻** | AI 的 "USB 接口" (连接外设) | AI 的 "操作系统接口" (连接用户界面) |[[5](https://www.google.com/url?sa=E&q=https%3A%2F%2Fvertexaisearch.cloud.google.com%2Fgrounding-api-redirect%2FAUZIYQHewbV0c8VHRu_CTpTaliX6e0ZZmieP-t-T05VTOoblS5x9q1xU4qyebx18MFl97H77_EDvUoj0GDChhpv5xMzUXWP-2oSA4hbYaLaxsowHzg6MDW7S9v4aFyVFltBp0n9zp-a6zx08qH37o4rz1ElGzZ-twjFuQSx8HFjg5xIKsHiPs_4uGkr1Co2OYjb63nLRlNdVzg9muxo6j-kdqr71StHOd6SnQquh)]

**协同工作模式：**
一个典型的 ACP Agent（如 OpenCode）运行在编辑器中（通过 ACP 通信），当它需要获取特定数据时，它可以连接到一个 MCP Server。

### 3. 架构与工作原理
ACP 基于 **JSON-RPC 2.0**，通常通过标准输入/输出 (**stdio**) 进行通信。

*   **Client (客户端)**: 通常是代码编辑器（如 Zed）。它负责：
    *   提供用户界面（聊天窗口）。[[6](https://www.google.com/url?sa=E&q=https%3A%2F%2Fvertexaisearch.cloud.google.com%2Fgrounding-api-redirect%2FAUZIYQEh9JOrMfM8tn9JiLwC2huDpLCfcINubI8v6wEptJLdIM9NyQszyDsnbh7hoOguoD33ftDMTUjn-ugUJti9FoHqKg71TQZzoV5ASDhIGhED0KuSrOxXw2w5lZ3gsqb9SgZSIK6kLg5zwyo9l53Gmes%3D)]
    *   管理文件系统访问权限。[[7](https://www.google.com/url?sa=E&q=https%3A%2F%2Fvertexaisearch.cloud.google.com%2Fgrounding-api-redirect%2FAUZIYQF5AG9b3LGY3iuEvL4pQNou7dv9gyIQ16K_MEpYBZlH1Db4vAsuGnmSARvIFTGHDTYbm9Zh_stoPu7lNAfXTwIGT1oFXUwieTlEkxmCjO5FrHE4KmcCdwHsiNWze8WgnM1iRMj6WCw%3D)]
    *   提供终端（Terminal）能力。
    *   将用户的 Prompt 发送给 Agent。[[1](https://www.google.com/url?sa=E&q=https%3A%2F%2Fvertexaisearch.cloud.google.com%2Fgrounding-api-redirect%2FAUZIYQHRJyYd2dqHoUqbs1wUwIcrOROIG-POmr9OOHWgXHrDjlfCCJCsUGHUXOUYPgQHnZZiyfdJ7yShceijWmiSNSJCt9vaQSB3peirxHH1HKk81IwLB66XXCPkQhzoOCbKtq_PzmyYHkIw6YHVjnngd-uS40495P1rfDaOhOPQijTw-h5eFx19J58JGh-luw%3D%3D)][[8](https://www.google.com/url?sa=E&q=https%3A%2F%2Fvertexaisearch.cloud.google.com%2Fgrounding-api-redirect%2FAUZIYQGjh56Kxmy9c2wcFotM99z9RbzC0FHyz8rvhY554tHwafiWg26gmKrKAsU9N8ElLdcr4kRBQ-rV7onYgYHZ88d_uIbd0r3zklQ-I5V3A5-6V5wB0nckSBmcqV7usVg%3D)][[9](https://www.google.com/url?sa=E&q=https%3A%2F%2Fvertexaisearch.cloud.google.com%2Fgrounding-api-redirect%2FAUZIYQG0AF2r_oCC00qWj76r82gDq4RgEfpO_NzeCmIx4o7Ffh2gdLcI_Bd72m7Sy1sePItocWtXoK26hCAVrKdbdW2jlKTzhv65tsgUTZaDFbE498rQVd3zppxtyE3ynDNA_Q_8__fj84slYoC_0LX9gmrP)]
*   **Agent (代理)**: AI 程序（如 OpenCode, Claude Code）。它负责：
    *   接收 Prompt 并进行推理（调用 LLM）。
    *   请求执行操作（如 "请帮我读取 `main.ts`" 或 "请在终端运行 `npm test`"）。
    *   返回处理结果。

### 4. 关键生命周期与能力
根据协议规范，ACP 的交互流程主要包括：

1.  **初始化 (`initialize`)**:
    *   Agent 告诉编辑器它支持什么（例如：是否支持多轮对话）。
    *   编辑器告诉 Agent 它能提供什么能力（例如：文件读写、终端命令执行）。
2.  **会话管理 (`session/new`, `session/load`)**:
    *   创建新的对话上下文，通常会携带当前的工作目录 (`cwd`) 信息。
3.  **交互 (`session/prompt`)**:
    *   编辑器发送用户消息。[[9](https://www.google.com/url?sa=E&q=https%3A%2F%2Fvertexaisearch.cloud.google.com%2Fgrounding-api-redirect%2FAUZIYQG0AF2r_oCC00qWj76r82gDq4RgEfpO_NzeCmIx4o7Ffh2gdLcI_Bd72m7Sy1sePItocWtXoK26hCAVrKdbdW2jlKTzhv65tsgUTZaDFbE498rQVd3zppxtyE3ynDNA_Q_8__fj84slYoC_0LX9gmrP)]
    *   Agent 处理消息，期间可能请求编辑器执行工具（如 `fs.readTextFile`）。[[10](https://www.google.com/url?sa=E&q=https%3A%2F%2Fvertexaisearch.cloud.google.com%2Fgrounding-api-redirect%2FAUZIYQEmpAeut3GpJt4k-FdalyB6ubZc8uLejq44NYPGP1nbrSAs1-VUazt7BhpERxAcCGi5NIMQTS7-HAon8d3XjMnwlOY_eSt2nMybm3WzSci7jjzL8cFdAvLMWLcn__uTTi9fi-iVtyrOrapP1fA%3D)]
    *   Agent 返回最终响应。
4.  **权限控制**:
    *   这是 ACP 的一个重要设计。因为 Agent 是外部进程，编辑器可以拦截 Agent 的敏感操作（如写文件、执行 Shell 命令），并要求用户批准。这比完全黑盒的 AI 插件更安全。

### 5. 当前生态系统
ACP 目前处于快速发展阶段（v1 版本）：

*   **支持的编辑器**:
    *   **Zed**: 原生支持，是 ACP 的主要推动者。
    *   **JetBrains IDEs (IntelliJ, PyCharm 等)**: 通过官方合作正在集成。
    *   **Neovim**: 社区已有插件支持（如 `avante.nvim`）。[[4](https://www.google.com/url?sa=E&q=https%3A%2F%2Fvertexaisearch.cloud.google.com%2Fgrounding-api-redirect%2FAUZIYQFTzd-GkRO_PB4CJzSUxAFd-cREUeBRUETAHTT35ot6B3hAgdLpJ0SqrX7WDBLFU2LVnrWmiv-OVuHQO8rhqPcdYBH6ElT3PqQqyUke2elrWIE-NHdYmhdV)]
*   **支持的 Agent**:
    *   **Claude Code**: Anthropic 的官方 CLI 工具。
    *   **Google Gemini CLI**.
    *   **OpenCode**: 你之前提到的项目，作为一个开源的 ACP 实现。
    *   **Goose**: Block 公司推出的 Agent。

### 6. 总结
**Agent Client Protocol (ACP)** 是 AI 辅助编程领域迈向标准化的重要一步。[[1](https://www.google.com/url?sa=E&q=https%3A%2F%2Fvertexaisearch.cloud.google.com%2Fgrounding-api-redirect%2FAUZIYQHRJyYd2dqHoUqbs1wUwIcrOROIG-POmr9OOHWgXHrDjlfCCJCsUGHUXOUYPgQHnZZiyfdJ7yShceijWmiSNSJCt9vaQSB3peirxHH1HKk81IwLB66XXCPkQhzoOCbKtq_PzmyYHkIw6YHVjnngd-uS40495P1rfDaOhOPQijTw-h5eFx19J58JGh-luw%3D%3D)][[7](https://www.google.com/url?sa=E&q=https%3A%2F%2Fvertexaisearch.cloud.google.com%2Fgrounding-api-redirect%2FAUZIYQF5AG9b3LGY3iuEvL4pQNou7dv9gyIQ16K_MEpYBZlH1Db4vAsuGnmSARvIFTGHDTYbm9Zh_stoPu7lNAfXTwIGT1oFXUwieTlEkxmCjO5FrHE4KmcCdwHsiNWze8WgnM1iRMj6WCw%3D)][[11](https://www.google.com/url?sa=E&q=https%3A%2F%2Fvertexaisearch.cloud.google.com%2Fgrounding-api-redirect%2FAUZIYQG_ytRdbmeQKeAkCOP4XR2_IOl4On4ZsvFn72QXk-D6EVTIJtVQZXZdDDCOgb76GOlzKLfCSp20mcTE9KHv8BWfMcQEhUbv3FhbUhh3yo42z2FzZ7RVqwf347RS)]

*   **对开发者**: 只需要维护一套协议代码。
*   **对用户**: 可以在 Zed 或其他轻量级编辑器中，享受到以前只有在 VS Code + Copilot 中才有的深度集成体验，而且拥有更多的 Agent 选择权。

如果你正在开发类似 `opencode` 这样的工具，实现 ACP 接口意味着你的工具可以直接无缝接入 Zed 编辑器，获得即插即用的 GUI 界面，而不需要自己开发复杂的 Electron 前端。
Sources
help
github.io
github.com
zed.dev
opencode.ai
medium.com
jetbrains.com
youtube.com
auth0.com
agentclientprotocol.com
agentclientprotocol.com
agentclientprotocol.com