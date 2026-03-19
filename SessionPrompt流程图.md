# SessionPrompt 模块流程图

```mermaid
flowchart TD
    subgraph Entry["入口点"]
        PROMPT["prompt(input)"]
        SHELL["shell(input)"]
        COMMAND["command(input)"]
    end

    %% ==================== prompt() ====================
    PROMPT --> P1["获取 Session"]
    P1 --> P2["清理 Revert 历史"]
    P2 --> P3["createUserMessage(input)"]
    P3 --> P4["Session.touch()"]
    P4 --> P5{"input.tools 有权限设置?"}
    P5 -->|是| P6["设置向后兼容权限"]
    P5 -->|否| P7{"input.noReply?"}
    P6 --> P7
    P7 -->|是| P_RET_MSG["返回 user message"]
    P7 -->|否| LOOP

    %% ==================== createUserMessage() ====================
    subgraph CreateUserMsg["createUserMessage()"]
        CU1["解析 Agent / Model / Variant"]
        CU1 --> CU2["构建 MessageV2.Info (role=user)"]
        CU2 --> CU3["遍历 input.parts"]
        CU3 --> CU_FILE{"part.type?"}

        CU_FILE -->|file| CU_F1{"来源类型?"}
        CU_F1 -->|MCP resource| CU_MCP["MCP.readResource → 生成 text parts"]
        CU_F1 -->|data: URL| CU_DATA["解码 data URL → text + file part"]
        CU_F1 -->|file: URL| CU_LOCAL{"mime 类型?"}
        CU_LOCAL -->|text/plain| CU_READ["调用 ReadTool 读取文件内容"]
        CU_LOCAL -->|directory| CU_DIR["调用 ReadTool 列出目录"]
        CU_LOCAL -->|image/其他| CU_BIN["读取文件 → base64 data URL"]

        CU_FILE -->|agent| CU_AGT["生成 agent part + 合成提示\n'Use task tool with subagent: X'"]
        CU_FILE -->|text| CU_TXT["直接传递 text part"]
        CU_FILE -->|subtask| CU_SUB["直接传递 subtask part"]

        CU_MCP --> CU_SAVE
        CU_DATA --> CU_SAVE
        CU_READ --> CU_SAVE
        CU_DIR --> CU_SAVE
        CU_BIN --> CU_SAVE
        CU_AGT --> CU_SAVE
        CU_TXT --> CU_SAVE
        CU_SUB --> CU_SAVE

        CU_SAVE["Plugin: chat.message\n校验 & 保存 message + parts"]
    end
    P3 -.-> CU1

    %% ==================== loop() ====================
    subgraph Loop["loop(sessionID)"]
        LOOP["loop()"]
        LOOP --> L0{"start() / resume()"}
        L0 -->|已有循环在运行| L_WAIT["加入 callbacks 队列等待"]
        L0 -->|获得 abort signal| L_WHILE

        L_WHILE["while(true) 循环开始"]
        L_WHILE --> L1{"abort.aborted?"}
        L1 -->|是| L_EXIT["退出循环"]
        L1 -->|否| L2["获取消息流\nMessageV2.filterCompacted"]

        L2 --> L3["扫描消息:\n找 lastUser / lastAssistant\nlastFinished / tasks"]
        L3 --> L4{"lastUser 存在?"}
        L4 -->|否| L_ERR["抛出错误"]
        L4 -->|是| L5{"lastAssistant 已完成\n且非 tool-calls/unknown?"}
        L5 -->|是| L_EXIT
        L5 -->|否| L6["step++"]

        L6 --> L6T{"step == 1?"}
        L6T -->|是| L_TITLE["异步: ensureTitle()"]
        L6T -->|否| L7
        L_TITLE --> L7

        L7["获取 Model"] --> L8{"有待处理 task?"}

        %% Subtask branch
        L8 -->|subtask| L_SUB["处理 Subtask"]
        subgraph SubtaskProc["Subtask 处理"]
            LS1["创建 assistant message"]
            LS1 --> LS2["创建 tool part (TaskTool)"]
            LS2 --> LS3["Plugin: tool.execute.before"]
            LS3 --> LS4["TaskTool.execute()"]
            LS4 --> LS5{"执行成功?"}
            LS5 -->|是| LS6["更新 part: completed"]
            LS5 -->|否| LS7["更新 part: error"]
            LS6 --> LS8{"task.command?"}
            LS7 --> LS8
            LS8 -->|是| LS9["插入合成 user message\n'Summarize and continue'"]
            LS8 -->|否| LS_CONT["continue → 回到循环"]
            LS9 --> LS_CONT
        end
        L_SUB -.-> LS1

        %% Compaction branch
        L8 -->|compaction| L_CMP["SessionCompaction.process()"]
        L_CMP --> L_CMP_R{"结果?"}
        L_CMP_R -->|stop| L_EXIT
        L_CMP_R -->|其他| L_WHILE

        %% No task
        L8 -->|无 task| L9{"上下文溢出?\n(tokens 超过 model 限制)"}
        L9 -->|是| L_OVERFLOW["创建 Compaction 任务"]
        L_OVERFLOW --> L_WHILE
        L9 -->|否| L_NORMAL

        %% Normal processing
        subgraph NormalProc["正常 LLM 处理"]
            L_NORMAL["获取 Agent / maxSteps"]
            L_NORMAL --> LN1["insertReminders()"]
            LN1 --> LN2["创建 SessionProcessor\n+ assistant message"]
            LN2 --> LN3["resolveTools()"]
            LN3 --> LN3B{"format = json_schema?"}
            LN3B -->|是| LN3C["注入 StructuredOutput tool"]
            LN3B -->|否| LN4
            LN3C --> LN4

            LN4 --> LN4S{"step == 1?"}
            LN4S -->|是| LN4T["异步: SessionSummary"]
            LN4S -->|否| LN5
            LN4T --> LN5

            LN5["包装排队用户消息\n(step > 1 时加 reminder)"]
            NN5 --> LN5P["Plugin: experimental.chat.messages.transform"]
            LN5 --> LN5P
            LN5P --> LN6["构建 system prompt\n(environment + skills + instructions)"]
            LN6 --> LN7["processor.process()\n调用 LLM 流式处理"]

            LN7 --> LN8{"structuredOutput 被捕获?"}
            LN8 -->|是| LN8A["保存 structured 到 message\n设置 finish=stop"]
            LN8A --> LN_EXIT["break 退出循环"]

            LN8 -->|否| LN9{"model 完成且非 tool-calls?"}
            LN9 -->|是 + json_schema| LN9E["设置 StructuredOutputError"]
            LN9E --> LN_EXIT
            LN9 -->|是 + text 格式| LN10{"result?"}
            LN9 -->|否| LN10

            LN10 -->|stop| LN_EXIT
            LN10 -->|compact| LN_COMPACT["创建 Compaction 任务"]
            LN10 -->|continue| LN_CONT["continue → 回到循环"]
            LN_COMPACT --> LN_CONT
        end

        LN_EXIT --> L_EXIT
        LN_CONT --> L_WHILE
        LS_CONT --> L_WHILE

        L_EXIT --> L_PRUNE["SessionCompaction.prune()"]
        L_PRUNE --> L_RETURN["返回最后 assistant message\n通知 queued callbacks"]
    end

    %% ==================== resolveTools() ====================
    subgraph ResolveTool["resolveTools()"]
        RT1["遍历 ToolRegistry.tools()\n按 model + agent 过滤"]
        RT1 --> RT2["每个 tool:\nProviderTransform.schema 转换\n包装 execute 加入 Plugin hooks"]
        RT2 --> RT3["遍历 MCP.tools()"]
        RT3 --> RT4["每个 MCP tool:\n转换 schema\n包装 execute:\n- Plugin hooks\n- Permission check\n- 解析 content → text/image\n- Truncate 输出"]
        RT4 --> RT5["返回 tools map"]
    end
    LN3 -.-> RT1

    %% ==================== insertReminders() ====================
    subgraph Reminders["insertReminders()"]
        IR1{"EXPERIMENTAL_PLAN_MODE?"}
        IR1 -->|否| IR2{"agent = plan?"}
        IR2 -->|是| IR3["追加 PROMPT_PLAN"]
        IR2 -->|否| IR4{"历史有 plan agent?"}
        IR4 -->|是 + agent=build| IR5["追加 BUILD_SWITCH"]
        IR4 -->|否| IR6["返回原消息"]

        IR1 -->|是| IR7{"plan → build 切换?"}
        IR7 -->|是| IR8["追加 BUILD_SWITCH\n+ plan 文件路径提示"]
        IR7 -->|否| IR9{"进入 plan 模式?"}
        IR9 -->|是| IR10["追加完整的\nPlan Mode 系统提示\n(5阶段工作流)"]
        IR9 -->|否| IR6
    end
    LN1 -.-> IR1

    %% ==================== shell() ====================
    SHELL --> SH1["start() 获取 abort signal"]
    SH1 --> SH1B{"已有循环?"}
    SH1B -->|是| SH_BUSY["抛出 BusyError"]
    SH1B -->|否| SH2["获取 Session / 清理 Revert"]
    SH2 --> SH3["创建 user message\n(合成: 'tool executed by user')"]
    SH3 --> SH4["创建 assistant message"]
    SH4 --> SH5["创建 tool part (bash, running)"]
    SH5 --> SH6["确定 shell 类型\n(zsh/bash/fish/nu/cmd/pwsh)"]
    SH6 --> SH7["Plugin: shell.env"]
    SH7 --> SH8["spawn 子进程"]
    SH8 --> SH9["收集 stdout/stderr\n实时更新 part.metadata"]
    SH9 --> SH10{"被 abort?"}
    SH10 -->|是| SH11["kill 进程树\n追加 abort 元数据"]
    SH10 -->|否| SH12
    SH11 --> SH12["更新 message + part: completed"]
    SH12 --> SH13["返回结果"]
    SH13 --> SH14{"有排队 callbacks?"}
    SH14 -->|是| SH15["触发 loop() 继续处理"]
    SH14 -->|否| SH16["cancel() 清理状态"]

    %% ==================== command() ====================
    COMMAND --> CMD1["获取 Command 配置"]
    CMD1 --> CMD2["解析参数 (argsRegex)"]
    CMD2 --> CMD3["模板替换 $1 $2 ... $ARGUMENTS"]
    CMD3 --> CMD4{"模板含 !`...` ?"}
    CMD4 -->|是| CMD5["执行 shell 替换"]
    CMD4 -->|否| CMD6
    CMD5 --> CMD6["解析 model (command > agent > input > last)"]
    CMD6 --> CMD7["验证 model 存在"]
    CMD7 --> CMD8["验证 agent 存在"]
    CMD8 --> CMD9["resolvePromptParts(template)"]
    CMD9 --> CMD10{"是 subtask?"}
    CMD10 -->|是| CMD11["构建 subtask part"]
    CMD10 -->|否| CMD12["使用 template parts"]
    CMD11 --> CMD13["Plugin: command.execute.before"]
    CMD12 --> CMD13
    CMD13 --> CMD14["调用 prompt()"]
    CMD14 --> CMD15["Bus: Command.Event.Executed"]

    %% ==================== ensureTitle() ====================
    subgraph Title["ensureTitle()"]
        T1{"有 parentID?"}
        T1 -->|是| T_SKIP["跳过"]
        T1 -->|否| T2{"title 是默认?"}
        T2 -->|否| T_SKIP
        T2 -->|是| T3{"是第一条真实用户消息?"}
        T3 -->|否| T_SKIP
        T3 -->|是| T4["获取 title agent"]
        T4 --> T5["用小模型 LLM.stream()\n生成标题"]
        T5 --> T6["清理思考标签\n截断到 100 字符"]
        T6 --> T7["Session.setTitle()"]
    end

    %% Styling
    style Entry fill:#4A90D9,color:#fff
    style Loop fill:#f0f4ff,stroke:#4A90D9
    style SubtaskProc fill:#fff8e1,stroke:#f9a825
    style NormalProc fill:#e8f5e9,stroke:#43a047
    style ResolveTool fill:#fce4ec,stroke:#e91e63
    style Reminders fill:#f3e5f5,stroke:#9c27b0
    style CreateUserMsg fill:#e0f7fa,stroke:#00838f
    style Title fill:#fff3e0,stroke:#ef6c00

    style L_EXIT fill:#ef5350,color:#fff
    style LN_EXIT fill:#ef5350,color:#fff
    style L_WAIT fill:#ffb74d
    style SH_BUSY fill:#ef5350,color:#fff
```

