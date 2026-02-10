/*
 * 核心理念：
 *   Instance 是所有的文件夹目录都有一个各自的对应，和project没关系
 * - 同一目录（project workspace）只维护一个运行时上下文，避免重复初始化与资源浪费。
 * - 与 Project、State、GlobalBus 的协作：解析项目元数据、挂载/清理状态、广播实例销毁事件。
 * - 安全边界：containsPath 用于判断操作路径是否属于当前项目范围（特别处理非 Git 项目）。
 */

import { Log } from "@/util/log"
import { Context as utilContext } from "../util/context"
import { Project } from "./project"
import { State } from "./state"
import { iife } from "@/util/iife"
import { GlobalBus } from "@/bus/global"
import { Filesystem } from "@/util/filesystem"

interface Context {
  directory: string
  worktree: string
  project: Project.Info
}

//内部维护的一个  上下文存储容器， Context，directory信息就在其中，
//context是全局唯一的，本质上就是两个方法
const contextContainer = utilContext.createContextContainer<Context>(/*"instance"*/)
//内部维护的一个  目录：Context  的缓存
//和state的区别是，这里存的是项目的Context信息，即上面的接口的实现
//state里的recordsByKey 存的是 需要保持为状态的数据？
const cache= new Map<string, Promise<Context>>()

//外部接口
export const Instance = {
  /**
 * state：为当前实例注册一个“惰性状态单例”。
 *@param init () => S
 *@param dispose (state: Awaited<S>) => Promise<void>
 *@returns ()=>S
 */
  state<S>(init: () => S, dispose?: (state: Awaited<S>) => Promise<void>): () => S {
    return State.GetOrCreate(() => Instance.directory, init, dispose)
  },
  /**
   * 保证在一个文件夹目录，只有第一次用到时才执行这个方法，保证文件夹位置 和 一个 Context
   * 执行传入的fn方法，返回fn的返回R
   * 方法的动机是
   * 1.执行fn，获得R
   * 2.检查判断是否第一次
   * @param input 
   * @returns 
   */
  async provide<R>(input: { directory: string; init?: () => Promise<any>; fn: () => R }): Promise<R> {
    let existing = cache.get(input.directory)
    if (!existing) {
      //说明第一次通过instance.provide 访问这个目录
      Log.Default.info("creating instance", { directory: input.directory })
      existing = iife(async () => {
        const { project, sandbox } = await Project.fromDirectory(input.directory)
        const ctx:Context = {
          directory: input.directory,
          worktree: sandbox,
          project,
        }
        await context.provide(ctx, async () => {
          await input.init?.()
        })
        return ctx
      })
      cache.set(input.directory, existing)
    }
    const ctx:Context = await existing

    return context.provide(ctx, async () => {
      return input.fn()
    })
  },

  /**
   * 读取当前上下文的目录：仅在 context.provide(...) 包裹的执行链中可用。
   * 若在没有上下文的异步链里调用，会抛错（由 Context.use 控制）。
   */
  get directory() {
    return context.use().directory
  },

  /**
   * 读取当前上下文的工作树（worktree）：
   * - Git 项目：为 Git 顶层工作树目录
   * - 非 Git 项目：为 "/"（特殊值，用于后续边界判断的安全处理）
   */
  get worktree() {
    return context.use().worktree
  },

  /**
   * 读取当前上下文的项目元数据（Project.Info）：包含 id、sandboxes、时间戳等。
   */
  get project() {
    return context.use().project
  },

  /**
   * containsPath：判断某个绝对路径是否属于当前项目边界。
   * 规则：
   * - 返回 true 当 filepath 在 Instance.directory（工作目录）内；
   * - 若非 Git 项目（worktree === "/"），跳过工作树检查，仅以 directory 为边界；
   * - 否则检查 filepath 是否也在 Instance.worktree 内。
   * 目的：
   * - 防止非 Git 情况下把整台机器误认为工作树（因为 "/" 会匹配任何绝对路径）。
   * - 保证权限检查仅限定于当前项目目录/工作树。
   */
  containsPath(filepath: string) {
    if (Filesystem.contains(Instance.directory, filepath)) return true
    // 非 Git 项目将 worktree 设为 "/"，不能拿 "/" 去匹配所有绝对路径，否则会导致“全盘放行”。
    if (Instance.worktree === "/") return false
    return Filesystem.contains(Instance.worktree, filepath)
  },


  /**
   * dispose：销毁当前实例（当前目录上下文）。
   * 流程：
   * - 记录日志，调用 State.dispose(Instance.directory) 并行清理所有挂载状态；
   * - 从 cache 移除该目录的上下文；
   * - 通过 GlobalBus.emit 广播 "server.instance.disposed" 事件，通知外部系统（UI/服务）做相应清理与更新。
   */
  async dispose() {
    Log.Default.info("disposing instance", { directory: Instance.directory })
    await State.dispose(Instance.directory)
    cache.delete(Instance.directory)
    GlobalBus.emit("event", {
      directory: Instance.directory,
      payload: {
        type: "server.instance.disposed",
        properties: {
          directory: Instance.directory,
        },
      },
    })
  },

  /**
   * disposeAll：销毁所有已创建的实例。
   * - 遍历 cache 中的所有 Promise<Context>，等待就绪后在对应上下文中调用 Instance.dispose()；
   * - 在全部完成后清空 cache。
   * 使用场景：进程退出或服务器重启前进行全局清理，保证不遗留任何资源。
   */
  async disposeAll() {
    Log.Default.info("disposing all instances")
    for (const [_key, value] of cache) {
      // 防御：若某个 Promise 失败，catch 后继续处理其他实例
      const awaited = await value.catch(() => { })
      if (awaited) {
        // 确保在该上下文环境中执行 dispose，避免跨上下文调用导致的状态错乱
        await context.provide(await value, async () => {
          await Instance.dispose()
        })
      }
    }
    cache.clear()
  },
}
