import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { RightSidebarState, RightSidebarTab, WorkspaceGroup } from "../types"
import { DEFAULT_WORKSPACE_FILE_REVIEW_STATE, DEFAULT_WORKSPACE_PREVIEW_STATE } from "../agent-workspace/review-preview-state"
import { RightSidebar } from "./RightSidebar"

const workspace: WorkspaceGroup = {
  id: "workspace-1",
  name: "Workspace",
  directory: "C:/work/workspace-1",
  created: 1,
  updated: 1,
  project: {
    id: "project-1",
    name: "Project",
    worktree: "C:/work/workspace-1",
  },
  sessions: [
    {
      id: "session-1",
      title: "Session",
      branch: "main",
      focus: "Build",
      summary: "",
      status: "Ready",
      updated: 1,
    },
  ],
}

function createFilesTab(): RightSidebarTab {
  return {
    id: "files-tab",
    kind: "files",
    title: "Files",
    targetKey: "files:workspace",
    createdAt: 1,
    scopeDirectory: workspace.directory,
    scopeName: workspace.name,
    state: {
      ...DEFAULT_WORKSPACE_FILE_REVIEW_STATE,
      scopeDirectory: workspace.directory,
    },
  }
}

function createBrowserTab(): RightSidebarTab {
  return {
    id: "browser-tab",
    kind: "browser",
    title: "Browser",
    targetKey: "browser:workspace",
    createdAt: 2,
    workspaceID: workspace.id,
    workspaceRoot: workspace.directory,
    state: DEFAULT_WORKSPACE_PREVIEW_STATE,
  }
}

function renderRightSidebar(input: {
  canOpenReview?: boolean
  canOpenTerminal?: boolean
  rightSidebar: RightSidebarState
  onActivateTab?: (tabID: string) => void
  onCloseTab?: (tabID: string) => void
  onOpenBrowserTab?: () => void
  onOpenFilesTab?: () => void
  onOpenReviewTab?: () => void
  onOpenTerminalTab?: () => void
}) {
  return render(
    <RightSidebar
      activeSession={workspace.sessions[0] ?? null}
      activeSessionDirectory={workspace.directory}
      activeWorkspaceFileScopeDirectory={workspace.directory}
      activeWorkspaceFileScopeName={workspace.name}
      canInsertWorkspaceFileCommentsIntoDraft={true}
      canOpenReview={input.canOpenReview ?? true}
      canOpenTerminal={input.canOpenTerminal ?? true}
      rightSidebar={input.rightSidebar}
      selectedDiffFileBySession={{}}
      sessionDiffBySession={{}}
      sessionDiffStateBySession={{}}
      workspaces={[workspace]}
      onActivateTab={input.onActivateTab ?? vi.fn()}
      onCloseTab={input.onCloseTab ?? vi.fn()}
      onDiffFileRestore={vi.fn()}
      onDiffFileSelect={vi.fn()}
      onOpenBrowserTab={input.onOpenBrowserTab ?? vi.fn()}
      onOpenFilesTab={input.onOpenFilesTab ?? vi.fn()}
      onOpenReviewTab={input.onOpenReviewTab ?? vi.fn()}
      onOpenTerminalTab={input.onOpenTerminalTab ?? vi.fn()}
      onPreviewActiveInteractionChange={vi.fn()}
      onPreviewCommitInteraction={vi.fn()}
      onPreviewDraftUrlChange={vi.fn()}
      onPreviewOpen={vi.fn()}
      onPreviewOpenExternal={vi.fn()}
      onPreviewOpenUrl={vi.fn()}
      onPreviewReload={vi.fn()}
      onWorkspaceFileCommentCancel={vi.fn()}
      onWorkspaceFileCommentChange={vi.fn()}
      onWorkspaceFileCommentConfirm={vi.fn()}
      onWorkspaceFileCommentStart={vi.fn()}
      onWorkspaceFileQueryChange={vi.fn()}
      onWorkspaceFileSelect={vi.fn()}
      renderTerminalTab={() => <div role="region" aria-label="Terminal tab" />}
    />,
  )
}

describe("RightSidebar", () => {
  it("shows the launcher when there are no right sidebar tabs", () => {
    const onOpenFilesTab = vi.fn()
    const onOpenTerminalTab = vi.fn()

    renderRightSidebar({
      canOpenTerminal: false,
      rightSidebar: {
        activeTabID: null,
        tabs: [],
      },
      onOpenFilesTab,
      onOpenTerminalTab,
    })

    fireEvent.click(screen.getByRole("button", { name: /^Files/ }))
    expect(onOpenFilesTab).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: /^Terminal/ })).toBeDisabled()
    expect(onOpenTerminalTab).not.toHaveBeenCalled()
  })

  it("renders dynamic tabs and exposes the plus launcher entry", () => {
    const onActivateTab = vi.fn()
    const onCloseTab = vi.fn()
    renderRightSidebar({
      rightSidebar: {
        activeTabID: "browser-tab",
        tabs: [createFilesTab(), createBrowserTab()],
      },
      onActivateTab,
      onCloseTab,
    })

    fireEvent.click(screen.getByRole("tab", { name: /Files/ }))
    expect(onActivateTab).toHaveBeenCalledWith("files-tab")

    fireEvent.click(screen.getByRole("button", { name: "Close Browser" }))
    expect(onCloseTab).toHaveBeenCalledWith("browser-tab")

    fireEvent.click(screen.getByRole("button", { name: "Open right sidebar launcher" }))
    expect(screen.getByRole("button", { name: /^Review/ })).toBeInTheDocument()
  })
})
