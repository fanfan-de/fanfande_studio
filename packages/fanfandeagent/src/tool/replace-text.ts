import z from "zod"
import * as Tool from "#tool/tool.ts"
import { readTextFile, resolveToolPath, toDisplayPath, writeTextFile } from "#tool/shared.ts"

export const ReplaceTextTool = Tool.define(
  "replace-text",
  async () => {
    return {
      description: "Replace text inside an existing file.",
      parameters: z.object({
        path: z.string().min(1).describe("Absolute or project-relative file path."),
        search: z.string().min(1).describe("Exact text to find."),
        replace: z.string().describe("Replacement text."),
        all: z.boolean().optional().describe("Replace every occurrence instead of just the first one."),
      }),
      execute: async (parameters) => {
        const resolved = resolveToolPath(parameters.path)
        const original = await readTextFile(parameters.path)

        let updated = original
        let count = 0

        if (parameters.all) {
          count = original.split(parameters.search).length - 1
          updated = original.split(parameters.search).join(parameters.replace)
        } else {
          const index = original.indexOf(parameters.search)
          if (index === -1) {
            throw new Error(`Text was not found in ${toDisplayPath(resolved)}.`)
          }

          updated = original.slice(0, index) + parameters.replace + original.slice(index + parameters.search.length)
          count = 1
        }

        if (count === 0) {
          throw new Error(`Text was not found in ${toDisplayPath(resolved)}.`)
        }

        await writeTextFile(parameters.path, updated)

        return {
          title: `Updated ${toDisplayPath(resolved)}`,
          output: `Replaced ${count} occurrence(s) in ${toDisplayPath(resolved)}.`,
        }
      },
    }
  },
)
