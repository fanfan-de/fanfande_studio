import { mkdir, readFile, readdir, rename, rm, rmdir, stat, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, dirname, isAbsolute, join, normalize, relative, resolve } from "node:path"
import { normalizeComparablePath } from "@anybox/platform"
import matter from "gray-matter"

export interface GlobalSkillTreeNode {
  name: string
  path: string
  kind: "directory" | "file"
  role: "folder" | "skill" | "resource"
  readOnly?: boolean
  scope?: "user" | "plugin"
  pluginID?: string
  enabled?: boolean
  children?: GlobalSkillTreeNode[]
}

export interface GlobalSkillTree {
  root: string
  items: GlobalSkillTreeNode[]
}

export interface GlobalSkillFileDocument {
  path: string
  content: string
  readOnly?: boolean
  scope?: "user" | "plugin"
  pluginID?: string
}

export interface GlobalSkillRenameResult {
  previousDirectory: string
  directory: string
  filePath: string | null
}

export interface GlobalSkillFolderResult {
  directory: string
}

export interface GlobalSkillFolderRenameResult {
  previousDirectory: string
  directory: string
}

export interface GlobalSkillMoveResult {
  previousDirectory: string
  directory: string
  filePath: string | null
}

export class SkillManagerError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "SkillManagerError"
  }
}

const SKILL_FILENAME = "SKILL.md"

function comparePaths(value: string) {
  const normalized = normalize(resolve(value))
  return normalizeComparablePath(normalized)
}

function ensureSafeRelativePath(root: string, input: string) {
  const resolvedRoot = resolve(root)
  const candidate = isAbsolute(input) ? resolve(input) : resolve(resolvedRoot, input)
  const relativePath = relative(resolvedRoot, candidate)

  if (relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath))) {
    return candidate
  }

  throw new SkillManagerError("INVALID_SKILL_PATH", `Path '${input}' is outside the global skills root.`)
}

function sortTreeEntries(left: GlobalSkillTreeNode, right: GlobalSkillTreeNode) {
  const leftRank = getTreeEntrySortRank(left)
  const rightRank = getTreeEntrySortRank(right)
  if (leftRank !== rightRank) return leftRank - rightRank

  if (left.name === SKILL_FILENAME && right.name !== SKILL_FILENAME) return -1
  if (right.name === SKILL_FILENAME && left.name !== SKILL_FILENAME) return 1

  return left.name.localeCompare(right.name)
}

function getTreeEntrySortRank(node: GlobalSkillTreeNode) {
  if (node.kind === "file") return node.name === SKILL_FILENAME ? 3 : 4
  if (node.role === "folder") return 0
  if (node.role === "skill") return 1
  return 2
}

function validateSkillDirectoryName(input: string) {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new SkillManagerError("INVALID_SKILL_NAME", "Skill folder name must not be empty.")
  }

  if (trimmed === "." || trimmed === ".." || /[\\/]/.test(trimmed)) {
    throw new SkillManagerError("INVALID_SKILL_NAME", `Skill folder name '${input}' is invalid.`)
  }

  return trimmed
}

function validateFolderDirectoryName(input: string) {
  return validateSkillDirectoryName(input)
}

async function pathExists(path: string) {
  return Boolean(await stat(path).catch(() => null))
}

async function isFile(path: string) {
  const info = await stat(path).catch(() => null)
  return Boolean(info?.isFile())
}

async function isSkillDirectory(directory: string) {
  return isFile(join(directory, SKILL_FILENAME))
}

async function assertDirectory(path: string, message: string) {
  const info = await stat(path).catch(() => null)
  if (!info?.isDirectory()) {
    throw new SkillManagerError("SKILL_NOT_FOUND", message)
  }
}

async function assertSkillDirectory(directory: string) {
  await assertDirectory(directory, `Skill '${basename(directory)}' was not found.`)
  if (!await isSkillDirectory(directory)) {
    throw new SkillManagerError("INVALID_SKILL_PATH", `Directory '${basename(directory)}' is not a skill.`)
  }
}

