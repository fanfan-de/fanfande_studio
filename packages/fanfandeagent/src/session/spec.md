# Session Flow Spec

本文档描述 `packages/fanfandeagent/src/session` 当前代码里已经接通的 Agent 编排流程。这里写的是实际执行路径，不是理想架构。

## 1. 模块目标

`session` 模块的职责，是把一次用户输入转成一轮可以落库、可以回放、可以继续推进的 Agent 交互。当前已经接通的核心能力有四块。

第一块是持久化。`session.ts` 负责 `sessions`、`messages`、`parts` 三张表的初始化和基础读写。

第二  块是消息建模。`message.ts` 定义 `User`、`Assistant` 以及 `TextPart`、`ReasoningPart`、`ToolPart` 等 part 类型，并负责把历史消息转成 AI SDK 需要的 `ModelMessage[]`。

第三块是主编排。`prompt.ts` 负责接收一次新的 prompt 输入、创建 user message、进入 loop，并在 loop 里驱动模型与工具。

第四块是流式落库。`processor.ts` 负责消费 `llm.ts` 返回的 `fullStream`，把文本、reasoning、tool 状态实时写回数据库。

## 2. 目录分工

### 2.1 `session.ts`

这个文件是 session 层的持久化入口。它定义 `SessionInfo`，确保三张表存在，并提供 `DataBaseCreate`、`DataBaseRead`、`updateMessage`、`updatePart` 等基础方法。`createSession()` 只负责创建会话容器，不负责启动一次 prompt。

### 2.2 `message.ts`

这个文件定义消息结构。当前 message 只有两种角色：`user` 和 `assistant`。真正的内容不直接挂在 message 上，而是拆到 part 表里。当前主链路实际会用到的 part 主要有 `text`、`reasoning`、`tool`、`file`、`subtask`、`compaction`。

另外，`toModelMessages()` 也是这个文件里的关键函数。它会把数据库里的 `WithParts[]` 转成模型侧历史上下文。如果 assistant 历史中已经有完成态或失败态的 `tool part`，它会被展开成一条 assistant 的 `tool-call` 和一条 tool 的 `tool-result`，这样下一轮模型才能看到工具结果。

### 2.3 `prompt.ts`

这是当前编排入口。`prompt(input)` 先写入用户消息，再调用 `loop({ sessionID })`。`loop()` 不依赖某个长期驻留的内存上下文，而是每轮都从数据库重新构建历史。

### 2.4 `resolve-tools.ts`

这个文件负责把工具注册表包装成 AI SDK 的 `ToolSet`。它会调用 `ToolRegistry.tools()` 取出全部工具，然后为每个工具注入本轮运行所需上下文，包括 `sessionID`、`messageID`、`cwd`、`worktree`、`abort` 和 `toolCallID`。

### 2.5 `llm.ts`

这个文件用 AI SDK 的 `streamText()` 发起模型请求。它负责绑定 provider model、挂载工具集、附上历史消息，并把流式结果交给上层处理。

### 2.6 `processor.ts`

这个文件是流式事件处理器。它把 `text-start`、`text-delta`、`tool-call`、`tool-result` 这类流事件映射成数据库里的 part 更新。

### 2.7 `status.ts`

这个文件维护 session 的运行态。当前状态模型只有 `idle`、`busy`、`retry` 三种。主循环里会设置 `busy`，但退出后目前没有显式恢复为 `idle`。

## 3. 核心数据模型

### 3.1 Session

`SessionInfo` 表示一个会话容器，包含 `id`、`projectID`、`directory`、`title`、`version`、`time`，以及可选的 `summary`、`share`、`revert`。

### 3.2 Message

`User` 记录本次输入使用的 `agent`、`model`、可选 `system` 和其他控制字段。`Assistant` 记录本轮回复使用的模型、运行路径、token/cost 占位字段和 `finishReason`。

### 3.3 Part

当前编排主链路里最重要的是 `ToolPart.state` 这个小状态机。它有四种状态：`pending`、`running`、`completed`、`error`。processor 的很多逻辑，实际上就是在推动这个状态机前进。

## 4. 一次 prompt 的主流程

### 4.1 总时序

