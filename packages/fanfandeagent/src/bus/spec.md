# Bus 模块规范

## 概述

Bus 模块是 FanfandeAgent 中的事件总线系统，提供类型安全的事件发布/订阅机制。它支持基于项目实例的事件隔离和全局事件广播，用于组件间的松耦合通信。

## 模块结构

```
bus/
├── bus-event.ts      # 事件定义与注册表
├── global.ts         # 全局事件总线（跨实例）
├── project-bus.ts    # 项目实例事件总线
└── spec.md          # 本规范文档
```

## 核心概念

### 1. 事件定义 (Event Definition)
事件通过 `define()` 函数定义，包含：
- `type`: 事件类型（字符串字面量）
- `properties`: Zod 模式定义的事件负载结构

### 2. 事件注册表 (Event Registry)
所有定义的事件存储在全局注册表中，可通过 `payloads()` 生成所有事件的联合类型。

### 3. 实例状态 (Instance State)
每个项目实例拥有独立的事件订阅状态，确保事件隔离。

### 4. 全局总线 (Global Bus)
用于跨实例、进程间的简单事件通知。

## API 参考

### bus-event.ts

#### `define<Type extends string, Properties extends ZodType>(type: Type, properties: Properties): Definition`
定义一个新事件类型并注册到全局注册表。

**参数：**
- `type`: 事件类型标识符
- `properties`: Zod 模式定义的事件负载结构

**返回：** `Definition` 对象（包含 `type` 和 `properties`）

**示例：**
```typescript
const UserCreated = define("user.created", z.object({
  userId: z.string(),
  name: z.string(),
}));
```

#### `payloads(): ZodDiscriminatedUnion`
返回包含所有已注册事件的 Zod 判别联合类型。

### global.ts

#### `GlobalBus: EventEmitter`
全局事件发射器实例，类型定义：
```typescript
EventEmitter<{
  event: [{ directory?: string; payload: any }]
}>
```

### project-bus.ts

#### `InstanceDisposed: Definition`
预定义事件：实例销毁事件
- **类型:** `"server.instance.disposed"`
- **负载:** `{ directory: string }`

#### `publish<D extends Definition>(def: D, properties: z.output<D["properties"]>): Promise<void>`
发布事件到当前实例总线。

**参数：**
- `def`: 事件定义
- `properties`: 符合事件负载模式的对象

**流程：**
1. 构造事件负载 `{ type: def.type, properties }`
2. 通知匹配类型和通配符 (`*`) 的订阅者
3. 通过 `GlobalBus` 广播事件
4. 等待所有订阅者处理完成

#### `subscribe<D extends Definition>(def: D, callback: (event: Event<D>) => void): () => void`
订阅特定事件，返回取消订阅函数。

**参数：**
- `def`: 事件定义
- `callback`: 事件处理函数

**返回：** 取消订阅函数

#### `once<D extends Definition>(def: D, callback: (event: Event<D>) => "done" | undefined): void`
一次性订阅，回调返回 `"done"` 时自动取消订阅。

#### `subscribeAll(callback: (event: any) => void): () => void`
订阅所有事件（通配符订阅）。

#### `raw(type: string, callback: (event: any) => void): () => void`
底层订阅函数，直接使用事件类型字符串。

## 使用示例

### 1. 定义事件
```typescript
import { define } from "#bus/bus-event.ts";
import z from "zod";

const TaskStarted = define("task.started", z.object({
  taskId: z.string(),
  timestamp: z.number(),
}));

const TaskCompleted = define("task.completed", z.object({
  taskId: z.string(),
  result: z.string(),
  duration: z.number(),
}));
```

### 2. 发布事件
```typescript
import { publish } from "#bus/project-bus.ts";

// 在任务开始时发布事件
await publish(TaskStarted, {
  taskId: "task-123",
  timestamp: Date.now(),
});

// 在任务完成时发布事件
await publish(TaskCompleted, {
  taskId: "task-123",
  result: "success",
  duration: 1500,
});
```

### 3. 订阅事件
```typescript
import { subscribe, once, subscribeAll } from "#bus/project-bus.ts";

// 普通订阅
const unsubscribe = subscribe(TaskStarted, (event) => {
  console.log(`Task ${event.properties.taskId} started at ${event.properties.timestamp}`);
});

// 稍后取消订阅
unsubscribe();

// 一次性订阅
once(TaskCompleted, (event) => {
  console.log(`Task ${event.properties.taskId} completed`);
  return "done"; // 自动取消订阅
});

// 订阅所有事件
const unsubscribeAll = subscribeAll((event) => {
  console.log(`Event received: ${event.type}`);
});
```

### 4. 监听全局事件
```typescript
import { GlobalBus } from "#bus/global.ts";

GlobalBus.on("event", ({ directory, payload }) => {
  console.log(`Global event from ${directory}:`, payload.type);
});
```

