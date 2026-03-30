# Promise 全面解析

## 一、Promise 是什么？

Promise 是 JavaScript 中处理 **异步操作** 的一种机制。你可以把它理解为一个 **"承诺"**：

> "我现在还没有结果，但我**承诺**将来一定会给你一个结果（成功或失败）。"

---

## 二、Promise 的三种状态

```
                    resolve(value)
            ┌──────────────────────┐
            │                      ▼
      ┌──────────┐          ┌──────────┐
      │ pending  │          │fulfilled │  ✅ 成功（有了最终值）
      │ (等待中) │          └──────────┘
      └──────────┘
            │                      ▲
            │                      │
            └──────────────────────┘
                    reject(error)
                         │
                         ▼
                   ┌──────────┐
                   │ rejected │  ❌ 失败（有了错误原因）
                   └──────────┘
```

**关键规则：**
- 初始状态永远是 `pending`
- 状态只能从 `pending` → `fulfilled` 或 `pending` → `rejected`
- **一旦变化，不可逆转**（resolve 之后不能再 reject，反之亦然）

---

## 三、创建 Promise

```typescript
const p = new Promise<string>((resolve, reject) => {
    // 这个函数叫 "executor"，创建 Promise 时会【立即执行】
    
    // 做一些异步操作...
    
    // 成功时：
    resolve("成功的值")   // 👈 这个参数就是 Promise 最终返回的值
    
    // 失败时：
    reject(new Error("失败的原因"))  // 👈 这个参数就是 catch 捕获到的错误
})
```

### 🔑 你刚才领悟的核心点

```typescript
resolve(x)  →  x 就是 await / .then() 拿到的值
reject(e)   →  e 就是 catch 捕获到的错误
```

---

## 四、消费 Promise 的两种方式

### 方式一：`.then()` / `.catch()` 链式调用

```typescript
const p = new Promise<number>((resolve, reject) => {
    setTimeout(() => resolve(42), 1000)
})

p.then((value) => {
    console.log(value)  // 42 ← 就是 resolve 传入的那个值
}).catch((error) => {
    console.log(error)  // 如果 reject 了，走这里
}).finally(() => {
    console.log("不管成功失败，都会执行")
})
```

### 方式二：`async/await`（语法糖，本质一样）

```typescript
async function main() {
    try {
        const value = await p    // 42 ← 就是 resolve 传入的那个值
        console.log(value)
    } catch (error) {
        console.log(error)       // 如果 reject 了，走这里
    } finally {
        console.log("不管成功失败，都会执行")
    }
}
```

### 两种方式的对应关系

| `.then/.catch` | `async/await` |
|----------------|---------------|
| `.then(value => ...)` | `const value = await p` |
| `.catch(err => ...)` | `try/catch` 中的 `catch` |
| `.finally(() => ...)` | `try/catch` 中的 `finally` |

---

## 五、`.then()` 的链式调用（很重要）

`.then()` 本身也返回一个新的 Promise，所以可以链式调用：

```typescript
fetch("/api/user")
    .then(response => {
        return response.json()  // 返回值会被包装成新的 Promise
    })
    .then(data => {
        return data.name        // 继续传递
    })
    .then(name => {
        console.log(name)       // 最终拿到 name
    })
    .catch(err => {
        // 上面任何一步出错，都会走到这里
    })
```

等价的 `async/await` 写法：

```typescript
async function getUser() {
    const response = await fetch("/api/user")
    const data = await response.json()
    const name = data.name
    console.log(name)
}
```

你可以看到 `async/await` 让代码看起来像同步代码，更直观。

---

## 六、Promise 的静态方法

### `Promise.resolve()` / `Promise.reject()`

快速创建一个已完成/已拒绝的 Promise：

```typescript
const p1 = Promise.resolve(42)       // 直接成功，值为 42
const p2 = Promise.reject("出错了")   // 直接失败
```

### `Promise.all()` —— 全部成功才成功

```typescript
const results = await Promise.all([
    fetch("/api/user"),
    fetch("/api/posts"),
    fetch("/api/comments"),
])
// results = [userResponse, postsResponse, commentsResponse]
// ❗ 任何一个失败，整体就失败
```

```
    Promise1  ──────✅──┐
    Promise2  ────────✅─┤──→ 全部完成 → ✅ [结果1, 结果2, 结果3]
    Promise3  ──✅───────┘
    
    如果其中一个 ❌ → 整体立刻 ❌
```

### `Promise.allSettled()` —— 全部结束（不管成败）

