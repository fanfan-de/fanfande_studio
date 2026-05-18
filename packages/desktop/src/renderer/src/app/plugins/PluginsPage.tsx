import { useMemo, useState, type ReactNode } from "react"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  ConnectedStatusIcon,
  OpenExternalIcon,
  PluginIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
} from "../icons"
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
  onPluginDeselect: () => void
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

const CATEGORY_LABELS: Record<PluginCategory | "All", string> = {
  All: "全部",
  Code: "Coding",
  Browser: "Browser",
  Git: "Git",
  Database: "Database",
  Docs: "Docs",
  Automation: "Automation",
  Design: "Design",
}

const PUBLISHER_FILTER_ALL = "All"
const FEATURED_PLUGIN_LIMIT = 3

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

function categoryClassName(category: PluginCategory) {
  return `is-${category.toLowerCase()}`
}

function pluginInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "P"
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase()
}

function capabilitySummary(plugin: PluginCatalogItem) {
  const parts = [
    plugin.mcpServers.length > 0 ? `${plugin.mcpServers.length} MCP` : null,
    plugin.tools.length > 0 ? `${plugin.tools.length} tools` : null,
    plugin.apps.length > 0 ? `${plugin.apps.length} connectors` : null,
  ].filter(Boolean)

  return parts.join(" / ") || plugin.category
}

function pluginImageURL(plugin: PluginCatalogItem, kind: "icon" | "thumbnail" | "hero") {
  if (kind === "icon") return plugin.iconUrl ?? (plugin.icon && isImageIcon(plugin.icon) ? plugin.icon : undefined)
  if (kind === "thumbnail") return plugin.thumbnailUrl ?? plugin.heroImageUrl ?? plugin.screenshots?.[0]
  return plugin.heroImageUrl ?? plugin.thumbnailUrl ?? plugin.screenshots?.[0]
}

function cssURL(url: string) {
  return `url("${url.replace(/["\\\n\r\f]/g, "\\$&")}")`
}

function pluginHeroBackground(url: string) {
  return `linear-gradient(180deg, rgba(255, 255, 255, 0.24), rgba(255, 255, 255, 0.72)), ${cssURL(url)}`
}

function pluginBrandColor(plugin: PluginCatalogItem) {
  const color = plugin.brandColor?.trim()
  return color && /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) ? color : undefined
}

function packageStatusLabel(plugin: PluginCatalogItem, installed: InstalledPlugin | null) {
  if (installed?.missingPackage) return "Package missing"
  if (installed) return installed.enabled ? "Installed, enabled" : "Installed, disabled"
  if (plugin.installable === false) return "Meta only"
  return plugin.download?.url ? "Download available" : "Local package"
}

function pluginDetailDescription(plugin: PluginCatalogItem) {
  if (plugin.longDescription?.trim()) return plugin.longDescription.trim()

  const capabilityCount = plugin.mcpServers.length + plugin.skills.length + plugin.apps.length
  const capabilityLabel = capabilityCount === 1 ? "capability" : "capabilities"

  return `${plugin.description} This plugin includes ${capabilityCount} ${capabilityLabel} for ${plugin.category.toLowerCase()} workflows and can be enabled per project after installation.`
}

function pluginFunctionLabel(plugin: PluginCatalogItem) {
  const toolModes = new Set<string>(plugin.tools.map((tool) => (tool.readOnly ? "Read" : "Write")))
  if (plugin.apps.length > 0) toolModes.add("Interactive")
  if (plugin.mcpServers.length > 0) toolModes.add("MCP")
  if (toolModes.size === 0) toolModes.add(plugin.category)

  return Array.from(toolModes).join(", ")
}

function pluginPromptExamples(plugin: PluginCatalogItem) {
  const primaryTool = plugin.tools[0]?.title ?? plugin.tools[0]?.name
  const connector = plugin.apps[0]?.name
  const target = primaryTool ?? connector ?? plugin.category.toLowerCase()

  return [
    `${plugin.name} help me inspect this ${target} workflow`,
    `${plugin.name} create a clean project-ready result from the current context`,
    `${plugin.name} verify the output and summarize what changed`,
  ]
}

function isImageIcon(icon: string) {
  return /^(https?:\/\/|data:image\/)/.test(icon)
}

