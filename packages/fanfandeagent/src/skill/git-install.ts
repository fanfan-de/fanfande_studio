import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path"
import matter from "gray-matter"
import { globalSkillRoot, resolveGlobalSkillFolderTarget } from "#skill/manage.ts"

const SKILL_FILENAME = "SKILL.md"
const PREVIEW_TTL_MS = 30 * 60 * 1000
const GIT_BINARY_NAMES = process.platform === "win32" ? ["git.exe", "git"] : ["git"]

export interface ParsedGitSkillSource {
  source: string
  cloneUrl: string
  repoName: string
  ref?: string
  subpath?: string
}

export interface SkillInstallCandidate {
  id: string
  name: string
  description: string
  relativePath: string
  directoryName: string
  targetDirectory: string
  available: boolean
  reason?: string
  filePath: string
}

export interface SkillGitPreview {
  previewID: string
  source: string
  cloneUrl: string
  ref?: string
  subpath?: string
  skills: SkillInstallCandidate[]
}

export interface InstalledGlobalSkill {
  id: string
  name: string
  directory: string
  filePath: string
}

interface PreviewRecord extends SkillGitPreview {
  repoRoot: string
  previewRoot: string
  expiresAt: number
}

export class SkillGitInstallError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "SkillGitInstallError"
  }
}

const previews = new Map<string, PreviewRecord>()

function normalizeRepoName(input: string) {
  return input.replace(/\.git$/i, "")
}

function requireNonEmptySource(source: string) {
  const trimmed = source.trim()
  if (!trimmed) {
    throw new SkillGitInstallError("SKILL_GIT_INVALID_SOURCE", "Enter a GitHub repository or Git URL.")
  }

  return trimmed
}

function normalizeSubpath(input: string[]) {
  const joined = input.map((segment) => decodeURIComponent(segment)).join("/").trim()
  if (!joined || joined === ".") return undefined
  if (isAbsolute(joined) || joined.split(/[\\/]/).some((segment) => segment === "..")) {
    throw new SkillGitInstallError("SKILL_GIT_INVALID_SOURCE", "GitHub tree path must stay inside the repository.")
  }

  return joined
}

