import { tool, type ToolSet } from "ai"
import * as Agent from "#agent/agent.ts"
import { Instance } from "#project/instance.ts"
import * as Tool from "#tool/tool.ts"
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
    const title = runtime.title ?? item.title ?? item.id

    const resolvedTool = tool<any, Tool.ToolOutput>({
      title,
      description: runtime.description,
      inputSchema: runtime.parameters,
      execute: async (args, options) => {
        return Tool.normalizeToolOutput(await runtime.execute(args, {
          sessionID: input.sessionID,
          messageID: input.messageID,
          cwd: Instance.directory,
          worktree: Instance.worktree,
          abort: options.abortSignal ?? input.abort,
          toolCallID: options.toolCallId,
        }))
      },
      toModelOutput: async ({ output }) => {
        const normalized = Tool.normalizeToolOutput(output as Tool.ToolOutput)
        const modelOutput = runtime.toModelOutput
          ? await runtime.toModelOutput(normalized)
          : normalized.text

        return Tool.normalizeToolModelOutput(modelOutput)
      },
    })

    for (const name of [item.id, ...(item.aliases ?? [])]) {
      if (tools[name]) {
        throw new Error(`Duplicate resolved tool name "${name}".`)
      }

      tools[name] = resolvedTool
    }
  }

  return tools
}