## 模块核心逻辑说明

| 组件 | 职责 |
|------|------|
| **`prompt()`** | 总入口：创建用户消息 → 启动主循环 |
| **`loop()`** | 核心状态机：每次迭代检测待处理任务（subtask / compaction / 溢出 / 正常LLM调用），直到模型完成或被取消 |
| **`createUserMessage()`** | 将输入 parts（文件/agent/@引用/MCP资源）展开为具体的消息内容并持久化 |
| **`resolveTools()`** | 聚合 ToolRegistry + MCP 工具，统一包装权限检查和 Plugin 钩子 |
| **`insertReminders()`** | 根据 agent 类型（plan/build）和实验标志注入系统提示 |
| **`shell()`** | 独立的 shell 命令执行流，绕过 LLM 直接 spawn 进程 |
| **`command()`** | 斜杠命令处理：模板替换 → 参数解析 → 决定是否作为 subtask → 调用 `prompt()` |
| **`ensureTitle()`** | 首次对话时异步调用小模型生成会话标题 |

### 主循环（`loop`）的状态转移逻辑：

```
┌─────────────────────────────────────────────────────────┐
│                    while(true)                          │
│                                                         │
│  ① aborted? ──────────────────────────→ EXIT            │
│  ② 无 lastUser? ──────────────────────→ ERROR           │
│  ③ assistant 已完成(非tool-calls)? ───→ EXIT            │
│  ④ 有 pending subtask? ──→ 执行 TaskTool ──→ CONTINUE  │
│  ⑤ 有 pending compaction? ──→ 压缩处理 ──→ CONTINUE    │
│  ⑥ 上下文溢出? ──→ 创建 compaction ──→ CONTINUE        │
│  ⑦ 正常处理:                                           │
│     - 构建工具集 + system prompt                        │
│     - 调用 LLM (processor.process)                      │
│     - structured output 捕获? ──→ EXIT                  │
│     - model 完成? ──→ EXIT                              │
│     - result=stop? ──→ EXIT                             │
│     - result=compact? ──→ 创建 compaction ──→ CONTINUE  │
│     - 否则 ──→ CONTINUE                                 │
└─────────────────────────────────────────────────────────┘
```




