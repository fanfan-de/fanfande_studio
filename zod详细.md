# Zod 核心类型详解：`ZodType`、`ZodObject`、`ZodRawShape`

---

## 一、`ZodType` —— 万物之祖

### 1.1 它是什么

`ZodType` 是 Zod 库中 **所有 schema 类型的抽象基类**。无论你用 `z.string()`、`z.number()`、`z.object()`、`z.array()` 还是其他任何方法创建的 schema，其底层都是 `ZodType` 的子类实例。

### 1.2 源码中的定义（简化版）

```typescript
abstract class ZodType<
  Output = any,         // parse 之后输出的 TS 类型
  Def extends ZodTypeDef = ZodTypeDef,  // schema 内部定义描述
  Input = Output        // parse 之前接受的输入类型
> {
  // ====== 核心方法 ======
  parse(data: unknown): Output;
  safeParse(data: unknown): SafeParseReturnType<Input, Output>;
  parseAsync(data: unknown): Promise<Output>;
  safeParseAsync(data: unknown): Promise<SafeParseReturnType<Input, Output>>;

  // ====== 组合/变换方法 ======
  optional(): ZodOptional<this>;
  nullable(): ZodNullable<this>;
  array(): ZodArray<this>;
  or<T extends ZodTypeAny>(option: T): ZodUnion<[this, T]>;
  and<T extends ZodTypeAny>(incoming: T): ZodIntersection<this, T>;
  transform<NewOut>(fn: (arg: Output) => NewOut): ZodEffects<this, NewOut>;
  default(def: Output): ZodDefault<this>;
  refine(check: (data: Output) => boolean, message?: string): ZodEffects<this>;
  pipe<T extends ZodTypeAny>(target: T): ZodPipeline<this, T>;

  // ====== 类型推断辅助 ======
  _output: Output;   // 虚拟属性，仅用于类型推断
  _input: Input;     // 虚拟属性，仅用于类型推断
}
```

### 1.3 三个泛型参数详解

```typescript
ZodType<Output, Def, Input>
```

| 泛型参数 | 含义 | 示例 |
|---|---|---|
| `Output` | `parse()` 成功后返回的 TS 类型 | `z.string()` → `Output = string` |
| `Def` | schema 内部的定义结构（一般用户不关心） | 包含 checks、typeName 等元信息 |
| `Input` | 接受的输入类型（有 `transform` 时与 Output 不同） | 通常与 Output 相同 |

**当 Input ≠ Output 的场景：**

```typescript
const schema = z.string().transform((s) => s.length);
// Input  = string   （输入必须是字符串）
// Output = number   （输出变成了数字）

type I = z.input<typeof schema>;   // string
type O = z.output<typeof schema>;  // number
```

### 1.4 常见别名

```typescript
// 在 Zod 源码中
type ZodTypeAny = ZodType<any, any, any>;
type Schema = ZodType;  // z.Schema 就是 z.ZodType 的别名
```

### 1.5 继承树全览

```
z.ZodType (抽象基类)
  │
  ├── z.ZodString          → z.string()
  ├── z.ZodNumber          → z.number()
  ├── z.ZodBigInt          → z.bigint()
  ├── z.ZodBoolean         → z.boolean()
  ├── z.ZodDate            → z.date()
  ├── z.ZodSymbol          → z.symbol()
  ├── z.ZodUndefined       → z.undefined()
  ├── z.ZodNull            → z.null()
  ├── z.ZodVoid            → z.void()
  ├── z.ZodAny             → z.any()
  ├── z.ZodUnknown         → z.unknown()
  ├── z.ZodNever           → z.never()
  │
  ├── z.ZodArray           → z.array()
  ├── z.ZodObject          → z.object()          ← 重点
  ├── z.ZodTuple           → z.tuple()
  ├── z.ZodRecord          → z.record()
  ├── z.ZodMap             → z.map()
  ├── z.ZodSet             → z.set()
  │
  ├── z.ZodUnion           → z.union()
  ├── z.ZodDiscriminatedUnion → z.discriminatedUnion()
  ├── z.ZodIntersection    → z.intersection()
  │
  ├── z.ZodEnum            → z.enum()
  ├── z.ZodNativeEnum      → z.nativeEnum()
  ├── z.ZodLiteral         → z.literal()
  │
  ├── z.ZodOptional        → .optional()
  ├── z.ZodNullable        → .nullable()
  ├── z.ZodDefault         → .default()
  │
  ├── z.ZodEffects         → .transform() / .refine()
  ├── z.ZodLazy            → z.lazy()
  ├── z.ZodPipeline        → .pipe()
  ├── z.ZodBranded         → .brand()
  └── z.ZodCatch           → .catch()
```

