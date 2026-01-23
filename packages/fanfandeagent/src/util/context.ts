
import { AsyncLocalStorage } from "async_hooks"


export namespace Context {
  export class NotFound extends Error {
    constructor(public override readonly name: string) {
      super(`No context found for ${name}`)
    }
  }
  /**
   * 创建一个上下文容器，返回一个对象，包含 获得内容和
   * @param name 
   * @returns 
   */
  export function create<T>(name: string) {
    // 实例化 Node.js 原生的存储容器
    const storage = new AsyncLocalStorage<T>()
    return {
      use() {
        const result = storage.getStore()
        if (!result) {
             // 强制检查，保证业务逻辑的健壮性
          throw new NotFound(name)
        }
        return result
      },

      provide<R>(value: T, fn: () => R) {
        // storage.run 是核心黑魔法：
        // 它标记：在执行 fn 的过程中，全局可以访问到 storage 中的 value
        // fn 执行完毕后，上下文自动销毁，不会内存泄漏
        return storage.run(value, fn)
      },
    }
  }
}