## 事件生命周期

### 1. 注册阶段
- 事件通过 `define()` 定义并注册到全局注册表
- 注册表用于类型推导和验证

### 2. 订阅阶段
- 订阅者通过 `subscribe()`、`once()` 或 `subscribeAll()` 注册回调
- 订阅信息存储在实例状态中
- 每个实例拥有独立的订阅状态

### 3. 发布阶段
1. 构造类型安全的事件负载
2. 查找匹配的订阅者（精确匹配 + 通配符）
3. 同步执行所有订阅者回调
4. 通过 `GlobalBus` 广播到其他实例
5. 等待所有异步操作完成

### 4. 清理阶段
- 实例销毁时触发 `InstanceDisposed` 事件
- 通知所有通配符订阅者
- 清理实例状态

## 类型安全

### 事件类型推导
```typescript
// 事件负载的 TypeScript 类型
type TaskStartedEvent = {
  type: "task.started";
  properties: {
    taskId: string;
    timestamp: number;
  };
};

// 订阅时的类型检查
subscribe(TaskStarted, (event: TaskStartedEvent) => {
  // event.properties 自动推断类型
  const taskId = event.properties.taskId; // string
  const timestamp = event.properties.timestamp; // number
});

// 发布时的类型检查
publish(TaskStarted, {
  taskId: "123", // ✓ 正确
  timestamp: Date.now(), // ✓ 正确
  extraField: "value", // ✗ 类型错误
});
```

### Zod 模式验证
所有事件负载都通过 Zod 模式验证，确保运行时类型安全。

## 设计模式

### 1. 观察者模式 (Observer Pattern)
- 发布者与订阅者解耦
- 支持一对多通信

### 2. 中介者模式 (Mediator Pattern)
- Bus 作为中介者协调组件通信
- 减少组件间直接依赖

### 3. 单例模式 (Singleton Pattern)
- 每个实例拥有独立的 Bus 状态
- 全局注册表为单例

## 依赖关系

```typescript
// 内部依赖
import "#util/log.ts"      // 日志工具
import "#project/instance.ts" // 实例管理
import "#bus/bus-event.ts" // 事件定义
import "#bus/global.ts"    // 全局总线

// 外部依赖
import "zod"              // 模式验证
import "events"           // Node.js EventEmitter
```

## 最佳实践

### 1. 事件命名约定
- 使用点分隔的命名空间：`<domain>.<action>`
- 示例：`user.created`, `task.completed`, `server.started`

### 2. 负载设计原则
- 保持负载简洁，仅包含必要数据
- 使用基本类型或简单对象
- 避免嵌套过深的数据结构

### 3. 错误处理
- 订阅者应自行处理错误，避免影响其他订阅者
- 考虑使用 try-catch 包装回调逻辑

### 4. 性能考虑
- 避免在热路径中频繁发布事件
- 大量订阅者时考虑异步处理
- 及时取消不再需要的订阅

## 扩展指南

### 添加新事件类型
1. 在相关模块中定义事件
2. 确保类型名称唯一
3. 提供完整的 Zod 模式定义

### 自定义事件处理
1. 使用 `raw()` 函数进行底层操作
2. 扩展 `subscribeAll()` 进行事件监控
3. 集成到 `GlobalBus` 实现跨进程通信

### 测试策略
```typescript
// 单元测试示例
import { define, publish, subscribe } from "#bus/project-bus.ts";

const TestEvent = define("test.event", z.object({ value: z.string() }));

it("should publish and receive events", async () => {
  let receivedValue = "";
  
  subscribe(TestEvent, (event) => {
    receivedValue = event.properties.value;
  });
  
  await publish(TestEvent, { value: "test" });
  expect(receivedValue).toBe("test");
});
```

## 限制与注意事项

### 1. 内存管理
- 订阅者回调持有引用，可能造成内存泄漏
- 确保在组件销毁时取消订阅

### 2. 执行顺序
- 订阅者按注册顺序执行
- 通配符订阅者在精确匹配之后执行
- 所有订阅者执行完成前 `publish()` 不会返回

### 3. 错误传播
- 单个订阅者错误不会阻止其他订阅者执行
- 错误不会传播到发布者，需自行监控

### 4. 类型注册限制
- 事件必须在运行时注册才能使用 `payloads()`
- 动态事件定义需要额外处理

## 相关模块

### Instance 模块
- 提供实例状态管理
- 支持实例级事件隔离

### Log 模块
- 提供结构化日志
- 用于事件发布/订阅的调试

### Global 模块
- 提供跨实例通信基础
- 集成到全局事件流

---

**文档版本:** 1.0  
**最后更新:** 2025-03-17  
**维护者:** Bus 模块开发团队