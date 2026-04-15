import path from "node:path"
import { realpath } from "node:fs/promises"
import { Hono } from "hono"
import z from "zod"
import * as db from "#database/Sqlite.ts"
import * as Project from "#project/project.ts"
import * as Session from "#session/session.ts"
import * as Config from "#config/config.ts"
import * as Provider from "#provider/provider.ts"
import * as Skill from "#skill/skill.ts"
import * as Mcp from "#mcp/manager.ts"
import * as Git from "#git/git.ts"
import { Instance } from "#project/instance.ts"
import { ApiError } from "#server/error.ts"
import type { AppEnv } from "#server/types.ts"

const CreateProjectBody = z.object({
  directory: z.string().min(1),
})

const CreateProjectSessionBody = z.object({
  directory: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
})

const UpdateMcpServerBody = Config.McpServerInput
const UpdateProjectSkillSelectionBody = Config.ProjectSkillSelection
const UpdateProjectMcpSelectionBody = Config.ProjectMcpSelection
const GitDirectoryQuery = z.object({
  directory: z.string().min(1),
})
const GitCommitBody = z.object({
  directory: z.string().min(1),
  message: z.string().min(1),
  stageAll: z.boolean().optional(),
})
const GitDirectoryBody = z.object({
  directory: z.string().min(1),
})
const GitCreateBranchBody = z.object({
  directory: z.string().min(1),
  name: z.string().min(1),
})
const GitCheckoutBranchBody = z.object({
  directory: z.string().min(1),
  name: z.string().min(1),
})

function safeReadProject(projectID: string) {
  const project = Project.get(projectID)
  if (!project) {
    throw new ApiError(404, "PROJECT_NOT_FOUND", `Project '${projectID}' not found`)
  }

  return project
}

function normalizeProjectDirectory(input: string) {
  const normalized = path.normalize(input)
  return process.platform === "win32" ? normalized.toLowerCase() : normalized
}

async function canonicalizeProjectDirectory(input: string) {
  const resolved = path.resolve(input)

  try {
    return path.normalize(await realpath(resolved))
  } catch {
    return path.normalize(resolved)
  }
}