function normalizePastedGitSource(input: string) {
  let normalized = input.trim()
  normalized = normalized.replace(/^git\+(https?:\/\/)/i, "$1")
  normalized = normalized.replace(/^git\+ssh:\/\//i, "ssh://")
  if (/^(?:www\.)?github\.com\//i.test(normalized)) {
    normalized = `https://${normalized}`
  }

  return normalized
}

function normalizeBlobSkillSubpath(pathSegments: string[]) {
  const subpath = normalizeSubpath(pathSegments)
  if (!subpath) {
    throw new SkillGitInstallError("SKILL_GIT_INVALID_SOURCE", "GitHub blob URLs must point to a SKILL.md file.")
  }

  const segments = subpath.split("/")
  const fileName = segments.at(-1)
  if (fileName?.toLowerCase() !== SKILL_FILENAME.toLowerCase()) {
    throw new SkillGitInstallError("SKILL_GIT_INVALID_SOURCE", "GitHub blob URLs must point to a SKILL.md file.")
  }

  const directorySegments = segments.slice(0, -1)
  return directorySegments.length > 0 ? normalizeSubpath(directorySegments) : undefined
}

function parseDirectGitCloneUrl(source: string, url: URL): ParsedGitSkillSource | null {
  const path = url.pathname.replace(/\/+$/g, "")
  if (!path.toLowerCase().endsWith(".git")) return null

  const segments = path.split("/").filter(Boolean)
  const rawRepo = segments.at(-1)
  if (!rawRepo) return null

  const cloneProtocol = url.protocol === "git+ssh:" ? "ssh:" : url.protocol
  const username = url.username ? `${decodeURIComponent(url.username)}@` : ""
  const repoName = normalizeRepoName(decodeURIComponent(rawRepo))
  const cloneUrl = `${cloneProtocol}//${username}${url.host}${path}`

  return {
    source,
    cloneUrl,
    repoName,
  }
}

export function parseGitSkillSource(source: string): ParsedGitSkillSource {
  const trimmed = requireNonEmptySource(source)
  const shorthandMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/)
  if (shorthandMatch) {
    const [, owner, repo] = shorthandMatch
    const repoName = normalizeRepoName(repo)

    return {
      source: trimmed,
      cloneUrl: `https://github.com/${owner}/${repoName}.git`,
      repoName,
    }
  }

  const sshMatch = trimmed.match(/^git@github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/)
  if (sshMatch) {
    const [, owner, repo] = sshMatch
    const repoName = normalizeRepoName(repo)

    return {
      source: trimmed,
      cloneUrl: `git@github.com:${owner}/${repoName}.git`,
      repoName,
    }
  }

  const normalizedSource = normalizePastedGitSource(trimmed)
  let url: URL
  try {
    url = new URL(normalizedSource)
  } catch {
    throw new SkillGitInstallError("SKILL_GIT_INVALID_SOURCE", "Unsupported Git source format.")
  }

  const hostname = url.hostname.toLowerCase()
  const isGithubHost = hostname === "github.com" || hostname === "www.github.com"
  if (!isGithubHost) {
    const directGit = parseDirectGitCloneUrl(trimmed, url)
    if (directGit && ["http:", "https:", "ssh:"].includes(url.protocol)) return directGit

    throw new SkillGitInstallError("SKILL_GIT_INVALID_SOURCE", "Only GitHub repository URLs or direct Git clone URLs are supported.")
  }

  if (url.protocol === "ssh:" || url.protocol === "git+ssh:") {
    const segments = url.pathname.split("/").filter(Boolean)
    const [owner, rawRepo] = segments
    if (!owner || !rawRepo || segments.length !== 2) {
      throw new SkillGitInstallError("SKILL_GIT_INVALID_SOURCE", "GitHub SSH URL must include owner and repository.")
    }

    const repoName = normalizeRepoName(decodeURIComponent(rawRepo))
    return {
      source: trimmed,
      cloneUrl: `git@github.com:${decodeURIComponent(owner)}/${repoName}.git`,
      repoName,
    }
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new SkillGitInstallError("SKILL_GIT_INVALID_SOURCE", "Only GitHub repository URLs or direct Git clone URLs are supported.")
  }

  const segments = url.pathname.split("/").filter(Boolean)
  const [owner, rawRepo, marker, ref, ...pathSegments] = segments
  if (!owner || !rawRepo) {
    throw new SkillGitInstallError("SKILL_GIT_INVALID_SOURCE", "GitHub URL must include owner and repository.")
  }

  const repoName = normalizeRepoName(decodeURIComponent(rawRepo))
  const result: ParsedGitSkillSource = {
    source: trimmed,
    cloneUrl: `https://github.com/${decodeURIComponent(owner)}/${repoName}.git`,
    repoName,
  }

  if (marker) {
    if (!["tree", "blob"].includes(marker) || !ref) {
      throw new SkillGitInstallError("SKILL_GIT_INVALID_SOURCE", "GitHub URL paths must use /tree/<branch>/<path> or /blob/<branch>/<path>/SKILL.md.")
    }

    result.ref = decodeURIComponent(ref)
    result.subpath = marker === "blob" ? normalizeBlobSkillSubpath(pathSegments) : normalizeSubpath(pathSegments)
  }

  return result
}

function resolveCommandBinary(names: string[]) {
  for (const name of names) {
    const resolved = Bun.which(name)
    if (resolved) return resolved
  }

  return null
}

function trimCommandOutput(value: string) {
  return value.replace(/\r\n/g, "\n").trim()
}

