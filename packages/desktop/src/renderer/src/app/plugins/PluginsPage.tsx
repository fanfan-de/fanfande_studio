import { useMemo, useState, type ReactNode } from "react"
import { CloseIcon, PluginIcon } from "../icons"
import { ShellTopMenu } from "../shared-ui"
import type {
  InstalledPlugin,
  McpServerDiagnostic,
  PluginCatalogItem,
  PluginCategory,
  PluginConnectorStatus,
  PluginDraftState,
  PluginMcpServerCatalogEntry,
  PluginRisk,
  PluginRuntimeTemplate,
} from "../types"

interface PluginsMessage {
  tone: "success" | "error"
  text: string
}

interface PluginsPageProps {
  activePluginID: string | null
  deletingPluginID: string | null
  diagnosingPluginConnectorID: string | null
  diagnosingPluginID: string | null
  installingPluginID: string | null
  installedPlugins: InstalledPlugin[]
  isLoading: boolean
  loadError: string | null
  message: PluginsMessage | null
  pluginCatalog: PluginCatalogItem[]
  pluginConnectorStatuses: Record<string, PluginConnectorStatus[]>
  pluginDiagnostics: Record<string, McpServerDiagnostic>
  pluginDraft: PluginDraftState
  savingPluginConnectorID: string | null
  updatingPluginID: string | null
  windowControls?: ReactNode
  onDeleteInstalledPlugin: (pluginID: string) => boolean | Promise<boolean>
  onDeleteInstalledPluginConnectorApiKey: (pluginID: string, appID: string) => boolean | Promise<boolean>
  onDiagnoseInstalledPlugin: (pluginID: string) => boolean | Promise<boolean>
  onDiagnoseInstalledPluginConnector: (pluginID: string, appID: string) => boolean | Promise<boolean>
  onDismissMessage: () => void
  onInstallPlugin: (pluginID: string) => boolean | Promise<boolean>
  onPluginDraftAppApiKeyChange: (appID: string, value: string) => void
  onPluginDraftConfigChange: (key: string, value: string) => void
  onPluginSelect: (pluginID: string) => void
  onSaveInstalledPluginConnectorApiKey: (pluginID: string, appID: string) => boolean | Promise<boolean>
  onSaveInstalledPluginConfig: (pluginID: string) => boolean | Promise<boolean>
  onSetInstalledPluginEnabled: (pluginID: string, enabled: boolean) => boolean | Promise<boolean>
}

const CATEGORY_FILTERS: Array<PluginCategory | "All"> = [
  "All",
  "Code",
  "Browser",
  "Git",
  "Database",
  "Docs",
  "Automation",
  "Design",
]

function riskBadgeClassName(risk: PluginRisk) {
  if (risk === "critical") return "settings-badge is-danger"
  if (risk === "high") return "settings-badge is-warning"
  if (risk === "medium") return "settings-badge"
  return "settings-badge is-highlight"
}

function runtimeTitle(runtime: PluginRuntimeTemplate) {
  if (runtime.transport === "stdio") {
    return "stdio command"
  }

  return "remote endpoint"
}

function runtimePrimary(runtime: PluginRuntimeTemplate) {
  if (runtime.transport === "stdio") {
    return [runtime.command, ...(runtime.args ?? [])].join(" ")
  }

  return runtime.serverUrl ?? runtime.connectorId ?? "Remote MCP"
}

function runtimeSecondary(runtime: PluginRuntimeTemplate) {
  if (runtime.transport === "stdio") {
    const envKeys = Object.keys(runtime.env ?? {})
    return envKeys.length > 0 ? `env: ${envKeys.join(", ")}` : "no required env keys"
  }

  const headerKeys = Object.keys(runtime.headers ?? {})
  return headerKeys.length > 0 ? `headers: ${headerKeys.join(", ")}` : "no required headers"
}

function allowedToolsLabel(runtime?: PluginRuntimeTemplate) {
  if (!runtime || runtime.transport !== "remote" || !runtime.allowedTools) return "all tools"
  if (Array.isArray(runtime.allowedTools)) return runtime.allowedTools.join(", ")

  const parts: string[] = []
  if (runtime.allowedTools.readOnly) parts.push("read-only")
  if (runtime.allowedTools.toolNames?.length) parts.push(runtime.allowedTools.toolNames.join(", "))
  return parts.join(", ") || "all tools"
}

