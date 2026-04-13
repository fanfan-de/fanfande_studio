import { dirname, relative } from "node:path"
import z from "zod"
import { Instance } from "#project/instance.ts"
import * as Skill from "#skill/skill.ts"
import * as Tool from "#tool/tool.ts"
import { formatLineRange } from "#tool/shared.ts"
import * as Filesystem from "#util/filesystem.ts"

export const ReadSkillResourceTool = Tool.define(
  "read-skill-resource",
  async () => {
    return {
      title: "Read Skill Resource",
      description: "Read a file referenced by a previously loaded skill.",
      parameters: z.object({
        id: z.string().min(1).describe("Skill id that owns the resource."),
        relativePath: z.string().min(1).describe("File path relative to the skill directory."),
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
      validate: ({ id }, ctx) => {
        if (!Skill.isSkillLoaded(ctx.sessionID, id)) {
          return `Load skill '${id}' with load-skill before reading its resources.`
        }
      },
      execute: async (parameters, ctx) => {
        const allowedSkillIDs = Skill.getAllowedSkillIDs(ctx.sessionID)
        const { skill, resourcePath } = await Skill.resolveResourcePath(
          Instance.worktree,
          parameters.id,
          parameters.relativePath,
          {
            allowedSkillIDs,
          },
        )

        const text = await Filesystem.readText(resourcePath)
        const maxLines = parameters.maxLines ?? 250
        const startLine = parameters.startLine ?? 1
        const endLine = parameters.endLine ?? (parameters.startLine ? parameters.startLine + maxLines - 1 : maxLines)
        const excerpt = formatLineRange(text, startLine, endLine)
        const truncated = excerpt.totalLines > excerpt.endLine
        const displayPath = relative(dirname(skill.path), resourcePath) || "."

        return {
          title: `Read ${displayPath} from ${skill.name}`,
          text: [
            `Skill ID: ${skill.id}`,
            `Skill: ${skill.name}`,
            `Resource: ${displayPath}`,
            `Path: ${resourcePath}`,
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
    title: "Read Skill Resource",
    aliases: ["read_skill_resource"],
    capabilities: {
      kind: "read",
      readOnly: true,
      destructive: false,
      concurrency: "safe",
    },
  },
)
