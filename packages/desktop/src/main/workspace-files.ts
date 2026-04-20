import { readdir, readFile, realpath, stat } from "node:fs/promises"
import { basename, extname, isAbsolute, join, relative, resolve, sep } from "node:path"
import type { AgentWorkspaceFileDocument, AgentWorkspaceFileSearchResult } from "./types"

const EXCLUDED_DIRECTORY_NAMES = new Set([".git", "node_modules", "dist", "build", "out"])
const TEXT_FILE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "json",
  "md",
  "yml",
  "yaml",
  "toml",
  "css",
  "html",
  "txt",
  "log",
])
const SEARCH_RESULT_LIMIT = 200
const UNSUPPORTED_FILE_MESSAGE = "This file type is not supported in the Files panel yet."

function getFileExtension(fileName: string) {
  const extension = extname(fileName).slice(1).toLowerCase()
  return extension.length > 0 ? extension : null
}

function toRelativeWorkspacePath(workspaceRoot: string, targetPath: string) {
  return relative(workspaceRoot, targetPath).split(sep).join("/")
}

function isPathInsideWorkspace(workspaceRoot: string, targetPath: string) {
  const relativePath = relative(workspaceRoot, targetPath)
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath))
}

async function resolveWorkspaceRoot(directory: string) {
  const trimmedDirectory = directory.trim()
  if (!trimmedDirectory) {
    throw new Error("Workspace directory is required.")
  }

  const resolvedRoot = await realpath(trimmedDirectory)
  const workspaceStats = await stat(resolvedRoot)
  if (!workspaceStats.isDirectory()) {
    throw new Error("Workspace directory is not available.")
  }

  return resolvedRoot
}

async function collectWorkspaceFileMatches(
  workspaceRoot: string,
  currentDirectory: string,
  normalizedQuery: string,
  results: AgentWorkspaceFileSearchResult[],
) {
  if (results.length >= SEARCH_RESULT_LIMIT) return

  const entries = await readdir(currentDirectory, { withFileTypes: true })
  entries.sort((left, right) => left.name.localeCompare(right.name))

  for (const entry of entries) {
    if (results.length >= SEARCH_RESULT_LIMIT) return

    const entryPath = join(currentDirectory, entry.name)
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRECTORY_NAMES.has(entry.name.toLowerCase())) {
        continue
      }

      await collectWorkspaceFileMatches(workspaceRoot, entryPath, normalizedQuery, results)
      continue
    }

    if (!entry.isFile()) continue
    if (!entry.name.toLowerCase().includes(normalizedQuery)) continue

    results.push({
      path: toRelativeWorkspacePath(workspaceRoot, entryPath),
      name: entry.name,
      extension: getFileExtension(entry.name),
    })
  }
}

export async function searchWorkspaceFiles(
  directory: string,
  query: string,
): Promise<AgentWorkspaceFileSearchResult[]> {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return []

  const workspaceRoot = await resolveWorkspaceRoot(directory)
  const results: AgentWorkspaceFileSearchResult[] = []
  await collectWorkspaceFileMatches(workspaceRoot, workspaceRoot, normalizedQuery, results)
  return results
}

export async function readWorkspaceFile(
  directory: string,
  filePath: string,
): Promise<AgentWorkspaceFileDocument> {
  const workspaceRoot = await resolveWorkspaceRoot(directory)
  const trimmedFilePath = filePath.trim()
  if (!trimmedFilePath) {
    throw new Error("Workspace file path is required.")
  }

  const candidatePath = resolve(workspaceRoot, trimmedFilePath)
  const resolvedFilePath = await realpath(candidatePath)

  if (!isPathInsideWorkspace(workspaceRoot, resolvedFilePath)) {
    throw new Error("Workspace file path must stay within the current project.")
  }

  const fileStats = await stat(resolvedFilePath)
  if (!fileStats.isFile()) {
    throw new Error("Requested workspace path is not a file.")
  }

  const name = basename(resolvedFilePath)
  const extension = getFileExtension(name)
  const normalizedPath = toRelativeWorkspacePath(workspaceRoot, resolvedFilePath)
  if (!extension || !TEXT_FILE_EXTENSIONS.has(extension)) {
    return {
      path: normalizedPath,
      name,
      extension,
      kind: "unsupported",
      unsupportedReason: UNSUPPORTED_FILE_MESSAGE,
    }
  }

  return {
    path: normalizedPath,
    name,
    extension,
    kind: "text",
    content: await readFile(resolvedFilePath, "utf8"),
  }
}