function PluginMark({ plugin }: { plugin: PluginCatalogItem }) {
  const icon = pluginImageURL(plugin, "icon") ?? plugin.icon?.trim()

  return (
    <span className={`plugins-icon-mark ${categoryClassName(plugin.category)}`} aria-hidden="true">
      {icon && isImageIcon(icon) ? (
        <img src={icon} alt="" />
      ) : icon && icon.length <= 4 ? (
        <span className="plugins-icon-glyph">{icon}</span>
      ) : (
        <span className="plugins-icon-initials">{pluginInitials(plugin.name)}</span>
      )}
    </span>
  )
}

function PluginMarketVisual({ plugin }: { plugin: PluginCatalogItem }) {
  const thumbnail = pluginImageURL(plugin, "thumbnail")

  if (!thumbnail) return <PluginMark plugin={plugin} />

  return (
    <span className="plugins-market-item-visual" aria-hidden="true">
      <img src={thumbnail} alt="" />
      <span className="plugins-market-item-visual-mark">
        <PluginMark plugin={plugin} />
      </span>
    </span>
  )
}

interface PluginMarketItemProps {
  canInstall: boolean
  installed: InstalledPlugin | null
  isActive: boolean
  isBusy: boolean
  plugin: PluginCatalogItem
  onInstallPlugin: (pluginID: string) => boolean | Promise<boolean>
  onPluginSelect: (pluginID: string) => void
}

function PluginMarketItem({
  canInstall,
  installed,
  isActive,
  isBusy,
  plugin,
  onInstallPlugin,
  onPluginSelect,
}: PluginMarketItemProps) {
  const packageMissing = Boolean(installed?.missingPackage)
  const installState = packageMissing
    ? "package missing"
    : installed ? (installed.enabled ? "installed enabled" : "installed disabled") : "not installed"

  return (
    <div className={isActive ? "plugins-market-item is-active" : "plugins-market-item"}>
      <button
        className="plugins-market-item-main"
        type="button"
        aria-label={`${plugin.name} ${installState}`}
        aria-pressed={isActive}
        onClick={() => onPluginSelect(plugin.id)}
      >
        <PluginMarketVisual plugin={plugin} />
        <span className="plugins-market-item-copy">
          <strong>{plugin.name}</strong>
          <span>{plugin.description}</span>
        </span>
      </button>
      <span className="plugins-market-item-status">
        {installed && !packageMissing ? (
          <ConnectedStatusIcon />
        ) : (
          <button
            className="plugins-market-install-button"
            type="button"
            aria-label={`Install ${plugin.name}`}
            disabled={!canInstall || isBusy}
            onClick={() => onInstallPlugin(plugin.id)}
          >
            <PlusIcon />
          </button>
        )}
      </span>
    </div>
  )
}

interface PluginSectionProps {
  canInstallPlugin: (plugin: PluginCatalogItem) => boolean
  installedByPluginID: Map<string, InstalledPlugin>
  pluginBusyIDs: Set<string>
  plugins: PluginCatalogItem[]
  selectedPluginID: string | null
  title: string
  onInstallPlugin: (pluginID: string) => boolean | Promise<boolean>
  onPluginSelect: (pluginID: string) => void
}

