import { useMemo, useState, type ReactNode } from "react"
import { CloseIcon, DownloadIcon, FolderIcon, PlusIcon, SearchIcon } from "../icons"
import { ShellTopMenu } from "../shared-ui"
import type {
  McpServerDiagnostic,
  McpServerDraftState,
  McpServerSummary,
  McpToolPolicyValue,
} from "../types"
import { parseMcpConfigJson } from "./mcp-config-import"
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
  hideNavigator?: boolean
  isImportingMcpConfigJson?: boolean
  windowControls?: ReactNode
  onDeleteMcpServer: (serverID: string) => void | Promise<void>
  onDismissMessage: () => void
  onImportMcpConfigJson: (input: string) => boolean | Promise<boolean>
  onMcpServerDraftChange: (field: keyof McpServerDraftState, value: string | boolean) => void
  onMcpToolPolicyChange: (toolName: string, policy: McpToolPolicyValue) => void
  onMcpServerSelect: (serverID: string) => void
  onSaveMcpServer: () => boolean | Promise<boolean>
  onStartNewMcpServer: () => void
}

export interface McpServersSidebarViewProps {
  activeMcpServerID: string | null
  deletingMcpServerID: string | null
  isImportingMcpConfigJson?: boolean
  mcpServers: McpServerSummary[]
  savingMcpServerID: string | null
  onMcpServerSelect: (serverID: string) => void
  onStartNewMcpServer: () => void
}

function getMcpTransportLabel(transport: McpServerSummary["transport"] | McpServerDraftState["transport"]) {
  return transport === "remote" ? "http" : "stdio"
}

function doesMcpServerMatchSearch(server: McpServerSummary, rawQuery: string) {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return true

  const haystack = [
    server.id,
    server.name ?? "",
    getMcpTransportLabel(server.transport),
    server.enabled ? "enabled" : "disabled",
    server.transport === "stdio" ? server.command ?? "" : server.serverUrl ?? "",
  ]
    .join(" ")
    .toLowerCase()

  return haystack.includes(query)
}

const MCP_CONFIG_IMPORT_EXAMPLE = `{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:\\\\Projects"]
    },
    "context7": {
      "type": "http",
      "url": "https://mcp.context7.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}`

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