### 1.6 典型使用场景

#### 场景 1：函数参数接受任意 schema

```typescript
function validateAndLog<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.parse(data);
  console.log("Validated:", result);
  return result;
}

// 全部 OK
validateAndLog(z.string(), "hello");              // T = string
validateAndLog(z.number(), 42);                    // T = number
validateAndLog(z.object({ a: z.string() }), obj); // T = { a: string }
```

#### 场景 2：递归类型定义

```typescript
interface TreeNode {
  value: string;
  children: TreeNode[];
}

// 必须显式声明类型为 z.ZodType<TreeNode>，否则 TS 无法推断递归
const treeSchema: z.ZodType<TreeNode> = z.lazy(() =>
  z.object({
    value: z.string(),
    children: z.array(treeSchema),
  })
);
```

#### 场景 3：配合 `z.infer` 提取类型

```typescript
const schema = z.string().min(1).max(100);
type MyString = z.infer<typeof schema>; // string

// z.infer 的定义其实就是：
type infer<T extends z.ZodType> = T["_output"];
```

---

## 二、`ZodRawShape` —— 对象的"骨架描述"

### 2.1 它是什么

`ZodRawShape` 是一个 **类型别名**（不是类），用来描述传给 `z.object()` 的那个参数的结构：

```typescript
type ZodRawShape = {
  [k: string]: ZodTypeAny;
};
```

翻译成大白话：**一个普通的 JS 对象，key 是字符串，value 是任意 Zod schema**。

### 2.2 它不是运行时的东西

这一点很重要——`ZodRawShape` **纯粹存在于 TypeScript 类型层面**，它在编译后的 JavaScript 中不存在。它的唯一作用是在类型系统中做**约束和推断**。

```typescript
// 这就是一个符合 ZodRawShape 的值
const shape = {
  name: z.string(),
  age: z.number(),
  isActive: z.boolean(),
};

// 验证：
type Check = typeof shape extends z.ZodRawShape ? "✅" : "❌"; // "✅"
```

### 2.3 它和 `z.object()` 的关系

```typescript
// z.object 的函数签名（简化）：
function object<T extends ZodRawShape>(shape: T): ZodObject<T>;
```

你传进去的 `shape` 参数就必须满足 `ZodRawShape` 约束：

```typescript
// ✅ 合法
z.object({
  name: z.string(),       // value 是 ZodString（ZodTypeAny 的子类）
  age: z.number(),        // value 是 ZodNumber（ZodTypeAny 的子类）
});

// ❌ 不合法 —— value 不是 Zod schema
z.object({
  name: "hello",          // TS Error: string 不是 ZodTypeAny
  age: 42,                // TS Error: number 不是 ZodTypeAny
});
```

### 2.4 为什么需要它

因为 `ZodObject` 的泛型参数需要一个类型约束。如果没有 `ZodRawShape`，TypeScript 就无法知道泛型 `T` 应该长什么样：

```typescript
// ZodObject 的类定义（简化）
class ZodObject<T extends ZodRawShape> extends ZodType<...> {
  shape: T;
  // ...
}
```

`ZodRawShape` 告诉 TypeScript："`T` 必须是一个 key-value 映射，其中 value 都是 Zod schema"。

### 2.5 与相关类型的对比

