import { AgentAPIError, requestAgentJSON } from "./agent-client"
import type { AgentProjectInfo } from "./types"

export interface GitCapabilityState {
  enabled: boolean
  reason?: string
}

export interface GitCapabilities {
  projectID?: string
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
  projectID?: string
  directory: string
  root: string
  branch: string | null
  stdout: string
  stderr: string
  summary: string
  url?: string
}

export interface GitBranchSummary {
  name: string
  kind: "local" | "remote"
  current: boolean
}

function encodeProjectPath(projectID: string, suffix: string) {
  return `/api/projects/${encodeURIComponent(projectID)}/git/${suffix}`
}

function isDirectoryOutsideProject(error: unknown) {
  return error instanceof AgentAPIError && error.code === "DIRECTORY_NOT_IN_PROJECT"
}

async function resolveProjectForDirectory(directory: string) {
  const result = await requestAgentJSON<AgentProjectInfo>("/api/projects", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      directory,
    }),
  })

  return result.data
}

async function withResolvedProjectRetry<T>(
  input: { projectID: string; directory: string },
  request: (projectID: string) => Promise<T>,
) {
  const projectID = input.projectID.trim()
  const directory = input.directory.trim()

  try {
    return {
      data: await request(projectID),
      projectID,
    }
  } catch (error) {
    if (!isDirectoryOutsideProject(error) || !directory) {
      throw error
    }

    const project = await resolveProjectForDirectory(directory)
    const resolvedProjectID = project.id.trim()
    if (!resolvedProjectID || resolvedProjectID === projectID) {
      throw error
    }

    return {
      data: await request(resolvedProjectID),
      projectID: resolvedProjectID,
    }
  }
}

export async function getGitCapabilities(input: { projectID: string; directory: string }): Promise<GitCapabilities> {
  const directory = input.directory.trim()
  const result = await withResolvedProjectRetry(input, async (projectID) => {
    const pathname = encodeProjectPath(projectID, `capabilities?directory=${encodeURIComponent(directory)}`)
    const response = await requestAgentJSON<GitCapabilities>(pathname)
    return response.data
  })

  return {
    ...result.data,
    projectID: result.projectID,
  }
}

export async function commitGitChanges(input: { projectID: string; directory: string; message: string }): Promise<GitActionResult> {
  const result = await withResolvedProjectRetry(input, async (projectID) => {
    const response = await requestAgentJSON<GitActionResult>(encodeProjectPath(projectID, "commit"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        directory: input.directory.trim(),
        message: input.message,
      }),
    })

    return response.data
  })

  return {
    ...result.data,
    projectID: result.projectID,
  }
}

export async function pushGitChanges(input: { projectID: string; directory: string }): Promise<GitActionResult> {
  const result = await withResolvedProjectRetry(input, async (projectID) => {
    const response = await requestAgentJSON<GitActionResult>(encodeProjectPath(projectID, "push"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        directory: input.directory.trim(),
      }),
    })

    return response.data
  })

  return {
    ...result.data,
    projectID: result.projectID,
  }
}

export async function createGitBranch(input: { projectID: string; directory: string; name: string }): Promise<GitActionResult> {
  const result = await withResolvedProjectRetry(input, async (projectID) => {
    const response = await requestAgentJSON<GitActionResult>(encodeProjectPath(projectID, "branches"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        directory: input.directory.trim(),
        name: input.name,
      }),
    })

    return response.data
  })

  return {
    ...result.data,
    projectID: result.projectID,
  }
}

export async function listGitBranches(input: { projectID: string; directory: string }): Promise<GitBranchSummary[]> {
  const directory = input.directory.trim()
  const result = await withResolvedProjectRetry(input, async (projectID) => {
    const pathname = encodeProjectPath(projectID, `branches?directory=${encodeURIComponent(directory)}`)
    const response = await requestAgentJSON<GitBranchSummary[]>(pathname)
    return response.data
  })

  return result.data
}

export async function checkoutGitBranch(input: {
  projectID: string
  directory: string
  name: string
}): Promise<GitActionResult> {
  const result = await withResolvedProjectRetry(input, async (projectID) => {
    const response = await requestAgentJSON<GitActionResult>(encodeProjectPath(projectID, "checkout"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        directory: input.directory.trim(),
        name: input.name,
      }),
    })

    return response.data
  })

  return {
    ...result.data,
    projectID: result.projectID,
  }
}

export async function createGitPullRequest(input: { projectID: string; directory: string }): Promise<GitActionResult> {
  const result = await withResolvedProjectRetry(input, async (projectID) => {
    const response = await requestAgentJSON<GitActionResult>(encodeProjectPath(projectID, "pull-requests"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        directory: input.directory.trim(),
      }),
    })

    return response.data
  })

  return {
    ...result.data,
    projectID: result.projectID,
  }
}
