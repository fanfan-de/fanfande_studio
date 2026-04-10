import { beforeEach, describe, expect, it } from "vitest"
import {
  clearTerminalWorkspaceState,
  createEmptyTerminalWorkspaceState,
  loadTerminalWorkspaceState,
  saveTerminalWorkspaceState,
} from "./storage"

describe("terminal storage", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("restores the saved terminal workspace snapshot", () => {
    saveTerminalWorkspaceState({
      isOpen: true,
      activePtyID: "pty-1",
      order: ["pty-1"],
      panelHeight: 320,
      sessions: {
        "pty-1": {
          ptyID: "pty-1",
          title: "Workspace shell",
          cwd: "C:\\Projects\\fanfande_studio",
          shell: "powershell.exe",
          rows: 40,
          cols: 120,
          status: "running",
          exitCode: null,
          createdAt: 10,
          updatedAt: 20,
          cursor: 11,
          buffer: "hello world",
          scrollTop: 4,
          transportState: "connected",
        },
      },
    })

    const restored = loadTerminalWorkspaceState()

    expect(restored.isOpen).toBe(true)
    expect(restored.activePtyID).toBe("pty-1")
    expect(restored.panelHeight).toBe(320)
    expect(restored.sessions["pty-1"]).toMatchObject({
      title: "Workspace shell",
      buffer: "",
      cursor: 0,
      scrollTop: 4,
      transportState: "idle",
    })
  })

  it("falls back to the empty workspace shape for invalid payloads", () => {
    window.localStorage.setItem("desktop.terminal.workspace.v1", JSON.stringify({ version: 999 }))

    expect(loadTerminalWorkspaceState()).toEqual(createEmptyTerminalWorkspaceState())
  })

  it("clears the saved workspace snapshot", () => {
    saveTerminalWorkspaceState({
      ...createEmptyTerminalWorkspaceState(),
      isOpen: true,
    })

    clearTerminalWorkspaceState()

    expect(loadTerminalWorkspaceState()).toEqual(createEmptyTerminalWorkspaceState())
  })
})
