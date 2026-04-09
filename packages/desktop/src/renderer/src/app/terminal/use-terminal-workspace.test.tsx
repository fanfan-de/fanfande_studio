import { act } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useTerminalWorkspace } from "./use-terminal-workspace"
import type { PtyEvent } from "./types"

function Harness() {
  const terminal = useTerminalWorkspace({
    defaultCwd: "C:\\Projects\\fanfande_studio",
    currentWorkspaceDirectory: "C:\\Projects\\fanfande_studio",
  })

  return (
    <div>
      <button onClick={() => void terminal.handleTogglePanel()} type="button">
        Toggle
      </button>
      <button onClick={() => void terminal.handleCreateTerminal()} type="button">
        Create
      </button>
      <button
        disabled={!terminal.activeSession}
        onClick={() => terminal.activeSession && void terminal.handleCloseTerminal(terminal.activeSession.ptyID)}
        type="button"
      >
        Close active
      </button>
      <div data-testid="is-open">{terminal.isOpen ? "open" : "closed"}</div>
      <div data-testid="active-id">{terminal.activeSession?.ptyID ?? "none"}</div>
      <div data-testid="session-count">{String(terminal.sessions.length)}</div>
      <div data-testid="session-buffers">
        {terminal.sessions.map((session) => `${session.ptyID}:${session.buffer}`).join("|")}
      </div>
      {terminal.sessions.map((session) => (
        <button key={session.ptyID} onClick={() => terminal.handleSelectTerminal(session.ptyID)} type="button">
          {session.title}
        </button>
      ))}
    </div>
  )
}

