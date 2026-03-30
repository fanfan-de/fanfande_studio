# Hono Context (`c`) 完整参考

---

## 一、请求相关：`c.req`

`c.req` 是 Hono 的 `HonoRequest` 对象，它是对原生 Web 标准 `Request` 的封装。

### 1. 基本属性

```ts
c.req.raw          // 原生 Request 对象（Web 标准 Fetch API 的 Request）
c.req.url          // 完整 URL 字符串，如 "https://example.com/user/123?page=1"
c.req.method       // 请求方法："GET" | "POST" | "PUT" | "DELETE" | "PATCH" ...
c.req.path         // 路径部分，如 "/user/123"
c.req.routePath    // 匹配的路由模式，如 "/user/:id"
```

### 2. 参数获取

```ts
// —— 路径参数（Path Params） ——
// 路由: /user/:id
c.req.param("id")          // 获取单个路径参数 → "123"
c.req.param()              // 获取所有路径参数 → { id: "123" }

// —— 查询参数（Query Params） ——
// URL: /search?q=hono&page=2
c.req.query("q")           // 获取单个查询参数 → "hono"
c.req.query()              // 获取所有查询参数 → { q: "hono", page: "2" }

// 同名多值查询参数
// URL: /search?tag=js&tag=ts
c.req.queries("tag")       // → ["js", "ts"]
c.req.queries()            // → { tag: ["js", "ts"] }
```

### 3. 请求头（Headers）

```ts
c.req.header("Content-Type")      // 获取单个请求头（不区分大小写）
c.req.header("Authorization")     // → "Bearer xxx"
c.req.header()                    // 获取所有请求头，返回一个 Record<string, string>
```

### 4. 请求体（Body）解析

```ts
// 以下方法都是异步的，需要 await

await c.req.json()             // 解析为 JSON 对象
await c.req.text()             // 解析为纯文本字符串
await c.req.arrayBuffer()      // 解析为 ArrayBuffer（二进制）
await c.req.blob()             // 解析为 Blob
await c.req.formData()         // 解析为 FormData（表单数据/文件上传）

// 解析 body 并做验证（配合 validator 中间件）
await c.req.valid("json")     // 获取经过验证的 JSON 数据
await c.req.valid("query")    // 获取经过验证的 query 数据
await c.req.valid("param")    // 获取经过验证的 param 数据
await c.req.valid("form")     // 获取经过验证的 form 数据
await c.req.valid("header")   // 获取经过验证的 header 数据
await c.req.valid("cookie")   // 获取经过验证的 cookie 数据
```

### 5. URL 解析

```ts
c.req.url                    // 完整 URL 字符串
c.req.path                   // 路径部分

// 需要通过原生 URL 对象获取更多细节
const url = new URL(c.req.url)
url.hostname                 // "example.com"
url.protocol                 // "https:"
url.port                     // "3000"
url.pathname                 // "/user/123"
url.search                   // "?page=1"
url.hash                     // "#section"
```

### 6. 其他方法

```ts
c.req.matchedRoutes          // 当前匹配到的路由列表（含中间件）
c.req.routePath              // 当前匹配的路由定义路径，如 "/user/:id"

// 通过原生 Request 对象还可以获取:
c.req.raw.signal             // AbortSignal（用于请求取消）
c.req.raw.cache              // 缓存模式
c.req.raw.credentials        // 凭证模式
c.req.raw.integrity          // 完整性校验
c.req.raw.keepalive          // 是否保持连接
c.req.raw.mode               // 请求模式
c.req.raw.redirect           // 重定向模式
c.req.raw.referrer           // 来源页
c.req.raw.referrerPolicy     // 来源策略
```

---

## 二、响应相关：`c` 上的响应方法

### 1. 返回不同格式的响应

```ts
// —— JSON 响应 ——
c.json({ message: "hello" })             // 200 + application/json
c.json({ error: "not found" }, 404)      // 指定状态码
c.json(data, 200, {                      // 指定状态码 + 自定义响应头
  "X-Custom-Header": "value"
})

// —— 纯文本响应 ——
c.text("Hello World")                    // 200 + text/plain
c.text("Not Found", 404)                // 指定状态码

// —— HTML 响应 ——
c.html("<h1>Hello</h1>")                // 200 + text/html
c.html("<h1>Error</h1>", 500)           // 指定状态码

// —— 重定向 ——
c.redirect("/login")                     // 302 临时重定向
c.redirect("/login", 301)               // 301 永久重定向

// —— 返回 null body ——
c.body(null, 204)                        // 204 No Content

// —— 原始 body 响应 ——
c.body("raw string")                     // 原始字符串响应
c.body(arrayBuffer)                      // 原始二进制响应
c.body(readableStream)                   // 流式响应

// —— 返回 Response 对象（完全自定义）——
c.newResponse("body", 200, {
  "Content-Type": "application/xml"
})
// 或直接返回原生 Response
return new Response("body", { status: 200 })

// —— 404 Not Found 快捷方式 ——
c.notFound()                             // 触发 notFound 处理器
```

### 2. 设置响应头

```ts
// 设置单个响应头
c.header("X-Request-Id", "abc-123")
c.header("Cache-Control", "no-cache")
c.header("Content-Type", "application/xml")

// 追加响应头（同名多值），第三个参数设为 { append: true }
c.header("Set-Cookie", "a=1", { append: true })
c.header("Set-Cookie", "b=2", { append: true })
// 结果：两个 Set-Cookie 头
```

