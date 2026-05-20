import { tool, type ToolSet } from "ai"
import * as Agent from "#agent/agent.ts"
import * as Config from "#config/config.ts"
import * as Tool from "#tool/tool.ts"
import {
  createToolExecution,
  getToolAccessFailure,
  readOnlyToolsOnlyForSession,
} from "#tool/execution.ts"
import * as ToolRegistry from "#tool/registry.ts"

export type ResolveToolsInput = {
  agent: Agent.AgentInfo
  sessionID: string
  messageID: string
  abort: AbortSignal
}

const PROVIDER_SAFE_TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/

function isProviderSafeToolName(name: string) {
  return PROVIDER_SAFE_TOOL_NAME_PATTERN.test(name)
}

export async function resolveTools(input: ResolveToolsInput): Promise<ToolSet> {
  // Load registered tools and build the ToolSet expected by the AI SDK.
  const [registry, builtinRegistry, globalToolSelection] = await Promise.all([
    ToolRegistry.tools(),
    ToolRegistry.builtinTools(),
    Config.getToolSelection(Config.GLOBAL_CONFIG_ID),
  ])
  const builtinToolIDs = new Set(builtinRegistry.map((tool) => tool.id))
  const readOnlyToolsOnly = readOnlyToolsOnlyForSession(input.agent, input.sessionID)
  const tools: ToolSet = {}

  for (const item of registry) {
    if (getToolAccessFailure({
      item,
      agent: input.agent,
      builtinToolIDs,
      globalToolSelection,
      readOnlyToolsOnly,
    })) {
      continue
    }

    const execution = await createToolExecution({
      item,
      agent: input.agent,
      sessionID: input.sessionID,
      messageID: input.messageID,
      abort: input.abort,
    })

    // Wrap the runtime as a model-facing tool with shared permission checks.
    const resolvedTool = tool<any, Tool.ToolOutput>({
      title: execution.title,
      description: execution.description,
      inputSchema: execution.parameters,
      needsApproval: async (args, options) => {
        // Expose whether this call must be approved before execution.
        return execution.needsApproval(args, options.toolCallId)
      },
      execute: async (args, options) => {
        return execution.execute(args, { toolCallID: options.toolCallId })
      },
      toModelOutput: async ({ output }) => {
        return execution.toModelOutput(output as Tool.ToolOutput)
      },
    })

    // Register only provider-safe names; OpenAI-compatible providers reject
    // function names outside /^[a-zA-Z0-9_-]+$/ before the stream starts.
    let registeredNames = 0
    for (const name of [item.id, ...(item.aliases ?? [])]) {
      if (!isProviderSafeToolName(name)) continue
      if (tools[name]) {
        throw new Error(`Duplicate resolved tool name "${name}".`)
      }

      tools[name] = resolvedTool
      registeredNames += 1
    }

    if (registeredNames === 0) {
      throw new Error(`Tool "${item.id}" does not expose a provider-safe name.`)
    }
  }
  return tools
}
