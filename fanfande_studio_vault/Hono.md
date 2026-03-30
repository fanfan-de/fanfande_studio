# 参数详解、数据流向与来源

## 一、完整数据流全景图

```
Client (浏览器/App)                          Server (Hono)
─────────────────                          ─────────────
                                           
POST /abc123/message                       
Headers: Content-Type: application/json    
Body: { "content": "你好", ... }           
         │                                 
         │  ──── HTTP Request ────►        
         │                                 ┌──────────────────────┐
         │                                 │ 1. describeRoute()   │ (不参与运行时，仅文档)
         │                                 ├──────────────────────┤
         │                                 │ 2. validator("param")│ ← 从 URL 提取 sessionID
         │                                 │    sessionID="abc123"│
         │                                 ├──────────────────────┤
         │                                 │ 3. validator("json") │ ← 从 Body 提取内容
         │                                 │    { content: "你好" }│
         │                                 ├──────────────────────┤
         │                                 │ 4. handler (async)   │
         │                                 │    合并参数 → 调用AI  │
         │                                 └──────────┬───────────┘
         │                                            │
         │                                  SessionPrompt.prompt()
         │                                    (调用 AI 模型/服务)
         │                                            │
         │  ◄──── Streaming Response ────             │
         │                                            ▼
{ info: {...}, parts: [...] }              AI 返回结果 → JSON 序列化 → stream.write()
```

---

## 二、逐个参数详解

### 参数 1：路径 `"/:sessionID/message"`

| 属性 | 说明 |
|------|------|
| **来源** | 🟢 **Client** — 客户端构造 URL 时提供 |
| **用途** | 标识向哪个会话发消息 |
| **示例** | 客户端请求 `POST /sess_01HXYZ/message`，则 `sessionID = "sess_01HXYZ"` |

```
客户端构造 URL：
fetch(`/api/${sessionID}/message`, { method: "POST", ... })
                 ↑
           客户端提供的值
```

---

### 参数 2：`describeRoute({...})`

| 属性 | 说明 |
|------|------|
| **来源** | 🔵 **Server** — 开发者在服务端硬编码 |
| **用途** | 纯文档用途，**不参与运行时逻辑** |

它的每个子字段：

```ts
{
  summary: "Send message",           // → 显示在 Swagger UI 的接口标题
  description: "Create and send...", // → 显示在 Swagger UI 的详细说明
  operationId: "session.prompt",     // → 客户端 SDK 自动生成时的函数名
  responses: {
    200: {
      schema: resolver(z.object({
        info: MessageV2.Assistant,    // → 告诉文档：响应中有 AI 消息元信息
        parts: MessageV2.Part.array(),// → 告诉文档：响应中有消息内容数组
      })),
    },
    ...errors(400, 404),             // → 展开为 400/404 的错误响应文档
  },
}
```

**关键理解**：这整块代码在请求到来时**不会执行任何逻辑**，它只在启动时注册到 OpenAPI spec 中，供 `/doc` 或 `/swagger` 端点输出文档。

---

### 参数 3：`validator("param", ...)` — 路径参数验证

| 属性 | 说明 |
|------|------|
| **来源** | 🟢 **Client** — 值来自客户端 URL |
| **验证逻辑** | 🔵 **Server** — schema 定义在服务端 |
| **用途** | 提取并验证 URL 中的 `sessionID` |

```ts
validator(
  "param",                    // ← 告诉 Hono：验证的是 URL 路径参数
  z.object({
    sessionID: SessionID.zod, // ← 可能是 z.string().brand("SessionID") 
  }),                         //   或 z.string().regex(/^sess_[a-z0-9]+$/)
)
```

**数据流**：
```
URL: /sess_01HXYZ/message
        │
        ▼
Hono 路由解析 → { sessionID: "sess_01HXYZ" }
        │
        ▼
SessionID.zod 验证
        │
   ┌────┴────┐
   │ 通过    │ 失败
   ▼         ▼
继续执行   自动返回 400:
           { error: "Invalid sessionID" }
```

验证通过后，通过 `c.req.valid("param").sessionID` 取值。

---

### 参数 4：`validator("json", ...)` — 请求体验证

| 属性 | 说明 |
|------|------|
| **来源** | 🟢 **Client** — JSON body 由客户端发送 |
| **验证逻辑** | 🔵 **Server** — schema 定义在服务端 |
| **用途** | 提取并验证请求体中的 prompt 内容 |

