import {Instance}  from "#project/instance.ts"
import z from "zod"

export const AgentInfo = z
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

export type AgentInfo = z.infer<typeof AgentInfo>


const state = Instance.state(async () => {
  const result: Record<string, AgentInfo> = {
    plan: {
      name: "plan",
      description: "Plan mode. Disallows all edit tools.",
      mode: "primary",
      native: true,
      options: {},
      steps: Infinity
    }
  }

  return result
})

/**
 * 根据agent的名称（build，plan），返回state中维护的agent.info的实例
 * @param agent 
 * @returns 
 */
export async function get(agent:string): Promise<AgentInfo|undefined>{
  return state().then((x) => x[agent])
}

//默认agent
export async function defaultAgent() {
  //const cfg = await Config.get()
  //const agents = await state()

  // if (cfg.default_agent) {
  //   const agent = agents[cfg.default_agent]
  //   if (!agent) throw new Error(`default agent "${cfg.default_agent}" not found`)
  //   if (agent.mode === "subagent") throw new Error(`default agent "${cfg.default_agent}" is a subagent`)
  //   if (agent.hidden === true) throw new Error(`default agent "${cfg.default_agent}" is hidden`)
  //   return agent.name
  // }

  // const primaryVisible = Object.values(agents).find((a) => a.mode !== "subagent" && a.hidden !== true)
  // if (!primaryVisible) throw new Error("no primary visible agent found")
  // return primaryVisible.name
}


// export async function list() {
//   const cfg = await Config.get()
//   return pipe(
//     await state(),
//     values(),
//     sortBy([(x) => (cfg.default_agent ? x.name === cfg.default_agent : x.name === "build"), "desc"]),
//   )
// }