```mermaid
sequenceDiagram
    participant Caller
    participant Prompt as prompt.ts
    participant DB as SQLite
    participant Loop as loop()
    participant Tools as resolve-tools.ts
    participant LLM as llm.ts
    participant Processor as processor.ts

    Caller->>Prompt: prompt(input)
    Prompt->>DB: createUserMessage()
    Prompt->>Loop: loop({ sessionID })
    Loop->>DB: load messages + parts
    Loop->>Tools: resolveTools(...)
    Loop->>Processor: create(assistantMessage)
    Processor->>LLM: stream(streamInput)
    LLM-->>Processor: fullStream events
    Processor->>DB: updatePart(...)
    Processor-->>Loop: continue / stop / compact
    Loop->>DB: insert assistant message
    alt finishReason is final
        Loop-->>Prompt: return assistant with parts
    else continue
        Loop->>DB: rebuild history and run next turn
    end
```

### 4.2 `prompt(input)` 的动作

`prompt()` 当前做的事情很简单。第一步，调用 `createUserMessage(input)`。第二步，进入 `loop({ sessionID })`。这意味着当前“写入用户消息”和“驱动 assistant”是同一个入口完成的。

要注意两个事实。第一，`prompt()` 会读取一次 session，但目前没有对“session 不存在”做显式失败处理。第二，`noReply` 虽然已经出现在输入 schema 中，但当前还没有接入真实分支。

## 5. `createUserMessage(input)` 的真实行为

这个函数把一次输入转换成一条 `user message` 和若干 `parts`。

当前规则如下。

1. `messageinfo.id` 用 `Identifier.ascending("message")` 生成。

2. `agent` 默认值是 `"plan"`。

3. `model` 默认值来自 `Provider.getDefaultModelRef()`。

4. `input.system` 会挂到 user message 上，但后面是否真的进入最终模型 prompt，要看 `llm.ts` 的实现。

5. `input.parts` 当前支持 `text`、`file`、`agent`、`subtask` 四类输入 part。

落库顺序也很关键。它先写 `messages`，再逐个写 `parts`。因此在进入 `loop()` 之前，这轮用户输入已经完整存在于数据库里。

## 6. `loop()` 的真实执行逻辑

### 6.1 启动运行态

`loop()` 开头会调用 `start(sessionID)`。如果当前 session 还没有运行态，就创建一个 `AbortController` 并放进 `Instance.state()`。如果已经有同一个 `sessionID` 在跑，则 `start()` 返回 `undefined`。

这里有一个当前实现上的空洞：并发启动失败后，loop 没有真正中断。`resume_existing` 这个字段也已经在输入 schema 里了，但现在没有参与任何控制逻辑。

### 6.2 每轮循环都从数据库重建历史

`while (true)` 每次迭代都会做同一套准备动作。先检查 `abort`，再把状态设成 `busy`，然后从数据库把当前 session 的所有 `messages` 和所有 `parts` 重新读出来，再按 `messageID` 回挂成 `WithParts[]`。

这是当前实现最重要的事实之一：历史上下文的权威来源是 SQLite，不是内存里的会话对象。也因此，上一轮工具执行完成后，下一轮只要重新读库，就能自然拿到完整上下文。

### 6.3 历史扫描

拿到 `msgs` 之后，loop 会从尾到头反向扫描，抽出四类信息。

第一，`lastUser`，也就是最近一条 user message。

第二，`lastAssistant`，也就是最近一条 assistant message。

第三，`lastFinished`，也就是最近一条已经带 `finishReason` 的 assistant message。

第四，`tasks`，也就是最近完成 assistant 之前出现过的 `compaction` 和 `subtask` part。

注意，`tasks` 现在只会被收集，不会被执行。

### 6.4 提前退出条件

如果最近 assistant 已经有 `finishReason`，而且这个 `finishReason` 不是 `tool-calls`、也不是 `unknown`，并且最近 user message 的 id 早于最近 assistant message 的 id，那么 loop 会直接退出，不再发起新的模型调用。

这代表的语义是：当前最新一轮用户输入，已经有最终 assistant 回复了。

### 6.5 构造 assistant message

一旦决定要真正调用模型，loop 会先在内存里构造一条新的 `assistantMessage`。它会写入新的 `message id`、`modelID`、`providerID`、`agent`、`cwd`、`worktree`，并把 `cost` 和 `tokens` 初始化成 0。

这里有一个非常关键的实现细节：assistant message 本身在流式开始时还没有写入 `messages` 表，但它对应的 `parts` 会在 processor 里提前开始写库。等 `processor.process()` 返回之后，loop 才执行 `Session.DataBaseCreate("messages", assistantMessage)`。

