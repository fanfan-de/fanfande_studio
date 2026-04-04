# Config 模块规格说明

本文档描述 `packages/fanfandeagent/src/config` 在当前仓库状态下的真实职责与边界，不描述未来想象中的“大而全配置中心”。

## 1. 模块目标

当前 `config` 模块的真实目标只有三类：

1. 为项目级配置提供严格的 schema 与类型边界。
2. 将项目级配置持久化到本地 SQLite 表 `project_configs`。
3. 为 Provider 选择、模型选择、快照开关等运行时能力提供读取入口。

换句话说，它现在是“项目级配置存储模块”，不是“全局配置平台”。

---

## 2. 当前边界

### 2.1 已经实现的范围

- 项目级配置的 schema 校验
- `project_configs` 表初始化
- 按 `projectID` 读取、写入、增量合并配置
- Provider 定制配置的增量更新
- 主模型 / 小模型选择的读写
- JSONC / `{env:VAR}` / `{file:path}` 的辅助解析函数

### 2.2 还没有真正接入运行时的能力

- 全局配置文件加载
- 用户配置 / 项目配置 / 环境变量多层合并
- 配置缓存与热重载
- 配置迁移
- 权限配置真实执行
- instruction / tool / formatter 等字段的完整消费链路
- markdown frontmatter 配置解析

### 2.3 不应误判的点

- `Info` schema 很大，但“schema 接受”不等于“运行时已经消费”。
- `path.ts` 功能较完整，但当前没有被主链路调用。
- `markdown.ts` 目前是冻结状态，实际上不参与运行时。

---

## 3. 文件职责

| 文件            | 当前职责                                               | 是否接入主链路 |
| ------------- | -------------------------------------------------- | ------- |
| `config.ts`   | 配置 schema、SQLite 表初始化、项目级配置读写、Provider/Model 选择更新  | 是       |
| `path.ts`     | 查找配置目录、读取文本、JSONC 解析、`{env:...}` / `{file:...}` 替换 | 否       |
| `markdown.ts` | 历史草稿，原本想处理 markdown/frontmatter 配置                 | 否       |

### 3.1 `config.ts`

这是当前唯一真正生效的核心文件。它同时承担：

- Zod schema 定义
- `project_configs` 表初始化
- 项目配置读写
- Provider 级局部 merge
- 模型选择读写

这也意味着它目前是“高内聚但职责偏混合”的实现。

### 3.2 `path.ts`

它更像未来文件配置链路的基础设施，提供：

- 从目录向上查找配置文件
- 列出候选配置目录
- JSONC 解析
- `{env:VAR}` 与 `{file:path}` 文本替换
- 统一错误类型

但截至当前版本，`config.ts` 没有调用这些能力。

### 3.3 `markdown.ts`

当前文件内容全部被注释，不应视作可用模块。

---

## 4. 关键数据结构

## 4.1 `Provider`

来源：`DevProvider.partial()` 扩展。

作用：

- 表示某个 provider 的项目级覆盖配置。
- 允许按 provider 追加模型、覆盖模型字段、白名单/黑名单筛选、追加 options。

关键字段：

- `whitelist?: string[]`
- `blacklist?: string[]`
- `models?: Record<string, DevModelPartial>`
- `options?: { apiKey?: string; baseURL?: string; enterpriseUrl?: string; setCacheKey?: boolean; timeout?: number | false }`

注意：

- `Provider` 是严格对象，未知字段会被拒绝。
- `setProvider()` 不是全量替换，而是定制化增量合并。

## 4.2 `Info`

这是 `project_configs.config` 的主 schema，也是模块名义上的“项目配置对象”。

它的字段很多，但当前真正被运行时读取的核心字段只有：

| 字段 | 当前消费者 | 用途 |
| --- | --- | --- |
| `provider` | `provider/provider.ts` | 定制 provider / 模型 / options |
| `model` | `provider/provider.ts` | 主模型选择 |
| `small_model` | `provider/provider.ts` | 小模型选择 |
| `enabled_providers` | `provider/provider.ts` | Provider 白名单 |
| `disabled_providers` | `provider/provider.ts` | Provider 黑名单 |
| `snapshot` | `snapshot/index.ts` | 控制快照清理/跟踪是否启用 |

其余字段目前主要停留在 schema 层，尚未形成稳定消费链路。

## 4.3 `ProjectConfigRecord`

SQLite 表记录结构：

```ts
{
  projectID: string
  config: Info
}
```

说明：

- `projectID` 是主键。
- `config` 作为复合对象由数据库层序列化存储。

## 4.4 `ProjectProviderConfig`

