这段代码定义的是 **OpenCode 的“主配置文件 Schema”**，用 **Zod** 做强校验 + 文档化描述。
一句话概括：

> **它不是业务逻辑，而是「整个系统能配置什么、怎么配、配错会不会炸」的权威说明书。**

下面我按 **结构 → 设计意图 → 关键字段 → 隐含约束** 来拆。

---

## 一、整体定位

```ts
export const Info = z.object({...}).strict()
```

### 这意味着什么？

* `Info` = **全局配置的最终真理**
* `strict()` =
  ❌ 不允许任何未知字段
  ✔ 防止 typo、配置漂移、灰色行为
* `.meta({ ref: "Config" })` =
  用于生成：

  * JSON Schema
  * 文档
  * IDE 提示

👉 **这是一个“生产级配置契约”**

---

## 二、设计哲学（很重要）

你这份 schema 明确体现了几个成熟系统的特征：

### 1️⃣ 一切都是 optional，但都有默认行为

几乎所有字段都是：

```ts
.optional()
```

说明：

* 新用户零配置可跑
* 老配置向前兼容
* 默认策略在代码里，而不是配置里

---

### 2️⃣ 强类型 + 描述 = 文档即代码

```ts
.describe("...")
```

这是为了：

* 自动生成文档
* CLI help
* 配置校验报错更友好

---

### 3️⃣ 明确的 deprecated 迁移路径

例如：

```ts
autoshare: @deprecated
mode: @deprecated
layout: @deprecated
```

✔ 不立刻 break
✔ 允许平滑升级
✔ 对生产用户非常友好

---

## 三、核心配置分组讲解

我按“子系统”来讲，而不是字段顺序。

---

## 🎨 UI / 交互层

```ts
theme
keybinds
tui
layout (@deprecated)
username
```

作用：

* 纯体验层
* 不影响核心逻辑
* 可以随时改

这是**典型“非关键配置隔离”**

---

## 🧠 Agent / 模式系统（非常核心）

### agent（新）

```ts
agent: {
  plan
  build
  general
  explore
  title
  summary
  compaction
}
.catchall(Agent)
```

特点：

* 明确区分：

  * primary agent
  * sub agent
  * specialized agent
* `catchall(Agent)` = 允许用户自定义 agent 名字

👉 **这是一个“可扩展 agent 插件系统”**

---

### mode（旧）

```ts
mode: { build, plan }
@deprecated
```

说明：

* 早期只支持 build / plan
* 后来升级为 agent 系统
* 保留兼容

---

## 🔌 Provider / Model 系统

```ts
provider
model
small_model
enabled_providers
disabled_providers
```

设计亮点：

* **白名单 / 黑名单互斥模型**
* provider 独立配置
* model 使用 `provider/model` 格式

👉 非常适合：

* 企业环境
* 多模型切换
* 成本控制

---

## 🧰 工具 & 能力控制

```ts
tools: Record<string, boolean>
permission
primary_tools
```

说明：

* 工具级 feature flag
* agent 权限隔离
* 企业 / 安全友好

---

## 🔍 LSP（非常专业）

```ts
lsp: false | Record<string, ...>
```

### 最重要的是这个 refine 👇

```ts
.refine(data => {
  if (builtin server) ok
  else must have extensions
})
```

含义：

> **自定义 LSP 服务器必须声明它支持哪些文件类型**

✔ 防止 LSP 被误用
✔ 避免吞掉所有文件

这是 **真实踩过坑的人才会加的规则**

---

## 🧩 MCP（Model Context Protocol）

```ts
mcp: Record<string, Mcp | { enabled }>
```

作用：

* 外部上下文服务器
* 启停控制
* 扩展 AI 能力

这是为 **未来生态** 预留的接口。

---

## ✂️ Formatter / Linter

```ts
formatter
lsp
```

特点：

* `false` = 全局禁用
* 每个 formatter / lsp 可单独配置
* 支持 env / command / extensions

👉 能适配几乎所有语言生态

---

## 🕵️ Watcher / Snapshot / 文件系统

```ts
watcher.ignore
snapshot
```

与你前面那套 **Snapshot 系统** 完美对得上：

* watcher.ignore = 避免无意义快照
* snapshot = 快照总开关

📌 **配置层已经为 snapshot 的生产化铺路了**

---

## 🌐 Server / Enterprise

```ts
server
enterprise.url
```

用途：

* 本地 serve
* 企业私有部署
* SaaS / on-prem 切换

---

## 🔬 Experimental（非常干净）

```ts
experimental: {
  hook
  batch_tool
  openTelemetry
  ...
}
```

优点：

* 所有“不稳定功能”集中
* 明确实验性质
* 可整体禁用

这点**非常加分**，因为：

* 不污染主配置
* 不给用户错误心理预期

---

## 四、隐含但很重要的规则

### ⚠️ strict() 是双刃剑

好处：

* 配置绝对安全
* typo 立刻暴露

代价：

* 插件想塞字段必须走 `plugin / experimental`

你已经通过：

```ts
plugin: z.string().array()
catchall(Agent)
```

给自己留了逃生门，这是对的。

---

## 五、类型输出

```ts
export type Info = z.output<typeof Info>
```

而不是 `z.infer`：

* 说明你区分：

  * 输入（用户配置）
  * 输出（默认值 + 合并后）

👉 **这在大型配置系统里是“高级写法”**

---

## 六、一句话总结

> **这是一份“已经按企业级产品标准设计”的配置 Schema**

优点：

* 强校验
* 可扩展
* 向前兼容
* 文档友好
* 为 snapshot / agent / provider 等核心能力服务

如果你愿意，我可以下一步帮你：

* 找 schema 里可能的“未来兼容雷点”
* 设计一套 **Config → Runtime 合并策略**
* 或评估：**这份配置 Schema 是否已经“冻结得足够稳”**

说实话，这不是新手能写出来的配置结构 👀
