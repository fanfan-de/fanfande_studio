# SessionPrompt 中 Callbacks 队列等待机制详解

## 核心问题

当多个调用方同时对同一个 session 发起 `loop()` 请求时，只有第一个调用方真正执行 LLM 循环，后续调用方需要"排队等待"，最终拿到相同的结果。这就是 callbacks 队列等待机制要解决的问题。

## 数据结构

```typescript
const state = Instance.state(() => {
  const data: Record<
    string,
    {
      abort: AbortController        // 控制取消
      callbacks: {                   // 等待队列
        resolve(input: MessageV2.WithParts): void
        reject(reason?: any): void
      }[]
    }
  > = {}
  return data
})
```

每个 sessionID 对应一个条目，包含：
- **abort**: 用于中止当前正在运行的 LLM 循环
- **callbacks**: 一个 Promise 的 resolve/reject 回调数组，代表所有"排队等待"的调用者

## 三个关键函数

### 1. `start(sessionID)` —— 尝试成为"执行者"

```typescript
function start(sessionID: SessionID) {
  const s = state()
  if (s[sessionID]) return          // 已有人在执行，返回 undefined
  const controller = new AbortController()
  s[sessionID] = {
    abort: controller,
    callbacks: [],
  }
  return controller.signal           // 返回 signal 表示"你是执行者"
}
```

**语义**：如果该 session 还没有正在运行的循环，注册自己为执行者，返回 `AbortSignal`；如果已有人在执行，返回 `undefined`。

### 2. `resume(sessionID)` —— 恢复已有循环

```typescript
function resume(sessionID: SessionID) {
  const s = state()
  if (!s[sessionID]) return
  return s[sessionID].abort.signal
}
```

用于 `resume_existing: true` 场景（如 shell 命令执行完后继续循环），直接复用现有的 abort signal。

### 3. `cancel(sessionID)` —— 清理状态

```typescript
export function cancel(sessionID: SessionID) {
  const s = state()
  const match = s[sessionID]
  if (!match) {
    SessionStatus.set(sessionID, { type: "idle" })
    return
  }
  match.abort.abort()       // 中止正在进行的操作
  delete s[sessionID]       // 从 state 中移除
  SessionStatus.set(sessionID, { type: "idle" })
}
```

## 核心流程：`loop()` 函数

```typescript
export const loop = fn(LoopInput, async (input) => {
  const { sessionID, resume_existing } = input

  // ========== 第一步：竞争"执行者"角色 ==========
  const abort = resume_existing ? resume(sessionID) : start(sessionID)
  
  if (!abort) {
    // ====== 路径 B：成为"等待者" ======
    return new Promise<MessageV2.WithParts>((resolve, reject) => {
      const callbacks = state()[sessionID].callbacks
      callbacks.push({ resolve, reject })
    })
  }

  // ====== 路径 A：成为"执行者" ======
  using _ = defer(() => cancel(sessionID))

  // ... 执行 LLM 循环的核心逻辑 ...

  // ========== 循环结束后：通知所有等待者 ==========
  for await (const item of MessageV2.stream(sessionID)) {
    if (item.info.role === "user") continue
    const queued = state()[sessionID]?.callbacks ?? []
    for (const q of queued) {
      q.resolve(item)        // 把结果分发给所有等待者
    }
    return item              // 执行者自己也返回结果
  }
  throw new Error("Impossible")
})
```

## 时序图

