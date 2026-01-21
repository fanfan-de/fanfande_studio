import { Log } from "../util/log"
import path from "path"
import fs from "fs/promises"
import { Global } from "../global"
import { Filesystem } from "../util/filesystem"
import { lazy } from "../util/lazy"
import { Lock } from "../util/lock"
import { $ } from "bun"
import { NamedError } from "@/util/error"
import z from "zod"
/**
 这段代码实现了一个**基于文件系统的本地 JSON 存储模块**，专门用于在 Bun 运行时环境中持久化数据。它似乎是一个 AI 编程助手或聊天应用（如 Aider、Cursor 等类似工具）的后端存储层。

以下是对该代码的详细分析：

### 1. 核心功能与架构
这个 `Storage` 命名空间提供了一个轻量级的、键值对（Key-Value）风格的数据库，但数据是以 JSON 文件的形式直接存储在硬盘上的。

*   **运行环境**: 专为 **Bun** 设计（使用了 `Bun.file`, `Bun.write`, `Bun.Glob`, `$` shell 命令）。
*   **数据格式**: 所有数据存储为 `.json` 文件。
*   **寻址方式**: 使用字符串数组 `string[]` 作为键（Key），映射到文件系统的目录结构。例如 `['session', '123']` 会映射到 `.../data/storage/session/123.json`。

### 2. 关键组件分析

#### A. 并发控制与锁 (Locking)
代码使用了 `Lock.read` 和 `Lock.write`，并配合 TypeScript 的 `using` 关键字（资源管理），确保在读写文件时不会发生竞争条件（Race Conditions）。
*   **读取**: 获取读锁 -> 读取文件 -> 解析 JSON -> 释放锁。
*   **写入/更新**: 获取写锁 -> (读取) -> 写入文件 -> 释放锁。

#### B. 数据迁移系统 (Migrations)
这是代码中最复杂的部分。`state` 变量是一个 `lazy` 对象，它在第一次访问存储时会自动检查并运行迁移脚本。
它维护一个 `migration` 文件来记录当前的版本号，并依次执行 `MIGRATIONS` 数组中的函数。

*   **Migration [0] (重构项目结构)**:
    *   这看起来是一次大规模的架构升级。它从旧的 `project` 目录扫描，寻找 Git 信息（通过 `git rev-list` 获取初始 commit hash 作为 ID）。
    *   它将散落在不同目录下的 `session`（会话）、`message`（消息）和 `part`（消息片段）移动并重组到一个扁平化的新目录结构中。
    *   这表明该应用之前可能强依赖于目录嵌套，现在改为基于 ID 的扁平化存储。

*   **Migration [1] (分离 Diff 数据)**:
    *   它扫描所有的 `session` 文件。
    *   **目的**: 性能优化。它将体积可能很大的 `diffs`（代码变更差异）数据从会话元数据中剥离出来，存入单独的 `session_diff` 目录。
    *   主 `session` 文件中只保留 `additions` 和 `deletions` 的统计数据。

#### C. CRUD 操作 API
模块暴露了标准的数据库操作接口：

*   **`read<T>(key)`**: 读取指定路径的 JSON 数据。
*   **`write<T>(key, content)`**: 将数据写入指定路径（如果父目录不存在会自动创建，由 Bun 处理）。
*   **`update<T>(key, fn)`**: 事务性的更新。先读取，将对象传给回调函数 `fn` 进行修改（Mutation），然后将修改后的结果写回。
*   **`remove(key)`**: 删除对应的 JSON 文件。
*   **`list(prefix)`**: 列出指定前缀目录下的所有 Key。这对于获取例如 "所有会话列表" (`list(['session'])`) 非常有用。

#### D. 错误处理
*   使用了 `zod` 定义错误结构。
*   自定义了 `NotFoundError`。
*   `withErrorHandling` 包装器：捕获 Node.js 底层的 `ENOENT` (File No Entry) 错误，并将其转换为业务逻辑更容易处理的 `NotFoundError`。

### 3. 代码细节亮点

1.  **Lazy Initialization**:
    ```typescript
    const state = lazy(async () => { ... })
    ```
    存储目录的确定和迁移的执行被推迟到了第一次真正调用 API（如 `read` 或 `write`）的时候，加快了应用启动速度。

2.  **Bun Glob Scanning**:
    ```typescript
    new Bun.Glob("**"/"*").scan(...)
    ```
    利用 Bun 原生的高性能 Glob 扫描文件列表，比传统的 Node `fs.readdir` 递归效率更高。

3.  **Git 集成**:
    在迁移脚本中使用了 `$ git rev-list ...`，说明这个存储系统管理的数据与 Git 版本控制紧密相关（很可能是存储代码修改记录或 AI 对代码的分析会话）。

### 总结
这段代码实现了一个**具有自动迁移功能、并发安全、基于文件的 NoSQL 存储层**。它被设计用来管理结构化的应用数据（如项目、会话、消息），特别针对 AI 辅助编程场景（涉及 Git 操作和代码 Diff 管理）进行了优化。
 */