```typescript
// ZodRawShape —— 描述 schema 的"形状定义"
type ZodRawShape = { [k: string]: ZodTypeAny };

// 示例
const shape: ZodRawShape = {
  name: z.string(),     // value 是 Zod schema
  age: z.number(),      // value 是 Zod schema
};

// 对应的 parse 输出类型 —— 描述实际数据的形状
type OutputType = {
  name: string,         // value 是普通 TS 类型
  age: number,          // value 是普通 TS 类型
};
```

它们之间的映射关系：

```
ZodRawShape                    Output Type
─────────────                  ─────────────
{ name: z.ZodString }    →    { name: string }
{ age: z.ZodNumber }     →    { age: number }
{ ok: z.ZodBoolean }     →    { ok: boolean }
{ items: z.ZodArray<z.ZodString> }  →  { items: string[] }
```

---

## 三、`ZodObject` —— 对象 schema 的具体实现

### 3.1 它是什么

`ZodObject` 是 `ZodType` 的一个**具体子类**，专门用于定义和验证 **JavaScript 对象**的结构。它是你日常使用最频繁的 Zod 类型之一。

### 3.2 源码定义（简化版）

```typescript
class ZodObject<
  T extends ZodRawShape,                              // 字段定义
  UnknownKeys extends UnknownKeysParam = "strip",      // 未知 key 的处理策略
  Catchall extends ZodTypeAny = ZodTypeAny,            // catchall schema
  Output = objectOutputType<T, Catchall, UnknownKeys>, // 输出类型
  Input = objectInputType<T, Catchall, UnknownKeys>    // 输入类型
> extends ZodType<Output, ZodObjectDef<T, UnknownKeys, Catchall>, Input> {

  // ====== 获取 shape ======
  get shape(): T;

  // ====== 字段操作 ======
  keyof(): ZodEnum<...>;
  pick<Mask>(mask: Mask): ZodObject<Pick<T, keyof Mask>>;
  omit<Mask>(mask: Mask): ZodObject<Omit<T, keyof Mask>>;
  partial(): ZodObject<{ [k in keyof T]: ZodOptional<T[k]> }>;
  deepPartial(): ZodObject<...>;
  required(): ZodObject<{ [k in keyof T]: deoptional<T[k]> }>;
  extend<Augmentation extends ZodRawShape>(aug: Augmentation): ZodObject<T & Augmentation>;
  merge<Incoming extends AnyZodObject>(other: Incoming): ZodObject<...>;

  // ====== 未知 key 处理 ======
  strip(): ZodObject<T, "strip">;
  strict(): ZodObject<T, "strict">;
  passthrough(): ZodObject<T, "passthrough">;
  catchall<C extends ZodTypeAny>(schema: C): ZodObject<T, UnknownKeys, C>;
}
```

### 3.3 创建方式

```typescript
const userSchema = z.object({
  name: z.string(),
  age: z.number().int().positive(),
  email: z.string().email(),
  role: z.enum(["admin", "user"]),
});

// typeof userSchema 的完整类型：
// z.ZodObject<{
//   name: z.ZodString;
//   age: z.ZodNumber;
//   email: z.ZodString;
//   role: z.ZodEnum<["admin", "user"]>;
// }>
```

### 3.4 独有方法详解

这些方法是 `ZodObject` **独有的**，在基类 `ZodType` 上不存在：

#### `.pick()` / `.omit()` — 选取/排除字段

```typescript
const userSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
  password: z.string(),
});

// 只保留 name 和 email
const publicUser = userSchema.pick({ name: true, email: true });
// → z.ZodObject<{ name: z.ZodString; email: z.ZodString }>

// 去掉 password
const safeUser = userSchema.omit({ password: true });
// → z.ZodObject<{ id: z.ZodNumber; name: z.ZodString; email: z.ZodString }>
```

#### `.partial()` / `.required()` — 全部可选/全部必填