# Subtask 设计解析

根据代码结构和流程图，**subtask** 是一种 **层级化任务委派机制**，允许主 LLM 会话将工作拆分并委派给子会话执行。以下是详细分析：

---

## 核心目的

### 1. 上下文隔离

主会话的 context window 是有限的。如果所有工作都在同一个会话中完成，上下文很快会被撑满。Subtask 将子任务放到**独立的子 Session** 中运行，避免污染主会话的上下文。

### 2. 分而治之（Divide & Conquer）

对于复杂任务（如"重构整个模块"），LLM 可以通过 `TaskTool` 将其拆解为多个子任务：

```
主会话: "重构 auth 模块"
  ├── subtask 1: "分析当前 auth 模块的依赖关系"
  ├── subtask 2: "重写 token 验证逻辑"
  └── subtask 3: "更新相关的单元测试"
```

每个 subtask 拥有独立的会话生命周期，完成后将**摘要/结果**回传给主会话。

### 3. Agent 专业化

从代码中可以看到 `agent` part 类型会生成提示：

```
"Use task tool with subagent: X"
```

这意味着不同的 subtask 可以指定**不同的 Agent**（可能配置了不同的 system prompt、工具集、甚至不同的模型），让专业的 agent 处理专业的事情。

---

## 在代码中的位置

