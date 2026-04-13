import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PermissionRequestPrompt, PermissionResolveResult } from "../../shared/permission"
import { App } from "./App"

const styles = readFileSync(resolve(process.cwd(), "src/renderer/src/styles.css"), "utf8")

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, reject, resolve }
}

function getComposerSendButton() {
  return screen.getByRole("button", { name: /^(Send|Sending) task$|^Resolve approval first$/ })
}

type PermissionRequestPromptOverrides = Omit<Partial<PermissionRequestPrompt>, "prompt" | "resolution"> & {
  prompt?: Omit<Partial<PermissionRequestPrompt["prompt"]>, "details"> & {
    details?: Partial<NonNullable<PermissionRequestPrompt["prompt"]["details"]>>
  }
  resolution?: Partial<NonNullable<PermissionRequestPrompt["resolution"]>>
}

function createPermissionRequest(overrides: PermissionRequestPromptOverrides = {}): PermissionRequestPrompt {
  const base: PermissionRequestPrompt = {
    id: "permission-1",
    approvalID: "approval-1",
    sessionID: "session-backend",
    messageID: "message-1",
    toolCallID: "toolcall-1",
    projectID: "project-backend",
    agent: "plan",
    status: "pending",
    createdAt: 1,
    prompt: {
      title: "Read repo config",
      summary: "Read README.md",
      rationale: "The agent needs your approval before it can continue this tool call.",
      risk: "medium",
      detailsAvailable: true,
      details: {
        paths: ["README.md"],
        workdir: "C:\\Projects\\fanfande_studio",
      },
      allowedDecisions: ["deny", "allow-once", "allow-session", "allow-project"],
      recommendedDecision: "allow-once",
    },
  }

  const prompt = Object.prototype.hasOwnProperty.call(overrides, "prompt")
    ? {
        title: overrides.prompt?.title ?? base.prompt.title,
        summary: overrides.prompt?.summary ?? base.prompt.summary,
        rationale: overrides.prompt?.rationale ?? base.prompt.rationale,
        risk: overrides.prompt?.risk ?? base.prompt.risk,
        detailsAvailable: overrides.prompt?.detailsAvailable ?? base.prompt.detailsAvailable,
        details: Object.prototype.hasOwnProperty.call(overrides.prompt ?? {}, "details")
          ? overrides.prompt?.details
            ? {
                ...(base.prompt.details ?? {}),
                ...overrides.prompt.details,
              }
            : overrides.prompt?.details
          : base.prompt.details,
        allowedDecisions: overrides.prompt?.allowedDecisions ?? base.prompt.allowedDecisions,
        recommendedDecision: overrides.prompt?.recommendedDecision ?? base.prompt.recommendedDecision,
      }
    : base.prompt

  const resolution = Object.prototype.hasOwnProperty.call(overrides, "resolution")
    ? overrides.resolution
      ? {
          decision: overrides.resolution.decision ?? "allow-once",
          note: overrides.resolution.note,
          approved: overrides.resolution.approved ?? true,
          scope: overrides.resolution.scope ?? "once",
          resolvedAt: overrides.resolution.resolvedAt ?? 120,
          createdRuleID: overrides.resolution.createdRuleID,
        }
      : overrides.resolution
    : base.resolution

  return {
    ...base,
    ...overrides,
    prompt,
    resolution,
  }
}

