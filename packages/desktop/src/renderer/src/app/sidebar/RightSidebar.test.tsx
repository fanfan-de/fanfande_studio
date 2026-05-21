import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { DEFAULT_ASSISTANT_TRACE_VISIBILITY, type RightSidebarState, type RightSidebarTab, type WorkspaceGroup } from "../types"
import { DEFAULT_WORKSPACE_FILE_REVIEW_STATE, DEFAULT_WORKSPACE_PREVIEW_STATE } from "../agent-workspace/review-preview-state"
import type { SessionMessageTree } from "../session-message-tree"
import { RightSidebar } from "./RightSidebar"
import { SessionMessageTreePanel } from "./SessionMessageTreePanel"

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

function createMessageTreeTab(): RightSidebarTab {
  return {
    id: "message-tree-tab",
    kind: "message-tree",
    title: "Tree",
    targetKey: "message-tree:session-1",
    createdAt: 3,
    sessionID: "session-1",
  }
}

function createMessageTree(input?: {
  activeMessageID?: string
  activePathMessageIDs?: string[]
}): SessionMessageTree {
  return {
    activeMessageID: input?.activeMessageID ?? "assistant-1",
    activePathMessageIDs: input?.activePathMessageIDs ?? ["user-1", "assistant-1"],
    branchOptionsByParentID: {},
    childIDsByParentID: {
      "__root__": ["user-1"],
      "user-1": ["assistant-1", "assistant-2"],
      "assistant-1": ["user-2"],
    },
    nodesByID: {
      "user-1": {
        id: "user-1",
        sessionID: "session-1",
        role: "user",
        created: 1,
        parentMessageID: null,
        preview: "Root prompt",
      },
      "assistant-1": {
        id: "assistant-1",
        sessionID: "session-1",
        role: "assistant",
        created: 2,
        parentMessageID: "user-1",
        preview: "Active answer",
      },
      "user-2": {
        id: "user-2",
        sessionID: "session-1",
        role: "user",
        created: 3,
        parentMessageID: "assistant-1",
        preview: "Follow up",
      },
      "assistant-2": {
        id: "assistant-2",
        sessionID: "session-1",
        role: "assistant",
        created: 4,
        parentMessageID: "user-1",
        preview: "Alternative answer",
      },
    },
    rootMessageIDs: ["user-1"],
    sessionID: "session-1",
  }
}

function mockMessageTreeCanvasSize(width: number, height: number) {
  const widthSpy = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("session-message-tree-canvas") ? width : 0
  })
  const heightSpy = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("session-message-tree-canvas") ? height : 0
  })

  return () => {
    widthSpy.mockRestore()
    heightSpy.mockRestore()
  }
}