async function assertManagedFolder(root: string, directory: string) {
  await assertDirectory(directory, `Folder '${basename(directory)}' was not found.`)

  let current = directory
  while (comparePaths(current) !== comparePaths(root)) {
    if (await isSkillDirectory(current)) {
      throw new SkillManagerError("INVALID_SKILL_PATH", "Skill folders and skill resource folders cannot be used as management folders.")
    }
    current = dirname(current)
  }
}

function buildSkillTemplate(name: string) {
  return [
    "---",
    `name: ${name}`,
    "description: Describe when this skill should be used.",
    "---",
    "",
    `# ${name}`,
    "",
    "Describe the workflow, constraints, and expected behavior here.",
    "",
  ].join("\n")
}

async function readResourceTree(directory: string): Promise<GlobalSkillTreeNode[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nodes = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith("."))
      .map(async (entry): Promise<GlobalSkillTreeNode> => {
        const entryPath = join(directory, entry.name)

        if (entry.isDirectory()) {
          return {
            name: entry.name,
            path: entryPath,
            kind: "directory",
            role: "resource",
            children: await readResourceTree(entryPath),
          }
        }

        return {
          name: entry.name,
          path: entryPath,
          kind: "file",
          role: "resource",
        }
      }),
  )

  return nodes.toSorted(sortTreeEntries)
}

async function readTree(directory: string): Promise<GlobalSkillTreeNode[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nodes = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith("."))
      .map(async (entry): Promise<GlobalSkillTreeNode> => {
        const entryPath = join(directory, entry.name)

        if (entry.isDirectory()) {
          const role = await isSkillDirectory(entryPath) ? "skill" : "folder"
          return {
            name: entry.name,
            path: entryPath,
            kind: "directory",
            role,
            children: role === "skill" ? await readResourceTree(entryPath) : await readTree(entryPath),
          }
        }

        return {
          name: entry.name,
          path: entryPath,
          kind: "file",
          role: "resource",
        }
      }),
  )

  return nodes.toSorted(sortTreeEntries)
}

export function globalSkillRoot() {
  return join(homedir(), ".anybox", "skills")
}

export async function ensureGlobalSkillRoot() {
  const root = globalSkillRoot()
  await mkdir(root, { recursive: true })
  return root
}

export async function getGlobalSkillTree(): Promise<GlobalSkillTree> {
  const root = await ensureGlobalSkillRoot()

  return {
    root,
    items: await readTree(root),
  }
}

export async function readGlobalSkillFile(path: string): Promise<GlobalSkillFileDocument> {
  const root = await ensureGlobalSkillRoot()
  const resolvedPath = ensureSafeRelativePath(root, path)
  const fileInfo = await stat(resolvedPath).catch(() => null)

  if (!fileInfo || !fileInfo.isFile()) {
    throw new SkillManagerError("SKILL_FILE_NOT_FOUND", `Skill file '${path}' was not found.`)
  }

  return {
    path: resolvedPath,
    content: await readFile(resolvedPath, "utf8"),
  }
}

export async function writeGlobalSkillFile(input: GlobalSkillFileDocument): Promise<GlobalSkillFileDocument> {
  const root = await ensureGlobalSkillRoot()
  const resolvedPath = ensureSafeRelativePath(root, input.path)
  await mkdir(dirname(resolvedPath), { recursive: true })
  await writeFile(resolvedPath, input.content, "utf8")

  return {
    path: resolvedPath,
    content: input.content,
  }
}

export async function resolveGlobalSkillFolderTarget(parentDirectory?: string | null) {
  const root = await ensureGlobalSkillRoot()
  const directory = parentDirectory?.trim() ? ensureSafeRelativePath(root, parentDirectory) : root
  await assertManagedFolder(root, directory)
  return directory
}