export namespace Storage {
  const log = Log.create({ service: "storage" })
  //方法类型，含有异步操作，无返回值
  type Migration = (dir: string) => Promise<void>

  export const NotFoundError = NamedError.create(
    "NotFoundError",
    z.object({
      message: z.string(),
    }),
  )
/**
 * asfda
 * asfa
 */
  const MIGRATIONS: Migration[] = [
    async (dir) => {
      const project = path.resolve(dir, "../project")
      if (!(await Filesystem.isDir(project))) return
      for await (const projectDir of new Bun.Glob("*").scan({
        cwd: project,
        onlyFiles: false,
      })) {
        log.info(`migrating project ${projectDir}`)
        let projectID = projectDir
        const fullProjectDir = path.join(project, projectDir)
        let worktree = "/"

        if (projectID !== "global") {
          for await (const msgFile of new Bun.Glob("storage/session/message/*/*.json").scan({
            cwd: path.join(project, projectDir),
            absolute: true,
          })) {
            const json = await Bun.file(msgFile).json()
            worktree = json.path?.root
            if (worktree) break
          }
          if (!worktree) continue
          if (!(await Filesystem.isDir(worktree))) continue
          const [id] = await $`git rev-list --max-parents=0 --all`
            .quiet()
            .nothrow()
            .cwd(worktree)
            .text()
            .then((x) =>
              x
                .split("\n")
                .filter(Boolean)
                .map((x) => x.trim())
                .toSorted(),
            )
          if (!id) continue
          projectID = id

          await Bun.write(
            path.join(dir, "project", projectID + ".json"),
            JSON.stringify({
              id,
              vcs: "git",
              worktree,
              time: {
                created: Date.now(),
                initialized: Date.now(),
              },
            }),
          )

          log.info(`migrating sessions for project ${projectID}`)
          for await (const sessionFile of new Bun.Glob("storage/session/info/*.json").scan({
            cwd: fullProjectDir,
            absolute: true,
          })) {
            const dest = path.join(dir, "session", projectID, path.basename(sessionFile))
            log.info("copying", {
              sessionFile,
              dest,
            })
            const session = await Bun.file(sessionFile).json()
            await Bun.write(dest, JSON.stringify(session))
            log.info(`migrating messages for session ${session.id}`)
            for await (const msgFile of new Bun.Glob(`storage/session/message/${session.id}/*.json`).scan({
              cwd: fullProjectDir,
              absolute: true,
            })) {
              const dest = path.join(dir, "message", session.id, path.basename(msgFile))
              log.info("copying", {
                msgFile,
                dest,
              })
              const message = await Bun.file(msgFile).json()
              await Bun.write(dest, JSON.stringify(message))

              log.info(`migrating parts for message ${message.id}`)
              for await (const partFile of new Bun.Glob(`storage/session/part/${session.id}/${message.id}/*.json`).scan(
                {
                  cwd: fullProjectDir,
                  absolute: true,
                },
              )) {
                const dest = path.join(dir, "part", message.id, path.basename(partFile))
                const part = await Bun.file(partFile).json()
                log.info("copying", {
                  partFile,
                  dest,
                })
                await Bun.write(dest, JSON.stringify(part))
              }
            }
          }
        }
      }
    },
    async (dir) => {
      for await (const item of new Bun.Glob("session/*/*.json").scan({
        cwd: dir,
        absolute: true,
      })) {
        const session = await Bun.file(item).json()
        if (!session.projectID) continue
        if (!session.summary?.diffs) continue
        const { diffs } = session.summary
        await Bun.file(path.join(dir, "session_diff", session.id + ".json")).write(JSON.stringify(diffs))
        await Bun.file(path.join(dir, "session", session.projectID, session.id + ".json")).write(
          JSON.stringify({
            ...session,
            summary: {
              additions: diffs.reduce((sum: any, x: any) => sum + x.additions, 0),
              deletions: diffs.reduce((sum: any, x: any) => sum + x.deletions, 0),
            },
          }),
        )
      }
    },
  ]

