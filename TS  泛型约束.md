# TypeScript 泛型的三大约束作用

对，泛型可以约束这三个地方。逐个解释。

---

## 1. 约束参数

泛型最基本的用途——让参数类型"可变但受控"：

```typescript
function identity<T>(value: T): T {
  return value;
}

identity("hello"); // T 被推导为 string，参数必须是 string
identity(42);      // T 被推导为 number，参数必须是 number
```

**加上 `extends` 进一步收窄**：

```typescript
function getLength<T extends { length: number }>(item: T): number {
  return item.length;
}

getLength("hello");     // ✅ string 有 length
getLength([1, 2, 3]);   // ✅ array 有 length
getLength(42);          // ❌ number 没有 length
```

**多参数之间的关联约束**：

```typescript
function pick<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

const user = { name: "Alice", age: 30 };
pick(user, "name");   // ✅ K 被约束为 "name" | "age"
pick(user, "email");  // ❌ "email" 不在 keyof T 中
```

这里 `K extends keyof T` 表示第二个参数**依赖**第一个参数的类型。

---

## 2. 约束函数体中的对象

泛型在函数体内部**也是生效的**，但有一个关键限制：**你只能使用 `T` 确定满足的操作**。

### 能做什么

```typescript
function process<T extends { id: string; data: number[] }>(item: T) {
  // ✅ 编译器知道 T 一定有 id 和 data
  console.log(item.id);
  const sum = item.data.reduce((a, b) => a + b, 0);
  
  // ✅ 可以把 T 赋值给符合约束的变量
  const copy: { id: string } = item;
  
  // ✅ 可以创建新对象，类型由 T 推导
  const pair = { original: item, timestamp: Date.now() };
  // pair 的类型: { original: T; timestamp: number }
}
```

### 不能做什么

```typescript
function broken<T extends { id: string }>(item: T): T {
  // ❌ 不能凭空构造一个 T
  return { id: "new" };
  // 报错：{ id: string } is not assignable to T
  // 因为 T 可能有更多属性，你构造的对象可能缺少它们
}
```

**这是很多人踩的坑：** `T extends X` 意味着 T 是 X 的子类型，T 可能比 X 更具体。你不能用一个 X 冒充 T。

```typescript
// 举例说明为什么上面不行：
interface Admin { id: string; role: string; permissions: string[] }
// Admin extends { id: string }，但 { id: "new" } 显然不是一个合法的 Admin
```

---

## 3. 约束返回值

### 返回值类型跟随输入

```typescript
function wrap<T>(value: T): { wrapped: T } {
  return { wrapped: value };
}

const r1 = wrap("hello");  // 返回类型: { wrapped: string }
const r2 = wrap(42);       // 返回类型: { wrapped: number }
```

### 返回值类型是输入类型的变换

```typescript
function nullable<T>(schema: z.ZodType<T>): z.ZodType<T | null> {
  return schema.nullable();
}
// 输入 ZodType<string> → 返回 ZodType<string | null>
```

### 条件返回类型

```typescript
function parse<T extends "string" | "number">(
  type: T, 
  value: string
): T extends "string" ? string : number {
  if (type === "string") {
    return value as any;
  }
  return Number(value) as any;
}

const s = parse("string", "hello"); // 返回类型: string
const n = parse("number", "42");    // 返回类型: number
```

---

## 三者联动的完整例子

```typescript
function transform<
  TInput extends Record<string, unknown>,  // 约束参数1
  TKey extends keyof TInput                // 约束参数2（依赖参数1）
>(
  obj: TInput,                              // 参数被 TInput 约束
  key: TKey                                 // 参数被 TKey 约束
): TInput[TKey] {                           // 返回值被两者共同约束
  
  const value = obj[key];                   // 函数体内: value 的类型是 TInput[TKey]
  
  console.log(typeof value);                // ✅ 可以操作 value
  
  return value;                             // 返回类型精确匹配
}

const user = { name: "Alice", age: 30, active: true };

const name = transform(user, "name");     // 类型: string
const age = transform(user, "age");       // 类型: number  
const active = transform(user, "active"); // 类型: boolean
transform(user, "email");                 // ❌ 编译错误
```

---

## 总结

| 约束位置 | 作用 | 限制 |
|----------|------|------|
| **参数** | 让多个参数之间类型关联、收窄输入范围 | 无特殊限制 |
| **函数体** | 在内部安全地访问 T 上已知的属性/方法 | **不能凭空构造 T 的实例**（T 可能比约束更具体） |
| **返回值** | 让返回类型精确跟随输入类型变化 | 必须确保所有代码路径都返回兼容 T 的值 |

核心原则：**泛型是调用者决定的**，函数内部不知道 T 的完整形态，只知道它满足 `extends` 后的约束。