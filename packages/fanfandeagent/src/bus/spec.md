撰写 `Bus`（事件总线）模块的 Spec 时，重点在于**类型安全（Type Safety）**和**解耦逻辑**。在一个现代的 Bun/TypeScript 项目中，我们不希望使用模糊的字符串事件名，而是希望 AI 能够生成一个能够自动补全、具备负载（Payload）验证能力的通信中枢。

以下是为你设计的 **Bus 模块 Spec 规范**，你可以直接发给 AI：

---

# Spec: Typed Event Bus Module (Centralized Communication)

## 1. Context & Goal
I need a centralized **Event Bus** module to handle asynchronous communication between different services (e.g., `BunProc`, `UI`, `FileWatcher`). The implementation must be **strongly typed**, ensuring that every event name is mapped to a specific data structure (Payload).

## 2. Technical Stack
- **Runtime:** Bun
- **Language:** TypeScript
- **Pattern:** Observer / Publish-Subscribe
- **Validation (Optional):** Zod (for runtime event payload validation)

## 3. Core Requirements

### A. Event Schema Definition
- The bus must use a TypeScript interface/type to define all allowed events.
- Example structure:
  ```typescript
  type EventMap = {
    "package:installed": { pkg: string; version: string };
    "package:failed": { pkg: string; error: string };
    "system:ready": undefined;
  };
  ```

### B. Functional Requirements (API)
- **`emit<K>(event: K, payload: EventMap[K])`**: 
    - Trigger an event. 
    - If `payload` is `undefined` in the map, it should be optional.
- **`on<K>(event: K, handler: (payload: EventMap[K]) => void)`**: 
    - Subscribe to an event. 
    - Must return an "unsubscribe" function for easy cleanup.
- **`once<K>(event: K, handler: (payload: EventMap[K]) => void)`**: 
    - Subscribe to an event and trigger only once.
- **`off<K>(event: K, handler: (payload: EventMap[K]) => void)`**: 
    - Manually remove a listener.

### C. Advanced Features
- **Logging**: Use the project's standard `Log.create({ service: "bus" })` to log every event emission (event name and payload) for debugging.
- **Error Handling**: If a handler throws an error, it should be caught and logged without crashing the bus or other subscribers.
- **Async Support**: Handlers can be async, but the bus should not necessarily wait for them (fire and forget) unless specified.

## 4. Implementation Details (Vibe Requirements)
- **Namespace Pattern**: Export as `export namespace Bus`.
- **Internal Storage**: Use a `Map<string, Set<Function>>` to store listeners.
- **Type Inference**: Use Generic types `<K extends keyof EventMap>` to ensure IDE autocomplete works perfectly.

## 5. File Structure
```text
util/
└── bus.ts  # The Typed Event Bus implementation
```

---

### 如何在你的项目中使用这个 Spec 进行 Vibe Coding？

你可以把这段 Spec 粘贴给 AI，并加上你的项目特定要求。例如：

**你可以对 AI 说：**
> "请根据上面的 Spec 为我的项目实现 `bus.ts`。
> 1. 请参考我之前提供的 `Log` 模块进行日志记录。
> 2. 请在 `EventMap` 中先预设几个事件，比如 `bun:install-start` 和 `bun:install-success`，负载结构参考 `BunProc` 的参数。
> 3. 确保返回的订阅函数支持 `using` 关键字（如果适用）或者简单的 `() => void`。"

### 为什么这个 Spec 对你的项目很重要？

1.  **配合 BunProc**：当 `BunProc.install` 开始时，它可以 `Bus.emit('install:start', { pkg })`，你的 UI 进度条模块就可以自动开始转圈，而不需要在 `BunProc` 代码里写任何 UI 逻辑。
2.  **调试透明**：由于要求了日志记录，你可以在控制台清楚地看到系统内部的“神经信号”流动。
3.  **防止代码腐烂**：强类型约束保证了你以后修改事件名称或数据结构时，编译器会立即在所有订阅的地方报错，避免运行时崩溃。