### 3. 设置 HTTP 状态码

```ts
c.status(201)     // Created
c.status(400)     // Bad Request
c.status(404)     // Not Found
c.status(500)     // Internal Server Error
// 注意：c.status() 需要在 c.json()/c.text() 之前调用，或直接在 c.json(data, 201) 中传入
```

---

## 三、上下文存储与中间件通信：`c.set()` / `c.get()`

这是 `c` 非常重要的功能——**在中间件之间传递数据**。

```ts
// 中间件中设置数据
app.use(async (c, next) => {
  const user = await authenticate(c.req.header("Authorization"))
  c.set("currentUser", user)     // 存储数据到上下文
  c.set("requestId", "abc-123")
  await next()
})

// 路由处理器中获取数据
app.get("/profile", (c) => {
  const user = c.get("currentUser")     // 读取中间件设置的数据
  const reqId = c.get("requestId")
  return c.json(user)
})
```

```ts
// 类型安全的写法（TypeScript）
type Variables = {
  currentUser: { id: number; name: string }
  requestId: string
}

const app = new Hono<{ Variables: Variables }>()
// 这样 c.get("currentUser") 会有正确的类型提示
```

---

## 四、`c.var` — `c.get()` 的快捷方式

```ts
// c.var 等价于 c.get()
c.var.currentUser    // 等同于 c.get("currentUser")
c.var.requestId      // 等同于 c.get("requestId")
```

---

## 五、`c.env` — 环境变量 / 绑定

在 Cloudflare Workers、Bun、Deno 等运行时中，`c.env` 用于访问环境变量或平台绑定：

```ts
// Cloudflare Workers
c.env.MY_SECRET        // 环境变量
c.env.MY_KV            // KV 绑定
c.env.MY_BUCKET        // R2 绑定
c.env.MY_DB            // D1 数据库绑定
c.env.MY_QUEUE         // Queue 绑定

// 类型定义
type Bindings = {
  MY_SECRET: string
  MY_KV: KVNamespace
  MY_DB: D1Database
}
const app = new Hono<{ Bindings: Bindings }>()
```

---

## 六、`c.executionCtx` — 执行上下文

```ts
// Cloudflare Workers 特有
c.executionCtx.waitUntil(promise)   // 在响应返回后继续执行异步任务
c.executionCtx.passThroughOnException()  // 异常时回退到源站

// 示例：发送完响应后异步写日志
app.get("/api", (c) => {
  c.executionCtx.waitUntil(
    fetch("https://log-service.com", {
      method: "POST",
      body: JSON.stringify({ event: "api_called" })
    })
  )
  return c.json({ ok: true })
})
```

---

## 七、渲染相关：`c.render()` / `c.setRenderer()`

用于模板渲染（配合 JSX 或其他模板引擎）：

```tsx
// 设置渲染器
app.use(async (c, next) => {
  c.setRenderer((content, props) => {
    return c.html(
      <html>
        <head><title>{props.title}</title></head>
        <body>{content}</body>
      </html>
    )
  })
  await next()
})

// 使用渲染
app.get("/", (c) => {
  return c.render(<h1>Hello!</h1>, { title: "My Page" })
})
```

---

## 八、完整总结图

```
c (Context)
│
├── c.req ──────────── 请求（输入）
│   ├── .url                    完整 URL
│   ├── .path                   路径
│   ├── .method                 方法
│   ├── .header(name?)          请求头
│   ├── .param(name?)           路径参数
│   ├── .query(name?)           查询参数
│   ├── .queries(name?)         多值查询参数
│   ├── .json()                 Body → JSON
│   ├── .text()                 Body → 文本
│   ├── .formData()             Body → FormData
│   ├── .arrayBuffer()          Body → 二进制
│   ├── .blob()                 Body → Blob
│   ├── .valid(target)          校验后的数据
│   ├── .routePath              匹配的路由模式
│   ├── .matchedRoutes          匹配的路由列表
│   └── .raw                    原生 Request 对象
│
├── 响应方法 ────────── 响应（输出）
│   ├── c.json(data, status?, headers?)     JSON 响应
│   ├── c.text(text, status?, headers?)     文本响应
│   ├── c.html(html, status?, headers?)     HTML 响应
│   ├── c.body(data, status?, headers?)     原始响应
│   ├── c.redirect(url, status?)            重定向
│   ├── c.newResponse(body, status, headers) 自定义响应
│   ├── c.notFound()                        404
│   ├── c.header(name, value)               设置响应头
│   ├── c.status(code)                      设置状态码
│   └── c.render(content, props?)           模板渲染
│
├── 上下文数据 ──────── 中间件通信
│   ├── c.set(key, value)       存数据
│   ├── c.get(key)              取数据
│   └── c.var                   c.get() 的快捷访问
│
├── c.env ──────────── 环境变量 / 平台绑定
│
├── c.executionCtx ─── 执行上下文（Workers）
│   ├── .waitUntil(promise)
│   └── .passThroughOnException()
│
└── c.error ────────── 错误对象（在 onError 处理器中可用）
```

---

这基本上覆盖了 Hono v4 中 `Context` 对象的所有核心功能。日常开发中最常用的就是：

- **`c.req.param()` / `c.req.query()` / `c.req.json()`** — 读取输入
- **`c.json()` / `c.text()` / `c.redirect()`** — 返回输出
- **`c.set()` / `c.get()`** — 中间件之间传数据