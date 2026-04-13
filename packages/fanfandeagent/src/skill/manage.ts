import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, dirname, isAbsolute, join, normalize, relative, resolve } from "node:path"
import matter from "gray-matter"

export interface GlobalSkillTreeNode {
  name: string
  path: string
  kind: "directory" | "file"
  children?: GlobalSkillTreeNode[]
}

export interface GlobalSkillTree {
  root: string
  items: GlobalSkillTreeNode[]
}

export interface GlobalSkillFileDocument {
  path: string
  content: string
}

export interface GlobalSkillRenameResult {
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
  return process.platform === "win32" ? normalized.toLowerCase() : normalized
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
  if (left.kind !== right.kind) {
    return left.kind === "directory" ? -1 : 1
  }

  if (left.name === SKILL_FILENAME && right.name !== SKILL_FILENAME) return -1
  if (right.name === SKILL_FILENAME && left.name !== SKILL_FILENAME) return 1

  return left.name.localeCompare(right.name)
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

async function readTree(directory: string): Promise<GlobalSkillTreeNode[]> {
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
            children: await readTree(entryPath),
          }
        }

        return {
          name: entry.name,
          path: entryPath,
          kind: "file",
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

export async function createGlobalSkill(name: string): Promise<{ directory: string; file: GlobalSkillFileDocument }> {
  const root = await ensureGlobalSkillRoot()
  const directoryName = validateSkillDirectoryName(name)
  const directory = join(root, directoryName)

  if (comparePaths(dirname(directory)) !== comparePaths(root)) {
    throw new SkillManagerError("INVALID_SKILL_NAME", `Skill folder name '${name}' is invalid.`)
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
  const info = await stat(resolvedDirectory).catch(() => null)

  if (!info || !info.isDirectory()) {
    throw new SkillManagerError("SKILL_NOT_FOUND", `Skill '${basename(input.directory)}' was not found.`)
  }

  if (comparePaths(dirname(resolvedDirectory)) !== comparePaths(root)) {
    throw new SkillManagerError("INVALID_SKILL_PATH", "Only top-level global skills can be renamed.")
  }

  const nextDirectoryName = validateSkillDirectoryName(input.name)
  const nextDirectory = join(root, nextDirectoryName)
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
  const info = await stat(resolvedDirectory).catch(() => null)

  if (!info || !info.isDirectory()) {
    throw new SkillManagerError("SKILL_NOT_FOUND", `Skill '${basename(directory)}' was not found.`)
  }

  if (comparePaths(dirname(resolvedDirectory)) !== comparePaths(root)) {
    throw new SkillManagerError("INVALID_SKILL_PATH", "Only top-level global skills can be deleted.")
  }

  await rm(resolvedDirectory, {
    recursive: true,
    force: false,
  })
}
