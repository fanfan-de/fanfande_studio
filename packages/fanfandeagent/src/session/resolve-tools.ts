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
  abort: AbortSignal
}

export async function resolveTools(input: ResolveToolsInput): Promise<ToolSet> {
  // Load registered tools and build the ToolSet expected by the AI SDK.
  // 加载已注册工具，并组装成 AI SDK 所需的 ToolSet。
  const registry = await ToolRegistry.tools()
  const tools: ToolSet = {}

  for (const item of registry) {
    // Initialize the tool runtime for the current agent.
    // 基于当前 agent 初始化工具运行时。
    const runtime = await item.init({ agent: input.agent })
    const title = runtime.title ?? item.title ?? item.id
    // Reuse permission decisions within the same tool call.
    // 在同一次 tool call 内复用权限判断结果。
    const decisionCache = new Map<string, Awaited<ReturnType<typeof Permission.evaluate>>>()

    const evaluatePermission = async (args: Record<string, unknown>, toolCallID?: string) => {
      const cached = toolCallID ? decisionCache.get(toolCallID) : undefined
      if (cached) return cached

      // Ask the permission layer to evaluate this tool call with full context.
      // 将当前调用的完整上下文交给权限层评估。
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
      })

      // Cache the decision only when the call has a stable toolCallID.
      // 仅在存在稳定 toolCallID 时缓存判断结果。
      if (toolCallID) {
        decisionCache.set(toolCallID, decision)
      }
      return decision
    }

    // Wrap the runtime as a model-facing tool with shared permission checks.
    // 将 runtime 包装成模型可见的标准工具，并接入统一权限校验。
    const resolvedTool = tool<any, Tool.ToolOutput>({
      title,
      description: runtime.description,
      inputSchema: runtime.parameters,
      needsApproval: async (args, options) => {
        // Expose whether this call must be approved before execution.
        // 告知上层当前调用在执行前是否需要人工批准。
        const decision = await evaluatePermission(args as Record<string, unknown>, options.toolCallId)
        return decision.action === "ask"
      },
      execute: async (args, options) => {
        const decision = await evaluatePermission(args as Record<string, unknown>, options.toolCallId)

        // Block denied or not-yet-approved calls before running the tool.
        // 在真正执行前拦截被拒绝或尚未批准的调用。
        if (decision.action === "deny") {
          throw new Error(decision.reason)
        }
        if (decision.action === "ask") {
          throw new Error("Tool execution requires approval before it can continue.")
        }

        // Execute with shared session context and normalize the result shape.
        // 注入共享会话上下文执行工具，并统一归一化输出结构。
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
        // Normalize tool output first, then let the runtime customize it if needed.
        // 先标准化工具输出，再按需走工具自定义的模型输出转换。
        const normalized = Tool.normalizeToolOutput(output as Tool.ToolOutput)
        const modelOutput = runtime.toModelOutput
          ? await runtime.toModelOutput(normalized)
          : normalized.text

        // Normalize again so the model always receives a stable output format.
        // 再次归一化，确保返回给模型的格式稳定一致。
        return Tool.normalizeToolModelOutput(modelOutput)
      },
    })

    // Register the tool by its id and aliases, while guarding against duplicates.
    // 用工具 id 和别名注册同一个工具，同时防止重名冲突。
    for (const name of [item.id, ...(item.aliases ?? [])]) {
      if (tools[name]) {
        throw new Error(`Duplicate resolved tool name "${name}".`)
      }

      tools[name] = resolvedTool
    }
  }

  return tools
}
