# Provider Module Spec

## 0. 数据处理总览

### 0.1 总图

```text
ModelsDev.get()
  -> fromModelsDevProvider()/fromModelsDevModel()
  -> catalogMap()

Config.get() + Env.all()
  + catalogMap()
  -> resolveProjectProviders()
     -> applyProviderConfig()
        -> mergeProviderModels()
        -> filterProviderModels()

=> { catalog, providers }

catalog -> catalog()
providers -> list() -> listPublicProviders() / listModels() / getPublicProvider()
providers + model -> getSDK() -> getLanguage()
```

最核心的理解是：

- `catalog` 是 provider 全局目录，偏基础资料
- `providers` 是当前解析结果里的生效 provider 视图，偏可运行状态
- `Model` / `ProviderInfo` 是模块内部结构
- `PublicModel` / `PublicProvider` / `ProviderCatalogItem` 是 API/UI 对外结构

### 0.2 数据边界

内部结构用于配置合并、模型查询和 SDK 初始化，对外结构用于 API 返回和前端展示。

- `ProviderInfo` 保留内部运行态字段，例如 `key`、`options`、`models: Record<string, Model>`
- `PublicProvider` 只暴露安全且适合展示的字段，并补充 `configured`、`available`、`apiKeyConfigured`、`baseURL`、`modelCount`
- `PublicModel` 基于 `Model` 去掉 `headers`，再补上 `available`

因此，这个模块不是把内部对象原样透传给前端，而是显式做了一次“内部模型 -> 公开 DTO”的投影。

### 0.3 第一阶段：原始输入 -> 当前 provider 视图

这一阶段的目标是把共享 catalog、配置和环境变量合成当前生效的 provider 集合。

1. `catalogMap()` 调用 `ModelsDev.get()`，再用 `fromModelsDevProvider()` / `fromModelsDevModel()` 把外部 catalog 标准化成内部 `ProviderInfo` / `Model`
2. `resolveProjectProviders()` 读取 `Config.get()` 和 `Env.all()`
3. provider ID 取 `catalog` 与 `config.provider` 的并集
4. 先用 `isProviderAllowed()` 应用 `enabled_providers` / `disabled_providers`
5. 再对每个候选 provider 调用 `applyProviderConfig()`

`applyProviderConfig()` 是第一阶段的核心：

- catalog 中已有 provider 时，以 catalog 版本为底
- catalog 中没有、但配置里有 provider 时，先构造 config-only provider
- API key 优先级为 `providerConfig.options.apiKey`，再按 `provider.env` 从环境变量里取第一个非空值
- provider 级 `options` 会先清洗掉 `apiKey`
- `source` 会按当前解析结果重写为 `config` 或 `env`
- 模型层先做 `mergeProviderModels()` / `mergeModelConfig()`，再做 `filterProviderModels()`

阶段一结束后，`resolveProjectProviders()` 会返回：

- `catalog`: 标准化后的全局 provider 目录
- `providers`: 当前解析结果中的生效 provider 集合

### 0.4 第二阶段：内部视图 -> 查询 API

这一阶段的目标是把内部结构变成前端和接口可直接消费的结果。

- `catalog()` 遍历 `state.catalog`，再通过 `toCatalogItem()` 叠加当前配置状态，返回 `ProviderCatalogItem[]`
- `list()` 返回内部 `providers` map
- `listPublicProviders()` 基于 `list()` 调用 `toPublicProvider()`，返回 `PublicProvider[]`
- `listModels()` 把所有生效 provider 下的模型拍平成 `PublicModel[]`
- `getPublicProvider()` 返回单个对外 provider 视图

需要特别注意：

- `catalog()` 面向目录视图，只覆盖 catalog 里存在的 provider
- `listPublicProviders()` 面向当前生效视图，包含 config-only provider
- `toPublicProvider()` 会把 `models` 从 `Record<string, Model>` 转成排序后的 `PublicModel[]`

### 0.5 第三阶段：默认模型选择与运行时初始化

这一阶段只有在真正需要模型调用时才会发生。

