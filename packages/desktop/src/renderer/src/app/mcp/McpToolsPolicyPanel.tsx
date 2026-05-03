import type {
  McpServerDiagnostic,
  McpServerDraftState,
  McpToolDiagnostic,
  McpToolPolicyValue,
} from "../types"
import { resolveMcpToolPolicy } from "./mcp-tool-policies"

const TOOL_POLICY_LABELS: Record<McpToolPolicyValue, string> = {
  disabled: "Disabled",
  ask: "Ask every time",
  auto: "Auto allow",
}

function formatJson(value: unknown) {
  if (value === undefined) return "{}"

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function toolBadges(tool: McpToolDiagnostic) {
  const badges: string[] = []
  if (tool.annotations?.readOnlyHint) badges.push("read-only")
  if (tool.annotations?.destructiveHint) badges.push("destructive")
  if (tool.annotations?.openWorldHint) badges.push("open-world")
  if (badges.length === 0) badges.push(tool.riskHint)
  return badges
}

interface McpToolsPolicyPanelProps {
  diagnostic: McpServerDiagnostic | null
  draft: McpServerDraftState
  onPolicyChange: (toolName: string, policy: McpToolPolicyValue) => void
}

export function McpToolsPolicyPanel({
  diagnostic,
  draft,
  onPolicyChange,
}: McpToolsPolicyPanelProps) {
  if (!diagnostic?.ok) return null
  const tools = diagnostic.tools ?? []

  return (
    <section className="mcp-tools-policy-panel" aria-label="MCP tool permissions">
      <div className="settings-section-header">
        <div>
          <span className="label">Tools</span>
          <h3>Tool Permissions</h3>
        </div>
        <p>Review discovered MCP tools and choose whether the agent can call each one.</p>
      </div>

      {tools.length > 0 ? (
        <div className="mcp-tools-policy-list">
          {tools.map((tool) => {
            const policy = resolveMcpToolPolicy(tool, draft)

            return (
              <article className="mcp-tool-policy-card" key={tool.name}>
                <div className="mcp-tool-policy-main">
                  <div className="mcp-tool-policy-heading">
                    <div>
                      <h4>{tool.displayName || tool.title || tool.name}</h4>
                      <code>{tool.name}</code>
                    </div>
                    <div className="provider-row-statuses">
                      {toolBadges(tool).map((badge) => (
                        <span
                          className={badge === "destructive" ? "settings-badge is-danger" : "settings-badge"}
                          key={badge}
                        >
                          {badge}
                        </span>
                      ))}
                    </div>
                  </div>

                  {tool.description ? <p>{tool.description}</p> : null}
                </div>

                <label className="settings-field mcp-tool-policy-select">
                  <span className="settings-field-label">Policy</span>
                  <select
                    aria-label={`Policy for ${tool.name}`}
                    value={policy}
                    onChange={(event) => onPolicyChange(tool.name, event.target.value as McpToolPolicyValue)}
                  >
                    <option value="disabled">{TOOL_POLICY_LABELS.disabled}</option>
                    <option value="ask">{TOOL_POLICY_LABELS.ask}</option>
                    <option value="auto">{TOOL_POLICY_LABELS.auto}</option>
                  </select>
                </label>

                <details className="mcp-tool-policy-details">
                  <summary>Input schema</summary>
                  <pre>{formatJson({
                    inputSchema: tool.inputSchema ?? {},
                    annotations: tool.annotations ?? {},
                  })}</pre>
                </details>
              </article>
            )
          })}
        </div>
      ) : (
        <article className="settings-empty-state">
          <span className="label">No Tools</span>
          <h3>No MCP tools discovered</h3>
          <p>This server responded successfully but did not expose any tools.</p>
        </article>
      )}
    </section>
  )
}
