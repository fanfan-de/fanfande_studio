import path from "node:path"
import type { AgentFolderWorkspace, AgentProjectInfo, AgentProjectWorkspace } from "./types"

function normalizePath(input: string) {
  const resolved = path.resolve(input)
  const normalized = path.normalize(resolved)
  return process.platform === "win32" ? normalized.toLowerCase() : normalized
}

function samePath(left: string, right: string) {
  return normalizePath(left) === normalizePath(right)
}

function getProjectName(project: { name?: string; worktree: string }) {
  if (project.worktree === "/") return "Global"

  const trimmed = project.name?.trim()
  if (trimmed) return trimmed

  const fallback = project.worktree.split(/[\\/]/).filter(Boolean).pop()
  return fallback || "Global"
}

function getFolderName(directory: string) {
  const normalized = directory.replace(/[\\/]+$/, "")
  const fallback = normalized.split(/[\\/]/).filter(Boolean).pop()
  return fallback || directory
}

function getSessionsForDirectory(workspace: AgentProjectWorkspace, directory: string) {
  return workspace.sessions
    .filter((session) => samePath(session.directory, directory))
    .sort((left, right) => right.updated - left.updated)
}

export function buildFolderWorkspaceForDirectory(
  project: AgentProjectInfo,
  workspace: AgentProjectWorkspace,
  directory: string,
): AgentFolderWorkspace {
  const sessions = getSessionsForDirectory(workspace, directory)

  return {
    id: directory,
    directory,
    name: getFolderName(directory),
    created: sessions[0]?.created ?? workspace.created,
    updated: sessions[0]?.updated ?? workspace.updated,
    project: {
      id: project.id,
      name: getProjectName(project),
      worktree: project.worktree,
    },
    sessions,
  }
}

export function buildFolderWorkspaces(projects: AgentProjectInfo[], workspaces: AgentProjectWorkspace[]) {
  const folderWorkspaces: AgentFolderWorkspace[] = []

  for (const [index, workspace] of workspaces.entries()) {
    const project = projects[index]
    if (!project) continue

    const directories = new Map<string, string>()
    for (const session of workspace.sessions) {
      directories.set(normalizePath(session.directory), session.directory)
    }

    for (const directory of directories.values()) {
      folderWorkspaces.push(buildFolderWorkspaceForDirectory(project, workspace, directory))
    }
  }

  return folderWorkspaces.sort((left, right) => right.updated - left.updated)
}
