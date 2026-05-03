import { type ReactNode } from "react"
import { CloseIcon, FolderIcon, PlusIcon } from "../icons"
import { ShellTopMenu } from "../shared-ui"
import type {
  McpServerDiagnostic,
  McpServerDraftState,
  McpServerSummary,
  McpToolPolicyValue,
} from "../types"
import { McpToolsPolicyPanel } from "./McpToolsPolicyPanel"

interface McpServersMessage {
  tone: "success" | "error"
  text: string
}

interface McpServersPageProps {
  activeMcpServerID: string | null
  activeMcpServerDiagnostic: McpServerDiagnostic | null
  deletingMcpServerID: string | null
  isLoading: boolean
  loadError: string | null
  mcpServerDraft: McpServerDraftState
  mcpServers: McpServerSummary[]
  message: McpServersMessage | null
  savingMcpServerID: string | null
  windowControls?: ReactNode
  onDeleteMcpServer: (serverID: string) => void | Promise<void>
  onDismissMessage: () => void
  onMcpServerDraftChange: (field: keyof McpServerDraftState, value: string | boolean) => void
  onMcpToolPolicyChange: (toolName: string, policy: McpToolPolicyValue) => void
  onMcpServerSelect: (serverID: string) => void
  onSaveMcpServer: () => boolean | Promise<boolean>
  onStartNewMcpServer: () => void
}

function getMcpTransportLabel(transport: McpServerSummary["transport"] | McpServerDraftState["transport"]) {
  return transport === "remote" ? "http" : "stdio"
}

function getMcpServerValidationError(draft: McpServerDraftState) {
  if (!draft.id.trim()) {
    return "MCP servers require an id."
  }

  if (draft.transport === "stdio" && !draft.command.trim()) {
    return "Local MCP servers require a command."
  }

  if (draft.transport === "remote" && !draft.serverUrl.trim()) {
    return "Remote MCP servers require a server URL."
  }

  if (
    draft.transport === "remote" &&
    (draft.allowedToolsMode === "names" || draft.allowedToolsMode === "read-only-names") &&
    !draft.allowedToolNames.trim()
  ) {
    return "Named tool filters require at least one tool name."
  }

  return null
}