async function runGitClone(parsed: ParsedGitSkillSource, repoRoot: string) {
  const git = resolveCommandBinary(GIT_BINARY_NAMES)
  if (!git) {
    throw new SkillGitInstallError("SKILL_GIT_NOT_INSTALLED", "Git is not installed.")
  }

  const args = ["clone", "--depth", "1"]
  if (parsed.ref) args.push("--branch", parsed.ref)
  args.push(parsed.cloneUrl, repoRoot)

  const proc = Bun.spawn([git, ...args], {
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])

  if (exitCode !== 0) {
    throw new SkillGitInstallError(
      "SKILL_GIT_CLONE_FAILED",
      trimCommandOutput(stderr) || trimCommandOutput(stdout) || "Failed to clone the Git repository.",
    )
  }
}

function firstParagraph(markdown: string) {
  for (const section of markdown.split(/\r?\n\s*\r?\n/)) {
    const collapsed = section
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ")
      .replace(/^#+\s*/, "")
      .trim()
    if (collapsed) return collapsed
  }

  return ""
}

function validateSkillDirectoryName(input: string) {
  const trimmed = input.trim()
  if (!trimmed || trimmed === "." || trimmed === ".." || /[\\/]/.test(trimmed)) return null
  return trimmed
}

async function pathExists(path: string) {
  return Boolean(await stat(path).catch(() => null))
}

async function isDirectory(path: string) {
  const info = await stat(path).catch(() => null)
  return Boolean(info?.isDirectory())
}

async function ensureInside(parent: string, child: string) {
  const resolvedParent = await realpath(parent)
  const resolvedChild = await realpath(child).catch(() => resolve(parent, child))
  const relativePath = relative(resolvedParent, resolvedChild)
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new SkillGitInstallError("SKILL_GIT_INVALID_SOURCE", "Skill path is outside the cloned repository.")
  }
}

function toRelativePath(repoRoot: string, directoryPath: string) {
  const value = relative(repoRoot, directoryPath).replace(/\\/g, "/")
  return value || "."
}

async function buildCandidate(input: {
  repoRoot: string
  directoryPath: string
  directoryName: string
  targetRoot: string
  missing?: boolean
}): Promise<SkillInstallCandidate> {
  const relativePath = toRelativePath(input.repoRoot, input.directoryPath)
  const normalizedDirectoryName = validateSkillDirectoryName(input.directoryName)
  const targetDirectory = join(input.targetRoot, normalizedDirectoryName ?? input.directoryName)
  const filePath = join(input.directoryPath, SKILL_FILENAME)

  if (input.missing) {
    return {
      id: relativePath,
      name: input.directoryName,
      description: "SKILL.md was not found.",
      relativePath,
      directoryName: input.directoryName,
      targetDirectory,
      available: false,
      reason: "SKILL.md was not found.",
      filePath,
    }
  }

  const directoryInfo = await lstat(input.directoryPath)
  const fileInfo = await lstat(filePath)
  if (directoryInfo.isSymbolicLink() || fileInfo.isSymbolicLink()) {
    return {
      id: relativePath,
      name: input.directoryName,
      description: "Symbolic links are not allowed in installable skills.",
      relativePath,
      directoryName: normalizedDirectoryName ?? input.directoryName,
      targetDirectory,
      available: false,
      reason: "Skill directories and SKILL.md files must not be symbolic links.",
      filePath,
    }
  }

  const raw = await readFile(filePath, "utf8")
  const parsed = matter(raw)
  const body = parsed.content.trim()
  const name = (typeof parsed.data?.name === "string" ? parsed.data.name.trim() : "") || input.directoryName
  const description =
    (typeof parsed.data?.description === "string" ? parsed.data.description.trim() : "") ||
    firstParagraph(body) ||
    input.directoryName

  let available = true
  let reason: string | undefined
  if (!normalizedDirectoryName) {
    available = false
    reason = `Skill folder name '${input.directoryName}' is invalid.`
  } else if (await pathExists(targetDirectory)) {
    available = false
    reason = `Skill '${normalizedDirectoryName}' already exists.`
  }

  return {
    id: relativePath,
    name,
    description,
    relativePath,
    directoryName: normalizedDirectoryName ?? input.directoryName,
    targetDirectory,
    available,
    ...(reason ? { reason } : {}),
    filePath,
  }
}