  //惰性加载，这里的目的是给state赋值一个目录
  const state = lazy(async () => {
    const dir = path.join(Global.Path.data, "storage")
    const migration = await Bun.file(path.join(dir, "migration"))
      .json()
      .then((x) => parseInt(x))
      .catch(() => 0)
    for (let index = migration; index < MIGRATIONS.length; index++) {
      log.info("running migration", { index })
      const migration = MIGRATIONS[index]
      await migration!(dir).catch(() => log.error("failed to run migration", { index }))
      await Bun.write(path.join(dir, "migration"), (index + 1).toString())
    }
    return {
      dir,
    }
  })

  export async function remove(key: string[]) {
    const dir = await state().then((x) => x.dir)
    const target = path.join(dir, ...key) + ".json"
    return withErrorHandling(async () => {
      await fs.unlink(target).catch(() => {})
    })
  }

  export async function read<T>(key: string[]) {
    const dir = await state().then((x) => x.dir)
    const target = path.join(dir, ...key) + ".json"
    return withErrorHandling(async () => {
      using _ = await Lock.read(target)
      const result = await Bun.file(target).json()
      return result as T
    })
  }

  export async function update<T>(key: string[], fn: (draft: T) => void) {
    const dir = await state().then((x) => x.dir)
    const target = path.join(dir, ...key) + ".json"
    return withErrorHandling(async () => {
      using _ = await Lock.write(target)
      const content = await Bun.file(target).json()
      fn(content)
      await Bun.write(target, JSON.stringify(content, null, 2))
      return content as T
    })
  }

  export async function write<T>(key: string[], content: T) {
    const dir = await state().then((x) => x.dir)
    const target = path.join(dir, ...key) + ".json"
    return withErrorHandling(async () => {
      using _ = await Lock.write(target)
      await Bun.write(target, JSON.stringify(content, null, 2))
    })
  }

  async function withErrorHandling<T>(body: () => Promise<T>) {
    return body().catch((e) => {
      if (!(e instanceof Error)) throw e
      const errnoException = e as NodeJS.ErrnoException
      if (errnoException.code === "ENOENT") {
        throw new NotFoundError({ message: `Resource not found: ${errnoException.path}` })
      }
      throw e
    })
  }

  const glob = new Bun.Glob("**/*")
  export async function list(prefix: string[]) {
    const dir = await state().then((x) => x.dir)
    try {
      const result = await Array.fromAsync(
        glob.scan({
          cwd: path.join(dir, ...prefix),
          onlyFiles: true,
        }),
      ).then((results) => results.map((x) => [...prefix, ...x.slice(0, -5).split(path.sep)]))
      result.sort()
      return result
    } catch {
      return []
    }
  }
}