export function McpServersPage({
  activeMcpServerID,
  activeMcpServerDiagnostic,
  deletingMcpServerID,
  isLoading,
  loadError,
  mcpServerDraft,
  mcpServers,
  message,
  savingMcpServerID,
  windowControls,
  onDeleteMcpServer,
  onDismissMessage,
  onMcpServerDraftChange,
  onMcpToolPolicyChange,
  onMcpServerSelect,
  onSaveMcpServer,
  onStartNewMcpServer,
}: McpServersPageProps) {
  const activeMcpServer = activeMcpServerID ? mcpServers.find((server) => server.id === activeMcpServerID) ?? null : null
  const mcpSaveLabel = activeMcpServer ? "Save server" : "Create server"
  const mcpServerBusyID = activeMcpServerID ?? mcpServerDraft.id.trim() ?? null
  const mcpServerBusy = Boolean(
    (mcpServerBusyID && savingMcpServerID === mcpServerBusyID) ||
    (mcpServerBusyID && deletingMcpServerID === mcpServerBusyID),
  )
  const mcpServerValidationError = getMcpServerValidationError(mcpServerDraft)
  const mcpServerCanSave = !mcpServerValidationError

  return (
    <section className="mcp-servers-page" aria-label="MCP servers">
      <ShellTopMenu
        as="header"
        ariaLabel="MCP top menu"
        className="canvas-region-top-menu mcp-servers-top-menu"
        contentClassName="canvas-region-top-menu-tabs-shell"
        content={(
          <div className="prompt-presets-top-menu-label">
            <FolderIcon />
            <span>MCP</span>
          </div>
        )}
        dragRegion
        layout="three-column"
        trailing={windowControls}
        trailingClassName="prompt-presets-top-menu-window-controls"
      />

      <div className="settings-page-main is-services mcp-servers-page-main">
        {message ? (
          <div className={message.tone === "success" ? "settings-banner is-success" : "settings-banner is-error"}>
            <span className="settings-banner-text">{message.text}</span>
            <button
              className="settings-banner-dismiss"
              type="button"
              aria-label="Dismiss settings message"
              title="Dismiss"
              onClick={onDismissMessage}
            >
              <CloseIcon />
            </button>
          </div>
        ) : null}

        {loadError ? <div className="settings-banner is-error">{loadError}</div> : null}

        {isLoading ? (
          <article className="settings-empty-state">
            <span className="label">Loading</span>
            <h3>Fetching MCP servers</h3>
            <p>Reading global MCP definitions, current defaults, and diagnostics.</p>
          </article>
        ) : (
          <section className="settings-services-layout mcp-servers-page-layout" aria-label="MCP server layout">
            <div className="settings-service-list-panel mcp-servers-list-panel">
              <div className="settings-service-list-body">
                <div className="settings-service-list mcp-servers-list-stack" role="list" aria-label="MCP servers">
                  {mcpServers.length > 0 ? (
                    mcpServers.map((server) => {
                      const isActive = server.id === activeMcpServerID

                      return (
                        <button
                          key={server.id}
                          className={isActive ? "settings-service-item is-active" : "settings-service-item"}
                          aria-label={`${server.name ?? server.id} ${server.enabled ? "enabled" : "disabled"}`}
                          aria-pressed={isActive}
                          onClick={() => onMcpServerSelect(server.id)}
                        >
                          <div className="settings-service-item-header">
                            <strong>{server.name ?? server.id}</strong>
                            <div className="provider-row-statuses">
                              <span className="settings-badge">{getMcpTransportLabel(server.transport)}</span>
                              <span className={server.enabled ? "settings-badge is-highlight" : "settings-badge"}>
                                {server.enabled ? "Enabled" : "Disabled"}
                              </span>
                            </div>
                          </div>
                        </button>
                      )
                    })
                  ) : (
                    <article className="settings-empty-state settings-service-list-empty-state">
                      <span className="label">No Servers</span>
                      <h3>No global MCP servers configured yet</h3>
                      <p>Create a reusable local or remote server here, then enable it from a project when needed.</p>
                    </article>
                  )}

                  <button
                    aria-label="New server"
                    aria-pressed={!activeMcpServer}
                    className={
                      activeMcpServer
                        ? "settings-service-item mcp-servers-new-button"
                        : "settings-service-item mcp-servers-new-button is-active"
                    }
                    onClick={onStartNewMcpServer}
                    title="New server"
                    type="button"
                  >
                    <PlusIcon />
                  </button>
                </div>
              </div>
            </div>

            <div className="settings-service-detail-panel">
              <div className="settings-detail-hero">
                <div>
                  <h3>{activeMcpServer ? activeMcpServer.name ?? activeMcpServer.id : "Create MCP server"}</h3>
                  <p className="settings-page-copy">
                    {activeMcpServer
                      ? "Edit the selected global MCP server definition."
                      : "Define a reusable local or remote MCP server. Projects can enable it from the session canvas top menu."}
                  </p>
                </div>

                <div className="provider-row-statuses">
                  <span className="settings-badge">{activeMcpServer ? "Editing" : "New"}</span>
                  <span className={mcpServerDraft.enabled ? "settings-badge is-highlight" : "settings-badge"}>
                    {mcpServerDraft.enabled ? "Enabled" : "Disabled"}
                  </span>
                  <span className="settings-badge">{getMcpTransportLabel(mcpServerDraft.transport)}</span>
                </div>
              </div>

              <div className="settings-panel">
                <div className="settings-section-header mcp-server-configuration-header">
                  <div>
                    <span className="label">Definition</span>
                    <h3>Server Configuration</h3>
                  </div>
                  <div className="mcp-server-configuration-header-side">
                    <p>
                      {mcpServerDraft.transport === "stdio"
                        ? "Use one argument per line and one environment variable per line in KEY=value format."
                        : "Connect a remote MCP server over HTTP. Headers are sent by the local agent, and tool approval stays in the local permission system."}
                    </p>
                    <div className="settings-inline-actions mcp-server-configuration-actions">
                      {activeMcpServer ? (
                        <button
                          className="secondary-button"
                          disabled={mcpServerBusy}
                          onClick={() => void onDeleteMcpServer(activeMcpServer.id)}
                          type="button"
                        >
                          {deletingMcpServerID === activeMcpServer.id ? "Removing..." : "Remove"}
                        </button>
                      ) : null}
                      <button
                        className="primary-button"
                        disabled={mcpServerBusy || !mcpServerCanSave}
                        onClick={() => void onSaveMcpServer()}
                        type="button"
                      >
                        {savingMcpServerID === (activeMcpServerID ?? mcpServerDraft.id.trim()) ? "Saving..." : mcpSaveLabel}
                      </button>
                    </div>
                  </div>
                </div>

                {activeMcpServerDiagnostic ? (
                  <div className={activeMcpServerDiagnostic.ok ? "settings-banner is-success" : "settings-banner is-error"}>
                    {activeMcpServerDiagnostic.ok
                      ? activeMcpServerDiagnostic.toolCount > 0
                        ? `Reachable. Exposed tools: ${activeMcpServerDiagnostic.toolNames.join(", ")}`
                        : "Reachable, but the server did not expose any tools."
                      : activeMcpServerDiagnostic.error ?? "Tool discovery failed."}
                  </div>
                ) : null}

                <div className="settings-field-grid">
                  <label className="settings-field">
                    <span className="settings-field-label">Server ID</span>
                    <input
                      aria-label="MCP server id"
                      type="text"
                      value={mcpServerDraft.id}
                      placeholder="filesystem"
                      onChange={(event) => onMcpServerDraftChange("id", event.target.value)}
                    />
                  </label>

                  <label className="settings-field">
                    <span className="settings-field-label">Name</span>
                    <input
                      aria-label="MCP server name"
                      type="text"
                      value={mcpServerDraft.name}
                      placeholder="Filesystem"
                      onChange={(event) => onMcpServerDraftChange("name", event.target.value)}
                    />
                  </label>

                  <label className="settings-field">
                    <span className="settings-field-label">Transport</span>
                    <select
                      aria-label="MCP server transport"
                      value={mcpServerDraft.transport}
                      onChange={(event) => onMcpServerDraftChange("transport", event.target.value)}
                    >
                      <option value="stdio">Local stdio</option>
                      <option value="remote">Remote HTTP</option>
                    </select>
                  </label>

                  {mcpServerDraft.transport === "stdio" ? (
                    <label className="settings-field">
                      <span className="settings-field-label">Command</span>
                      <input
                        aria-label="MCP server command"
                        type="text"
                        value={mcpServerDraft.command}
                        placeholder="npx"
                        onChange={(event) => onMcpServerDraftChange("command", event.target.value)}
                      />
                    </label>
                  ) : null}

                  {mcpServerDraft.transport === "stdio" ? (
                    <label className="settings-field">
                      <span className="settings-field-label">Working directory</span>
                      <input
                        aria-label="MCP server working directory"
                        type="text"
                        value={mcpServerDraft.cwd}
                        placeholder="Optional, e.g. ~/code"
                        onChange={(event) => onMcpServerDraftChange("cwd", event.target.value)}
                      />
                    </label>
                  ) : (
                    <label className="settings-field">
                      <span className="settings-field-label">Server URL</span>
                      <input
                        aria-label="MCP server URL"
                        type="text"
                        value={mcpServerDraft.serverUrl}
                        placeholder="https://mcp.example.com"
                        onChange={(event) => onMcpServerDraftChange("serverUrl", event.target.value)}
                      />
                    </label>
                  )}

                  <label className="settings-field">
                    <span className="settings-field-label">Timeout (ms)</span>
                    <input
                      aria-label="MCP server timeout"
                      type="text"
                      value={mcpServerDraft.timeoutMs}
                      placeholder="Optional"
                      onChange={(event) => onMcpServerDraftChange("timeoutMs", event.target.value)}
                    />
                  </label>

                  <label className="settings-field settings-checkbox-field">
                    <span className="settings-field-label">Enabled</span>
                    <input
                      aria-label="Enable MCP server"
                      checked={mcpServerDraft.enabled}
                      type="checkbox"
                      onChange={(event) => onMcpServerDraftChange("enabled", event.target.checked)}
                    />
                  </label>
                </div>

                {mcpServerDraft.transport === "stdio" ? (
                  <div className="settings-field-grid">
                    <label className="settings-field">
                      <span className="settings-field-label">Arguments</span>
                      <textarea
                        aria-label="MCP server arguments"
                        rows={5}
                        value={mcpServerDraft.args}
                        placeholder="one argument per line"
                        onChange={(event) => onMcpServerDraftChange("args", event.target.value)}
                      />
                    </label>

                    <label className="settings-field">
                      <span className="settings-field-label">Environment</span>
                      <textarea
                        aria-label="MCP server environment"
                        rows={5}
                        value={mcpServerDraft.env}
                        placeholder="KEY=value"
                        onChange={(event) => onMcpServerDraftChange("env", event.target.value)}
                      />
                    </label>
                  </div>
                ) : (
                  <>
                    <div className="settings-field-grid">
                      <label className="settings-field">
                        <span className="settings-field-label">Authorization</span>
                        <input
                          aria-label="MCP authorization"
                          type="text"
                          value={mcpServerDraft.authorization}
                          placeholder="Optional Authorization header value"
                          onChange={(event) => onMcpServerDraftChange("authorization", event.target.value)}
                        />
                      </label>

                      <label className="settings-field">
                        <span className="settings-field-label">Headers</span>
                        <textarea
                          aria-label="MCP server headers"
                          rows={5}
                          value={mcpServerDraft.headers}
                          placeholder="KEY=value"
                          onChange={(event) => onMcpServerDraftChange("headers", event.target.value)}
                        />
                      </label>
                    </div>

                    <div className="settings-field-grid">
                      <label className="settings-field">
                        <span className="settings-field-label">Allowed tools</span>
                        <select
                          aria-label="MCP allowed tools mode"
                          value={mcpServerDraft.allowedToolsMode}
                          onChange={(event) => onMcpServerDraftChange("allowedToolsMode", event.target.value)}
                        >
                          <option value="all">All tools</option>
                          <option value="names">Named tools only</option>
                          <option value="read-only">Read-only tools</option>
                          <option value="read-only-names">Read-only named tools</option>
                        </select>
                      </label>

                      {mcpServerDraft.allowedToolsMode === "names" || mcpServerDraft.allowedToolsMode === "read-only-names" ? (
                        <label className="settings-field">
                          <span className="settings-field-label">Allowed tool names</span>
                          <textarea
                            aria-label="MCP allowed tool names"
                            rows={5}
                            value={mcpServerDraft.allowedToolNames}
                            placeholder="one tool name per line"
                            onChange={(event) => onMcpServerDraftChange("allowedToolNames", event.target.value)}
                          />
                        </label>
                      ) : null}
                    </div>
                  </>
                )}

                <McpToolsPolicyPanel
                  diagnostic={activeMcpServerDiagnostic}
                  draft={mcpServerDraft}
                  onPolicyChange={onMcpToolPolicyChange}
                />

                <div className="settings-actions-row">
                  <span className="settings-helper-text">
                    {mcpServerValidationError
                      ? mcpServerValidationError
                      : mcpServerDraft.transport === "remote"
                        ? "Remote MCP servers are connected locally over HTTP. Approval still flows through the existing permission system."
                        : "Servers start lazily when a project enables them and the agent resolves tools. Tool approval still flows through the existing permission system."}
                  </span>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </section>
  )
}
