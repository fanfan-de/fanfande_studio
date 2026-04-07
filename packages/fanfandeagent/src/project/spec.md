# Project Module Spec

## Overview
`project` 模块负责识别当前目录属于哪个项目，建立项目上下文，并为同一个目录提供稳定、隔离的运行实例。

它要解决的核心问题是：
- 这个目录属于哪个 project
- 这个 project 的边界在哪里
- 当前运行时该目录对应的上下文是什么
- 如何保证同一个目录只初始化一次
- 如何让别的模块安全地拿到当前项目上下文

## Core Concepts

### `ProjectInfo`
项目元数据，包含：
- `id`: 项目标识
- `worktree`: 项目的工作树边界,普通 Git 仓库里，worktree 基本就是仓库根目录。
- `vcs`: 版本控制类型，当前主要是 `git` 或未定义
- `name`: 可读名称
- `icon`: 项目图标信息
- `created` / `updated` / `initialized`: 时间戳
- `sandboxes`: 该项目关联的额外工作目录列表，主要对应 git worktree 等额外 workspace 根目录

### `Instance`
目录级上下文管理器。

它不是一个“普通对象”，而是一个围绕目录边界构建的运行时容器。  
设计目标很明确：
- 同一个目录只创建一份实例
- 进入实例后，调用方可以直接访问当前目录、工作树和项目元数据
- 不需要在每层函数里手动传 `directory`、`worktree`、`project`
- 不同目录之间的状态天然隔离

### `State`
实例级状态容器，采用“两层 Map”结构：
- 第一层：目录路径
- 第二层：状态初始化函数

它的目标是把“状态”绑定到“当前目录实例”上，而不是绑定到全局进程。

### `Context`
通过 `utilContext.createContextContainer` 提供的异步上下文。

它的作用是：
- 让 `Instance.directory`、`Instance.project` 这些 getter 只能在正确的上下文里读取
- 防止在错误的异步调用链里误用当前实例数据

## `Instance` API

### `Instance.provide(input)`
在指定目录的实例上下文里执行代码。

**作用**
- 第一次进入某个目录时，识别项目并创建上下文
- 缓存实例 Promise，避免重复初始化
- 在上下文中执行 `init` 和 `fn`

**设计目的**
- 把“目录识别 + 项目初始化 + 上下文切换”收敛成唯一入口
- 避免 CLI、HTTP、TUI 等不同入口各自重复写初始化逻辑
- 保证同一目录的实例生命周期一致，减少竞态和重复创建

**行为**
1. 读取 cache 中是否已有该目录实例
2. 如果没有，则调用 `Project.fromDirectory()` 识别 project
3. 构造 `Context`
4. 进入上下文后执行 `InstanceBootstrap()` 和可选 `input.init`
5. 最后在该上下文中执行 `input.fn`

### `Instance.state(init, dispose)`
注册一个和当前目录实例绑定的惰性单例。

**作用**
- 在当前目录下创建“只属于这个实例”的内存状态
- 相同目录、相同 `init` 会共享同一份状态
- 需要时可以提供 `dispose` 做收尾清理

**设计目的**
- 把运行态和持久态分开
- 避免全局变量污染多个项目目录
- 让临时缓存、队列、控制器等对象跟着实例生命周期走

### `Instance.directory`
读取当前实例的目录。

**作用**
- 获得当前运行上下文的根目录

**设计目的**
- 让依赖目录的模块不必手动接收参数
- 统一所有文件系统判断、日志和 session 归属的目录来源

### `Instance.worktree`
读取当前实例的工作树边界。

**作用**
- 获得当前项目允许操作的边界范围

**设计目的**
- 对 Git 项目和非 Git 项目提供统一边界概念
- 作为路径权限和安全判断的基准

### `Instance.project`
读取当前实例对应的项目元数据。

**作用**
- 直接拿到当前项目的 `ProjectInfo`

**设计目的**
- 让 session、provider、server 等模块共享同一份项目上下文
- 避免到处重复查数据库或重复识别项目

### `Instance.containsPath(filepath)`
判断一个绝对路径是否属于当前实例边界。

**作用**
- 判断路径是否在当前目录或工作树内

**设计目的**
- 防止把别的项目文件误认为当前项目文件
- 为文件读写、命令执行、工具调用提供安全边界

### `Instance.dispose()`
销毁当前目录实例。

**作用**
- 清理当前实例的状态
- 从实例缓存中移除当前目录
- 广播实例销毁事件

**设计目的**
- 让项目关闭、服务退出、目录切换时可以完整收尾

### `Instance.disposeAll()`
销毁所有已创建的目录实例。

**作用**
- 遍历所有缓存实例并依次销毁

**设计目的**
- 给进程退出和全局重置提供统一清理入口

## `bootstrap.ts`
`bootstrap.ts` 目前承担“实例首次创建后的初始化钩子”角色。

当前设计目标不是做很多事，而是把“初始化时机”先固定下来：
- 记录 `project.initialized`
- 保证内存中的 project 与数据库状态一致
- 为后续插件、监听器、文件监控、VCS 初始化预留位置

## File Responsibilities

### `project.ts`
- 主要导出：`ProjectInfo`、`fromDirectory()`、`list()`、`get()`、`update()`、`sandboxes()`、`setInitialized()`
- 负责从目录识别项目、维护 project 元数据、写入 SQLite、广播 project 事件

