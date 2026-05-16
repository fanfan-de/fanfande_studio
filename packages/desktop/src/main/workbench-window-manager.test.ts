import { describe, expect, it, vi } from "vitest"

const electronMock = vi.hoisted(() => {
  const { EventEmitter } = require("node:events") as typeof import("node:events")
  const createdWindows: any[] = []

  class FakeWebContents extends EventEmitter {
    readonly id: number
    readonly sent: Array<{ channel: string; payload: unknown }> = []
    private destroyed = false

    constructor(id: number) {
      super()
      this.id = id
    }

    isDestroyed() {
      return this.destroyed
    }

    send(channel: string, payload: unknown) {
      this.sent.push({ channel, payload })
    }
  }

  class FakeBrowserWindow extends EventEmitter {
    loadedUrl: string | null = null
    shown = false
    private readonly webContentsRef: FakeWebContents
    private destroyed = false

    constructor() {
      super()
      this.webContentsRef = new FakeWebContents(createdWindows.length + 1)
      createdWindows.push(this)
    }

    get webContents() {
      if (this.destroyed) throw new Error("Object has been destroyed")
      return this.webContentsRef
    }

    isDestroyed() {
      return this.destroyed
    }

    loadURL(url: string) {
      this.loadedUrl = url
      return Promise.resolve()
    }

    show() {
      this.shown = true
    }

    focus() {
      // no-op
    }

    close() {
      this.destroyed = true
      this.emit("closed")
    }
  }

  return {
    BrowserWindow: FakeBrowserWindow,
    createdWindows,
  }
})

vi.mock("electron", () => ({
  BrowserWindow: electronMock.BrowserWindow,
}))

import { WorkbenchWindowManager } from "./workbench-window-manager"

