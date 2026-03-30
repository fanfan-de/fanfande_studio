import { tool, type ToolSet } from "ai"
import * as Agent from "#agent/agent.ts"
import { Instance } from "#project/instance.ts"
import * as ToolRegistry from "#tool/registry.ts"

export type ResolveToolsInput = {
  agent: Agent.AgentInfo
  sessionID: string
  messageID: string
  abort: AbortSignal
}

export async function resolveTools(input: ResolveToolsInput): Promise<ToolSet> {
  const registry = await ToolRegistry.tools()
  const tools: ToolSet = {}

  for (const item of registry) {
    const runtime = await item.init({ agent: input.agent })
    tools[item.id] = tool({
      description: runtime.description,
      inputSchema: runtime.parameters,
      execute: async (args) => {
        const result = await runtime.execute(args, {
          sessionID: input.sessionID,
          messageID: input.messageID,
          cwd: Instance.directory,
          worktree: Instance.worktree,
          abort: input.abort,
        })
        return result.output
      },
    })
  }

  return tools
}