### `instance.ts`
- 主要导出：`Instance`
- 负责目录上下文管理、实例缓存、边界判断、实例销毁

### `state.ts`
- 主要导出：`GetOrCreate()`、`dispose()`
- 负责按目录隔离的实例状态容器

### `bootstrap.ts`
- 负责实例初始化钩子

## Main APIs

### `fromDirectory(directory: string)`
识别给定目录所属的项目，并返回：
```ts
{ project: ProjectInfo, sandbox: string }
```

执行流程：
1. 向上查找 `.git`
2. 如果找到了，计算项目 id、工作树和 sandbox
3. 如果没找到，返回 `global` 项目和根边界
4. 从数据库读取或创建 project 记录
5. 更新 `sandboxes` 和 `updated`
6. 广播 `project.updated`

### `Instance.provide(input)`
在指定目录上下文中执行函数。

推荐理解方式：
- `provide` 负责“进入项目”
- `fn` 负责“在项目里干活”
- `init` 负责“这个实例第一次创建时要做的初始化”

### `Instance.state(init, dispose)`
返回一个按当前目录隔离的状态单例。

### `Instance.containsPath(filepath)`
检查路径是否落在当前实例边界内。

## Server API 暴露面

`project` 模块当前通过 `server.ts` 中的 `app.route("/api/projects", ProjectRoutes())` 暴露给 HTTP 层，
同时也会被 `session` 路由复用来识别 session 归属的 project。为了避免概念混淆，这里区分“直接暴露的 project 服务”和“以 project 作为作用域的相关服务”。

### 直接暴露的 project 服务

- `GET /api/projects`
  - 对应 `Project.list()`
  - 返回当前已记录的 project 列表；读取前会执行项目归并和修复逻辑。
- `POST /api/projects`
  - 对应 `Project.fromDirectory(directory)`
  - 按目录识别 project，必要时创建或更新 `projects` 表记录，并返回 `ProjectInfo`。
- `GET /api/projects/:id`
  - 对应 `Project.get(id)`
  - 读取单个 project 元数据；不存在时返回 `PROJECT_NOT_FOUND`。
- `DELETE /api/projects/:id`
  - 先通过 `Project.get(id)` 校验 project 存在，再删除该 project、其 `project_configs` 和关联 sessions。
  - 这是 project 生命周期的 server 删除入口，但当前删除动作仍在 route 层编排，不是 `project.ts` 单独导出的删除 API(todo,待优化)。

### 以 project 为作用域暴露的相关服务

- `GET /api/projects/:id/sessions`
  - 先通过 `Project.get(id)` 校验 project 存在，再列出该 project 下的 sessions。
- `POST /api/projects/:id/sessions`
  - 先读取 project；
  - 当请求体传入 `directory` 时，再通过 `Project.fromDirectory(directory)` 校验该目录确实归属于当前 project；
  - 校验通过后创建 project-scoped session。
- `GET /api/projects/:id/providers/catalog`
- `GET /api/projects/:id/providers`
- `PUT /api/projects/:id/providers/:providerID`
- `DELETE /api/projects/:id/providers/:providerID`
- `GET /api/projects/:id/models`
- `PATCH /api/projects/:id/model-selection`
  - 这些接口属于 project 作用域下的 provider/model 配置服务。
  - 它们当前不会直接调用 `project.ts` 的业务方法，只会通过 `Project.get(id)` / `safeReadProject(id)` 把 project 作为前置校验和作用域边界。
- `POST /api/sessions`
  - 虽然路径不在 `/api/projects` 下，但内部会调用 `Project.fromDirectory(directory)`。
  - 这个接口的作用是先确保 session 归属的 project 已被识别和持久化，再创建 session。

### 当前未通过 server 直接暴露的 project 能力

- `Project.update()`
- `Project.sandboxes()`
- `Project.setInitialized()`
- `Instance.provide()`
- `Instance.state()`
- `Instance.dispose()` / `Instance.disposeAll()`

这些能力目前仍是 server 内部或模块内部能力，不作为独立 HTTP API 对外提供。

## Data Flow

### Storage
- project 元数据存储在 SQLite 的 `projects` 表中
- 运行态状态存储在内存中，按目录隔离

### Events
- `project.updated`: project 信息更新时广播
- `server.instance.disposed`: 实例销毁时广播

## Usage

```ts
import { Instance } from "#project/instance.ts"

await Instance.provide({
  directory: process.cwd(),
  async init() {
    // 这里只做首次创建时需要的初始化
  },
  async fn() {
    console.log(Instance.directory)
    console.log(Instance.worktree)
    console.log(Instance.project.id)
  },
})

const getState = Instance.state(() => ({ count: 0 }))
const state = getState()

if (Instance.containsPath("/path/to/file")) {
  // 这个路径属于当前项目边界
}
```

## Notes
1. 非 Git 项目使用 `id: "global"`，`worktree: "/"` 作为兜底边界。
2. `Instance` 依赖异步上下文，必须在 `provide()` 或已建立上下文的调用链中使用。
3. 状态清理是并行的，适合做实例退出时的收尾。
4. `bootstrap.ts` 是为后续初始化扩展预留的标准入口。

## 测试指令

与 `project` 相关的 server API 变更，至少执行：

```powershell
cd C:\Projects\fanfande_studio
bun test packages/fanfandeagent/Test/server.api.test.ts
```