describe("WorkbenchWindowManager", () => {
  it("does not rebroadcast identical renderer snapshots", () => {
    electronMock.createdWindows.length = 0
    const mainWindow = new electronMock.BrowserWindow()
    const manager = new WorkbenchWindowManager({
      rendererEntryUrl: "http://127.0.0.1:5173/index.html",
      createPopoutWindowOptions: () => ({
        width: 1000,
        height: 700,
      }),
    })
    manager.registerMainWindow(mainWindow as any)

    const snapshot = {
      version: 0,
      windows: [],
      surfaces: [
        {
          surfaceID: "main",
          kind: "main" as const,
          windowID: "main",
          ownedPanelIDs: ["session:session-1"],
        },
      ],
      ownership: [],
      panels: {
        "session:session-1": {
          panelID: "session:session-1",
          reference: { kind: "session" as const, sessionID: "session-1" },
          title: "Session 1",
          pane: {},
        },
      },
    }

    manager.publishStateSnapshot(snapshot)
    manager.publishStateSnapshot(snapshot)

    expect(mainWindow.webContents.sent).toHaveLength(1)
  })

  it("commits ownership only after the popout panel mounts and docks it back on request", async () => {
    electronMock.createdWindows.length = 0
    const mainWindow = new electronMock.BrowserWindow()
    const manager = new WorkbenchWindowManager({
      rendererEntryUrl: "http://127.0.0.1:5173/index.html",
      createPopoutWindowOptions: () => ({
        width: 1000,
        height: 700,
      }),
    })
    manager.registerMainWindow(mainWindow as any)

    const pendingDetach = manager.detachSessionPanel({
      panelID: "session:session-1",
      sessionID: "session-1",
      title: "Session 1",
      lastMainGroupID: "group-1",
    })
    const popoutWindow = electronMock.createdWindows[1]
    const popoutContext = manager.getWindowContext(popoutWindow.webContents as any)

    expect(popoutContext.kind).toBe("session-popout")
    expect(popoutContext.reference).toEqual({ kind: "session", sessionID: "session-1" })
    expect(popoutWindow.loadedUrl).toContain("workbenchWindowID=")

    manager.markPanelMounted({
      panelID: "session:session-1",
      windowID: popoutContext.windowID,
    })
    const detachResult = await pendingDetach

    expect(detachResult.windowID).toBe(popoutContext.windowID)
    expect(popoutWindow.shown).toBe(true)
    expect(detachResult.state.ownership[0]).toEqual(expect.objectContaining({
      ownerWindowID: popoutContext.windowID,
      ownerSurfaceID: popoutContext.surfaceID,
      panelID: "session:session-1",
    }))

    const dockedState = manager.dockSessionPanel({
      panelID: "session:session-1",
      windowID: popoutContext.windowID,
      reason: "button",
    })

    expect(dockedState.ownership[0]).toEqual(expect.objectContaining({
      ownerWindowID: "main",
      ownerSurfaceID: "main",
      panelID: "session:session-1",
    }))
    expect(popoutWindow.isDestroyed()).toBe(true)
  })

  it("moves a panel from a popout surface back to the main surface", async () => {
    electronMock.createdWindows.length = 0
    const mainWindow = new electronMock.BrowserWindow()
    const manager = new WorkbenchWindowManager({
      rendererEntryUrl: "http://127.0.0.1:5173/index.html",
      createPopoutWindowOptions: () => ({
        width: 1000,
        height: 700,
      }),
    })
    manager.registerMainWindow(mainWindow as any)

    manager.publishStateSnapshot({
      version: 0,
      windows: [],
      surfaces: [
        {
          surfaceID: "main",
          kind: "main",
          windowID: "main",
          ownedPanelIDs: ["session:session-1"],
        },
      ],
      ownership: [],
      panels: {
        "session:session-1": {
          panelID: "session:session-1",
          reference: { kind: "session", sessionID: "session-1" },
          title: "Session 1",
          pane: {},
        },
      },
    })

    const pendingDetach = manager.detachSessionPanel({
      panelID: "session:session-1",
      sessionID: "session-1",
      title: "Session 1",
      lastMainGroupID: "group-1",
    })
    const popoutWindow = electronMock.createdWindows[1]
    const popoutContext = manager.getWindowContext(popoutWindow.webContents as any)
    manager.markPanelMounted({
      panelID: "session:session-1",
      windowID: popoutContext.windowID,
    })
    await pendingDetach

    const moveResult = manager.moveSessionPanel({
      panelID: "session:session-1",
      sourceSurfaceID: popoutContext.surfaceID,
      targetGroupID: "group-1",
      targetSurfaceID: "main",
    })

    expect(moveResult.ok).toBe(true)
    expect(moveResult.state.ownership[0]).toEqual(expect.objectContaining({
      ownerSurfaceID: "main",
      ownerWindowID: "main",
    }))
    expect(moveResult.state.surfaces?.find((surface) => surface.surfaceID === "main")?.ownedPanelIDs).toContain("session:session-1")
    expect(popoutWindow.isDestroyed()).toBe(true)
  })

  it("keeps a popout window alive when moving one of multiple panels out", async () => {
    electronMock.createdWindows.length = 0
    const mainWindow = new electronMock.BrowserWindow()
    const manager = new WorkbenchWindowManager({
      rendererEntryUrl: "http://127.0.0.1:5173/index.html",
      createPopoutWindowOptions: () => ({
        width: 1000,
        height: 700,
      }),
    })
    manager.registerMainWindow(mainWindow as any)
    manager.publishStateSnapshot({
      version: 0,
      windows: [],
      surfaces: [
        {
          surfaceID: "main",
          kind: "main",
          windowID: "main",
          ownedPanelIDs: ["session:session-1", "session:session-2"],
        },
      ],
      ownership: [],
      panels: {
        "session:session-1": {
          panelID: "session:session-1",
          reference: { kind: "session", sessionID: "session-1" },
          title: "Session 1",
          pane: {},
        },
        "session:session-2": {
          panelID: "session:session-2",
          reference: { kind: "session", sessionID: "session-2" },
          title: "Session 2",
          pane: {},
        },
      },
    })

    const pendingDetach = manager.detachSessionPanel({
      panelID: "session:session-1",
      sessionID: "session-1",
      title: "Session 1",
      lastMainGroupID: "group-1",
    })
    const popoutWindow = electronMock.createdWindows[1]
    const popoutContext = manager.getWindowContext(popoutWindow.webContents as any)
    manager.markPanelMounted({
      panelID: "session:session-1",
      windowID: popoutContext.windowID,
    })
    await pendingDetach

    const mergeResult = manager.moveSessionPanel({
      panelID: "session:session-2",
      sourceSurfaceID: "main",
      targetSurfaceID: popoutContext.surfaceID!,
    })
    expect(mergeResult.ok).toBe(true)
    expect(popoutWindow.isDestroyed()).toBe(false)

    const moveBackResult = manager.moveSessionPanel({
      panelID: "session:session-2",
      sourceSurfaceID: popoutContext.surfaceID,
      targetSurfaceID: "main",
    })

    expect(moveBackResult.ok).toBe(true)
    expect(popoutWindow.isDestroyed()).toBe(false)
    expect(moveBackResult.state.surfaces?.find((surface) => surface.surfaceID === popoutContext.surfaceID)?.ownedPanelIDs).toEqual([
      "session:session-1",
    ])
  })

  it("rejects moves that do not match the source surface", () => {
    electronMock.createdWindows.length = 0
    const mainWindow = new electronMock.BrowserWindow()
    const manager = new WorkbenchWindowManager({
      rendererEntryUrl: "http://127.0.0.1:5173/index.html",
      createPopoutWindowOptions: () => ({
        width: 1000,
        height: 700,
      }),
    })
    manager.registerMainWindow(mainWindow as any)

    const result = manager.moveSessionPanel({
      panelID: "session:missing",
      sourceSurfaceID: "popout:missing",
      targetSurfaceID: "main",
    })

    expect(result.ok).toBe(false)
    expect(result.reason).toBe("missing-surface")
  })
})
