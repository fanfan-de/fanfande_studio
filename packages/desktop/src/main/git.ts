import { requestAgentJSON } from "./agent-client"

export interface GitCapabilityState {
  enabled: boolean
  reason?: string
}

export interface GitCapabilities {
  directory: string
  root: string | null
  branch: string | null
  defaultBranch: string | null
  isGitRepo: boolean
  canCommit: GitCapabilityState
  canPush: GitCapabilityState
  canCreatePullRequest: GitCapabilityState
  canCreateBranch: GitCapabilityState
}

export interface GitActionResult {
  directory: string
  root: string
  branch: string | null
  stdout: string
  stderr: string
  summary: string
  url?: string
}

function encodeProjectPath(projectID: string, suffix: string) {
  return `/api/projects/${encodeURIComponent(projectID)}/git/${suffix}`
}

export async function getGitCapabilities(input: { projectID: string; directory: string }): Promise<GitCapabilities> {
  const projectID = input.projectID.trim()
  const directory = input.directory.trim()
  const pathname = encodeProjectPath(projectID, `capabilities?directory=${encodeURIComponent(directory)}`)
  const result = await requestAgentJSON<GitCapabilities>(pathname)
  return result.data
}

export async function commitGitChanges(input: { projectID: string; directory: string; message: string }): Promise<GitActionResult> {
  const result = await requestAgentJSON<GitActionResult>(encodeProjectPath(input.projectID.trim(), "commit"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      directory: input.directory.trim(),
      message: input.message,
    }),
  })

  return result.data
}

export async function pushGitChanges(input: { projectID: string; directory: string }): Promise<GitActionResult> {
  const result = await requestAgentJSON<GitActionResult>(encodeProjectPath(input.projectID.trim(), "push"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      directory: input.directory.trim(),
    }),
  })

  return result.data
}

export async function createGitBranch(input: { projectID: string; directory: string; name: string }): Promise<GitActionResult> {
  const result = await requestAgentJSON<GitActionResult>(encodeProjectPath(input.projectID.trim(), "branches"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      directory: input.directory.trim(),
      name: input.name,
    }),
  })

  return result.data
}

export async function createGitPullRequest(input: { projectID: string; directory: string }): Promise<GitActionResult> {
  const result = await requestAgentJSON<GitActionResult>(encodeProjectPath(input.projectID.trim(), "pull-requests"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      directory: input.directory.trim(),
    }),
  })

  return result.data
}
