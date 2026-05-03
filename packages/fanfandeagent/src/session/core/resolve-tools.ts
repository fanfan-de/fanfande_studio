import { tool, type ToolSet } from "ai"
import * as Agent from "#agent/agent.ts"
import * as Config from "#config/config.ts"
import * as Session from "#session/core/session.ts"
import * as Identifier from "#id/id.ts"
import { Instance } from "#project/instance.ts"
import * as Permission from "#permission/permission.ts"
import * as ToolResultPersistence from "#session/support/tool-result-persistence.ts"
import * as Tool from "#tool/tool.ts"
import * as ToolRegistry from "#tool/registry.ts"

export type ResolveToolsInput = {
  agent: Agent.AgentInfo
  sessionID: string
  messageID: string
  abort: AbortSignal
}

function isToolAllowedForAgent(tool: Tool.ToolInfo, agent: Agent.AgentInfo) {
  const policy = agent.tools
  if (!policy) return true

  const names = [tool.id, ...(tool.aliases ?? [])]
  const matches = names
    .map((name) => policy[name])
    .filter((value): value is boolean => typeof value === "boolean")

  if (matches.includes(false)) {
    return false
  }

  const values = Object.values(policy)
  const hasAllowlistEntries = values.some((value) => value === true)
  if (hasAllowlistEntries) {
    return matches.includes(true)
  }

  if (values.length === 0) {
    return false
  }

  return true
}

function isToolGloballyEnabled(tool: Tool.ToolInfo, selection: Record<string, boolean>) {
  const matches = [tool.id, ...(tool.aliases ?? [])]
    .map((name) => selection[name])
    .filter((value): value is boolean => typeof value === "boolean")

  if (matches.includes(false)) {
    return false
  }

  return true
}

export async function resolveTools(input: ResolveToolsInput): Promise<ToolSet> {
  // Load registered tools and build the ToolSet expected by the AI SDK.
  const [registry, builtinRegistry, globalToolSelection] = await Promise.all([
    ToolRegistry.tools(),
    ToolRegistry.builtinTools(),
    Config.getToolSelection(Config.GLOBAL_CONFIG_ID),
  ])
  const builtinToolIDs = new Set(builtinRegistry.map((tool) => tool.id))
  const session = Session.DataBaseRead("sessions", input.sessionID) as Session.SessionInfo | null
  const sideChatReadOnly = Session.isSideChatSession(session)
  const tools: ToolSet = {}

  for (const item of registry) {
    if (builtinToolIDs.has(item.id) && !isToolGloballyEnabled(item, globalToolSelection.tools)) {
      continue
    }
    if (!isToolAllowedForAgent(item, input.agent)) {
      continue
    }
    if (sideChatReadOnly && item.capabilities?.readOnly !== true) {
      continue
    }

    // Initialize the tool runtime for the current agent.
    const runtime = await item.init({ agent: input.agent })
    const title = runtime.title ?? item.title ?? item.id
    // Reuse permission decisions within the same tool call.
    const decisionCache = new Map<string, Awaited<ReturnType<typeof Permission.evaluate>>>()

    const persistOutputIfLarge = async (
      output: Tool.ToolOutput,
      toolCallID: string,
    ): Promise<Tool.ToolOutput> => {
      const processed = await ToolResultPersistence.maybePersistToolResult({
        sessionID: input.sessionID,
        toolCallID,
        toolName: item.id,
        output: output.text,
        metadata: output.metadata ?? {},
        modelOutput: output,
        maxResultSizeChars: item.maxResultSizeChars,
      })

      if (!processed.persisted) {
        return output
      }

      return {
        ...output,
        text: processed.output,
        metadata: processed.metadata,
        data: undefined,
      }
    }

    const evaluatePermission = async (args: Record<string, unknown>, toolCallID?: string) => {
      const cached = toolCallID ? decisionCache.get(toolCallID) : undefined
      if (cached) return cached
      const runtimeContext: Tool.Context = {
        sessionID: input.sessionID,
        messageID: input.messageID,
        cwd: Instance.directory,
        worktree: Instance.worktree,
        abort: input.abort,
        toolCallID,
      }
      const intent = runtime.assessPermission
        ? await runtime.assessPermission(args, runtimeContext)
        : undefined

      // Ask the permission layer to evaluate this tool call with full context.
      const decision = await Permission.evaluate({
        sessionID: input.sessionID,
        messageID: input.messageID,
        toolCallID,
        projectID: Instance.project.id,
        agent: input.agent.name,
        cwd: Instance.directory,
        worktree: Instance.worktree,
        tool: {
          id: item.id,
          kind: item.capabilities?.kind ?? "other",
          readOnly: item.capabilities?.readOnly ?? false,
          destructive: item.capabilities?.destructive ?? false,
          needsShell: item.capabilities?.needsShell ?? false,
        },
        input: args,
        intent,
      })

      // Cache final decisions only. Approval-required calls can later become approved or denied.
      if (toolCallID && decision.action !== "ask") {
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
        const toolCallID = options.toolCallId ?? Identifier.ascending("tool")
        const decision = await evaluatePermission(args as Record<string, unknown>, toolCallID)

        // Block denied or not-yet-approved calls before running the tool.
        if (decision.action === "deny") {
          throw new Error(decision.reason)
        }
        if (decision.action === "ask") {
          throw new Error("Tool execution requires approval before it can continue.")
        }

        // Execute with shared session context and normalize the result shape.
        const output = Tool.normalizeToolOutput(
          await runtime.execute(args, {
            sessionID: input.sessionID,
            messageID: input.messageID,
            cwd: Instance.directory,
            worktree: Instance.worktree,
            abort: input.abort,
            toolCallID,
          }),
        )

        return persistOutputIfLarge(output, toolCallID)
      },
      toModelOutput: async ({ output }) => {
        // Normalize tool output first, then let the runtime customize it if needed.
        const normalized = Tool.normalizeToolOutput(output as Tool.ToolOutput)
        const persisted = ToolResultPersistence.readPersistedOutputMetadata(normalized.metadata)
        if (persisted) {
          return {
            type: "text" as const,
            value: persisted.replacement,
          }
        }

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