async function discoverImmediateSkillDirectories(directory: string) {
  if (!await isDirectory(directory)) return []
  const entries = await readdir(directory, { withFileTypes: true })
  const directories = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map(async (entry) => {
        const directoryPath = join(directory, entry.name)
        return await pathExists(join(directoryPath, SKILL_FILENAME))
          ? {
              directoryPath,
              directoryName: entry.name,
            }
          : null
      }),
  )

  return directories.filter((item): item is { directoryPath: string; directoryName: string } => Boolean(item))
}

export async function discoverSkillInstallCandidates(
  parsed: ParsedGitSkillSource,
  repoRoot: string,
  parentDirectory?: string | null,
): Promise<SkillInstallCandidate[]> {
  const targetRoot = await resolveGlobalSkillFolderTarget(parentDirectory)
  await ensureInside(repoRoot, repoRoot)

  let sources: Array<{ directoryPath: string; directoryName: string; missing?: boolean }> = []
  if (parsed.subpath) {
    const directoryPath = resolve(repoRoot, parsed.subpath)
    await ensureInside(repoRoot, directoryPath)
    if (await pathExists(join(directoryPath, SKILL_FILENAME))) {
      sources = [{ directoryPath, directoryName: basename(directoryPath) || parsed.repoName }]
    } else {
      const nested = await discoverImmediateSkillDirectories(directoryPath)
      sources = nested.length > 0
        ? nested
        : [{ directoryPath, directoryName: basename(directoryPath) || parsed.repoName, missing: true }]
    }
  } else {
    if (await pathExists(join(repoRoot, SKILL_FILENAME))) {
      sources.push({ directoryPath: repoRoot, directoryName: parsed.repoName })
    }

    sources.push(...await discoverImmediateSkillDirectories(join(repoRoot, "skills")))
  }

  if (sources.length === 0) {
    throw new SkillGitInstallError("SKILL_GIT_NO_SKILLS", "No SKILL.md files were found in this repository.")
  }

  const uniqueSources = new Map<string, { directoryPath: string; directoryName: string; missing?: boolean }>()
  for (const source of sources) {
    uniqueSources.set(resolve(source.directoryPath), source)
  }

  return (await Promise.all([...uniqueSources.values()].map((source) => buildCandidate({
    repoRoot,
    targetRoot,
    ...source,
  })))).toSorted((left, right) => left.relativePath.localeCompare(right.relativePath))
}

function cleanupExpiredPreviews() {
  const now = Date.now()
  for (const [previewID, preview] of previews) {
    if (preview.expiresAt > now) continue
    previews.delete(previewID)
    void rm(preview.previewRoot, { recursive: true, force: true })
  }
}

function publicPreview(record: PreviewRecord): SkillGitPreview {
  return {
    previewID: record.previewID,
    source: record.source,
    cloneUrl: record.cloneUrl,
    ...(record.ref ? { ref: record.ref } : {}),
    ...(record.subpath ? { subpath: record.subpath } : {}),
    skills: record.skills,
  }
}

export async function previewGlobalSkillGitInstall(source: string, parentDirectory?: string | null): Promise<SkillGitPreview> {
  cleanupExpiredPreviews()
  const parsed = parseGitSkillSource(source)
  const previewRoot = await mkdtemp(join(tmpdir(), "fanfande-skill-git-"))
  const repoRoot = join(previewRoot, "repo")

  try {
    await runGitClone(parsed, repoRoot)
    return await registerGlobalSkillGitInstallPreview(parsed, repoRoot, previewRoot, parentDirectory)
  } catch (error) {
    await rm(previewRoot, { recursive: true, force: true })
    throw error
  }
}

