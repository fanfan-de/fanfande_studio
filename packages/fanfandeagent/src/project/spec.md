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
- `worktree`: 项目的工作树边界
- `vcs`: 版本控制类型，当前主要是 `git` 或未定义
- `name`: 可读名称
- `icon`: 项目图标信息
- `created` / `updated` / `initialized`: 时间戳
- `sandboxes`: 该项目下的沙箱目录列表

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