function renderRightSidebar(input: {
  activeSession?: WorkspaceGroup["sessions"][number] | null
  canOpenReview?: boolean
  canOpenTerminal?: boolean
  messageTreeBySession?: Record<string, SessionMessageTree>
  rightSidebar: RightSidebarState
  onActivateTab?: (tabID: string) => void
  onCloseTab?: (tabID: string) => void
  onOpenBrowserTab?: () => void
  onOpenFilesTab?: () => void
  onOpenMessageTreeTab?: () => void
  onOpenReviewTab?: () => void
  onOpenTerminalTab?: () => void
  onMessageTreeNodeSelect?: (sessionID: string, messageID: string) => void
}) {
  return render(
    <RightSidebar
      activeSession={input.activeSession === undefined ? workspace.sessions[0] ?? null : input.activeSession}
      activeSessionDirectory={workspace.directory}
      activeWorkspaceFileScopeDirectory={workspace.directory}
      activeWorkspaceFileScopeName={workspace.name}
      assistantTraceVisibility={DEFAULT_ASSISTANT_TRACE_VISIBILITY}
      canInsertWorkspaceFileCommentsIntoDraft={true}
      canOpenReview={input.canOpenReview ?? true}
      canOpenTerminal={input.canOpenTerminal ?? true}
      composerRefreshVersion={0}
      isAgentDebugTraceEnabled={false}
      isResolvingPermissionRequest={false}
      permissionRequestActionError={null}
      permissionRequestActionRequestID={null}
      rightSidebar={input.rightSidebar}
      selectedDiffFileBySession={{}}
      sessionDiffBySession={{}}
      sessionDiffStateBySession={{}}
      messageTreeBySession={input.messageTreeBySession ?? {}}
      sideChatPanelState={null}
      workspaces={[workspace]}
      onActivateTab={input.onActivateTab ?? vi.fn()}
      onCloseTab={input.onCloseTab ?? vi.fn()}
      onAskUserQuestionAnswer={vi.fn()}
      onArtifactLinkOpen={vi.fn()}
      onDiffFileRestore={vi.fn()}
      onDiffFileSelect={vi.fn()}
      onLocalFileLinkOpen={vi.fn()}
      onOpenBrowserTab={input.onOpenBrowserTab ?? vi.fn()}
      onOpenFilesTab={input.onOpenFilesTab ?? vi.fn()}
      onOpenMessageTreeTab={input.onOpenMessageTreeTab ?? vi.fn()}
      onOpenReviewTab={input.onOpenReviewTab ?? vi.fn()}
      onOpenTerminalTab={input.onOpenTerminalTab ?? vi.fn()}
      onMessageTreeNodeSelect={input.onMessageTreeNodeSelect ?? vi.fn()}
      onPreviewActiveInteractionChange={vi.fn()}
      onPreviewCommitInteraction={vi.fn()}
      onPreviewDraftUrlChange={vi.fn()}
      onPreviewOpen={vi.fn()}
      onPreviewOpenExternal={vi.fn()}
      onPreviewOpenUrl={vi.fn()}
      onPreviewReload={vi.fn()}
      onPermissionRequestResponse={vi.fn()}
      onSideChatCreate={vi.fn()}
      onSideChatDelete={vi.fn()}
      onSideChatDraftStateChange={vi.fn()}
      onSideChatPickAttachments={vi.fn()}
      onSideChatRemoveAttachment={vi.fn()}
      onSideChatSelect={vi.fn()}
      onSideChatSend={vi.fn()}
      onSessionModelSelectionChange={vi.fn()}
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
    const onOpenMessageTreeTab = vi.fn()
    const onOpenTerminalTab = vi.fn()

    renderRightSidebar({
      canOpenTerminal: false,
      rightSidebar: {
        activeTabID: null,
        tabs: [],
      },
      onOpenFilesTab,
      onOpenMessageTreeTab,
      onOpenTerminalTab,
    })

    fireEvent.click(screen.getByRole("button", { name: /^Files/ }))
    expect(onOpenFilesTab).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole("button", { name: /^Tree/ }))
    expect(onOpenMessageTreeTab).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: /^Terminal/ })).toBeDisabled()
    expect(onOpenTerminalTab).not.toHaveBeenCalled()
  })

  it("disables the tree launcher card without an active session", () => {
    const onOpenMessageTreeTab = vi.fn()

    renderRightSidebar({
      activeSession: null,
      rightSidebar: {
        activeTabID: null,
        tabs: [],
      },
      onOpenMessageTreeTab,
    })

    const treeLauncher = screen.getByRole("button", { name: /^Tree/ })
    expect(treeLauncher).toBeDisabled()
    fireEvent.click(treeLauncher)
    expect(onOpenMessageTreeTab).not.toHaveBeenCalled()
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
    expect(screen.getByRole("button", { name: /^Tree/ })).toBeInTheDocument()
  })

  it("renders message tree tabs and selects non-active nodes", () => {
    const onMessageTreeNodeSelect = vi.fn()

    renderRightSidebar({
      messageTreeBySession: {
        "session-1": createMessageTree(),
      },
      rightSidebar: {
        activeTabID: "message-tree-tab",
        tabs: [createMessageTreeTab()],
      },
      onMessageTreeNodeSelect,
    })

    expect(screen.getByText("Session tree")).toBeInTheDocument()
    expect(screen.getByText("4 messages")).toBeInTheDocument()
    expect(screen.getByText("Active answer").closest(".session-message-tree-row")).toHaveClass("is-active")
    expect(screen.getByText("Root prompt").closest(".session-message-tree-row")).toHaveClass("is-active-path")

    fireEvent.click(screen.getByRole("treeitem", { name: /Alternative answer/ }))
    expect(onMessageTreeNodeSelect).toHaveBeenCalledWith("session-1", "assistant-2")
  })

  it("renders message tree nodes as a directed graph and updates the active path", async () => {
    const restoreCanvasSize = mockMessageTreeCanvasSize(900, 680)
    const session = workspace.sessions[0] ?? null
    const rootActiveTree = createMessageTree({
      activeMessageID: "user-1",
      activePathMessageIDs: ["user-1"],
    })
    const childActiveTree = createMessageTree({
      activeMessageID: "assistant-1",
      activePathMessageIDs: ["user-1", "assistant-1"],
    })
    const onSelectMessage = vi.fn()
    const { rerender } = render(
      <SessionMessageTreePanel
        session={session}
        messageTree={rootActiveTree}
        onSelectMessage={onSelectMessage}
      />,
    )

    expect(screen.getByText("Root prompt").closest(".session-message-tree-graph-node")).toHaveClass("is-active")
    expect(screen.getByText("Active answer").closest(".session-message-tree-graph-node")).not.toHaveClass("is-active-path")
    const graph = document.querySelector(".session-message-tree-graph") as HTMLDivElement | null
    expect(graph).not.toBeNull()
    expect(graph?.style.transform).toBe("translate(272px, 171px)")
    expect(document.querySelector(".session-message-tree-edge")).not.toBeNull()

    rerender(
      <SessionMessageTreePanel
        session={session}
        messageTree={childActiveTree}
        onSelectMessage={onSelectMessage}
      />,
    )

    expect(await screen.findByText("Active answer")).toBeInTheDocument()
    expect(screen.getByText("Root prompt").closest(".session-message-tree-graph-node")).toHaveClass("is-active-path")
    expect(screen.getByText("Active answer").closest(".session-message-tree-graph-node")).toHaveClass("is-active")
    restoreCanvasSize()
  })

  it("pans the message tree canvas with right mouse drag and hides role labels", () => {
    render(
      <SessionMessageTreePanel
        session={workspace.sessions[0] ?? null}
        messageTree={createMessageTree()}
        onSelectMessage={vi.fn()}
      />,
    )

    expect(screen.queryByText("user")).not.toBeInTheDocument()
    expect(screen.queryByText("response")).not.toBeInTheDocument()

    const canvas = document.querySelector(".session-message-tree-canvas") as HTMLDivElement | null
    const graph = document.querySelector(".session-message-tree-graph") as HTMLDivElement | null
    expect(canvas).not.toBeNull()
    expect(graph).not.toBeNull()
    if (!canvas || !graph) return

    const initialTransform = graph.style.transform
    const rootNode = screen.getByText("Root prompt").closest(".session-message-tree-graph-node")
    expect(rootNode).not.toBeNull()
    if (!rootNode) return

    fireEvent.pointerDown(rootNode, {
      pointerId: 7,
      button: 2,
      buttons: 2,
      clientX: 120,
      clientY: 90,
    })
    expect(canvas).toHaveClass("is-panning")

    fireEvent.pointerMove(window, {
      pointerId: 7,
      buttons: 2,
      clientX: 80,
      clientY: 60,
    })

    expect(graph.style.transform).not.toBe(initialTransform)
    expect(graph.style.transform).toMatch(/translate\(-?\d+px,\s*-?\d+px\)/)

    fireEvent.pointerUp(window, {
      pointerId: 7,
      button: 2,
      buttons: 0,
    })
    expect(canvas).not.toHaveClass("is-panning")

    const transformAfterNodePan = graph.style.transform
    fireEvent.pointerDown(canvas, {
      pointerId: 8,
      button: 2,
      buttons: 2,
      clientX: 200,
      clientY: 140,
    })
    fireEvent.pointerMove(window, {
      pointerId: 8,
      buttons: 2,
      clientX: 250,
      clientY: 180,
    })
    expect(graph.style.transform).not.toBe(transformAfterNodePan)
    fireEvent.pointerUp(window, {
      pointerId: 8,
      button: 2,
      buttons: 0,
    })

    const contextMenuEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
    canvas.dispatchEvent(contextMenuEvent)
    expect(contextMenuEvent.defaultPrevented).toBe(true)
  })
})
