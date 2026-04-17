import z from "zod"
import * as Tool from "#tool/tool.ts"
import { prepareWriteTextFile, writePreparedTextFile } from "#tool/shared.ts"

export const WriteFileTool = Tool.define(
  "write-file",
  async () => {
    return {
      title: "Write File",
      description: "Write a complete text file inside the current project.",
      parameters: z.object({
        path: z.string().min(1).describe("Absolute or project-relative file path."),
        content: z.string().describe("Full file contents to write."),
      }),
      describeApproval: async (parameters, ctx) => {
        const target = await prepareWriteTextFile(parameters.path)
        return {
          title: `Write ${target.displayPath}`,
          summary: target.exists
            ? `Overwrite ${target.displayPath} with new file contents.`
            : `Create ${target.displayPath} with new file contents.`,
          details: {
            paths: [target.displayPath],
            workdir: ctx.cwd,
          },
        }
      },
      execute: async (parameters) => {
        const target = await prepareWriteTextFile(parameters.path)
        const result = await writePreparedTextFile(target, parameters.content)

        return {
          title: `Wrote ${target.displayPath}`,
          text: `Wrote ${result.bytes} bytes to ${target.displayPath}.`,
        }
      },
    }
  },
  {
    title: "Write File",
    capabilities: {
      kind: "write",
      readOnly: false,
      destructive: true,
      concurrency: "exclusive",
    },
  },
)
