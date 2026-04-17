import path from "node:path"
import { stat } from "node:fs/promises"
import z from "zod"
import * as Tool from "#tool/tool.ts"
import { resolveToolPath, toDisplayPath, walkProjectEntries } from "#tool/shared.ts"

type GlobMatch = {
  path: string
  kind: "file" | "directory"
}

function matchesRequestedKind(
  requested: "files" | "dirs" | "all",
  actual: GlobMatch["kind"],
) {
  if (requested === "all") return true
  if (requested === "files") return actual === "file"
  return actual === "directory"
}

function formatGlobMatch(match: GlobMatch) {
  return `${match.kind === "directory" ? "[dir]" : "[file]"} ${match.path}`
}

export const GlobTool = Tool.define(
  "glob",
  async () => {
    return {
      title: "Glob",
      description: "Match file and directory paths inside the current project using a glob pattern.",
      parameters: z.object({
        pattern: z.string().min(1).describe("Glob pattern to match relative paths against."),
        path: z.string().optional().describe("Directory or file to search from. Defaults to the project root."),
        type: z.enum(["files", "dirs", "all"]).optional().describe("Which entry types to return."),
        maxResults: z.number().int().positive().max(1000).optional().describe("Maximum number of matches to return."),
        includeHidden: z.boolean().optional().describe("Include dotfiles and hidden folders."),
      }),
      describeApproval: (parameters, ctx) => {
        const resolved = resolveToolPath(parameters.path ?? ".")
        return {
          title: `Glob ${parameters.pattern}`,
          summary: `Match ${toDisplayPath(resolved)} against the glob pattern "${parameters.pattern}".`,
          details: {
            paths: [toDisplayPath(resolved)],
            workdir: ctx.cwd,
          },
        }
      },
      execute: async (parameters) => {
        const resolved = resolveToolPath(parameters.path ?? ".")
        const info = await stat(resolved)
        const requestedType = parameters.type ?? "files"
        const maxResults = parameters.maxResults ?? 200
        const matches: GlobMatch[] = []
        let truncated = false

        const pushMatch = (candidate: GlobMatch) => {
          if (matches.length >= maxResults) {
            truncated = true
            return false
          }

          matches.push(candidate)
          return true
        }

        const maybeMatch = (relativePath: string, candidate: GlobMatch) => {
          if (!matchesRequestedKind(requestedType, candidate.kind)) return true
          if (!path.matchesGlob(relativePath, parameters.pattern)) return true
          return pushMatch(candidate)
        }

        if (info.isFile()) {
          maybeMatch(path.basename(resolved), {
            path: toDisplayPath(resolved),
            kind: "file",
          })
        } else {
          await walkProjectEntries(resolved, {
            includeHidden: parameters.includeHidden ?? false,
            visit: (entry) => {
              return maybeMatch(entry.relativePath, {
                path: entry.displayPath,
                kind: entry.kind,
              })
            },
          })
        }

        const lines = [
          `Path: ${toDisplayPath(resolved)}`,
          `Pattern: ${parameters.pattern}`,
          `Type: ${requestedType}`,
          `Matches: ${matches.length}`,
          truncated ? `Note: output was truncated after ${maxResults} matches.` : undefined,
          "",
          matches.length > 0
            ? matches.map(formatGlobMatch).join("\n")
            : `No paths matched "${parameters.pattern}".`,
        ].filter(Boolean)

        return {
          title: `Glob ${parameters.pattern}`,
          text: lines.join("\n"),
          data: {
            matches,
            truncated,
          },
        }
      },
    }
  },
  {
    title: "Glob",
    aliases: ["Glob"],
    capabilities: {
      kind: "search",
      readOnly: true,
      destructive: false,
      concurrency: "safe",
    },
  },
)