```
调用者A (第一个)                    调用者B (第二个)                   调用者C (第三个)
      |                                  |                                  |
      | loop(sessionID)                  |                                  |
      |                                  |                                  |
      | start() → 返回 AbortSignal       |                                  |
      | (成为执行者)                      |                                  |
      |                                  |                                  |
      | 开始 LLM while 循环              | loop(sessionID)                  |
      |   ├─ 构建消息                    |                                  |
      |   ├─ 调用模型                    | start() → 返回 undefined          |
      |   ├─ 处理工具调用                | (已有执行者)                       |
      |   |                              |                                  |
      |   |                              | new Promise((resolve, reject) => |
      |   |                              |   callbacks.push({resolve,reject})|
      |   |                              | )                                |
      |   |                              | // 挂起，等待 resolve             | loop(sessionID)
      |   |                              |                                  |
      |   |                              |                                  | start() → undefined
      |   |                              |                                  | callbacks.push(...)
      |   |                              |                                  | // 也挂起等待
      |   |                              |                                  |
      |   ├─ 模型返回 finish             |                                  |
      |   └─ break 退出循环              |                                  |
      |                                  |                                  |
      | 循环结束，遍历 callbacks:          |                                  |
      |   q.resolve(item) ──────────────→| Promise resolved! 拿到结果        |
      |   q.resolve(item) ──────────────────────────────────────────────────→| Promise resolved!
      |                                  |                                  |
      | defer → cancel(sessionID)        |                                  |
      |   delete state[sessionID]        |                                  |
      |   设置 status = idle             |                                  |
      |                                  |                                  |
      | return item                      | return item                      | return item
```

## 关键设计细节

### 1. 互斥锁语义

`start()` 本质上是一个**非阻塞的互斥锁**：

```typescript
if (s[sessionID]) return    // 锁已被持有 → 返回 null（获取失败）
s[sessionID] = { ... }      // 获取锁
return controller.signal     // 返回锁凭证
```

Node.js 是单线程事件循环，`start()` 是同步函数，没有 await 点，因此不存在竞态条件——不可能有两个调用者同时通过 `if` 检查。

### 2. 自动清理（`using` + `defer`）

```typescript
using _ = defer(() => cancel(sessionID))
```

