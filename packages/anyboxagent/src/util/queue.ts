export class AsyncQueue<T> implements AsyncIterable<T> {
  private queue: T[] = []
  private resolvers: ((value: T) => void)[] = []

  push(item: T) {
    const resolve = this.resolvers.shift()
    if (resolve) resolve(item)
    else this.queue.push(item)
  }

  async next(): Promise<T> {
    if (this.queue.length > 0) return this.queue.shift()!
    return new Promise((resolve) => this.resolvers.push(resolve))
  }

  async *[Symbol.asyncIterator]() {
    while (true) yield await this.next()
  }
}
/**
 * 异步任务并发控制器：
 * 启动 concurrency 个协程竞争消费 items 队列，确保资源受控且无空转。
 * 同时运行指定数量（concurrency）的异步任务，直到处理完数组中的所有项。
 * @param concurrency 
 * @param items 
 * @param fn 
 */
export async function work<T>(concurrency: number, items: T[], fn: (item: T) => Promise<void>) {
  //在内存中开辟一块连续空间（数组），存放所有任务引用
  const pending = [...items]
  await Promise.all(
    //相当于立即返回[Promise, Promise, Promise，。。。]
    Array.from({ length: concurrency }, async () => {
      while (true) {
        const item = pending.pop()
        if (item === undefined) return
        await fn(item)
      }
    }),
  )
}