1. `getSelection()` 读取配置中的 `model` / `small_model`
2. `getDefaultModelRef()` 先校验配置里的 `provider/model`，失效时回退到 `listModels()` 的第一个模型，最后才回退到 `DEFAULT_MODEL_REF`
3. `getLanguage(model)` 根据 `model.providerID` 找到 provider，并按 `runtimeKey()` 做缓存
4. `getSDK(model)` 校验 key、计算 `baseURL` 和 `headers`，然后创建底层 AI SDK provider

`runtimeKey()` 当前由以下字段组成：

- `providerID`
- `modelID`
- `apiKey`
- `baseURL`
- `headers`

只要这些字段变化，SDK provider 和 `LanguageModel` 就会重新创建。

### 0.6 作用域与缓存

当前实现里，provider 配置是全局配置，运行时 SDK 缓存则是实例级缓存。

- 路由层通过 `Config.setProvider(Config.GLOBAL_CONFIG_ID, ...)` 写入 provider 配置
- `provider.ts` 读取时调用 `Config.get()`，默认也是 `GLOBAL_CONFIG_ID`
- 因此，前端配置好的 provider API key 会被所有 project 共享使用
- 但 `sdkState` / `languageState` 通过 `Instance.state()` 创建，缓存作用域仍然按项目实例隔离

这意味着当前模块的设计是：

- provider 配置全局共享
- provider 视图按请求重新解析
- 底层 SDK / `LanguageModel` 按实例和运行时参数缓存

本文档描述 `packages/fanfandeagent/src/provider` 当前实现出来的真实架构，而不是理想设计。结论都以以下代码为准：

- `packages/fanfandeagent/src/provider/provider.ts`
- `packages/fanfandeagent/src/provider/modelsdev.ts`
- `packages/fanfandeagent/src/config/config.ts`
- `packages/fanfandeagent/src/server/routes/projects.ts`
- `packages/fanfandeagent/src/session/prompt.ts`
- `packages/fanfandeagent/src/session/llm.ts`

## 1. 模块目标

`provider` 模块负责把三类输入合并成项目内可用的语言模型视图：

1. `models.dev` 提供的 provider/model catalog
2. 项目级 provider 配置
3. 当前 `Instance` 上下文里的环境变量

最终它要解决四件事：

1. 列出“当前项目可配置的 catalog provider”
2. 列出“当前项目已生效的 provider 与 model”
3. 把 `providerID/modelID` 解析成统一的 `Model`
4. 按模型信息初始化 AI SDK 的 `LanguageModel`

当前实现只覆盖语言模型能力，不覆盖 embedding、image、speech 等其他模型类型。

## 2. 文件职责

### `provider.ts`

核心聚合层，负责：

- 定义统一的数据结构：`ModelReference`、`Model`、`ProviderInfo`
- 定义给前端/API 暴露的 DTO：`PublicModel`、`PublicProvider`、`ProviderCatalogItem`
- 从 `models.dev` catalog 和项目配置生成“项目视图”
- 提供查询接口：`catalog()`、`listPublicProviders()`、`listModels()`、`getModel()` 等
- 初始化并缓存 AI SDK provider / language model

### `modelsdev.ts`

catalog 数据源层，负责：

- 定义 `models.dev` 的 `DevProvider` / `DevModel` schema
- 从 `${Global.Path.cache}/models.json` 读取缓存
- 在缓存不存在时从 `https://models.dev/api.json` 拉取远端数据
- 远端失败时回退到本地缓存
- 通过 `lazy.lazy()` 做进程内缓存

### `transform.ts`

当前为空文件，没有参与 provider 运行链路。

这点很重要：旧设计里提到的 provider transform、message transform、tool schema transform，在当前代码里并没有落在这个文件中。

## 3. 关键数据结构

### `ModelReference`

最小模型引用：

```ts
{
  providerID: string
  modelID: string
}
```

主要用于 session 输入与默认模型解析。

### `Model`

统一后的模型定义，字段来自 `models.dev` 与项目配置的合并结果，主要包括：

- `id`
- `providerID`
- `api.id`
- `api.url`
- `api.npm`
- `name`
- `family`
- `capabilities`
- `cost`
- `limit`
- `status`
- `options`
- `headers`
- `release_date`
- `variants`

