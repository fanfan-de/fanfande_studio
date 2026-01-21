这是一个非常棒的切入点！**TypeScript (TS) 和 C# 拥有同一位“生父”——Anders Hejlsberg**。

因此，你会发现它们的语法惊人地相似（比如类、接口、泛型、Async/Await）。但是，由于 TS 本质上是编译成 JavaScript (JS) 运行的，而 JS 是动态弱类型语言，所以**核心思维模式（Mental Model）**有巨大的差异。

以下是专门为 C# 开发者定制的对比指南：

---

### 1. 核心思维差异（最重要！）

#### A. 类型系统：名义类型 vs 结构化类型 (Nominal vs Structural)
这是 C# 开发者转 TS 最大的“坑”也是最大的“特性”。

*   **C# (名义类型)**: 哪怕两个类结构一模一样，只要名字不同，它们就是不同的类型。
*   **TS (结构化类型/鸭子类型)**: **只要长得像，就是同一个类型。**

```typescript
// TypeScript
class Person {
  name: string;
}

class Dog {
  name: string;
}

let p: Person;
p = new Dog(); // ✅ 在 TS 里这是合法的！因为 Dog 也有 name 属性，结构满足 Person 的要求。
```
**注意点**：在 TS 中，Interface（接口）更多用来定义“数据的形状（Shape）”，而不仅仅是类的契约。你可以直接把一个 JSON 对象赋值给一个 Interface，而不需要像 C# 那样去 `new` 一个实现了该接口的类。

#### B. 运行时类型：保留 vs 擦除 (Reified vs Erased)
*   **C#**: 泛型和类型信息在运行时是存在的（反射）。你可以做 `typeof(T)`。
*   **TS**: **类型检查只发生在编译时**。代码编译成 JS 后，所有的 Interface、Generic、Type 全部消失。

```typescript
// TypeScript
interface User { id: number }

function check(obj: any) {
    // ❌ 错误！运行时不存在 User 这个东西
    if (obj instanceof User) { ... } 
}
```
**注意点**：如果你需要在运行时检查类型，必须使用“类型守卫（Type Guard）”，即手动检查属性是否存在（比如 `if ('id' in obj)`）。

---

### 2. 语法速查表：C# vs TypeScript

| 特性 | C# | TypeScript | 区别与注意 |
| :--- | :--- | :--- | :--- |
| **变量声明** | `var`, `int`, `MyClass` | `const`, `let` (尽量别用 `var`) | TS 默认推荐用 `const`，变动才用 `let`。类型通常由推断得出。 |
| **基础类型** | `int`, `float`, `double`, `decimal` | `number` | TS 只有 `number` (64位浮点)，没有整型浮点之分。 |
| **字符串** | `$"Hello {name}"` | `` `Hello ${name}` `` | 模板字符串语法略有不同。 |
| **方法定义** | `public int Add(int a, int b)` | `add(a: number, b: number): number` | 类型写在冒号后面。 |
| **接口** | `interface IUser { ... }` | `interface User { ... }` | TS 社区习惯接口不加 "I" 前缀。 |
| **字典** | `Dictionary<string, int>` | `Record<string, number>` | 或 `{ [key: string]: number }`。 |
| **空值** | `null` | `null`, `undefined` | **大坑**。TS 里未初始化的变量是 `undefined`。 |
| **导入导出** | `using System;` / `public class` | `import ...` / `export class` | TS 基于 ES Modules。 |
| **构造函数** | `public MyClass() { }` | `constructor() { }` | 关键字不同。 |
| **Lambda** | `x => x + 1` | `x => x + 1` | 一模一样。 |

---

### 3. C# 开发者一定要掌握的 TS “黑魔法”

C# 没有这些东西，但它们是 TS 的精髓。

#### 1. 联合类型 (Union Types) `|`
变量可以是多种类型之一。
```typescript
let id: string | number;
id = 10;    // OK
id = "ABC"; // OK
```

#### 2. 交叉类型 (Intersection Types) `&`
把多个类型合并成一个。
```typescript
type Draggable = { drag: () => void };
type Resizable = { resize: () => void };

// UIWidget 必须同时拥有 drag 和 resize 方法
type UIWidget = Draggable & Resizable;
```

#### 3. 字面量类型 (Literal Types)
类型不仅可以是 `string`，还可以是具体的**值**。这在 C# 中通常用 Enum 实现。
```typescript
type Direction = "Left" | "Right" | "Up" | "Down";
let move: Direction = "Left"; // ✅
// let error: Direction = "Forward"; // ❌ 报错
```

#### 4. 工具类型 (Utility Types)
TS 允许你像操作函数一样操作类型。
```typescript
interface User {
  id: number;
  name: string;
  email: string;
}

// Partial<T> 自动把所有属性变为可选 (Optional)
type UpdateUserDto = Partial<User>; 
// 等同于 { id?: number; name?: string; email?: string; }

// Pick<T> 只取部分属性
type UserSummary = Pick<User, "id" | "name">;
```

---

### 4. 使用 TS 的注意点（避坑指南）

#### 1. `any` 是毒药
*   **C#**: `dynamic` 也就是偶尔用用。
*   **TS**: 初学者为了过编译，喜欢到处写 `: any`。**千万别这么做！** 这会让 TS 退化成纯 JS，失去了类型保护。
*   **建议**: 如果真的不知道类型，用 `unknown`（比 `any` 安全，因为它强迫你在使用前做检查）。

#### 2. `null` vs `undefined`
在 JS/TS 世界里，有两个“空”：
*   `undefined`: 变量声明了但没赋值，或者对象没有这个属性。
*   `null`: 只有你显式赋值为 null，它才是 null。
*   **建议**: 永远开启 `strictNullChecks: true`（在 tsconfig.json 中）。使用 `??` (空值合并运算符) 和 `?.` (可选链)，这俩 C# 也有，用法一样。

#### 3. `this` 的指向
C# 的 `this` 永远指向类实例。JS/TS 的 `this` 是根据**调用方式**动态决定的。
*   **现象**: 如果你把一个类的方法传给一个回调函数，`this` 可能会变成 `undefined` 或 `window`。
*   **解法**: 总是使用 **箭头函数** (`() => {}`) 来定义类的方法，或者在传参时使用 `.bind(this)`。

```typescript
class Handler {
  data = "Secret";
  
  // ❌ 传统写法，作为回调传递时 this 会丢失
  process() { console.log(this.data); }

  // ✅ 箭头函数，自动绑定 this（类似 C# 的闭包行为）
  processArrow = () => { console.log(this.data); }
}
```

#### 4. 比较运算符 `==` vs `===`
*   永远使用 `===` (严格相等) 和 `!==`。
*   `==` 会发生自动类型转换（例如 `0 == "0"` 为 true），这通常是 bug 的温床。

#### 5. 所有的数字都是浮点数
如果你在做高精度金融计算，不要直接用 TS 的 `number` 做加减乘除，会有精度丢失（0.1 + 0.2 !== 0.3）。这一点和 C# 的 `double` 一样，但 TS 没有原生的 `decimal` 或 `int`。需要引入 `decimal.js` 等库。

### 总结建议

作为 C# 开发者，你学习 TS 最大的优势是**OOP 概念**和**类型思维**。
你需要克服的最大障碍是：**不要指望运行时类型检查，要习惯“鸭子类型”，并学会利用 TS 强大的类型推导系统（Type Inference）来少写代码。**

上手第一步：把 `tsconfig.json` 里的 `"strict": true` 打开，这会让 TS 的严格程度接近 C#，让你更有安全感。