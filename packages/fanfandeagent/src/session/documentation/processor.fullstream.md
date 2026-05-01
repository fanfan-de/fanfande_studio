# `processor.ts` 中 `fullStream` 的 `value.type` 说明

`packages/fanfandeagent/src/session/processor.ts` 里通过下面这段代码消费模型流式输出：

```ts
for await (const value of stream.fullStream) {
  switch (value.type) {
    // ...
  }
}
```

这里的 `value` 可以理解为“流中的一个事件对象”，`value.type` 表示当前事件的类别。`processor.ts` 的职责不是直接把这些事件原样透传出去，而是把它们整理成系统内部的 `Message.Part`、工具调用状态和运行时事件。

本文按当前代码中的 `switch` 分支，解释每一种 `value.type` 的含义和处理方式。

## 1. 文本输出相关

| `value.type` | 含义 | 关键字段 | 当前处理方式 |
| --- | --- | --- | --- |
| `text-start` | 模型开始输出一段普通文本。 | `providerMetadata` | 创建一个新的 `Message.TextPart`，初始化为空字符串，记录开始时间，并发出 `text.part.started` 事件。 |
| `text-delta` | 普通文本的增量片段。通常会连续到达多次。 | `text`、`providerMetadata` | 把增量文本追加到当前 `TextPart.text`；更新 metadata；发出 `text.part.delta`；按节流策略做持久化。 |
| `text-end` | 当前这段普通文本结束。 | `providerMetadata` | 对文本做 `trimEnd()`，补写结束时间，发出 `text.part.completed`，强制持久化，并清理当前文本状态。 |

这三个事件一起组成一段完整的 assistant 文本输出生命周期。

## 2. 推理内容相关

| `value.type` | 含义 | 关键字段 | 当前处理方式 |
| --- | --- | --- | --- |
| `reasoning-start` | 模型开始输出一段 reasoning 内容。某些模型可能会并行产生多条 reasoning 链。 | `id`、`providerMetadata` | 以 `value.id` 为键在 `reasoningMap` 中创建新的 `Message.ReasoningPart`，记录开始时间，并发出 `reasoning.part.started`。 |
| `reasoning-delta` | reasoning 的增量片段。 | `id`、`text`、`providerMetadata` | 通过 `value.id` 找到对应的 reasoning part，追加文本、更新 metadata、发出 `reasoning.part.delta`，并按节流策略持久化。 |
| `reasoning-end` | 某条 reasoning 链结束。 | `id`、`providerMetadata` | 找到对应 reasoning part，执行 `trimEnd()`，补写结束时间，发出 `reasoning.part.completed`，强制持久化，然后从内存中删除。 |

这里用 `reasoningMap` 而不是单个变量，是因为不同模型可能同时给出多段推理内容，不能简单假设 reasoning 只有一条。

## 3. 工具输入与工具调用相关

### 3.1 工具输入阶段

| `value.type` | 含义 | 关键字段 | 当前处理方式 |
| --- | --- | --- | --- |
| `tool-input-start` | 模型开始描述一次工具调用的输入。 | `id`、`toolName`、`providerMetadata` | 创建一个 `pending` 状态的 `Message.ToolPart`，保存到 `toolcalls[value.id]`。这一阶段只维护内存，不立刻落盘。 |
| `tool-input-delta` | 工具输入的原始增量。 | `id`、`delta` | 如果该工具调用仍是 `pending`，就把原始增量追加到 `state.raw`。这通常用于保留模型流式拼接参数时的原始输入文本。 |
| `tool-input-end` | 工具输入阶段结束。 | 无特殊字段 | 当前代码没有额外处理，直接忽略。 |

这一阶段更像“模型正在组织工具参数”，还不代表工具已经真正执行。

### 3.2 工具真正执行阶段

| `value.type` | 含义 | 关键字段 | 当前处理方式 |
| --- | --- | --- | --- |
| `tool-call` | 工具调用已确认，进入执行阶段。 | `toolCallId`、`toolName`、`input`、`title`、`providerMetadata`、`providerExecuted` | 把对应 `ToolPart` 状态切到 `running`，记录输入、标题、开始时间，并持久化；同时发出 `tool.call.started`。 |
| `tool-result` | 工具执行成功返回结果。 | `toolCallId`、`input`、`output` 或 `result`、`title`、`providerMetadata`、`providerExecuted` | 调用 `extractToolResultState()` 规范化输出，状态改为 `completed`，写入输出文本、原始模型输出、metadata、附件、结束时间，并持久化；同时发出 `tool.call.completed`。 |
| `tool-error` | 工具执行失败。 | `toolCallId`、`input`、`error`、`providerMetadata`、`providerExecuted` | 把状态改为 `error`，通过 `normalizeToolError()` 规范化错误文本，写入结束时间并持久化；同时发出 `tool.call.failed`。 |
| `tool-output-denied` | 工具输出被拒绝或被拦截。 | `toolCallId` | 如果当前工具是 `running` 或 `waiting-approval`，则把状态转成 `denied`，记录拒绝原因 `"Tool execution was denied."`，写入结束时间并持久化；同时发出 `tool.call.denied`。 |
| `tool-approval-request` | 工具执行前需要用户审批。 | `approvalId`、`toolCall` 或 `toolCallId` | 把工具状态切到 `waiting-approval`，写入审批 ID、开始时间并持久化；随后调用 `Permission.registerApprovalRequest(...)` 注册审批请求，并把 `blocked` 设为 `true`。 |

