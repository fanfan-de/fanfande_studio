import z from "zod"
import * as Tool from "#tool/tool.ts"
import { resolveToolPath, toDisplayPath, writeTextFile } from "#tool/shared.ts"

export const WriteFileTool = Tool.define(
  "write-file",
  async () => {
    return {
      description: "Write a complete text file inside the current project.",
      parameters: z.object({
        path: z.string().min(1).describe("Absolute or project-relative file path."),
        content: z.string().describe("Full file contents to write."),
      }),
      execute: async (parameters) => {
        const resolved = resolveToolPath(parameters.path)
        const result = await writeTextFile(parameters.path, parameters.content)

        return {
          title: `Wrote ${toDisplayPath(resolved)}`,
          output: `Wrote ${result.bytes} bytes to ${toDisplayPath(resolved)}.`,
        }
      },
    }
  },
)