export function McpServersSidebarView({
  activeMcpServerID,
  deletingMcpServerID,
  isImportingMcpConfigJson = false,
  mcpServers,
  savingMcpServerID,
  onMcpServerSelect,
  onStartNewMcpServer,
}: McpServersSidebarViewProps) {
  const [mcpServerSearchQuery, setMcpServerSearchQuery] = useState("")
  const activeMcpServer = activeMcpServerID ? mcpServers.find((server) => server.id === activeMcpServerID) ?? null : null
  const filteredMcpServers = useMemo(
    () => mcpServers.filter((server) => doesMcpServerMatchSearch(server, mcpServerSearchQuery)),
    [mcpServerSearchQuery, mcpServers],
  )

  return (
    <section className="sidebar-view sidebar-view-mcp" aria-label="MCP servers sidebar view">
      <div className="skills-tree-search-row mcp-servers-search-row" role="search">
        <SearchIcon />
        <input
          aria-label="Search MCP servers"
          type="search"
          value={mcpServerSearchQuery}
          placeholder="Search servers"
          onChange={(event) => setMcpServerSearchQuery(event.target.value)}
        />
        {mcpServerSearchQuery ? (
          <button
            aria-label="Clear MCP server search"
            title="Clear search"
            type="button"
            onClick={() => setMcpServerSearchQuery("")}
          >
            <CloseIcon />
          </button>
        ) : null}
      </div>

      <div className="skills-tree-root mcp-servers-list-stack" role="list" aria-label="MCP servers">
        {filteredMcpServers.length > 0 ? (
          filteredMcpServers.map((server) => {
            const isActive = server.id === activeMcpServerID

            return (
              <button
                key={server.id}
                className={isActive ? "skill-tree-row mcp-server-sidebar-row is-active" : "skill-tree-row mcp-server-sidebar-row"}
                aria-label={`${server.name ?? server.id} ${server.enabled ? "enabled" : "disabled"}`}
                aria-pressed={isActive}
                type="button"
                onClick={() => onMcpServerSelect(server.id)}
              >
                <span className="skill-tree-role-icon is-folder" aria-hidden="true">
                  <FolderIcon />
                </span>
                <span className="skill-tree-label">{server.name ?? server.id}</span>
                <span className="prompt-tree-row-badges" aria-hidden="true">
                  <span className="settings-badge">{getMcpTransportLabel(server.transport)}</span>
                  <span className={server.enabled ? "settings-badge is-highlight" : "settings-badge"}>
                    {server.enabled ? "Enabled" : "Disabled"}
                  </span>
                </span>
              </button>
            )
          })
        ) : mcpServers.length > 0 ? (
          <p className="skills-tree-empty">No MCP servers match this search.</p>
        ) : (
          <p className="skills-tree-empty">No global MCP servers configured yet.</p>
        )}

        <div className="global-skills-new-menu-shell mcp-servers-new-menu-shell">
          <button
            aria-label="New server"
            aria-pressed={!activeMcpServer}
            className={activeMcpServer ? "global-skills-new-button mcp-servers-new-button" : "global-skills-new-button mcp-servers-new-button is-active"}
            onClick={onStartNewMcpServer}
            title="New server"
            type="button"
          >
            <PlusIcon />
          </button>
        </div>
      </div>
    </section>
  )
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
  hideNavigator = false,
  isImportingMcpConfigJson = false,
  windowControls,
  onDeleteMcpServer,
  onDismissMessage,
  onImportMcpConfigJson,
  onMcpServerDraftChange,
  onMcpToolPolicyChange,
  onMcpServerSelect,
  onSaveMcpServer,
  onStartNewMcpServer,
}: McpServersPageProps) {
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [importConfigJson, setImportConfigJson] = useState("")
  const activeMcpServer = activeMcpServerID ? mcpServers.find((server) => server.id === activeMcpServerID) ?? null : null
  const mcpSaveLabel = activeMcpServer ? "Save server" : "Create server"
  const mcpServerBusyID = activeMcpServerID ?? mcpServerDraft.id.trim() ?? null
  const mcpServerBusy = Boolean(
    (mcpServerBusyID && savingMcpServerID === mcpServerBusyID) ||
    (mcpServerBusyID && deletingMcpServerID === mcpServerBusyID),
  )
  const mcpServerValidationError = getMcpServerValidationError(mcpServerDraft)
  const mcpServerCanSave = !mcpServerValidationError
  const importPreview = useMemo(() => {
    if (!importConfigJson.trim()) return null

    try {
      return {
        tone: "success" as const,
        result: parseMcpConfigJson(importConfigJson),
      }
    } catch (error) {
      return {
        tone: "error" as const,
        errorMessage: error instanceof Error ? error.message : String(error),
      }
    }
  }, [importConfigJson])
  const importServerCount = importPreview?.tone === "success" ? importPreview.result.servers.length : 0
  const canImportConfigJson = importServerCount > 0 && !isImportingMcpConfigJson

  async function handleImportConfigJson() {
    if (!canImportConfigJson) return

    const didImport = await onImportMcpConfigJson(importConfigJson)
    if (!didImport) return

    setIsImportDialogOpen(false)
    setImportConfigJson("")
  }

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
          <section
            className={hideNavigator ? "settings-services-layout mcp-servers-page-layout is-sidebar-hosted" : "settings-services-layout mcp-servers-page-layout"}
            aria-label="MCP server layout"
          >
            {!hideNavigator ? (
              <div className="settings-service-list-panel mcp-servers-list-panel">
                <McpServersSidebarView
                  activeMcpServerID={activeMcpServerID}
                  deletingMcpServerID={deletingMcpServerID}
                  isImportingMcpConfigJson={isImportingMcpConfigJson}
                  mcpServers={mcpServers}
                  savingMcpServerID={savingMcpServerID}
                  onMcpServerSelect={onMcpServerSelect}
                  onStartNewMcpServer={onStartNewMcpServer}
                />
              </div>
            ) : null}

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
                    <div className="settings-inline-actions mcp-server-configuration-actions">
                      <button
                        className="secondary-button"
                        disabled={mcpServerBusy || isImportingMcpConfigJson}
                        onClick={() => setIsImportDialogOpen(true)}
                        type="button"
                      >
                        <DownloadIcon />
                        Import JSON
                      </button>
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

                {mcpServerValidationError || mcpServerDraft.transport === "remote" ? (
                  <div className="settings-actions-row">
                    <span className="settings-helper-text">
                      {mcpServerValidationError
                        ? mcpServerValidationError
                        : "Remote MCP servers are connected locally over HTTP. Approval still flows through the existing permission system."}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        )}
      </div>

      {isImportDialogOpen ? (
        <div className="mcp-config-import-overlay">
          <section
            className="mcp-config-import-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mcp-config-import-title"
          >
            <div className="mcp-config-import-header">
              <div>
                <span className="label">Import</span>
                <h3 id="mcp-config-import-title">Install from MCP JSON</h3>
                <p className="settings-page-copy">
                  Paste a Cursor, Claude Desktop, or Claude Code MCP JSON configuration.
                </p>
              </div>
              <button
                className="settings-page-close-button"
                type="button"
                aria-label="Close MCP JSON import"
                onClick={() => setIsImportDialogOpen(false)}
              >
                <CloseIcon />
              </button>
            </div>

            <details className="mcp-config-import-example">
              <summary>View example</summary>
              <pre>{MCP_CONFIG_IMPORT_EXAMPLE}</pre>
            </details>

            <label className="settings-field">
              <span className="settings-field-label">MCP configuration JSON</span>
              <textarea
                aria-label="MCP configuration JSON"
                rows={12}
                value={importConfigJson}
                placeholder="Paste MCP configuration JSON..."
                onChange={(event) => setImportConfigJson(event.target.value)}
              />
            </label>

            {importPreview ? (
              importPreview.tone === "success" ? (
                <div className="settings-banner is-success">
                  Detected {importServerCount} MCP server{importServerCount === 1 ? "" : "s"}:{" "}
                  {importPreview.result.servers.map((server) => server.id).join(", ")}
                </div>
              ) : (
                <div className="settings-banner is-error">{importPreview.errorMessage}</div>
              )
            ) : null}

            {importPreview?.tone === "success" && importPreview.result.warnings.length > 0 ? (
              <div className="mcp-config-import-warnings">
                {importPreview.result.warnings.map((warning) => (
                  <span key={warning}>{warning}</span>
                ))}
              </div>
            ) : null}

            <div className="settings-inline-actions mcp-config-import-actions">
              <button
                className="secondary-button"
                type="button"
                disabled={isImportingMcpConfigJson}
                onClick={() => setIsImportDialogOpen(false)}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={!canImportConfigJson}
                onClick={() => void handleImportConfigJson()}
              >
                {isImportingMcpConfigJson ? "Importing..." : "Import"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  )
}