describe("useTerminalWorkspace", () => {
  let ptyListener: ((event: PtyEvent) => void) | undefined

  beforeEach(() => {
    vi.useRealTimers()
    window.localStorage.clear()
    ptyListener = undefined

    window.desktop = {
      platform: "win32",
      versions: {} as NodeJS.ProcessVersions,
      getInfo: vi.fn(),
      createPtySession: vi
        .fn()
        .mockResolvedValueOnce({
          id: "pty-1",
          title: "Terminal 1",
          cwd: "C:\\Projects\\fanfande_studio",
          shell: "powershell.exe",
          rows: 24,
          cols: 80,
          status: "running",
          exitCode: null,
          createdAt: 1,
          updatedAt: 1,
          cursor: 0,
        })
        .mockResolvedValueOnce({
          id: "pty-2",
          title: "Terminal 2",
          cwd: "C:\\Projects\\fanfande_studio",
          shell: "powershell.exe",
          rows: 24,
          cols: 80,
          status: "running",
          exitCode: null,
          createdAt: 2,
          updatedAt: 2,
          cursor: 0,
        }),
      getPtySession: vi.fn(),
      updatePtySession: vi.fn().mockResolvedValue(undefined),
      deletePtySession: vi.fn().mockResolvedValue(undefined),
      attachPtySession: vi.fn().mockImplementation(async ({ id }: { id: string }) => ({
        id,
        title: id === "pty-1" ? "Terminal 1" : "Terminal 2",
        cwd: "C:\\Projects\\fanfande_studio",
        shell: "powershell.exe",
        rows: 24,
        cols: 80,
        status: "running",
        exitCode: null,
        createdAt: 1,
        updatedAt: 1,
        cursor: 0,
      })),
      detachPtySession: vi.fn().mockResolvedValue(true),
      writePtyInput: vi.fn().mockResolvedValue(undefined),
      onPtyEvent: vi.fn((listener: (event: PtyEvent) => void) => {
        ptyListener = listener
        return vi.fn(() => {
          ptyListener = undefined
        })
      }),
    }
  })

  it("opens the panel and auto-creates the first terminal session", async () => {
    render(<Harness />)

    fireEvent.click(screen.getByRole("button", { name: "Toggle" }))

    await waitFor(() => {
      expect(window.desktop?.createPtySession).toHaveBeenCalledTimes(1)
      expect(window.desktop?.attachPtySession).toHaveBeenCalledWith({
        id: "pty-1",
        cursor: 0,
      })
    })

    expect(screen.getByTestId("is-open")).toHaveTextContent("open")
    expect(screen.getByTestId("active-id")).toHaveTextContent("pty-1")
    expect(screen.getByTestId("session-count")).toHaveTextContent("1")
  })

  it("reconnects the active terminal with the latest cursor after an unexpected disconnect", async () => {
    render(<Harness />)

    fireEvent.click(screen.getByRole("button", { name: "Toggle" }))

    await waitFor(() => {
      expect(window.desktop?.attachPtySession).toHaveBeenCalledWith({
        id: "pty-1",
        cursor: 0,
      })
    })

    act(() => {
      ptyListener?.({
        ptyID: "pty-1",
        type: "ready",
        session: {
          id: "pty-1",
          title: "Terminal 1",
          cwd: "C:\\Projects\\fanfande_studio",
          shell: "powershell.exe",
          rows: 24,
          cols: 80,
          status: "running",
          exitCode: null,
          createdAt: 1,
          updatedAt: 1,
          cursor: 5,
        },
        replay: {
          mode: "reset",
          buffer: "hello",
          cursor: 5,
          startCursor: 0,
        },
      })
    })

    act(() => {
      ptyListener?.({
        ptyID: "pty-1",
        type: "transport",
        state: "disconnected",
        userInitiated: false,
      })
    })

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 700))
    })

    await waitFor(() => {
      expect(window.desktop?.attachPtySession).toHaveBeenLastCalledWith({
        id: "pty-1",
        cursor: 5,
      })
    })
  })

  it("replaces a restored stale terminal session when the PTY no longer exists", async () => {
    window.localStorage.setItem(
      "desktop.terminal.workspace.v1",
      JSON.stringify({
        version: 1,
        isOpen: true,
        activePtyID: "pty-stale",
        order: ["pty-stale"],
        panelHeight: 320,
        sessions: [
          {
            ptyID: "pty-stale",
            title: "Stale terminal",
            cwd: "C:\\Projects\\fanfande_studio",
            shell: "powershell.exe",
            rows: 24,
            cols: 80,
            status: "running",
            exitCode: null,
            createdAt: 1,
            updatedAt: 1,
            cursor: 7,
            buffer: "stale",
            scrollTop: 0,
          },
        ],
      }),
    )

    window.desktop!.attachPtySession = vi.fn().mockImplementation(async ({ id }: { id: string }) => {
      if (id === "pty-stale") {
        throw new Error("PTY session 'pty-stale' not found")
      }

      return {
        id,
        title: "Terminal 1",
        cwd: "C:\\Projects\\fanfande_studio",
        shell: "powershell.exe",
        rows: 24,
        cols: 80,
        status: "running",
        exitCode: null,
        createdAt: 2,
        updatedAt: 2,
        cursor: 0,
      }
    })

    render(<Harness />)

    await waitFor(() => {
      expect(window.desktop?.attachPtySession).toHaveBeenCalledWith({
        id: "pty-stale",
        cursor: 7,
      })
    })

    await waitFor(() => {
      expect(window.desktop?.createPtySession).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(window.desktop?.attachPtySession).toHaveBeenLastCalledWith({
        id: "pty-1",
        cursor: 0,
      })
    })

    expect(screen.getByTestId("is-open")).toHaveTextContent("open")
    expect(screen.getByTestId("active-id")).toHaveTextContent("pty-1")
    expect(screen.getByTestId("session-count")).toHaveTextContent("1")
  })

  it("keeps live output out of storage while reconnecting with the latest cursor", async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem")

    render(<Harness />)

    fireEvent.click(screen.getByRole("button", { name: "Toggle" }))

    await waitFor(() => {
      expect(window.desktop?.attachPtySession).toHaveBeenCalledWith({
        id: "pty-1",
        cursor: 0,
      })
    })

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 150))
    })
    setItemSpy.mockClear()

    act(() => {
      ptyListener?.({
        ptyID: "pty-1",
        type: "output",
        id: "out-1",
        data: "echo test",
        cursor: 9,
      })
    })

    act(() => {
      ptyListener?.({
        ptyID: "pty-1",
        type: "transport",
        state: "disconnected",
        userInitiated: false,
      })
    })

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 700))
    })

    await waitFor(() => {
      expect(window.desktop?.attachPtySession).toHaveBeenLastCalledWith({
        id: "pty-1",
        cursor: 9,
      })
    })

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 150))
    })

    expect(setItemSpy).not.toHaveBeenCalled()
    setItemSpy.mockRestore()
  })
})
