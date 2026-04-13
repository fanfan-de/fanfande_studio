import z from "zod"
import { Instance } from "#project/instance.ts"
import * as Skill from "#skill/skill.ts"
import * as Tool from "#tool/tool.ts"

export const LoadSkillTool = Tool.define(
  "load-skill",
  async () => {
    return {
      title: "Load Skill",
      description: "Load a skill's SKILL.md instructions for the current turn.",
      parameters: z.object({
        id: z.string().min(1).describe("Skill id to load, for example project:review or user:notes."),
      }),
      execute: async ({ id }, ctx) => {
        const allowedSkillIDs = Skill.getAllowedSkillIDs(ctx.sessionID)
        const skill = await Skill.loadByID(Instance.worktree, id, {
          allowedSkillIDs,
        })

        if (!skill) {
          throw new Error(`Skill '${id}' was not found or is not available for this turn.`)
        }

        Skill.markSkillLoaded(ctx.sessionID, skill.id)

        return {
          title: `Loaded skill ${skill.name}`,
          text: [
            `Skill ID: ${skill.id}`,
            `Name: ${skill.name}`,
            `Scope: ${skill.scope}`,
            `Description: ${skill.description}`,
            `Path: ${skill.path}`,
            "",
            `<skill id="${skill.id}" name="${skill.name}" scope="${skill.scope}">`,
            skill.body,
            `</skill>`,
          ].join("\n"),
        }
      },
    }
  },
  {
    title: "Load Skill",
    aliases: ["load_skill"],
    capabilities: {
      kind: "read",
      readOnly: true,
      destructive: false,
      concurrency: "safe",
    },
  },
)
