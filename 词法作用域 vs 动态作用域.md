# 词法作用域 vs 动态作用域

## 一句话定义

| | 核心规则 |
|---|---|
| **词法作用域**（Lexical Scope） | 变量的归属，**写代码时就定了**（看代码结构） |
| **动态作用域**（Dynamic Scope） | 变量的归属，**运行时才知道**（看调用链） |

词法（Lexical）= 跟"文本书写位置"有关，所以也叫**静态作用域**。

---

## 用一个例子对比

```javascript
const x = "全局";

function outer() {
  const x = "outer 的";

  function inner() {
    console.log(x); // 关键：这里的 x 是谁？
  }

  return inner;
}

function another() {
  const x = "another 的";
  const fn = outer(); // 拿到 inner
  fn();               // 调用 inner
}

another();
```

### 词法作用域（JavaScript 实际采用的）

> `inner` **写在** `outer` 里面，所以 `inner` 中的 `x` 去 `outer` 里找。

```
输出: "outer 的"
```

查找链：**看代码嵌套结构**
```
inner → outer → 全局
```

### 如果是动态作用域（假设）

> `inner` 被 `another` **调用**，所以 `inner` 中的 `x` 去 `another` 里找。

```
输出: "another 的"
```

查找链：**看运行时调用栈**
```
inner → another → 全局
```

---

## 更直观的比喻

```
词法作用域 = 看"户籍"   → 你出生在哪个家庭，你的资源就从哪个家庭找
动态作用域 = 看"现住址" → 你现在住在谁家，就用谁家的资源
```

---

## 跟上一个话题的关系

这就是箭头函数 `this` 的原理——它采用**词法作用域**来决定 `this`：

```typescript
class MyClass {
  name = "Alice";

  doWork() {
    // 箭头函数写在 doWork 里面
    // 所以 this 就是 doWork 的 this（即 MyClass 实例）
    // 不管将来谁调用它
    const arrow = () => {
      console.log(this.name); // 永远是 "Alice"
    };

    setTimeout(arrow, 1000); // 即使是 setTimeout 调用，this 也不变
  }
}
```

而普通 `function` 的 `this` 类似**动态作用域**的思路——谁调用它，`this` 就是谁：

```typescript
class MyClass {
  name = "Alice";

  doWork() {
    const func = function () {
      console.log(this.name); // this 取决于调用方
    };

    setTimeout(func, 1000); // this 变成了 window / undefined
  }
}
```

---

## 哪些语言用哪种？

| 词法作用域（主流） | 动态作用域（少数） |
|---|---|
| JavaScript、TypeScript | Bash shell |
| Python、Java、C/C++ | Emacs Lisp |
| Go、Rust、几乎所有现代语言 | Perl（可选） |

**现代语言几乎全部使用词法作用域**，因为它可预测、容易推理。动态作用域只在少数脚本语言中存在。

---

## 一句话总结

> **词法作用域 = 看代码写在哪，就从哪找变量**。它的对立面是**动态作用域 = 看代码被谁调用，就从谁那找变量**。JavaScript/TypeScript 用词法作用域，箭头函数的 `this` 正是利用了这一点。