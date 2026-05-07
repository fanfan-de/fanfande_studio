import { fireEvent, render, screen } from "@testing-library/react"
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
    creatingGlobalSkillName: "",
    deletingGlobalSkillDirectory: null,
    deletingSessionID: null,
    expandedFolderIDs: ["workspace-1"],
    expandedSkillPaths: [],
    globalSkillsRoot: "",
    globalSkillsTree: [],
    hoveredFolderID: null,
    isCreateGlobalSkillDraftVisible: false,
    isCreatingGlobalSkill: false,
    isCreatingProject: false,
    isCreatingSession: false,
    isLoadingSkillsTree: false,
    isSettingsOpen: false,
    projectRowRefs: { current: {} },
    renamingGlobalSkillDirectory: null,
    renamingGlobalSkillDraftDirectory: null,
    renamingGlobalSkillName: "",
    runningSessionIDs: [],
    selectedFolderID: "workspace-1",
    selectedGlobalSkillFilePath: null,
    sessionCanvasUnreadBySession: {},
    showSidebarToggleButton: false,
    visibleCanvasSessionIDs: [],
    workspaces: [createWorkspace()],
    workspaceMode: "code",
    onCreateGlobalSkill: vi.fn(),
    onCreateGlobalSkillDraftCancel: vi.fn(),
    onCreateGlobalSkillDraftChange: vi.fn(),
    onCreateGlobalSkillDraftStart: vi.fn(),
    onDeleteGlobalSkill: vi.fn(),
    onGlobalSkillDirectoryToggle: vi.fn(),
    onGlobalSkillFileSelect: vi.fn(),
    onHoveredFolderChange: vi.fn(),
    onOpenSettings: vi.fn(),
    onProjectClick: vi.fn(),
    onProjectCreateSession: vi.fn(),
    onProjectRemove: vi.fn(),
    onRenameGlobalSkill: vi.fn(),
    onRenameGlobalSkillDraftCancel: vi.fn(),
    onRenameGlobalSkillDraftChange: vi.fn(),
    onRenameGlobalSkillDraftStart: vi.fn(),
    onSessionDelete: vi.fn(),
    onSessionSelect: vi.fn(),
    onSidebarAction: vi.fn(),
    onToggleSidebar: vi.fn(),
    onViewChange: vi.fn(),
    onWorkspaceModeChange: vi.fn(),
    ...overrides,
  }

  return render(<Sidebar {...props} />)
}

describe("Sidebar", () => {
  it("renders the workspace mode selector with Code active by default", () => {
    renderSidebar()

    expect(screen.getByRole("group", { name: "Workspace mode" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Chat" })).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByRole("button", { name: "Cowork" })).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByRole("button", { name: "Code" })).toHaveAttribute("aria-pressed", "true")
  })

  it("requests workspace mode changes from the segmented selector", () => {
    const onWorkspaceModeChange = vi.fn()
    renderSidebar({ onWorkspaceModeChange })

    fireEvent.click(screen.getByRole("button", { name: "Chat" }))
    fireEvent.click(screen.getByRole("button", { name: "Cowork" }))

    expect(onWorkspaceModeChange).toHaveBeenNthCalledWith(1, "chat")
    expect(onWorkspaceModeChange).toHaveBeenNthCalledWith(2, "cowork")
  })

  it("keeps the code workspace tree in Code mode", () => {
    renderSidebar({ workspaceMode: "code" })

    expect(screen.getByRole("button", { name: "Workspace" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Unread" })).toBeInTheDocument()
  })

  it("replaces the code workspace tree with Chat and Cowork placeholders", () => {
    const { unmount } = renderSidebar({ workspaceMode: "chat" })

    expect(screen.getByText("Chat projects")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Workspace" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Unread" })).not.toBeInTheDocument()

    unmount()
    renderSidebar({ workspaceMode: "cowork" })

    expect(screen.getByText("Cowork projects")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Workspace" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Unread" })).not.toBeInTheDocument()
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
})
