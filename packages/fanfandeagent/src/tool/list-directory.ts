import path from "node:path"
import { readdir, stat } from "node:fs/promises"
import z from "zod"
import * as Tool from "#tool/tool.ts"
import { resolveToolPath, toDisplayPath } from "#tool/shared.ts"

type Entry = {
  path: string
  depth: number
  isDirectory: boolean
}

async function readEntries(
  directory: string,
  depth: number,
  maxDepth: number,
  includeHidden: boolean,
  limit: number,
  output: Entry[],
) {
  if (output.length >= limit) return
  if (depth > maxDepth) return

  const items = await readdir(directory, { withFileTypes: true })
  for (const item of items) {
    if (output.length >= limit) break
    if (!includeHidden && item.name.startsWith(".")) continue

    const fullPath = path.join(directory, item.name)
    output.push({
      path: fullPath,
      depth,
      isDirectory: item.isDirectory(),
    })

    if (item.isDirectory()) {
      await readEntries(fullPath, depth + 1, maxDepth, includeHidden, limit, output)
    }
  }
}

export const ListDirectoryTool = Tool.define(
  "list-directory",
  async () => {
    return {
      title: "List Directory",
      description: "List files and folders inside the current project.",
      parameters: z.object({
        path: z.string().optional().describe("Directory to list. Defaults to the project root."),
        recursive: z.boolean().optional().describe("Whether to walk nested directories."),
        maxDepth: z.number().int().nonnegative().optional().describe("Maximum recursion depth."),
        maxEntries: z.number().int().positive().max(5000).optional().describe("Maximum number of entries to return."),
        includeHidden: z.boolean().optional().describe("Include dotfiles and hidden folders."),
      }),
      execute: async (parameters) => {
        const resolved = resolveToolPath(parameters.path ?? ".")
        const stats = await stat(resolved)

        if (!stats.isDirectory()) {
          return {
            title: `File info ${toDisplayPath(resolved)}`,
            text: `${toDisplayPath(resolved)} is a file.`,
          }
        }

        const maxDepth = parameters.recursive ? (parameters.maxDepth ?? 3) : 0
        const maxEntries = parameters.maxEntries ?? 200
        const entries: Entry[] = []
        await readEntries(resolved, 0, maxDepth, parameters.includeHidden ?? false, maxEntries, entries)

        const lines = entries.map((entry) => {
          const rel = toDisplayPath(entry.path)
          const indent = "  ".repeat(entry.depth)
          return `${indent}${entry.isDirectory ? "[dir]" : "[file]"} ${rel}`
        })

        if (entries.length >= maxEntries) {
          lines.push(`... truncated after ${maxEntries} entries`)
        }

        return {
          title: `List ${toDisplayPath(resolved)}`,
          text: lines.length > 0 ? lines.join("\n") : "(empty directory)",
        }
      },
    }
  },
  {
    title: "List Directory",
    capabilities: {
      kind: "read",
      readOnly: true,
      destructive: false,
      concurrency: "safe",
    },
  },
)
