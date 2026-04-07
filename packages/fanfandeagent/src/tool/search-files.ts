import path from "node:path"
import { readFile } from "node:fs/promises"
import z from "zod"
import * as Tool from "#tool/tool.ts"
import { resolveToolPath, toDisplayPath } from "#tool/shared.ts"

type Hit = {
  file: string
  line: number
  text: string
}

function formatHit(hit: Hit) {
  return `${hit.file}:${hit.line}: ${hit.text}`
}

function normalizeText(text: string, caseSensitive: boolean) {
  return caseSensitive ? text : text.toLowerCase()
}

export const SearchFilesTool = Tool.define(
  "search-files",
  async () => {
    return {
      title: "Search Files",
      description: "Search text across project files.",
      parameters: z.object({
        query: z.string().min(1).describe("Text to search for."),
        path: z.string().optional().describe("Directory or file to search. Defaults to the project root."),
        glob: z.string().optional().describe("Glob pattern used when searching a directory."),
        caseSensitive: z.boolean().optional().describe("Match case exactly."),
        maxResults: z.number().int().positive().max(500).optional().describe("Maximum number of matches to return."),
        includeHidden: z.boolean().optional().describe("Include dotfiles and hidden folders."),
      }),
      describeApproval: (parameters, ctx) => {
        const resolved = resolveToolPath(parameters.path ?? ".")
        return {
          title: `Search for ${parameters.query}`,
          summary: `Search ${toDisplayPath(resolved)} for matches of "${parameters.query}".`,
          details: {
            paths: [toDisplayPath(resolved)],
            workdir: ctx.cwd,
          },
        }
      },
      execute: async (parameters) => {
        const basePath = resolveToolPath(parameters.path ?? ".")
        const stats = await Bun.file(basePath).stat().catch(() => undefined)
        const caseSensitive = parameters.caseSensitive ?? false
        const needle = normalizeText(parameters.query, caseSensitive)
        const maxResults = parameters.maxResults ?? 20
        const hits: Hit[] = []

        const scanFile = async (filePath: string) => {
          if (hits.length >= maxResults) return
          const text = await readFile(filePath, "utf8").catch(() => undefined)
          if (typeof text !== "string") return
          const fileName = toDisplayPath(filePath)
          const lines = text.split(/\r?\n/)

          for (let index = 0; index < lines.length; index++) {
            if (hits.length >= maxResults) break
            const line = lines[index]!
            const haystack = normalizeText(line, caseSensitive)
            if (!haystack.includes(needle)) continue

            hits.push({
              file: fileName,
              line: index + 1,
              text: line.trim(),
            })
          }
        }

        if (stats?.isFile()) {
          await scanFile(basePath)
        } else {
          const glob = new Bun.Glob(parameters.glob ?? "**/*")
          for await (const match of glob.scan({
            cwd: basePath,
            absolute: true,
            onlyFiles: true,
            dot: parameters.includeHidden ?? false,
          })) {
            if (hits.length >= maxResults) break
            const rel = path.relative(basePath, match)
            if (rel.split(path.sep).some((segment) => segment === ".git" || segment === "node_modules")) continue
            await scanFile(match)
          }
        }

        return {
          title: `Search ${parameters.query}`,
          text: hits.length > 0
            ? hits.map(formatHit).join("\n")
            : `No matches found for "${parameters.query}".`,
        }
      },
    }
  },
  {
    title: "Search Files",
    capabilities: {
      kind: "search",
      readOnly: true,
      destructive: false,
      concurrency: "safe",
    },
  },
)