function PluginSection({
  canInstallPlugin,
  installedByPluginID,
  pluginBusyIDs,
  plugins,
  selectedPluginID,
  title,
  onInstallPlugin,
  onPluginSelect,
}: PluginSectionProps) {
  if (plugins.length === 0) return null

  return (
    <section className="plugins-directory-section" aria-label={`${title} plugins`}>
      <div className="plugins-directory-section-header">
        <h2>{title}</h2>
      </div>
      <div className="plugins-directory-grid" role="list" aria-label={title}>
        {plugins.map((plugin) => {
          const installed = installedByPluginID.get(plugin.id) ?? null

          return (
            <div key={plugin.id} role="listitem">
              <PluginMarketItem
                canInstall={canInstallPlugin(plugin)}
                installed={installed}
                isActive={plugin.id === selectedPluginID}
                isBusy={pluginBusyIDs.has(plugin.id)}
                plugin={plugin}
                onInstallPlugin={onInstallPlugin}
                onPluginSelect={onPluginSelect}
              />
            </div>
          )
        })}
      </div>
    </section>
  )
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
  onPluginDeselect,
  onPluginSelect,
  onSaveInstalledPluginConnectorApiKey,
  onSaveInstalledPluginConfig,
  onSetInstalledPluginEnabled,
}: PluginsPageProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<PluginCategory | "All">("All")
  const [publisherFilter, setPublisherFilter] = useState(PUBLISHER_FILTER_ALL)

  const installedByPluginID = useMemo(
    () => new Map(installedPlugins.map((plugin) => [plugin.pluginID, plugin])),
    [installedPlugins],
  )
  const publisherFilters = useMemo(
    () => Array.from(new Set(pluginCatalog.map((plugin) => plugin.publisher).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [pluginCatalog],
  )
  const filteredPlugins = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    return pluginCatalog.filter((plugin) => {
      if (categoryFilter !== "All" && plugin.category !== categoryFilter) return false
      if (publisherFilter !== PUBLISHER_FILTER_ALL && plugin.publisher !== publisherFilter) return false
      if (!normalizedQuery) return true

      return [
        plugin.name,
        plugin.publisher,
        plugin.description,
        plugin.longDescription ?? "",
        plugin.category,
        (plugin.tags ?? []).join(" "),
        plugin.tools.map((tool) => tool.name).join(" "),
        plugin.skills.map((skill) => skill.name).join(" "),
        plugin.apps.map((app) => app.name).join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    })
  }, [categoryFilter, pluginCatalog, publisherFilter, searchQuery])

  const activePlugin = activePluginID ? pluginCatalog.find((plugin) => plugin.id === activePluginID) ?? null : null
  const activeInstalledPlugin = activePlugin ? installedByPluginID.get(activePlugin.id) ?? null : null
  const activeConnectorStatuses = activePlugin ? pluginConnectorStatuses[activePlugin.id] ?? [] : []
  const activeConnectorStatusByAppID = useMemo(
    () => new Map(activeConnectorStatuses.map((status) => [status.appID, status])),
    [activeConnectorStatuses],
  )
  const activeDiagnostic = activePlugin
    ? diagnosticFor(activePlugin.id, activeInstalledPlugin, pluginDiagnostics)
    : null
  const pluginBusyIDs = useMemo(
    () => new Set([installingPluginID, updatingPluginID, deletingPluginID, diagnosingPluginID].filter(Boolean) as string[]),
    [deletingPluginID, diagnosingPluginID, installingPluginID, updatingPluginID],
  )
  const activePluginBusy = Boolean(activePlugin && pluginBusyIDs.has(activePlugin.id))
  const activePluginConfigChanged = activePlugin
    ? hasConfigChanges(activePlugin, activeInstalledPlugin, pluginDraft)
    : false
  const canInstallPlugin = (plugin: PluginCatalogItem) => {
    const installed = installedByPluginID.get(plugin.id)
    return (!installed || Boolean(installed.missingPackage)) &&
      plugin.installable !== false &&
      plugin.risk !== "critical" &&
      !pluginBusyIDs.has(plugin.id)
  }
  const canInstallActivePlugin = Boolean(activePlugin && canInstallPlugin(activePlugin))
  const hasDirectoryFilters =
    searchQuery.trim().length > 0 ||
    categoryFilter !== "All" ||
    publisherFilter !== PUBLISHER_FILTER_ALL
  const featuredPlugins = useMemo(() => {
    const installedMatches = filteredPlugins.filter((plugin) => installedByPluginID.has(plugin.id))
    const priorityPlugins = installedMatches.length > 0 ? installedMatches : filteredPlugins
    return priorityPlugins.slice(0, FEATURED_PLUGIN_LIMIT)
  }, [filteredPlugins, installedByPluginID])
  const shouldShowFeatured = !hasDirectoryFilters && featuredPlugins.length > 0
  const featuredPluginIDs = useMemo(() => new Set(featuredPlugins.map((plugin) => plugin.id)), [featuredPlugins])
  const directorySections = useMemo(() => {
    const groups = new Map<PluginCategory, PluginCatalogItem[]>()

    for (const plugin of filteredPlugins) {
      if (shouldShowFeatured && featuredPluginIDs.has(plugin.id)) continue

      const items = groups.get(plugin.category) ?? []
      items.push(plugin)
      groups.set(plugin.category, items)
    }

    return CATEGORY_FILTERS.flatMap((category) => {
      if (category === "All") return []
      const items = groups.get(category) ?? []
      return items.length > 0 ? [{ category, items }] : []
    })
  }, [featuredPluginIDs, filteredPlugins, shouldShowFeatured])
  const heroPlugin = featuredPlugins[0] ?? filteredPlugins[0] ?? pluginCatalog[0] ?? null
  const selectedPluginID = activePlugin?.id ?? null
  const hasPluginMatches = filteredPlugins.length > 0
  const isPluginDetailView = Boolean(activePlugin)
  const detailPromptExamples = activePlugin ? pluginPromptExamples(activePlugin) : []
  const heroImageURL = heroPlugin ? pluginImageURL(heroPlugin, "hero") : undefined
  const activeHeroImageURL = activePlugin ? pluginImageURL(activePlugin, "hero") : undefined
  const activeBrandColor = activePlugin ? pluginBrandColor(activePlugin) : undefined

  return (
    <section className="plugins-page" aria-label="Plugins">
      <ShellTopMenu
        as="header"
        ariaLabel="Plugins top menu"
        className="canvas-region-top-menu plugins-top-menu"
        layout={isPluginDetailView ? "three-column" : "split"}
        leading={activePlugin ? (
          <nav className="plugins-top-menu-breadcrumb" aria-label="Plugin detail breadcrumb">
            <button type="button" onClick={onPluginDeselect}>插件</button>
            <ChevronRightIcon />
            <span>{activePlugin.name}</span>
          </nav>
        ) : undefined}
        leadingClassName="plugins-top-menu-leading"
        contentClassName="plugins-top-menu-actions-shell"
        content={(
          <div className="plugins-top-menu-actions">
            {activePlugin ? (
              null
            ) : (
              <button className="plugins-top-menu-button" type="button" disabled>
                <SettingsIcon />
                <span>管理</span>
              </button>
            )}
          </div>
        )}
        dragRegion
        trailing={windowControls}
        trailingClassName="prompt-presets-top-menu-window-controls"
      />

      <div className="plugins-page-main">
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
          <article className="settings-empty-state plugins-loading-state">
            <span className="label">Loading</span>
            <h3>Fetching plugins</h3>
            <p>Reading the curated catalog and installed plugin state.</p>
          </article>
        ) : (
          <div className={isPluginDetailView ? "plugins-marketplace-shell is-detail-view" : "plugins-marketplace-shell"}>
            {!activePlugin ? (
              <>
                <header className="plugins-marketplace-header">
              <h1>让 Fanfande 按你的方式工作</h1>
              <div className="plugins-filter-row" aria-label="Plugin filters">
                <label className="plugins-search-control">
                  <SearchIcon />
                  <input
                    aria-label="Search"
                    type="search"
                    value={searchQuery}
                    placeholder="搜索插件"
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />
                </label>
                <label className="plugins-select-control">
                  <select aria-label="Builder" value={publisherFilter} onChange={(event) => setPublisherFilter(event.target.value)}>
                    <option value={PUBLISHER_FILTER_ALL}>Built by All</option>
                    {publisherFilters.map((publisher) => (
                      <option key={publisher} value={publisher}>
                        Built by {publisher}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon />
                </label>
                <label className="plugins-select-control is-category">
                  <select
                    aria-label="Category"
                    value={categoryFilter}
                    onChange={(event) => setCategoryFilter(event.target.value as PluginCategory | "All")}
                  >
                    {CATEGORY_FILTERS.map((category) => (
                      <option key={category} value={category}>
                        {CATEGORY_LABELS[category]}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon />
                </label>
              </div>
                </header>

                {heroPlugin ? (
                  <section
                    className={heroImageURL ? "plugins-featured-hero has-image" : "plugins-featured-hero"}
                    aria-label="Featured plugin spotlight"
                    style={heroImageURL ? { backgroundImage: pluginHeroBackground(heroImageURL) } : undefined}
                  >
                <div className="plugins-featured-message">
                  <PluginMark plugin={heroPlugin} />
                  <strong>{heroPlugin.name}</strong>
                  <span>{heroPlugin.description}</span>
                </div>
                <div className="plugins-hero-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                  </section>
                ) : null}

                <div className="plugins-directory" role="region" aria-label="Plugin marketplace layout">
              {hasPluginMatches ? (
                <>
                  {shouldShowFeatured ? (
                    <PluginSection
                      canInstallPlugin={canInstallPlugin}
                      installedByPluginID={installedByPluginID}
                      pluginBusyIDs={pluginBusyIDs}
                      plugins={featuredPlugins}
                      selectedPluginID={selectedPluginID}
                      title="Featured"
                      onInstallPlugin={onInstallPlugin}
                      onPluginSelect={onPluginSelect}
                    />
                  ) : null}

                  {directorySections.map(({ category, items }) => (
                    <PluginSection
                      key={category}
                      canInstallPlugin={canInstallPlugin}
                      installedByPluginID={installedByPluginID}
                      pluginBusyIDs={pluginBusyIDs}
                      plugins={items}
                      selectedPluginID={selectedPluginID}
                      title={CATEGORY_LABELS[category]}
                      onInstallPlugin={onInstallPlugin}
                      onPluginSelect={onPluginSelect}
                    />
                  ))}
                </>
              ) : (
                <article className="settings-empty-state plugins-directory-empty-state">
                  <span className="label">No Matches</span>
                  <h3>No plugins match the current filters</h3>
                  <p>Adjust the search text, builder, or category filter.</p>
                </article>
              )}
                </div>
              </>
            ) : null}

            {activePlugin ? (
              <section className="plugins-management-detail" aria-label="Selected plugin details">
                <>
                  <header className="plugins-detail-header">
                    <PluginMark plugin={activePlugin} />
                    <h1>{activePlugin.name}</h1>
                    <p>{activePlugin.description}</p>
                    {(activePlugin.tags ?? []).length > 0 ? (
                      <div className="plugins-tag-row" aria-label={`${activePlugin.name} tags`}>
                        {(activePlugin.tags ?? []).slice(0, 8).map((tag) => (
                          <span key={tag} className="settings-badge">{tag}</span>
                        ))}
                      </div>
                    ) : null}
                  </header>

                  <section
                    className={activeHeroImageURL ? "plugins-detail-sample-hero has-image" : "plugins-detail-sample-hero"}
                    aria-label={`${activePlugin.name} example prompts`}
                    style={activeHeroImageURL ? { backgroundImage: pluginHeroBackground(activeHeroImageURL) } : undefined}
                  >
                    <div className="plugins-detail-prompt-stack">
                      {detailPromptExamples.map((prompt) => (
                        <div key={prompt} className="plugins-detail-prompt">
                          <PluginMark plugin={activePlugin} />
                          <span>
                            <strong>{activePlugin.name}</strong> {prompt.replace(activePlugin.name, "").trim()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>

                  <p className="plugins-detail-description">{pluginDetailDescription(activePlugin)}</p>

                  {(activePlugin.screenshots ?? []).length > 0 ? (
                    <section className="plugins-detail-section">
                      <h2>Screenshots</h2>
                      <div className="plugins-screenshot-grid">
                        {(activePlugin.screenshots ?? []).slice(0, 4).map((screenshot, index) => (
                          <img
                            key={screenshot}
                            src={screenshot}
                            alt={`${activePlugin.name} screenshot ${index + 1}`}
                          />
                        ))}
                      </div>
                    </section>
                  ) : null}

                  <section className="plugins-detail-section">
                    <h2>包含内容</h2>
                    <div className="plugins-included-card">
                      {activePlugin.mcpServers.map((server) => (
                        <div key={`mcp:${server.id}`} className="plugins-included-row">
                          <span className="plugins-included-icon"><PluginIcon /></span>
                          <span className="plugins-included-copy">
                            <strong>{server.name}</strong>
                            <span>{runtimeTitle(server.runtime)}</span>
                          </span>
                          <span className={activeInstalledPlugin?.enabled ? "plugins-toggle is-on" : "plugins-toggle"} aria-hidden="true">
                            <span />
                          </span>
                        </div>
                      ))}
                      {activePlugin.skills.map((skill) => (
                        <div key={`skill:${skill.id}`} className="plugins-included-row">
                          <span className="plugins-included-icon"><SettingsIcon /></span>
                          <span className="plugins-included-copy">
                            <strong>{skill.name}</strong>
                            <span>{skill.description}</span>
                          </span>
                          <span className={activeInstalledPlugin?.enabled ? "plugins-toggle is-on" : "plugins-toggle"} aria-hidden="true">
                            <span />
                          </span>
                        </div>
                      ))}
                      {activePlugin.apps.map((app) => (
                        <div key={`app:${app.appID}`} className="plugins-included-row">
                          <span className="plugins-included-icon"><ConnectedStatusIcon /></span>
                          <span className="plugins-included-copy">
                            <strong>{app.name}</strong>
                            <span>{app.description ?? "Connector-backed remote MCP"}</span>
                          </span>
                          <span className={activeConnectorStatusByAppID.get(app.appID)?.connected ? "plugins-toggle is-on" : "plugins-toggle"} aria-hidden="true">
                            <span />
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="plugins-detail-section">
                    <h2>信息</h2>
                    <div className="plugins-info-table">
                      <div>
                        <span>类别</span>
                        <strong>Built by {activePlugin.publisher}, {activePlugin.category}</strong>
                      </div>
                      <div>
                        <span>功能</span>
                        <strong>{pluginFunctionLabel(activePlugin)}</strong>
                      </div>
                      <div>
                        <span>开发者</span>
                        <strong>{activePlugin.publisher}</strong>
                      </div>
                      <div>
                        <span>版本</span>
                        <strong>{activePlugin.version}</strong>
                      </div>
                      <div>
                        <span>网站</span>
                        {activePlugin.homepage ? (
                          <a href={activePlugin.homepage} target="_blank" rel="noreferrer" aria-label={`${activePlugin.name} website`}>
                            <OpenExternalIcon />
                          </a>
                        ) : (
                          <strong>未提供</strong>
                        )}
                      </div>
                      <div>
                        <span>文档</span>
                        {activePlugin.documentationUrl ? (
                          <a href={activePlugin.documentationUrl} target="_blank" rel="noreferrer" aria-label={`${activePlugin.name} documentation`}>
                            <OpenExternalIcon />
                          </a>
                        ) : (
                          <strong>未提供</strong>
                        )}
                      </div>
                      <div>
                        <span>风险等级</span>
                        <strong>{activePlugin.risk}</strong>
                      </div>
                      {activeBrandColor ? (
                        <div>
                          <span>Brand</span>
                          <strong className="plugins-brand-color">
                            <span style={{ background: activeBrandColor }} />
                            {activeBrandColor}
                          </strong>
                        </div>
                      ) : null}
                    </div>
                  </section>

                  <div className="settings-detail-hero plugins-detail-hero">
                    <div>
                      <span className="label">Manage Plugin</span>
                      <h3>{activePlugin.name}</h3>
                      <p>{activePlugin.description}</p>
                    </div>

                    <div className="provider-row-statuses">
                      <span className="settings-badge">{activePlugin.category}</span>
                      <span className={riskBadgeClassName(activePlugin.risk)}>{activePlugin.risk}</span>
                      <span className={activeInstalledPlugin?.enabled ? "settings-badge is-highlight" : "settings-badge"}>
                        {packageStatusLabel(activePlugin, activeInstalledPlugin)}
                      </span>
                      <span className="settings-badge">{capabilitySummary(activePlugin)}</span>
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
                        <p>MCP servers and workflow helpers are enabled per project after installation.</p>
                      </div>
                      <div className="plugins-review-list">
                        <span>{activePlugin.mcpServers.length} MCP server{activePlugin.mcpServers.length === 1 ? "" : "s"}</span>
                        <span>{activePlugin.skills.length} helper{activePlugin.skills.length === 1 ? "" : "s"}</span>
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
                                <span className="settings-badge is-highlight">Helper</span>
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
                        {activeInstalledPlugin && !activeInstalledPlugin.missingPackage ? (
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
                            {installingPluginID === activePlugin.id
                              ? "Downloading..."
                              : activeInstalledPlugin?.missingPackage ? "Download again" : "Download and install"}
                          </button>
                        )}
                      </div>
                    </section>
                  </div>
                </>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </section>
  )
}