| 组件 | 作用 |
|---|---|
| `TaskTool` (`@/tool/task`) | LLM 可调用的工具，用于创建和执行 subtask |
| `subtask` part type | 消息中的一种 part 类型，表示对子任务的引用/结果 |
| `agent` part type | 用户附加的 agent 指令，触发 subtask 委派 |
| `SessionSummary` | 子任务完成后生成摘要，回传给父会话 |
| `SessionProcessor` | 管理会话的执行流程，包括子任务的调度 |

---

## 数据流

```mermaid
sequenceDiagram
    participant Parent as 父会话 (Main Session)
    participant TaskTool as TaskTool
    participant Child as 子会话 (Subtask Session)

    Parent->>Parent: LLM 判断需要委派子任务
    Parent->>TaskTool: 调用 task tool (描述 + agent)
    TaskTool->>Child: 创建新 Session，注入 prompt
    Child->>Child: 独立运行 LLM loop（有自己的工具/上下文）
    Child->>Child: 完成任务，生成 Summary
    Child-->>TaskTool: 返回结果/摘要
    TaskTool-->>Parent: 将 subtask part 写入父会话消息
    Parent->>Parent: LLM 根据 subtask 结果继续推理
```

---

## 与 `SessionCompaction` 的协作

注意代码中还引入了 `SessionCompaction`（上下文压缩）。Subtask 和 Compaction 是互补的两种策略：

- **Subtask**：事前隔离 —— 把可能占用大量上下文的工作提前分离出去
- **Compaction**：事后压缩 —— 对已经过长的上下文进行摘要压缩

两者共同确保会话不会因为 context window 溢出而降低质量。

---

## 类比

如果你熟悉操作系统的概念，这本质上就是 **进程 fork** 的思路：
- 父进程（父会话）fork 出子进程（子会话）
- 子进程有独立的地址空间（上下文）
- 子进程完成后通过 IPC（subtask part / summary）将结果传回父进程

这种设计在 Claude Code、Cursor 等 AI 编程工具中越来越常见，通常被称为 **sub-agent** 或 **orchestrator pattern**。