```typescript
const schema = z.object({
  name: z.string(),
  age: z.number(),
});

const partialSchema = schema.partial();
// 等价于：z.object({ name: z.string().optional(), age: z.number().optional() })
// 输出类型：{ name?: string; age?: number }

const requiredSchema = partialSchema.required();
// 又变回：{ name: string; age: number }

// 也可以只对部分字段操作
const partialAge = schema.partial({ age: true });
// → { name: string; age?: number }
```

#### `.extend()` — 添加新字段

```typescript
const baseSchema = z.object({
  name: z.string(),
});

const extendedSchema = baseSchema.extend({
  age: z.number(),
  email: z.string().email(),
});
// → { name: string; age: number; email: string }

// 也可以覆盖已有字段的类型
const overridden = baseSchema.extend({
  name: z.number(),  // name 从 string 变成 number
});
```

#### `.merge()` — 合并两个 ZodObject

```typescript
const schemaA = z.object({ name: z.string() });
const schemaB = z.object({ age: z.number() });

const merged = schemaA.merge(schemaB);
// → { name: string; age: number }
```

> ⚠️ `.merge()` vs `.extend()` 的区别：`.merge()` 接受另一个 `ZodObject`，`.extend()` 接受一个原始的 shape 对象。

#### `.keyof()` — 获取所有 key 的枚举

```typescript
const userSchema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string(),
});

const keySchema = userSchema.keyof();
// 等价于：z.enum(["name", "age", "email"])

keySchema.parse("name");   // ✅
keySchema.parse("phone");  // ❌ 报错
```

#### 未知 key 处理策略

```typescript
const schema = z.object({ name: z.string() });
const data = { name: "Alice", extra: "field" };

// strip（默认）：移除未知 key
schema.parse(data);
// → { name: "Alice" }          ← extra 被移除

// strict：遇到未知 key 就报错
schema.strict().parse(data);
// → 抛出 ZodError              ← 因为有 extra

// passthrough：保留未知 key
schema.passthrough().parse(data);
// → { name: "Alice", extra: "field" }  ← extra 被保留

// catchall：用指定 schema 验证所有未知 key 的值
schema.catchall(z.number()).parse({ name: "Alice", score: 100 });
// → { name: "Alice", score: 100 }   ← score 被 z.number() 验证通过
```

### 3.5 访问内部 shape

```typescript
const userSchema = z.object({
  name: z.string(),
  age: z.number(),
});

// 获取 shape 对象
const shape = userSchema.shape;
// shape.name → z.ZodString 实例
// shape.age  → z.ZodNumber 实例

// 可以用来做动态操作
for (const [key, fieldSchema] of Object.entries(shape)) {
  console.log(`${key}: ${fieldSchema._def.typeName}`);
}
// 输出：
// name: ZodString
// age: ZodNumber
```

---

## 四、三者的关系图

```
                     类型系统层面（纯 TS 类型）
                    ┌─────────────────────────┐
                    │     ZodRawShape          │
                    │  { [k: string]: ZodTypeAny }  │
                    │                         │
                    │  描述 "对象的字段定义     │
                    │   长什么样"              │
                    └────────────┬────────────┘
                                 │
                                 │ 作为泛型约束
                                 ▼
  ┌──────────────────────────────────────────────────┐
  │                  ZodType<Output, Def, Input>      │
  │              （抽象基类，所有 schema 的根）         │
  │                                                    │
  │  提供通用能力：                                     │
  │  parse / safeParse / optional / nullable /          │
  │  array / transform / refine / pipe / ...            │
  └──────────────────────┬───────────────────────────┘
                         │
                         │ 继承
                         ▼
  ┌──────────────────────────────────────────────────┐
  │          ZodObject<T extends ZodRawShape>          │
  │           （具体子类，专门处理对象）                 │
  │                                                    │
  │  继承了 ZodType 的所有能力，额外提供：              │
  │  pick / omit / partial / required / extend /        │
  │  merge / keyof / strip / strict / passthrough /     │
  │  catchall / shape                                   │
  └──────────────────────────────────────────────────┘
```

---

## 五、实战串联示例

把三者放在一个实际场景中理解：

