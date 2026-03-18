import z, { record } from "zod"
import fs from "fs/promises"
import * as Filesystem from "#util/filesystem.ts"
import path from "path"
import { $ } from "bun"
import * as db from "#database/Sqlite.ts"
import * as Log from "#util/log.ts"
import { Flag } from "#flag/flag.ts"
import * as Session from "#session/session.ts"
import { work } from "#util/queue.ts"
import { fn } from "#util/fn.ts"
import * as BusEvent from "#bus/bus-event.ts"
import { iife } from "#util/iife.ts"
import { GlobalBus } from "#bus/global.ts"
import { existsSync } from "fs"
import { schema } from "#id/id.ts"
import { time } from "console"


const log = Log.create({ service: "project" })

//#region  Type & Interface
export const ProjectInfo = z
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
    commands: z
      .object({
        start: z.string().optional().describe("Startup script to run when creating a new workspace (worktree)"),
      })
      .optional(),
    created: z.number(),
    updated: z.number(),
    initialized: z.number().optional(),
    sandboxes: z.array(z.string()),
  })
  .meta({
    ref: "Project",
  })
export type ProjectInfo = z.infer<typeof ProjectInfo>
//#endregion

/**
 * project update event
 */
export const Event = {
  Updated: BusEvent.define("project.updated", ProjectInfo),
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
export async function fromDirectory(directory: string): Promise<{ project: ProjectInfo, sandbox: string }> {
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
          vcs: ProjectInfo.shape.vcs.parse(Flag.FanFande_FAKE_VCS),
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
            vcs: ProjectInfo.shape.vcs.parse(Flag.FanFande_FAKE_VCS),
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
          vcs: ProjectInfo.shape.vcs.parse(Flag.FanFande_FAKE_VCS),
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
          vcs: ProjectInfo.shape.vcs.parse(Flag.FanFande_FAKE_VCS),
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
      vcs: ProjectInfo.shape.vcs.parse(Flag.FanFande_FAKE_VCS),
    }
  })

  //let existing = await Storage.read<ProjectInfo>(["project", id]).catch(() => undefined)
  const row = db.findById("projects", ProjectInfo, id);
  const existing: ProjectInfo = row
    ? row : {
      id: id,
      worktree: worktree,
      vcs: vcs as ProjectInfo["vcs"],
      //name: z.ZodOptional<z.ZodString>;
      //icon: z.ZodOptional<z.ZodObject<{
      //  url: z.ZodOptional<z.ZodString>;
      //  override: z.ZodOptional<z.ZodString>;
      //  color: z.ZodOptional<z.ZodString>;
      //}, z.core.$strip>>;
      created: Date.now(),
      updated: Date.now(),
      sandboxes: [] as string[],
    }
  //if (Flag.FanFande_EXPERIMENTAL_ICON_DISCOVERY) discover(existing)

  const result: ProjectInfo = {
    ...existing,
    worktree,
    vcs: vcs as ProjectInfo["vcs"],
    updated: Date.now(),
  }

  if (sandbox !== result.worktree && !result.sandboxes.includes(sandbox)) result.sandboxes.push(sandbox)
  result.sandboxes = result.sandboxes.filter((x) => existsSync(x))
  //await Storage.write<ProjectInfo>(["project", id], result)
  db.insertOne("projects", result)
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
// export async function discover(input: ProjectInfo) {
//   if (input.vcs !== "git") return
//   if (input.icon?.override) return
//   if (input.icon?.url) return
//   const glob = new Bun.Glob("**/{favicon}.{ico,png,svg,jpg,jpeg,webp}")
//   const matches = await Array.fromAsync(
//     glob.scan({
//       cwd: input.worktree,
//       absolute: true,
//       onlyFiles: true,
//       followSymlinks: false,
//       dot: false,
//     }),
//   )
//   const shortest = matches.sort((a, b) => a.length - b.length)[0]
//   if (!shortest) return
//   const file = Bun.file(shortest)
//   const buffer = await file.arrayBuffer()
//   const base64 = Buffer.from(buffer).toString("base64")
//   const mime = file.type || "image/png"
//   const url = `data:${mime};base64,${base64}`
//   await update({
//     projectID: input.id,
//     icon: {
//       url,
//     },
//   })
//   return
// }
//将之前存储在 "global" 项目下的会话迁移到新检测到的具体项目下。
// async function migrateFromGlobal(newProjectID: string, worktree: string) {
//   //如果global project不存在，直接返回
//   //const globalProject = await Storage.read<ProjectInfo>(["project", "global"]).catch(() => undefined)
//   const records = db.findMany("projects", {
//     where: [{ column: "worktree", operator: "=", value: "global" }]
//   })
//   const globalProject = db.fromSQLiteRecord(ProjectInfo, records)
//   if (!globalProject) return

