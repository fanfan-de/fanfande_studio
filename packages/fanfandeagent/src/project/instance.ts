import * as Log from "#util/log.ts"
import * as UtilContext from "#util/context.ts"
import * as Project from "#project/project.ts"
import * as Bootstrap from "#project/bootstrap.ts"

import { iife } from "#util/iife.ts"
import { GlobalBus } from "#bus/global.ts"
import * as Filesystem from "#util/filesystem.ts"
import * as State from "#project/state.ts"

interface Context {
  directory: string
  worktree: string
  project: Project.ProjectInfo
}

const contextContainer = UtilContext.createContextContainer<Context>()
const cache = new Map<string, Promise<Context>>()

const Instance = {
  state<S>(init: () => S, dispose?: (state: Awaited<S>) => Promise<void>): () => S {
    return State.GetOrCreate(() => Instance.directory, init, dispose)
  },

  async provide<R>(input: { directory: string; init?: () => Promise<any>; fn: () => R }): Promise<R> {
    let existing = cache.get(input.directory)
    if (!existing) {
      Log.Default.info("creating instance", { directory: input.directory })
      existing = iife(async () => {
        try {
          const { project, sandbox } = await Project.fromDirectory(input.directory)
          const ctx: Context = {
            directory: input.directory,
            worktree: sandbox,
            project,
          }

          await contextContainer.provide(ctx, async () => {
            await Bootstrap.InstanceBootstrap(ctx)
            await input.init?.()
          })

          return ctx
        } catch (error) {
          cache.delete(input.directory)
          throw error
        }
      })
      cache.set(input.directory, existing)
    }

    const ctx: Context = await existing
    return contextContainer.provide(ctx, async () => {
      return input.fn()
    })
  },

  get directory() {
    return contextContainer.use().directory
  },

  get worktree() {
    return contextContainer.use().worktree
  },

  get project() {
    return contextContainer.use().project
  },

  containsPath(filepath: string) {
    if (Filesystem.contains(Instance.directory, filepath)) return true
    if (Instance.worktree === "/") return false
    return Filesystem.contains(Instance.worktree, filepath)
  },

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

  async disposeAll() {
    Log.Default.info("disposing all instances")
    for (const value of cache.values()) {
      const awaited = await value.catch(() => undefined)
      if (!awaited) continue
      await contextContainer.provide(awaited, async () => {
        await Instance.dispose()
      })
    }
    cache.clear()
  },
}

export { Instance }