function isDirectoryInsideProjectRoot(directory: string, root: string) {
  const normalizedRoot = normalizeProjectDirectory(root)
  const normalizedDirectory = normalizeProjectDirectory(directory)
  const relative = path.relative(normalizedRoot, normalizedDirectory)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

async function resolveProjectBoundaryRoots(project: Project.ProjectInfo) {
  const roots = new Set<string>()

  roots.add(await canonicalizeProjectDirectory(project.worktree))

  for (const sandbox of project.sandboxes ?? []) {
    roots.add(await canonicalizeProjectDirectory(sandbox))
  }

  return [...roots]
}

function projectContainsDirectory(projectRoots: string[], directory: string) {
  return projectRoots.some((root) => isDirectoryInsideProjectRoot(directory, root))
}

async function resolveProjectGitDirectory(
  projectID: string,
  rawDirectory: string,
  options?: {
    verifyRepositoryRoot?: boolean
  },
) {
  const project = safeReadProject(projectID)
  const directory = rawDirectory.trim()
  if (!directory) {
    throw new ApiError(400, "INVALID_PAYLOAD", "Body must include a non-empty 'directory'")
  }

  const [projectRoots, canonicalDirectory] = await Promise.all([
    resolveProjectBoundaryRoots(project),
    canonicalizeProjectDirectory(directory),
  ])

  if (!projectContainsDirectory(projectRoots, canonicalDirectory)) {
    throw new ApiError(400, "DIRECTORY_NOT_IN_PROJECT", `Directory '${directory}' does not belong to project '${projectID}'`)
  }

  if (options?.verifyRepositoryRoot) {
    const repositoryRoot = await Git.resolveGitRepositoryRoot(canonicalDirectory)
    if (repositoryRoot) {
      const canonicalRepositoryRoot = await canonicalizeProjectDirectory(repositoryRoot)
      if (!projectContainsDirectory(projectRoots, canonicalRepositoryRoot)) {
        throw new ApiError(
          400,
          "DIRECTORY_NOT_IN_PROJECT",
          `Git repository root '${repositoryRoot}' does not belong to project '${projectID}'`,
        )
      }
    }
  }

  return canonicalDirectory
}

function parseModelReference(value: string) {
  const [providerID, ...rest] = value.split("/")
  const modelID = rest.join("/")
  if (!providerID || !modelID) {
    throw new ApiError(400, "INVALID_MODEL_REFERENCE", `Model '${value}' must use the format provider/model`)
  }

  return {
    providerID,
    modelID,
  }
}

export function ProjectRoutes() {
  const app = new Hono<AppEnv>()

  app.get("/", async (c) => {
    const projects = await Project.list()
    return c.json({
      success: true,
      data: projects,
      requestId: c.get("requestId"),
    })
  })

  app.post("/", async (c) => {
    const payload = CreateProjectBody.safeParse(await c.req.json().catch(() => undefined))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must include a non-empty 'directory'")
    }

    const { project } = await Project.fromDirectory(payload.data.directory)

    return c.json(
      {
        success: true,
        data: project,
        requestId: c.get("requestId"),
      },
      201,
    )
  })

  app.get("/:id/sessions", (c) => {
    const id = c.req.param("id")
    safeReadProject(id)

    return c.json({
      success: true,
      data: Session.listByProject(id),
      requestId: c.get("requestId"),
    })
  })

  app.post("/:id/sessions", async (c) => {
    const id = c.req.param("id")
    const project = safeReadProject(id)

    const payload = CreateProjectSessionBody.safeParse(await c.req.json().catch(() => ({})))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must include optional non-empty 'title' or 'directory'")
    }

    let directory = payload.data.directory?.trim() || project.worktree
    if (payload.data.directory) {
      const resolved = await Project.fromDirectory(directory)
      if (resolved.project.id !== id) {
        throw new ApiError(400, "DIRECTORY_NOT_IN_PROJECT", `Directory '${directory}' does not belong to project '${id}'`)
      }
      directory = payload.data.directory.trim()
    }

    const session = await Session.createSession({
      directory,
      projectID: id,
      title: payload.data.title?.trim() || undefined,
    })

    return c.json(
      {
        success: true,
        data: session,
        requestId: c.get("requestId"),
      },
      201,
    )
  })

  app.get("/:id/providers/catalog", async (c) => {
    const id = c.req.param("id")
    safeReadProject(id)

    const catalog = await Provider.catalog(id)

    return c.json({
      success: true,
      data: catalog,
      requestId: c.get("requestId"),
    })
  })

  app.get("/:id/providers", async (c) => {
    const id = c.req.param("id")
    safeReadProject(id)

    const data = {
      items: await Provider.listPublicProviders(id),
      selection: await Provider.getSelection(id),
    }

    return c.json({
      success: true,
      data,
      requestId: c.get("requestId"),
    })
  })

  app.get("/:id/models", async (c) => {
    const id = c.req.param("id")
    safeReadProject(id)

    const items = await Provider.listModels(id)
    let effectiveModel: Provider.PublicModel | null = null

    try {
      const effectiveRef = await Provider.getDefaultModelRef(id)
      effectiveModel =
        items.find((model) => model.providerID === effectiveRef.providerID && model.id === effectiveRef.modelID) ?? null
    } catch {
      effectiveModel = null
    }

    const data = {
      effectiveModel,
      items,
      selection: await Provider.getSelection(id),
    }

    return c.json({
      success: true,
      data,
      requestId: c.get("requestId"),
    })
  })

  app.put("/:id/providers/:providerID", async (c) => {
    const id = c.req.param("id")
    const providerID = c.req.param("providerID")
    safeReadProject(id)

    const payload = Config.Provider.safeParse(await c.req.json().catch(() => undefined))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must be a valid provider configuration")
    }

    try {
      await Provider.validateProviderConfig(providerID, payload.data, id)
    } catch (error) {
      throw new ApiError(
        400,
        "PROVIDER_VALIDATION_FAILED",
        error instanceof Error ? error.message : String(error),
      )
    }

    const providerConfig = await Config.setProvider(id, providerID, payload.data)
    const provider = await Provider.getPublicProvider(providerID, id)
    if (!provider) {
      throw new ApiError(404, "PROVIDER_NOT_FOUND", `Provider '${providerID}' not found in the catalog`)
    }

    const data = {
      provider,
      selection: {
        model: providerConfig.model,
        small_model: providerConfig.small_model,
      },
    }

    return c.json({
      success: true,
      data,
      requestId: c.get("requestId"),
    })
  })

  app.delete("/:id/providers/:providerID", async (c) => {
    const id = c.req.param("id")
    const providerID = c.req.param("providerID")
    safeReadProject(id)

    const providerConfig = await Config.removeProvider(id, providerID)

    return c.json({
      success: true,
      data: {
        providerID,
        selection: {
          model: providerConfig.model,
          small_model: providerConfig.small_model,
        },
      },
      requestId: c.get("requestId"),
    })
  })

  app.patch("/:id/model-selection", async (c) => {
    const id = c.req.param("id")
    safeReadProject(id)

    const payload = Config.ModelSelection.safeParse(await c.req.json().catch(() => undefined))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must contain nullable 'model' and 'small_model' fields")
    }

    if (payload.data.model) {
      const ref = parseModelReference(payload.data.model)
      await Provider.getModel(ref.providerID, ref.modelID, id)
    }

    if (payload.data.small_model) {
      const ref = parseModelReference(payload.data.small_model)
      await Provider.getModel(ref.providerID, ref.modelID, id)
    }

    const selection = await Config.setModelSelection(id, payload.data)
    return c.json({
      success: true,
      data: {
        model: selection.model,
        small_model: selection.small_model,
      },
      requestId: c.get("requestId"),
    })
  })

  app.get("/:id/git/capabilities", async (c) => {
    const id = c.req.param("id")
    const payload = GitDirectoryQuery.safeParse(c.req.query())
    if (!payload.success) {
      throw new ApiError(400, "INVALID_QUERY", "Query parameter 'directory' must be a non-empty string")
    }

    const directory = await resolveProjectGitDirectory(id, payload.data.directory, { verifyRepositoryRoot: true })

    return c.json({
      success: true,
      data: await Git.getGitCapabilities(directory),
      requestId: c.get("requestId"),
    })
  })

  app.post("/:id/git/commit", async (c) => {
    const id = c.req.param("id")
    const payload = GitCommitBody.safeParse(await c.req.json().catch(() => undefined))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must include non-empty 'directory' and 'message' fields")
    }

    const directory = await resolveProjectGitDirectory(id, payload.data.directory, { verifyRepositoryRoot: true })

    return c.json({
      success: true,
      data: await Git.commitGitChanges(directory, payload.data.message, {
        stageAll: payload.data.stageAll,
      }),
      requestId: c.get("requestId"),
    })
  })

  app.post("/:id/git/push", async (c) => {
    const id = c.req.param("id")
    const payload = GitDirectoryBody.safeParse(await c.req.json().catch(() => undefined))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must include a non-empty 'directory'")
    }

    const directory = await resolveProjectGitDirectory(id, payload.data.directory, { verifyRepositoryRoot: true })

    return c.json({
      success: true,
      data: await Git.pushGitChanges(directory),
      requestId: c.get("requestId"),
    })
  })

  app.post("/:id/git/branches", async (c) => {
    const id = c.req.param("id")
    const payload = GitCreateBranchBody.safeParse(await c.req.json().catch(() => undefined))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must include non-empty 'directory' and 'name' fields")
    }

    const directory = await resolveProjectGitDirectory(id, payload.data.directory, { verifyRepositoryRoot: true })

    return c.json({
      success: true,
      data: await Git.createGitBranch(directory, payload.data.name),
      requestId: c.get("requestId"),
    })
  })

  app.get("/:id/git/branches", async (c) => {
    const id = c.req.param("id")
    const payload = GitDirectoryQuery.safeParse(c.req.query())
    if (!payload.success) {
      throw new ApiError(400, "INVALID_QUERY", "Query parameter 'directory' must be a non-empty string")
    }

    const directory = await resolveProjectGitDirectory(id, payload.data.directory, { verifyRepositoryRoot: true })

    return c.json({
      success: true,
      data: await Git.listGitBranches(directory),
      requestId: c.get("requestId"),
    })
  })

  app.post("/:id/git/checkout", async (c) => {
    const id = c.req.param("id")
    const payload = GitCheckoutBranchBody.safeParse(await c.req.json().catch(() => undefined))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must include non-empty 'directory' and 'name' fields")
    }

    const directory = await resolveProjectGitDirectory(id, payload.data.directory, { verifyRepositoryRoot: true })

    return c.json({
      success: true,
      data: await Git.checkoutGitBranch(directory, payload.data.name),
      requestId: c.get("requestId"),
    })
  })

  app.post("/:id/git/pull-requests", async (c) => {
    const id = c.req.param("id")
    const payload = GitDirectoryBody.safeParse(await c.req.json().catch(() => undefined))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must include a non-empty 'directory'")
    }

    const directory = await resolveProjectGitDirectory(id, payload.data.directory, { verifyRepositoryRoot: true })

    return c.json({
      success: true,
      data: await Git.createGitPullRequest(directory),
      requestId: c.get("requestId"),
    })
  })

  app.get("/:id/skills", async (c) => {
    const id = c.req.param("id")
    const project = safeReadProject(id)

    return c.json({
      success: true,
      data: await Skill.list(project.worktree),
      requestId: c.get("requestId"),
    })
  })

  app.get("/:id/skills/selection", async (c) => {
    const id = c.req.param("id")
    const project = safeReadProject(id)

    return c.json({
      success: true,
      data: {
        skillIDs: await Skill.resolveSelectedSkillIDs(project.worktree, await Config.getSelectedSkillIDs(id)),
      },
      requestId: c.get("requestId"),
    })
  })

  app.put("/:id/skills/selection", async (c) => {
    const id = c.req.param("id")
    const project = safeReadProject(id)

    const payload = UpdateProjectSkillSelectionBody.safeParse(await c.req.json().catch(() => undefined))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must contain a 'skillIDs' string array")
    }

    const skillIDs = await Skill.resolveSelectedSkillIDs(project.worktree, payload.data.skillIDs)
    const config = await Config.setSelectedSkillIDs(id, skillIDs)

    return c.json({
      success: true,
      data: {
        skillIDs: config.selected_skills ?? [],
      },
      requestId: c.get("requestId"),
    })
  })

  app.get("/:id/mcp/selection", async (c) => {
    const id = c.req.param("id")
    safeReadProject(id)

    return c.json({
      success: true,
      data: {
        serverIDs: await Config.getSelectedMcpServerIDs(id),
      },
      requestId: c.get("requestId"),
    })
  })

  app.put("/:id/mcp/selection", async (c) => {
    const id = c.req.param("id")
    safeReadProject(id)

    const payload = UpdateProjectMcpSelectionBody.safeParse(await c.req.json().catch(() => undefined))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must contain a 'serverIDs' string array")
    }

    const config = await Config.setSelectedMcpServerIDs(id, payload.data.serverIDs)

    return c.json({
      success: true,
      data: {
        serverIDs: config.selected_mcp_servers ?? [],
      },
      requestId: c.get("requestId"),
    })
  })

  app.get("/:id/mcp/servers", async (c) => {
    const id = c.req.param("id")
    safeReadProject(id)

    return c.json({
      success: true,
      data: await Config.resolveProjectMcpServers(id),
      requestId: c.get("requestId"),
    })
  })

  app.get("/:id/mcp/servers/:serverID/diagnostic", async (c) => {
    const id = c.req.param("id")
    const serverID = c.req.param("serverID")
    const project = safeReadProject(id)

    const server = await Config.getProjectMcpServer(id, serverID)
    if (!server) {
      throw new ApiError(404, "MCP_SERVER_NOT_FOUND", `MCP server '${serverID}' is not available for project '${id}'`)
    }

    const diagnostic = await Instance.provide({
      directory: project.worktree,
      fn: async () => await Mcp.diagnose(serverID),
    })

    return c.json({
      success: true,
      data: diagnostic,
      requestId: c.get("requestId"),
    })
  })

  app.put("/:id/mcp/servers/:serverID", async (c) => {
    const id = c.req.param("id")
    const serverID = c.req.param("serverID")
    safeReadProject(id)

    const payload = UpdateMcpServerBody.safeParse(await c.req.json().catch(() => undefined))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must be a valid MCP server configuration")
    }

    const server = await Config.setMcpServer(id, serverID, payload.data)
    return c.json({
      success: true,
      data: server,
      requestId: c.get("requestId"),
    })
  })

  app.delete("/:id/mcp/servers/:serverID", async (c) => {
    const id = c.req.param("id")
    const serverID = c.req.param("serverID")
    safeReadProject(id)

    return c.json({
      success: true,
      data: {
        serverID,
        removed: Boolean(await Config.removeMcpServer(id, serverID)),
      },
      requestId: c.get("requestId"),
    })
  })

  app.delete("/:id", (c) => {
    const id = c.req.param("id")
    safeReadProject(id)

    const deletedSessions = Session.removeProjectSessions(id)
    db.deleteById("projects", id)
    db.deleteById("project_configs", id, "projectID")
    if (db.tableExists("permission_rules")) {
      db.deleteMany("permission_rules", [{ column: "projectID", value: id }])
    }
    if (db.tableExists("permission_requests")) {
      db.deleteMany("permission_requests", [{ column: "projectID", value: id }])
    }
    if (db.tableExists("permission_audits")) {
      db.deleteMany("permission_audits", [{ column: "projectID", value: id }])
    }

    return c.json({
      success: true,
      data: {
        projectID: id,
        deletedSessionIDs: deletedSessions.map((session) => session.id),
      },
      requestId: c.get("requestId"),
    })
  })

  app.get("/:id", (c) => {
    const id = c.req.param("id")
    const project = safeReadProject(id)

    return c.json({
      success: true,
      data: project,
      requestId: c.get("requestId"),
    })
  })

  return app
}
