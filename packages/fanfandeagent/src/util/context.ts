
import { AsyncLocalStorage } from "async_hooks"

/**
 * 核心工具：异步上下文管理器 (Async Context Manager)
 * 
 * @description
 * 解决 Node.js 后端开发中的 "参数透传" (Prop Drilling) 问题。
 * 它利用 Node.js 底层的 async_hooks 机制，让数据跟随异步调用链自动传递。
 * 
 * 典型应用场景：
 * 1. Request Context: 在 Controller 层注入当前用户 (User)，在 Service/Dao 层直接获取。
 * 2. Trace ID: 在日志中自动携带请求 ID，无需手动传递。
 * 3. 事务管理: 在多个 Service 间隐式共享同一个数据库 Transaction 实例。
 */
export namespace Context {
    /**
   * 异常：上下文缺失错误
   * 
   * 设计意图：Fail Fast (快速失败)。
   * 如果开发者忘记在入口处调用 `provide`，或者在请求生命周期外调用了 `use`，
   * 程序应立即报错，而不是返回 undefined 导致后续出现难以排查的 "Cannot read property of undefined"。
   */
  export class NotFound extends Error {
    constructor(public override readonly name: string) {
      super(`No context found for ${name}`)
    }
  }
    /**
   * 工厂函数：创建一个新的上下文实例
   * 
   * @template T 上下文中存储的数据结构类型（提供 TypeScript 类型安全保障）
   * @param name 上下文名称，用于 Debug 和报错信息（例如 "UserContext"）
   */
  export function create<T>(name: string) {
    // 实例化 Node.js 原生的存储容器
    const storage = new AsyncLocalStorage<T>()
    return {
        /**
       * Consumer (消费者)：在深层业务逻辑中获取数据
       * 
       * @throws {NotFound} 严格模式：如果没有获取到数据，直接抛出异常。
       * @returns {T} 返回数据必定存在，不需要在使用侧判断 if (val) ...
       */
      use() {
        const result = storage.getStore()
        if (!result) {
             // 强制检查，保证业务逻辑的健壮性
          throw new NotFound(name)
        }
        return result
      },
      /**
       * Provider (提供者)：定义数据的作用域
       * 
       * @param value 本次调用链需要共享的数据
       * @param fn 业务逻辑闭包。只有在这个 fn 执行期间（包括它触发的所有异步操作），use() 才能读到数据。
       * @returns 返回 fn 的执行结果
       */
      provide<R>(value: T, fn: () => R) {
        // storage.run 是核心黑魔法：
        // 它标记：在执行 fn 的过程中，全局可以访问到 storage 中的 value
        // fn 执行完毕后，上下文自动销毁，不会内存泄漏
        return storage.run(value, fn)
      },
    }
  }
}
