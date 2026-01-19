TypeScript 是 JavaScript 的超集，它通过引入静态类型系统，极大地增强了代码的可维护性和安全性。以下是 TypeScript 中最全的数据类型详解，涵盖了从基础到高级的所有核心类型
### 1. 基础原始类型 (Primitive Types)
这些是 JavaScript 中最基本的类型，TypeScript 完整继承并进行了增强。

| 类型            | 描述                      | 示例                                 |
| :------------ | :---------------------- | :--------------------------------- |
| **number**    | 所有的数字（整数、浮点数、十六进制等）     | `let age: number = 25;`            |
| **string**    | 文本数据，支持单引号、双引号和模板字符串    | `let name: string = "Agent";`      |
| **boolean**   | 布尔值，只有 `true` 和 `false` | `let isActive: boolean = true;`    |
| **bigint**    | 大整数（需在数字后加 `n`）         | `let bigNum: bigint = 100n;`       |
| **symbol**    | 唯一的、不可变的值，常用于对象键        | `let sym: symbol = Symbol("key");` |
| **null**      | 表示空值                    | `let n: null = null;`              |
| **undefined** | 表示未定义                   | `let u: undefined = undefined;`    |

---

### 2. 对象与集合类型 (Object & Collection Types)

*   **Array (数组)**: 限制数组中元素的类型。
    ```typescript
    let list: number[] = [1, 2, 3];
    let names: Array<string> = ["Alice", "Bob"]; // 泛型写法
    ```
*   **Tuple (元组)**: 已知元素数量和类型的数组。
    ```typescript
    let person: [string, number] = ["Alice", 30];
    // person = [30, "Alice"]; // 报错：类型不匹配
    ```
*   **Object (对象)**: 表示非原始类型。
    ```typescript
    let user: { name: string; id: number } = { name: "Agent", id: 1 };
    ```
*   **Enum (枚举)**: 为一组数值赋予友好的名称。
    ```typescript
    enum Role { Admin, User, Guest }
    let currentRole: Role = Role.Admin; // 实际值为 0
    ```

---

### 3. 特殊/高级类型 (Special Types)

*   **any (任意类型)**: 绕过类型检查，允许赋予任何值（建议少用）。
    ```typescript
    let data: any = 42;
    data = "hello"; // 不报错
    ```
*   **unknown (未知类型)**: 比 `any` 更安全。在对 `unknown` 类型进行操作前，必须进行类型检查或断言。
    ```typescript
    let value: unknown = "hello";
    // value.toUpperCase(); // 报错
    if (typeof value === "string") value.toUpperCase(); // OK
    ```
*   **void (无返回值)**: 通常用于没有返回值的函数。
    ```typescript
    function log(msg: string): void {
        console.log(msg);
    }
    ```
*   **never (永远不存在的值)**: 用于总是抛出异常或根本没有终点的函数。
    ```typescript
    function error(msg: string): never {
        throw new Error(msg);
    }
    ```

---

### 4. 组合与逻辑类型 (Type Composition)

*   **Union (联合类型)**: 表示值可以是多种类型之一。
    ```typescript
    let id: string | number;
    id = "A1"; // OK
    id = 101;  // OK
    ```
*   **Intersection (交叉类型)**: 将多个类型合并为一个。
    ```typescript
    type Admin = { privileges: string[] };
    type Employee = { name: string; startDate: Date };
    type SuperUser = Admin & Employee;
    ```
*   **Literal (字面量类型)**: 限制变量只能取特定的值。
    ```typescript
    let direction: "left" | "right" | "up" = "left";
    // direction = "down"; // 报错
    ```

---

### 5. 接口与别名 (Interface & Type Alias)

这是开发 Agent 或复杂系统时最常用的，用于定义“对象的形状”。

*   **Interface (接口)**: 专门用于定义对象结构，支持继承。
    ```typescript
    interface IAgent {
        name: string;
        readonly id: string; // 只读属性
        description?: string; // 可选属性
        think: (input: string) => void; // 方法类型
    }
    ```
*   **Type Alias (类型别名)**: 更加灵活，可以定义原始类型、联合类型等。
    ```typescript
    type Point = { x: number; y: number };
    type Callback = (data: string) => void;
    ```

---

### 6. 函数类型 (Function Types)

可以明确参数和返回值的类型。
```typescript
const add = (x: number, y: number): number => {
    return x + y;
};
```

---

### 总结与建议
如果你是在开发 **AI Agent**，你会频繁用到以下组合：
1.  **Interface**: 定义 Agent 的配置和状态。
2.  **Union Types**: 定义 Agent 可能处于的状态（如 `idle | thinking | acting`）。
3.  **Literal Types**: 定义工具调用的特定指令。
4.  **Generics (泛型)**: 编写可复用的数据处理器。
