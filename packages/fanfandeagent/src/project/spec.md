# Project 模块规范

## 概述
Project 模块负责管理代码项目（Git 或非 Git）的元数据、上下文隔离和状态生命周期。它为 AI Agent 提供当前工作目录的项目信息、沙箱边界和实例级状态管理。

## 核心概念

### ProjectInfo
项目元数据，包含：
- `id`: Git 项目的首次提交哈希；非 Git 项目为 `"global"`
- `worktree`: Git 工作树根目录；非 Git 项目为 `"/"`
- `vcs`: 版本控制系统（`"git"` 或未定义）
- `name`: 可读名称
- `icon`: 项目图标（URL/覆盖/颜色）
- `created`/`updated`/`initialized`: 时间戳
- `sandboxes`: 沙箱路径列表（每个 worktree 对应一个）

### Instance
目录上下文管理器，保证每个目录只有一个上下文实例。提供：
- `provide()`: 在指定目录上下文中执行函数，惰性初始化
- `directory`/`worktree`/`project`: 获取当前上下文的目录、工作树和项目信息
- `containsPath()`: 判断路径是否在当前项目边界内
- `state()`: 注册惰性状态单例，按目录和初始化函数隔离
- `dispose()`: 销毁当前实例及其所有状态

### State
实例级状态容器，采用两层 Map 结构：
- 第一层：目录路径 → 第二层 Map
- 第二层：初始化函数 → 状态条目（含 dispose 钩子）

### Context
通过 `utilContext.createContextContainer` 实现的异步上下文传递，确保 `Instance.directory` 等 getter 仅在正确的上下文中可用。

## 文件说明

### `project.ts`
- **主要导出**: `ProjectInfo` 类型、`fromDirectory()`、`list()`、`get()`、`update()`、`sandboxes()`、`setInitialized()`
- **功能**: 从目录检测项目信息（Git 或非 Git），管理项目元数据存储（SQLite），发送项目更新事件。

### `instance.ts`
- **主要导出**: `Instance` 对象
- **功能**: 提供目录上下文管理、状态注册、路径边界检查和实例销毁。

### `state.ts`
- **主要导出**: `GetOrCreate()`、`dispose()`
- **功能**: 实现按目录和初始化函数隔离的状态容器，支持异步清理。

### `bootstrap.ts`
- **当前为空**: 计划用于初始化全局子系统（插件、LSP、文件监听、VCS、快照等）。

## 主要 API

### `fromDirectory(directory: string)`
检测给定目录所属的项目，返回 `{ project: ProjectInfo, sandbox: string }`。逻辑：
1. 向上查找 `.git` 目录
2. 若找到，计算首次提交哈希作为 ID，获取工作树和沙箱路径
3. 若未找到，返回 `id: "global"`, `worktree: "/"`, `sandbox: "/"`
4. 从数据库读取或创建项目记录，更新沙箱列表
5. 广播 `project.updated` 事件

### `Instance.provide(input)`
在指定目录上下文中执行函数：
- 若目录首次访问，初始化项目上下文（调用 `fromDirectory`）
- 缓存上下文 Promise，避免重复初始化
- 在上下文中执行 `init`（可选）和 `fn`

### `Instance.state(init, dispose)`
返回一个函数，该函数在调用时返回当前目录下由 `init` 函数创建的状态单例。相同目录和相同 `init` 函数总是返回同一状态。

### `Instance.containsPath(filepath)`
检查路径是否在当前实例边界内：
- 首先检查是否在 `Instance.directory` 内
- 若 `worktree !== "/"`（即 Git 项目），再检查是否在 `Instance.worktree` 内
- 防止非 Git 项目误将全盘路径视为项目内

## 数据流与事件

### 存储
- 项目元数据存储在 SQLite 表 `projects` 中
- 状态存储在内存的 `recordsByKey` Map 中，按目录隔离

### 事件
- `project.updated`: 项目信息更新时通过 `GlobalBus` 广播
- `server.instance.disposed`: 实例销毁时广播

## 使用示例

```typescript
// 获取当前目录的项目信息
const { project, sandbox } = await fromDirectory(process.cwd())

// 在目录上下文中执行操作
await Instance.provide({
  directory: "/path/to/project",
  async init() { /* 初始化逻辑 */ },
  fn() {
    // 在此可安全使用 Instance.directory, Instance.project 等
    console.log(Instance.directory)
    return someResult
  }
})

// 注册实例状态
const getState = Instance.state(() => ({ count: 0 }))
const state = getState() // 每次调用返回同一对象

// 检查路径边界
if (Instance.containsPath("/path/to/file")) {
  // 文件属于当前项目
}
```

## 注意事项
1. 非 Git 项目共用 `id: "global"`，`worktree: "/"` 表示无工作树边界
2. `Instance` 方法依赖异步上下文，必须在 `provide` 或已建立上下文的调用链中使用
3. 状态清理是并行的，超时 10 秒会记录警告
4. 项目图标自动发现功能受 `Flag.FanFande_EXPERIMENTAL_ICON_DISCOVERY` 控制
5. 从全局项目迁移会话的功能暂未完全实现