import { realpathSync } from "fs"
import { chmod, mkdir, readFile, writeFile } from "fs/promises"
import { dirname, join, relative } from "path"

export namespace Filesystem {
  //检查路径 `p` 是否存在。
  export const exists = (p: string) =>
    Bun.file(p)
      .stat()
      .then(() => true)
      .catch(() => false)
  //检查路径 `p` 是否是一个目录。
  export const isDir = (p: string) =>
    Bun.file(p)
      .stat()
      .then((s) => s.isDirectory())
      .catch(() => false)
  /**
   * On Windows, normalize a path to its canonical casing using the filesystem.
   * This is needed because Windows paths are case-insensitive but LSP servers
   * may return paths with different casing than what we send them.
   */
  //获取磁盘上真实的、规范的大小写路径
  export function normalizePath(p: string): string {
    if (process.platform !== "win32") return p
    try {
      return realpathSync.native(p)
    } catch {
      return p
    }
  }
  //两个路径 `a` 和 `b` 是否存在包含关系（即 `a` 在 `b` 里面，或者 `b` 在 `a` 里面）
  export function overlaps(a: string, b: string) {
    const relA = relative(a, b)
    const relB = relative(b, a)
    return !relA || !relA.startsWith("..") || !relB || !relB.startsWith("..")
  }
  //判断 `child` 路径是否位于 `parent` 路径之下。
  export function contains(parent: string, child: string) {
    return !relative(parent, child).startsWith("..")
  }
  //从 `start` 目录开始，寻找名为 `target` 的文件。
  export async function findUp(target: string, start: string, stop?: string) {
    let current = start
    const result = []
    while (true) {
      const search = join(current, target)
      if (await exists(search)) result.push(search)
      if (stop === current) break
      const parent = dirname(current)
      if (parent === current) break
      current = parent
    }
    return result
  }
  /**
  * 这个异步生成器函数从 start 目录开始，逐级向父目录查找，
  * 在每一层检查 targets 中的文件/目录是否存在，并依次产出所有存在的完整路径，
  * 直到抵达 stop 目录或文件系统根目录时停止。
  * async function* 组合就是异步生成器函数的标志。
  * 这种函数不会直接返回一个普通值，而是返回一个异步生成器对象，该对象实现了异步迭代器协议。
  */
  export async function* up(options: { targets: string[]; start: string; stop?: string }) {
    const { targets, start, stop } = options
    let current = start
    while (true) {
      for (const target of targets) {
        const search = join(current, target)
        if (await exists(search)) yield search
      }
      if (stop === current) break
      //获得所在目录的路径，即父路径
      const parent = dirname(current)
      if (parent === current) break
      current = parent
    }
  }
  //结合了 **Glob 模式匹配** 和向上查找。
  export async function globUp(pattern: string, start: string, stop?: string) {
    let current = start
    const result = []
    while (true) {
      try {
        const glob = new Bun.Glob(pattern)
        for await (const match of glob.scan({
          cwd: current,
          absolute: true,
          onlyFiles: true,
          followSymlinks: true,
          dot: true,
        })) {
          result.push(match)
        }
      } catch {
        // Skip invalid glob patterns
      }
      if (stop === current) break
      const parent = dirname(current)
      if (parent === current) break
      current = parent
    }
    return result
  }

  export async function readText(p: string): Promise<string> {
    return readFile(p, "utf-8")
  }


  export async function readJson<T = any>(p: string): Promise<T> {
    return JSON.parse(await readFile(p, "utf-8"))
  }

  


}