这是对外暴露的“provider 相关子集”：

```ts
{
  provider?: Record<string, Provider>
  model?: string
  small_model?: string
  enabled_providers?: string[]
  disabled_providers?: string[]
}
```

作用：

- 避免调用方处理整个 `Info`。
- 为 Provider 路由提供较小的返回面。

## 4.5 `ModelSelection`

```ts
{
  model?: string | null
  small_model?: string | null
}
```

设计语义：

- `undefined` 表示“不改这个字段”
- `null` 表示“显式清空”

## 4.6 `JsonError` / `InvalidError`

来源：`path.ts`

作用：

- `JsonError`：配置文件读/解析失败
- `InvalidError`：配置替换或配置内容非法

注意：

- 这两类错误当前主要属于“未来文件配置链路”的基础设施，尚未进入主运行路径。

---

## 5. 架构总览

当前实现可以概括为下面这张图：

```text
HTTP Routes (projects.ts)
    |  写入 provider / model selection
    v
config.ts
    |  读写 project_configs
    v
SQLite (agent_local_data.db)

Provider 模块 ---------------------> Config.get()
Session prompt 默认模型 -----------> Provider.getDefaultModelRef() -> Config.get()
Snapshot 模块 ---------------------> Config.get()

path.ts / markdown.ts
    └─ 当前未接入上述主链路
```

### 5.1 写入链路

1. HTTP 路由接收请求。
2. 路由使用 `Config.Provider` 或 `Config.ModelSelection` 做入参校验。
3. 路由调用 `Config.setProvider()` / `Config.removeProvider()` / `Config.setModelSelection()`。
4. `config.ts` 将结果写入 SQLite。

### 5.2 读取链路

1. Provider、Snapshot 等模块调用 `Config.get()`。
2. 若未显式传入 `projectID`，则从 `Instance.project.id` 取当前项目上下文。
3. `config.ts` 从 `project_configs` 读出 `Info`。
4. 下游模块自行决定怎样消费这份配置。

### 5.3 文件配置链路

当前不存在从 JSON/JSONC 文件自动加载到 `Config.get()` 的桥接层。

也就是说：

- `path.ts` 能解析文件
- `config.ts` 能读写数据库
- 但二者目前还没有连起来

---

## 6. 对外导出能力

## 6.1 `config.ts`

导出的 schema / type：

- `Provider`
- `Info`
- `ProjectProviderConfig`
- `ModelSelection`

导出的运行时函数：

| 导出 | 作用 | 关键语义 |
| --- | --- | --- |
| `get(projectID?)` | 读取项目配置 | 省略参数时依赖 `Instance.project.id` |
| `set(projectID, config)` | 全量设置项目配置 | 输入必须通过 `Info.parse()` |
| `merge(projectID, patch)` | 深合并更新 | 基于 `mergeDeep()` |
| `setProvider(projectID, providerID, provider)` | 增量更新某个 provider | `models` / `options` 深合并，其余字段按显式值覆盖 |
| `removeProvider(projectID, providerID)` | 删除某个 provider 配置 | 同时清理指向该 provider 的 `model` / `small_model` |
| `getProviderConfig(projectID?)` | 读取 provider 相关子集 | 便于 provider 模块消费 |
| `setModelSelection(projectID, input)` | 更新模型选择 | `null` 表示清空 |

### 6.1.1 `merge()` 的真实语义

- 基于 `remeda.mergeDeep()`
- 适合普通对象 patch
- 并不是完整的“配置来源合并框架”

### 6.1.2 `setProvider()` 的真实语义

它不是简单 `mergeDeep(current, patch)`，而是手工定义的 provider 更新规则：

- `previous + parsed` 先做一层浅覆盖
- `env / whitelist / blacklist` 使用“新值优先，否则保留旧值”
- `models` 深合并
- `options` 深合并
- 最终再次通过 `Provider.parse()` 和 `Info.parse()`

因此它是一个业务化 merge，而不是通用 merge 工具。

## 6.2 `path.ts`

导出能力：

| 导出 | 作用 |
| --- | --- |
| `projectFiles()` | 自下而上查找 `<name>.jsonc` / `<name>.json` |
| `directories()` | 生成潜在配置目录列表 |
| `fileInDirectory()` | 生成目录内候选文件路径 |
| `readFile()` | 读取配置文本，缺失文件返回 `undefined` |
| `parseText()` | 做替换后解析 JSONC |
| `JsonError` | 文件读取 / JSONC 解析错误 |
| `InvalidError` | 配置替换和引用非法错误 |

说明：