注意：

- `headers` 仅存在于服务端内部 `Model`，不会出现在 `PublicModel`
- `options` / `variants` 会被保留，但当前 `provider` 运行时并不会主动消费这些字段去调整 AI SDK 调用参数

### `ProviderInfo`

项目内生效的 provider 视图：

```ts
{
  id: string
  name: string
  source: "env" | "config" | "custom" | "api"
  env: string[]
  key?: string
  options: Record<string, any>
  models: Record<string, Model>
}
```

注意：

- `key` 只在服务端内部存在，不应出现在 API 输出中
- schema 允许 `source = "custom"`，但当前 `applyProviderConfig()` 的最终结果实际上只会产出 `"env"` 或 `"config"`；catalog 原始数据来自 `fromModelsDevProvider()` 时是 `"api"`

### Public DTO

#### `ProviderCatalogItem`

用于 `GET /api/projects/:id/providers/catalog`，只包含 provider 摘要，不包含模型详情。

#### `PublicProvider`

用于 `GET /api/projects/:id/providers` 和 `PUT /providers/:providerID` 返回值，包含：

- provider 基本信息
- provider 可用性
- 模型列表

#### `PublicModel`

等于 `Model - headers + available`。

## 4. 输入源与上下文

provider 模块不是全局单例配置，它依赖当前项目上下文。

### 4.1 models.dev catalog

来源：`ModelsDev.get()`

加载流程：

1. 先看进程内 lazy cache
2. 再看 `${Global.Path.cache}/models.json`
3. 本地没有时请求 `https://models.dev/api.json`
4. 请求成功后回写本地缓存
5. 请求失败时，如果本地缓存存在则回退到缓存

### 4.2 项目配置

来源：`Config.get()`

存储位置：SQLite 表 `project_configs`

provider 模块当前实际会读取这些字段：

- `provider`
- `model`
- `small_model`
- `enabled_providers`
- `disabled_providers`

### 4.3 环境变量

来源：`Env.all()`

这里不是直接读全局 `process.env`，而是读 `Instance.state()` 内隔离后的环境副本。这样并行测试或多项目实例之间不会互相污染。

## 5. 架构总览

```text
models.dev(api/cache)
        |
        v
  fromModelsDevProvider()
        |
        v
   catalogMap()
        |
        +------------------+
        |                  |
        v                  v
  Config.get()         Env.all()
        \                  /
         \                /
          v              v
       resolveProjectProviders()
                |
                +--> catalog()
                +--> listPublicProviders()
                +--> listModels()
                +--> getModel()
                +--> getLanguage()
```

## 6. Provider 解析规则

### 6.1 哪些 provider 会进入“项目生效列表”

核心入口：`resolveProjectProviders()`

处理步骤：

1. 用 `catalogMap()` 生成 catalog provider 映射
2. 读取项目配置与当前实例环境变量
3. 将 `catalog` 中的 provider ID 与 `config.provider` 中的 provider ID 合并去重
4. 用 `enabled_providers` / `disabled_providers` 过滤
5. 对每个 provider 调用 `applyProviderConfig()`

### 6.2 `enabled_providers` / `disabled_providers`

`isProviderAllowed()` 的规则非常直接：

- 若设置了 `enabled_providers`，则只有名单内 provider 可以继续
- 若 provider 出现在 `disabled_providers` 中，则直接排除

### 6.3 `applyProviderConfig()` 的行为

它负责把 catalog provider 和项目配置 provider 合成一个 `ProviderInfo`。

#### 创建基底 provider

- 如果 catalog 中存在该 provider，则克隆 catalog 版本
- 如果 catalog 中不存在、但项目配置中存在，则创建一个 config-only provider

config-only provider 的初始值：

```ts
{
  id: providerID,
  name: providerConfig?.name ?? providerID,
  source: "custom",
  env: providerConfig?.env ?? [],
  options: {},
  models: {},
}
```

但注意，这个 `"custom"` 只是创建时的临时值。只要 `applyProviderConfig()` 成功返回，最终又会被改成：