export async function registerGlobalSkillGitInstallPreview(
  parsed: ParsedGitSkillSource,
  repoRoot: string,
  previewRoot: string,
  parentDirectory?: string | null,
): Promise<SkillGitPreview> {
  cleanupExpiredPreviews()
  const skills = await discoverSkillInstallCandidates(parsed, repoRoot, parentDirectory)
  const previewID = crypto.randomUUID()
  const record: PreviewRecord = {
    previewID,
    source: parsed.source,
    cloneUrl: parsed.cloneUrl,
    ...(parsed.ref ? { ref: parsed.ref } : {}),
    ...(parsed.subpath ? { subpath: parsed.subpath } : {}),
    skills,
    repoRoot,
    previewRoot,
    expiresAt: Date.now() + PREVIEW_TTL_MS,
  }
  previews.set(previewID, record)
  return publicPreview(record)
}

function requirePreview(previewID: string) {
  cleanupExpiredPreviews()
  const preview = previews.get(previewID.trim())
  if (!preview) {
    throw new SkillGitInstallError("SKILL_GIT_PREVIEW_NOT_FOUND", "Skill install preview was not found or has expired.")
  }

  return preview
}

async function copySkillDirectory(sourceDirectory: string, targetDirectory: string) {
  const info = await lstat(sourceDirectory)
  if (info.isSymbolicLink()) {
    throw new SkillGitInstallError("SKILL_GIT_UNSAFE_SOURCE", "Skill directories must not be symbolic links.")
  }
  if (!info.isDirectory()) {
    throw new SkillGitInstallError("SKILL_GIT_UNSAFE_SOURCE", "Skill source must be a directory.")
  }

  await mkdir(targetDirectory, { recursive: true })
  const entries = await readdir(sourceDirectory, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === ".git") continue
    const sourcePath = join(sourceDirectory, entry.name)
    const targetPath = join(targetDirectory, entry.name)
    const entryInfo = await lstat(sourcePath)
    if (entryInfo.isSymbolicLink()) {
      throw new SkillGitInstallError("SKILL_GIT_UNSAFE_SOURCE", "Skill files must not be symbolic links.")
    }
    if (entryInfo.isDirectory()) {
      await copySkillDirectory(sourcePath, targetPath)
      continue
    }
    if (entryInfo.isFile()) {
      await Bun.write(targetPath, Bun.file(sourcePath))
    }
  }
}

export async function installGlobalSkillsFromGitPreview(input: {
  previewID: string
  skillIDs: string[]
  parentDirectory?: string | null
}): Promise<{ installed: InstalledGlobalSkill[] }> {
  const preview = requirePreview(input.previewID)
  const skillIDs = [...new Set(input.skillIDs.map((item) => item.trim()).filter(Boolean))]
  if (skillIDs.length === 0) {
    throw new SkillGitInstallError("SKILL_GIT_NO_SELECTION", "Select at least one skill to install.")
  }

  const byID = new Map(preview.skills.map((skill) => [skill.id, skill] as const))
  const selected = skillIDs.map((skillID) => {
    const candidate = byID.get(skillID)
    if (!candidate) {
      throw new SkillGitInstallError("SKILL_GIT_INVALID_SELECTION", `Skill '${skillID}' is not part of this preview.`)
    }
    if (!candidate.available) {
      throw new SkillGitInstallError("SKILL_GIT_SKILL_UNAVAILABLE", candidate.reason || `Skill '${candidate.name}' cannot be installed.`)
    }

    return candidate
  })

  const installed: InstalledGlobalSkill[] = []
  const stagedDirectories: string[] = []

  try {
    for (const candidate of selected) {
      const sourceDirectory = resolve(preview.repoRoot, candidate.relativePath)
      await ensureInside(preview.repoRoot, sourceDirectory)
      const targetDirectory = candidate.targetDirectory
      const targetExists = await pathExists(targetDirectory)
      if (targetExists) {
        throw new SkillGitInstallError("SKILL_ALREADY_EXISTS", `Skill '${candidate.directoryName}' already exists.`)
      }

      const stagingDirectory = join(dirname(targetDirectory), `.installing-${candidate.directoryName}-${crypto.randomUUID()}`)
      stagedDirectories.push(stagingDirectory)
      await copySkillDirectory(sourceDirectory, stagingDirectory)
      await rename(stagingDirectory, targetDirectory)
      stagedDirectories.pop()
      installed.push({
        id: candidate.id,
        name: candidate.name,
        directory: targetDirectory,
        filePath: join(targetDirectory, SKILL_FILENAME),
      })
    }
  } catch (error) {
    for (const directory of stagedDirectories) {
      await rm(directory, { recursive: true, force: true })
    }
    for (const item of installed) {
      await rm(item.directory, { recursive: true, force: true })
    }
    throw error
  } finally {
    previews.delete(preview.previewID)
    await rm(preview.previewRoot, { recursive: true, force: true })
  }

  return { installed }
}