export async function createGlobalSkill(input: string | {
  name: string
  parentDirectory?: string | null
}): Promise<{ directory: string; file: GlobalSkillFileDocument }> {
  const root = await ensureGlobalSkillRoot()
  const directoryName = validateSkillDirectoryName(typeof input === "string" ? input : input.name)
  const parentDirectory = typeof input === "string" ? root : await resolveGlobalSkillFolderTarget(input.parentDirectory)
  const directory = join(parentDirectory, directoryName)

  if (comparePaths(dirname(directory)) !== comparePaths(parentDirectory)) {
    throw new SkillManagerError("INVALID_SKILL_NAME", `Skill folder name '${directoryName}' is invalid.`)
  }

  const existing = await stat(directory).catch(() => null)
  if (existing) {
    throw new SkillManagerError("SKILL_ALREADY_EXISTS", `Skill '${directoryName}' already exists.`)
  }

  await mkdir(directory, { recursive: false })
  const file = {
    path: join(directory, SKILL_FILENAME),
    content: buildSkillTemplate(directoryName),
  }
  await writeFile(file.path, file.content, "utf8")

  return {
    directory,
    file,
  }
}

export async function renameGlobalSkill(input: {
  directory: string
  name: string
}): Promise<GlobalSkillRenameResult> {
  const root = await ensureGlobalSkillRoot()
  const resolvedDirectory = ensureSafeRelativePath(root, input.directory)
  await assertSkillDirectory(resolvedDirectory)

  const nextDirectoryName = validateSkillDirectoryName(input.name)
  const parentDirectory = dirname(resolvedDirectory)
  const nextDirectory = join(parentDirectory, nextDirectoryName)
  const previousDirectoryName = basename(resolvedDirectory)

  if (comparePaths(resolvedDirectory) === comparePaths(nextDirectory)) {
    return {
      previousDirectory: resolvedDirectory,
      directory: resolvedDirectory,
      filePath: (await stat(join(resolvedDirectory, SKILL_FILENAME)).catch(() => null)) ? join(resolvedDirectory, SKILL_FILENAME) : null,
    }
  }

  const existing = await stat(nextDirectory).catch(() => null)
  if (existing) {
    throw new SkillManagerError("SKILL_ALREADY_EXISTS", `Skill '${nextDirectoryName}' already exists.`)
  }

  await rename(resolvedDirectory, nextDirectory)

  const filePath = join(nextDirectory, SKILL_FILENAME)
  const fileInfo = await stat(filePath).catch(() => null)

  if (fileInfo?.isFile()) {
    const raw = await readFile(filePath, "utf8")
    const parsed = matter(raw)
    const nextFrontmatter = {
      ...(parsed.data ?? {}),
      name: nextDirectoryName,
    }
    let nextBody = parsed.content
    nextBody = nextBody.replace(
      new RegExp(`^(#\\s+)${previousDirectoryName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s*)$`, "m"),
      `$1${nextDirectoryName}$2`,
    )
    await writeFile(filePath, matter.stringify(nextBody, nextFrontmatter), "utf8")
  }

  return {
    previousDirectory: resolvedDirectory,
    directory: nextDirectory,
    filePath: fileInfo?.isFile() ? filePath : null,
  }
}

export async function deleteGlobalSkill(directory: string) {
  const root = await ensureGlobalSkillRoot()
  const resolvedDirectory = ensureSafeRelativePath(root, directory)
  await assertSkillDirectory(resolvedDirectory)

  await rm(resolvedDirectory, {
    recursive: true,
    force: false,
  })
}

export async function createGlobalSkillFolder(input: {
  name: string
  parentDirectory?: string | null
}): Promise<GlobalSkillFolderResult> {
  const directoryName = validateFolderDirectoryName(input.name)
  const parentDirectory = await resolveGlobalSkillFolderTarget(input.parentDirectory)
  const directory = join(parentDirectory, directoryName)

  if (comparePaths(dirname(directory)) !== comparePaths(parentDirectory)) {
    throw new SkillManagerError("INVALID_SKILL_NAME", `Folder name '${input.name}' is invalid.`)
  }

  if (await pathExists(directory)) {
    throw new SkillManagerError("SKILL_ALREADY_EXISTS", `Folder '${directoryName}' already exists.`)
  }

  await mkdir(directory, { recursive: false })
  return { directory }
}

