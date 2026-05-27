import { posix as path } from "node:path"
import z from "zod"
import { Instance } from "#project/instance.ts"
import {
  listDirectoryEntries,
  readTextFile,
  resolveToolPath,
  statResolvedPath,
  toDisplayPath,
  walkProjectEntries,
  workspacePathBasename,
} from "#tool/shared.ts"

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

type WorkspaceDirectoryEntryResult = {
  path: string
  name: string
  kind: "directory" | "file"
  extension: string | null
  hasChildren: boolean
}

export const WorkspaceDirectoryQuery = z.object({
  directory: z.string().min(1),
  path: z.string().optional(),
})

export const WorkspaceFileQuery = z.object({
  directory: z.string().min(1),
  path: z.string().min(1),
})

export const WorkspaceSearchQuery = z.object({
  directory: z.string().min(1),
  query: z.string().optional(),
})

function getFileExtension(fileName: string) {
  const extension = path.extname(fileName).slice(1).toLowerCase()
  return extension.length > 0 ? extension : null
}

export async function searchWorkspaceFiles(input: z.infer<typeof WorkspaceSearchQuery>) {
  const normalizedQuery = input.query?.trim().toLowerCase()
  if (!normalizedQuery) return []

  return Instance.provide({
    directory: input.directory,
    fn: async () => {
      const root = resolveToolPath(".")
      const results: Array<{ path: string; absolutePath?: string; name: string; extension: string | null }> = []
      await walkProjectEntries(root, {
        includeHidden: false,
        visit: (entry) => {
          if (entry.kind !== "file") return true
          const name = workspacePathBasename(entry.path)
          if (!name.toLowerCase().includes(normalizedQuery)) return true
          results.push({
            path: entry.displayPath,
            absolutePath: entry.path,
            name,
            extension: getFileExtension(name),
          })
          return results.length < SEARCH_RESULT_LIMIT
        },
      })
      return results
    },
  })
}

export async function listWorkspaceDirectory(input: z.infer<typeof WorkspaceDirectoryQuery>) {
  return Instance.provide({
    directory: input.directory,
    fn: async () => {
      const resolved = resolveToolPath(input.path?.trim() || ".")
      const stats = await statResolvedPath(resolved)
      if (!stats.isDirectory()) throw new Error("Requested workspace path is not a directory.")

      const entries: WorkspaceDirectoryEntryResult[] = []
      for (const entry of await listDirectoryEntries(resolved)) {
        if (entry.name === ".git") continue
        if (entry.kind === "directory") {
          entries.push({
            path: entry.displayPath,
            name: entry.name,
            kind: "directory",
            extension: null,
            hasChildren: true,
          })
          continue
        }
        entries.push({
          path: entry.displayPath,
          name: entry.name,
          kind: "file",
          extension: getFileExtension(entry.name),
          hasChildren: false,
        })
      }

      entries.sort((left, right) => {
        if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1
        return left.name.localeCompare(right.name, undefined, {
          numeric: true,
          sensitivity: "base",
        })
      })
      return entries
    },
  })
}

export async function readWorkspaceFile(input: z.infer<typeof WorkspaceFileQuery>) {
  return Instance.provide({
    directory: input.directory,
    fn: async () => {
      const resolved = resolveToolPath(input.path)
      const stats = await statResolvedPath(resolved)
      if (!stats.isFile()) throw new Error("Requested workspace path is not a file.")

      const name = workspacePathBasename(resolved)
      const extension = getFileExtension(name)
      const normalizedPath = toDisplayPath(resolved)
      if (!extension || !TEXT_FILE_EXTENSIONS.has(extension)) {
        return {
          path: normalizedPath,
          name,
          extension,
          kind: "unsupported" as const,
          unsupportedReason: UNSUPPORTED_FILE_MESSAGE,
        }
      }

      return {
        path: normalizedPath,
        name,
        extension,
        kind: "text" as const,
        content: await readTextFile(input.path),
      }
    },
  })
}
