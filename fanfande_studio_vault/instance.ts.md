这段代码是整个系统的 **项目实例管理器 (Instance Manager)**。

它的核心作用是为当前的执行环境提供上下文（Context），确保在某个特定项目目录下运行的代码能够方便地获取该项目的元数据（路径、Git 根目录等），并管理与该项目绑定的状态（State）和生命周期。

### 核心概念：上下文依赖注入 (Context Dependency Injection)

这段代码最关键的设计模式是使用了 `Context.create`（通常基于 Node.js 的 `AsyncLocalStorage`）。这使得你可以在 `Instance.provide` 的回调函数中，在任何深度的函数调用栈里直接访问 `Instance.directory`，而不需要像传递接力棒一样一层层传递参数。

---

### 详细功能拆解

#### 1. 类型定义与缓存
```typescript
interface Context {
  directory: string
  worktree: string    // Git 根目录或项目根目录
  project: Project.Info
}
// 创建上下文存储容器
const context = Context.create<Context>("instance")
// 缓存：Map<目录路径, Context的Promise>
const cache = new Map<string, Promise<Context>>()
```
*   **缓存设计**: `cache` 存储的是 `Promise<Context>` 而不是直接的 `Context` 对象。这是为了防止**缓存穿透**或**并发初始化**。如果两个请求同时到达同一个目录，它们会等待同一个 Promise，确保 `Project.fromDirectory` 只被执行一次。

#### 2. 核心入口 `provide`
```typescript
async provide<R>(input: { directory: string; init?: () => Promise<any>; fn: () => R }): Promise<R> {
  // 1. 检查缓存
  let existing = cache.get(input.directory)
  if (!existing) {
    // 2. 如果不存在，初始化新实例
    existing = iife(async () => {
      const { project, sandbox } = await Project.fromDirectory(input.directory)
      const ctx = {
        directory: input.directory,
        worktree: sandbox,
        project,
      }
      // 初始化钩子
      await context.provide(ctx, async () => {
        await input.init?.()
      })
      return ctx
    })
    cache.set(input.directory, existing)
  }
  const ctx = await existing
  // 3. 在上下文中运行目标函数 fn
  return context.provide(ctx, async () => {
    return input.fn()
  })
}
```
这是整个模块的**发动机**。
*   当你调用 `Instance.provide({ directory: "/app", fn: () => ... })` 时，它确保 `fn` 内部可以通过 `Instance.directory` 访问到 `"/app"`。
*   它实现了**懒加载 (Lazy Loading)**：只有当某个目录被请求时，才会去解析它的项目结构。

#### 3. 便捷访问器 (Getters)
```typescript
get directory() { return context.use().directory },
get worktree() { return context.use().worktree },
get project() { return context.use().project },
```
*   这些 Getters 是**上下文感知**的。
*   如果在 `Instance.provide` 外部调用它们，`context.use()` 可能会抛出错误，提示当前没有活跃的实例上下文。
*   在之前的 `session.prompt.ts` 代码中，`Instance.directory` 被频繁使用，正是因为 `prompt` 函数是运行在 `Instance.provide` 包裹的环境下的。

#### 4. 安全检查 `containsPath`
```typescript
containsPath(filepath: string) {
  if (Filesystem.contains(Instance.directory, filepath)) return true
  // 特殊处理：如果是非 Git 项目，Worktree 默认为 "/"，这会包含所有文件
  // 因此如果是 "/"，则忽略 Worktree 检查，防止权限逃逸
  if (Instance.worktree === "/") return false
  return Filesystem.contains(Instance.worktree, filepath)
}
```
*   用于权限控制（Security Guard）。
*   判断一个文件是否属于当前项目。逻辑是：文件在 **当前工作目录 (CWD)** 下，或者在 **Git 根目录 (Worktree)** 下，都算作项目内文件。

#### 5. 状态管理 `state`
```typescript
state<S>(init: () => S, dispose?: (state: Awaited<S>) => Promise<void>): () => S {
  return State.create(() => Instance.directory, init, dispose)
}
```
*   **Scoped State**: 这里的 `State.create` 第一个参数传入了一个 Getter `() => Instance.directory`。
*   这意味着创建的状态是**绑定到当前目录**的。
*   **回看 `session.prompt.ts`**:
    ```typescript
    const state = Instance.state(() => { ... })
    ```
    当你在 `/project-a` 下运行 Session 时，你拿到的是 A 项目的状态；在 `/project-b` 下运行时，拿到的是 B 的状态。这实现了多租户/多项目的状态隔离。

#### 6. 生命周期管理 `dispose`
```typescript
async dispose() {
  // 清理绑定到当前目录的所有 State
  await State.dispose(Instance.directory)
  // 从缓存移除
  cache.delete(Instance.directory)
  // 发送全局事件通知其他模块
  GlobalBus.emit(...)
}
```
*   当一个项目实例不再需要（例如用户关闭窗口，或者长时间不活动）时，调用此方法清理内存和资源。

---

### 总结

`Instance` 对象是这个 AI 编码助手后端的**核心上下文容器**。它解决了以下问题：

1.  **全局变量的替代品**: 避免了在每个函数签名里传递 `cwd` 和 `projectInfo`。
2.  **多例管理**: 服务器可以同时处理多个项目（多个目录），通过 `Context` 自动区分当前代码是为哪个项目运行的。
3.  **状态隔离**: 确保 A 项目的 Session 锁不会阻塞 B 项目。
4.  **资源生命周期**: 统一管理项目资源的初始化和释放。