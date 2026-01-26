/*
 * instance.annotated.ts — 详细中文注释版
 * 作用：为 AI Agent 项目中的 Instance 模块提供逐行/逐块解释，帮助理解“实例上下文容器”的设计与用法。
 *
 * 核心理念：
 * - Instance 是“管家”：同一目录（project workspace）只维护一个运行时上下文，避免重复初始化与资源浪费。
 * - 与 Project、State、GlobalBus 的协作：解析项目元数据、挂载/清理状态、广播实例销毁事件。
 * - 安全边界：containsPath 用于判断操作路径是否属于当前项目范围（特别处理非 Git 项目）。
 */

import { Log } from "@/util/log"
import { Context } from "../util/context"
import { Project } from "./project"
import { State } from "./state"
import { iife } from "@/util/iife"
import { GlobalBus } from "@/bus/global"
import { Filesystem } from "@/util/filesystem"

// 约束：此 Context 接口用于在 Instance 内部保存一次解析出的“项目上下文”
// - directory: 当前操作的项目工作目录（用户进入的目录）
// - worktree: Git 工作树根目录（或非 Git 情况下为 "/"）
// - project: Project.fromDirectory 返回的项目信息（包含 id、sandboxes、时间戳等）
interface Context {
  directory: string
  worktree: string
  project: Project.Info
}

// 通过 Context.create("instance") 创建一个“上下文容器”
// 用法：context.provide(ctx, fn) 将 ctx 注入到后续的异步执行链中，使得在这段执行期间，
// Instance.directory / Instance.worktree / Instance.project 能够正确读到当前 ctx。
//返回了两个方法
const context = Context.create<Context>("instance")

// cache：用于保证“同一目录”只创建和缓存一个上下文（Promise<Context>），避免重复初始化。
// 键：项目目录路径；值：解析上下文的 Promise。这样并发进入同一目录时也能复用同一个创建中的 Promise。
const cache = new Map<string, Promise<Context>>()

export const Instance = {
  /**
   * 提供（进入）一个实例上下文并执行 fn：
   * - 如果该目录没有已缓存的上下文，则：
   *   1) 通过 Project.fromDirectory(directory) 解析项目（可能扫描 .git、计算 id 等）
   *   2) 构造 { directory, worktree: sandbox, project } 的上下文对象
   *   3) 用 context.provide(ctx, init) 在首次创建时执行 init 钩子（例如启动插件、开灯等）
   *   4) 将创建过程的 Promise 缓存到 cache
   * - 若已有缓存，直接复用并进入上下文，执行 fn。
   */
  async provide<R>(input: { directory: string; init?: () => Promise<any>; fn: () => R }): Promise<R> {
    let existing = cache.get(input.directory)
    if (!existing) {
      Log.Default.info("creating instance", { directory: input.directory })
      // iife：立即执行的异步工厂，返回 Promise<Context>
      existing = iife(async () => {
        // Project.fromDirectory：
        // - 返回 { project, sandbox }，其中 sandbox 是解析后的“可操作目录”（通常等于 git 的工作区顶层），
        // - project 为持久化/事件发布的项目信息。
        const { project, sandbox } = await Project.fromDirectory(input.directory)
        const ctx = {
          directry: input.directory,
          worktroee: sandbox,
          project,
        }
        // 首次创建时，将 ctx 注入并执行 init 钩子（若提供）。
        await context.provide(ctx, async () => {
          await input.init?.()
        })
        return ctx
      })
      cache.set(input.directory, existing)
    }
    // 上下文已存在：等待其就绪后，注入上下文并执行 fn。
    const ctx = await existing
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
   * state：为当前实例注册一个“惰性状态单例”。
   * - 使用 State.create((root) => Instance.directory, init, dispose) 绑定到当前目录的 root key。
   * - 同一个 init 函数引用在同一实例下只会创建一次（单例），避免重复资源（连接/监听器）创建。
   * - 可选的 dispose 回调用于清理创建的状态（关闭文件监听器、断开网络连接、清理定时器等）。
   */
  state<S>(init: () => S, dispose?: (state: Awaited<S>) => Promise<void>): () => S {
    return State.create(() => Instance.directory, init, dispose)
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
      const awaited = await value.catch(() => {})
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