可以把这部分理解为一个状态机：

`pending -> running -> completed/error/denied`

或者：

`pending/running -> waiting-approval -> denied`

## 4. 资源与文件相关

| `value.type` | 含义 | 当前处理方式 |
| --- | --- | --- |
| `source` | 流中带有来源信息或引用来源。 | 当前没有处理，直接忽略。 |
| `file` | 流中带有文件类型的内容。 | 当前没有处理，直接忽略。 |

注意：`tool-result` 中的附件并不是通过这里落盘的，而是通过 `extractToolResultState()` 从工具返回结果里的 `attachments` 字段解析出来，再转成内部 `FilePart`。

## 5. 流控制与生命周期相关

| `value.type` | 含义 | 关键字段 | 当前处理方式 |
| --- | --- | --- | --- |
| `start` | 整个流开始。 | 无 | 当前没有实际逻辑，注释里提到未来可能设置 session busy 状态。 |
| `start-step` | 一个 step 开始。多步生成或工具循环时可见。 | 无 | 当前忽略。 |
| `finish-step` | 一个 step 结束。 | `finishReason` | 当前把 `this.message.finishReason` 更新为 `value.finishReason`。代码注释认为它表示一次 LLM step/loop 结束。 |
| `finish` | 整个流完成。 | `finishReason`、`usage` | 当前同样把 `this.message.finishReason` 更新为 `value.finishReason`。注释里预留了记录 token 用量、计费信息、完成事件等扩展点。 |
| `abort` | 流被中断。 | 无 | 当前没有额外处理。 |
| `raw` | 底层原始块事件。 | 无 | 当前忽略。 |
| `error` | 流过程中发生错误。 | `error` | 当前只写日志 `log.error("stream error", { error: value.error })`，不在这里直接更新消息结构。 |

## 6. 默认分支

| `value.type` | 含义 | 当前处理方式 |
| --- | --- | --- |
| 其他未知类型 | 当前代码没有显式支持的新事件类型。 | 进入 `default` 分支，写一条 warning 日志：`Unknown stream value type: ...`。 |

这意味着如果底层 SDK 将来新增了新的 `fullStream` 事件类型，系统不会立刻崩掉，但也不会自动支持，需要补充 `switch` 分支。

## 7. 这段代码如何收尾

即使 `for await ... of stream.fullStream` 结束了，`processor.ts` 还会做几件事：

1. 如果 `currentText` 还没刷盘，会执行一次 `flush(currentText)`。
2. 如果还有残留的 reasoning part，也会逐个 `flush`。
3. 如果仍有 `pending` 或 `running` 的工具调用没有完成，会统一标记成失败，错误原因是：

```txt
Tool call did not complete before the model response finished.
```

4. 如果在审批阶段被阻塞，返回值是 `"stop"`。
5. 如果需要压缩上下文，返回值是 `"compact"`。
6. 正常结束则返回 `"continue"`。

## 8. 总结

从 `processor.ts` 的视角看，`fullStream` 里的事件大致可以分成四类：

| 类别 | 包含的 `value.type` |
| --- | --- |
| 文本类 | `text-start`、`text-delta`、`text-end` |
| 推理类 | `reasoning-start`、`reasoning-delta`、`reasoning-end` |
| 工具类 | `tool-input-start`、`tool-input-delta`、`tool-input-end`、`tool-call`、`tool-result`、`tool-error`、`tool-output-denied`、`tool-approval-request` |
| 生命周期/控制类 | `start`、`start-step`、`finish-step`、`finish`、`abort`、`raw`、`error`、`source`、`file` |

如果后面要继续维护这段代码，最重要的理解是：

`processor.ts` 不是在“消费一段文本”，而是在“消费一连串事件”，再把这些事件映射成系统内部可以保存、展示、审批和追踪的状态。
