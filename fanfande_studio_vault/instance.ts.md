我分析了 `src/project/instance.ts` 文件。这是 OpenCode 项目中**项目实例管理**的核心模块，负责管理当前工作目录的上下文、状态和生命周期。以下是详细分析：

## 1. 核心功能：项目实例上下文管理器

该模块通过**依赖注入（DI）和上下文管理**模式，为当前工作目录提供一致的运行时环境。主要职责包括：

- **目录上下文管理**：维护当前工作目录、工作树和项目信息
- **状态管理**：为每个目录创建隔离的状态存储
- **权限边界检查**：判断路径是否在项目边界内
- **生命周期管理**：实例的创建、提供和销毁

## 2. 代码结构分析

### 2.1 类型定义和存储
```typescript
interface Context {
  directory: string      // 当前工作目录
  worktree: string      // Git 工作树根目录（非 Git 项目为 "/"）
  project: Project.Info // 项目信息
}

const context = Context.create<Context>("instance") // 上下文容器
const cache = new Map<string, Promise<Context>>()   // 目录→上下文缓存
```

### 2.2 核心方法：`Instance.provide()`
这是模块中最重要的方法，实现了**目录感知的依赖注入**：

```typescript
async provide<R>(input: {
  directory: string;      // 目标目录
  init?: () => Promise<any>; // 初始化钩子
  fn: () => R;           // 要执行的函数
}): Promise<R>
```

**工作流程**：
1. 检查缓存中是否已有该目录的上下文
2. 若无，创建新上下文（调用 `Project.fromDirectory()` 获取项目信息）
3. 将上下文注入到执行环境中
4. 执行用户函数 `fn()`

### 2.3 属性访问器
提供当前上下文的同步访问：
- `Instance.directory`：当前工作目录
- `Instance.worktree`：Git 工作树根目录
- `Instance.project`：项目信息

### 2.4 路径边界检查：`containsPath()`
```typescript
containsPath(filepath: string): boolean
```
**逻辑**：
1. 检查路径是否在 `Instance.directory` 内
2. 检查路径是否在 `Instance.worktree` 内（非 Git 项目跳过）
3. 用于权限系统，判断是否需要请求 `external_directory` 权限

### 2.5 状态管理：`state()`
```typescript
state<S>(init: () => S, dispose?: (state: Awaited<S>) => Promise<void>): () => S
```
基于目录创建隔离的状态存储，通过 `State.create()` 实现。

### 2.6 生命周期管理
- `dispose()`：销毁当前实例，清理状态，发出事件
- `disposeAll()`：销毁所有缓存实例

## 3. 设计模式分析

### 3.1 单例模式（按目录）
- 每个目录有唯一的 `Instance` 上下文
- 通过 `cache` Map 实现目录到上下文的映射
- 确保同一目录的多次访问共享相同上下文

### 3.2 依赖注入模式
- 通过 `context.provide()` 注入上下文
- 用户代码在特定目录上下文中执行
- 支持初始化钩子（`init` 参数）

### 3.3 装饰器模式
`Instance.provide()` 类似装饰器，包装用户函数并提供上下文环境。

### 3.4 发布-订阅模式
通过 `GlobalBus.emit()` 发布实例销毁事件。

## 4. 在 OpenCode 架构中的角色

### 4.1 与 Bash 工具的关系
在 `bash.ts` 中使用的关键引用：
```typescript
// 获取当前目录
const cwd = params.workdir || Instance.directory

// 检查路径是否在项目内
if (!Instance.containsPath(normalized)) directories.add(normalized)
```

### 4.2 与权限系统的集成
`containsPath()` 方法决定何时需要请求 `external_directory` 权限：
- 路径在项目目录或工作树内 → 不需要额外权限
- 路径在外部 → 需要请求权限

### 4.3 与项目系统的关系
依赖 `Project.fromDirectory()` 获取项目信息，包括：
- 项目类型（Git、普通目录等）
- 工作树根目录
- 项目配置

### 4.4 与状态管理的关系
通过 `State.create()` 创建目录隔离的状态，用于：
- 会话状态存储
- 缓存数据
- 临时配置

## 5. 关键技术细节

### 5.1 工作树处理
- **Git 项目**：工作树为 Git 仓库根目录
- **非 Git 项目**：工作树设置为 `"/"`（Unix 根目录）
- **特殊处理**：当 `worktree === "/"` 时，`containsPath()` 跳过工作树检查，避免错误匹配

### 5.2 缓存策略
- 使用 `Map<string, Promise<Context>>` 缓存异步上下文
- 避免同一目录重复初始化
- 支持并发访问（Promise 确保单次初始化）

### 5.3 错误处理
- 使用 `iife()`（立即调用函数表达式）包装异步初始化
- 缓存 Promise 而不是结果，避免竞态条件
- `disposeAll()` 中使用 `.catch(() => {})` 忽略错误

## 6. 潜在问题和改进建议

### 6.1 内存管理
- **当前**：缓存无限增长，直到显式调用 `dispose()`
- **建议**：考虑 LRU 缓存或超时机制

### 6.2 错误恢复
- **当前**：初始化失败后，缓存中保留 rejected Promise
- **建议**：实现重试机制或从缓存中移除失败的 Promise

### 6.3 并发控制
- **当前**：同一目录的并发 `provide()` 调用共享同一 Promise
- **建议**：已良好处理，无需改进

### 6.4 路径规范化
- **当前**：依赖 `Filesystem.contains()` 进行路径比较
- **建议**：确保路径已规范化（无 `.`、`..`、重复分隔符）

## 7. 使用示例

### 7.1 基本使用
```typescript
// 在特定目录上下文中执行操作
await Instance.provide({
  directory: "/path/to/project",
  fn: () => {
    // 这里可以安全访问 Instance.directory 等
    console.log(Instance.directory)
    return someResult
  }
})
```

### 7.2 带初始化的使用
```typescript
await Instance.provide({
  directory: "/path/to/project",
  init: async () => {
    // 初始化数据库连接、加载配置等
  },
  fn: () => {
    // 执行主要逻辑
  }
})
```

## 8. 总结

`Instance` 模块是 OpenCode 的**上下文基石**，它：
1. **提供目录隔离的执行环境**：确保工具在正确的上下文中运行
2. **管理项目边界**：支撑权限系统的路径检查
3. **维护状态生命周期**：确保状态与目录实例同步销毁
4. **支持依赖注入**：简化工具和组件的上下文访问

这个设计体现了**关注点分离**原则：
- `Instance` 管理上下文和状态
- `Project` 提供项目信息
- `Tool` 在上下文中执行操作
- `Permission` 基于上下文进行安全检查

正是通过这种设计，Bash 工具能够安全地执行命令，并在需要时请求适当的权限。

您需要我进一步分析其他相关模块（如 `Project`、`State` 或 `Context`）吗？