function createPermissionResolveResult(overrides: PermissionRequestPromptOverrides = {}): PermissionResolveResult {
  return {
    request: createPermissionRequest({
      ...overrides,
      status: overrides.status ?? "approved",
      resolution: overrides.resolution ?? {
        decision: "allow-once",
        approved: true,
        scope: "once",
        resolvedAt: 120,
      },
    }),
  }
}

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear()
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
      createPtySession: vi.fn().mockResolvedValue({
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
      }),
      getPtySession: vi.fn().mockResolvedValue({
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
      }),
      updatePtySession: vi.fn().mockResolvedValue(undefined),
      deletePtySession: vi.fn().mockResolvedValue(undefined),
      attachPtySession: vi.fn().mockResolvedValue({
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
      }),
      detachPtySession: vi.fn().mockResolvedValue(true),
      writePtyInput: vi.fn().mockResolvedValue(undefined),
      pickProjectDirectory: vi.fn().mockResolvedValue(null),
      pickComposerAttachments: vi.fn().mockResolvedValue([]),
      gitCommit: vi.fn().mockResolvedValue({
        directory: "C:\\Projects\\Project 2",
        root: "C:\\Projects\\Project 2",
        branch: "main",
        stdout: "",
        stderr: "",
        summary: "宸叉彁浜ゅ埌 main",
      }),
      gitPush: vi.fn().mockResolvedValue({
        directory: "C:\\Projects\\Project 2",
        root: "C:\\Projects\\Project 2",
        branch: "main",
        stdout: "",
        stderr: "",
        summary: "宸叉帹閫?main",
      }),
      listFolderWorkspaces: vi.fn().mockRejectedValue(new Error("backend unavailable")),
      openFolderWorkspace: vi.fn(),
      createFolderSession: vi.fn(),
      deleteProjectWorkspace: vi.fn(),
      deleteAgentSession: vi.fn(),
      getSessionHistory: vi.fn().mockResolvedValue([]),
      getSessionDiff: vi.fn().mockResolvedValue({
        diffs: [],
      }),
      getGlobalSkills: vi.fn().mockResolvedValue([]),
      getProjectSkills: vi.fn().mockResolvedValue([]),
      getProjectSkillSelection: vi.fn().mockResolvedValue({
        skillIDs: [],
      }),
      getGlobalSkillsTree: vi.fn().mockResolvedValue({
        root: "C:\\Users\\19128\\.anybox\\skills",
        items: [],
      }),
      readGlobalSkillFile: vi.fn(),
      updateGlobalSkillFile: vi.fn(),
      createGlobalSkill: vi.fn(),
      renameGlobalSkill: vi.fn(),
      deleteGlobalSkill: vi.fn(),
      getSessionPermissionRequests: vi.fn().mockResolvedValue([]),
      respondPermissionRequest: vi.fn().mockResolvedValue(createPermissionResolveResult()),
      getGlobalProviderCatalog: vi.fn().mockResolvedValue([]),
      getGlobalModels: vi.fn().mockResolvedValue({
        items: [],
        selection: {},
      }),
      getGlobalMcpServers: vi.fn().mockResolvedValue([]),
      getProjectModels: vi.fn().mockResolvedValue({
        items: [],
        selection: {},
      }),
      getProjectMcpSelection: vi.fn().mockResolvedValue({
        serverIDs: [],
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
      updateGlobalMcpServer: vi.fn().mockResolvedValue({
        id: "filesystem",
        transport: "stdio",
        command: "npx",
        enabled: true,
      }),
      deleteGlobalMcpServer: vi.fn().mockResolvedValue({
        serverID: "filesystem",
        removed: true,
      }),
      updateProjectModelSelection: vi.fn().mockResolvedValue({}),
      updateProjectSkillSelection: vi.fn().mockResolvedValue({
        skillIDs: [],
      }),
      updateProjectMcpSelection: vi.fn().mockResolvedValue({
        serverIDs: [],
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
      onPtyEvent: vi.fn(() => vi.fn()),
      onWindowStateChange: vi.fn(() => vi.fn()),
    }
  })

  it("renders the desktop shell with floating window controls and folder workspace", async () => {
    const { container } = render(<App />)
    const inspector = screen.getByRole("complementary", { name: "Inspector sidebar" })

    expect(screen.getByRole("button", { name: "Minimize window" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Minimize window" }).closest(".window-controls-floating")).not.toBeNull()
    expect(container.querySelector(".window-drag-region")).toBeNull()
    expect(screen.queryByRole("button", { name: "File" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Collapse left sidebar" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Collapse right sidebar" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Collapse right sidebar" }).closest(".canvas-region-top-menu")).not.toBeNull()
    expect(screen.getByRole("button", { name: "Collapse right sidebar" }).closest(".canvas-region-top-menu-trailing")).toHaveClass("is-right-sidebar-expanded")
    expect(screen.getByRole("button", { name: "Open folder" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Create session" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "app" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "\u79FB\u9664 app" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Create session for app" })).toBeInTheDocument()
    expect(screen.getAllByText("Project 2").length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: "Chat 1" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Switch to session Chat 1" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add session tab" })).toHaveTextContent("+")
    expect(screen.getByRole("button", { name: "Git" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Workspace" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Overview" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Artifacts" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Changes" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Console" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Deploy" })).not.toBeInTheDocument()
    expect(inspector).toBeInTheDocument()
    expect(within(inspector).getByText("Changed Files")).toBeInTheDocument()
    expect(within(inspector).queryByText("Active Session")).not.toBeInTheDocument()
    expect(within(inspector).queryByText("Workspace")).not.toBeInTheDocument()
    expect(within(inspector).queryByText("Runtime")).not.toBeInTheDocument()
    await waitFor(() => {
      expect(container.querySelector(".canvas-header")).not.toBeInTheDocument()
      expect(container.querySelector(".signal-row")).not.toBeInTheDocument()
    })
    expect(screen.getByRole("textbox", { name: "Task draft" }).closest("footer")).toHaveClass("prompt-input-shell")
    expect(screen.getByRole("button", { name: "Add image or file" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Select model:/ })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^Agent mode:/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Clear draft" })).not.toBeInTheDocument()
  })

  it("creates a global skill from the inline draft form", async () => {
    const root = "C:\\Users\\19128\\.anybox\\skills"
    const directoryPath = `${root}\\layout-review`
    const filePath = `${directoryPath}\\SKILL.md`
    const content = ["---", "name: layout-review", "description: Describe when this skill should be used.", "---", "", "# layout-review"].join("\n")

    window.desktop!.getGlobalSkillsTree = vi
      .fn()
      .mockResolvedValueOnce({
        root,
        items: [],
      })
      .mockResolvedValueOnce({
        root,
        items: [
          {
            name: "layout-review",
            path: directoryPath,
            kind: "directory",
            children: [
              {
                name: "SKILL.md",
                path: filePath,
                kind: "file",
              },
            ],
          },
        ],
      })
    window.desktop!.createGlobalSkill = vi.fn().mockResolvedValue({
      directory: directoryPath,
      file: {
        path: filePath,
        content,
      },
    })
    window.desktop!.readGlobalSkillFile = vi.fn().mockResolvedValue({
      path: filePath,
      content,
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Skills" }))

    await screen.findByText("No global skills exist yet. Use the add button to create the first one.")

    fireEvent.click(screen.getByRole("button", { name: "Create global skill" }))

    const nameInput = screen.getByRole("textbox", { name: "New global skill name" })
    fireEvent.change(nameInput, { target: { value: "layout-review" } })
    fireEvent.click(screen.getByRole("button", { name: "Create" }))

    await waitFor(() => {
      expect(window.desktop!.createGlobalSkill).toHaveBeenCalledWith({ name: "layout-review" })
    })

    await screen.findByRole("button", { name: "SKILL.md" })
    expect(screen.queryByRole("textbox", { name: "New global skill name" })).not.toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Global skill editor" })).toHaveValue(content)
  })

  it("renames a global skill from the tree with double click", async () => {
    const root = "C:\\Users\\19128\\.anybox\\skills"
    const oldDirectoryPath = `${root}\\layout-review`
    const oldFilePath = `${oldDirectoryPath}\\SKILL.md`
    const nextDirectoryPath = `${root}\\layout-audit`
    const nextFilePath = `${nextDirectoryPath}\\SKILL.md`
    const oldContent = ["---", "name: layout-review", "description: Describe when this skill should be used.", "---", "", "# layout-review"].join("\n")
    const nextContent = ["---", "name: layout-audit", "description: Describe when this skill should be used.", "---", "", "# layout-audit"].join("\n")

    window.desktop!.getGlobalSkillsTree = vi
      .fn()
      .mockResolvedValueOnce({
        root,
        items: [
          {
            name: "layout-review",
            path: oldDirectoryPath,
            kind: "directory",
            children: [
              {
                name: "SKILL.md",
                path: oldFilePath,
                kind: "file",
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        root,
        items: [
          {
            name: "layout-audit",
            path: nextDirectoryPath,
            kind: "directory",
            children: [
              {
                name: "SKILL.md",
                path: nextFilePath,
                kind: "file",
              },
            ],
          },
        ],
      })
    window.desktop!.readGlobalSkillFile = vi
      .fn()
      .mockResolvedValueOnce({
        path: oldFilePath,
        content: oldContent,
      })
      .mockResolvedValueOnce({
        path: nextFilePath,
        content: nextContent,
      })
    window.desktop!.renameGlobalSkill = vi.fn().mockResolvedValue({
      previousDirectory: oldDirectoryPath,
      directory: nextDirectoryPath,
      filePath: nextFilePath,
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Skills" }))

    const oldDirectoryButton = await screen.findByRole("button", { name: "layout-review" })
    fireEvent.doubleClick(oldDirectoryButton)

    const renameInput = await screen.findByRole("textbox", { name: "Rename global skill layout-review" })
    fireEvent.change(renameInput, { target: { value: "layout-audit" } })
    fireEvent.keyDown(renameInput, { key: "Enter" })

    await waitFor(() => {
      expect(window.desktop!.renameGlobalSkill).toHaveBeenCalledWith({
        directory: oldDirectoryPath,
        name: "layout-audit",
      })
    })

    await screen.findByRole("button", { name: "layout-audit" })
    expect(screen.queryByRole("textbox", { name: "Rename global skill layout-review" })).not.toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Global skill editor" })).toHaveValue(nextContent)
  })

  it("routes window control clicks through the desktop bridge", () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Minimize window" }))
    fireEvent.click(screen.getByRole("button", { name: "Maximize window" }))
    fireEvent.click(screen.getByRole("button", { name: "Close window" }))

    expect(window.desktop!.windowAction).toHaveBeenNthCalledWith(1, "minimize")
    expect(window.desktop!.windowAction).toHaveBeenNthCalledWith(2, "toggle-maximize")
    expect(window.desktop!.windowAction).toHaveBeenNthCalledWith(3, "close")
  })

  it("opens the git quick menu and triggers commit and push for the active workspace", async () => {
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
            created: 18,
            updated: 20,
          },
        ],
      },
    ])
    window.desktop!.gitCommit = vi.fn().mockResolvedValue({
      directory: "C:\\Projects\\Atlas",
      root: "C:\\Projects\\Atlas",
      branch: "main",
      stdout: "",
      stderr: "",
      summary: "宸叉彁浜ゅ埌 main",
    })
    window.desktop!.gitPush = vi.fn().mockResolvedValue({
      directory: "C:\\Projects\\Atlas",
      root: "C:\\Projects\\Atlas",
      branch: "main",
      stdout: "",
      stderr: "",
      summary: "宸叉帹閫?main",
    })

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.listFolderWorkspaces).toHaveBeenCalledTimes(1)
    })
    await screen.findByRole("button", { name: "Atlas review" })

    fireEvent.click(screen.getByRole("button", { name: "Git" }))

    expect(await screen.findByRole("textbox", { name: "Commit message" })).toBeInTheDocument()

    fireEvent.change(screen.getByRole("textbox", { name: "Commit message" }), {
      target: {
        value: "chore: wire git quick menu",
      },
    })

    fireEvent.click(screen.getByRole("button", { name: "Commit" }))

    await waitFor(() => {
      expect(window.desktop!.gitCommit).toHaveBeenCalledWith({
        directory: "C:\\Projects\\Atlas",
        message: "chore: wire git quick menu",
      })
    })

    expect(await screen.findByText("宸叉彁浜ゅ埌 main")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Push" }))

    await waitFor(() => {
      expect(window.desktop!.gitPush).toHaveBeenCalledWith({
        directory: "C:\\Projects\\Atlas",
      })
    })

    expect(await screen.findByText("宸叉帹閫?main")).toBeInTheDocument()
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
    expect(screen.getAllByText("Atlas").length).toBeGreaterThan(0)
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

  it("loads session diff summaries into the inspector and renders patch trace items from history", async () => {
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
        parts: [{ id: "part-user-1", type: "text", text: "Ship the toolbar update" }],
      },
      {
        info: {
          id: "msg-assistant-1",
          sessionID: "session-atlas-review",
          role: "assistant",
          created: 101,
        },
        parts: [
          {
            id: "part-patch-1",
            type: "patch",
            hash: "snapshot-2",
            files: ["src/App.tsx", "src/styles.css"],
            summary: {
              files: 2,
              additions: 8,
              deletions: 3,
            },
            changes: [
              {
                file: "src/App.tsx",
                additions: 5,
                deletions: 1,
              },
              {
                file: "src/styles.css",
                additions: 3,
                deletions: 2,
              },
            ],
          },
        ],
      },
    ])
    window.desktop!.getSessionDiff = vi.fn().mockResolvedValue({
      title: "2 file changes (+8 -3)",
      stats: {
        files: 2,
        additions: 8,
        deletions: 3,
      },
      diffs: [
        {
          file: "src/App.tsx",
          additions: 5,
          deletions: 1,
          patch: [
            "diff --git a/src/App.tsx b/src/App.tsx",
            "index 1111111..2222222 100644",
            "--- a/src/App.tsx",
            "+++ b/src/App.tsx",
            "@@ -1,2 +1,2 @@",
            '-import { OldToolbar } from "./toolbar"',
            '+import { NewToolbar } from "./toolbar"',
            ' export function App() {',
          ].join("\n"),
        },
        {
          file: "src/styles.css",
          additions: 3,
          deletions: 2,
          patch: [
            "diff --git a/src/styles.css b/src/styles.css",
            "index 3333333..4444444 100644",
            "--- a/src/styles.css",
            "+++ b/src/styles.css",
            "@@ -12,2 +12,3 @@",
            "-.toolbar { display: flex; }",
            "+.toolbar {",
            "+  display: grid;",
            "+}",
          ].join("\n"),
        },
      ],
    })

    const { container } = render(<App />)

    expect(await screen.findByText("2 file changes (+8 -3)")).toBeInTheDocument()
    expect(screen.getByText(/src\/App\.tsx \(\+5 -1\).*src\/styles\.css \(\+3 -2\)/)).toBeInTheDocument()
    expect(screen.getAllByText("src/App.tsx").length).toBeGreaterThan(0)
    expect(screen.getAllByText("src/styles.css").length).toBeGreaterThan(0)
    expect(screen.queryByText("@@ -1,2 +1,2 @@")).not.toBeInTheDocument()
    expect(screen.queryByText("diff --git a/src/App.tsx b/src/App.tsx")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Toggle diff for src/App.tsx" }))

    expect(screen.queryByText("@@ -1,2 +1,2 @@")).not.toBeInTheDocument()
    expect(screen.getByText('import { OldToolbar } from "./toolbar"')).toBeInTheDocument()
    expect(screen.getByText('import { NewToolbar } from "./toolbar"')).toBeInTheDocument()
    expect(container.querySelectorAll(".right-sidebar-diff-row").length).toBeGreaterThan(0)
    expect(container.querySelectorAll(".right-sidebar-diff-row.is-add").length).toBeGreaterThan(0)
    expect(container.querySelectorAll(".right-sidebar-diff-row.is-remove").length).toBeGreaterThan(0)
    expect(window.desktop!.getSessionDiff).toHaveBeenCalledWith({
      sessionID: "session-atlas-review",
    })
  })

  it("renders assistant trace blocks in backend order instead of grouping by type", async () => {
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
        parts: [{ id: "part-user-1", type: "text", text: "Audit the release flow" }],
      },
      {
        info: {
          id: "msg-assistant-1",
          sessionID: "session-atlas-review",
          role: "assistant",
          created: 101,
        },
        parts: [
          { id: "reasoning-1", type: "reasoning", text: "Inspecting workspace." },
          {
            id: "tool-1",
            type: "tool",
            tool: "npm test",
            state: {
              status: "completed",
              output: "ok",
            },
          },
          { id: "reasoning-2", type: "reasoning", text: "Evaluating test output." },
          {
            id: "tool-2",
            type: "tool",
            tool: "write-file",
            state: {
              status: "completed",
              output: "README updated",
            },
          },
          {
            id: "patch-1",
            type: "patch",
            summary: {
              files: 1,
              additions: 2,
              deletions: 1,
            },
            changes: [
              {
                file: "src/App.tsx",
                additions: 2,
                deletions: 1,
              },
            ],
          },
          {
            id: "patch-2",
            type: "patch",
            summary: {
              files: 2,
              additions: 3,
              deletions: 1,
            },
            changes: [
              {
                file: "src/App.tsx",
                additions: 2,
                deletions: 1,
              },
              {
                file: "src/styles.css",
                additions: 1,
                deletions: 0,
              },
            ],
          },
          { id: "text-1", type: "text", text: "All checks passed." },
        ],
      },
    ])

    render(<App />)

    const assistantTurn = (await screen.findByText("All checks passed.")).closest(".assistant-turn") as HTMLElement | null

    expect(assistantTurn).not.toBeNull()

    const sectionElements = Array.from((assistantTurn as HTMLElement).querySelectorAll(".assistant-section"))
    const sectionTitles = sectionElements.map((section) => section.getAttribute("aria-label"))

    expect(sectionTitles).toEqual(["Reasoning", "Tools", "Reasoning", "Tools", "Response", "File Changes"])
    expect((assistantTurn as HTMLElement).querySelector(".assistant-section-header")).toBeNull()

    expect(within(sectionElements[0] as HTMLElement).getByText("Inspecting workspace.")).toBeInTheDocument()
    expect(within(sectionElements[0] as HTMLElement).queryByRole("button", { name: /npm test.*completed/i })).not.toBeInTheDocument()

    expect(within(sectionElements[1] as HTMLElement).getByRole("button", { name: /npm test.*completed/i })).toBeInTheDocument()
    expect(within(sectionElements[1] as HTMLElement).queryByText("Inspecting workspace.")).not.toBeInTheDocument()

    expect(within(sectionElements[2] as HTMLElement).getByText("Evaluating test output.")).toBeInTheDocument()
    expect(within(sectionElements[2] as HTMLElement).queryByRole("button", { name: /write-file.*completed/i })).not.toBeInTheDocument()

    expect(within(sectionElements[3] as HTMLElement).getByRole("button", { name: /write-file.*completed/i })).toBeInTheDocument()
    expect(within(sectionElements[3] as HTMLElement).queryByText("Evaluating test output.")).not.toBeInTheDocument()

    expect(within(sectionElements[4] as HTMLElement).getByText("All checks passed.")).toBeInTheDocument()
    expect(within(sectionElements[4] as HTMLElement).queryByText("Inspecting workspace.")).not.toBeInTheDocument()

    expect(within(sectionElements[5] as HTMLElement).getByText("2 file changes (+3 -1)")).toBeInTheDocument()
    expect(within(sectionElements[5] as HTMLElement).queryByText("1 file change (+2 -1)")).not.toBeInTheDocument()
    expect(within(sectionElements[5] as HTMLElement).getByText(/src\/App\.tsx \(\+2 -1\).*src\/styles\.css \(\+1 -0\)/)).toBeInTheDocument()
    expect(within(sectionElements[5] as HTMLElement).queryByText("All checks passed.")).not.toBeInTheDocument()
  })

  it("shows one file-change summary at the end of a consecutive assistant cycle", async () => {
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
        parts: [{ id: "part-user-1", type: "text", text: "Complete the release checklist" }],
      },
      {
        info: {
          id: "msg-assistant-1",
          sessionID: "session-atlas-review",
          role: "assistant",
          created: 101,
        },
        parts: [
          { id: "reasoning-1", type: "reasoning", text: "Preparing the first change set." },
          { id: "text-1", type: "text", text: "Created the first draft of the release notes." },
          {
            id: "patch-1",
            type: "patch",
            summary: {
              files: 1,
              additions: 4,
              deletions: 0,
            },
            changes: [
              {
                file: "docs/release-notes.md",
                additions: 4,
                deletions: 0,
              },
            ],
          },
        ],
      },
      {
        info: {
          id: "msg-assistant-2",
          sessionID: "session-atlas-review",
          role: "assistant",
          created: 102,
        },
        parts: [
          { id: "reasoning-2", type: "reasoning", text: "Running the final verification pass." },
          {
            id: "tool-2",
            type: "tool",
            tool: "npm test",
            state: {
              status: "completed",
              output: "ok",
            },
          },
          { id: "text-2", type: "text", text: "Finished the cycle." },
        ],
      },
    ])

    render(<App />)

    const firstAssistantTurn = (await screen.findByText("Created the first draft of the release notes.")).closest(
      ".assistant-turn",
    ) as HTMLElement | null
    const finalAssistantTurn = (await screen.findByText("Finished the cycle.")).closest(".assistant-turn") as HTMLElement | null

    expect(firstAssistantTurn).not.toBeNull()
    expect(finalAssistantTurn).not.toBeNull()
    expect(firstAssistantTurn).not.toBe(finalAssistantTurn)

    expect(within(firstAssistantTurn as HTMLElement).queryByRole("region", { name: "File Changes" })).not.toBeInTheDocument()

    const finalFileChangeSection = within(finalAssistantTurn as HTMLElement).getByRole("region", { name: "File Changes" })
    expect(within(finalFileChangeSection).getByText("1 file change (+4 -0)")).toBeInTheDocument()
    expect(within(finalFileChangeSection).getByText("docs/release-notes.md (+4 -0)")).toBeInTheDocument()
    expect(screen.getAllByRole("region", { name: "File Changes" })).toHaveLength(1)
  })

  it("keeps file changes hidden until the turn completes, then renders them after the response", async () => {
    let streamListener:
      | ((event: {
          streamID: string
          event: string
          data: unknown
        }) => void)
      | undefined
    let activeStreamID = ""
    let activeSessionID = ""

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
        activeStreamID = input.streamID
        activeSessionID = input.sessionID

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
    fireEvent.click(getComposerSendButton())

    const reasoningText = await screen.findByText("Planning live update.")
    const assistantTurn = reasoningText.closest(".assistant-turn") as HTMLElement | null

    expect(assistantTurn).not.toBeNull()

    const reasoningSection = within(assistantTurn as HTMLElement).getByRole("region", { name: "Reasoning" })
    expect(within(reasoningSection).getByText("Planning live update.")).toBeInTheDocument()
    expect(within(assistantTurn as HTMLElement).queryByRole("region", { name: "Response" })).not.toBeInTheDocument()
    expect(within(assistantTurn as HTMLElement).queryByRole("region", { name: "File Changes" })).not.toBeInTheDocument()

    act(() => {
      streamListener?.({
        streamID: activeStreamID,
        event: "delta",
        data: { kind: "text", delta: "Streaming answer" },
      })
    })

    expect(within(assistantTurn as HTMLElement).queryByRole("region", { name: "Response" })).not.toBeInTheDocument()
    expect(within(assistantTurn as HTMLElement).queryByRole("region", { name: "File Changes" })).not.toBeInTheDocument()

    act(() => {
      streamListener?.({
        streamID: activeStreamID,
        event: "part",
        data: {
          part: {
            id: "patch-1",
            type: "patch",
            summary: {
              files: 1,
              additions: 2,
              deletions: 1,
            },
            changes: [
              {
                file: "src/App.tsx",
                additions: 2,
                deletions: 1,
              },
            ],
          },
        },
      })
      streamListener?.({
        streamID: activeStreamID,
        event: "part",
        data: {
          part: {
            id: "patch-2",
            type: "patch",
            summary: {
              files: 2,
              additions: 3,
              deletions: 1,
            },
            changes: [
              {
                file: "src/App.tsx",
                additions: 2,
                deletions: 1,
              },
              {
                file: "src/styles.css",
                additions: 1,
                deletions: 0,
              },
            ],
          },
        },
      })
    })

    expect(within(assistantTurn as HTMLElement).queryByRole("region", { name: "File Changes" })).not.toBeInTheDocument()
    expect(within(assistantTurn as HTMLElement).queryByRole("region", { name: "Response" })).not.toBeInTheDocument()

    act(() => {
      streamListener?.({
        streamID: activeStreamID,
        event: "done",
        data: {
          sessionID: activeSessionID,
          parts: [
            { id: "reasoning-1", type: "reasoning", text: "Planning live update." },
            {
              id: "patch-1",
              type: "patch",
              summary: {
                files: 1,
                additions: 2,
                deletions: 1,
              },
              changes: [
                {
                  file: "src/App.tsx",
                  additions: 2,
                  deletions: 1,
                },
              ],
            },
            {
              id: "patch-2",
              type: "patch",
              summary: {
                files: 2,
                additions: 3,
                deletions: 1,
              },
              changes: [
                {
                  file: "src/App.tsx",
                  additions: 2,
                  deletions: 1,
                },
                {
                  file: "src/styles.css",
                  additions: 1,
                  deletions: 0,
                },
              ],
            },
            { id: "text-1", type: "text", text: "Streaming answer" },
          ],
        },
      })
    })

    await waitFor(() => {
      expect(within(assistantTurn as HTMLElement).getByRole("region", { name: "Response" })).toBeInTheDocument()
    })

    const responseSection = within(assistantTurn as HTMLElement).getByRole("region", { name: "Response" })
    expect(within(responseSection).getByText("Streaming answer")).toBeInTheDocument()

    const fileChangeSection = within(assistantTurn as HTMLElement).getByRole("region", { name: "File Changes" })
    expect(within(fileChangeSection).getByText("2 file changes (+3 -1)")).toBeInTheDocument()
    expect(within(fileChangeSection).queryByText("1 file change (+2 -1)")).not.toBeInTheDocument()
    expect(within(fileChangeSection).getByText(/src\/App\.tsx \(\+2 -1\).*src\/styles\.css \(\+1 -0\)/)).toBeInTheDocument()

    const reasoningPosition = reasoningSection.compareDocumentPosition(fileChangeSection)
    const responsePosition = responseSection.compareDocumentPosition(fileChangeSection)
    expect(reasoningPosition & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(responsePosition & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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

  it("shows pending permission requests for the active session and blocks sending until resolved", async () => {
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
    window.desktop!.getSessionHistory = vi.fn().mockResolvedValue([])
    window.desktop!.getSessionPermissionRequests = vi.fn().mockResolvedValue([
      createPermissionRequest({
        id: "permission-atlas-1",
        approvalID: "approval-atlas-1",
        sessionID: "session-atlas-review",
        messageID: "message-atlas-1",
        toolCallID: "toolcall-atlas-1",
        projectID: "project-atlas",
        createdAt: 100,
        prompt: {
          details: {
            paths: ["README.md"],
            workdir: "C:\\Projects\\Atlas\\client",
          },
        },
      }),
    ])

    render(<App />)

    const approvalPanel = await screen.findByRole("region", { name: "Tool approval request" })
    expect(approvalPanel.closest(".thread-shell")).not.toBeNull()
    expect(within(approvalPanel).getByRole("heading", { name: "Read repo config" })).toBeInTheDocument()
    expect(within(approvalPanel).getByText("Read README.md")).toBeInTheDocument()
    expect(getComposerSendButton()).toBeDisabled()
    expect(within(approvalPanel).getByRole("button", { name: "Allow once Read repo config" })).toBeInTheDocument()
    expect(within(approvalPanel).getByRole("button", { name: "Deny Read repo config" })).toBeInTheDocument()
    await waitFor(() => {
      expect(window.desktop!.getSessionPermissionRequests).toHaveBeenCalledWith({
        sessionID: "session-atlas-review",
      })
    })
  })

  it("approves a pending permission request, resumes the session, and refreshes history", async () => {
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
    window.desktop!.getSessionHistory = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          info: {
            id: "msg-assistant-2",
            sessionID: "session-atlas-review",
            role: "assistant",
            created: 111,
          },
          parts: [{ id: "part-text-2", type: "text", text: "Approval recorded and session resumed." }],
        },
      ])
    window.desktop!.getSessionPermissionRequests = vi
      .fn()
      .mockResolvedValueOnce([
        createPermissionRequest({
          id: "permission-atlas-1",
          approvalID: "approval-atlas-1",
          sessionID: "session-atlas-review",
          messageID: "message-atlas-1",
          toolCallID: "toolcall-atlas-1",
          projectID: "project-atlas",
          createdAt: 100,
          prompt: {
            details: {
              paths: ["README.md"],
              workdir: "C:\\Projects\\Atlas\\client",
            },
          },
        }),
      ])
      .mockResolvedValueOnce([])
    window.desktop!.respondPermissionRequest = vi.fn().mockResolvedValue(
      createPermissionResolveResult({
        id: "permission-atlas-1",
        approvalID: "approval-atlas-1",
        sessionID: "session-atlas-review",
        messageID: "message-atlas-1",
        toolCallID: "toolcall-atlas-1",
        projectID: "project-atlas",
        createdAt: 100,
      }),
    )

    render(<App />)

    const approvalPanel = await screen.findByRole("region", { name: "Tool approval request" })
    fireEvent.click(within(approvalPanel).getByRole("button", { name: "Allow once Read repo config" }))

    await waitFor(() => {
      expect(window.desktop!.respondPermissionRequest).toHaveBeenCalledWith({
        requestID: "permission-atlas-1",
        decision: "allow-once",
        note: undefined,
        resume: true,
      })
    })
    expect(await screen.findByText("Approval recorded and session resumed.")).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Tool approval request" })).not.toBeInTheDocument()
    await waitFor(() => {
      expect(window.desktop!.getSessionHistory).toHaveBeenNthCalledWith(2, {
        sessionID: "session-atlas-review",
      })
      expect(window.desktop!.getSessionPermissionRequests).toHaveBeenNthCalledWith(2, {
        sessionID: "session-atlas-review",
      })
    })
  })

  it("streams resumed output after approval and clears the waiting tool state first", async () => {
    let streamListener:
      | ((event: {
          streamID: string
          event: string
          data: unknown
        }) => void)
      | undefined
    let finishResumeStream: (() => void) | undefined

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
    window.desktop!.getSessionHistory = vi
      .fn()
      .mockResolvedValueOnce([
        {
          info: {
            id: "msg-assistant-1",
            sessionID: "session-atlas-review",
            role: "assistant",
            created: 100,
          },
          parts: [
            {
              id: "tool-part-1",
              type: "tool",
              tool: "read-file",
              state: {
                status: "waiting-approval",
                approvalID: "approval-atlas-1",
                input: {
                  path: "README.md",
                },
                title: "Read repo config",
                time: {
                  start: 90,
                },
              },
            },
          ],
        },
      ])
      .mockResolvedValueOnce([
        {
          info: {
            id: "msg-assistant-1",
            sessionID: "session-atlas-review",
            role: "assistant",
            created: 100,
          },
          parts: [
            {
              id: "tool-part-1",
              type: "tool",
              tool: "read-file",
              state: {
                status: "completed",
                input: {
                  path: "README.md",
                },
                output: "README loaded",
                title: "Read repo config",
                time: {
                  start: 90,
                  end: 120,
                },
              },
            },
          ],
        },
      ])
      .mockResolvedValueOnce([
        {
          info: {
            id: "msg-assistant-1",
            sessionID: "session-atlas-review",
            role: "assistant",
            created: 100,
          },
          parts: [
            {
              id: "tool-part-1",
              type: "tool",
              tool: "read-file",
              state: {
                status: "completed",
                input: {
                  path: "README.md",
                },
                output: "README loaded",
                title: "Read repo config",
                time: {
                  start: 90,
                  end: 120,
                },
              },
            },
          ],
        },
        {
          info: {
            id: "msg-assistant-2",
            sessionID: "session-atlas-review",
            role: "assistant",
            created: 121,
          },
          parts: [{ id: "part-text-2", type: "text", text: "Resumed answer" }],
        },
      ])
    window.desktop!.getSessionPermissionRequests = vi
      .fn()
      .mockResolvedValueOnce([
        createPermissionRequest({
          id: "permission-atlas-1",
          approvalID: "approval-atlas-1",
          sessionID: "session-atlas-review",
          messageID: "msg-assistant-1",
          toolCallID: "toolcall-atlas-1",
          projectID: "project-atlas",
          createdAt: 100,
          prompt: {
            details: {
              paths: ["README.md"],
              workdir: "C:\\Projects\\Atlas\\client",
            },
          },
        }),
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    window.desktop!.respondPermissionRequest = vi.fn().mockResolvedValue(
      createPermissionResolveResult({
        id: "permission-atlas-1",
        approvalID: "approval-atlas-1",
        sessionID: "session-atlas-review",
        messageID: "msg-assistant-1",
        toolCallID: "toolcall-atlas-1",
        projectID: "project-atlas",
        createdAt: 100,
      }),
    )
    window.desktop!.onAgentStreamEvent = vi.fn((listener) => {
      streamListener = listener
      return vi.fn()
    })
    window.desktop!.resumeAgentMessageStream = vi.fn().mockImplementation(
      async (input: {
        streamID: string
        sessionID: string
      }) => {
        streamListener?.({
          streamID: input.streamID,
          event: "started",
          data: { sessionID: input.sessionID },
        })
        streamListener?.({
          streamID: input.streamID,
          event: "delta",
          data: { kind: "text", delta: "Resumed answer" },
        })

        await new Promise<void>((resolve) => {
          finishResumeStream = () => {
            streamListener?.({
              streamID: input.streamID,
              event: "done",
              data: {
                sessionID: input.sessionID,
                parts: [{ id: "part-text-2", type: "text", text: "Resumed answer" }],
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

    const toolTraceToggle = await screen.findByRole("button", { name: /read-file.*waiting approval/i })
    expect(toolTraceToggle).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("Waiting for permission approval before the tool can continue.")).not.toBeInTheDocument()

    fireEvent.click(toolTraceToggle)

    expect(toolTraceToggle).toHaveAttribute("aria-expanded", "true")
    expect(await screen.findByText("Waiting for permission approval before the tool can continue.")).toBeInTheDocument()

    const approvalPanel = await screen.findByRole("region", { name: "Tool approval request" })
    fireEvent.click(within(approvalPanel).getByRole("button", { name: "Allow once Read repo config" }))

    await waitFor(() => {
      expect(window.desktop!.respondPermissionRequest).toHaveBeenCalledWith({
        requestID: "permission-atlas-1",
        decision: "allow-once",
        note: undefined,
        resume: false,
      })
      expect(window.desktop!.resumeAgentMessageStream).toHaveBeenCalledTimes(1)
    })

    expect(await screen.findByText("README loaded")).toBeInTheDocument()
    expect(screen.queryByText("Waiting for permission approval before the tool can continue.")).not.toBeInTheDocument()
    expect(screen.queryByText("Resumed answer")).not.toBeInTheDocument()
    expect(getComposerSendButton()).toBeDisabled()

    act(() => {
      finishResumeStream?.()
    })

    expect(await screen.findByText("Resumed answer")).toBeInTheDocument()

    await waitFor(() => {
      expect(window.desktop!.getSessionHistory).toHaveBeenNthCalledWith(3, {
        sessionID: "session-atlas-review",
      })
      expect(getComposerSendButton()).toBeEnabled()
    })
  })

  it("hides the approval dialog immediately after a decision is chosen", async () => {
    const response = createDeferred<PermissionResolveResult>()

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
    window.desktop!.getSessionHistory = vi.fn().mockResolvedValue([])
    window.desktop!.getSessionPermissionRequests = vi
      .fn()
      .mockResolvedValueOnce([
        createPermissionRequest({
          id: "permission-atlas-1",
          approvalID: "approval-atlas-1",
          sessionID: "session-atlas-review",
          messageID: "message-atlas-1",
          toolCallID: "toolcall-atlas-1",
          projectID: "project-atlas",
          createdAt: 100,
          prompt: {
            details: {
              paths: ["README.md"],
              workdir: "C:\\Projects\\Atlas\\client",
            },
          },
        }),
      ])
      .mockResolvedValueOnce([])
    window.desktop!.respondPermissionRequest = vi.fn().mockReturnValue(response.promise)

    render(<App />)

    const approvalPanel = await screen.findByRole("region", { name: "Tool approval request" })
    fireEvent.click(within(approvalPanel).getByRole("button", { name: "Allow once Read repo config" }))

    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Tool approval request" })).not.toBeInTheDocument()
    })
    expect(getComposerSendButton()).toBeDisabled()

    response.resolve(
      createPermissionResolveResult({
        id: "permission-atlas-1",
        approvalID: "approval-atlas-1",
        sessionID: "session-atlas-review",
        messageID: "message-atlas-1",
        toolCallID: "toolcall-atlas-1",
        projectID: "project-atlas",
        createdAt: 100,
      }),
    )

    await waitFor(() => {
      expect(window.desktop!.getSessionPermissionRequests).toHaveBeenNthCalledWith(2, {
        sessionID: "session-atlas-review",
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
    expect(screen.getAllByText("Orion").length).toBeGreaterThan(0)
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

  it("replaces the focused session tab when selecting a different sidebar session", async () => {
    render(<App />)

    expect(screen.getByRole("button", { name: "Switch to session Chat 1" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.queryByRole("button", { name: "Switch to session Chat 2" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Chat 2" }))

    expect(await screen.findByRole("button", { name: "Switch to session Chat 2" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.queryByRole("button", { name: "Switch to session Chat 1" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Chat 2" }).closest(".session-row")).toHaveClass("is-active")
    expect(screen.getByRole("button", { name: "app" }).closest(".project-row")).toHaveClass("is-active")
  })

  it("reuses open session tabs and replaces the active create tab when selecting from the sidebar", async () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Create session" }))
    await screen.findByText("Open a new session tab")

    expect(screen.getByRole("button", { name: "Switch to create session tab" })).toHaveAttribute("aria-pressed", "true")

    fireEvent.click(screen.getByRole("button", { name: "Chat 2" }))

    expect(await screen.findByRole("button", { name: "Switch to session Chat 2" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Switch to session Chat 1" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Switch to create session tab" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Chat 1" }))

    expect(screen.getByRole("button", { name: "Switch to session Chat 1" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Switch to session Chat 2" })).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Switch to session Chat 1" })).toHaveLength(1)
    expect(screen.getAllByRole("button", { name: "Switch to session Chat 2" })).toHaveLength(1)
  })

  it("falls back to the create session tab when the last session tab closes", async () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Close session tab Chat 1" }))

    expect(await screen.findByText("Open a new session tab")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Switch to create session tab" })).toHaveAttribute("aria-pressed", "true")
  })

  it("allows multiple create session tabs with independent drafts", async () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Create session" }))
    await screen.findByText("Open a new session tab")

    fireEvent.change(screen.getByRole("textbox", { name: "Session title" }), {
      target: { value: "First draft" },
    })

    fireEvent.click(screen.getByRole("button", { name: "Add session tab" }))

    expect(await screen.findByRole("button", { name: "Switch to create session tab 2" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("textbox", { name: "Session title" })).toHaveValue("")

    fireEvent.change(screen.getByRole("textbox", { name: "Session title" }), {
      target: { value: "Second draft" },
    })

    fireEvent.click(screen.getByRole("button", { name: "Switch to create session draft First draft" }))

    expect(screen.getByRole("textbox", { name: "Session title" })).toHaveValue("First draft")

    fireEvent.click(screen.getByRole("button", { name: "Switch to create session draft Second draft" }))

    expect(screen.getByRole("textbox", { name: "Session title" })).toHaveValue("Second draft")
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
    const createSessionCard = await screen.findByText("Open a new session tab")

    fireEvent.click(within(createSessionCard.closest(".create-session-card")!).getByRole("button", { name: "Create session" }))

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
    const createSessionCard = await screen.findByText("Open a new session tab")

    fireEvent.click(within(createSessionCard.closest(".create-session-card")!).getByRole("button", { name: "Create session" }))

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
    const createSessionCard = await screen.findByText("Open a new session tab")

    fireEvent.click(within(createSessionCard.closest(".create-session-card")!).getByRole("button", { name: "Create session" }))

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
        id: "openai",
        name: "OpenAI",
        source: "api",
        env: ["OPENAI_API_KEY"],
        configured: false,
        available: false,
        apiKeyConfigured: false,
        baseURL: "https://api.openai.com/v1",
        modelCount: 0,
      },
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
    expect(screen.getByRole("button", { name: "Close settings" })).toBeInTheDocument()
    expect(screen.queryByText("Global settings")).not.toBeInTheDocument()
    expect(screen.queryByText("Manage shared providers and models for the app.")).not.toBeInTheDocument()
    expect(settingsDialog.querySelectorAll(".settings-primary-nav-icon")).toHaveLength(4)
    expect(screen.getByRole("button", { name: /^Provider/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Models/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Appearance/ })).toBeInTheDocument()
    expect(screen.queryByText("Choose a provider on the left, then edit the shared credentials and endpoint used across the app.")).not.toBeInTheDocument()
    expect(screen.queryByText("Providers discovered from the catalog, environment, and saved config.")).not.toBeInTheDocument()
    expect(screen.queryByText("Search providers")).not.toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Search providers" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /DeepSeek.*Connected/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /OpenAI.*Not connected/ })).toBeInTheDocument()
    expect(screen.queryByText("Catalog")).not.toBeInTheDocument()
    expect(screen.queryByText("No known models yet")).not.toBeInTheDocument()
    expect(screen.queryByText("1 known models")).not.toBeInTheDocument()
    expect(await screen.findByRole("heading", { name: "Provider Configuration" })).toBeInTheDocument()
    const detailHero = settingsDialog.querySelector(".settings-detail-hero")
    expect(detailHero).not.toBeNull()
    expect(within(detailHero as HTMLElement).queryByText("Saved config")).not.toBeInTheDocument()
    expect(screen.queryByText("Provider ID")).not.toBeInTheDocument()
    expect(screen.queryByText("Environment")).not.toBeInTheDocument()
    expect(screen.queryByText("Save shared credentials and endpoint overrides for this provider.")).not.toBeInTheDocument()
    expect(screen.queryByText("Edit the shared credentials and endpoint the app should use when routing to DeepSeek.")).not.toBeInTheDocument()
    expect(screen.queryByText("Reset removes the saved provider configuration and falls back to environment or catalog defaults.")).not.toBeInTheDocument()
    expect(screen.getByLabelText("API key for DeepSeek")).toBeInTheDocument()

    const providerList = screen.getByRole("list", { name: "Provider list" })
    const providerButtons = within(providerList).getAllByRole("button")
    expect(providerButtons[0]).toHaveTextContent("DeepSeek")
    expect(providerButtons[1]).toHaveTextContent("OpenAI")
    expect(within(providerList).queryByText("Connected")).not.toBeInTheDocument()
    expect(within(providerList).queryByText("Not connected")).not.toBeInTheDocument()
    expect(providerList.querySelectorAll(".settings-status-indicator")).toHaveLength(2)

    fireEvent.click(screen.getByRole("button", { name: /^Models/ }))

    expect(screen.getByLabelText("Primary model")).toHaveValue("deepseek/deepseek-reasoner")
    expect(screen.getByRole("heading", { name: "Connected Models" })).toBeInTheDocument()
    expect(screen.getByText("DeepSeek Reasoner")).toBeInTheDocument()

    await waitFor(() => {
      expect(window.desktop!.getGlobalProviderCatalog).toHaveBeenCalledTimes(1)
      expect(window.desktop!.getGlobalModels).toHaveBeenCalledTimes(1)
    })
  })

  it("edits global MCP servers from settings and keeps diagnostics project-aware", async () => {
    window.desktop!.getGlobalProviderCatalog = vi.fn().mockResolvedValue([])
    window.desktop!.getGlobalModels = vi.fn().mockResolvedValue({
      items: [],
      selection: {},
    })
    window.desktop!.getGlobalMcpServers = vi.fn().mockResolvedValue([
      {
        id: "filesystem",
        name: "Filesystem",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem"],
        enabled: true,
      },
    ])
    window.desktop!.updateGlobalMcpServer = vi.fn().mockResolvedValue({
      id: "filesystem",
      name: "Filesystem Tools",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem"],
      enabled: true,
    })
    window.desktop!.getProjectMcpServerDiagnostic = vi.fn().mockResolvedValue({
      serverID: "filesystem",
      enabled: true,
      ok: true,
      toolCount: 1,
      toolNames: ["read_file"],
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }))
    fireEvent.click(await screen.findByRole("button", { name: /^MCP/ }))

    expect(await screen.findByText("Configure reusable local and remote MCP servers once, then enable them per project from the session canvas top menu.")).toBeInTheDocument()
    expect(screen.queryByText("Pick a project first")).not.toBeInTheDocument()
    expect(screen.getByText("Diagnostic context")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /Filesystem enabled/ }))
    fireEvent.change(screen.getByRole("textbox", { name: "MCP server name" }), {
      target: { value: "Filesystem Tools" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save server" }))

    await waitFor(() => {
      expect(window.desktop!.updateGlobalMcpServer).toHaveBeenCalledWith({
        serverID: "filesystem",
        server: {
          name: "Filesystem Tools",
          transport: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem"],
          env: undefined,
          cwd: undefined,
          enabled: true,
          timeoutMs: undefined,
        },
      })
    })

    await waitFor(() => {
      expect(window.desktop!.getProjectMcpServerDiagnostic).toHaveBeenCalledWith({
        projectID: "project-2",
        serverID: "filesystem",
      })
    })
  })

  it("toggles the left rail from appearance settings", async () => {
    const { container } = render(<App />)
    const appShell = container.querySelector(".app-shell") as HTMLElement | null
    const getLeftActivityRail = () => container.querySelector(".activity-rail:not(.is-right)") as HTMLElement | null

    expect(appShell).not.toBeNull()
    expect(getLeftActivityRail()).not.toBeNull()
    expect(screen.getByRole("button", { name: "Collapse left sidebar" }).closest(".activity-rail")).not.toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }))
    await screen.findByRole("dialog", { name: "Settings" })

    fireEvent.click(screen.getByRole("button", { name: /^Appearance/ }))

    const railSwitch = screen.getByRole("switch", { name: "Show left rail" })
    expect(railSwitch).toHaveAttribute("aria-checked", "true")
    expect(getLeftActivityRail()).not.toBeNull()
    expect(appShell!.getAttribute("style")).toContain("--activity-rail-display-width: 54px")

    fireEvent.click(railSwitch)

    expect(railSwitch).toHaveAttribute("aria-checked", "false")
    expect(getLeftActivityRail()).toBeNull()
    expect(appShell!.getAttribute("style")).toContain("--activity-rail-display-width: 0px")
    expect(screen.getByRole("button", { name: "Collapse left sidebar" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open folder" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Collapse left sidebar" }).closest(".left-sidebar-top-menu")).not.toBeNull()

    fireEvent.click(screen.getAllByRole("button", { name: "Close settings" })[0])
    fireEvent.click(screen.getByRole("button", { name: "Collapse left sidebar" }))

    expect(appShell!.getAttribute("style")).toContain("--sidebar-display-width: 0px")
    expect(screen.getByRole("button", { name: "Expand left sidebar" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Expand left sidebar" }).closest(".canvas-region-top-menu")).not.toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Expand left sidebar" }))
    expect(screen.getByRole("button", { name: "Collapse left sidebar" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Collapse left sidebar" }).closest(".left-sidebar-top-menu")).not.toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }))
    await screen.findByRole("dialog", { name: "Settings" })
    fireEvent.click(screen.getByRole("button", { name: /^Appearance/ }))
    fireEvent.click(screen.getByRole("switch", { name: "Show left rail" }))

    expect(screen.getByRole("switch", { name: "Show left rail" })).toHaveAttribute("aria-checked", "true")
    expect(getLeftActivityRail()).not.toBeNull()
    expect(appShell!.getAttribute("style")).toContain("--activity-rail-display-width: 54px")
    expect(screen.getByRole("button", { name: "Collapse left sidebar" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Collapse left sidebar" }).closest(".activity-rail")).not.toBeNull()
  })

  it("keeps appearance settings focused on the left rail only", async () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }))
    await screen.findByRole("dialog", { name: "Settings" })
    fireEvent.click(screen.getByRole("button", { name: /^Appearance/ }))

    expect(screen.getByRole("switch", { name: "Show left rail" })).toBeInTheDocument()
    expect(screen.queryByRole("switch", { name: "Show right rail" })).not.toBeInTheDocument()
    expect(screen.getByText("No rail")).toBeInTheDocument()
  })

  it("keeps provider configuration focused on editable fields for environment-backed providers", async () => {
    window.desktop!.getGlobalProviderCatalog = vi.fn().mockResolvedValue([
      {
        id: "deepseek",
        name: "DeepSeek",
        source: "env",
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

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }))

    const settingsDialog = await screen.findByRole("dialog", { name: "Settings" })
    await screen.findByRole("heading", { name: "Provider Configuration" })

    const detailPanel = settingsDialog.querySelector(".settings-service-detail-panel")
    expect(detailPanel).not.toBeNull()
    expect((detailPanel as HTMLElement).querySelector(".settings-detail-meta-grid")).toBeNull()

    const detailHero = (detailPanel as HTMLElement).querySelector(".settings-detail-hero")
    expect(detailHero).not.toBeNull()
    expect(within(detailHero as HTMLElement).queryByText("Environment")).not.toBeInTheDocument()
    expect(
      within(detailPanel as HTMLElement).queryByText(
        "Edit the shared credentials and endpoint the app should use when routing to DeepSeek.",
      ),
    ).not.toBeInTheDocument()
    expect(
      within(detailPanel as HTMLElement).queryByText("This provider can also inherit credentials from the current environment."),
    ).not.toBeInTheDocument()
  })

  it("saves provider overrides from the settings page", async () => {
    const refreshedCatalog = createDeferred<
      {
        id: string
        name: string
        source: string
        env: string[]
        configured: boolean
        available: boolean
        apiKeyConfigured: boolean
        baseURL: string
        modelCount: number
      }[]
    >()
    const refreshedModels = createDeferred<{
      items: {
        id: string
        providerID: string
        name: string
        status: string
        available: boolean
        capabilities: {
          temperature: boolean
          reasoning: boolean
          attachment: boolean
          toolcall: boolean
          input: {
            text: boolean
            audio: boolean
            image: boolean
            video: boolean
            pdf: boolean
          }
          output: {
            text: boolean
            audio: boolean
            image: boolean
            video: boolean
            pdf: boolean
          }
        }
        limit: {
          context: number
          output: number
        }
      }[]
      selection: {
        model?: string
        small_model?: string
      }
    }>()

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
      .mockImplementationOnce(() => refreshedCatalog.promise)
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
      .mockImplementationOnce(() => refreshedModels.promise)

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

    await waitFor(() => {
      expect(window.desktop!.getGlobalProviderCatalog).toHaveBeenCalledTimes(2)
      expect(window.desktop!.getGlobalModels).toHaveBeenCalledTimes(2)
    })

    expect(screen.getByRole("heading", { name: "Provider Configuration" })).toBeInTheDocument()
    expect(screen.queryByText("Fetching provider catalog")).not.toBeInTheDocument()

    refreshedCatalog.resolve([
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
    refreshedModels.resolve({
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

  it("updates the active project model selection from the composer menu", async () => {
    window.desktop!.getProjectModels = vi.fn().mockResolvedValue({
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
        small_model: "deepseek/deepseek-reasoner",
      },
    })
    window.desktop!.updateProjectModelSelection = vi.fn().mockResolvedValue({
      model: "openai/gpt-4o-mini",
      small_model: "deepseek/deepseek-reasoner",
    })

    render(<App />)

    fireEvent.click(await screen.findByRole("button", { name: "Select model: DeepSeek Reasoner" }))
    fireEvent.click(screen.getByRole("button", { name: "GPT-4o mini" }))

    await waitFor(() => {
      expect(window.desktop!.updateProjectModelSelection).toHaveBeenCalledWith({
        projectID: "project-2",
        model: "openai/gpt-4o-mini",
        small_model: "deepseek/deepseek-reasoner",
      })
    })

    expect(await screen.findByRole("button", { name: "Select model: GPT-4o mini" })).toBeInTheDocument()
  })

  it("renders the project skill selector in the session canvas top menu and still sends selected skills", async () => {
    window.desktop!.getAgentHealth = vi.fn().mockResolvedValue({
      ok: true,
      baseURL: "http://127.0.0.1:4096",
    })
    window.desktop!.getProjectSkills = vi.fn().mockResolvedValue([
      {
        id: "skill-layout-review",
        name: "layout-review",
        description: "Review the current layout against the desktop shell spec.",
        path: "C:\\Users\\19128\\.anybox\\skills\\layout-review\\SKILL.md",
        scope: "user",
      },
    ])
    window.desktop!.getProjectSkillSelection = vi.fn().mockResolvedValue({
      skillIDs: [],
    })
    window.desktop!.updateProjectSkillSelection = vi.fn().mockResolvedValue({
      skillIDs: ["skill-layout-review"],
    })

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.getAgentHealth).toHaveBeenCalledTimes(1)
    })

    const skillButton = await screen.findByRole("button", { name: "Select project skills: Skills" })
    expect(skillButton.closest(".session-canvas-top-menu")).not.toBeNull()

    const composer = document.querySelector(".composer")
    expect(composer).not.toBeNull()
    expect(within(composer as HTMLElement).queryByRole("button", { name: /^Select project skills:/ })).not.toBeInTheDocument()

    fireEvent.click(skillButton)

    const skillMenu = screen.getByRole("dialog", { name: "Project skill selection" })
    fireEvent.click(within(skillMenu).getByRole("button", { name: /layout-review/i }))

    await waitFor(() => {
      expect(window.desktop!.updateProjectSkillSelection).toHaveBeenCalledWith({
        projectID: "project-2",
        skillIDs: ["skill-layout-review"],
      })
    })

    expect(await screen.findByRole("button", { name: "Select project skills: layout-review" })).toBeInTheDocument()

    fireEvent.change(screen.getByRole("textbox", { name: "Task draft" }), {
      target: {
        value: "Use the project skill selection for this task",
      },
    })
    fireEvent.click(getComposerSendButton())

    await waitFor(() => {
      expect(window.desktop!.sendAgentMessage).toHaveBeenCalledWith({
        sessionID: "session-backend",
        skills: ["skill-layout-review"],
        text: "Use the project skill selection for this task",
      })
    })

    expect(await screen.findByRole("button", { name: "Select project skills: layout-review" })).toBeInTheDocument()
  })

  it("renders the project MCP selector in the session canvas top menu and persists selected servers", async () => {
    window.desktop!.getAgentHealth = vi.fn().mockResolvedValue({
      ok: true,
      baseURL: "http://127.0.0.1:4096",
    })
    window.desktop!.getGlobalMcpServers = vi.fn().mockResolvedValue([
      {
        id: "filesystem",
        name: "Filesystem",
        transport: "stdio",
        command: "npx",
        enabled: true,
      },
    ])
    window.desktop!.getProjectMcpSelection = vi.fn().mockResolvedValue({
      serverIDs: [],
    })
    window.desktop!.updateProjectMcpSelection = vi.fn().mockResolvedValue({
      serverIDs: ["filesystem"],
    })

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.getAgentHealth).toHaveBeenCalledTimes(1)
    })

    const mcpButton = await screen.findByRole("button", { name: "Select project MCP servers: MCP" })
    expect(mcpButton.closest(".session-canvas-top-menu")).not.toBeNull()

    fireEvent.click(mcpButton)

    const mcpMenu = screen.getByRole("dialog", { name: "Project MCP server selection" })
    fireEvent.click(within(mcpMenu).getByRole("button", { name: /Filesystem/i }))

    await waitFor(() => {
      expect(window.desktop!.updateProjectMcpSelection).toHaveBeenCalledWith({
        projectID: "project-2",
        serverIDs: ["filesystem"],
      })
    })

    expect(await screen.findByRole("button", { name: "Select project MCP servers: Filesystem" })).toBeInTheDocument()

    fireEvent.change(screen.getByRole("textbox", { name: "Task draft" }), {
      target: {
        value: "Keep the selected MCP servers on the project",
      },
    })
    fireEvent.click(getComposerSendButton())

    await waitFor(() => {
      expect(window.desktop!.sendAgentMessage).toHaveBeenCalledWith({
        sessionID: "session-backend",
        skills: [],
        text: "Keep the selected MCP servers on the project",
      })
    })

    expect(await screen.findByRole("button", { name: "Select project MCP servers: Filesystem" })).toBeInTheDocument()
  })

  it("adds composer attachments and includes them in agent requests", async () => {
    window.desktop!.getAgentHealth = vi.fn().mockResolvedValue({
      ok: true,
      baseURL: "http://127.0.0.1:4096",
    })
    window.desktop!.pickComposerAttachments = vi.fn().mockResolvedValue([
      "C:\\Refs\\hero.png",
      "C:\\Refs\\brief.pdf",
    ])

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.getAgentHealth).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole("button", { name: "Add image or file" }))

    expect(await screen.findByText("hero.png")).toBeInTheDocument()
    expect(screen.getByText("brief.pdf")).toBeInTheDocument()

    fireEvent.change(screen.getByRole("textbox", { name: "Task draft" }), {
      target: {
        value: "Use the references to refine the layout",
      },
    })
    fireEvent.click(getComposerSendButton())

    await waitFor(() => {
      expect(window.desktop!.sendAgentMessage).toHaveBeenCalledWith({
        sessionID: "session-backend",
        skills: [],
        text:
          "Use the references to refine the layout\n\nAttached files:\n- hero.png: C:\\Refs\\hero.png\n- brief.pdf: C:\\Refs\\brief.pdf",
      })
    })
  })

  it("submits composer prompts without an agent mode selector", async () => {
    window.desktop!.getAgentHealth = vi.fn().mockResolvedValue({
      ok: true,
      baseURL: "http://127.0.0.1:4096",
    })

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.getAgentHealth).toHaveBeenCalledTimes(1)
    })

    expect(screen.queryByRole("button", { name: /^Agent mode:/ })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole("textbox", { name: "Task draft" }), {
      target: {
        value: "Audit the toolbar changes",
      },
    })
    fireEvent.click(getComposerSendButton())

    await waitFor(() => {
      expect(window.desktop!.sendAgentMessage).toHaveBeenCalledWith({
        sessionID: "session-backend",
        skills: [],
        text: "Audit the toolbar changes",
      })
    })
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
    fireEvent.click(getComposerSendButton())

    await waitFor(() => {
      expect(screen.getAllByText("Ship custom titlebar").length).toBeGreaterThan(0)
      expect(screen.getByRole("textbox", { name: "Task draft" })).toHaveValue("")
    })
  })

  it("renders streamed reasoning before completion and only shows the response after completion", async () => {
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
    await act(async () => {
      fireEvent.click(getComposerSendButton())
      await Promise.resolve()
    })

    const liveReasoning = await screen.findByText("Planning live update.")
    const reasoningItem = liveReasoning.closest(".trace-item")

    expect(liveReasoning).toBeInTheDocument()
    expect(reasoningItem).toHaveAttribute("data-kind", "reasoning")
    expect(reasoningItem).not.toBeNull()
    expect(reasoningItem?.querySelector(".trace-item-header")).toBeNull()
    expect(screen.queryByText("Streaming answer")).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Streaming response" })).not.toBeInTheDocument()
    expect(screen.queryByText("Renderer subscribed to live backend updates.")).not.toBeInTheDocument()
    expect(screen.queryByText("Waiting for backend response.")).not.toBeInTheDocument()
    expect(getComposerSendButton()).toBeDisabled()

    act(() => {
      finishStream?.()
    })

    expect(await screen.findByText("Streaming answer")).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Backend response received" })).not.toBeInTheDocument()
      expect(screen.queryByText("Backend finished streaming this turn.")).not.toBeInTheDocument()
      expect(getComposerSendButton()).toBeEnabled()
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
    const sendButton = getComposerSendButton()

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
    fireEvent.click(getComposerSendButton())

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

  it("toggles the terminal panel from the canvas bottom-left anchor and auto-creates the first terminal", async () => {
    render(<App />)

    const collapsedToggle = screen.getByRole("button", { name: "Toggle terminal panel" })
    expect(collapsedToggle.closest(".canvas-terminal-toggle-anchor")).not.toBeNull()

    fireEvent.click(collapsedToggle)

    await waitFor(() => {
      expect(window.desktop!.createPtySession).toHaveBeenCalledTimes(1)
      expect(window.desktop!.attachPtySession).toHaveBeenCalledWith({
        id: "pty-1",
        cursor: 0,
      })
    })

    expect(screen.getByRole("tablist", { name: "Terminal tabs" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "New terminal" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Toggle terminal panel" }).closest(".terminal-tabs")).not.toBeNull()
    expect(screen.getByRole("button", { name: "New terminal" })).toHaveTextContent("")
    expect(screen.getByRole("button", { name: "Toggle terminal panel" })).toHaveTextContent("")
    expect(screen.queryByText("New terminal")).not.toBeInTheDocument()
    expect(document.querySelector(".terminal-view-meta")).toBeNull()

    const composer = document.querySelector(".composer")
    const terminalPanel = document.querySelector(".terminal-panel")
    expect(composer).not.toBeNull()
    expect(terminalPanel).not.toBeNull()
    expect(composer!.compareDocumentPosition(terminalPanel!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)

    fireEvent.click(screen.getByRole("button", { name: "Toggle terminal panel" }))

    await waitFor(() => {
      expect(screen.queryByRole("tablist", { name: "Terminal tabs" })).not.toBeInTheDocument()
    })

    expect(screen.getByRole("button", { name: "Toggle terminal panel" }).closest(".canvas-terminal-toggle-anchor")).not.toBeNull()
  })

  it("appends live terminal output directly into the active terminal view", async () => {
    let ptyListener:
      | ((event: {
          ptyID: string
          type: string
          [key: string]: unknown
        }) => void)
      | undefined

    window.desktop!.onPtyEvent = vi.fn((listener) => {
      ptyListener = listener
      return vi.fn()
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Toggle terminal panel" }))

    await waitFor(() => {
      expect(window.desktop!.attachPtySession).toHaveBeenCalledWith({
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
          cursor: 8,
        },
        replay: {
          mode: "reset",
          buffer: "prompt> ",
          cursor: 8,
          startCursor: 0,
        },
      })
    })

    expect(await screen.findByText(/prompt>/)).toBeInTheDocument()

    act(() => {
      ptyListener?.({
        ptyID: "pty-1",
        type: "output",
        id: "out-1",
        data: "dir",
        cursor: 11,
      })
    })

    expect(await screen.findByText(/prompt>\s*dir/)).toBeInTheDocument()
  })

  it("keeps terminal output when switching between tabs", async () => {
    let ptyListener:
      | ((event: {
          ptyID: string
          type: string
          [key: string]: unknown
        }) => void)
      | undefined

    window.desktop!.onPtyEvent = vi.fn((listener) => {
      ptyListener = listener
      return vi.fn()
    })
    window.desktop!.createPtySession = vi
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
      })
    window.desktop!.attachPtySession = vi.fn().mockImplementation(async ({ id }: { id: string }) => ({
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
    }))

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Toggle terminal panel" }))

    await waitFor(() => {
      expect(window.desktop!.createPtySession).toHaveBeenCalledTimes(1)
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
          cursor: 12,
        },
        replay: {
          mode: "reset",
          buffer: "first output",
          cursor: 12,
          startCursor: 0,
        },
      })
    })

    expect(await screen.findByText("first output")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "New terminal" }))

    await waitFor(() => {
      expect(window.desktop!.createPtySession).toHaveBeenCalledTimes(2)
      expect(window.desktop!.attachPtySession).toHaveBeenCalledWith({
        id: "pty-2",
        cursor: 0,
      })
    })

    act(() => {
      ptyListener?.({
        ptyID: "pty-2",
        type: "ready",
        session: {
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
          cursor: 13,
        },
        replay: {
          mode: "reset",
          buffer: "second output",
          cursor: 13,
          startCursor: 0,
        },
      })
    })

    expect(await screen.findByText("second output")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("tab", { name: /Terminal 1/i }))
    expect(await screen.findByText("first output")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("tab", { name: /Terminal 2/i }))
    expect(await screen.findByText("second output")).toBeInTheDocument()
  })

  it("collapses the sidebar from the rail toggle and restores it on second click", () => {
    const { container } = render(<App />)
    const appShell = container.querySelector(".app-shell") as HTMLElement | null

    expect(appShell).not.toBeNull()
    expect(screen.getByRole("button", { name: "Open folder" })).toBeInTheDocument()
    expect(screen.getByTestId("sidebar-resizer")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Collapse left sidebar" }).closest(".activity-rail")).not.toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Collapse left sidebar" }))

    expect(appShell!.getAttribute("style")).toContain("--sidebar-display-width: 0px")
    expect(screen.queryByRole("button", { name: "Open folder" })).not.toBeInTheDocument()
    expect(screen.queryByTestId("sidebar-resizer")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Expand left sidebar" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Expand left sidebar" }).closest(".activity-rail")).not.toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Expand left sidebar" }))

    expect(appShell!.getAttribute("style")).toContain("--sidebar-display-width: 236px")
    expect(screen.getByRole("button", { name: "Open folder" })).toBeInTheDocument()
    expect(screen.getByTestId("sidebar-resizer")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Collapse left sidebar" }).closest(".activity-rail")).not.toBeNull()
  })

  it("collapses and restores the right sidebar from the canvas menu", () => {
    const { container } = render(<App />)
    const appShell = container.querySelector(".app-shell") as HTMLElement | null
    const rightSidebarTopMenu = screen.getByLabelText("Right sidebar top menu")

    expect(appShell).not.toBeNull()
    expect(appShell!.getAttribute("style")).toContain("--window-controls-right-sidebar-clearance: 124px")
    expect(appShell!.getAttribute("style")).toContain("--window-controls-canvas-clearance: 0px")
    expect(screen.getByRole("complementary", { name: "Inspector sidebar" })).toBeInTheDocument()
    expect(screen.getByTestId("right-sidebar-resizer")).toBeInTheDocument()
    expect(within(rightSidebarTopMenu).queryByRole("button", { name: "Collapse right sidebar" })).toBeNull()
    expect(screen.getByRole("button", { name: "Collapse right sidebar" }).closest(".canvas-region-top-menu")).not.toBeNull()
    expect(screen.getByRole("button", { name: "Collapse right sidebar" }).closest(".canvas-region-top-menu-trailing")).toHaveClass("is-right-sidebar-expanded")

    fireEvent.click(screen.getByRole("button", { name: "Collapse right sidebar" }))

    expect(appShell!.getAttribute("style")).toContain("--right-sidebar-display-width: 0px")
    expect(appShell!.getAttribute("style")).toContain("--window-controls-right-sidebar-clearance: 0px")
    expect(appShell!.getAttribute("style")).toContain("--window-controls-canvas-clearance: 124px")
    expect(screen.queryByRole("complementary", { name: "Inspector sidebar" })).not.toBeInTheDocument()
    expect(screen.queryByTestId("right-sidebar-resizer")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Expand right sidebar" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Expand right sidebar" }).closest(".canvas-region-top-menu")).not.toBeNull()
    expect(screen.getByRole("button", { name: "Expand right sidebar" }).closest(".canvas-region-top-menu-trailing")).toHaveClass("is-right-sidebar-collapsed")

    fireEvent.click(screen.getByRole("button", { name: "Expand right sidebar" }))

    expect(appShell!.getAttribute("style")).toContain("--right-sidebar-display-width: 236px")
    expect(appShell!.getAttribute("style")).toContain("--window-controls-right-sidebar-clearance: 124px")
    expect(appShell!.getAttribute("style")).toContain("--window-controls-canvas-clearance: 0px")
    expect(screen.getByRole("complementary", { name: "Inspector sidebar" })).toBeInTheDocument()
    expect(screen.getByTestId("right-sidebar-resizer")).toBeInTheDocument()
    expect(within(rightSidebarTopMenu).queryByRole("button", { name: "Collapse right sidebar" })).toBeNull()
    expect(screen.getByRole("button", { name: "Collapse right sidebar" }).closest(".canvas-region-top-menu")).not.toBeNull()
    expect(screen.getByRole("button", { name: "Collapse right sidebar" }).closest(".canvas-region-top-menu-trailing")).toHaveClass("is-right-sidebar-expanded")
  })

  it("resizes the left sidebar when dragging the divider", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Collapse right sidebar" }))

    expect(appShell!.getAttribute("style")).toContain("--sidebar-width: 236px")

    fireEvent.pointerDown(screen.getByTestId("sidebar-resizer"), {
      button: 0,
      clientX: 290,
    })

    await waitFor(() => {
      expect(document.body).toHaveClass("is-resizing-sidebar")
    })

    fireEvent.pointerMove(window, {
      clientX: 374,
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

  it("resizes the right sidebar when dragging the divider", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Collapse left sidebar" }))

    expect(appShell!.getAttribute("style")).toContain("--right-sidebar-width: 236px")

    fireEvent.pointerDown(screen.getByTestId("right-sidebar-resizer"), {
      button: 0,
      clientX: 964,
    })

    await waitFor(() => {
      expect(document.body).toHaveClass("is-resizing-sidebar")
    })

    fireEvent.pointerMove(window, {
      clientX: 880,
    })
    expect(appShell!.getAttribute("style")).toContain("--right-sidebar-width: 320px")

    fireEvent.pointerMove(window, {
      clientX: 640,
    })
    expect(appShell!.getAttribute("style")).toContain("--right-sidebar-width: 420px")

    fireEvent.pointerMove(window, {
      clientX: 1100,
    })
    expect(appShell!.getAttribute("style")).toContain("--right-sidebar-width: 192px")

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

  it("limits rounded corners to the prompt input shell, icon tabs, and canvas tab caps", () => {
    const nonZeroBorderRadii = Array.from(
      new Set(
        Array.from(styles.matchAll(/border-radius:\s*([^;]+);/g))
          .map(([, value]) => value.trim())
          .filter((value) => !/^0(?:\s|$)/.test(value)),
      ),
    ).sort()

    expect(nonZeroBorderRadii).toEqual(["28px", "8px", "var(--canvas-region-tab-cap-radius) var(--canvas-region-tab-cap-radius) 0 0"])
    expect(styles).toMatch(/\.prompt-input-shell\s*\{[^}]*border-radius:\s*28px;/s)
    expect(styles).toMatch(
      /\.canvas-region-top-menu\s*\{[^}]*--canvas-region-tab-cap-radius:\s*8px;/s,
    )
    expect(styles).toMatch(
      /\.canvas-region-top-menu\s+\.session-tab\s*\{[^}]*border-radius:\s*var\(--canvas-region-tab-cap-radius\) var\(--canvas-region-tab-cap-radius\) 0 0;/s,
    )
  })

  it("keeps the canvas tabs separate from the session top menu", () => {
    expect(styles).toMatch(/\.canvas\s*\{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto auto;[^}]*gap:\s*14px;/s)
    expect(styles).toMatch(/\.canvas-top-stack\s*\{[^}]*display:\s*grid;[^}]*gap:\s*6px;/s)
    expect(styles).toMatch(/\.window-controls-floating\s*\{[^}]*top:\s*5px;[^}]*gap:\s*10px;[^}]*padding:\s*0;[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s)
    expect(styles).toMatch(/\.window-control\s*\{[^}]*width:\s*30px;[^}]*min-width:\s*30px;[^}]*height:\s*30px;[^}]*min-height:\s*30px;[^}]*border-radius:\s*8px;[^}]*color:\s*#5f7384;/s)
    expect(styles).toMatch(/\.window-control svg\s*\{[^}]*width:\s*var\(--section-toolbar-icon-size\);[^}]*height:\s*var\(--section-toolbar-icon-size\);[^}]*stroke-width:\s*2;/s)
    expect(styles).toMatch(/\.window-control:hover,\s*\.window-control:focus-visible\s*\{[^}]*background:\s*rgba\(84,\s*96,\s*109,\s*0\.14\);[^}]*color:\s*#22303d;[^}]*transform:\s*none;/s)
    expect(styles).toMatch(/\.panel-toolbar\s*\{[^}]*min-height:\s*var\(--section-toolbar-height\);[^}]*padding:\s*0;/s)
    expect(styles).toMatch(/\.panel-toolbar-window-controls-spacer\s*\{[^}]*position:\s*absolute;[^}]*right:\s*0;[^}]*bottom:\s*0;[^}]*-webkit-app-region:\s*no-drag;/s)
    expect(styles).toMatch(/\.panel-toolbar-window-controls-spacer\.is-canvas\s*\{[^}]*width:\s*var\(--window-controls-canvas-clearance\);/s)
    expect(styles).toMatch(/\.panel-toolbar-window-controls-spacer\.is-right-sidebar\s*\{[^}]*width:\s*var\(--window-controls-right-sidebar-clearance\);/s)
    expect(styles).toMatch(/--section-toolbar-baseline:\s*var\(--section-toolbar-height\);/s)
    expect(styles).toMatch(/--section-toolbar-icon-size:\s*18px;/s)
    expect(styles).toMatch(/--section-toolbar-aux-icon-size:\s*12px;/s)
    expect(styles).toMatch(/\.top-menu-view-button\s*\{[^}]*border-radius:\s*8px;[^}]*background:\s*transparent;/s)
    expect(styles).toMatch(/\.top-menu-view-button-icon\s*\{[^}]*width:\s*var\(--section-toolbar-icon-size\);[^}]*height:\s*var\(--section-toolbar-icon-size\);/s)
    expect(styles).toMatch(/\.sidebar-toggle-button\.is-rail svg\s*\{[^}]*width:\s*var\(--section-toolbar-icon-size\);[^}]*height:\s*var\(--section-toolbar-icon-size\);[^}]*stroke-width:\s*2;/s)
    expect(styles).toMatch(/\.sidebar-toggle-button\.is-top-menu svg\s*\{[^}]*width:\s*var\(--section-toolbar-icon-size\);[^}]*height:\s*var\(--section-toolbar-icon-size\);[^}]*stroke-width:\s*2;/s)
    expect(styles).toMatch(/\.session-tab-close svg\s*\{[^}]*width:\s*var\(--section-toolbar-aux-icon-size\);[^}]*height:\s*var\(--section-toolbar-aux-icon-size\);[^}]*stroke-width:\s*2;/s)
    expect(styles).toMatch(/\.canvas-top-menu-git-trigger svg\s*\{[^}]*width:\s*var\(--section-toolbar-aux-icon-size\);[^}]*height:\s*var\(--section-toolbar-aux-icon-size\);[^}]*stroke-width:\s*2;/s)
    expect(styles).toMatch(/\.top-menu-view-button:hover,\s*\.top-menu-view-button:focus-visible\s*\{[^}]*background:\s*rgba\(84,\s*96,\s*109,\s*0\.14\);/s)
    expect(styles).toMatch(/\.top-menu-view-button\.is-active:hover,\s*\.top-menu-view-button\.is-active:focus-visible\s*\{[^}]*background:\s*rgba\(84,\s*96,\s*109,\s*0\.14\);/s)
    expect(styles).toMatch(/\.sidebar-toggle-button\.is-rail\s*\{[^}]*border-radius:\s*8px;/s)
    expect(styles).toMatch(/\.sidebar-toggle-button\.is-rail:hover,\s*\.sidebar-toggle-button\.is-rail:focus-visible\s*\{[^}]*background:\s*rgba\(84,\s*96,\s*109,\s*0\.14\);/s)
    expect(styles).toMatch(/\.sidebar-toggle-button\.is-rail\.is-active:hover,\s*\.sidebar-toggle-button\.is-rail\.is-active:focus-visible\s*\{[^}]*background:\s*rgba\(84,\s*96,\s*109,\s*0\.14\);/s)
    expect(styles).toMatch(/\.session-tab-trigger,\s*\.session-tab-close,[\s\S]*?\.canvas-region-top-menu-add-button\s*\{[^}]*border-radius:\s*8px;/s)
    expect(styles).toMatch(/\.session-tab-close:hover,\s*\.session-tab-close:focus-visible\s*\{[^}]*background:\s*transparent;[^}]*color:\s*#22303d;/s)
    expect(styles).toMatch(/\.canvas-region-top-menu \.sidebar-toggle-button\.is-top-menu:hover,\s*\.canvas-region-top-menu-add-button:hover\s*\{[^}]*background:\s*rgba\(84,\s*96,\s*109,\s*0\.14\);/s)
    expect(styles).toMatch(/--canvas-region-tab-hover:\s*rgba\(84,\s*96,\s*109,\s*0\.14\);/s)
    expect(styles).toMatch(/\.canvas-region-top-menu\s+\.session-tab:hover\s*\{[^}]*background:\s*var\(--canvas-region-tab-hover\);[^}]*border-color:\s*transparent;/s)
    expect(styles).toMatch(/\.canvas-region-top-menu\s+\.session-tab\.is-active:hover,\s*\.canvas-region-top-menu\s+\.session-tab\.is-active:focus-within\s*\{[^}]*linear-gradient\(0deg,\s*rgba\(84,\s*96,\s*109,\s*0\.12\),\s*rgba\(84,\s*96,\s*109,\s*0\.12\)\)/s)
    expect(styles).toMatch(/\.canvas-region-top-menu\s*\{[^}]*grid-template-columns:\s*auto minmax\(0,\s*1fr\) auto;[^}]*align-items:\s*center;[^}]*gap:\s*12px;[^}]*padding-bottom:\s*0;/s)
    expect(styles).toMatch(/\.canvas-region-top-menu\s*\{[^}]*padding-right:\s*var\(--window-controls-canvas-clearance\);/s)
    expect(styles).toMatch(/\.app-shell::after\s*\{[^}]*top:\s*var\(--section-toolbar-baseline\);[^}]*left:\s*var\(--activity-rail-display-width\);[^}]*right:\s*0;/s)
    expect(styles).toMatch(/\.canvas-region-top-menu-trailing\.is-right-sidebar-expanded\s*\{[^}]*margin-right:\s*calc\(-1 \* var\(--canvas-inline-padding\)\);/s)
    expect(styles).toMatch(/\.canvas-region-top-menu-trailing\.is-right-sidebar-collapsed\s*\{[^}]*margin-right:\s*8px;/s)
    expect(styles).toMatch(/\.canvas-region-top-menu-tabs-shell\s*\{[^}]*display:\s*flex;[^}]*gap:\s*4px;[^}]*max-width:\s*none;[^}]*justify-self:\s*stretch;/s)
    expect(styles).toMatch(/\.canvas-region-top-menu-tabs\s*\{[^}]*flex:\s*0 1 auto;[^}]*align-items:\s*center;[^}]*overflow-x:\s*auto;[^}]*padding-top:\s*0;/s)
    expect(styles).toMatch(/\.canvas-region-top-menu-add-button\s*\{[^}]*width:\s*28px;[^}]*min-width:\s*28px;[^}]*min-height:\s*28px;/s)
    expect(styles).toMatch(/\.canvas-region-top-menu-add-glyph\s*\{[^}]*font-size:\s*22px;[^}]*line-height:\s*1;/s)
    expect(styles).toMatch(/\.canvas-region-top-menu\s+\.session-tab\s*\{[^}]*min-height:\s*var\(--canvas-region-tab-height\);[^}]*padding:\s*0 10px 0 12px;/s)
    expect(styles).toMatch(
      /\.canvas-region-top-menu\s+\.session-tab\.is-active\s*\{[^}]*background:\s*linear-gradient\(180deg,\s*#ffffff 0%,\s*#fcfdff 100%\);[^}]*border-color:\s*var\(--canvas-region-tab-border\);[^}]*box-shadow:\s*0 1px 0 #ffffff,\s*inset 0 2px 0 var\(--canvas-region-tab-active-accent\);/s,
    )
    expect(styles).toMatch(/\.canvas-region-top-menu\s+\.session-tab\.is-active::before\s*\{[^}]*content:\s*\"\";[^}]*height:\s*2px;[^}]*background:\s*var\(--canvas-region-tab-active-accent\);/s)
    expect(styles).toMatch(
      /\.session-canvas-top-menu\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto;[^}]*align-items:\s*center;[^}]*gap:\s*12px;/s,
    )
    expect(styles).toMatch(
      /\.session-canvas-top-menu-copy strong\s*\{[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s,
    )
    expect(styles).toMatch(
      /\.canvas-top-menu-mcp-trigger,\s*\.canvas-top-menu-skill-trigger\s*\{[^}]*gap:\s*6px;[^}]*max-width:\s*min\(240px,\s*40vw\);/s,
    )
    expect(styles).toMatch(
      /\.canvas-top-menu-selector-panel\s*\{[^}]*top:\s*calc\(100%\s*\+\s*8px\);[^}]*right:\s*0;[^}]*min-width:\s*260px;[^}]*max-height:\s*min\(320px,\s*calc\(100dvh - 180px\)\);/s,
    )
  })

  it("styles composer selector buttons as bordered controls", () => {
    expect(styles).toMatch(
      /\.composer-selector-button\s*\{[^}]*min-height:\s*34px;[^}]*border:\s*1px solid rgba\(166,\s*186,\s*208,\s*0\.42\);[^}]*background:\s*#f5f8fb;/s,
    )
    expect(styles).toMatch(
      /\.composer-selector-button:hover,\s*\.composer-selector-button:focus-visible\s*\{[^}]*border-color:\s*rgba\(22,\s*119,\s*200,\s*0\.28\);/s,
    )
    expect(styles).toMatch(
      /\.composer-menu-panel\s*\{[^}]*bottom:\s*calc\(100%\s*\+\s*8px\);[^}]*max-height:\s*min\(320px,\s*calc\(100dvh - 180px\)\);[^}]*overflow:\s*auto;/s,
    )
  })

  it("styles assistant turns as three stacked panels with call separators", () => {
    expect(styles).toMatch(/\.assistant-section\s*\{[^}]*border:\s*1px solid rgba\(166,\s*186,\s*208,\s*0\.42\);[^}]*padding:\s*14px 16px;/s)
    expect(styles).toMatch(/\.assistant-shell\.is-sectioned\s*\{[^}]*border:\s*0;[^}]*padding:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s)
    expect(styles).toMatch(
      /\.assistant-section\.is-reasoning,\s*\.assistant-section\.is-response,\s*\.assistant-section\.is-tools\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*padding:\s*0;/s,
    )
    expect(styles).toMatch(/\.assistant-reasoning-separator::before,\s*\.assistant-reasoning-separator::after\s*\{[^}]*height:\s*1px;/s)
    expect(styles).toMatch(/\.assistant-section\.is-response\s+\.trace-item-header\s*\{[^}]*display:\s*none;/s)
    expect(styles).toMatch(/\.trace-item-toggle\s*\{[^}]*background:\s*transparent;[^}]*text-align:\s*left;[^}]*cursor:\s*pointer;/s)
  })

  it("keeps settings surfaces constrained as centered dialogs", () => {
    expect(styles).toMatch(/\.settings-page-overlay\s*\{[^}]*display:\s*grid;[^}]*place-items:\s*center;[^}]*overflow:\s*auto;/s)
    expect(styles).toMatch(
      /\.settings-page\s*\{[^}]*width:\s*min\(100%,\s*1320px\);[^}]*height:\s*min\(calc\(100dvh - 64px\),\s*860px\);[^}]*max-height:\s*min\(calc\(100dvh - 64px\),\s*860px\);/s,
    )
    expect(styles).toMatch(/\.settings-page-body,\s*\.settings-page-shell\s*\{[^}]*grid-template-columns:\s*220px minmax\(0,\s*1fr\);/s)
    expect(styles).toMatch(/\.settings-services-layout\s*\{[^}]*grid-template-columns:\s*320px minmax\(0,\s*1fr\);/s)
  })

  it("scopes provider scrolling to the column layout", () => {
    expect(styles).toMatch(/\.settings-page-main\.is-services\s*\{[^}]*overflow:\s*hidden;/s)
    expect(styles).toMatch(/\.settings-page-content,\s*\.settings-page-main\s*\{[^}]*scrollbar-gutter:\s*stable both-edges;/s)
    expect(styles).toMatch(/\.settings-service-list\s*\{[^}]*overflow:\s*auto;[^}]*scrollbar-gutter:\s*stable;/s)
    expect(styles).toMatch(/\.settings-service-detail-panel\s*\{[^}]*overflow:\s*auto;[^}]*scrollbar-gutter:\s*stable;/s)
  })

  it("keeps the settings primary nav minimal and color-led", () => {
    expect(styles).toMatch(/\.settings-page-close-button\s*\{[^}]*width:\s*32px;[^}]*background:\s*transparent;/s)
    expect(styles).toMatch(/\.settings-primary-nav-item\s*\{[^}]*background:\s*transparent;[^}]*grid-template-columns:\s*auto minmax\(0,\s*1fr\);/s)
    expect(styles).toMatch(/\.settings-primary-nav-item::before\s*\{[^}]*width:\s*2px;[^}]*opacity:\s*0;/s)
    expect(styles).toMatch(/\.settings-primary-nav-item:hover\s*\{[^}]*color:\s*#1d496c;/s)
    expect(styles).toMatch(/\.settings-primary-nav-item:focus-visible,\s*\.settings-primary-nav-item\.is-active\s*\{[^}]*color:\s*#0f67aa;/s)
  })
})
