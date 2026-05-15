import type { CreateSessionTab, WorkspaceGroup } from "../types"
import {
  getWorkbenchDockPanelId,
  type WorkbenchDockPanelReference,
} from "../workbench/dockview-state"
import { findSession, findWorkspaceByID } from "../workspace"

export function createSessionDockviewReference(sessionID: string): WorkbenchDockPanelReference {
  return {
    kind: "session",
    sessionID,
  }
}

export function createCreateSessionDockviewReference(createSessionTabID: string): WorkbenchDockPanelReference {
  return {
    kind: "create-session",
    createSessionTabID,
  }
}

export function getCreateSessionTitle(tab: CreateSessionTab | null | undefined, workspaces: WorkspaceGroup[]) {
  const workspace = findWorkspaceByID(workspaces, tab?.workspaceID ?? null)
  return workspace ? `Create / ${workspace.name}` : "Create session"
}

export function buildValidDockviewReferences(
  workspaces: WorkspaceGroup[],
  createSessionTabs: CreateSessionTab[],
) {
  const references: WorkbenchDockPanelReference[] = []

  for (const workspace of workspaces) {
    for (const session of workspace.sessions) {
      references.push(createSessionDockviewReference(session.id))
    }
  }

  for (const tab of createSessionTabs) {
    references.push(createCreateSessionDockviewReference(tab.id))
  }

  return references
}

export function buildDockviewPanelTitles(
  workspaces: WorkspaceGroup[],
  createSessionTabs: CreateSessionTab[],
) {
  const titles = new Map<string, string>()

  for (const workspace of workspaces) {
    for (const session of workspace.sessions) {
      titles.set(getWorkbenchDockPanelId(createSessionDockviewReference(session.id)), session.title)
    }
  }

  for (const tab of createSessionTabs) {
    titles.set(getWorkbenchDockPanelId(createCreateSessionDockviewReference(tab.id)), getCreateSessionTitle(tab, workspaces))
  }

  return titles
}

export function resolveWorkspaceIDForDockviewReference(
  reference: WorkbenchDockPanelReference | null,
  workspaces: WorkspaceGroup[],
  createSessionTabs: CreateSessionTab[],
) {
  if (!reference) return null
  if (reference.kind === "session") {
    return findSession(workspaces, reference.sessionID).workspace?.id ?? null
  }

  return createSessionTabs.find((tab) => tab.id === reference.createSessionTabID)?.workspaceID ?? null
}