## 7. 当前工具解析策略

### 7.1 `resolveTools()`

本轮工具集由 `resolveTools()` 生成。它会把工具注册表里的每一个工具包装成 AI SDK 的 `tool({...})`，并把运行时上下文注入进去。

当前实现里，还有一个必须明确的事实：工具解析不是严格跟随 `lastUser.agent` 做动态切换，而是直接使用 `Agent.planAgent`。也就是说，assistant message 自己记录的 `agent` 与真正参与工具初始化和模型调用的 agent，目前并不完全一致。

### 7.2 工具执行时拿到的上下文

当前每个工具执行时都能拿到这些字段：`sessionID`、`messageID`、`cwd`、`worktree`、`abort`、`toolCallID`。工具返回值会先经过 `Tool.normalizeToolOutput()` 标准化，再交给模型输出层和 processor 使用。

## 8. 历史消息如何送给模型

`message.ts` 里的 `toModelMessages()` 会把历史 `WithParts[]` 转成 `ModelMessage[]`。

当前规则是这样的。

1. 普通 `text part` 会变成模型侧的 `text`。

2. `reasoning part` 只有在当前模型支持 reasoning 能力时才会被带上。

3. `file` 和 `image` 只有在当前模型支持 attachment 时才会被带上。

4. `tool part` 如果状态还是 `pending` 或 `running`，不会发给模型。

5. `tool part` 如果已经是 `completed` 或 `error`，会被展开成两条消息：一条 assistant 的 `tool-call`，一条 tool 的 `tool-result`。

最后这一条很关键。它决定了“工具调用完后为什么下一轮模型能看到结果”。

## 9. `llm.ts` 的真实调用方式

### 9.1 `streamText()` 参数

`llm.ts` 当前使用 AI SDK 的 `streamText()`。实际传入的关键参数包括 `abortSignal`、`timeout.totalMs = 60000`、`timeout.stepMs = 10000`、`maxRetries = input.retries ?? 0`、`output = Output.text()`、`temperature = 1` 以及本轮 `tools`。

### 9.2 当前真正生效的 system prompt

这里必须单独说明，因为代码看上去像有两套 system 逻辑。

一方面，`llm.ts` 前面确实组装了 `input.system` 和 `input.user.system`。另一方面，真正传给 `streamText()` 的 `prompt` 数组里，system 仍然是固定值：

```ts
{ role: "system", content: "you are a helpful assistant" }
```

所以当前实际行为不是“loop 传什么 system 就发什么 system”，而是“最终发给模型的 system 仍然是固定英文串”。`loop()` 里传进去的 `system: ["你是一个助手"]` 现在没有真正进入最终 prompt，user message 上的 `system` 也是一样。

## 10. `processor` 如何把流式事件落库

`processor.create({ Assistant })` 返回的对象里，真正重要的是 `process(streamInput)`。它内部先调 `LLM.stream()`，然后遍历 `stream.fullStream`。

### 10.1 文本事件

遇到 `text-start` 时，会创建一个新的 `TextPart`，初始化空文本和 `time.start`。

遇到 `text-delta` 时，会把增量追加到 `currentText.text`，并且每次增量都会执行一次 `Session.updatePart(currentText)`。

遇到 `text-end` 时，会做 `trimEnd()`，写入 `time.end`，再更新一次数据库。

这意味着 assistant 文本是流式落库的，不是等整段输出结束后再一次性写入。

### 10.2 reasoning 事件

遇到 `reasoning-start` 时，会根据 provider 下发的 `value.id` 在 `reasoningMap` 里建一个临时槽位。

遇到 `reasoning-delta` 时，会持续把文本追加到对应 reasoning part，并持续写库。

遇到 `reasoning-end` 时，会做 `trimEnd()`、补上 `time.end`、写回数据库，再把这个 id 从 `reasoningMap` 里删掉。

### 10.3 工具输入事件

遇到 `tool-input-start` 时，会创建一个 `ToolPart`。这个 part 初始状态是 `pending`，里面只有空的 `input` 和空的 `raw`，然后立刻写库。

遇到 `tool-input-delta` 时，如果这个 tool part 还处在 `pending`，就把输入增量拼到 `state.raw`。这块现在主要是为了保留原始工具输入流。

