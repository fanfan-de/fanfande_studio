import { render, screen } from "@testing-library/react"
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

function createWorkspace(): WorkspaceGroup {
  return {
    id: "workspace-1",
    name: "Workspace",
    directory: "C:/work/workspace",
    created: 1,
    updated: 1,
    project: {
      id: "project-1",
      name: "Project",
      worktree: "C:/work/workspace",
    },
    sessions: [
      createSession("session-unread", "Unread"),
      createSession("session-visible", "Visible"),
      createSession("session-read", "Read"),
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
    expandedFolderID: "workspace-1",
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
    ...overrides,
  }

  return render(<Sidebar {...props} />)
}

describe("Sidebar", () => {
  it("shows the green dot only for unread session canvases that are not visible", () => {
    renderSidebar({
      activeSessionID: "session-visible",
      sessionCanvasUnreadBySession: {
        "session-unread": true,
        "session-visible": true,
      },
      visibleCanvasSessionIDs: ["session-visible"],
    })

    expect(screen.getByRole("button", { name: "Unread" }).querySelector(".session-row-status-dot")).not.toBeNull()
    expect(screen.getByRole("button", { name: "Visible" }).querySelector(".session-row-status-dot")).toBeNull()
    expect(screen.getByRole("button", { name: "Read" }).querySelector(".session-row-status-dot")).toBeNull()
  })
})
