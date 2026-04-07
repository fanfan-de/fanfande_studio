import z from "zod"
import * as Tool from "#tool/tool.ts"
import { formatLineRange, readTextFile, resolveToolPath, toDisplayPath } from "#tool/shared.ts"

export const ReadFileTool = Tool.define(
  "read-file",
  async () => {
    return {
      title: "Read File",
      description: "Read a text file or a line range from the current project.",
      parameters: z.object({
        path: z.string().min(1).describe("Absolute or project-relative file path."),
        startLine: z.number().int().positive().optional().describe("First line to read, starting at 1."),
        endLine: z.number().int().positive().optional().describe("Last line to read, starting at 1."),
        maxLines: z.number().int().positive().max(2000).optional().describe("Maximum lines to return when no range is provided."),
      }).refine((value) => {
        if (value.startLine == null || value.endLine == null) return true
        return value.endLine >= value.startLine
      }, {
        message: "endLine must be greater than or equal to startLine.",
        path: ["endLine"],
      }),
      describeApproval: (parameters, ctx) => {
        const resolved = resolveToolPath(parameters.path)
        const lines = parameters.startLine != null
          ? parameters.endLine != null
            ? `lines ${parameters.startLine}-${parameters.endLine}`
            : `starting at line ${parameters.startLine}`
          : "file contents"

        return {
          title: `Read ${toDisplayPath(resolved)}`,
          summary: `Read ${lines} from ${toDisplayPath(resolved)}.`,
          details: {
            paths: [toDisplayPath(resolved)],
            workdir: ctx.cwd,
          },
        }
      },
      execute: async (parameters) => {
        const resolved = resolveToolPath(parameters.path)
        const text = await readTextFile(parameters.path)
        const maxLines = parameters.maxLines ?? 250
        const startLine = parameters.startLine ?? 1
        const endLine = parameters.endLine ?? (parameters.startLine ? parameters.startLine + maxLines - 1 : maxLines)
        const excerpt = formatLineRange(text, startLine, endLine)
        const truncated = excerpt.totalLines > excerpt.endLine

        return {
          title: `Read ${toDisplayPath(resolved)}`,
          text: [
            `Path: ${toDisplayPath(resolved)}`,
            `Lines: ${excerpt.startLine}-${excerpt.endLine} of ${excerpt.totalLines}`,
            excerpt.outOfRange ? "Note: the requested line range starts beyond the end of the file." : undefined,
            truncated ? "Note: output was truncated. Use startLine/endLine to inspect more." : undefined,
            "",
            excerpt.rendered || "(empty file)",
          ].filter(Boolean).join("\n"),
        }
      },
    }
  },
  {
    title: "Read File",
    capabilities: {
      kind: "read",
      readOnly: true,
      destructive: false,
      concurrency: "safe",
    },
  },
)