- `source: "config"`，如果有显式 provider 配置
- `source: "env"`，如果没有显式配置、但能从环境变量拿到 key

#### provider 进入结果集的前提

当前实现中的 `configured` 条件为：

```ts
Boolean(providerConfig) || Boolean(resolveProviderApiKey(...))
```

这意味着：

- 仅仅存在于 `models.dev` catalog 中，不足以进入 `list()` 结果
- 只要项目配置里出现了该 provider，即使没有 API key，也会进入结果
- 如果没有项目配置，但环境变量里有对应 key，也会进入结果

#### API Key 优先级

`resolveProviderApiKey()` 的顺序是：

1. `providerConfig.options.apiKey`
2. `provider.env` 定义的环境变量，按顺序找第一个非空字符串

#### 对外暴露前的 options 清洗

`sanitizeProviderOptions()` 会把 `options.apiKey` 移除，只保留其他选项。

因此：

- 内部运行时用 `provider.key`
- API 返回与缓存 key 计算不会把 `apiKey` 放在 `provider.options` 中暴露出去

## 7. Model 合并规则

### 7.1 基础来源

模型最终来自两类来源：

1. `models.dev` catalog 中已有的 model
2. 项目配置 `provider.models[modelID]` 中定义的 model override 或纯自定义 model

### 7.2 `createBaseModelFromConfig()`

当某个 model 只存在于项目配置里、不存在于 catalog 时，provider 模块会用配置直接构建一个 `Model`。

这允许创建“自定义 provider + 自定义 model”的组合，只要项目配置里把必要字段填出来。

### 7.3 `mergeModelConfig()`

合并顺序如下：

1. 如果 catalog 已有该 model，以 catalog model 为 base
2. 否则用 `createBaseModelFromConfig()` 建 base
3. 再叠加项目配置中的 model override

字段规则：

- `api.id` 优先 `modelConfig.id`，否则沿用 base，再否则用 `modelID`
- `api.url` 优先级：
  1. `modelConfig.provider.api`
  2. `providerConfig.api`
  3. `providerConfig.options.baseURL`
  4. `base.api.url`
- `api.npm` 优先级：
  1. `modelConfig.provider.npm`
  2. `providerConfig.npm`
  3. `base.api.npm`
  4. `@ai-sdk/openai`
- `options` 与 `headers` 是浅合并
- `capabilities`、`cost`、`limit` 是按字段回退，不是整对象替换

### 7.4 whitelist / blacklist

在所有 model 合并结束后，再应用 provider 级过滤：

1. 若 `whitelist` 非空，只保留白名单中的 model ID
2. 若 `blacklist` 非空，从当前结果里移除黑名单 model ID

### 7.5 可用性判断

当前只有 provider 级可用性，没有 model 级可用性探测。

`isAvailable(provider)` 的规则：

- 有 API key，则可用
- 或者 `provider.env.length === 0`，也视为可用

结果：

- 某个 provider 一旦被判定可用，则它下面所有 `PublicModel.available` 都为 `true`
- 当前没有真正调用 provider 做 health check

## 8. 排序规则

### Provider 排序

`sortProviders()`：

1. 按 `name.localeCompare`
2. 名称相同再按 `id`

### Model 排序

`sortModels()`：

1. 按 `name`
2. 再按 `providerID`
3. 最后按 `id`

因此 `getDefaultModelRef()` 里的“第一个模型”并不是配置写入顺序，而是排序后的第一个模型。

## 9. 对外导出能力

### 9.1 `catalog()`

返回 `ProviderCatalogItem[]`。

特点：

- 只遍历 `state.catalog`
- 因此只包含 `models.dev` catalog 中存在的 provider
- 纯 config-only 的自定义 provider 不会出现在这里

每项会额外附带：

- `configured`
- `available`
- `apiKeyConfigured`
- `baseURL`
- `modelCount`

### 9.2 `listPublicProviders()`

返回当前项目真正生效的 provider 列表，即 `list()` 结果转成 `PublicProvider[]`。

这里会包含：

- 有显式配置的 catalog provider
- 仅通过环境变量激活的 catalog provider
- 纯 config-only 自定义 provider

### 9.3 `listModels()`

