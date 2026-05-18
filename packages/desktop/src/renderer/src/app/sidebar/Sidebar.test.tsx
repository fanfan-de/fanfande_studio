import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import type { ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"
import type { SessionSummary, WorkspaceGroup } from "../types"
import { Sidebar } from "./Sidebar"

function createSession(id: string, title: string): SessionSummary {
  return {
    id,
    title,
    branch: "main",
    status: "Ready",
    created: 1,
    updated: 1,
    focus: "",
    summary: "",
  }
}

function createWorkspace(id = "workspace-1", name = "Workspace", sessionPrefix = ""): WorkspaceGroup {
  return {
    id,
    name,
    directory: `C:/work/${id}`,
    created: 1,
    updated: 1,
    project: {
      id: `project-${id}`,
      name: `Project ${id}`,
      worktree: `C:/work/${id}`,
    },
    sessions: [
      createSession(`${id}-session-unread`, `${sessionPrefix}Unread`),
      createSession(`${id}-session-visible`, `${sessionPrefix}Visible`),
      createSession(`${id}-session-read`, `${sessionPrefix}Read`),
    ],
  }
}

function renderSidebar(overrides: Partial<ComponentProps<typeof Sidebar>> = {}) {
  const props: ComponentProps<typeof Sidebar> = {
    activeSessionID: null,
    activeView: "workspace",
    deletingSessionID: null,
    expandedFolderIDs: ["workspace-1"],
    globalSkillsNavigatorProps: {
      creatingGlobalSkillName: "",
      creatingGlobalSkillDraftKind: "skill",
      creatingGlobalSkillParentDirectory: null,
      deletingGlobalSkillDirectory: null,
      expandedSkillPaths: [],
      globalSkillsRoot: "",
      globalSkillsTree: [],
      isCreateGlobalSkillDraftVisible: false,
      isCreatingGlobalSkill: false,
      isInstallingLocalSkill: false,
      isLoadingSkillsTree: false,
      renamingGlobalSkillDirectory: null,
      renamingGlobalSkillDraftDirectory: null,
      renamingGlobalSkillName: "",
      selectedGlobalSkillFilePath: null,
      onCreateGlobalSkill: vi.fn(),
      onCreateGlobalSkillDraftCancel: vi.fn(),
      onCreateGlobalSkillDraftChange: vi.fn(),
      onCreateGlobalSkillDraftStart: vi.fn(),
      onDeleteGlobalSkill: vi.fn(),
      onGitInstallDialogOpen: vi.fn(),
      onGlobalSkillDirectoryToggle: vi.fn(),
      onGlobalSkillFileSelect: vi.fn(),
      onLocalInstallDialogOpen: vi.fn(),
      onMoveGlobalSkillDirectoryStart: vi.fn(),
      onOpenGlobalSkillsFolder: vi.fn(),
      onRenameGlobalSkill: vi.fn(),
      onRenameGlobalSkillDraftCancel: vi.fn(),
      onRenameGlobalSkillDraftChange: vi.fn(),
      onRenameGlobalSkillDraftStart: vi.fn(),
    },
    hoveredFolderID: null,
    isCreatingProject: false,
    isCreatingSession: false,
    isSettingsOpen: false,
    mcpServersSidebarProps: {
      activeMcpServerID: null,
      deletingMcpServerID: null,
      isImportingMcpConfigJson: false,
      mcpServers: [],
      savingMcpServerID: null,
      onMcpServerSelect: vi.fn(),
      onStartNewMcpServer: vi.fn(),
    },
    promptPresetsSidebarProps: {
      deletingPromptPresetID: null,
      isCreatingPromptPreset: false,
      isInstallingPromptUrlPrompts: false,
      isPreviewingPromptUrlInstall: false,
      isPromptDirty: false,
      promptRoot: "",
      promptPresets: [],
      promptPresetSelection: null,
      selectedPromptPreset: null,
      onCreatePromptPreset: vi.fn(),
      onDeletePromptPreset: vi.fn(),
      onOpenPromptFolder: vi.fn(),
      onPromptPresetSelect: vi.fn(),
      onPromptUrlInstallDialogOpen: vi.fn(),
    },
    projectRowRefs: { current: {} },
    runningSessionIDs: [],
    selectedFolderID: "workspace-1",
    sessionCanvasUnreadBySession: {},
    showSidebarToggleButton: false,
    builtinToolsSidebarProps: {
      activeToolKind: null,
      builtinTools: [],
      onActiveToolKindChange: vi.fn(),
    },
    visibleCanvasSessionIDs: [],
    workspaces: [createWorkspace()],
    pinnedWorkspaceIDs: [],
    onHoveredFolderChange: vi.fn(),
    onOpenSettings: vi.fn(),
    onProjectArchiveSessions: vi.fn(),
    onProjectClick: vi.fn(),
    onProjectCreateSession: vi.fn(),
    onProjectOpenInExplorer: vi.fn(),
    onProjectPin: vi.fn(),
    onProjectRemove: vi.fn(),
    onSessionDelete: vi.fn(),
    onSessionSelect: vi.fn(),
    onSidebarAction: vi.fn(),
    onToggleSidebar: vi.fn(),
    ...overrides,
  }

  return render(<Sidebar {...props} />)
}

describe("Sidebar", () => {
  it("uses the workspace actions as the left sidebar top menu", () => {
    renderSidebar()

    const leftSidebarTopMenu = screen.getByLabelText("Left sidebar top menu")

    expect(within(leftSidebarTopMenu).getByRole("button", { name: "Open folder" })).toBeInTheDocument()
    expect(within(leftSidebarTopMenu).getByRole("button", { name: "Sort sessions" })).toBeInTheDocument()
    expect(within(leftSidebarTopMenu).getByRole("button", { name: "Create session" })).toBeInTheDocument()
    expect(screen.queryByRole("group", { name: "Workspace mode" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Chat" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Code" })).not.toBeInTheDocument()
  })

  it("requests workspace actions from the top menu", () => {
    const onSidebarAction = vi.fn()
    renderSidebar({ onSidebarAction })

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }))
    fireEvent.click(screen.getByRole("button", { name: "Sort sessions" }))
    fireEvent.click(screen.getByRole("button", { name: "Create session" }))

    expect(onSidebarAction).toHaveBeenNthCalledWith(1, "project")
    expect(onSidebarAction).toHaveBeenNthCalledWith(2, "sort")
    expect(onSidebarAction).toHaveBeenNthCalledWith(3, "new")
  })

  it("renders the workspace tree", () => {
    renderSidebar()

    expect(screen.getByRole("button", { name: "Workspace" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Unread" })).toBeInTheDocument()
  })

  it("shows the green dot only for unread session canvases that are not visible", () => {
    renderSidebar({
      activeSessionID: "workspace-1-session-visible",
      sessionCanvasUnreadBySession: {
        "workspace-1-session-unread": true,
        "workspace-1-session-visible": true,
      },
      visibleCanvasSessionIDs: ["workspace-1-session-visible"],
    })

    expect(screen.getByRole("button", { name: "Unread" }).querySelector(".session-row-status-dot")).not.toBeNull()
    expect(screen.getByRole("button", { name: "Visible" }).querySelector(".session-row-status-dot")).toBeNull()
    expect(screen.getByRole("button", { name: "Read" }).querySelector(".session-row-status-dot")).toBeNull()
  })

  it("shows a session creation age in the trailing slot", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-05-13T12:00:00+08:00"))
    const created = new Date("2026-05-13T11:32:00+08:00").getTime()

    try {
      renderSidebar({
        workspaces: [
          {
            ...createWorkspace(),
            sessions: [
              {
                ...createSession("workspace-1-session-recent", "Recent"),
                created,
                updated: new Date("2026-05-13T11:59:00+08:00").getTime(),
              },
            ],
          },
        ],
      })

      expect(screen.getByText("28 \u5206")).toHaveClass("session-row-created-at")
      expect(screen.getByRole("button", { name: "Recent" })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Archive session Recent" })).toBeInTheDocument()
    } finally {
      cleanup()
      vi.useRealTimers()
    }
  })

  it("renders session rows for every expanded workspace", () => {
    renderSidebar({
      expandedFolderIDs: ["workspace-1", "workspace-2"],
      selectedFolderID: "workspace-2",
      workspaces: [
        createWorkspace("workspace-1", "Workspace 1", "One "),
        createWorkspace("workspace-2", "Workspace 2", "Two "),
        createWorkspace("workspace-3", "Workspace 3", "Three "),
      ],
    })

    expect(screen.getByRole("button", { name: "Workspace 1" })).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("button", { name: "Workspace 2" })).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("button", { name: "Workspace 3" })).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByRole("button", { name: "One Unread" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Two Unread" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Three Unread" })).not.toBeInTheDocument()
  })

  it("shows the project root path inline with the folder name", () => {
    renderSidebar()

    const workspaceRow = screen.getByRole("button", { name: "Workspace" })
    expect(workspaceRow.querySelector(".project-row-label")).toHaveTextContent("Workspace")
    expect(workspaceRow.querySelector(".project-row-meta")).toHaveAttribute("title", "C:/work/workspace-1")
    expect(workspaceRow.querySelector(".project-row-meta-label")).toHaveTextContent("C:/work/workspace-1")
  })

  it("opens workspace row actions from the context menu", () => {
    const onProjectArchiveSessions = vi.fn()
    const onProjectOpenInExplorer = vi.fn()
    const onProjectPin = vi.fn()
    const onProjectRemove = vi.fn()
    renderSidebar({
      onProjectArchiveSessions,
      onProjectOpenInExplorer,
      onProjectPin,
      onProjectRemove,
    })

    expect(screen.queryByRole("button", { name: "移除 Workspace" })).not.toBeInTheDocument()

    fireEvent.contextMenu(screen.getByRole("button", { name: "Workspace" }), {
      clientX: 120,
      clientY: 140,
    })
    fireEvent.click(screen.getByRole("menuitem", { name: "置顶项目" }))
    expect(onProjectPin).toHaveBeenCalledWith(expect.objectContaining({ id: "workspace-1" }))

    fireEvent.contextMenu(screen.getByRole("button", { name: "Workspace" }), {
      clientX: 120,
      clientY: 140,
    })
    fireEvent.click(screen.getByRole("menuitem", { name: "在资源管理器中打开" }))
    expect(onProjectOpenInExplorer).toHaveBeenCalledWith(expect.objectContaining({ id: "workspace-1" }))

    fireEvent.contextMenu(screen.getByRole("button", { name: "Workspace" }), {
      clientX: 120,
      clientY: 140,
    })
    fireEvent.click(screen.getByRole("menuitem", { name: "归档所有对话" }))
    expect(onProjectArchiveSessions).toHaveBeenCalledWith(expect.objectContaining({ id: "workspace-1" }))

    fireEvent.contextMenu(screen.getByRole("button", { name: "Workspace" }), {
      clientX: 120,
      clientY: 140,
    })
    fireEvent.click(screen.getByRole("menuitem", { name: "移除" }))
    expect(onProjectRemove).toHaveBeenCalledWith(expect.objectContaining({ id: "workspace-1" }), expect.anything())
  })
})