```typescript
import { z } from "zod";

// ==============================
// 1️⃣ ZodRawShape（类型层面）
// ==============================
// 下面这个对象字面量的类型就满足 ZodRawShape
// 即 { [k: string]: ZodTypeAny }
const userShape = {
  id: z.number().int().positive(),
  name: z.string().min(1).max(50),
  email: z.string().email(),
  createdAt: z.date().default(() => new Date()),
};

// ==============================
// 2️⃣ ZodObject（运行时对象）
// ==============================
// z.object() 接收一个 ZodRawShape，返回一个 ZodObject
const userSchema = z.object(userShape);
// 类型：z.ZodObject<typeof userShape>

// ZodObject 独有的方法
const createUserSchema = userSchema.omit({ id: true, createdAt: true });
// → { name: string; email: string }

const updateUserSchema = userSchema.partial().required({ id: true });
// → { id: number; name?: string; email?: string; createdAt?: Date }

// ==============================
// 3️⃣ ZodType（作为泛型约束）
// ==============================
// 写一个通用工具函数，用 ZodType 约束参数
function safeValidate<T>(
  schema: z.ZodType<T>,    // ← 接受任意 Zod schema
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error.message };
}

// 可以传入 ZodObject
safeValidate(userSchema, { id: 1, name: "Alice", email: "a@b.com" });

// 也可以传入 ZodString、ZodNumber 等任何 schema
safeValidate(z.string().uuid(), "550e8400-e29b-41d4-a716-446655440000");

// ==============================
// 4️⃣ 用 ZodRawShape 约束泛型函数
// ==============================
// 当你需要函数参数必须是 ZodObject 且保留字段类型推断时
function getFieldNames<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>
): (keyof T)[] {
  return Object.keys(schema.shape) as (keyof T)[];
}

const fields = getFieldNames(userSchema);
// fields 的类型：("id" | "name" | "email" | "createdAt")[]
// 值：["id", "name", "email", "createdAt"]
```

---

## 六、常见疑惑 FAQ

### Q1：`z.ZodType<T>` 和 `z.Schema<T>` 有区别吗？

**没有区别**，它们是别名关系：

```typescript
// Zod 源码中
export type Schema<T = any> = ZodType<T>;
```

### Q2：什么时候用 `z.ZodType`，什么时候用 `z.ZodObject`？

```typescript
// 当你的函数需要接受 **任意** schema 时 → 用 z.ZodType
function parse<T>(schema: z.ZodType<T>, data: unknown): T { ... }

// 当你的函数 **只接受对象 schema**、且需要操作字段时 → 用 z.ZodObject
function getKeys<T extends z.ZodRawShape>(schema: z.ZodObject<T>) { ... }
```

### Q3：`ZodRawShape` vs `ZodObject["shape"]` ？

```typescript
const s = z.object({ name: z.string() });

// s.shape 的值是 { name: ZodString实例 }
// typeof s.shape 满足 ZodRawShape

// 所以 ZodRawShape 是类型约束
// .shape 是运行时可以访问到的实际对象
```

### Q4：可以用 `ZodRawShape` 做运行时操作吗？

不行，它是纯类型层面的东西。运行时要操作字段，用 `schema.shape`：

```typescript
const schema = z.object({ name: z.string(), age: z.number() });

// 运行时遍历字段
Object.entries(schema.shape).forEach(([key, fieldSchema]) => {
  console.log(key, fieldSchema instanceof z.ZodString); 
});
```

---

## 七、一句话总结

| 概念                | 一句话                                                                                |
| ----------------- | ---------------------------------------------------------------------------------- |
| **`ZodType`**     | 所有 Zod schema 的**抽象基类**，提供 `parse`、`optional`、`transform` 等通用能力                    |
| **`ZodObject`**   | `ZodType` 的**子类**，专门验证对象，额外提供 `pick`/`omit`/`partial`/`extend` 等对象操作方法             |
| **`ZodRawShape`** | 一个**纯 TS 类型别名** `{ [k: string]: ZodTypeAny }`，用于约束 `ZodObject` 的泛型参数，确保传入的是合法的字段定义 |