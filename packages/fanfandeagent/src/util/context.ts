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
  export function create<T>(/*name: string*/) {
    // 实例化 Node.js 原生的存储容器
    const storage = new AsyncLocalStorage<T>()
    return {
      //逻辑上总是先provide，执行了这个fn，fn调用的异步方法总是能通过 context.use来获得这个T
      provide<R>(value: T, fn: () => R) {
        // storage.run 是核心黑魔法：
        // 它标记：在执行 fn 的过程中，全局可以访问到 storage 中的 value
        // fn 执行完毕后，上下文自动销毁，不会内存泄漏
        return storage.run(value, fn)
      },
      use() {
        //"如果调用时处于由 asyncLocalStorage.run() 或 asyncLocalStorage.enterWith() 初始化的异步上下文中，
        // 则返回当前存储的值，否则返回 undefined。"
        const result = storage.getStore()//
        if (!result) {
          // 强制检查，保证业务逻辑的健壮性
          throw new NotFound("")
        }
        return result //泛型T
      },
    }
  }
}
