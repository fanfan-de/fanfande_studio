import z from "zod"
import fs from "fs/promises"
import * as Filesystem from "#util/filesystem.ts"
import path from "path"
import { $ } from "bun"
import * as db from "#database/Sqlite.ts"
import * as Log from "#util/log.ts"
import { fn } from "#util/fn.ts"
import * as BusEvent from "#bus/bus-event.ts"
import { GlobalBus } from "#bus/global.ts"
import { existsSync } from "fs"
import * as Session from "#session/session.ts"
import * as Identifier from "#id/id.ts"

const log = Log.create({ service: "project" })
const ProjectKind = z.enum(["directory", "git"])
const ProjectConfigRecord = z.object({
  projectID: z.string(),
  config: z.record(z.string(), z.any()),
})
let projectTableGeneration = -1

function ensureProjectTable() {
  const generation = db.getDatabaseGeneration()
  if (projectTableGeneration === generation && generation > 0) return
  db.syncTableColumnsWithZodObject("projects", ProjectInfo)
  projectTableGeneration = db.getDatabaseGeneration()
}

export const ProjectInfo = z
  .object({
    id: z.string(),
    kind: ProjectKind.optional(),
    worktree: z.string(),
    gitCommonDir: z.string().optional(),
    vcs: z.literal("git").optional(),
    name: z.string().optional(),
    icon: z
      .object({
        url: z.string().optional(),
        override: z.string().optional(),
        color: z.string().optional(),
      })
      .optional(),
    commands: z
      .object({
        start: z.string().optional().describe("Startup script to run when creating a new workspace (worktree)"),
      })
      .optional(),
    created: z.number(),
    updated: z.number(),
    initialized: z.number().optional(),
    sandboxes: z.array(z.string()),
  })
  .meta({
    ref: "Project",
  })
export type ProjectInfo = z.infer<typeof ProjectInfo>

export const Event = {
  Updated: BusEvent.define("project.updated", ProjectInfo),
}

type ResolvedProjectIdentity =
  | {
      kind: "directory"
      sandbox: string
      worktree: string
      vcs: undefined
    }
  | {
      kind: "git"
      sandbox: string
      worktree: string
      gitCommonDir?: string
      storedProjectID?: string
      vcs: "git"
    }

function normalizeProjectPath(input: string) {
  const resolved = path.resolve(input)
  const normalized = path.normalize(resolved)
  return process.platform === "win32" ? normalized.toLowerCase() : normalized
}

function resolveProjectKind(project: Pick<ProjectInfo, "kind" | "vcs">) {
  return project.kind === "git" || project.vcs === "git" ? "git" : "directory"
}

function resolveProjectName(worktree: string) {
  const folderName = worktree.split(/[\\/]/).filter(Boolean).pop()
  return folderName || worktree
}

function resolveStoredProjectName(worktree: string, currentName?: string) {
  const trimmed = currentName?.trim()
  return trimmed || resolveProjectName(worktree)
}

