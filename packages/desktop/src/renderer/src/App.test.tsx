import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { App } from "./App"

const styles = readFileSync(resolve(process.cwd(), "src/renderer/src/styles.css"), "utf8")

describe("App", () => {
  beforeEach(() => {
    window.desktop = {
      platform: "win32",
      versions: {
        node: "22.0.0",
        chrome: "130.0.0",
        electron: "39.0.0",
      } as NodeJS.ProcessVersions,
      getInfo: vi.fn().mockResolvedValue({
        platform: "win32",
        node: "22.0.0",
        chrome: "130.0.0",
        electron: "39.0.0",
      }),
      getWindowState: vi.fn().mockResolvedValue({
        isMaximized: false,
      }),
      getAgentConfig: vi.fn().mockResolvedValue({
        baseURL: "http://127.0.0.1:4096",
        defaultDirectory: "C:\\Projects\\fanfande_studio",
      }),
      getAgentHealth: vi.fn().mockResolvedValue({
        ok: false,
        baseURL: "http://127.0.0.1:4096",
      }),
      pickProjectDirectory: vi.fn().mockResolvedValue(null),
      listFolderWorkspaces: vi.fn().mockRejectedValue(new Error("backend unavailable")),
      openFolderWorkspace: vi.fn(),
      createFolderSession: vi.fn(),
      deleteProjectWorkspace: vi.fn(),
      deleteAgentSession: vi.fn(),
      createAgentSession: vi.fn().mockResolvedValue({
        session: {
          id: "session-backend",
          projectID: "project-backend",
          directory: "C:\\Projects\\fanfande_studio",
          title: "Backend session",
        },
      }),
      sendAgentMessage: vi.fn().mockResolvedValue({
        events: [{ event: "delta", data: { kind: "text", delta: "ok" } }],
      }),
      showMenu: vi.fn().mockResolvedValue(undefined),
      windowAction: vi.fn().mockResolvedValue(undefined),
      onWindowStateChange: vi.fn(() => vi.fn()),
    }
  })

  it("renders the custom desktop titlebar and folder workspace", async () => {
    const { container } = render(<App />)

    expect(screen.getByRole("button", { name: "File" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Minimize window" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open folder" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Create session" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "app" })).toBeInTheDocument()
    expect(screen.getByText("Project 2")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Chat 1" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Overview" })).toBeInTheDocument()
    await waitFor(() => {
      expect(container.querySelector(".canvas-header")).not.toBeInTheDocument()
      expect(container.querySelector(".signal-row")).not.toBeInTheDocument()
    })
    expect(screen.getByRole("textbox", { name: "Task draft" }).closest("footer")).toHaveClass("prompt-input-shell")
  })

  it("loads folder and session lists into the sidebar on startup", async () => {
    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([
      {
        id: "C:\\Projects\\Atlas\\client",
        directory: "C:\\Projects\\Atlas\\client",
        name: "client",
        created: 1,
        updated: 20,
        project: {
          id: "project-atlas",
          name: "Atlas",
          worktree: "C:\\Projects\\Atlas",
        },
        sessions: [
          {
            id: "session-atlas-review",
            projectID: "project-atlas",
            directory: "C:\\Projects\\Atlas\\client",
            title: "Atlas review",
            created: 10,
            updated: 20,
          },
        ],
      },
      {
        id: "C:\\Projects\\Beacon\\server",
        directory: "C:\\Projects\\Beacon\\server",
        name: "server",
        created: 2,
        updated: 5,
        project: {
          id: "project-beacon",
          name: "Beacon",
          worktree: "C:\\Projects\\Beacon",
        },
        sessions: [
          {
            id: "session-beacon-ship",
            projectID: "project-beacon",
            directory: "C:\\Projects\\Beacon\\server",
            title: "Beacon ship",
            created: 3,
            updated: 5,
          },
        ],
      },
    ])

    render(<App />)

    expect(await screen.findByRole("button", { name: "client" })).toBeInTheDocument()
    expect(screen.getByText("Atlas")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Atlas review" })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "app" })).not.toBeInTheDocument()
    })
    expect(window.desktop!.listFolderWorkspaces).toHaveBeenCalledTimes(1)
  })

  it("keeps the seed sidebar when startup folder loading fails", async () => {
    window.desktop!.listFolderWorkspaces = vi.fn().mockRejectedValue(new Error("backend unavailable"))

    render(<App />)

    expect(await screen.findByRole("button", { name: "app" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Chat 1" })).toBeInTheDocument()
    await waitFor(() => {
      expect(window.desktop!.listFolderWorkspaces).toHaveBeenCalledTimes(1)
    })
  })

  it("opens a folder from a selected directory and appends it to the sidebar", async () => {
    window.desktop!.pickProjectDirectory = vi.fn().mockResolvedValue("C:\\Projects\\Orion\\client")
    window.desktop!.openFolderWorkspace = vi.fn().mockResolvedValue({
      id: "C:\\Projects\\Orion\\client",
      directory: "C:\\Projects\\Orion\\client",
      name: "client",
      created: 1,
      updated: 2,
      project: {
        id: "project-orion",
        name: "Orion",
        worktree: "C:\\Projects\\Orion",
      },
      sessions: [],
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }))

    await waitFor(() => {
      expect(window.desktop!.pickProjectDirectory).toHaveBeenCalledTimes(1)
      expect(window.desktop!.openFolderWorkspace).toHaveBeenCalledWith({
        directory: "C:\\Projects\\Orion\\client",
      })
    })
    expect(await screen.findByRole("button", { name: "client" })).toBeInTheDocument()
    expect(screen.getByText("Orion")).toBeInTheDocument()
  })

  it("shows each newly opened folder and keeps only the latest one selected", async () => {
    window.desktop!.pickProjectDirectory = vi
      .fn()
      .mockResolvedValueOnce("C:\\Projects\\Orion\\client")
      .mockResolvedValueOnce("C:\\Projects\\Nova\\server")
    window.desktop!.openFolderWorkspace = vi
      .fn()
      .mockResolvedValueOnce({
        id: "C:\\Projects\\Orion\\client",
        directory: "C:\\Projects\\Orion\\client",
        name: "client",
        created: 1,
        updated: 2,
        project: {
          id: "project-orion",
          name: "Orion",
          worktree: "C:\\Projects\\Orion",
        },
        sessions: [],
      })
      .mockResolvedValueOnce({
        id: "C:\\Projects\\Nova\\server",
        directory: "C:\\Projects\\Nova\\server",
        name: "server",
        created: 3,
        updated: 4,
        project: {
          id: "project-nova",
          name: "Nova",
          worktree: "C:\\Projects\\Nova",
        },
        sessions: [],
      })

    render(<App />)

    const openFolder = screen.getByRole("button", { name: "Open folder" })
    fireEvent.click(openFolder)
    expect(await screen.findByRole("button", { name: "client" })).toHaveClass("is-active")

    fireEvent.click(openFolder)

    await waitFor(() => {
      expect(window.desktop!.openFolderWorkspace).toHaveBeenCalledTimes(2)
      expect(window.desktop!.openFolderWorkspace).toHaveBeenNthCalledWith(2, {
        directory: "C:\\Projects\\Nova\\server",
      })
    })

    expect(await screen.findByRole("button", { name: "server" })).toHaveClass("is-active")
    expect(screen.getByRole("button", { name: "client" })).not.toHaveClass("is-active")
    expect(document.querySelectorAll(".project-row.is-active")).toHaveLength(1)
  })

  it("does not open a folder when directory selection is cancelled", async () => {
    window.desktop!.pickProjectDirectory = vi.fn().mockResolvedValue(null)
    window.desktop!.openFolderWorkspace = vi.fn()

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }))

    await waitFor(() => {
      expect(window.desktop!.pickProjectDirectory).toHaveBeenCalledTimes(1)
    })
    expect(window.desktop!.openFolderWorkspace).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "app" })).toBeInTheDocument()
  })

  it("creates a persisted session for the selected folder", async () => {
    window.desktop!.createFolderSession = vi.fn().mockResolvedValue({
      session: {
        id: "session-backend-new",
        projectID: "project-2",
        directory: "C:\\Projects\\Project 2\\app",
        title: "Backend chat",
        created: 1,
        updated: 2,
      },
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Create session" }))

    await waitFor(() => {
      expect(window.desktop!.createFolderSession).toHaveBeenCalledWith({
        projectID: "project-2",
        directory: "C:\\Projects\\Project 2\\app",
      })
    })
    expect(await screen.findByRole("button", { name: "Backend chat" })).toBeInTheDocument()
  })

  it("creates a session only for the currently selected folder", async () => {
    window.desktop!.createFolderSession = vi.fn().mockResolvedValue({
      session: {
        id: "session-layout-next",
        projectID: "project-1",
        directory: "C:\\Projects\\Project 1\\src",
        title: "Layout follow-up",
        created: 1,
        updated: 2,
      },
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "src" }))

    expect(screen.getByRole("button", { name: "src" })).toHaveClass("is-active")
    expect(screen.getByRole("button", { name: "app" })).not.toHaveClass("is-active")
    expect(document.querySelectorAll(".project-row.is-active")).toHaveLength(1)

    fireEvent.click(screen.getByRole("button", { name: "Create session" }))

    await waitFor(() => {
      expect(window.desktop!.createFolderSession).toHaveBeenCalledTimes(1)
      expect(window.desktop!.createFolderSession).toHaveBeenCalledWith({
        projectID: "project-1",
        directory: "C:\\Projects\\Project 1\\src",
      })
    })

    expect(await screen.findByRole("button", { name: "Layout follow-up" })).toBeInTheDocument()
    expect(document.querySelectorAll(".project-row.is-active")).toHaveLength(1)
  })

  it("deletes a session from the sidebar", async () => {
    window.desktop!.deleteAgentSession = vi.fn().mockResolvedValue({
      sessionID: "session-chat-1",
      projectID: "project-2",
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Delete session Chat 1" }))

    await waitFor(() => {
      expect(window.desktop!.deleteAgentSession).toHaveBeenCalledWith({
        sessionID: "session-chat-1",
      })
    })
    expect(screen.queryByRole("button", { name: "Chat 1" })).not.toBeInTheDocument()
  })

  it("applies maximized window styling when the window starts maximized", async () => {
    window.desktop!.getWindowState = vi.fn().mockResolvedValue({
      isMaximized: true,
    })

    const { container } = render(<App />)

    await waitFor(() => {
      expect(container.firstChild).toHaveClass("window-shell", "is-maximized")
    })
  })

  it("appends a prompt and clears the draft input", async () => {
    render(<App />)

    fireEvent.change(screen.getByRole("textbox", { name: "Task draft" }), {
      target: {
        value: "Ship custom titlebar",
      },
    })
    fireEvent.click(screen.getByRole("button", { name: "Send task" }))

    await waitFor(() => {
      expect(screen.getAllByText("Ship custom titlebar").length).toBeGreaterThan(0)
      expect(screen.getByRole("textbox", { name: "Task draft" })).toHaveValue("")
    })
  })

  it("renders streamed agent output before the request promise resolves", async () => {
    let streamListener:
      | ((event: {
          streamID: string
          event: string
          data: unknown
        }) => void)
      | undefined
    let finishStream: (() => void) | undefined

    window.desktop!.getAgentHealth = vi.fn().mockResolvedValue({
      ok: true,
      baseURL: "http://127.0.0.1:4096",
    })
    window.desktop!.onAgentStreamEvent = vi.fn((listener) => {
      streamListener = listener
      return vi.fn()
    })
    window.desktop!.streamAgentMessage = vi.fn().mockImplementation(
      async (input: {
        streamID: string
        sessionID: string
        text: string
      }) => {
        streamListener?.({
          streamID: input.streamID,
          event: "started",
          data: { sessionID: input.sessionID },
        })
        streamListener?.({
          streamID: input.streamID,
          event: "delta",
          data: { kind: "reasoning", delta: "Planning live update." },
        })
        streamListener?.({
          streamID: input.streamID,
          event: "delta",
          data: { kind: "text", delta: "Streaming answer" },
        })

        await new Promise<void>((resolve) => {
          finishStream = () => {
            streamListener?.({
              streamID: input.streamID,
              event: "done",
              data: {
                sessionID: input.sessionID,
                parts: [{ id: "part-text", type: "text", text: "Streaming answer" }],
              },
            })
            resolve()
          }
        })

        return {
          streamID: input.streamID,
        }
      },
    )

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.getAgentHealth).toHaveBeenCalledTimes(1)
      expect(window.desktop!.onAgentStreamEvent).toHaveBeenCalledTimes(1)
    })

    fireEvent.change(screen.getByRole("textbox", { name: "Task draft" }), {
      target: {
        value: "Show live output",
      },
    })
    fireEvent.click(screen.getByRole("button", { name: "Send task" }))

    expect(await screen.findByText("Streaming answer")).toBeInTheDocument()
    expect(screen.getByText("Planning live update.")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Streaming response" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Send task" })).toBeDisabled()

    finishStream?.()

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Backend response received" })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Send task" })).toBeEnabled()
    })
  })

  it("toggles folder tree expansion when clicking the same folder", () => {
    render(<App />)

    const appFolder = screen.getByRole("button", { name: "app" })
    expect(appFolder).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("button", { name: "Chat 1" })).toBeInTheDocument()

    fireEvent.click(appFolder)

    expect(appFolder).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("button", { name: "Chat 1" })).not.toBeInTheDocument()

    fireEvent.click(appFolder)

    expect(appFolder).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("button", { name: "Chat 1" })).toBeInTheDocument()
  })

  it("resizes the sidebar when dragging the divider", async () => {
    const { container } = render(<App />)
    const appShell = container.querySelector(".app-shell") as HTMLElement | null

    expect(appShell).not.toBeNull()
    Object.defineProperty(appShell!, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 1200,
        bottom: 800,
        width: 1200,
        height: 800,
        toJSON: () => ({}),
      }),
    })

    expect(appShell!.getAttribute("style")).toContain("--sidebar-width: 236px")

    fireEvent.pointerDown(screen.getByTestId("sidebar-resizer"), {
      button: 0,
      clientX: 236,
    })

    await waitFor(() => {
      expect(document.body).toHaveClass("is-resizing-sidebar")
    })

    fireEvent.pointerMove(window, {
      clientX: 320,
    })
    expect(appShell!.getAttribute("style")).toContain("--sidebar-width: 320px")

    fireEvent.pointerMove(window, {
      clientX: 640,
    })
    expect(appShell!.getAttribute("style")).toContain("--sidebar-width: 420px")

    fireEvent.pointerMove(window, {
      clientX: 120,
    })
    expect(appShell!.getAttribute("style")).toContain("--sidebar-width: 192px")

    fireEvent.pointerUp(window)

    await waitFor(() => {
      expect(document.body).not.toHaveClass("is-resizing-sidebar")
    })
  })

  it("shows expand/collapse icon only while hovering a folder row", () => {
    render(<App />)

    const appFolder = screen.getByRole("button", { name: "app" })
    const appFolderLeading = appFolder.querySelector(".project-row-leading")
    const srcFolder = screen.getByRole("button", { name: "src" })
    const srcFolderLeading = srcFolder.querySelector(".project-row-leading")

    expect(appFolderLeading).toHaveAttribute("data-icon", "folder")
    expect(srcFolderLeading).toHaveAttribute("data-icon", "folder")

    fireEvent.mouseEnter(appFolder)
    expect(appFolderLeading).toHaveAttribute("data-icon", "expanded")

    fireEvent.mouseLeave(appFolder)
    expect(appFolderLeading).toHaveAttribute("data-icon", "folder")

    fireEvent.mouseEnter(srcFolder)
    expect(srcFolderLeading).toHaveAttribute("data-icon", "collapsed")

    fireEvent.mouseLeave(srcFolder)
    expect(srcFolderLeading).toHaveAttribute("data-icon", "folder")
  })

  it("keeps rounded corners only on the prompt input shell", () => {
    const nonZeroBorderRadii = Array.from(styles.matchAll(/border-radius:\s*([^;]+);/g))
      .map(([, value]) => value.trim())
      .filter((value) => !/^0(?:\s|$)/.test(value))

    expect(nonZeroBorderRadii).toEqual(["28px"])
    expect(styles).toMatch(/\.prompt-input-shell\s*\{[^}]*border-radius:\s*28px;/s)
  })
})