export async function renameGlobalSkillFolder(input: {
  directory: string
  name: string
}): Promise<GlobalSkillFolderRenameResult> {
  const root = await ensureGlobalSkillRoot()
  const resolvedDirectory = ensureSafeRelativePath(root, input.directory)
  if (comparePaths(resolvedDirectory) === comparePaths(root)) {
    throw new SkillManagerError("INVALID_SKILL_PATH", "The global skills root cannot be renamed.")
  }
  await assertManagedFolder(root, resolvedDirectory)

  const nextDirectoryName = validateFolderDirectoryName(input.name)
  const nextDirectory = join(dirname(resolvedDirectory), nextDirectoryName)
  if (comparePaths(resolvedDirectory) === comparePaths(nextDirectory)) {
    return {
      previousDirectory: resolvedDirectory,
      directory: resolvedDirectory,
    }
  }

  if (await pathExists(nextDirectory)) {
    throw new SkillManagerError("SKILL_ALREADY_EXISTS", `Folder '${nextDirectoryName}' already exists.`)
  }

  await rename(resolvedDirectory, nextDirectory)
  return {
    previousDirectory: resolvedDirectory,
    directory: nextDirectory,
  }
}

export async function deleteGlobalSkillFolder(directory: string) {
  const root = await ensureGlobalSkillRoot()
  const resolvedDirectory = ensureSafeRelativePath(root, directory)
  if (comparePaths(resolvedDirectory) === comparePaths(root)) {
    throw new SkillManagerError("INVALID_SKILL_PATH", "The global skills root cannot be deleted.")
  }
  await assertManagedFolder(root, resolvedDirectory)

  const entries = await readdir(resolvedDirectory)
  if (entries.length > 0) {
    throw new SkillManagerError("SKILL_FOLDER_NOT_EMPTY", `Folder '${basename(resolvedDirectory)}' is not empty.`)
  }

  await rmdir(resolvedDirectory)
}

export async function moveGlobalSkillDirectory(input: {
  directory: string
  parentDirectory?: string | null
}): Promise<GlobalSkillMoveResult> {
  const root = await ensureGlobalSkillRoot()
  const resolvedDirectory = ensureSafeRelativePath(root, input.directory)
  if (comparePaths(resolvedDirectory) === comparePaths(root)) {
    throw new SkillManagerError("INVALID_SKILL_PATH", "The global skills root cannot be moved.")
  }
  await assertDirectory(resolvedDirectory, `Directory '${basename(input.directory)}' was not found.`)

  const isSkill = await isSkillDirectory(resolvedDirectory)
  if (!isSkill) {
    await assertManagedFolder(root, resolvedDirectory)
  }

  const parentDirectory = await resolveGlobalSkillFolderTarget(input.parentDirectory)
  const relativeTarget = relative(resolvedDirectory, parentDirectory)
  if (relativeTarget === "" || (!relativeTarget.startsWith("..") && !isAbsolute(relativeTarget))) {
    throw new SkillManagerError("INVALID_SKILL_PATH", "A folder cannot be moved into itself or one of its children.")
  }

  const nextDirectory = join(parentDirectory, basename(resolvedDirectory))
  if (comparePaths(resolvedDirectory) === comparePaths(nextDirectory)) {
    return {
      previousDirectory: resolvedDirectory,
      directory: resolvedDirectory,
      filePath: isSkill ? join(resolvedDirectory, SKILL_FILENAME) : null,
    }
  }

  if (await pathExists(nextDirectory)) {
    throw new SkillManagerError("SKILL_ALREADY_EXISTS", `Directory '${basename(resolvedDirectory)}' already exists in the target folder.`)
  }

  await rename(resolvedDirectory, nextDirectory)
  return {
    previousDirectory: resolvedDirectory,
    directory: nextDirectory,
    filePath: isSkill ? join(nextDirectory, SKILL_FILENAME) : null,
  }
}