function requireApprovalLabel(runtime?: PluginRuntimeTemplate) {
  if (!runtime || runtime.transport !== "remote") return "permission layer"
  const requirement = runtime.requireApproval
  if (!requirement) return "default"
  if (typeof requirement === "string") return requirement
  return requirement.never?.toolNames?.length
    ? `never for ${requirement.never.toolNames.join(", ")}`
    : "custom"
}

function diagnosticFor(pluginID: string, installed: InstalledPlugin | null, diagnostics: Record<string, McpServerDiagnostic>) {
  return diagnostics[pluginID] ?? installed?.lastDiagnostic ?? null
}

function hasConfigChanges(plugin: PluginCatalogItem, installed: InstalledPlugin | null, draft: PluginDraftState) {
  if (!installed || draft.pluginID !== plugin.id) return false

  return plugin.configFields.some((field) => (draft.config[field.key] ?? "") !== (installed.config[field.key] ?? ""))
}

function generatedServerID(plugin: PluginCatalogItem, server: PluginMcpServerCatalogEntry) {
  return server.id === "default" ? `plugin.${plugin.id}` : `plugin.${plugin.id}.${server.id}`
}

function connectorKey(pluginID: string, appID: string) {
  return `${pluginID}:${appID}`
}

export function PluginsPage({
  activePluginID,
  deletingPluginID,
  diagnosingPluginConnectorID,
  diagnosingPluginID,
  installingPluginID,
  installedPlugins,
  isLoading,
  loadError,
  message,
  pluginCatalog,
  pluginConnectorStatuses,
  pluginDiagnostics,
  pluginDraft,
  savingPluginConnectorID,
  updatingPluginID,
  windowControls,
  onDeleteInstalledPlugin,
  onDeleteInstalledPluginConnectorApiKey,
  onDiagnoseInstalledPlugin,
  onDiagnoseInstalledPluginConnector,
  onDismissMessage,
  onInstallPlugin,
  onPluginDraftAppApiKeyChange,
  onPluginDraftConfigChange,
  onPluginSelect,
  onSaveInstalledPluginConnectorApiKey,
  onSaveInstalledPluginConfig,
  onSetInstalledPluginEnabled,
}: PluginsPageProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<PluginCategory | "All">("All")

  const installedByPluginID = useMemo(
    () => new Map(installedPlugins.map((plugin) => [plugin.pluginID, plugin])),
    [installedPlugins],
  )
  const filteredPlugins = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    return pluginCatalog.filter((plugin) => {
      if (categoryFilter !== "All" && plugin.category !== categoryFilter) return false
      if (!normalizedQuery) return true

      return [
        plugin.name,
        plugin.publisher,
        plugin.description,
        plugin.category,
        plugin.tools.map((tool) => tool.name).join(" "),
        plugin.skills.map((skill) => skill.name).join(" "),
        plugin.apps.map((app) => app.name).join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    })
  }, [categoryFilter, pluginCatalog, searchQuery])

  const activePlugin =
    (activePluginID ? pluginCatalog.find((plugin) => plugin.id === activePluginID) : null) ??
    filteredPlugins[0] ??
    pluginCatalog[0] ??
    null
  const activeInstalledPlugin = activePlugin ? installedByPluginID.get(activePlugin.id) ?? null : null
  const activeConnectorStatuses = activePlugin ? pluginConnectorStatuses[activePlugin.id] ?? [] : []
  const activeConnectorStatusByAppID = useMemo(
    () => new Map(activeConnectorStatuses.map((status) => [status.appID, status])),
    [activeConnectorStatuses],
  )
  const activeDiagnostic = activePlugin
    ? diagnosticFor(activePlugin.id, activeInstalledPlugin, pluginDiagnostics)
    : null
  const activePluginBusy = Boolean(
    activePlugin &&
      [installingPluginID, updatingPluginID, deletingPluginID, diagnosingPluginID].includes(activePlugin.id),
  )
  const activePluginConfigChanged = activePlugin
    ? hasConfigChanges(activePlugin, activeInstalledPlugin, pluginDraft)
    : false
  const canInstallActivePlugin =
    Boolean(activePlugin) &&
    !activeInstalledPlugin &&
    activePlugin?.risk !== "critical" &&
    !activePluginBusy

  return (
    <section className="plugins-page" aria-label="Plugins">
      <ShellTopMenu
        as="header"
        ariaLabel="Plugins top menu"
        className="canvas-region-top-menu plugins-top-menu"
        contentClassName="canvas-region-top-menu-tabs-shell"
        content={(
          <div className="prompt-presets-top-menu-label">
            <PluginIcon />
            <span>Plugins</span>
          </div>
        )}
        dragRegion
        layout="three-column"
        trailing={windowControls}
        trailingClassName="prompt-presets-top-menu-window-controls"
      />

      <div className="settings-page-main is-services plugins-page-main">
        <>
          {message ? (
            <div className={message.tone === "success" ? "settings-banner is-success" : "settings-banner is-error"}>
              <span className="settings-banner-text">{message.text}</span>
              <button
                className="settings-banner-dismiss"
                type="button"
                aria-label="Dismiss plugins message"
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
              <h3>Fetching plugins</h3>
              <p>Reading the curated catalog and installed plugin state.</p>
            </article>
          ) : (
            <section className="settings-services-layout plugins-page-layout" aria-label="Plugin marketplace layout">
            <div className="settings-service-list-panel plugins-list-panel">
              <div className="settings-panel plugins-market-panel">
                <div className="settings-section-header">
                  <div>
                    <span className="label">Marketplace</span>
                    <h3>Curated Plugins</h3>
                  </div>
                  <p>Install plugin packages globally, then enable their MCP servers and skills per project.</p>
                </div>

                <div className="plugins-market-toolbar">
                  <label className="settings-field plugins-search-field">
                    <span className="settings-field-label">Search</span>
                    <input
                      type="search"
                      value={searchQuery}
                      placeholder="Search plugins or tools"
                      onChange={(event) => setSearchQuery(event.target.value)}
                    />
                  </label>
                  <div className="plugins-category-filter" aria-label="Plugin categories">
                    {CATEGORY_FILTERS.map((category) => (
                      <button
                        key={category}
                        className={categoryFilter === category ? "settings-badge is-highlight" : "settings-badge"}
                        type="button"
                        aria-pressed={categoryFilter === category}
                        onClick={() => setCategoryFilter(category)}
                      >
                        {category}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="settings-service-list-body">
                {filteredPlugins.length > 0 ? (
                  <div className="settings-service-list" role="list" aria-label="Plugins">
                    {filteredPlugins.map((plugin) => {
                      const installed = installedByPluginID.get(plugin.id) ?? null
                      const isActive = plugin.id === activePlugin?.id

                      return (
                        <button
                          key={plugin.id}
                          className={isActive ? "settings-service-item is-active" : "settings-service-item"}
                          aria-label={`${plugin.name} ${installed ? "installed" : "not installed"}`}
                          aria-pressed={isActive}
                          onClick={() => onPluginSelect(plugin.id)}
                        >
                          <div className="settings-service-item-header">
                            <strong>{plugin.name}</strong>
                            <div className="provider-row-statuses">
                              <span className="settings-badge">{plugin.category}</span>
                              <span className={riskBadgeClassName(plugin.risk)}>{plugin.risk}</span>
                            </div>
                          </div>
                          <span className="settings-service-item-copy">{plugin.description}</span>
                          <div className="plugins-list-meta">
                            <span>{plugin.publisher}</span>
                            <span>{plugin.version}</span>
                            <span>{plugin.mcpServers.length} MCP</span>
                            <span>{plugin.skills.length} Skills</span>
                            <span>{plugin.apps.length} Apps</span>
                            <span>{installed ? (installed.enabled ? "Installed, enabled" : "Installed, disabled") : "Not installed"}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <article className="settings-empty-state settings-service-list-empty-state">
                    <span className="label">No Matches</span>
                    <h3>No plugins match the current filters</h3>
                    <p>Adjust the search text or category filter.</p>
                  </article>
                )}
              </div>
            </div>

            <div className="settings-service-detail-panel plugins-detail-panel">
              {activePlugin ? (
                <>
                  <div className="settings-detail-hero">
                    <div>
                      <h3>{activePlugin.name}</h3>
                      <p>{activePlugin.description}</p>
                    </div>

                    <div className="provider-row-statuses">
                      <span className="settings-badge">{activePlugin.category}</span>
                      <span className={riskBadgeClassName(activePlugin.risk)}>{activePlugin.risk}</span>
                      <span className={activeInstalledPlugin?.enabled ? "settings-badge is-highlight" : "settings-badge"}>
                        {activeInstalledPlugin ? (activeInstalledPlugin.enabled ? "Enabled" : "Disabled") : "Not installed"}
                      </span>
                    </div>
                  </div>

                  {activeDiagnostic ? (
                    <div className={activeDiagnostic.ok ? "settings-banner is-success" : "settings-banner is-error"}>
                      {activeDiagnostic.ok
                        ? activeDiagnostic.toolCount > 0
                          ? `Diagnostics passed. Tools: ${activeDiagnostic.toolNames.join(", ")}`
                          : "Diagnostics passed, but no tools were exposed."
                        : activeDiagnostic.error ?? "Diagnostics failed."}
                    </div>
                  ) : null}

                  <div className="plugins-detail-grid">
                    <section className="settings-panel">
                      <div className="settings-section-header">
                        <div>
                          <span className="label">Capabilities</span>
                          <h3>Tools Preview</h3>
                        </div>
                        <p>Installed tools are discovered at runtime by the generated MCP server.</p>
                      </div>
                      {activePlugin.tools.length > 0 ? (
                        <div className="plugins-tool-list">
                          {activePlugin.tools.map((tool) => (
                          <div key={tool.name} className="plugins-tool-row">
                            <div>
                              <strong>{tool.title ?? tool.name}</strong>
                              <span>{tool.name}</span>
                            </div>
                            <p>{tool.description}</p>
                            <div className="provider-row-statuses">
                              <span className={tool.readOnly ? "settings-badge is-highlight" : "settings-badge"}>
                                {tool.readOnly ? "Read" : "Write"}
                              </span>
                              {tool.destructive ? <span className="settings-badge is-warning">Destructive</span> : null}
                            </div>
                          </div>
                          ))}
                        </div>
                      ) : (
                        <p className="settings-page-copy">This package adds skills or connectors without a static tool preview.</p>
                      )}
                    </section>

                    <section className="settings-panel">
                      <div className="settings-section-header">
                        <div>
                          <span className="label">Package</span>
                          <h3>Included Capabilities</h3>
                        </div>
                        <p>MCP servers and skills are enabled per project after installation.</p>
                      </div>
                      <div className="plugins-review-list">
                        <span>{activePlugin.mcpServers.length} MCP server{activePlugin.mcpServers.length === 1 ? "" : "s"}</span>
                        <span>{activePlugin.skills.length} skill{activePlugin.skills.length === 1 ? "" : "s"}</span>
                        <span>{activePlugin.apps.length} app connector{activePlugin.apps.length === 1 ? "" : "s"}</span>
                      </div>
                      {activePlugin.skills.length > 0 ? (
                        <div className="plugins-tool-list">
                          {activePlugin.skills.map((skill) => (
                            <div key={skill.id} className="plugins-tool-row">
                              <div>
                                <strong>{skill.name}</strong>
                                <span>{skill.id}</span>
                              </div>
                              <p>{skill.description}</p>
                              <div className="provider-row-statuses">
                                <span className="settings-badge is-highlight">Skill</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </section>

                    <section className="settings-panel">
                      <div className="settings-section-header">
                        <div>
                          <span className="label">Runtime</span>
                          <h3>MCP Bindings</h3>
                        </div>
                        <p>Commands, endpoints, and generated server ids shown before install.</p>
                      </div>
                      <div className="plugins-tool-list">
                        {activePlugin.mcpServers.map((server) => (
                          <div key={server.id} className="plugins-tool-row">
                            <div>
                              <strong>{server.name}</strong>
                              <span>{runtimeTitle(server.runtime)}</span>
                            </div>
                            <pre className="plugins-runtime-code">{runtimePrimary(server.runtime)}</pre>
                            <div className="plugins-review-list">
                              <span>Server ID: {generatedServerID(activePlugin, server)}</span>
                              <span>{runtimeSecondary(server.runtime)}</span>
                              <span>Allowed tools: {allowedToolsLabel(server.runtime)}</span>
                              <span>Approval: {requireApprovalLabel(server.runtime)}</span>
                            </div>
                          </div>
                        ))}
                        {activePlugin.apps.map((app) => (
                          <div key={app.appID} className="plugins-tool-row">
                            <div>
                              <strong>{app.name}</strong>
                              <span>app connector</span>
                            </div>
                            <pre className="plugins-runtime-code">{app.runtime.serverUrl ?? "Connector-backed remote MCP"}</pre>
                            <div className="plugins-review-list">
                              <span>Server ID: plugin.{activePlugin.id}.app.{app.appID}</span>
                              <span>Connector ID: plugin-app:{activePlugin.id}:{app.appID}</span>
                              <span>{runtimeSecondary(app.runtime)}</span>
                              <span>Allowed tools: {allowedToolsLabel(app.runtime)}</span>
                              <span>Approval: {requireApprovalLabel(app.runtime)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="settings-panel">
                      <div className="settings-section-header">
                        <div>
                          <span className="label">Permissions</span>
                          <h3>Install Review</h3>
                        </div>
                        <p>Review these declarations before installing the plugin.</p>
                      </div>
                      <div className="plugins-review-list">
                        {activePlugin.permissions.map((permission) => (
                          <span key={permission}>{permission}</span>
                        ))}
                        {(activePlugin.installReview ?? []).map((item) => (
                          <span key={item}>{item}</span>
                        ))}
                      </div>
                    </section>

                    <section className="settings-panel">
                      <div className="settings-section-header">
                        <div>
                          <span className="label">Apps</span>
                          <h3>Connectors</h3>
                        </div>
                        <p>
                          {activePlugin.apps.length > 0
                            ? "API keys are stored in the credential store and injected only at runtime."
                            : "This plugin does not declare app connectors."}
                        </p>
                      </div>
                      {activePlugin.apps.length > 0 ? (
                        <div className="plugins-tool-list">
                          {activePlugin.apps.map((app) => {
                            const status = activeConnectorStatusByAppID.get(app.appID)
                            const appBusyKey = connectorKey(activePlugin.id, app.appID)
                            const isSavingConnector = savingPluginConnectorID === appBusyKey
                            const isDiagnosingConnector = diagnosingPluginConnectorID === appBusyKey
                            const diagnostic = status?.lastDiagnostic

                            return (
                              <div key={app.appID} className="plugins-tool-row">
                                <div>
                                  <strong>{app.name}</strong>
                                  <span>{status?.connected ? "connected" : "not connected"}</span>
                                </div>
                                <p>{app.description ?? app.credential.description ?? "Remote MCP connector."}</p>
                                {diagnostic ? (
                                  <div className={diagnostic.ok ? "settings-banner is-success" : "settings-banner is-error"}>
                                    {diagnostic.ok
                                      ? `Connector reachable. Tools: ${diagnostic.toolNames.join(", ") || "none"}`
                                      : diagnostic.error ?? "Connector diagnostics failed."}
                                  </div>
                                ) : null}
                                <label className="settings-field">
                                  <span className="settings-field-label">{app.credential.label}</span>
                                  <input
                                    type="password"
                                    value={pluginDraft.pluginID === activePlugin.id ? pluginDraft.appApiKeys[app.appID] ?? "" : ""}
                                    placeholder={app.credential.placeholder}
                                    disabled={!activeInstalledPlugin || activePluginBusy || isSavingConnector}
                                    onChange={(event) => onPluginDraftAppApiKeyChange(app.appID, event.target.value)}
                                  />
                                  <small>{app.credential.description ?? "Stored separately from MCP server config."}</small>
                                </label>
                                <div className="settings-actions-row plugins-actions-row">
                                  <button
                                    className="secondary-button"
                                    type="button"
                                    disabled={!activeInstalledPlugin || activePluginBusy || isSavingConnector}
                                    onClick={() => onSaveInstalledPluginConnectorApiKey(activePlugin.id, app.appID)}
                                  >
                                    {isSavingConnector ? "Saving..." : status?.connected ? "Update key" : "Connect"}
                                  </button>
                                  <button
                                    className="secondary-button"
                                    type="button"
                                    disabled={!activeInstalledPlugin || activePluginBusy || !status?.connected || isDiagnosingConnector}
                                    onClick={() => onDiagnoseInstalledPluginConnector(activePlugin.id, app.appID)}
                                  >
                                    {isDiagnosingConnector ? "Diagnosing..." : "Diagnose"}
                                  </button>
                                  <button
                                    className="secondary-button is-danger"
                                    type="button"
                                    disabled={!activeInstalledPlugin || activePluginBusy || !status?.connected || isSavingConnector}
                                    onClick={() => onDeleteInstalledPluginConnectorApiKey(activePlugin.id, app.appID)}
                                  >
                                    Disconnect
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="settings-page-copy">No app connectors.</p>
                      )}
                    </section>

                    <section className="settings-panel">
                      <div className="settings-section-header">
                        <div>
                          <span className="label">Configuration</span>
                          <h3>Plugin Values</h3>
                        </div>
                        <p>
                          {activePlugin.configFields.length > 0
                            ? "Values are used to render the MCP command, environment, or remote request."
                            : "This plugin does not require configuration."}
                        </p>
                      </div>

                      {activePlugin.configFields.length > 0 ? (
                        <div className="settings-field-grid plugins-config-grid">
                          {activePlugin.configFields.map((field) => (
                            <label key={field.key} className="settings-field">
                              <span className="settings-field-label">
                                {field.label}
                                {field.required ? <span aria-hidden="true"> *</span> : null}
                              </span>
                              <input
                                type={field.type === "password" ? "password" : field.type === "url" ? "url" : "text"}
                                value={pluginDraft.pluginID === activePlugin.id ? pluginDraft.config[field.key] ?? "" : ""}
                                placeholder={field.placeholder}
                                onChange={(event) => onPluginDraftConfigChange(field.key, event.target.value)}
                              />
                              {field.description ? <small>{field.description}</small> : null}
                            </label>
                          ))}
                        </div>
                      ) : (
                        <p className="settings-page-copy">No required fields.</p>
                      )}

                      <div className="settings-actions-row plugins-actions-row">
                        {activeInstalledPlugin ? (
                          <>
                            <button
                              className="secondary-button"
                              type="button"
                              disabled={activePluginBusy}
                              onClick={() => onSetInstalledPluginEnabled(activePlugin.id, !activeInstalledPlugin.enabled)}
                            >
                              {activeInstalledPlugin.enabled ? "Disable" : "Enable"}
                            </button>
                            <button
                              className="secondary-button"
                              type="button"
                              disabled={activePluginBusy}
                              onClick={() => onDiagnoseInstalledPlugin(activePlugin.id)}
                            >
                              {diagnosingPluginID === activePlugin.id ? "Diagnosing..." : "Diagnose"}
                            </button>
                            <button
                              className="secondary-button"
                              type="button"
                              disabled={activePluginBusy || !activePluginConfigChanged}
                              onClick={() => onSaveInstalledPluginConfig(activePlugin.id)}
                            >
                              {updatingPluginID === activePlugin.id ? "Saving..." : "Save config"}
                            </button>
                            <button
                              className="secondary-button is-danger"
                              type="button"
                              disabled={activePluginBusy}
                              onClick={() => onDeleteInstalledPlugin(activePlugin.id)}
                            >
                              {deletingPluginID === activePlugin.id ? "Removing..." : "Remove"}
                            </button>
                          </>
                        ) : (
                          <button
                            className="primary-button"
                            type="button"
                            disabled={!canInstallActivePlugin}
                            onClick={() => onInstallPlugin(activePlugin.id)}
                          >
                            {installingPluginID === activePlugin.id ? "Installing..." : "Install"}
                          </button>
                        )}
                      </div>
                    </section>
                  </div>
                </>
              ) : (
                <article className="settings-empty-state">
                  <span className="label">No Plugins</span>
                  <h3>The curated catalog is empty</h3>
                  <p>No plugin catalog entries are available from the local agent.</p>
                </article>
              )}
            </div>
            </section>
          )}
        </>
      </div>
    </section>
  )
}