把当前生效 provider 下的所有模型平铺成 `PublicModel[]`。

### 9.4 `getPublicProvider(providerID)`

读取当前项目里的单个生效 provider，不存在则返回 `undefined`。

### 9.5 `getModel(providerID, modelID)`

返回内部 `Model`。

异常行为：

- provider 不存在时抛 `ProviderModelNotFoundError`
- model 不存在时也抛 `ProviderModelNotFoundError`
- 两种情况都会用 `fuzzysort` 给出最多 3 条候选建议

### 9.6 `getSelection()`

直接返回配置中的：

```ts
{
  model?: string
  small_model?: string
}
```

### 9.7 `getDefaultModelRef()`

默认模型解析顺序：

1. 读取 `config.model`
2. 若格式合法且模型确实存在，则直接返回
3. 否则回退到 `listModels()` 排序后的第一个模型
4. 若当前项目没有任何生效模型，则回退到硬编码默认值：

```ts
{
  providerID: "deepseek",
  modelID: "deepseek-reasoner",
}
```

注意：这个默认值只是兜底引用，不保证当前项目真的配置了 DeepSeek。

## 10. AI SDK 初始化

### 10.1 缓存层次

provider 模块有两层运行时缓存，都挂在 `Instance.state()` 上：

- `sdkState: Map<string, SDKProvider>`
- `languageState: Map<string, LanguageModel>`

这意味着缓存作用域是当前项目实例，而不是进程全局。

### 10.2 缓存 key

`runtimeKey()` 由以下字段组成：

- `providerID`
- `modelID`
- `apiKey`
- `baseURL`
- `headers`

只要这些字段变化，provider / language model 都会重新创建。

### 10.3 `getSDK(model)`

步骤：

1. 根据 `model.providerID` 找到项目内生效的 provider
2. 如果 provider 不存在，抛 `ProviderInitError`
3. 如果 provider 需要 key（`env.length > 0`）但没拿到 key，抛 `ProviderInitError`
4. 命中缓存则直接返回
5. 计算 `baseURL = provider.options.baseURL ?? model.api.url`
6. 读取 `headers = model.headers`
7. 构造底层 SDK provider

当前构造分支只有两个：

- `model.api.npm === "@ai-sdk/deepseek"` 或 `provider.id === "deepseek"`
  - 使用 `createDeepSeek()`
- 其他全部走
  - `createOpenAI({ name: provider.id, apiKey, baseURL, headers })`

也就是说，当前实现本质上支持：

1. DeepSeek 专有分支
2. 其他一切 OpenAI-compatible provider

### 10.4 `getLanguage(model)`

流程：

1. 调 `getSDK(model)`
2. 执行 `sdk.languageModel(model.api.id)`
3. 缓存并返回 `LanguageModel`

## 11. 与配置模块的协作

provider 模块本身不负责写数据库，写入由 `config.ts` 完成。

### 11.1 `Config.setProvider()`

`PUT /providers/:providerID` 最终调用它。

它不是全量替换，而是“增量合并”：

- 顶层字段基于旧配置和新配置合并
- `env` / `whitelist` / `blacklist` 若本次未传，保留旧值
- `models` 使用 `mergeDeep`
- `options` 使用 `mergeDeep`

所以连续两次 `PUT` 会保留上一次未覆盖掉的内容。测试里已经验证了第二次只改 `baseURL` 时，第一次写入的 `apiKey` 仍然存在。

### 11.2 `Config.removeProvider()`

删除 provider 配置时，会同时清理：

- `config.provider[providerID]`
- `config.model`，如果它以 `${providerID}/` 开头
- `config.small_model`，如果它以 `${providerID}/` 开头

### 11.3 `Config.setModelSelection()`

模型选择支持“保留、更新、清空”三种语义：

- 字段缺失：保留旧值
- 字段为字符串：更新为新值
- 字段为 `null`：清空该选择

## 12. 与 HTTP API 的真实关系

以下接口都在 `src/server/routes/projects.ts` 中落地。

### `GET /api/projects/:id/providers/catalog`

调用：

```ts
Provider.catalog()
```

