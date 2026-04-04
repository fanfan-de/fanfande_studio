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
      getSessionHistory: vi.fn().mockResolvedValue([]),
      getGlobalProviderCatalog: vi.fn().mockResolvedValue([]),
      getGlobalModels: vi.fn().mockResolvedValue({
        items: [],
        selection: {},
      }),
      updateGlobalProvider: vi.fn().mockResolvedValue({
        provider: {
          id: "deepseek",
          name: "DeepSeek",
          available: true,
          apiKeyConfigured: true,
        },
        selection: {},
      }),
      deleteGlobalProvider: vi.fn().mockResolvedValue({
        providerID: "deepseek",
        selection: {},
      }),
      updateGlobalModelSelection: vi.fn().mockResolvedValue({
        model: "deepseek/deepseek-reasoner",
      }),
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
    expect(screen.queryByRole("button", { name: "Toggle sidebar density" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "app" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "\u79FB\u9664 app" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Create session for app" })).toBeInTheDocument()
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

  it("rebuilds the active session history from the server after startup", async () => {
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
    ])
    window.desktop!.getSessionHistory = vi.fn().mockResolvedValue([
      {
        info: {
          id: "msg-user-1",
          sessionID: "session-atlas-review",
          role: "user",
          created: 100,
        },
        parts: [{ id: "part-user-1", type: "text", text: "Recover the server session" }],
      },
      {
        info: {
          id: "msg-assistant-1",
          sessionID: "session-atlas-review",
          role: "assistant",
          created: 101,
        },
        parts: [{ id: "part-text-1", type: "text", text: "History restored from backend" }],
      },
    ])

    render(<App />)

    expect(await screen.findByText("Recover the server session")).toBeInTheDocument()
    expect(screen.getByText("History restored from backend")).toBeInTheDocument()
    expect(window.desktop!.getSessionHistory).toHaveBeenCalledWith({
      sessionID: "session-atlas-review",
    })
  })

  it("reloads session history from the server when switching sessions in the sidebar", async () => {
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
          {
            id: "session-atlas-followup",
            projectID: "project-atlas",
            directory: "C:\\Projects\\Atlas\\client",
            title: "Atlas followup",
            created: 11,
            updated: 19,
          },
        ],
      },
    ])
    window.desktop!.getSessionHistory = vi
      .fn()
      .mockResolvedValueOnce([
        {
          info: {
            id: "msg-user-1",
            sessionID: "session-atlas-review",
            role: "user",
            created: 100,
          },
          parts: [{ id: "part-user-1", type: "text", text: "First session prompt" }],
        },
      ])
      .mockResolvedValueOnce([
        {
          info: {
            id: "msg-user-2",
            sessionID: "session-atlas-followup",
            role: "user",
            created: 110,
          },
          parts: [{ id: "part-user-2", type: "text", text: "Second session prompt" }],
        },
        {
          info: {
            id: "msg-assistant-2",
            sessionID: "session-atlas-followup",
            role: "assistant",
            created: 111,
          },
          parts: [{ id: "part-text-2", type: "text", text: "Second session reply" }],
        },
      ])

    render(<App />)

    expect(await screen.findByText("First session prompt")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Atlas followup" }))

    expect(await screen.findByText("Second session prompt")).toBeInTheDocument()
    expect(screen.getByText("Second session reply")).toBeInTheDocument()
    await waitFor(() => {
      expect(window.desktop!.getSessionHistory).toHaveBeenNthCalledWith(1, {
        sessionID: "session-atlas-review",
      })
      expect(window.desktop!.getSessionHistory).toHaveBeenNthCalledWith(2, {
        sessionID: "session-atlas-followup",
      })
    })
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
    expect((await screen.findByRole("button", { name: "client" })).closest(".project-row")).toHaveClass("is-active")

    fireEvent.click(openFolder)

    await waitFor(() => {
      expect(window.desktop!.openFolderWorkspace).toHaveBeenCalledTimes(2)
      expect(window.desktop!.openFolderWorkspace).toHaveBeenNthCalledWith(2, {
        directory: "C:\\Projects\\Nova\\server",
      })
    })

    expect((await screen.findByRole("button", { name: "server" })).closest(".project-row")).toHaveClass("is-active")
    expect(screen.getByRole("button", { name: "client" }).closest(".project-row")).not.toHaveClass("is-active")
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
    await waitFor(() => {
      expect(document.querySelectorAll(".thread-column .turn")).toHaveLength(0)
    })
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

    expect(screen.getByRole("button", { name: "src" }).closest(".project-row")).toHaveClass("is-active")
    expect(screen.getByRole("button", { name: "app" }).closest(".project-row")).not.toHaveClass("is-active")
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

  it("creates a session from the folder row action", async () => {
    window.desktop!.createFolderSession = vi.fn().mockResolvedValue({
      session: {
        id: "session-layout-scratch",
        projectID: "project-1",
        directory: "C:\\Projects\\Project 1\\src",
        title: "Layout scratch",
        created: 1,
        updated: 2,
      },
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Create session for src" }))

    await waitFor(() => {
      expect(window.desktop!.createFolderSession).toHaveBeenCalledWith({
        projectID: "project-1",
        directory: "C:\\Projects\\Project 1\\src",
      })
    })

    expect(await screen.findByRole("button", { name: "Layout scratch" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "src" }).closest(".project-row")).toHaveClass("is-active")
  })

  it("opens global provider settings", async () => {
    window.desktop!.getGlobalProviderCatalog = vi.fn().mockResolvedValue([
      {
        id: "deepseek",
        name: "DeepSeek",
        source: "config",
        env: ["DEEPSEEK_API_KEY"],
        configured: true,
        available: true,
        apiKeyConfigured: true,
        baseURL: "https://api.deepseek.com",
        modelCount: 1,
      },
      {
        id: "openai",
        name: "OpenAI",
        source: "api",
        env: ["OPENAI_API_KEY"],
        configured: false,
        available: false,
        apiKeyConfigured: false,
        baseURL: "https://api.openai.com/v1",
        modelCount: 1,
      },
    ])
    window.desktop!.getGlobalModels = vi.fn().mockResolvedValue({
      items: [
        {
          id: "deepseek-reasoner",
          providerID: "deepseek",
          name: "DeepSeek Reasoner",
          status: "active",
          available: true,
          capabilities: {
            temperature: true,
            reasoning: true,
            attachment: false,
            toolcall: true,
            input: {
              text: true,
              audio: false,
              image: false,
              video: false,
              pdf: false,
            },
            output: {
              text: true,
              audio: false,
              image: false,
              video: false,
              pdf: false,
            },
          },
          limit: {
            context: 128000,
            output: 8192,
          },
        },
      ],
      selection: {
        model: "deepseek/deepseek-reasoner",
      },
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }))

    const settingsDialog = await screen.findByRole("dialog", { name: "Settings" })

    expect(settingsDialog).toHaveClass("settings-page")
    expect(screen.getByText("Manage shared providers and models for the app.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Provider/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Models/ })).toBeInTheDocument()
    expect(screen.queryByText("Choose a provider on the left, then edit the shared credentials and endpoint used across the app.")).not.toBeInTheDocument()
    expect(screen.queryByText("Providers discovered from the catalog, environment, and saved config.")).not.toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Search providers" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /DeepSeek.*Connected/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /OpenAI.*Not connected/ })).toBeInTheDocument()
    expect(await screen.findByRole("heading", { name: "Provider Configuration" })).toBeInTheDocument()
    expect(screen.getByLabelText("API key for DeepSeek")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /^Models/ }))

    expect(screen.getByLabelText("Primary model")).toHaveValue("deepseek/deepseek-reasoner")
    expect(screen.getByRole("heading", { name: "Connected Models" })).toBeInTheDocument()
    expect(screen.getByText("DeepSeek Reasoner")).toBeInTheDocument()

    await waitFor(() => {
      expect(window.desktop!.getGlobalProviderCatalog).toHaveBeenCalledTimes(1)
      expect(window.desktop!.getGlobalModels).toHaveBeenCalledTimes(1)
    })
  })

  it("saves provider overrides from the settings page", async () => {
    window.desktop!.getGlobalProviderCatalog = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: "deepseek",
          name: "DeepSeek",
          source: "api",
          env: ["DEEPSEEK_API_KEY"],
          configured: false,
          available: false,
          apiKeyConfigured: false,
          baseURL: "https://api.deepseek.com",
          modelCount: 1,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "deepseek",
          name: "DeepSeek",
          source: "config",
          env: ["DEEPSEEK_API_KEY"],
          configured: true,
          available: true,
          apiKeyConfigured: true,
          baseURL: "https://proxy.deepseek.test/v1",
          modelCount: 1,
        },
      ])
    window.desktop!.getGlobalModels = vi
      .fn()
      .mockResolvedValueOnce({
        items: [],
        selection: {},
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: "deepseek-reasoner",
            providerID: "deepseek",
            name: "DeepSeek Reasoner",
            status: "active",
            available: true,
            capabilities: {
              temperature: true,
              reasoning: true,
              attachment: false,
              toolcall: true,
              input: {
                text: true,
                audio: false,
                image: false,
                video: false,
                pdf: false,
              },
              output: {
                text: true,
                audio: false,
                image: false,
                video: false,
                pdf: false,
              },
            },
            limit: {
              context: 128000,
              output: 8192,
            },
          },
        ],
        selection: {},
      })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }))
    await screen.findByRole("dialog", { name: "Settings" })
    await screen.findByRole("heading", { name: "Provider Configuration" })

    fireEvent.change(screen.getByLabelText("API key for DeepSeek"), {
      target: {
        value: "sk-deepseek-test",
      },
    })
    fireEvent.change(screen.getByLabelText("Base URL for DeepSeek"), {
      target: {
        value: "https://proxy.deepseek.test/v1",
      },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save DeepSeek settings" }))

    await waitFor(() => {
      expect(window.desktop!.updateGlobalProvider).toHaveBeenCalledWith({
        providerID: "deepseek",
        provider: {
          name: "DeepSeek",
          env: ["DEEPSEEK_API_KEY"],
          options: {
            apiKey: "sk-deepseek-test",
            baseURL: "https://proxy.deepseek.test/v1",
          },
        },
      })
    })

    expect(await screen.findByText("Provider settings saved.")).toBeInTheDocument()
    expect(window.desktop!.getGlobalProviderCatalog).toHaveBeenCalledTimes(2)
    expect(window.desktop!.getGlobalModels).toHaveBeenCalledTimes(2)
  })

  it("closes settings on escape or backdrop click", async () => {
    window.desktop!.getGlobalProviderCatalog = vi.fn().mockResolvedValue([
      {
        id: "deepseek",
        name: "DeepSeek",
        source: "config",
        env: ["DEEPSEEK_API_KEY"],
        configured: true,
        available: true,
        apiKeyConfigured: true,
        baseURL: "https://api.deepseek.com",
        modelCount: 1,
      },
    ])
    window.desktop!.getGlobalModels = vi.fn().mockResolvedValue({
      items: [],
      selection: {},
    })

    const { container } = render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }))
    expect(await screen.findByRole("dialog", { name: "Settings" })).toBeInTheDocument()

    const settingsOverlay = container.querySelector(".settings-page-overlay")
    expect(settingsOverlay).not.toBeNull()
    fireEvent.click(settingsOverlay!)

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }))
    expect(await screen.findByRole("dialog", { name: "Settings" })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: "Escape" })

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument()
    })
  })

  it("updates the global model selection from settings", async () => {
    window.desktop!.getGlobalProviderCatalog = vi.fn().mockResolvedValue([
      {
        id: "deepseek",
        name: "DeepSeek",
        source: "config",
        env: ["DEEPSEEK_API_KEY"],
        configured: true,
        available: true,
        apiKeyConfigured: true,
        baseURL: "https://api.deepseek.com",
        modelCount: 1,
      },
      {
        id: "openai",
        name: "OpenAI",
        source: "config",
        env: ["OPENAI_API_KEY"],
        configured: true,
        available: true,
        apiKeyConfigured: true,
        baseURL: "https://api.openai.com/v1",
        modelCount: 1,
      },
    ])
    window.desktop!.getGlobalModels = vi.fn().mockResolvedValue({
      items: [
        {
          id: "deepseek-reasoner",
          providerID: "deepseek",
          name: "DeepSeek Reasoner",
          status: "active",
          available: true,
          capabilities: {
            temperature: true,
            reasoning: true,
            attachment: false,
            toolcall: true,
            input: {
              text: true,
              audio: false,
              image: false,
              video: false,
              pdf: false,
            },
            output: {
              text: true,
              audio: false,
              image: false,
              video: false,
              pdf: false,
            },
          },
          limit: {
            context: 128000,
            output: 8192,
          },
        },
        {
          id: "gpt-4o-mini",
          providerID: "openai",
          name: "GPT-4o mini",
          status: "active",
          available: true,
          capabilities: {
            temperature: true,
            reasoning: false,
            attachment: true,
            toolcall: true,
            input: {
              text: true,
              audio: false,
              image: true,
              video: false,
              pdf: false,
            },
            output: {
              text: true,
              audio: false,
              image: false,
              video: false,
              pdf: false,
            },
          },
          limit: {
            context: 128000,
            output: 8192,
          },
        },
      ],
      selection: {
        model: "deepseek/deepseek-reasoner",
      },
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }))
    await screen.findByRole("dialog", { name: "Settings" })
    fireEvent.click(screen.getByRole("button", { name: /^Models/ }))
    expect(screen.getByText("GPT-4o mini")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Primary model"), {
      target: {
        value: "openai/gpt-4o-mini",
      },
    })
    fireEvent.change(screen.getByLabelText("Small model"), {
      target: {
        value: "deepseek/deepseek-reasoner",
      },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save model selection" }))

    await waitFor(() => {
      expect(window.desktop!.updateGlobalModelSelection).toHaveBeenCalledWith({
        model: "openai/gpt-4o-mini",
        small_model: "deepseek/deepseek-reasoner",
      })
    })

    expect(await screen.findByText("Model settings saved.")).toBeInTheDocument()
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

  it("removes a folder from the sidebar without deleting it from the backend", () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "\u79FB\u9664 app" }))

    expect(screen.queryByRole("button", { name: "app" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Chat 1" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "src" }).closest(".project-row")).toHaveClass("is-active")
    expect(screen.getByRole("button", { name: "Layout pass" })).toBeInTheDocument()
    expect(window.desktop!.deleteProjectWorkspace).not.toHaveBeenCalled()
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

    const streamingAnswer = await screen.findByText("Streaming answer")
    const liveReasoning = screen.getByText("Planning live update.")
    const reasoningItem = liveReasoning.closest(".trace-item")
    const textItem = streamingAnswer.closest(".trace-item")

    expect(liveReasoning).toBeInTheDocument()
    expect(reasoningItem).toHaveAttribute("data-kind", "reasoning")
    expect(textItem).toHaveAttribute("data-kind", "text")
    expect(reasoningItem).not.toBeNull()
    expect(textItem).not.toBeNull()
    const documentPosition = reasoningItem && textItem ? reasoningItem.compareDocumentPosition(textItem) : 0
    expect(documentPosition & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "Streaming response" })).not.toBeInTheDocument()
    expect(screen.queryByText("Renderer subscribed to live backend updates.")).not.toBeInTheDocument()
    expect(screen.queryByText("Waiting for backend response.")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Send task" })).toBeDisabled()

    finishStream?.()

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Backend response received" })).not.toBeInTheDocument()
      expect(screen.queryByText("Backend finished streaming this turn.")).not.toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Send task" })).toBeEnabled()
    })
  })

  it("keeps consecutive streamed replies isolated to their own assistant cards", async () => {
    let streamListener:
      | ((event: {
          streamID: string
          event: string
          data: unknown
        }) => void)
      | undefined
    let callIndex = 0
    const streamedReplies = [
      {
        delta: "First reply",
        fullText: "First reply",
        finalText: "First reply",
      },
      {
        delta: "Second reply",
        fullText: "First replySecond reply",
        finalText: "Second reply",
      },
    ]

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
        const reply = streamedReplies[callIndex++]
        if (!reply) {
          throw new Error("Unexpected extra streamed reply")
        }

        streamListener?.({
          streamID: input.streamID,
          event: "started",
          data: { sessionID: input.sessionID },
        })
        streamListener?.({
          streamID: input.streamID,
          event: "delta",
          data: {
            kind: "text",
            delta: reply.delta,
            text: reply.fullText,
          },
        })
        streamListener?.({
          streamID: input.streamID,
          event: "done",
          data: {
            sessionID: input.sessionID,
            parts: [{ id: `part-text-${callIndex}`, type: "text", text: reply.finalText }],
          },
        })

        return {
          streamID: input.streamID,
        }
      },
    )

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.onAgentStreamEvent).toHaveBeenCalledTimes(1)
    })

    const draftInput = screen.getByRole("textbox", { name: "Task draft" })
    const sendButton = screen.getByRole("button", { name: "Send task" })

    fireEvent.change(draftInput, {
      target: {
        value: "First prompt",
      },
    })
    fireEvent.click(sendButton)

    expect(await screen.findByText("First reply")).toBeInTheDocument()
    await waitFor(() => {
      expect(sendButton).toBeEnabled()
    })

    fireEvent.change(screen.getByRole("textbox", { name: "Task draft" }), {
      target: {
        value: "Second prompt",
      },
    })
    fireEvent.click(screen.getByRole("button", { name: "Send task" }))

    expect(await screen.findByText("Second reply")).toBeInTheDocument()

    await waitFor(() => {
      const firstReplyTurn = screen.getByText("First reply").closest(".assistant-turn")
      const secondReplyTurn = screen.getByText("Second reply").closest(".assistant-turn")

      expect(firstReplyTurn).not.toBeNull()
      expect(secondReplyTurn).not.toBeNull()
      expect(firstReplyTurn).not.toBe(secondReplyTurn)
      expect(secondReplyTurn).not.toHaveTextContent("First reply")
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

  it("keeps session rows aligned with folder labels and gives them the same hover treatment", () => {
    expect(styles).toMatch(/\.session-tree\s*\{[^}]*padding-left:\s*calc\(8px \+ 24px \+ 7px\);/s)
    expect(styles).toMatch(
      /\.project-row:hover,\s*\.project-row:focus-within,\s*\.session-row:hover,\s*\.session-row:focus-visible\s*\{[^}]*background:\s*rgba\(22,\s*119,\s*200,\s*0\.08\);/s,
    )
  })

  it("keeps rounded corners only on the prompt input shell", () => {
    const nonZeroBorderRadii = Array.from(styles.matchAll(/border-radius:\s*([^;]+);/g))
      .map(([, value]) => value.trim())
      .filter((value) => !/^0(?:\s|$)/.test(value))

    expect(nonZeroBorderRadii).toEqual(["28px"])
    expect(styles).toMatch(/\.prompt-input-shell\s*\{[^}]*border-radius:\s*28px;/s)
  })

  it("gives tool trace items a dedicated visual style", () => {
    expect(styles).toMatch(/\.trace-kind-tool\s*\{[^}]*linear-gradient/s)
    expect(styles).toMatch(/\.trace-kind-tool\s+\.trace-item-title,\s*\.trace-kind-tool\s+\.trace-item-detail\s*\{[^}]*font-family:/s)
  })

  it("keeps settings surfaces constrained as centered dialogs", () => {
    expect(styles).toMatch(/\.settings-page-overlay\s*\{[^}]*display:\s*grid;[^}]*place-items:\s*center;[^}]*overflow:\s*auto;/s)
    expect(styles).toMatch(/\.settings-page\s*\{[^}]*width:\s*min\(100%,\s*1320px\);[^}]*max-height:\s*min\(calc\(100dvh - 64px\),\s*860px\);/s)
    expect(styles).toMatch(/\.settings-page-body,\s*\.settings-page-shell\s*\{[^}]*grid-template-columns:\s*220px minmax\(0,\s*1fr\);/s)
    expect(styles).toMatch(/\.settings-services-layout\s*\{[^}]*grid-template-columns:\s*320px minmax\(0,\s*1fr\);/s)
  })

  it("scopes provider scrolling to the column layout", () => {
    expect(styles).toMatch(/\.settings-page-main\.is-services\s*\{[^}]*overflow:\s*hidden;/s)
    expect(styles).toMatch(/\.settings-service-list\s*\{[^}]*overflow:\s*auto;/s)
    expect(styles).toMatch(/\.settings-service-detail-panel\s*\{[^}]*overflow:\s*auto;/s)
  })
})
