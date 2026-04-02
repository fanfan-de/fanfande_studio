import type { LoadedFolderWorkspace, LoadedSessionSnapshot, SessionSummary, WorkspaceGroup } from "./types"

export function sortWorkspaceGroups(input: WorkspaceGroup[]) {
  const getWorkspaceUpdated = (workspace: WorkspaceGroup) => workspace.sessions[0]?.updated ?? workspace.updated

  return [...input].sort((left, right) => {
    const leftUpdated = getWorkspaceUpdated(left)
    const rightUpdated = getWorkspaceUpdated(right)
    return rightUpdated - leftUpdated
  })
}

export function mapLoadedSession(session: LoadedSessionSnapshot, sessionIndex: number): SessionSummary {
  return {
    id: session.id,
    title: session.title.trim() || `Session ${sessionIndex + 1}`,
    branch: session.directory,
    status: "Ready",
    updated: session.updated,
    focus: "Backend",
    summary: `Loaded from ${session.directory}`,
  }
}

export function mapLoadedWorkspace(workspace: LoadedFolderWorkspace): WorkspaceGroup {
  return {
    id: workspace.id,
    name: workspace.name.trim() || workspace.directory,
    directory: workspace.directory,
    created: workspace.created,
    updated: workspace.updated,
    project: workspace.project,
    sessions: [...workspace.sessions].sort((left, right) => right.updated - left.updated).map(mapLoadedSession),
  }
}

export function mapLoadedWorkspaces(input: LoadedFolderWorkspace[]) {
  return sortWorkspaceGroups(
    [...input]
      .sort((left, right) => {
        const leftUpdated = left.sessions[0]?.updated ?? left.updated
        const rightUpdated = right.sessions[0]?.updated ?? right.updated
        return rightUpdated - leftUpdated
      })
      .map(mapLoadedWorkspace),
  )
}

export function upsertWorkspaceGroup(existing: WorkspaceGroup[], nextWorkspace: WorkspaceGroup) {
  const withoutCurrent = existing.filter((workspace) => workspace.id !== nextWorkspace.id)
  return sortWorkspaceGroups([...withoutCurrent, nextWorkspace])
}

export function upsertSessionInWorkspace(existing: WorkspaceGroup[], workspaceID: string, nextSession: SessionSummary) {
  return sortWorkspaceGroups(
    existing.map((workspace) =>
      workspace.id === workspaceID
        ? {
            ...workspace,
            updated: Math.max(workspace.updated, nextSession.updated),
            sessions: [nextSession, ...workspace.sessions.filter((session) => session.id !== nextSession.id)].sort(
              (left, right) => right.updated - left.updated,
            ),
          }
        : workspace,
    ),
  )
}

export function findFirstSession(workspaces: WorkspaceGroup[]) {
  for (const workspace of workspaces) {
    if (workspace.sessions[0]) {
      return {
        workspace,
        session: workspace.sessions[0],
      }
    }
  }

  return {
    workspace: workspaces[0] ?? null,
    session: null,
  }
}

export function findSession(workspaces: WorkspaceGroup[], sessionID: string | null) {
  if (!sessionID) {
    return {
      workspace: null,
      session: null,
    }
  }

  for (const workspace of workspaces) {
    const session = workspace.sessions.find((item) => item.id === sessionID)
    if (session) return { workspace, session }
  }

  return {
    workspace: null,
    session: null,
  }
}

export function findWorkspaceByID(workspaces: WorkspaceGroup[], workspaceID: string | null) {
  if (!workspaceID) return null
  return workspaces.find((workspace) => workspace.id === workspaceID) ?? null
}

export function selectAfterSessionDelete(
  workspaces: WorkspaceGroup[],
  workspaceID: string,
  deletedSessionID: string,
  activeSessionID: string | null,
) {
  if (activeSessionID && activeSessionID !== deletedSessionID) {
    const currentSelection = findSession(workspaces, activeSessionID)
    if (currentSelection.session) {
      return currentSelection
    }
  }

  const sameWorkspace = workspaces.find((workspace) => workspace.id === workspaceID) ?? null
  if (sameWorkspace) {
    return {
      workspace: sameWorkspace,
      session: sameWorkspace.sessions[0] ?? null,
    }
  }

  return findFirstSession(workspaces)
}