返回 `ProviderCatalogItem[]`。

### `GET /api/projects/:id/providers`

调用：

```ts
{
  items: await Provider.listPublicProviders(),
  selection: await Provider.getSelection(),
}
```

### `GET /api/projects/:id/models`

调用：

```ts
{
  items: await Provider.listModels(),
  selection: await Provider.getSelection(),
}
```

### `PUT /api/projects/:id/providers/:providerID`

流程：

1. 用 `Config.Provider` 校验 payload
2. 调 `Config.setProvider()`
3. 再在项目上下文里调用 `Provider.getPublicProvider(providerID)`
4. 返回：

```ts
{
  provider: PublicProvider
  selection: {
    model?: string
    small_model?: string
  }
}
```

注意：

- 这里返回的是清洗后的 `PublicProvider`
- 不会暴露内部 `key`

### `DELETE /api/projects/:id/providers/:providerID`

流程：

1. 调 `Config.removeProvider()`
2. 返回 `providerID` 与更新后的 selection

### `PATCH /api/projects/:id/model-selection`

流程：

1. 用 `Config.ModelSelection` 校验 body
2. 若 `model` / `small_model` 非空，则先解析成 `provider/model`
3. 在项目上下文里调用 `Provider.getModel()` 校验目标模型确实存在
4. 校验通过后，调用 `Config.setModelSelection()`

因此这个接口不是盲写，它会拒绝当前项目里不可解析的模型引用。

## 13. 与 Session 运行链路的关系

### 13.1 默认模型选择

`src/session/prompt.ts` 中创建用户消息时：

```ts
model: input.model ?? await Provider.getDefaultModelRef()
```

所以如果调用方不传模型，session 会自动回落到 provider 模块计算出的默认模型。

### 13.2 运行时 LanguageModel 解析

`src/session/llm.ts` 中：

```ts
async function resolveLanguageModel(model: Provider.Model) {
  return Provider.getLanguage(model)
}
```

即 session 的真实执行链路已经统一走 provider 模块，而不是在 LLM 层手写不同 provider 的初始化逻辑。

## 14. 生命周期

provider 模块的生命周期不是“应用启动时一次性构造完成”，而是分成四段：

1. 模块加载时完成静态初始化
2. 进入项目上下文后按需生成 provider 视图
3. 首次真正调用模型时再实例化 SDK / `LanguageModel`
4. 进程结束后，仅保留持久化配置与 catalog cache

### 14.1 模块初始化阶段

这个阶段发生在相关模块被 import 时。

#### 数据库与配置基础设施

- `database/Sqlite.ts` 会打开本地 SQLite 文件 `agent_local_data.db`
- `config.ts` 会确保 `project_configs` 表存在

因此 provider 模块依赖的持久化基础设施在第一次使用前就已经准备好了。

#### provider 模块自身的静态准备

`provider.ts` 在加载时会完成以下准备，但不会真的初始化任何模型 SDK：

- 定义 `ModelReference`、`Model`、`ProviderInfo`、`PublicProvider` 等 schema
- 定义兜底默认模型 `DEFAULT_MODEL_REF`
- 定义两层实例级缓存：
  - `sdkState`
  - `languageState`

这两个缓存都通过 `Instance.state()` 创建，所以它们天然是“按项目实例隔离”的，而不是进程全局共享。

#### models.dev 数据源准备

`modelsdev.ts` 在模块加载阶段只会准备：

- 本地 cache 文件路径
- `readCache()` / `fetchRemote()` 逻辑
- lazy loader `DevData`

注意：

- 这一阶段不会立刻请求 `https://models.dev/api.json`
- 只有当 provider 模块第一次真正需要 catalog 时，才会触发加载

### 14.2 项目级实例化阶段

这个阶段的核心目标不是创建 SDK，而是生成“当前项目实际可见的 provider / model 视图”。

#### 触发入口

常见入口包括：

- `GET /api/projects/:id/providers/catalog`
- `GET /api/projects/:id/providers`
- `GET /api/projects/:id/models`
- `PATCH /api/projects/:id/model-selection` 的模型合法性校验
- session 创建或继续执行时的默认模型解析、模型解析

