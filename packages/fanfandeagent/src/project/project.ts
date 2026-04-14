import z from "zod"
import fs from "fs/promises"
import * as Filesystem from "#util/filesystem.ts"
import path from "path"
import { $ } from "bun"
import * as db from "#database/Sqlite.ts"
import * as Log from "#util/log.ts"
import { Flag } from "#flag/flag.ts"
import { fn } from "#util/fn.ts"
import * as BusEvent from "#bus/bus-event.ts"
import { GlobalBus } from "#bus/global.ts"
import { existsSync } from "fs"
import * as Session from "#session/session.ts"

const log = Log.create({ service: "project" })
let projectTableGeneration = -1

function ensureProjectTable() {
  const generation = db.getDatabaseGeneration()
  if (projectTableGeneration === generation && generation > 0) return
  if (!db.tableExists("projects")) {
    db.createTableByZodObject("projects", ProjectInfo)
  }
  projectTableGeneration = db.getDatabaseGeneration()
}

export const ProjectInfo = z
  .object({
    id: z.string(),
    worktree: z.string(),
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

function normalizeProjectPath(input: string) {
  const resolved = path.resolve(input)
  const normalized = path.normalize(resolved)
  return process.platform === "win32" ? normalized.toLowerCase() : normalized
}

function isGlobalWorktree(worktree: string) {
  return worktree === "/"
}

function resolveProjectName(worktree: string, vcs: ProjectInfo["vcs"]) {
  if (vcs === "git") {
    const folderName = worktree.split(/[\\/]/).filter(Boolean).pop()
    return folderName || worktree
  }

  return "Global"
}

function resolveStoredProjectName(worktree: string, vcs: ProjectInfo["vcs"], currentName?: string) {
  const canonicalName = resolveProjectName(worktree, vcs)
  if (isGlobalWorktree(worktree)) return canonicalName

  const trimmed = currentName?.trim()
  return trimmed || canonicalName
}

function isPathInsideProject(directory: string, worktree: string) {
  if (isGlobalWorktree(worktree)) return true

  const relative = path.relative(normalizeProjectPath(worktree), normalizeProjectPath(directory))
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

function isAdditionalSandboxDirectory(directory: string, worktree: string) {
  if (isGlobalWorktree(worktree)) return false
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

function collectLegacyProjects(worktree: string, projectID?: string, sandbox?: string) {
  const normalizedWorktree = isGlobalWorktree(worktree) ? null : normalizeProjectPath(worktree)
  const normalizedSandbox = sandbox ? normalizeProjectPath(sandbox) : null
  const legacyProjects = new Map<string, ProjectInfo>()

  for (const project of db.findManyWithSchema("projects", ProjectInfo)) {
    const projectWorktree = isGlobalWorktree(project.worktree) ? null : normalizeProjectPath(project.worktree)
    const projectSandboxes = (project.sandboxes ?? []).map(normalizeProjectPath)
    const sameIdentity = projectID ? project.id === projectID : false
    const sameWorktree = normalizedWorktree ? projectWorktree === normalizedWorktree : project.worktree === "/"
    const legacyFolderProject = normalizedSandbox ? projectWorktree === normalizedSandbox : false
    const containsSandbox = normalizedSandbox ? projectSandboxes.includes(normalizedSandbox) : false

    if (sameIdentity || sameWorktree || legacyFolderProject || containsSandbox) {
      legacyProjects.set(project.id, project)
    }
  }

  if (normalizedWorktree) {
    const globalProject = db.findById("projects", ProjectInfo, "global")
    const hasMatchingGlobalSession =
      globalProject &&
      Session.listByProject(globalProject.id).some((session) => isPathInsideProject(session.directory, worktree))

    if (globalProject && hasMatchingGlobalSession) {
      legacyProjects.set(globalProject.id, globalProject)
    }
  }

  return [...legacyProjects.values()]
}

function migrateLegacyProjectSessions(legacyProjectIDs: string[], nextProjectID: string, worktree: string) {
  const uniqueLegacyProjectIDs = [...new Set(legacyProjectIDs)].filter((projectID) => projectID && projectID !== nextProjectID)

  for (const legacyProjectID of uniqueLegacyProjectIDs) {
    const legacySessions = Session.listByProject(legacyProjectID)

    for (const session of legacySessions) {
      if (!isPathInsideProject(session.directory, worktree)) continue

      db.updateById("sessions", session.id, {
        projectID: nextProjectID,
      })
    }
  }
}

function persistProjectRecord(input: {
  projectID: string
  worktree: string
  sandbox: string
  vcs: ProjectInfo["vcs"]
}) {
  const legacyProjects = collectLegacyProjects(input.worktree, input.projectID, input.sandbox)
  const currentProject = db.findById("projects", ProjectInfo, input.projectID)
  const now = Date.now()
  const seedProject =
    currentProject ??
    legacyProjects[0] ?? {
      id: input.projectID,
      worktree: input.worktree,
      vcs: input.vcs,
      name: resolveProjectName(input.worktree, input.vcs),
      created: now,
      updated: now,
      sandboxes: [] as string[],
    }
  const seedProjectName = isGlobalWorktree(seedProject.worktree) ? undefined : seedProject.name

  const sandboxes = uniqueProjectPaths([
    ...(seedProject.sandboxes ?? []),
    ...legacyProjects.flatMap((project) => project.sandboxes ?? []),
    ...legacyProjects.flatMap((project) => (isGlobalWorktree(project.worktree) ? [] : [project.worktree])),
    input.sandbox,
  ]).filter((item) => existsSync(item) && isAdditionalSandboxDirectory(item, input.worktree))

  const nextProject: ProjectInfo = {
    ...seedProject,
    id: input.projectID,
    worktree: input.worktree,
    vcs: input.vcs,
    name: resolveStoredProjectName(input.worktree, input.vcs, seedProjectName),
    updated: now,
    sandboxes,
  }

  migrateLegacyProjectSessions(
    legacyProjects.map((project) => project.id),
    input.projectID,
    input.worktree,
  )

  db.deleteById("projects", input.projectID)
  db.insertOne("projects", nextProject)

  for (const legacyProject of legacyProjects) {
    if (legacyProject.id !== input.projectID) {
      db.deleteById("projects", legacyProject.id)
    }
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

async function resolveGitProjectID(cwd: string, gitCommonDir?: string) {
  const opencodeFile = gitCommonDir ? path.join(gitCommonDir, "opencode") : undefined
  const cachedID =
    (opencodeFile
      ? await Bun.file(opencodeFile)
          .text()
          .then((value) => value.trim())
          .catch(() => undefined)
      : undefined) || undefined

  if (cachedID) return cachedID
  if (!Bun.which("git")) return "global"

  const rootCommit =
    (await $`git rev-list --max-parents=0 --all`
      .quiet()
      .nothrow()
      .cwd(cwd)
      .text()
      .then((value) =>
        value
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean)
          .toSorted()[0],
      )
      .catch(() => undefined)) || "global"

  if (rootCommit !== "global" && opencodeFile) {
    void Bun.file(opencodeFile).write(rootCommit).catch(() => undefined)
  }

  return rootCommit
}

async function resolveProjectIdentity(directory: string) {
  const resolvedDirectory = path.resolve(directory)
  const matches = Filesystem.up({ targets: [".git"], start: resolvedDirectory })
  const gitMarker = await matches.next().then((item) => item.value)
  await matches.return()

  const defaultVcs = ProjectInfo.shape.vcs.parse(Flag.FanFande_FAKE_VCS)

  if (!gitMarker) {
    return {
      projectID: "global",
      sandbox: resolvedDirectory,
      worktree: "/",
      vcs: defaultVcs,
    }
  }

  const gitCwd = path.dirname(gitMarker)
  const gitCommonDir = await resolveGitCommonDir(gitCwd)
  const sandbox = (await resolveGitTopLevel(gitCwd)) ?? gitCwd
  const worktree = gitCommonDir ? path.resolve(gitCommonDir, "..") : sandbox
  const projectID = await resolveGitProjectID(gitCwd, gitCommonDir)

  return {
    projectID,
    sandbox,
    worktree,
    vcs: "git" as const,
  }
}

export async function fromDirectory(directory: string): Promise<{ project: ProjectInfo; sandbox: string }> {
  ensureProjectTable()
  log.info("fromDirectory", { directory })

  const resolved = await resolveProjectIdentity(directory)
  const project = persistProjectRecord({
    projectID: resolved.projectID,
    worktree: resolved.worktree,
    sandbox: resolved.sandbox,
    vcs: resolved.vcs,
  })

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

  for (const project of db.findMany("projects", ProjectInfo)) {
    const possibleDirectories = [...(project.sandboxes ?? [])]
    if (!isGlobalWorktree(project.worktree)) {
      possibleDirectories.push(project.worktree)
    }

    for (const directory of possibleDirectories) {
      if (!directory || !existsSync(directory)) continue
      candidates.set(normalizeProjectPath(directory), directory)
    }
  }

  // A directory can start as a global/non-git session and later become a git
  // repo. Project records do not retain those global directory paths, so we
  // also re-evaluate the directories referenced by persisted sessions.
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

  const projects = db.findMany("projects", ProjectInfo)
  const normalizedProjects = new Map<string, ProjectInfo>()

  for (const project of projects) {
    const previous = normalizedProjects.get(project.id)
    const nextProject: ProjectInfo = {
      ...(previous ?? project),
      ...project,
      name: resolveStoredProjectName(project.worktree, project.vcs, project.name ?? previous?.name),
      updated: Math.max(previous?.updated ?? 0, project.updated),
      sandboxes: uniqueProjectPaths([...(previous?.sandboxes ?? []), ...(project.sandboxes ?? [])]).filter(
        (item) => existsSync(item) && isAdditionalSandboxDirectory(item, project.worktree),
      ),
    }

    normalizedProjects.set(nextProject.id, nextProject)
  }

  return [...normalizedProjects.values()]
}

export function get(id: string): ProjectInfo | undefined {
  ensureProjectTable()
  const row = db.findById("projects", ProjectInfo, id)
  return row ?? undefined
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

    const result = db.findById("projects", ProjectInfo, input.projectID)

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
  const project = db.findById("projects", ProjectInfo, projectID)
  if (!project?.sandboxes) return []

  const valid: string[] = []
  for (const directory of project.sandboxes) {
    const stat = await fs.stat(directory).catch(() => undefined)
    if (stat?.isDirectory() && isAdditionalSandboxDirectory(directory, project.worktree)) valid.push(directory)
  }

  return valid
}

