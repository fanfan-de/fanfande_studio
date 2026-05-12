import { describe, expect, it } from "vitest"
import type { SessionSummary, WorkspaceGroup } from "./types"
import {
  findFirstSession,
  getPrimaryWorkspaceSessions,
  selectAfterSessionDelete,
  sortWorkspaceGroups,
  updateSessionModelSelectionInWorkspaces,
} from "./workspace"

function buildSession(id: string, kind: SessionSummary["kind"], updated = 1): SessionSummary {
  return {
    id,
    title: id,
    branch: `C:/workspace/${id}`,
    status: "Ready",
    updated,
    focus: kind === "side-chat" ? "Side chat" : "Backend",
    summary: kind === "side-chat" ? "Read-only side chat" : "Main session",
    kind,
  }
}

function buildWorkspace(id: string, sessions: SessionSummary[], updated = 1): WorkspaceGroup {
  return {
    id,
    name: id,
    directory: `C:/workspace/${id}`,
    exists: true,
    created: 1,
    updated,
    project: {
      id: `${id}-project`,
      name: id,
      worktree: `C:/workspace/${id}`,
    },
    sessions,
  }
}

describe("workspace primary session selection", () => {
  it("does not treat side chats as primary sessions", () => {
    const sessions = [buildSession("side-chat-1", "side-chat"), buildSession("main-1", "main")]

    expect(getPrimaryWorkspaceSessions(sessions).map((session) => session.id)).toEqual(["main-1"])
    expect(getPrimaryWorkspaceSessions([buildSession("side-chat-2", "side-chat")])).toEqual([])
  })

  it("skips side-chat-only workspaces when choosing the first real session", () => {
    const sideOnlyWorkspace = buildWorkspace("side-only", [buildSession("side-chat-1", "side-chat", 20)], 20)
    const mainWorkspace = buildWorkspace("main-workspace", [buildSession("main-1", "main", 10)], 10)

    const selection = findFirstSession([sideOnlyWorkspace, mainWorkspace])

    expect(selection.workspace?.id).toBe("main-workspace")
    expect(selection.session?.id).toBe("main-1")
  })

  it("treats a workspace with only side chats as having no selectable session after archiving", () => {
    const sideChat = buildSession("side-chat-1", "side-chat", 30)
    const workspaces = [buildWorkspace("workspace-1", [sideChat], 30)]

    const selection = selectAfterSessionDelete(workspaces, "workspace-1", "main-1", "main-1")

    expect(selection.workspace?.id).toBe("workspace-1")
    expect(selection.session).toBeNull()
  })

  it("updates model selection for only the target session", () => {
    const sessionA = buildSession("session-a", "main")
    const sessionB = buildSession("session-b", "main")
    const [workspace] = updateSessionModelSelectionInWorkspaces(
      [buildWorkspace("workspace-1", [sessionA, sessionB])],
      "session-a",
      { model: "openai/gpt-5.4" },
    )

    expect(workspace?.sessions.find((session) => session.id === "session-a")?.modelSelection?.model).toBe("openai/gpt-5.4")
    expect(workspace?.sessions.find((session) => session.id === "session-b")?.modelSelection).toBeUndefined()
  })

  it("keeps pinned workspaces above recency-sorted workspaces", () => {
    const oldPinnedWorkspace = buildWorkspace("old-pinned", [], 1)
    const recentWorkspace = buildWorkspace("recent", [], 100)
    const secondPinnedWorkspace = buildWorkspace("second-pinned", [], 2)

    expect(
      sortWorkspaceGroups([recentWorkspace, oldPinnedWorkspace, secondPinnedWorkspace], ["second-pinned", "old-pinned"]).map(
        (workspace) => workspace.id,
      ),
    ).toEqual(["second-pinned", "old-pinned", "recent"])
  })
})