这些入口都会先通过 `withProjectContext()` 进入某个项目对应的 `Instance` 上下文。

#### 解析流程

真正的项目级装配入口是 `resolveProjectProviders()`，它每次都会重新走一遍解析流程：

1. 调 `catalogMap()`
2. `catalogMap()` 调 `ModelsDev.get()`
3. `ModelsDev.get()` 先尝试进程内 lazy cache，再尝试本地 `models.json`，最后才请求远端
4. `catalog` 数据通过 `fromModelsDevProvider()` 转成统一内部结构
5. 再读取项目配置 `Config.get()`
6. 再读取当前实例环境变量 `Env.all()`
7. 合并 catalog provider ID 与 `config.provider` 中的 provider ID
8. 应用 `enabled_providers` / `disabled_providers`
9. 对每个候选 provider 调用 `applyProviderConfig()`

#### `applyProviderConfig()` 在生命周期里的作用

它是 provider 项目级实例化的核心装配器，负责：

- 从 catalog provider 或 config-only provider 创建基础 `ProviderInfo`
- 解析 API key
- 清洗对外可见的 `options`
- 合并 provider 级配置
- 合并 model 级 override
- 应用 `whitelist` / `blacklist`

这一阶段完成后，provider 模块才拥有某个项目下真实生效的：

- `ProviderInfo`
- `Model`
- `PublicProvider`
- `PublicModel`

注意：

- 这一步生成的是“视图对象”，不是底层 AI SDK 实例
- 当前实现没有把整个 `resolveProjectProviders()` 的结果做长生命周期缓存，所以每次查询都会重新解析，确保配置变化能立即生效

### 14.3 配置持久化阶段

这个阶段决定 provider 生命周期能否跨软件重启继续存在。

#### 保存 provider 配置

当前前端配置 provider 时，会走：

```text
PUT /api/projects/:id/providers/:providerID
  -> Config.setProvider()
  -> writeProjectConfig()
  -> SQLite.project_configs
```

`Config.setProvider()` 的特点不是全量替换，而是增量合并：

- 顶层字段与旧配置合并
- `models` 深合并
- `options` 深合并
- `env` / `whitelist` / `blacklist` 若本次没传，则保留旧值

这意味着 provider 的配置状态是“可持续演进”的，而不是每次覆盖重建。

#### 保存模型选择

模型选择独立存放在同一份项目配置里：

- `model`
- `small_model`

`PATCH /model-selection` 在保存前会先调用 `Provider.getModel()` 做合法性校验，然后才通过 `Config.setModelSelection()` 写入数据库。

#### 删除 provider

删除 provider 时不仅会删除 `config.provider[providerID]`，还会同步清理指向该 provider 的：

- `config.model`
- `config.small_model`

所以 provider 生命周期里不会留下悬挂的模型引用。

### 14.4 运行时实例化阶段

这个阶段发生在 session 真正要调用模型时。

#### 第一步：解析默认模型或目标模型

在 `session/prompt.ts` 中：

- 如果调用方没传模型，先走 `Provider.getDefaultModelRef()`
- 进入 loop 后，再用 `Provider.getModel(providerID, modelID)` 把引用解析成内部 `Model`

此时拿到的仍然只是统一的模型描述对象，不是 SDK 实例。

#### 第二步：解析 `LanguageModel`

在 `session/llm.ts` 中，模型调用统一走：

```ts
Provider.getLanguage(model)
```

`getLanguage()` 的生命周期步骤是：

1. 根据 `model.providerID` 再取当前项目里的生效 provider
2. 计算 `runtimeKey`
3. 查 `languageState` 缓存
4. 若未命中，则调用 `getSDK(model)`
5. 调 `sdk.languageModel(model.api.id)` 创建 `LanguageModel`
6. 写回 `languageState`

#### 第三步：实例化底层 SDK provider

`getSDK(model)` 才是运行时真正创建底层 provider SDK 的地方。

步骤如下：