async function resolveLocalSkillDirectory(sourcePath: string) {
  const trimmed = sourcePath.trim()
  if (!trimmed) {
    throw new SkillGitInstallError("SKILL_LOCAL_INVALID_SOURCE", "Select a local SKILL.md file.")
  }

  const resolvedPath = resolve(trimmed)
  const info = await lstat(resolvedPath).catch(() => null)
  if (!info) {
    throw new SkillGitInstallError("SKILL_LOCAL_NOT_FOUND", "Local skill file was not found.")
  }
  if (info.isSymbolicLink()) {
    throw new SkillGitInstallError("SKILL_GIT_UNSAFE_SOURCE", "Skill source must not be a symbolic link.")
  }

  if (info.isDirectory()) {
    if (!await pathExists(join(resolvedPath, SKILL_FILENAME))) {
      throw new SkillGitInstallError("SKILL_LOCAL_INVALID_SOURCE", "Selected folder must contain SKILL.md.")
    }

    return resolvedPath
  }

  if (!info.isFile() || basename(resolvedPath).toLowerCase() !== SKILL_FILENAME.toLowerCase()) {
    throw new SkillGitInstallError("SKILL_LOCAL_INVALID_SOURCE", "Select a SKILL.md file.")
  }

  return dirname(resolvedPath)
}

export async function installGlobalSkillFromLocalPath(sourcePath: string, parentDirectory?: string | null): Promise<{ installed: InstalledGlobalSkill[] }> {
  const sourceDirectory = await resolveLocalSkillDirectory(sourcePath)
  const targetRoot = await resolveGlobalSkillFolderTarget(parentDirectory)
  const candidate = await buildCandidate({
    repoRoot: sourceDirectory,
    directoryPath: sourceDirectory,
    directoryName: basename(sourceDirectory),
    targetRoot,
  })

  if (!candidate.available) {
    throw new SkillGitInstallError("SKILL_GIT_SKILL_UNAVAILABLE", candidate.reason || `Skill '${candidate.name}' cannot be installed.`)
  }

  const targetDirectory = candidate.targetDirectory
  if (await pathExists(targetDirectory)) {
    throw new SkillGitInstallError("SKILL_ALREADY_EXISTS", `Skill '${candidate.directoryName}' already exists.`)
  }

  const stagingDirectory = join(dirname(targetDirectory), `.installing-${candidate.directoryName}-${crypto.randomUUID()}`)
  try {
    await copySkillDirectory(sourceDirectory, stagingDirectory)
    await rename(stagingDirectory, targetDirectory)
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true })
    await rm(targetDirectory, { recursive: true, force: true })
    throw error
  }

  return {
    installed: [
      {
        id: candidate.id,
        name: candidate.name,
        directory: targetDirectory,
        filePath: join(targetDirectory, SKILL_FILENAME),
      },
    ],
  }
}

export function getGlobalSkillInstallTargetRoot() {
  return globalSkillRoot()
}