```ts
validator(
  "json",                                              // ← 验证 JSON body
  SessionPrompt.PromptInput.omit({ sessionID: true })  // ← 移除 sessionID 字段
)
```

**为什么用 `.omit({ sessionID: true })`？**

```ts
// 假设完整的 PromptInput 长这样：
PromptInput = z.object({
  sessionID: SessionID.zod,     // 会话 ID
  content: z.string(),          // 用户消息内容
  model: z.string().optional(), // 可选：指定模型
  tools: z.array(...).optional(), // 可选：工具列表
})

// .omit({ sessionID: true }) 之后变成：
{
  content: z.string(),
  model: z.string().optional(),
  tools: z.array(...).optional(),
}
```

**原因**：`sessionID` 已经从 URL 路径获取了（参数 3），在 body 中再传一次是**冗余且危险的**（可能不一致），所以从 body schema 中移除。

**客户端实际发送的 body**：
```json
{
  "content": "帮我解释一下量子计算",
  "model": "claude-opus-4-6"
}
```

---

### 参数 5：`async (c) => {...}` — 请求处理函数

| 属性 | 说明 |
|------|------|
| **来源** | 🔵 **Server** — 全部是服务端逻辑 |
| **用途** | 核心业务：合并参数 → 调用 AI → 流式返回 |

逐行解析：

```ts
async (c) => {
  // ① 设置响应状态码和 Content-Type
  c.status(200)
  c.header("Content-Type", "application/json")
  
  // ② 开启流式响应
  return stream(c, async (stream) => {
    
    // ③ 从已验证的路径参数中取 sessionID（来自 Client URL）
    const sessionID = c.req.valid("param").sessionID
    
    // ④ 从已验证的请求体中取 body（来自 Client Body）
    const body = c.req.valid("json")
    
    // ⑤ 合并两个来源的数据，调用 AI 服务（Server 内部逻辑）
    const msg = await SessionPrompt.prompt({ ...body, sessionID })
    //          ↑ 这里把 body 展开并加回 sessionID，还原成完整的 PromptInput
    //          例如：{ content: "你好", model: "claude", sessionID: "sess_01HXYZ" }
    
    // ⑥ 将 AI 响应序列化后写入流（Server → Client）
    stream.write(JSON.stringify(msg))
    //   msg 的结构：{ info: { role: "assistant", ... }, parts: [{ type: "text", text: "..." }] }
  })
}
```

---

## 三、数据合并的关键设计

```
  Client URL                    Client Body
       │                             │
       ▼                             ▼
  sessionID                   { content, model, ... }
       │                             │
       └──────────┬──────────────────┘
                  ▼
          { ...body, sessionID }     ← 在 handler 中合并
                  │
                  ▼
       SessionPrompt.prompt(input)   ← 传入完整参数
                  │
                  ▼
         AI Service / LLM            ← Server 内部调用
                  │
                  ▼
       { info, parts }               ← AI 响应结果
                  │
                  ▼
       stream.write(JSON.stringify)  ← Server → Client
```

---

## 四、来源汇总表

| 数据 | 来源 | 载体 | 验证方式 |
|------|------|------|---------|
| `sessionID` | 🟢 Client | URL 路径 `/:sessionID/message` | `validator("param")` + `SessionID.zod` |
| `content` / `model` / `tools` 等 | 🟢 Client | HTTP JSON Body | `validator("json")` + `PromptInput.omit(...)` |
| OpenAPI 文档 metadata | 🔵 Server | 硬编码在 `describeRoute` | 无需验证（静态定义） |
| `MessageV2.Assistant` / `MessageV2.Part` | 🔵 Server | AI 服务返回 | 作为响应 schema（类型约束） |
| 流式响应 `{ info, parts }` | 🔵 Server | `SessionPrompt.prompt()` 的返回值 | 由 AI 服务生成 |

---

## 五、为什么用 `stream()` 而不是直接 `return c.json()`？

虽然这段代码当前只做了**一次** `stream.write()`（看起来和直接返回没区别），但使用 `stream` 的设计意图是：

1. **未来扩展**：可以改为逐 token 流式输出（SSE 风格）
2. **长连接保持**：AI 生成可能耗时较长，流式响应让客户端不会超时
3. **内存效率**：大响应不需要全部缓存在内存中再发送

如果未来改成真正的流式：
```ts
// 未来可能的写法
for await (const chunk of aiStream) {
  stream.write(JSON.stringify(chunk) + "\n")
}
```