1. 校验 provider 是否仍存在于当前项目视图中
2. 如果该 provider 需要 key 但当前没有 key，抛 `ProviderInitError`
3. 计算最终 `baseURL`
4. 读取模型级 `headers`
5. 计算 `runtimeKey`
6. 查 `sdkState` 缓存
7. 未命中时按分支创建 SDK：
   - DeepSeek 走 `createDeepSeek`
   - 其他 provider 统一走 `createOpenAI`
8. 写回 `sdkState`

所以 provider 生命周期里真正“昂贵”的实例化动作只发生在第一次用到某组运行时参数时。

### 14.5 运行时缓存与失效

provider 模块目前有两层运行时缓存：

- `sdkState` 缓存底层 AI SDK provider
- `languageState` 缓存 `LanguageModel`

它们都以 `runtimeKey()` 为准。

`runtimeKey()` 由以下字段组成：

- `providerID`
- `modelID`
- `apiKey`
- `baseURL`
- `headers`

这意味着只要下面任一因素变化，下一次运行都会自然创建新实例，而不是误复用旧实例：

- 用户改了 API key
- 用户改了 baseURL
- model headers 变了
- providerID / modelID 变了

因此 provider 的运行时生命周期具备自动失效能力，不需要显式清空缓存。

### 14.6 进程结束与重启恢复

当进程结束时：

- `sdkState` 会丢失
- `languageState` 会丢失
- 当前 `Instance` 的环境变量快照会丢失

但以下数据会保留下来：

- `project_configs` 中的 provider 配置
- `project_configs` 中的模型选择
- `${Global.Path.cache}/models.json` 中的 catalog cache

所以下次启动后的真实恢复流程是：

1. 重新打开 SQLite
2. 重新读取项目配置
3. provider 查询时重新构建项目视图
4. 第一次真正发起模型调用时，再重新实例化 SDK / `LanguageModel`

换句话说：

- 配置生命周期是持久化的
- provider 视图生命周期是按请求重建的
- SDK 实例生命周期是按项目实例、按运行时参数缓存的

## 15. 当前实现与旧设计的差异

下面这些点在旧文档或早期设计里经常被写成“已支持”，但当前代码并不是这样：

### 15.1 `transform.ts` 当前未实现

- 没有 provider transform
- 没有 message transform
- 没有 tool schema transform

### 15.2 `Model.options` / `variants` 目前只保存，不参与实际推理参数组装

`session/llm.ts` 中原本与 `ProviderTransform` 相关的逻辑基本被注释掉了。当前真正传给 `streamText()` 的关键值是：

- `model: await Provider.getLanguage(model)`
- `temperature: 1`
- `tools: input.tools ?? {}`

所以不能把 `model.options`、`provider.options.timeout`、`variant` 等字段描述成“已经生效的运行时配置”。

### 15.3 `catalog()` 不返回纯自定义 provider

如果某个 provider 只存在于项目配置、不存在于 `models.dev` catalog：

- 它会出现在 `listPublicProviders()` / `listModels()`
- 它不会出现在 `catalog()`

### 15.4 `source = "custom"` 目前不是稳定对外状态

schema 里有 `"custom"`，但当前返回链路里几乎不会把它作为最终值暴露出去。

## 16. 安全边界

### 服务端内部可见

- `ProviderInfo.key`
- `Model.headers`

### API 对外可见

- `PublicProvider` 不含 `key`
- `PublicModel` 不含 `headers`

### 仍然需要注意

项目配置仍然写入本地 SQLite；当前实现不是加密存储，也不是多租户隔离的密钥管理方案。

## 17. 最小回归验证

与当前 provider 行为最相关的现有测试是：

```powershell
cd C:\Projects\fanfande_studio
bun test packages/fanfandeagent/Test/server.api.test.ts
```

如需做类型检查：

```powershell
cd C:\Projects\fanfande_studio
bunx tsc -p packages/fanfandeagent/tsconfig.json --noEmit
```

`server.api.test.ts` 中已经覆盖了以下关键行为：

- `providers/catalog` 可返回 catalog provider
- `PUT /providers/:providerID` 会增量合并配置
- `GET /providers` / `GET /models` 会反映最新生效状态
- `PATCH /model-selection` 会保存合法模型选择
- `DELETE /providers/:providerID` 会清空关联的模型选择