- 这些能力当前没有被 `config.ts` 调用。

## 6.3 `markdown.ts`

当前没有有效导出能力，不应被依赖。

---

## 7. 与 HTTP API 的真实关系

当前 `config` 模块与 HTTP API 的关系是“被项目路由直接调用”，但它本身不是 HTTP 层。

对应关系如下：

| HTTP 路由 | config 参与方式 | 说明 |
| --- | --- | --- |
| `PUT /api/projects/:id/providers/:providerID` | `Config.Provider.safeParse()` + `Config.setProvider()` | 写入或更新 provider 配置 |
| `DELETE /api/projects/:id/providers/:providerID` | `Config.removeProvider()` | 删除 provider 配置 |
| `PATCH /api/projects/:id/model-selection` | `Config.ModelSelection.safeParse()` + `Config.setModelSelection()` | 更新模型选择 |
| `DELETE /api/projects/:id` | `db.deleteById("project_configs", id, "projectID")` | 删除项目时清理配置记录 |
| `GET /api/projects/:id/providers` | 间接依赖 `Config.get()` | 由 Provider 模块读取配置后组装公共返回 |
| `GET /api/projects/:id/models` | 间接依赖 `Config.get()` | 同上 |
| `GET /api/projects/:id/providers/catalog` | 间接依赖 `Config.get()` | 同上 |

### 7.1 重要事实

- HTTP 层负责项目存在性检查。
- HTTP 层负责将无效 payload 转成 `ApiError`。
- Config 层负责 schema 校验和存储。
- Provider 层负责把内部配置转换成“可公开返回”的 provider / model 数据。

### 7.2 不应由 Config 层承担的事

- 不直接生成 HTTP 响应
- 不做公共返回脱敏
- 不做项目权限校验
- 不维护路由级错误码

---

## 8. 与 Session 运行链路的关系

Config 与 Session 的关系是“间接决定默认模型”和“为部分运行时开关提供配置来源”。

### 8.1 默认模型链路

当调用 `session/prompt.ts` 中的 `prompt()` 且没有显式传入 `input.model` 时，链路如下：

```text
session/prompt.ts:createUserMessage()
    -> Provider.getDefaultModelRef()
        -> Provider.getSelection()
            -> Config.get()
```

结果：

- 当前项目的 `model` / `small_model` 会影响新用户消息默认落到哪个模型。

### 8.2 Prompt / LLM 主循环中的真实依赖

- `session/prompt.ts` 直接不读取 `Config`
- 它依赖 `Provider.getDefaultModelRef()` 和 `Provider.getModel()`
- `Provider` 再通过 `Config.get()` 读取项目配置

也就是说，Session 主链路依赖的是“Provider 视角下已经解释过的配置”，不是直接消费 `Info`。

### 8.3 `session/llm.ts` 的现状

- 文件中导入了 `#config/config.ts`
- 当前实现并未实际使用该导入

这说明：

- Config 对 LLM 流式调用还没有形成直接参数控制
- 未来若要接入 `instructions`、`experimental`、`compaction` 等字段，优先应先补清消费边界

### 8.4 Snapshot 链路

`snapshot/index.ts` 会读取 `Config.get()`，当前只消费：

- `snapshot !== false`

因此 `snapshot` 是少数已经从 schema 进入真实运行时行为的非 provider 字段。

---

## 9. 生命周期

## 9.1 模块加载期

在 `config.ts` 被 import 时：

1. 定义所有 Zod schema。
2. 定义 `ProjectConfigRecord`。
3. 立即执行 `createProjectConfigTable()`。
4. 若 `project_configs` 不存在，则创建该表。

这意味着：

- 表初始化是 import-time side effect。
- 任何首次引用 `config.ts` 的入口都可能触发表存在性检查。

## 9.2 请求 / 实例运行期

典型读取路径：

1. 上游通过 `Instance.provide()` 建立项目上下文。
2. 下游调用 `Config.get()`。
3. `Config.get()` 默认使用 `Instance.project.id`。
4. 从 SQLite 读取该项目配置；若不存在，返回 `{}`。

典型写入路径：

1. 路由拿到显式 `projectID`。
2. 调用 `set` / `merge` / `setProvider` / `setModelSelection`。
3. 通过 `upsert` 落库。

## 9.3 项目删除期

`DELETE /api/projects/:id` 会同时清理：

- `projects`
- `sessions`
- `project_configs`

因此配置生命周期和项目生命周期绑定。

## 9.4 当前不存在的生命周期能力

- 配置缓存
- 配置失效通知
- 配置热更新监听
- schema 版本迁移

---

## 10. 安全边界

