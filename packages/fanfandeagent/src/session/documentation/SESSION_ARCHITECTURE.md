# Code Agent - Session Module Architecture

## 1. Context（系统上下文：边界与价值）
**一句话定义**：Session 模块是用户与 Code Agent 之间进行一次“编码任务”的生命周期载体。它负责记住“我们在干什么”、“我们做过什么”以及“当前的环境是什么”。

- **Actor（参与者）**：
  - User (开发者)：发起指令，如“帮我写一个登录接口”。
  - LLM (大语言模型)：接收当前 Session 的上下文并返回动作。
- **External Dependencies（外部依赖）**：
  - **File System (FS)**：Session 需要知道当前的工作目录（CWD）。
  - **Vector DB / SQLite**：用于持久化保存历史 Session 记录。
  - **LLM API Client**：负责实际向外发送请求。

---

## 2. Container（容器：宏观选型）
- **运行环境**：Node.js (本地运行的 CLI 工具或 VS Code 插件后台)。
- **持久化方案**：本地 SQLite（因为是给开发者用的本地 Agent，数据不出域）。
- **设计范式**：Event-Driven（事件驱动）。Session 本身不主动“写代码”，它只是维护状态并派发事件（如 `onLLMReply`, `onToolExecuted`）。

---

## 3. Component（组件：内部职责划分）
在 Session 模块内部，为了防止代码滚雪球，我们将其拆分为 4 个职责单一的核心子组件：

1. **`SessionManager` (总管)**：负责创建、恢复、销毁 Session。
2. **`ContextWindow` (视窗)**：极其重要。它负责对历史记录进行剪裁（Token 截断），决定这次发给 LLM 的具体是哪几条上下文。
3. **`ToolRegistry` (工具箱)**：当前 Session 被授权使用的能力清单（例如：允许读文件，但不允许执行 `rm -rf` Bash 命令）。
4. **`StateTracker` (状态机)**：维护 Session 的当前状态（是正在思考，还是在等用户输入？）。

---

## 4. Code & Data (数据结构与状态机) - 核心护栏

### 4.1 核心状态机 (State Machine)
Session 不是只有“开”和“关”，它有严密的流转状态。
```mermaid
stateDiagram-v2
    [*] --> IDLE: 创建 Session
    IDLE --> THINKING: 用户输入需求
    THINKING --> TOOL_CALLING: LLM 决定使用工具
    TOOL_CALLING --> THINKING: 工具执行完毕，返回结果
    THINKING --> WAITING_USER_INPUT: LLM 需要用户确认/补充
    WAITING_USER_INPUT --> THINKING: 用户回复
    THINKING --> FINISHED: 任务完成
    FINISHED --> [*]