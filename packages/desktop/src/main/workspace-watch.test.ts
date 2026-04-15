import fs from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { WorkspaceWatchManager } from "./workspace-watch"

type WatchCall = {
  target: string
  listener: fs.WatchListener<string>
  close: ReturnType<typeof vi.fn>
}

function createSender(id = 1) {
  let destroyed = false
  const destroyListeners: Array<() => void> = []
  const sent: Array<{ channel: string; payload: unknown }> = []

  return {
    id,
    sent,
    isDestroyed: () => destroyed,
    once: (_event: "destroyed", listener: () => void) => {
      destroyListeners.push(listener)
    },
    send: (channel: string, payload: unknown) => {
      sent.push({ channel, payload })
    },
    destroy: () => {
      destroyed = true
      for (const listener of destroyListeners.splice(0)) {
        listener()
      }
    },
  }
}

describe("workspace watch manager", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("emits a debounced workspace change event and starts watching .git when it appears", async () => {
    vi.useFakeTimers()

    const workspaceDirectory = "C:\\Projects\\Atlas\\client"
    const gitDirectory = "C:\\Projects\\Atlas\\client\\.git"
    let gitExists = false
    const watchCalls: WatchCall[] = []
    const watchFactory = vi.fn((target: string, _options: fs.WatchOptions, listener: fs.WatchListener<string>) => {
      const close = vi.fn()
      watchCalls.push({
        target,
        listener,
        close,
      })
      return {
        close,
      } as unknown as fs.FSWatcher
    })

    const manager = new WorkspaceWatchManager(
      watchFactory,
      (target) => target === gitDirectory ? gitExists : true,
    )
    const sender = createSender()

    manager.updateDirectories(sender, [workspaceDirectory])

    expect(watchCalls).toHaveLength(1)
    expect(watchCalls[0]?.target).toBe(workspaceDirectory)

    gitExists = true
    watchCalls[0]?.listener("rename", ".git")
    await vi.advanceTimersByTimeAsync(300)

    expect(watchCalls).toHaveLength(2)
    expect(watchCalls[1]?.target).toBe(gitDirectory)
    expect(sender.sent).toEqual([
      {
        channel: "desktop:workspace-file-change",
        payload: {
          directory: workspaceDirectory,
          paths: [gitDirectory],
        },
      },
    ])

    manager.dispose()
  })

  it("reconciles watched directories and cleans them up when the sender is destroyed", () => {
    const workspaceA = "C:\\Projects\\Atlas\\client"
    const workspaceB = "C:\\Projects\\Orion\\app"
    const watchCalls: WatchCall[] = []
    const watchFactory = vi.fn((target: string, _options: fs.WatchOptions, listener: fs.WatchListener<string>) => {
      const close = vi.fn()
      watchCalls.push({
        target,
        listener,
        close,
      })
      return {
        close,
      } as unknown as fs.FSWatcher
    })

    const manager = new WorkspaceWatchManager(watchFactory, () => false)
    const sender = createSender(9)

    manager.updateDirectories(sender, [workspaceA, workspaceB])
    expect(watchCalls).toHaveLength(2)

    manager.updateDirectories(sender, [workspaceB])
    expect(watchCalls[0]?.close).toHaveBeenCalledTimes(1)
    expect(watchCalls[1]?.close).not.toHaveBeenCalled()

    sender.destroy()
    expect(watchCalls[1]?.close).toHaveBeenCalledTimes(1)

    manager.dispose()
  })
})
