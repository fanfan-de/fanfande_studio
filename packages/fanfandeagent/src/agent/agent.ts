import { Instance } from "@/project/instance"
import z from "zod"

/**
 * Agent是对编排的抽象，plan，build，research
 */
export namespace Agent {
  export const Info = z
    .object({
      name: z.string(),
      description: z.string().optional(),
      mode: z.enum(["subagent", "primary", "all"]),
      native: z.boolean().optional(),
      hidden: z.boolean().optional(),
      topP: z.number().optional(),
      temperature: z.number().optional(),
      color: z.string().optional(),
      //permission: PermissionNext.Ruleset,
      model: z
        .object({
          modelID: z.string(),
          providerID: z.string(),
        })
        .optional(),
      prompt: z.string().optional(),
      options: z.record(z.string(), z.any()),
      steps: z.number().int().positive().optional(),
    })
    .meta({ ref: "AgentInfo", description: "Information about the agent" })

  export type Info = z.infer<typeof Info>


  const state = Instance.state(async () => {

    const result: Record<string, Info> = {
      plan: {
        name: "plan",
        description: "Plan mode. Disallows all edit tools.",
        mode: "primary",
        native: true,
        options: {},
        steps:Infinity
      },
    }

    return result
  })


  export async function get(agent: string) {
    return state().then((x) => x[agent])
  }


}