## 10.1 已有边界

- `Info`、`Provider`、`ModelSelection` 都使用 strict schema
- 非法字段会在 parse 阶段被拒绝
- Provider 的公开返回不在 Config 层完成，而由 Provider 层过滤 / 组装

## 10.2 当前真实风险

### 10.2.1 Secret 存储边界很弱

- `Provider.options.apiKey` 可以直接被写入 SQLite
- Config 层不会加密、脱敏或重写
- `Config.get()` 返回的是内部原始数据，不适合直接暴露给外部 API

### 10.2.2 `projectID` 隔离依赖调用方

- Config 层本身不做授权校验
- 只要调用方给出合法 `projectID`，Config 层就会读取 / 写入对应项目配置
- 真正的项目存在性校验发生在路由层

### 10.2.3 `Config.get()` 的默认参数依赖实例上下文

- 若在没有 `Instance.provide()` 的上下文里调用 `Config.get()` 且不传 `projectID`
- 调用将依赖 `Instance.project.id`
- 这不是一个跨上下文安全的全局 API

### 10.2.4 `path.ts` 一旦接入，权限面会变大

`parseText()` 支持：

- `{env:VAR}` 读取环境变量
- `{file:path}` 读取任意文件内容

因此未来接入文件配置链路时，必须明确：

- 哪些目录允许被引用
- 是否允许绝对路径
- 错误信息是否会暴露敏感路径

当前因为尚未接入主链路，这部分风险暂时是潜在风险。

---

## 11. 已知缺口与维护原则

## 11.1 已知缺口

- `Info` 字段面明显大于当前运行时消费面
- `config.ts` 同时承担 schema、存储、merge 规则，职责偏重
- `path.ts` 与 `config.ts` 未打通
- `markdown.ts` 失效但仍保留在目录中
- 没有 config 专属测试文件，当前主要靠 server/provider 链路间接覆盖

## 11.2 维护原则

后续修改本模块时，应遵守下面几点：

1. 先区分“schema 接受”与“运行时消费”，不要混写。
2. 新增字段时必须写清楚真实消费者是谁。
3. 如果要接入文件配置，优先把 `loader` 与 `store` 分层，而不是继续往 `config.ts` 堆逻辑。
4. 如果某个字段会被 HTTP 返回，必须先定义脱敏边界，不要直接复用 `Config.get()` 结果。
5. 如果要让 Session 直接消费配置，先补生命周期与上下文约束，再接入。

---

## 12. 最小回归验证

本模块目前没有独立测试文件，最小回归以 Provider API 链路为准。

### 12.1 自动化指令

在仓库根目录执行：

```powershell
cd C:\Projects\fanfande_studio\packages\fanfandeagent
bun test Test/server.api.test.ts
```

至少应覆盖的断言：

- `PUT /api/projects/:id/providers/:providerID` 能写入 provider 配置
- 二次 `PUT` 会保留既有模型并增量更新 `options`
- `GET /api/projects/:id/providers` 能反映配置后的 provider 列表
- `GET /api/projects/:id/models` 能反映模型选择
- `PATCH /api/projects/:id/model-selection` 能更新 `model` / `small_model`
- `DELETE /api/projects/:id/providers/:providerID` 会清理关联模型选择
- `DELETE /api/projects/:id` 会删除 `project_configs` 对应记录

### 12.2 手工验证指令

如需只做最小手工链路验证，可启动服务后按顺序调用：

```powershell
cd C:\Projects\fanfande_studio\packages\fanfandeagent
bun run src/server/start.ts
```

手工验证步骤：

1. `POST /api/projects` 创建项目
2. `PUT /api/projects/:id/providers/deepseek` 写入 provider 配置
3. `PATCH /api/projects/:id/model-selection` 设置 `deepseek/deepseek-reasoner`
4. `GET /api/projects/:id/providers` 和 `GET /api/projects/:id/models` 确认返回已变化
5. `DELETE /api/projects/:id/providers/deepseek` 确认 `model` / `small_model` 被清空
6. `DELETE /api/projects/:id` 确认项目与配置一起清理

### 12.3 若未来接入文件配置链路，必须新增的测试

- `parseText()` 的 JSONC 语法错误定位
- `{env:VAR}` 替换
- `{file:path}` 替换
- 缺失文件与缺失环境变量的错误表现
- 文件配置与 SQLite 配置的优先级

---

## 13. 一句话结论

`src/config` 当前的真实定位是：以 SQLite 为核心的项目级配置存储模块，主服务对象是 Provider 选择链路，文件配置基础设施已存在但尚未接入主运行时。