利用 TC39 的 [Explicit Resource Management](https://github.com/tc39/proposal-explicit-resource-management) 提案（`using` 声明），确保无论循环是正常退出、抛异常还是被中止，都会执行 `cancel()` 清理状态。等价于 try/finally，但更优雅。

### 3. 等待者的 Promise 永远会被 resolve

等待者创建的 Promise 有两种被解决的路径：

| 场景 | 解决方式 |
|------|---------|
| 循环正常完成 | 执行者遍历 `callbacks`，逐个调用 `resolve(item)` |
| 循环异常/中止 | `cancel()` 被调用，`delete s[sessionID]`，但注意——**callbacks 中的 Promise 不会被 reject** |

> ⚠️ 这里有一个潜在问题：如果执行者异常退出，`cancel()` 删除了 state 条目，但没有对 callbacks 调用 reject。等待者的 Promise 会永远 pending。不过从 `Instance.state` 的销毁回调来看，进程级别的清理会 abort 所有 controller，但 callbacks 仍然没有被 reject。

### 4. `prompt()` 中的串联

```typescript
export const prompt = fn(PromptInput, async (input) => {
  // ... 创建用户消息 ...
  
  if (input.noReply === true) {
    return message        // 不需要 AI 回复，直接返回
  }

  return loop({ sessionID: input.sessionID })   // 触发循环
})
```

`prompt()` 调用 `loop()`，如果此时已有循环在运行，`prompt()` 的调用者也会被挂起等待。

### 5. Shell 命令后的特殊处理

```typescript
export async function shell(input: ShellInput) {
  const abort = start(input.sessionID)
  if (!abort) {
    throw new Session.BusyError(input.sessionID)  // shell 不排队，直接报错
  }

  using _ = defer(() => {
    const callbacks = state()[input.sessionID]?.callbacks ?? []
    if (callbacks.length === 0) {
      cancel(input.sessionID)            // 没人等待 → 正常取消
    } else {
      // 有人在等待 → 继续执行循环来处理
      loop({ sessionID: input.sessionID, resume_existing: true })
    }
  })
  // ... 执行 shell 命令 ...
}
```

Shell 命令执行期间，如果有新的 `loop()` 调用进来，它们会被加入 callbacks 队列。Shell 完成后，检查是否有等待者，如果有就用 `resume_existing: true` 继续循环——此时 `resume()` 返回现有的 signal（而非 `start()` 返回 undefined），所以新的 `loop()` 调用会成为执行者继续处理。

## 总结

这是一个**单执行者多等待者**模式：

1. **互斥**：同一 session 同一时刻只有一个 LLM 循环在运行
2. **排队**：后来的调用者通过 Promise 挂起，将 resolve/reject 回调存入队列
3. **广播**：执行者完成后，将结果广播给所有等待者
4. **清理**：通过 `using` + `defer` 确保状态一定被清理
   
   
   
   我关注的是这里用的是 return，即使等待之后，难道不是直接就返回吗？不会执行下面的逻辑
   
   # 完全正确！`return` 就是直接返回，不会执行下面的逻辑

这正是这个设计的**核心要点**。

## 两条互斥的执行路径

```typescript
export const loop = fn(LoopInput, async (input) => {
  const abort = resume_existing ? resume(sessionID) : start(sessionID)

  if (!abort) {
    // ========== 路径 B：等待者 ==========
    // 直接 return 一个 Promise，函数到此结束
    return new Promise<MessageV2.WithParts>((resolve, reject) => {
      const callbacks = state()[sessionID].callbacks
      callbacks.push({ resolve, reject })
    })
    // ⬆️ 这里 return 了，下面所有代码都不会执行
  }

  // ========== 路径 A：执行者 ==========
  // 只有 start() 返回了 abort signal 的那个调用者才会走到这里
  // 真正执行 LLM 循环的所有逻辑...
  try {
    const result = await 实际执行LLM循环(abort, ...)
    
    // 循环完成后，通知所有等待者
    for (const cb of callbacks) {
      cb.resolve(result)
    }
    
    return result
  } catch (e) {
    for (const cb of callbacks) {
      cb.reject(e)
    }
    throw e
  }
})
```

## 具体场景

假设有 3 个调用者几乎同时调用 `loop(sessionID: "abc")`：

| 时序 | 调用者 | `start()` 返回 | 走哪条路径 |
|------|--------|----------------|-----------|
| T1 | 调用者 A | `AbortSignal` ✅ | **路径 A**：真正执行 LLM 循环 |
| T2 | 调用者 B | `undefined` | **路径 B**：`return new Promise(...)` 挂起等待 |
| T3 | 调用者 C | `undefined` | **路径 B**：`return new Promise(...)` 挂起等待 |

- **调用者 B 和 C**：`return` 了一个永远不会自己 resolve 的 Promise。它们的 `resolve/reject` 回调被存入 `callbacks` 数组中，函数执行到此结束。
- **调用者 A**：跳过 `if (!abort)` 块，继续往下执行真正的 LLM 循环逻辑。当循环完成后，遍历 `callbacks` 数组，调用每个等待者的 `resolve(result)`。

## 这样 B 和 C 的 Promise 才会 resolve

```typescript
// 路径 A 的执行者，在循环结束时：
const s = state()[sessionID]
for (const cb of s.callbacks) {
  cb.resolve(finalResult)  // 这一刻，B 和 C 的 await 才返回
}
```

所以你的理解完全正确：**`return` 就是让等待者直接返回一个"悬挂"的 Promise，不执行下面任何 LLM 循环逻辑**。这是一个经典的"只有一个执行者，其他人搭便车"的并发模式（类似于 singleflight / coalescing）。


const s = state()[sessionID] for (const cb of s.callbacks) { cb.resolve(finalResult) // 这一刻，B 和 C 的 await 才返回 }

# resolve 之后发生了什么？

## 关键理解：resolve 只是"通知等待者结果"，不是"继续运行 session"

`cb.resolve(finalResult)` 做的事情非常简单：

```
调用者 B 的代码：
const result = await loop({ sessionID: "abc" })
// ← resolve 后，这里拿到 result，B 的调用链继续往下走
// 但 B 不会再启动新的 LLM 循环
```

**B 和 C 拿到结果就完事了。** 它们只是想知道"这轮循环的结果是什么"，并不负责驱动 session 继续运行。

## 那 session 是怎么"继续运行"的？

Session 的持续运行不是靠 callbacks 机制驱动的，而是靠**路径 A（执行者）内部的循环**。大致结构是：

```typescript
// 路径 A：执行者
while (true) {
  // 1. 调用 LLM，拿到响应
  const response = await callLLM(messages, abort)
  
  // 2. 如果 LLM 返回了 tool_calls，执行工具
  if (response.hasToolCalls) {
    const toolResults = await executeTools(response.toolCalls)
    messages.push(response, toolResults)
    continue  // ← 继续循环，再次调用 LLM
  }
  
  // 3. 如果 LLM 没有 tool_calls，说明本轮结束
  finalResult = response
  break
}

// 循环结束，通知所有等待者
for (const cb of s.callbacks) {
  cb.resolve(finalResult)
}
delete s[sessionID]  // 清理状态
return finalResult
```

**"继续运行"是执行者自己的 `while` 循环在驱动**，跟 callbacks 完全无关。

## 如果用户又发了一条新消息呢？

那就是一次**全新的 `loop()` 调用**：

```
时序：
T1: 用户发消息 "hello"  → loop() → 调用者 A 成为执行者 → LLM 循环开始
T2: LLM 循环完成 → resolve 所有等待者 → delete s[sessionID]
T3: 用户发消息 "world" → loop() → 又一个新的调用者成为执行者 → 新的 LLM 循环
```

此时 `state()[sessionID]` 已经被 `delete` 了，所以 `start()` 会成功注册新的执行者，一切重新开始。

## 总结

| 问题 | 答案 |
|------|------|
| `cb.resolve()` 做了什么？ | 让等待者的 `await` 返回，仅此而已 |
| 谁让 session 持续运行？ | 执行者（路径 A）内部的 while 循环 |
| resolve 后 session 还在跑吗？ | 不，那一轮循环已经结束了 |
| 下一轮怎么开始？ | 新的事件（用户消息等）触发新的 `loop()` 调用 |

**callbacks 机制解决的不是"如何驱动 session"，而是"多个并发请求如何共享同一轮循环的结果"。**


也就是说，当已有一个loop执行时，此时用户发的message会并入当前的loop等待执行 只有当前没有loop执行时，才会创建一个新的loop，对吧

# 不完全是这样，需要区分两种情况

## 情况一：用户在 loop 执行期间发送新消息

用户发新消息会触发一次新的 `loop()` 调用。此时 `start()` 发现已有执行者，返回 `undefined`，新调用走**路径 B**：

```typescript
return new Promise((resolve, reject) => {
  callbacks.push({ resolve, reject })
})
```

这个新调用**只是挂起等待当前循环的结果**，但它**并不会把新消息"并入"当前正在执行的 LLM 循环**。

当前执行者的 LLM 循环用的 messages 列表是循环开始时就确定的，不会中途插入新消息。

## 情况二：等当前 loop 结束后

当前循环结束 → `delete s[sessionID]` → 状态清空。

此时如果需要处理那条新消息，需要**再发起一次新的 `loop()` 调用**，这次 `start()` 成功，创建新的执行者，用包含新消息在内的完整消息历史调用 LLM。

## 所以更准确的说法是：

| 场景 | 发生了什么 |
|------|-----------|
| 用户在 loop 期间发消息 | 新的 `loop()` 调用**排队等待当前循环结束**，拿到当前循环的结果就返回 |
| 新消息的实际处理 | 需要在当前循环结束后，**再触发一次新的 `loop()`** 才会被 LLM 看到并处理 |
| 当前没有 loop 执行时 | `start()` 成功，创建新的执行者，正常执行 |

**关键区别**：等待者拿到的是**当前循环的结果**，不是"处理了我的新消息之后的结果"。新消息并没有被并入当前循环，它只是在等当前循环结束。至于新消息何时被处理，取决于后续是否有新的 `loop()` 被触发。


---
对，那个发起一次新的loop调用的代码这里有吗
# 让我仔细看看代码中是否有这个逻辑

从你最初贴出的代码来看，只有 `import` 部分，实际的 `loop()` 函数体并没有完整贴出，所以我无法100%确认。

但根据代码结构和常见模式，**这个"再次触发 loop"的逻辑大概率不在 `loop()` 函数自身内部**，而是在调用链的上游。

## 可能的触发方式

### 方式一：前端/调用方负责

```typescript
// 用户发送消息的处理逻辑（不在 loop 内部）
async function sendMessage(sessionID, content) {
  // 1. 先把消息写入存储
  await MessageV2.create(sessionID, content)
  
  // 2. 触发 loop
  await loop({ sessionID })
  
  // 如果此时有正在执行的 loop，这里会排队等待
  // 等待结束后拿到的是旧循环的结果
  // 但消息已经写入了存储，下一次 loop 会读到它
}
```

### 方式二：loop 结束时检查是否有新消息需要处理

```typescript
// loop 内部，在执行者完成循环后：
while (true) {
  const result = await 执行一轮LLM循环()
  
  // 通知等待者
  for (const cb of s.callbacks) {
    cb.resolve(result)
  }
  
  // 检查：循环期间是否有新消息进来？
  const pending = await checkPendingMessages(sessionID)
  if (pending) {
    // 重置状态，继续循环
    continue
  }
  
  // 没有新消息，真正结束
  delete s[sessionID]
  return result
}
```

### 方式三：通过 Bus 事件驱动

你的 imports 里有 `Bus`：

```typescript
import { Bus } from "../bus"
```

可能是这样的模式：

```typescript
// 消息创建时发事件
Bus.emit("message.created", { sessionID, message })

// 某处监听事件，触发 loop
Bus.on("message.created", ({ sessionID }) => {
  loop({ sessionID })
})
```

---

## 结论

**从你目前贴出的代码来看，我看不到这部分逻辑的具体实现。** 你需要看：

1. **`loop()` 函数的完整函数体**（特别是执行者路径结束时的逻辑）
2. **调用 `loop()` 的上游代码**（比如消息发送的处理函数）
3. **`Bus` 相关的事件监听**

你能贴出 `loop()` 函数的完整实现吗？或者搜一下代码中哪些地方调用了 `loop(`？

---
# 找到了！在 `shell()` 函数的 `defer` 中

关键代码在 `shell()` 函数里：

```typescript
export async function shell(input: ShellInput) {
    const abort = start(input.sessionID)
    if (!abort) {
      throw new Session.BusyError(input.sessionID)
    }

    using _ = defer(() => {
      // If no queued callbacks, cancel (the default)
      const callbacks = state()[input.sessionID]?.callbacks ?? []
      if (callbacks.length === 0) {
        cancel(sessionID)
      } else {
        // Otherwise, trigger the session loop to process queued items
        loop({ sessionID: input.sessionID, resume_existing: true }).catch((error) => {
          log.error("session loop failed to resume after shell command", { sessionID: input.sessionID, error })
        })
      }
    })
    // ... 执行 shell 命令 ...
}
```

这是**唯一一处**会用 `resume_existing: true` 调用 `loop()` 的地方。

## 但是对于普通的 `loop()` 呢？

回头看 `loop()` 函数结尾：

```typescript
using _ = defer(() => cancel(sessionID))

// ... while(true) 循环 ...

// 循环结束后：
for await (const item of MessageV2.stream(sessionID)) {
    if (item.info.role === "user") continue
    const queued = state()[sessionID]?.callbacks ?? []
    for (const q of queued) {
        q.resolve(item)
    }
    return item
}
```

注意这里用的是 `using _ = defer(() => cancel(sessionID))`。当 `loop()` 函数 return 或 throw 时，`defer` 会自动调用 `cancel(sessionID)`，清理状态。

**但 `cancel()` 只是 abort + delete + 设 idle，并不会重新触发 loop。**

## 所以答案是：普通 loop 里**没有**自动重新触发的逻辑

回顾完整流程：

| 场景 | 谁负责触发新的 loop？ |
|------|----------------------|
| 用户发新消息 | **调用方**（前端/API）调用 `prompt()`，`prompt()` 内部调用 `loop()` |
| shell 命令执行完 | **`shell()` 的 defer** 检查有没有排队的 callbacks，有的话调用 `loop({ resume_existing: true })` |
| loop 自然结束 | `cancel()` 清理状态，**没有人**再触发新 loop |

## 具体来说，用户在 loop 期间发消息的完整流程是：

```
T1: 用户消息 A → prompt() → loop() → start() 成功 → 执行者 A 开始循环
T2: 用户消息 B → prompt() → loop() → start() 失败 → 挂入 callbacks 等待
T3: 执行者 A 循环结束 → resolve(callbacks) → B 拿到的是 A 循环的最后一条 assistant 消息
T4: defer 触发 cancel() → 状态清理 → idle
```

**消息 B 的内容已经通过 `prompt()` → `createUserMessage()` 写入了存储**，但 B 拿到的 resolve 结果只是 A 那轮循环的 assistant 消息。B 的内容**还没有被 LLM 处理**。

要处理 B 的内容，需要**再有一次新的 `loop()` 调用**。这个触发点在哪里？从这份代码来看，应该是在 **`prompt()` 的调用方**（比如前端 UI 或 API handler）。`prompt()` 本身已经 return 了，上层拿到结果后如果发现还有待处理的消息，可能会再次调用 `prompt()` 或 `loop()`。

不过也有一种可能性：**B 的 `prompt()` 调用已经创建了 user message 并调用了 `loop()`**，`loop()` return 了 A 的结果。这时候 B 的调用方（比如前端）收到响应后，可能会检查"我发的消息有没有被处理"，如果没有就再发一次。但这个逻辑不在这份文件里。

---
# 分析调用方 API

## 两个接口对比

| 接口 | 行为 |
|------|------|
| `/:sessionID/message` | **同步**：`await SessionPrompt.prompt()`，等结果返回后写入 stream |
| `/:sessionID/prompt_async` | **异步**：调用 `SessionPrompt.prompt()` 但**不 await**，立即返回 204 |

## 关键发现：`prompt_async` 不 await

```typescript
// prompt_async
async (c) => {
  c.status(204)
  return stream(c, async () => {
    const sessionID = c.req.valid("param").sessionID
    const body = c.req.valid("json")
    SessionPrompt.prompt({ ...body, sessionID })  // ← 没有 await！fire and forget
  })
}
```

这就是**触发 loop 的入口**。调用链是：

```
API 请求 → SessionPrompt.prompt() → 内部调用 loop()
```

## 回答你的问题：用户连续发消息时会怎样？

```
T1: 用户发消息 A → POST /:sessionID/message
    → prompt({ sessionID, message: "hello" })
    → loop() → start() 成功 → 执行者开始 LLM 循环

T2: 用户发消息 B → POST /:sessionID/message  
    → prompt({ sessionID, message: "world" })
    → loop() → start() 失败 → 挂入 callbacks 等待
```

**关键问题**：`prompt()` 函数在调用 `loop()` 之前，一定会先把用户消息写入存储：

```typescript
// SessionPrompt.prompt() 大致逻辑（推测）
export async function prompt(input) {
  // 1. 先把用户消息持久化
  await MessageV2.create(input.sessionID, {
    role: "user",
    content: input.message,
  })
  
  // 2. 然后调用 loop
  return await loop({ sessionID: input.sessionID })
}
```

所以：
- 消息 B 在 T2 已经被写入存储了
- 但 T2 的 `loop()` 走了路径 B（等待者），拿到的是**消息 A 那轮循环的结果**
- 消息 B **已经在存储中**，但还没被 LLM 处理

## 那消息 B 什么时候被处理？

从你贴出的代码来看，**这里没有自动重新触发的机制**。需要看 `SessionPrompt.prompt()` 的完整实现才能确认，但可能的设计是：

1. **前端负责**：前端发现消息 B 还没被处理（没有对应的 assistant 回复），再次调用 API
2. **prompt() 内部有重试逻辑**：`loop()` 返回后，检查是否有未处理的消息，如果有就再调一次 `loop()`
3. **靠 `resume_existing` 机制**：在 loop 结束的 cleanup 阶段检查 callbacks 队列

**你能贴一下 `SessionPrompt.prompt()` 的实现吗？** 这是拼图的最后一块——它会告诉我们消息写入和 loop 调用之间的具体逻辑。