```typescript
const results = await Promise.allSettled([
    Promise.resolve(1),
    Promise.reject("err"),
    Promise.resolve(3),
])

// results = [
//   { status: "fulfilled", value: 1 },
//   { status: "rejected", reason: "err" },
//   { status: "fulfilled", value: 3 },
// ]
```

### `Promise.race()` —— 谁先完成用谁的

```typescript
const fastest = await Promise.race([
    fetch("/api/server1"),
    fetch("/api/server2"),
    new Promise((_, reject) => setTimeout(() => reject("超时"), 5000))
])
// 哪个最先 resolve/reject，就用哪个的结果
```

### `Promise.any()` —— 谁先成功用谁的

```typescript
const firstSuccess = await Promise.any([
    fetch("/api/server1"),  // 可能失败
    fetch("/api/server2"),  // 可能失败
    fetch("/api/server3"),  // 成功了！
])
// 只要有一个成功就行，全部失败才算失败
```

### 对比总结

| 方法 | 成功条件 | 失败条件 |
|------|---------|---------|
| `Promise.all` | 全部成功 | 任一失败 |
| `Promise.allSettled` | 永远"成功"（返回所有结果） | 不会失败 |
| `Promise.race` | 第一个完成的成功了 | 第一个完成的失败了 |
| `Promise.any` | 任一成功 | 全部失败 |

---

## 七、常见模式

### 1. 将回调函数转为 Promise（Promisify）

```typescript
// 旧的回调风格
function readFile(path, callback) {
    fs.readFile(path, (err, data) => {
        callback(err, data)
    })
}

// 转为 Promise 风格
function readFileAsync(path): Promise<string> {
    return new Promise((resolve, reject) => {
        fs.readFile(path, (err, data) => {
            if (err) reject(err)    // 失败 → reject
            else resolve(data)      // 成功 → resolve
        })
    })
}

// 使用
const content = await readFileAsync("/tmp/file.txt")
```

### 2. 延迟函数

```typescript
function delay(ms: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, ms)  // ms 毫秒后调用 resolve（无参数，所以返回 void）
    })
}

await delay(2000)  // 等待 2 秒
console.log("2秒后执行")
```

### 3. 你之前看到的 Deferred 模式

```typescript
// 把 resolve/reject 的控制权交给外部
function createDeferred<T>() {
    let resolve: (value: T) => void
    let reject: (reason: any) => void
    
    const promise = new Promise<T>((res, rej) => {
        resolve = res   // 把 resolve 存到外部变量
        reject = rej    // 把 reject 存到外部变量
    })
    
    return { promise, resolve: resolve!, reject: reject! }
}

// 使用
const deferred = createDeferred<string>()

// 某处等待
const result = await deferred.promise

// 另一处触发
deferred.resolve("数据来了！")
```

这就是你之前那段代码的通用版本。

---

## 八、微任务队列（进阶理解）

Promise 的回调属于 **微任务（microtask）**，它的执行优先级高于 `setTimeout` 等宏任务：

```typescript
console.log("1")

setTimeout(() => console.log("2"), 0)

Promise.resolve().then(() => console.log("3"))

console.log("4")

// 输出顺序：1 → 4 → 3 → 2
```

```
执行顺序：
1. 同步代码：        "1"、"4"
2. 微任务（Promise）： "3"
3. 宏任务（setTimeout）："2"
```

---

## 九、回到你最初的代码

现在再看这段代码，应该完全清晰了：

```typescript
// 调用方
const message = await new Promise<MessageV2.WithParts>((resolve, reject) => {
    const callbacks = state()[sessionID].callbacks
    callbacks.push({ resolve, reject })
    // resolve 没有在这里被调用 → Promise 保持 pending
    // resolve 的"控制权"被存到了 callbacks 数组中
})
// ⏸️ 代码在这里挂起...

// -----------------------------------------------

// 某处消息到达时
const cb = state()[sessionID].callbacks.shift()
cb.resolve(incomingMessage)
//         └── 这个值就是上面 await 拿到的 message ✅

// ▶️ 上面的 await 恢复执行，message = incomingMessage
```

**本质就是：**
1. 创建 Promise → `pending` 状态
2. 把 `resolve` 函数存起来 → 让"别人"可以在未来某个时刻决定这个 Promise 的命运
3. 别人调用 `resolve(data)` → Promise 变为 `fulfilled`，`await` 返回 `data`

这就是 **"resolve 的参数就是 Promise 的返回值"** 这个核心概念在实际项目中的应用。