//   //session-global下所有session文件的路径的list
//   const globalSessions = await Storage.list(["session", "global"]).catch(() => [])
//   if (globalSessions.length === 0) return

//   log.info("migrating sessions from global", { newProjectID, worktree, count: globalSessions.length })

//   await work(10, globalSessions, async (key) => {
//     const sessionID = key[key.length - 1]
//     const session = await Storage.read<Session.ProjectInfo>(key).catch(() => undefined)
//     if (!session) return
//     if (session.directory && session.directory !== worktree) return

//     session.projectID = newProjectID
//     log.info("migrating session", { sessionID, from: "global", to: newProjectID })
//     await Storage.write(["session", newProjectID, sessionID as string], session)
//     await Storage.remove(key)
//   }).catch((error) => {
//     log.error("failed to migrate sessions from global to project", { error, projectId: newProjectID })
//   })
// }
/**
 * 这段代码是一个异步函数 setInitialized，它的作用是记录并更新某个项目的“初始化时间”。
 * @param projectID 
 */
export async function setInitialized(projectID: string) {
  db.updateById("projects", projectID, {
    initialized: Date.now()
  })
}
/**
 * 这段代码是一个异步函数 list，其核心功能是：
 * 从存储中获取所有项目的数据，并过滤掉其中已经不存在于磁盘上的“沙盒（sandboxes）”路径。
 * @returns 
 */
export async function list() {
  const projects = db.findMany("projects", ProjectInfo)

  return projects.map((project) => ({
    ...project,
    sandboxes: project.sandboxes?.filter((x) => existsSync(x)),
  }))
}

export function get(id: string): ProjectInfo | undefined {
  const row = db.findById("projects", ProjectInfo, id)
  return row ? row : undefined
}

//初始化项目为git项目
//export async function initGit(input: { directory: string; project: Info }) {}

export const update = fn(
  z.object({
    projectID: z.string(),
    name: z.string().optional(),
    icon: ProjectInfo.shape.icon.optional(),
  }),
  async (input) => {

    db.updateById("projects", input.projectID, {
      name: input.name ? input.name : null,
      icon: input.icon ? input.icon! : null,
      updated: Date.now(),
    })



    const record = db.findById("projects", ProjectInfo, input.projectID)
    const result = record ? record : null


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
  //const project = await Storage.read<Info>(["project", projectID]).catch(() => undefined)

  const project = db.findById("projects", ProjectInfo, projectID)

  if (!project?.sandboxes) return []
  const valid: string[] = []
  for (const dir of project.sandboxes) {
    const stat = await fs.stat(dir).catch(() => undefined)
    if (stat?.isDirectory()) valid.push(dir)
  }
  return valid
}
// /**
//  * 从指定项目的沙盒列表中移除一个特定的目录，更新项目的最后修改时间，并向系统发送一个更新事件。
//  * @param projectID
//  * @param directory
//  * @returns
//  */
// export async function removeSandbox(projectID: string, directory: string) {
//   const result = await Storage.update<ProjectInfo>(["project", projectID], (draft) => {
//     const sandboxes = draft.sandboxes ?? []
//     draft.sandboxes = sandboxes.filter((sandbox) => sandbox !== directory)
//     draft.time.updated = Date.now()
//   })

//   const record = db.fromSQLiteRecord(ProjectInfo, db.findById("projects", projectID))


//   db.updateById("projects", projectID, {
//     sandboxes =
//   })



//   GlobalBus.emit("event", {
//     payload: {
//       type: Event.Updated.type,
//       properties: result,
//     },
//   })
//   return result
// }