function isPathInsideProject(directory: string, worktree: string) {
  const relative = path.relative(normalizeProjectPath(worktree), normalizeProjectPath(directory))
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

function isAdditionalSandboxDirectory(directory: string, worktree: string) {
  if (normalizeProjectPath(directory) === normalizeProjectPath(worktree)) return false
  return !isPathInsideProject(directory, worktree)
}

function uniqueProjectPaths(input: string[]) {
  const unique = new Map<string, string>()

  for (const item of input) {
    if (!item) continue
    unique.set(normalizeProjectPath(item), item)
  }

  return [...unique.values()]
}

function projectRoots(project: ProjectInfo) {
  return uniqueProjectPaths([project.worktree, ...(project.sandboxes ?? [])])
}

function projectContainsDirectory(project: ProjectInfo, directory: string) {
  return projectRoots(project).some((root) => isPathInsideProject(directory, root))
}

function matchingRootLength(project: ProjectInfo, directory: string) {
  return projectRoots(project)
    .filter((root) => isPathInsideProject(directory, root))
    .map((root) => normalizeProjectPath(root).length)
    .reduce((max, current) => Math.max(max, current), -1)
}

function normalizeProjectRecord(project: ProjectInfo): ProjectInfo {
  const kind = resolveProjectKind(project)
  const sandboxes =
    kind === "git"
      ? uniqueProjectPaths(project.sandboxes ?? []).filter(
          (item) => existsSync(item) && isAdditionalSandboxDirectory(item, project.worktree),
        )
      : []

  return {
    ...project,
    kind,
    gitCommonDir: kind === "git" ? project.gitCommonDir : undefined,
    vcs: kind === "git" ? "git" : undefined,
    name: resolveStoredProjectName(project.worktree, project.name),
    sandboxes,
  }
}

function listStoredProjects() {
  return db
    .findManyWithSchema("projects", ProjectInfo)
    .map(normalizeProjectRecord)
    .filter((project) => isGeneratedProjectID(project.id) && project.worktree.trim() !== "/")
}

function findProjectByID(projects: ProjectInfo[], projectID: string | undefined) {
  if (!projectID) return undefined
  return projects.find((project) => project.id === projectID)
}

function findProjectContainingDirectory(projects: ProjectInfo[], directory: string) {
  return projects
    .filter((project) => projectContainsDirectory(project, directory))
    .sort((left, right) => {
      const lengthDelta = matchingRootLength(right, directory) - matchingRootLength(left, directory)
      if (lengthDelta !== 0) return lengthDelta
      return right.updated - left.updated
    })[0]
}

function findProjectByGitCommonDir(projects: ProjectInfo[], gitCommonDir: string | undefined) {
  if (!gitCommonDir) return undefined
  const normalizedGitCommonDir = normalizeProjectPath(gitCommonDir)
  return projects.find((project) => {
    if (!project.gitCommonDir) return false
    return normalizeProjectPath(project.gitCommonDir) === normalizedGitCommonDir
  })
}

function createProjectID() {
  return Identifier.descending("project")
}

function isGeneratedProjectID(value: string | undefined) {
  return Identifier.schema("project").safeParse(value).success
}

function findProjectSeed(input: ResolvedProjectIdentity, projects: ProjectInfo[]) {
  if (input.kind === "git") {
    const byStoredID = findProjectByID(projects, input.storedProjectID)
    if (byStoredID) return byStoredID

    const byCommonDir = findProjectByGitCommonDir(projects, input.gitCommonDir)
    if (byCommonDir) return byCommonDir
  }

  return findProjectContainingDirectory(projects, input.sandbox)
}

function collectMergeCandidates(input: ResolvedProjectIdentity, projects: ProjectInfo[], nextProjectID: string) {
  const candidates = new Map<string, ProjectInfo>()
  const normalizedWorktree = normalizeProjectPath(input.worktree)
  const normalizedSandbox = normalizeProjectPath(input.sandbox)
  const normalizedGitCommonDir = input.kind === "git" && input.gitCommonDir ? normalizeProjectPath(input.gitCommonDir) : null

  for (const project of projects) {
    if (project.id === nextProjectID) {
      candidates.set(project.id, project)
      continue
    }

    const sameWorktree = normalizeProjectPath(project.worktree) === normalizedWorktree
    const sameSandbox = (project.sandboxes ?? []).some((sandbox) => normalizeProjectPath(sandbox) === normalizedSandbox)
    const sameStoredID = input.kind === "git" && input.storedProjectID ? project.id === input.storedProjectID : false
    const sameGitCommonDir =
      normalizedGitCommonDir !== null &&
      project.gitCommonDir &&
      normalizeProjectPath(project.gitCommonDir) === normalizedGitCommonDir

    if (sameWorktree || sameSandbox || sameStoredID || sameGitCommonDir) {
      candidates.set(project.id, project)
    }
  }

  return [...candidates.values()]
}

function migrateProjectConfigReference(fromProjectID: string, toProjectID: string) {
  if (!db.tableExists("project_configs")) return
  if (fromProjectID === toProjectID) return

  const existingTarget = db.findById("project_configs", ProjectConfigRecord, toProjectID, "projectID")
  if (existingTarget) {
    db.deleteById("project_configs", fromProjectID, "projectID")
    return
  }

  db.updateById("project_configs", fromProjectID, { projectID: toProjectID }, "projectID")
}

function migrateProjectReferences(fromProjectID: string, toProjectID: string) {
  if (!fromProjectID || !toProjectID || fromProjectID === toProjectID) return

  if (db.tableExists("sessions")) {
    db.updateMany("sessions", { projectID: toProjectID }, [{ column: "projectID", value: fromProjectID }])
  }

  migrateProjectConfigReference(fromProjectID, toProjectID)

  if (db.tableExists("permission_rules")) {
    db.updateMany("permission_rules", { projectID: toProjectID }, [{ column: "projectID", value: fromProjectID }])
  }

  if (db.tableExists("permission_requests")) {
    db.updateMany("permission_requests", { projectID: toProjectID }, [{ column: "projectID", value: fromProjectID }])
  }

  if (db.tableExists("permission_audits")) {
    db.updateMany("permission_audits", { projectID: toProjectID }, [{ column: "projectID", value: fromProjectID }])
  }
}

function buildProjectRecord(input: ResolvedProjectIdentity, seed?: ProjectInfo) {
  const normalizedSeed = seed ? normalizeProjectRecord(seed) : undefined
  const id =
    normalizedSeed?.id ??
    (input.kind === "git" && isGeneratedProjectID(input.storedProjectID) ? input.storedProjectID : undefined) ??
    createProjectID()
  const now = Date.now()
  const sandboxes =
    input.kind === "git"
      ? uniqueProjectPaths([...(normalizedSeed?.sandboxes ?? []), input.sandbox]).filter(
          (item) => existsSync(item) && isAdditionalSandboxDirectory(item, input.worktree),
        )
      : []

  return normalizeProjectRecord({
    id,
    kind: input.kind,
    worktree: input.worktree,
    gitCommonDir: input.kind === "git" ? input.gitCommonDir : undefined,
    vcs: input.vcs,
    name: resolveStoredProjectName(input.worktree, normalizedSeed?.name),
    icon: normalizedSeed?.icon,
    commands: normalizedSeed?.commands,
    created: normalizedSeed?.created ?? now,
    updated: now,
    initialized: normalizedSeed?.initialized,
    sandboxes,
  })
}

function persistProjectRecord(input: ResolvedProjectIdentity) {
  const projects = listStoredProjects()
  const seed = findProjectSeed(input, projects)
  const nextProject = buildProjectRecord(input, seed)
  const mergeCandidates = collectMergeCandidates(input, projects, nextProject.id)

  db.deleteById("projects", nextProject.id)
  db.insertOneWithSchema("projects", nextProject, ProjectInfo)

  for (const project of mergeCandidates) {
    if (project.id === nextProject.id) continue
    migrateProjectReferences(project.id, nextProject.id)
    db.deleteById("projects", project.id)
  }

  return nextProject
}

async function resolveGitCommonDir(cwd: string) {
  if (!Bun.which("git")) return undefined

  const value = await $`git rev-parse --git-common-dir`
    .quiet()
    .nothrow()
    .cwd(cwd)
    .text()
    .then((output) => output.trim())
    .catch(() => undefined)

  if (!value) return undefined
  return path.resolve(cwd, value)
}

async function resolveGitTopLevel(cwd: string) {
  if (!Bun.which("git")) return undefined

  const value = await $`git rev-parse --show-toplevel`
    .quiet()
    .nothrow()
    .cwd(cwd)
    .text()
    .then((output) => output.trim())
    .catch(() => undefined)

  if (!value) return undefined
  return path.resolve(cwd, value)
}

async function readStoredGitProjectID(gitCommonDir?: string) {
  if (!gitCommonDir) return undefined

  const cachedID = await Bun.file(path.join(gitCommonDir, "opencode"))
    .text()
    .then((value) => value.trim())
    .catch(() => undefined)

  return isGeneratedProjectID(cachedID) ? cachedID : undefined
}

async function writeStoredGitProjectID(gitCommonDir: string | undefined, projectID: string) {
  if (!gitCommonDir || !isGeneratedProjectID(projectID)) return
  await Bun.file(path.join(gitCommonDir, "opencode")).write(projectID).catch(() => undefined)
}

async function resolveProjectIdentity(directory: string): Promise<ResolvedProjectIdentity> {
  const resolvedDirectory = path.resolve(directory)
  const matches = Filesystem.up({ targets: [".git"], start: resolvedDirectory })
  const gitMarker = await matches.next().then((item) => item.value)
  await matches.return()

  if (!gitMarker) {
    return {
      kind: "directory",
      sandbox: resolvedDirectory,
      worktree: resolvedDirectory,
      vcs: undefined,
    }
  }

  const gitCwd = path.dirname(gitMarker)
  const gitCommonDir = await resolveGitCommonDir(gitCwd)
  const sandbox = (await resolveGitTopLevel(gitCwd)) ?? gitCwd
  const worktree = gitCommonDir ? path.resolve(gitCommonDir, "..") : sandbox
  const storedProjectID = await readStoredGitProjectID(gitCommonDir)

  return {
    kind: "git",
    sandbox,
    worktree,
    gitCommonDir,
    storedProjectID,
    vcs: "git",
  }
}

export async function fromDirectory(directory: string): Promise<{ project: ProjectInfo; sandbox: string }> {
  ensureProjectTable()
  log.info("fromDirectory", { directory })

  const resolved = await resolveProjectIdentity(directory)
  const project = persistProjectRecord(resolved)
  if (resolved.kind === "git") {
    await writeStoredGitProjectID(resolved.gitCommonDir, project.id)
  }

  GlobalBus.emit("event", {
    payload: {
      type: Event.Updated.type,
      properties: project,
    },
  })

  return {
    project,
    sandbox: resolved.sandbox,
  }
}

export async function setInitialized(projectID: string) {
  ensureProjectTable()
  db.updateById("projects", projectID, {
    initialized: Date.now(),
  })
}

async function repairProjects() {
  const candidates = new Map<string, string>()

  for (const project of listStoredProjects()) {
    for (const directory of projectRoots(project)) {
      if (!directory || !existsSync(directory)) continue
      candidates.set(normalizeProjectPath(directory), directory)
    }
  }

  if (db.tableExists("sessions")) {
    for (const session of db.findManyWithSchema("sessions", Session.SessionInfo)) {
      const directory = session.directory?.trim()
      if (!directory || !existsSync(directory)) continue
      candidates.set(normalizeProjectPath(directory), directory)
    }
  }

  for (const directory of candidates.values()) {
    await fromDirectory(directory).catch(() => undefined)
  }
}

export async function list() {
  ensureProjectTable()
  await repairProjects()

  const projects = listStoredProjects()
  const normalizedProjects = new Map<string, ProjectInfo>()

  for (const project of projects) {
    const previous = normalizedProjects.get(project.id)
    const nextProject = normalizeProjectRecord({
      ...(previous ?? project),
      ...project,
      updated: Math.max(previous?.updated ?? 0, project.updated),
      sandboxes: uniqueProjectPaths([...(previous?.sandboxes ?? []), ...(project.sandboxes ?? [])]),
    })

    normalizedProjects.set(nextProject.id, nextProject)
  }

  return [...normalizedProjects.values()]
}

export function get(id: string): ProjectInfo | undefined {
  ensureProjectTable()
  const row = db.findById("projects", ProjectInfo, id)
  return row ? normalizeProjectRecord(row) : undefined
}

export const update = fn(
  z.object({
    projectID: z.string(),
    name: z.string().optional(),
    icon: ProjectInfo.shape.icon.optional(),
  }),
  async (input) => {
    ensureProjectTable()
    db.updateById("projects", input.projectID, {
      name: input.name ? input.name : null,
      icon: input.icon ? input.icon : null,
      updated: Date.now(),
    })

    const result = get(input.projectID)

    GlobalBus.emit("event", {
      payload: {
        type: Event.Updated.type,
        properties: result,
      },
    })

    return result
  },
)

export async function sandboxes(projectID: string) {
  ensureProjectTable()
  const project = get(projectID)
  if (!project?.sandboxes) return []

  const valid: string[] = []
  for (const directory of project.sandboxes) {
    const stat = await fs.stat(directory).catch(() => undefined)
    if (stat?.isDirectory() && isAdditionalSandboxDirectory(directory, project.worktree)) valid.push(directory)
  }

  return valid
}
