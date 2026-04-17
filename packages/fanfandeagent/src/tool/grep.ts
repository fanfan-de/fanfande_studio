import path from "node:path"
import { stat } from "node:fs/promises"
import z from "zod"
import * as Tool from "#tool/tool.ts"
import { readSearchableTextFile, resolveToolPath, toDisplayPath, walkProjectEntries } from "#tool/shared.ts"

type GrepHit = {
  path: string
  line: number
  column: number
  text: string
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function createMatcher(
  pattern: string,
  options: {
    literal: boolean
    caseSensitive: boolean
  },
) {
  const source = options.literal ? escapeRegExp(pattern) : pattern
  return new RegExp(source, options.caseSensitive ? "g" : "gi")
}

function findMatchColumn(line: string, matcher: RegExp): number | undefined {
  matcher.lastIndex = 0
  const match = matcher.exec(line)
  if (!match) return undefined
  return match.index + 1
}

function formatHit(hit: GrepHit) {
  return `${hit.path}:${hit.line}:${hit.column}: ${hit.text}`
}

export const GrepTool = Tool.define(
  "grep",
  async () => {
    return {
      title: "Grep",
      description: "Search file contents inside the current project using a regex or literal pattern.",
      parameters: z.object({
        pattern: z.string().min(1).describe("Regex or literal pattern to search for."),
        path: z.string().optional().describe("Directory or file to search. Defaults to the project root."),
        glob: z.string().optional().describe("Glob pattern used to limit which files are searched."),
        literal: z.boolean().optional().describe("Treat the pattern as literal text instead of a regex."),
        caseSensitive: z.boolean().optional().describe("Match case exactly."),
        maxResults: z.number().int().positive().max(500).optional().describe("Maximum number of matching lines to return."),
        includeHidden: z.boolean().optional().describe("Include dotfiles and hidden folders."),
      }),
      validate: (parameters) => {
        if (parameters.literal) return

        try {
          createMatcher(parameters.pattern, {
            literal: false,
            caseSensitive: parameters.caseSensitive ?? false,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return `Invalid grep pattern: ${message}`
        }
      },
      describeApproval: (parameters, ctx) => {
        const resolved = resolveToolPath(parameters.path ?? ".")
        return {
          title: `Grep ${parameters.pattern}`,
          summary: `Search ${toDisplayPath(resolved)} for matches of "${parameters.pattern}".`,
          details: {
            paths: [toDisplayPath(resolved)],
            workdir: ctx.cwd,
          },
        }
      },
      execute: async (parameters) => {
        const resolved = resolveToolPath(parameters.path ?? ".")
        const info = await stat(resolved)
        const matcher = createMatcher(parameters.pattern, {
          literal: parameters.literal ?? false,
          caseSensitive: parameters.caseSensitive ?? false,
        })
        const filePattern = parameters.glob ?? "**/*"
        const maxResults = parameters.maxResults ?? 50
        const hits: GrepHit[] = []
        let truncated = false

        const scanFile = async (filePath: string, relativePath: string, displayPath: string) => {
          if (!path.matchesGlob(relativePath, filePattern)) return true

          const text = await readSearchableTextFile(filePath)
          if (typeof text !== "string") return true

          const lines = text.split(/\r?\n/)
          for (let index = 0; index < lines.length; index++) {
            const line = lines[index]!
            const column = findMatchColumn(line, matcher)
            if (!column) continue

            hits.push({
              path: displayPath,
              line: index + 1,
              column,
              text: line.trim(),
            })

            if (hits.length >= maxResults) {
              truncated = true
              return false
            }
          }

          return true
        }

        if (info.isFile()) {
          await scanFile(resolved, path.basename(resolved), toDisplayPath(resolved))
        } else {
          await walkProjectEntries(resolved, {
            includeHidden: parameters.includeHidden ?? false,
            visit: (entry) => {
              if (entry.kind !== "file") return true
              return scanFile(entry.path, entry.relativePath, entry.displayPath)
            },
          })
        }

        const lines = [
          `Path: ${toDisplayPath(resolved)}`,
          `Pattern: ${parameters.pattern}`,
          `Mode: ${parameters.literal ? "literal" : "regex"}`,
          `Glob: ${filePattern}`,
          `Matches: ${hits.length}`,
          truncated ? `Note: output was truncated after ${maxResults} matches.` : undefined,
          "",
          hits.length > 0
            ? hits.map(formatHit).join("\n")
            : `No matches found for "${parameters.pattern}".`,
        ].filter(Boolean)

        return {
          title: `Grep ${parameters.pattern}`,
          text: lines.join("\n"),
          data: {
            hits,
            truncated,
          },
        }
      },
    }
  },
  {
    title: "Grep",
    aliases: ["Grep"],
    capabilities: {
      kind: "search",
      readOnly: true,
      destructive: false,
      concurrency: "safe",
    },
  },
)
