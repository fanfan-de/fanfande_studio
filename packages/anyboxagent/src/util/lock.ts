/** 
这是一个用 TypeScript 实现的 **异步读写锁（Read-Write Lock）**，并且使用了 TS 5.2+ 引入的 **Resource Management (`Disposable` / `using`)** 模式。

以下是对这段代码的详细分析，包括其工作原理、设计亮点以及潜在的风险。

### 1. 核心功能总结

这段代码实现了一个基于 `Map` 的锁管理器，支持针对不同 `key`（字符串资源标识符）的并发控制：
*   **读锁 (`read`)**：允许多个读取者同时进入，但必须没有活跃的写入者。
*   **写锁 (`write`)**：互斥锁，同一时间只允许一个写入者，且不允许有任何读取者。
*   **写者优先 (Writer Preference)**：为了防止“写饥饿”（Writer Starvation），如果有写入者在排队，新的读取请求会被阻塞，直到写入者完成。
*   **自动资源释放**：通过返回 `{ [Symbol.dispose]: ... }` 对象，配合 `using` 关键字可实现离开作用域自动解锁。

---

### 2. 代码逻辑详细分析

#### 状态管理 (`State`)
每个锁 (`key`) 维护以下状态：
*   `readers`: 当前活跃的读取者数量。
*   `writer`: 当前是否有活跃的写入者（布尔值）。
*   `waitingReaders`: 等待获取读锁的回调队列。
*   `waitingWriters`: 等待获取写锁的回调队列。

#### 获取读锁 (`read`)
*   **准入条件**：没有活跃的写入者 (`!lock.writer`) **并且** 没有等待中的写入者 (`lock.waitingWriters.length === 0`)。
    *   *注意*：这里体现了**强写者优先**策略。即使当前没有人在写，只要有一个人在**等**写，新的读者就必须排队。
*   **成功**：`readers++`，返回 Disposable 对象。
*   **失败**：将回调推入 `waitingReaders` 队列。

#### 获取写锁 (`write`)
*   **准入条件**：没有活跃的写入者 **并且** 没有活跃的读取者 (`readers === 0`)。
*   **成功**：`writer = true`，返回 Disposable 对象。
*   **失败**：将回调推入 `waitingWriters` 队列。

#### 调度中心 (`process`)
这是锁释放时调用的核心逻辑，决定谁下一个获得锁：
1.  **守卫检查**：如果当前还有活跃的写入者，或者还有活跃的读取者，则什么都不做（锁未完全释放）。
2.  **写者优先调度**：检查 `waitingWriters`。如果有，取出一个执行（唤醒一个写操作）。**注意：这里直接 return，意味着如果唤醒了写者，就不会唤醒读者。**
3.  **读者批量唤醒**：如果没写者等待，检查 `waitingReaders`。循环取出**所有**等待的读者并执行（因为读锁是共享的）。
4.  **内存回收**：如果没有任何活跃者和等待者，删除该 `key`，防止内存泄漏。

---

### 3. 设计亮点 (Pros)

1.  **写者优先 (Writer Preference)**：
    *   标准的读写锁容易导致写者饥饿（如果读请求源源不断，写者永远抢不到锁）。
    *   该实现通过在 `read()` 中检查 `waitingWriters.length` 以及在 `process()` 中优先调度 writer，有效地解决了这个问题。

2.  **支持 `using` (Explicit Resource Management)**：
    *   这是现代 TS/JS 的最佳实践。使用者不需要手动放在 `try...finally` 中调用 `release()`，代码更整洁且不易出错。

3.  **内存自动清理**：
    *   `process` 函数末尾的 `locks.delete(key)` 逻辑确保了不再使用的锁对象会被垃圾回收，适合处理动态生成的、数量巨大的 Key。

4.  **微任务安全性**：
    *   在 `process` 中，`nextWriter()` 和 `nextReader()` 被调用时，会同步执行队列中的回调。
    *   回调内部直接修改了 `lock.writer = true` 或 `lock.readers++`。这意味着状态变更是在同步流中完成的，避免了 Promise 异步解析带来的竞态条件（Race Conditions）。

---

### 4. 潜在风险与注意事项 (Cons & Risks)

#### 1. 死锁风险：重入性与写者优先
这是该实现最大的隐患。由于采用了**强写者优先**，**不支持可重入（Reentrancy）的读锁**可能会导致死锁。

**场景演示：**
1.  你是 **Reader A**，你获取了读锁 (`readers = 1`)。
2.  此时 **Writer B** 尝试获取写锁。
    *   `write` 发现 `readers > 0`，于是进入 `waitingWriters` 队列。
3.  **Reader A** 在持有锁的过程中，再次调用 `read()` (例如递归调用，或调用了另一个需要读锁的子函数)。
4.  **Reader A (第二次)** 检查准入条件：
    *   `!lock.writer` (True)
    *   `lock.waitingWriters.length === 0` (**False!** 因为 Writer B 在排队)。
5.  **结果**：Reader A 的第二次请求被放入 `waitingReaders` 等待 Writer B。Writer B 在等待 Reader A 的第一次请求释放。
    *   **死锁 (Deadlock)**。

**修复建议**：如果你的业务逻辑需要同一上下文多次获取读锁，需要引入“锁持有者ID”来识别重入，或者在 `read` 判断时放宽条件（但这会削弱写者优先）。

#### 2. 性能问题：`shift()` 操作
*   `waitingReaders.shift()` 和 `waitingWriters.shift()` 是 `O(N)` 操作（数组头部删除）。
*   如果有成千上万个并发等待者，这可能会成为性能瓶颈。
*   **改进**：对于高并发场景，可以使用自定义的链表实现的 Queue 来达到 `O(1)`。但在一般的业务逻辑锁中，数组通常足够快。

#### 3. 异常处理
*   虽然 `using` 块保证了 `dispose` 会被调用，但如果 `process` 内部逻辑出错（极低概率），可能会导致锁状态损坏。目前的实现比较健壮，没有复杂的外部依赖。

---

### 5. 使用示例

```typescript
// 假设这是在一个 async 函数中

// 场景 1: 读取数据
async function getData(id: string) {
  // 这里会阻塞直到获得读锁
  using lock = await Lock.read(id); 
  
  // 临界区：安全读取
  console.log("Reading...", id);
  await someDbOperation();
  
  // 离开作用域，lock[Symbol.dispose]() 被调用 -> readers--, process()
}

// 场景 2: 写入数据
async function updateData(id: string) {
  // 这里会阻塞直到所有读者离开，且没有前面的写者
  using lock = await Lock.write(id);
  
  // 临界区：独占写入
  console.log("Writing...", id);
  await saveToDb();
  
  // 离开作用域，lock[Symbol.dispose]() 被调用 -> writer=false, process()
}
```

### 总结
这段代码是一个**高质量、现代、线程安全（并发安全）**的读写锁实现。它正确处理了异步流，防止了写者饥饿，并利用了最新的语言特性。**唯一需要特别注意的是避免在持有读锁时再次请求读锁（重入死锁）**。
*/

