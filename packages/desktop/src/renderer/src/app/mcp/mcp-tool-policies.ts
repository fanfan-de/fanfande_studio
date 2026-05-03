import type {
  McpServerDiagnostic,
  McpServerDraftState,
  McpToolDiagnostic,
  McpToolPolicyValue,
} from "../types"

function parseLineList(input: string) {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

export function recommendedMcpToolPolicy(tool: McpToolDiagnostic): McpToolPolicyValue {
  return tool.recommendedPolicy ?? (
    tool.annotations?.readOnlyHint === true && tool.annotations?.destructiveHint !== true ? "auto" : "ask"
  )
}

export function defaultMcpToolPolicyForDraft(
  tool: McpToolDiagnostic,
  draft: McpServerDraftState,
): McpToolPolicyValue {
  if (draft.transport === "remote") {
    const allowedToolNames = new Set(parseLineList(draft.allowedToolNames))
    const requiresNamedTool =
      draft.allowedToolsMode === "names" || draft.allowedToolsMode === "read-only-names"
    const requiresReadOnly =
      draft.allowedToolsMode === "read-only" || draft.allowedToolsMode === "read-only-names"

    if (requiresNamedTool && !allowedToolNames.has(tool.name)) {
      return "disabled"
    }

    if (requiresReadOnly && tool.annotations?.readOnlyHint !== true) {
      return "disabled"
    }
  }

  return recommendedMcpToolPolicy(tool)
}

export function resolveMcpToolPolicy(
  tool: McpToolDiagnostic,
  draft: McpServerDraftState,
): McpToolPolicyValue {
  return draft.toolPolicies[tool.name] ?? defaultMcpToolPolicyForDraft(tool, draft)
}

export function mergeMcpToolPolicyDefaults(
  draft: McpServerDraftState,
  diagnostic: McpServerDiagnostic,
): McpServerDraftState {
  const tools = diagnostic.tools ?? []
  if (!diagnostic.ok || tools.length === 0) return draft

  let changed = false
  const toolPolicies = { ...draft.toolPolicies }
  for (const tool of tools) {
    if (toolPolicies[tool.name]) continue
    toolPolicies[tool.name] = tool.configuredPolicy ?? defaultMcpToolPolicyForDraft(tool, draft)
    changed = true
  }

  return changed ? { ...draft, toolPolicies } : draft
}
