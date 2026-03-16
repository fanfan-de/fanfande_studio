import z from "zod"
import fs from "fs/promises"
import { Filesystem } from "../util/filesystem"
import path from "path"
import { $ } from "bun"
import { Storage } from "../storage/storage"
import { Log } from "../util/log"
import { Flag } from "@/flag/flag"
import { Session } from "../session"
import { work } from "../util/queue"
import { fn } from "@/util/fn"
import { BusEvent } from "@/bus/bus-event"
import { iife } from "@/util/iife"
import { GlobalBus } from "@/bus/global"
import { existsSync } from "fs"

export namespace Project {
  const log = Log.create({ service: "project" })
  export const Info = z
    .object({
      id: z.string(),
      worktree: z.string(),
      vcs: z.literal("git").optional(),
      name: z.string().optional(),
      icon: z
        .object({
          url: z.string().optional(),
          override: z.string().optional(),
          color: z.string().optional(),
        })
        .optional(),
      time: z.object({
        created: z.number(),
        updated: z.number(),
        initialized: z.number().optional(),
      }),
      sandboxes: z.array(z.string()),
    })
    .meta({
      ref: "Project",
    })
  export type Info = z.infer<typeof Info>

  /**
   * project update event
   */
  export const Event = {
    Updated: BusEvent.define("project.updated", Info),
  }
  /**
   * 从指定目录初始化或获取项目信息。
   * 这个根目录存在以下可能
   * 是git项目根目录/git项目worktree根目录/git项目子目录，/非git项目目录
   * @description
   * @returns 返回一个对象，包含：
   * - `project`: 解析后的 {@link Info} 项目信息对象。
   * - `sandbox`: 当前确定的沙箱路径。
   * @example
   * ```ts
   * const { project, sandbox } = await fromDirectory("/Users/dev/my-project/src");
   * console.log(project.id); // 输出项目唯一哈希或 "global"
   * ```
   */
  export async function fromDirectory(directory: string) {
    log.info("fromDirectory", { directory })
    /**
     * id：git 第一个commithash
     * sandbox：向上索引第一个.git所在文件夹路径
     * 
     */
    const { id, sandbox, worktree, vcs } = await iife(async () => {
      //向上查找到.git
      const matches = Filesystem.up({ targets: [".git"], start: directory })
      //只取第一个匹配项
      const git = await matches.next().then((x) => x.value)
      await matches.return()
      //存在git文件的情况
      if (git) {
        let sandbox = path.dirname(git)//git所在的目录

        const gitBinary = Bun.which("git")//环境变量查找git可执行文件，返回绝对路径|undefine

        // cached id calculation
        let id = await Bun.file(path.join(git, "opencode"))
          .text()
          .then((x) => x.trim())
          .catch(() => undefined)

        if (!gitBinary) {
          return {
            id: id ?? "global",
            worktree: sandbox,
            sandbox: sandbox,
            vcs: Info.shape.vcs.parse(Flag.FanFande_FAKE_VCS),
          }
        }

        // 没id：generate id from root commit，健壮性考虑获得第一次提交的所有commit hash
        if (!id) {
          const roots = await $`git rev-list --max-parents=0 --all`
            .quiet()
            .nothrow()
            .cwd(sandbox)
            .text()
            .then((x) =>
              x
                .split("\n")
                .filter(Boolean)
                .map((x) => x.trim())
                .toSorted(),
            )
            .catch(() => undefined)

          if (!roots) {
            return {
              id: "global",
              worktree: sandbox,
              sandbox: sandbox,
              vcs: Info.shape.vcs.parse(Flag.FanFande_FAKE_VCS),
            }
          }

          id = roots[0]
          if (id) {
            void Bun.file(path.join(git, "opencode"))
              .write(id)
              .catch(() => undefined)
          }
        }

        if (!id) {
          return {
            id: "global",
            worktree: sandbox,
            sandbox: sandbox,
            vcs: "git",
          }
        }

        const top = await $`git rev-parse --show-toplevel`
          .quiet()
          .nothrow()
          .cwd(sandbox)
          .text()
          .then((x) => path.resolve(sandbox, x.trim()))
          .catch(() => undefined)

        if (!top) {
          return {
            id,
            sandbox,
            worktree: sandbox,
            vcs: Info.shape.vcs.parse(Flag.FanFande_FAKE_VCS),
          }
        }

        sandbox = top

        const worktree = await $`git rev-parse --git-common-dir`
          .quiet()
          .nothrow()
          .cwd(sandbox)
          .text()
          .then((x) => {
            const dirname = path.dirname(x.trim())
            if (dirname === ".") return sandbox
            return dirname
          })
          .catch(() => undefined)

        if (!worktree) {
          return {
            id,
            sandbox,
            worktree: sandbox,
            vcs: Info.shape.vcs.parse(Flag.FanFande_FAKE_VCS),
          }
        }

        return {
          id,
          sandbox,
          worktree,
          vcs: "git",
        }
      }

      return {
        id: "global",
        worktree: "/",
        sandbox: "/",
        vcs: Info.shape.vcs.parse(Flag.FanFande_FAKE_VCS),
      }
    })

    let existing = await Storage.read<Info>(["project", id]).catch(() => undefined)
    if (!existing) {
      existing = {
        id,
        worktree,
        vcs: vcs as Info["vcs"],
        sandboxes: [],
        time: {
          created: Date.now(),
          updated: Date.now(),
        },
      }
      if (id !== "global") {
        await migrateFromGlobal(id, worktree)
      }
    }

    // migrate old projects before sandboxes
    if (!existing.sandboxes) existing.sandboxes = []

    if (Flag.FanFande_EXPERIMENTAL_ICON_DISCOVERY) discover(existing)

    const result: Info = {
      ...existing,
      worktree,
      vcs: vcs as Info["vcs"],
      time: {
        ...existing.time,
        updated: Date.now(),
      },
    }
    if (sandbox !== result.worktree && !result.sandboxes.includes(sandbox)) result.sandboxes.push(sandbox)
    result.sandboxes = result.sandboxes.filter((x) => existsSync(x))
    await Storage.write<Info>(["project", id], result)
    GlobalBus.emit("event", {
      payload: {
        type: Event.Updated.type,
        properties: result,
      },
    })
    return { project: result, sandbox }
  }
  /**
   * 这段代码是一个使用 Bun 运行时的异步函数 discover。
   * 它的主要功能是：在 Git 项目的源码目录中自动查找名为 favicon 的图标文件，
   * 并将其转换为 Base64 编码的 Data URL，最后更新到项目的配置中。
   * @param input 
   * @returns 
   */
  export async function discover(input: Info) {
    if (input.vcs !== "git") return
    if (input.icon?.override) return
    if (input.icon?.url) return
    const glob = new Bun.Glob("**/{favicon}.{ico,png,svg,jpg,jpeg,webp}")
    const matches = await Array.fromAsync(
      glob.scan({
        cwd: input.worktree,
        absolute: true,
        onlyFiles: true,
        followSymlinks: false,
        dot: false,
      }),
    )
    const shortest = matches.sort((a, b) => a.length - b.length)[0]
    if (!shortest) return
    const file = Bun.file(shortest)
    const buffer = await file.arrayBuffer()
    const base64 = Buffer.from(buffer).toString("base64")
    const mime = file.type || "image/png"
    const url = `data:${mime};base64,${base64}`
    await update({
      projectID: input.id,
      icon: {
        url,
      },
    })
    return
  }
  //将之前存储在 "global" 项目下的会话迁移到新检测到的具体项目下。
  async function migrateFromGlobal(newProjectID: string, worktree: string) {
    //如果global project不存在，直接返回
    const globalProject = await Storage.read<Info>(["project", "global"]).catch(() => undefined)
    if (!globalProject) return

    //session-global下所有session文件的路径的list
    const globalSessions = await Storage.list(["session", "global"]).catch(() => [])
    if (globalSessions.length === 0) return

    log.info("migrating sessions from global", { newProjectID, worktree, count: globalSessions.length })

    await work(10, globalSessions, async (key) => {
      const sessionID = key[key.length - 1]
      const session = await Storage.read<Session.Info>(key).catch(() => undefined)
      if (!session) return
      if (session.directory && session.directory !== worktree) return

      session.projectID = newProjectID
      log.info("migrating session", { sessionID, from: "global", to: newProjectID })
      await Storage.write(["session", newProjectID, sessionID as string], session)
      await Storage.remove(key)
    }).catch((error) => {
      log.error("failed to migrate sessions from global to project", { error, projectId: newProjectID })
    })
  }
  /**
   * 这段代码是一个异步函数 setInitialized，它的作用是记录并更新某个项目的“初始化时间”。
   * @param projectID 
   */
  export async function setInitialized(projectID: string) {
    await Storage.update<Info>(["project", projectID], (draft) => {
      draft.time.initialized = Date.now()
    })
  }
  /**
   * 这段代码是一个异步函数 list，其核心功能是：
   * 从存储中获取所有项目的数据，并过滤掉其中已经不存在于磁盘上的“沙盒（sandboxes）”路径。
   * @returns 
   */
  export async function list() {
    const keys = await Storage.list(["project"])
    const projects = await Promise.all(keys.map((x) => Storage.read<Info>(x)))
    return projects.map((project) => ({
      ...project,
      sandboxes: project.sandboxes?.filter((x) => existsSync(x)),
    }))
  }
  /**
   * 更新项目信息
   * 
   * @description 
   * 该函数采用原子化更新模式，仅修改传入的字段。
   * 更新成功后会自动记录最后修改时间，并通过全局事件总线通知系统其他模块。
   * 
   * @param input - 更新参数
   * @param input.projectID - 必填。需要更新的项目唯一标识符
   * @param input.name - 选填。项目的新名称
   * @param input.icon - 选填。图标配置对象，包含 url, override 和 color 属性
   * 
   * @returns 返回更新后的完整项目信息对象 (Info)
   * 
   * @example
   * // 仅更新图标颜色
   * await update({ 
   *   projectID: "my-pid", 
   *   icon: { color: "#ff0000" } 
   * });
   * 
   * @throws {ZodError} 如果输入参数不符合 Schema 定义（如 projectID 缺失）将抛出校验错误
   */
  export const update = fn(
    z.object({
      projectID: z.string(),
      name: z.string().optional(),
      icon: Info.shape.icon.optional(),
    }),
    async (input) => {
      const result = await Storage.update<Info>(["project", input.projectID], (draft) => {
        if (input.name !== undefined) draft.name = input.name
        if (input.icon !== undefined) {
          draft.icon = {
            ...draft.icon,
          }
          if (input.icon.url !== undefined) draft.icon.url = input.icon.url
          if (input.icon.override !== undefined) draft.icon.override = input.icon.override || undefined
          if (input.icon.color !== undefined) draft.icon.color = input.icon.color
        }
        draft.time.updated = Date.now()
      })
      GlobalBus.emit("event", {
        payload: {
          type: Event.Updated.type,
          properties: result,
        },
      })
      return result
    },
  )
/**
 * 根据给定的项目 ID (projectID)，从存储中获取该项目的沙盒目录列表，
 * 并验证这些目录在文件系统中是否真实存在且为目录。
 * @param projectID 
 * @returns 
 */
  export async function sandboxes(projectID: string) {
    const project = await Storage.read<Info>(["project", projectID]).catch(() => undefined)
    if (!project?.sandboxes) return []
    const valid: string[] = []
    for (const dir of project.sandboxes) {
      const stat = await fs.stat(dir).catch(() => undefined)
      if (stat?.isDirectory()) valid.push(dir)
    }
    return valid
  }
/**
 * 从指定项目的沙盒列表中移除一个特定的目录，更新项目的最后修改时间，并向系统发送一个更新事件。
 * @param projectID 
 * @param directory 
 * @returns 
 */
  export async function removeSandbox(projectID: string, directory: string) {
    const result = await Storage.update<Info>(["project", projectID], (draft) => {
      const sandboxes = draft.sandboxes ?? []
      draft.sandboxes = sandboxes.filter((sandbox) => sandbox !== directory)
      draft.time.updated = Date.now()
    })
    GlobalBus.emit("event", {
      payload: {
        type: Event.Updated.type,
        properties: result,
      },
    })
    return result
  }
}