const locks = new Map<
  string,
  {
    readers: number
    writer: boolean
    waitingReaders: (() => void)[]
    waitingWriters: (() => void)[]
  }
>()

function get(key: string) {
  if (!locks.has(key)) {
    locks.set(key, {
      readers: 0,
      writer: false,
      waitingReaders: [],
      waitingWriters: [],
    })
  }
  return locks.get(key)!
}

function process(key: string) {
  const lock = locks.get(key)
  if (!lock || lock.writer || lock.readers > 0) return

  // Prioritize writers to prevent starvation
  if (lock.waitingWriters.length > 0) {
    const nextWriter = lock.waitingWriters.shift()!
    nextWriter()
    return
  }

  // Wake up all waiting readers
  while (lock.waitingReaders.length > 0) {
    const nextReader = lock.waitingReaders.shift()!
    nextReader()
  }

  // Clean up empty locks
  if (lock.readers === 0 && !lock.writer && lock.waitingReaders.length === 0 && lock.waitingWriters.length === 0) {
    locks.delete(key)
  }
}

export async function read(key: string): Promise<Disposable> {
  const lock = get(key)

  return new Promise((resolve) => {
    if (!lock.writer && lock.waitingWriters.length === 0) {
      lock.readers++
      resolve({
        [Symbol.dispose]: () => {
          lock.readers--
          process(key)
        },
      })
    } else {
      lock.waitingReaders.push(() => {
        lock.readers++
        resolve({
          [Symbol.dispose]: () => {
            lock.readers--
            process(key)
          },
        })
      })
    }
  })
}

export async function write(key: string): Promise<Disposable> {
  const lock = get(key)

  return new Promise((resolve) => {
    if (!lock.writer && lock.readers === 0) {
      lock.writer = true
      resolve({
        [Symbol.dispose]: () => {
          lock.writer = false
          process(key)
        },
      })
    } else {
      lock.waitingWriters.push(() => {
        lock.writer = true
        resolve({
          [Symbol.dispose]: () => {
            lock.writer = false
            process(key)
          },
        })
      })
    }
  })
}