### 10.4 工具执行事件

遇到 `tool-call` 时，processor 会把对应的 `ToolPart` 从 `pending` 推到 `running`。这一步会写入结构化 `input`、可选 `title`、可选 `metadata` 和 `time.start`。

遇到 `tool-result` 时，processor 会把这个 tool part 推到 `completed`。它会调用 `extractToolResultState()` 标准化输出，优先取 `output.text`、`output.title`、`output.metadata`。如果工具返回了 `attachments`，也会被映射成 `FilePart[]` 并挂到 `ToolStateCompleted.attachments`。

这里还要再强调一个事实：attachments 目前只是内嵌保存在 tool state 里，processor 并不会把这些附件再单独插入 `parts` 表。

遇到 `tool-error` 时，processor 会把状态改成 `error`，并把错误统一转成字符串后写入数据库。

### 10.5 结束事件

遇到 `finish` 或 `finish-step` 时，processor 会把 `assistantMessage.finishReason` 写到内存里的 assistant message 上。随后 loop 会用这个字段判断这一轮是否已经真正完成。

当前还没有接通的部分也需要明确写出来。现在没有把 `usage`、`tokens`、`cost` 真实回填到 assistant message，也没有把 `completed` 时间写回 message，更没有把 stream 级错误明确写入 `assistant.error`。

## 11. loop 为什么会继续下一轮

`processor.process()` 的返回值设计成了三类：`"continue"`、`"stop"`、`"compact"`。

但按当前代码，`needsCompaction` 默认一直是 `false`，`blocked` 默认一直是 `false`，`input.Assistant.error` 也几乎不会被填上，所以 processor 绝大多数情况下都会返回 `"continue"`。

之后 loop 再看 `processor.message.finishReason`。

如果 `finishReason` 存在，并且它不是 `tool-calls` 或 `unknown`，那么 loop 结束。

如果 `result === "stop"`，loop 结束。

否则 loop 继续，再次从数据库读取历史，再走一轮模型调用。

这就是当前多轮工具调用链路的真实机制：第一轮模型产出 tool call，processor 把工具状态写成完成态，第二轮 loop 重新读库，`toModelMessages()` 把工具结果转成 `tool-call + tool-result`，然后模型基于这些结果继续推理。

## 12. 取消与运行态

`prompt.ts` 用 `Instance.state()` 维护一个运行表。key 是 `sessionID`，value 里有 `AbortController` 和一个 callbacks 数组。当前 callbacks 还没有真正接通。

`cancel(sessionID)` 的行为是直接 `abort.abort()`，然后把这个 session 从运行表里删掉。

loop 每轮开始前只做一次：

```ts
if (abort?.aborted) throw new Error("Prompt aborted")
```

因此当前取消机制是“轮询式生效”，不是在任意流事件位置即时中断。

## 13. 当前代码里的几个关键事实

为了避免以后读代码时产生误判，当前实现有六个必须记住的事实。

1. 历史上下文的权威来源是 SQLite，不是长驻内存状态。

2. assistant 的 parts 会在流式过程中实时写入，但 assistant message 本身要到 `process()` 返回后才插入。

3. 当前真正参与工具初始化和模型调用的是 `Agent.planAgent`，不是严格跟随 `lastUser.agent`。

4. 当前真正发给模型的 system prompt 是固定英文字符串，不是 loop 传入的 system 数组。

5. `subtask` 和 `compaction` 目前只存在于 schema、扫描和占位逻辑里，还没有进入真实执行分支。

6. session status 目前只会被设置成 `busy`，退出后没有显式写回 `idle`。

## 14. 当前未完全接通的能力

下面这些字段或分支已经在代码里出现，但还不是完整实现。

1. `noReply`。

2. `resume_existing`。

3. `variant`。

4. 真正的 compaction 执行。

5. 真正的 subtask 调度。

6. 完整的 usage、cost、retry、error 持久化。

7. assistant 完结时间与错误态的完整落库。

## 15. 文档维护原则

后续如果继续演进这个模块，建议每次都用同一套方式更新这份文档：先写“真实新增了什么执行分支”，再写“哪些字段从占位变成了真的持久化”，最后写“哪些东西仍然只是 schema 已有但 loop 未接通”。

这样 `spec.md` 才会一直保持成“当前实现说明书”，而不是再次漂移成理想设计稿。
