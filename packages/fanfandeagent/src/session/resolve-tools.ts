import { tool, type ToolSet } from "ai"
import * as Agent from "#agent/agent.ts"
import { Instance } from "#project/instance.ts"
import * as Permission from "#permission/permission.ts"
import * as Tool from "#tool/tool.ts"
import * as ToolRegistry from "#tool/registry.ts"

export type ResolveToolsInput = {
  agent: Agent.AgentInfo
  sessionID: string
  messageID: string
  permissionMode?: "default" | "full-access"
  abort: AbortSignal
}

export async function resolveTools(input: ResolveToolsInput): Promise<ToolSet> {
  // Load registered tools and build the ToolSet expected by the AI SDK.
  const registry = await ToolRegistry.tools()
  const tools: ToolSet = {}

  for (const item of registry) {
    // Initialize the tool runtime for the current agent.
    const runtime = await item.init({ agent: input.agent })
    const title = runtime.title ?? item.title ?? item.id
    // Reuse permission decisions within the same tool call.
    const decisionCache = new Map<string, Awaited<ReturnType<typeof Permission.evaluate>>>()

    const evaluatePermission = async (args: Record<string, unknown>, toolCallID?: string) => {
      const cached = toolCallID ? decisionCache.get(toolCallID) : undefined
      if (cached) return cached

      // Ask the permission layer to evaluate this tool call with full context.
      const decision = await Permission.evaluate({
        sessionID: input.sessionID,
        messageID: input.messageID,
        toolCallID,
        projectID: Instance.project.id,
        agent: input.agent.name,
        cwd: Instance.directory,
        worktree: Instance.worktree,
        permissionMode: input.permissionMode ?? "default",
        tool: {
          id: item.id,
          kind: item.capabilities?.kind ?? "other",
          readOnly: item.capabilities?.readOnly ?? false,
          destructive: item.capabilities?.destructive ?? false,
          needsShell: item.capabilities?.needsShell ?? false,
        },
        input: args,
      })

      // Cache the decision only when the call has a stable toolCallID.
      if (toolCallID) {
        decisionCache.set(toolCallID, decision)
      }
      return decision
    }

    // Wrap the runtime as a model-facing tool with shared permission checks.
    const resolvedTool = tool<any, Tool.ToolOutput>({
      title,
      description: runtime.description,
      inputSchema: runtime.parameters,
      needsApproval: async (args, options) => {
        // Expose whether this call must be approved before execution.
        const decision = await evaluatePermission(args as Record<string, unknown>, options.toolCallId)
        return decision.action === "ask"
      },
      execute: async (args, options) => {
        const decision = await evaluatePermission(args as Record<string, unknown>, options.toolCallId)

        // Block denied or not-yet-approved calls before running the tool.
        if (decision.action === "deny") {
          throw new Error(decision.reason)
        }
        if (decision.action === "ask") {
          throw new Error("Tool execution requires approval before it can continue.")
        }

        // Execute with shared session context and normalize the result shape.
        return Tool.normalizeToolOutput(
          await runtime.execute(args, {
            sessionID: input.sessionID,
            messageID: input.messageID,
            cwd: Instance.directory,
            worktree: Instance.worktree,
            abort: options.abortSignal ?? input.abort,
            toolCallID: options.toolCallId,
          }),
        )
      },
      toModelOutput: async ({ output }) => {
        // Normalize tool output first, then let the runtime customize it if needed.
        const normalized = Tool.normalizeToolOutput(output as Tool.ToolOutput)
        const modelOutput = runtime.toModelOutput
          ? await runtime.toModelOutput(normalized)
          : normalized.text

        // Normalize again so the model always receives a stable output format.
        return Tool.normalizeToolModelOutput(modelOutput)
      },
    })

    // Register the tool by its id and aliases, while guarding against duplicates.
    for (const name of [item.id, ...(item.aliases ?? [])]) {
      if (tools[name]) {
        throw new Error(`Duplicate resolved tool name "${name}".`)
      }

      tools[name] = resolvedTool
    }
  }
  return tools
}
