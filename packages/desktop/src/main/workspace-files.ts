import { readdir, readFile, realpath, stat } from "node:fs/promises"
import { basename, extname, isAbsolute, join, relative, resolve, sep } from "node:path"
import type {
  AgentWorkspaceDirectoryEntry,
  AgentWorkspaceFileDocument,
  AgentWorkspaceFileSearchResult,
} from "./types"
import { getLocalImageMimeType, LOCAL_IMAGE_MAX_BYTES } from "./local-image-protocol"
import { toLocalImageProtocolUrl } from "../shared/local-image-protocol"

const EXCLUDED_DIRECTORY_NAMES = new Set([".git", "node_modules", "dist", "build", "out"])
const HIDDEN_DIRECTORY_NAMES = new Set([".git"])
const TEXT_FILE_EXTENSIONS = new Set([
  "astro",
  "bat",
  "c",
  "cc",
  "cfg",
  "cjs",
  "cmd",
  "conf",
  "cpp",
  "cs",
  "css",
  "go",
  "h",
  "hpp",
  "htm",
  "html",
  "java",
  "js",
  "jsx",
  "json",
  "kt",
  "kts",
  "less",
  "log",
  "lua",
  "md",
  "mjs",
  "php",
  "ps1",
  "py",
  "rb",
  "rs",
  "sass",
  "scss",
  "sh",
  "sql",
  "svelte",
  "swift",
  "toml",
  "ts",
  "tsx",
  "txt",
  "vue",
  "xml",
  "yaml",
  "yml",
])
const SEARCH_RESULT_LIMIT = 200
const UNSUPPORTED_FILE_MESSAGE = "This file type is not supported in the Files panel yet."
const IMAGE_TOO_LARGE_MESSAGE = "This image is too large to preview in the Files panel."

function getFileExtension(fileName: string) {
  const extension = extname(fileName).slice(1).toLowerCase()
  return extension.length > 0 ? extension : null
}

function toRelativeWorkspacePath(workspaceRoot: string, targetPath: string) {
  return relative(workspaceRoot, targetPath).split(sep).join("/")
}

function normalizeRelativeWorkspaceInputPath(input?: string | null) {
  const normalized = (input ?? "").trim().replace(/\\/g, "/").replace(/\/+/g, "/")
  if (!normalized || normalized === "." || normalized === "/") return ""
  return normalized.replace(/^\/+/, "").replace(/\/+$/, "")
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
      absolutePath: entryPath,
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

export async function listWorkspaceDirectory(
  directory: string,
  directoryPath?: string | null,
): Promise<AgentWorkspaceDirectoryEntry[]> {
  const workspaceRoot = await resolveWorkspaceRoot(directory)
  const normalizedDirectoryPath = normalizeRelativeWorkspaceInputPath(directoryPath)
  const candidatePath = resolve(workspaceRoot, normalizedDirectoryPath)
  if (!isPathInsideWorkspace(workspaceRoot, candidatePath)) {
    throw new Error("Workspace directory path must stay within the current project.")
  }

  const resolvedDirectoryPath = await realpath(candidatePath)
  if (!isPathInsideWorkspace(workspaceRoot, resolvedDirectoryPath)) {
    throw new Error("Workspace directory path must stay within the current project.")
  }

  const directoryStats = await stat(resolvedDirectoryPath)
  if (!directoryStats.isDirectory()) {
    throw new Error("Requested workspace path is not a directory.")
  }

  const entries = await readdir(resolvedDirectoryPath, { withFileTypes: true })
  const visibleEntries = entries.flatMap((entry): AgentWorkspaceDirectoryEntry[] => {
    if (entry.isDirectory()) {
      if (HIDDEN_DIRECTORY_NAMES.has(entry.name.toLowerCase())) return []
      const entryPath = join(resolvedDirectoryPath, entry.name)
      return [{
        path: toRelativeWorkspacePath(workspaceRoot, entryPath),
        name: entry.name,
        kind: "directory",
        extension: null,
        hasChildren: true,
      }]
    }

    if (!entry.isFile()) return []
    const entryPath = join(resolvedDirectoryPath, entry.name)
    return [{
      path: toRelativeWorkspacePath(workspaceRoot, entryPath),
      name: entry.name,
      kind: "file",
      extension: getFileExtension(entry.name),
      hasChildren: false,
    }]
  })

  visibleEntries.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1
    return left.name.localeCompare(right.name, undefined, {
      numeric: true,
      sensitivity: "base",
    })
  })

  return visibleEntries
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

  const candidatePath = resolve(workspaceRoot, trimmedFilePath.replace(/\\/g, "/"))
  if (!isPathInsideWorkspace(workspaceRoot, candidatePath)) {
    throw new Error("Workspace file path must stay within the current project.")
  }

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
  const imageMimeType = getLocalImageMimeType(resolvedFilePath)
  if (imageMimeType) {
    const previewUrl = toLocalImageProtocolUrl(resolvedFilePath)
    if (fileStats.size > LOCAL_IMAGE_MAX_BYTES || !previewUrl) {
      return {
        path: normalizedPath,
        name,
        extension,
        kind: "unsupported",
        unsupportedReason: IMAGE_TOO_LARGE_MESSAGE,
      }
    }

    return {
      path: normalizedPath,
      name,
      extension,
      kind: "image",
      mimeType: imageMimeType,
      previewUrl,
      size: fileStats.size,
    }
  }

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
