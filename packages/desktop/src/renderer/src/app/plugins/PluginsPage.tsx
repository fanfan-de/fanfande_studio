import { useMemo, useState, type MouseEvent, type ReactNode } from "react"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  ConnectedStatusIcon,
  DeleteIcon,
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
  onCancelInstalledPluginConnectorAuthFlow: (pluginID: string, appID: string) => boolean | Promise<boolean>
  onDeleteInstalledPluginConnectorApiKey: (pluginID: string, appID: string) => boolean | Promise<boolean>
  onDeleteInstalledPluginConnectorAuthSession: (pluginID: string, appID: string) => boolean | Promise<boolean>
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
  onStartInstalledPluginConnectorAuthFlow: (pluginID: string, appID: string) => boolean | Promise<boolean>
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

function generatedServerID(plugin: PluginCatalogItem, server: PluginCatalogItem["mcpServers"][number]) {
  return server.id === "default" ? `plugin.${plugin.id}` : `plugin.${plugin.id}.${server.id}`
}

function toolSummary(tools?: Array<{ name: string; title?: string }>) {
  if (!tools?.length) return "No static tools declared"
  return tools.map((tool) => tool.title ?? tool.name).join(", ")
}

function permissionSummary(permissions?: string[]) {
  return permissions?.length ? permissions.join(", ") : "No extra permissions declared"
}

function credentialKindLabel(kind: "api_key" | "oauth" | undefined) {
  return kind === "oauth" ? "OAuth" : "API key"
}

function connectorStatusLabel(status: PluginConnectorStatus | undefined) {
  if (!status) return "Not connected"
  if (status.authStatus === "pending") return "Signing in"
  if (status.authStatus === "expired") return "Expired"
  if (status.authStatus === "error") return "Error"
  return status.connected ? "Connected" : "Not connected"
}

function openPluginExternalUrl(url: string) {
  const normalizedUrl = url.trim()
  if (!normalizedUrl) return

  const openExternalUrl = window.desktop?.openExternalUrl
  if (openExternalUrl) {
    void openExternalUrl({ url: normalizedUrl }).catch((error) => {
      console.error("[plugins] Failed to open external URL.", error)
      window.open(normalizedUrl, "_blank", "noopener,noreferrer")
    })
    return
  }

  window.open(normalizedUrl, "_blank", "noopener,noreferrer")
}

function handlePluginInfoLinkClick(event: MouseEvent<HTMLAnchorElement>, url: string) {
  if (event.defaultPrevented) return
  event.preventDefault()
  openPluginExternalUrl(url)
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
  diagnosingPluginID,
  installingPluginID,
  installedPlugins,
  isLoading,
  loadError,
  message,
  pluginCatalog,
  pluginConnectorStatuses,
  updatingPluginID,
  windowControls,
  diagnosingPluginConnectorID,
  pluginDraft,
  savingPluginConnectorID,
  onCancelInstalledPluginConnectorAuthFlow,
  onDeleteInstalledPlugin,
  onDeleteInstalledPluginConnectorApiKey,
  onDeleteInstalledPluginConnectorAuthSession,
  onDiagnoseInstalledPluginConnector,
  onDismissMessage,
  onInstallPlugin,
  onPluginDraftAppApiKeyChange,
  onPluginDeselect,
  onPluginSelect,
  onSaveInstalledPluginConnectorApiKey,
  onStartInstalledPluginConnectorAuthFlow,
}: PluginsPageProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<PluginCategory | "All">("All")
  const [publisherFilter, setPublisherFilter] = useState(PUBLISHER_FILTER_ALL)
  const [expandedIncludedItemID, setExpandedIncludedItemID] = useState<string | null>(null)

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
  const pluginBusyIDs = useMemo(
    () => new Set([installingPluginID, updatingPluginID, deletingPluginID, diagnosingPluginID].filter(Boolean) as string[]),
    [deletingPluginID, diagnosingPluginID, installingPluginID, updatingPluginID],
  )
  const canInstallPlugin = (plugin: PluginCatalogItem) => {
    const installed = installedByPluginID.get(plugin.id)
    return (!installed || Boolean(installed.missingPackage)) &&
      plugin.installable !== false &&
      plugin.risk !== "critical" &&
      !pluginBusyIDs.has(plugin.id)
  }
  const canInstallActivePlugin = Boolean(activePlugin && canInstallPlugin(activePlugin))
  const canDeleteActivePlugin = Boolean(
    activePlugin &&
      activeInstalledPlugin &&
      !activeInstalledPlugin.missingPackage &&
      !pluginBusyIDs.has(activePlugin.id),
  )
  const activePluginInstallLabel = activePlugin && installingPluginID === activePlugin.id
    ? "Installing..."
    : activeInstalledPlugin?.missingPackage ? "Download again" : "Install"
  const activePluginUninstallLabel = activePlugin && deletingPluginID === activePlugin.id
    ? "Uninstalling..."
    : "Uninstall"
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
  const pluginDetailBreadcrumb = activePlugin ? (
    <nav className="plugins-detail-breadcrumb" aria-label="Plugin detail breadcrumb">
      <button type="button" onClick={onPluginDeselect}>插件</button>
      <ChevronRightIcon />
      <span>{activePlugin.name}</span>
    </nav>
  ) : null
  const toggleIncludedItem = (itemID: string) => {
    setExpandedIncludedItemID((currentItemID) => currentItemID === itemID ? null : itemID)
  }

  return (
    <section className="plugins-page" aria-label="Plugins">
      <ShellTopMenu
        as="header"
        ariaLabel="Plugins top menu"
        className="canvas-region-top-menu plugins-top-menu"
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
        {pluginDetailBreadcrumb}

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
                      {activePlugin.mcpServers.map((server) => {
                        const itemID = `${activePlugin.id}:mcp:${server.id}`
                        const isExpanded = expandedIncludedItemID === itemID

                        return (
                          <div key={`mcp:${server.id}`} className="plugins-included-item">
                            <button
                              className={isExpanded ? "plugins-included-row is-expanded" : "plugins-included-row"}
                              type="button"
                              aria-expanded={isExpanded}
                              aria-controls={`${itemID}:detail`}
                              aria-label={`Show details for ${server.name}`}
                              onClick={() => toggleIncludedItem(itemID)}
                            >
                              <span className="plugins-included-icon"><PluginIcon /></span>
                              <span className="plugins-included-copy">
                                <strong>{server.name}</strong>
                                <span>{runtimeTitle(server.runtime)}</span>
                              </span>
                              <span className={activeInstalledPlugin?.enabled ? "plugins-toggle is-on" : "plugins-toggle"} aria-hidden="true">
                                <span />
                              </span>
                              <span className="plugins-included-chevron" aria-hidden="true"><ChevronDownIcon /></span>
                            </button>
                            {isExpanded ? (
                              <div className="plugins-included-detail" id={`${itemID}:detail`}>
                                <dl className="plugins-included-detail-grid">
                                  <div>
                                    <dt>Type</dt>
                                    <dd>MCP server</dd>
                                  </div>
                                  <div>
                                    <dt>Server ID</dt>
                                    <dd>{generatedServerID(activePlugin, server)}</dd>
                                  </div>
                                  <div>
                                    <dt>Runtime</dt>
                                    <dd>{runtimePrimary(server.runtime)}</dd>
                                  </div>
                                  <div>
                                    <dt>Runtime details</dt>
                                    <dd>{runtimeSecondary(server.runtime)}</dd>
                                  </div>
                                  <div>
                                    <dt>Tools</dt>
                                    <dd>{toolSummary(server.tools)}</dd>
                                  </div>
                                  <div>
                                    <dt>Permissions</dt>
                                    <dd>{permissionSummary(server.permissions)}</dd>
                                  </div>
                                  {server.description ? (
                                    <div className="is-wide">
                                      <dt>Description</dt>
                                      <dd>{server.description}</dd>
                                    </div>
                                  ) : null}
                                </dl>
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                      {activePlugin.skills.map((skill) => {
                        const itemID = `${activePlugin.id}:skill:${skill.id}`
                        const isExpanded = expandedIncludedItemID === itemID

                        return (
                          <div key={`skill:${skill.id}`} className="plugins-included-item">
                            <button
                              className={isExpanded ? "plugins-included-row is-expanded" : "plugins-included-row"}
                              type="button"
                              aria-expanded={isExpanded}
                              aria-controls={`${itemID}:detail`}
                              aria-label={`Show details for ${skill.name}`}
                              onClick={() => toggleIncludedItem(itemID)}
                            >
                              <span className="plugins-included-icon"><SettingsIcon /></span>
                              <span className="plugins-included-copy">
                                <strong>{skill.name}</strong>
                                <span>{skill.description}</span>
                              </span>
                              <span className={activeInstalledPlugin?.enabled ? "plugins-toggle is-on" : "plugins-toggle"} aria-hidden="true">
                                <span />
                              </span>
                              <span className="plugins-included-chevron" aria-hidden="true"><ChevronDownIcon /></span>
                            </button>
                            {isExpanded ? (
                              <div className="plugins-included-detail" id={`${itemID}:detail`}>
                                <dl className="plugins-included-detail-grid">
                                  <div>
                                    <dt>Type</dt>
                                    <dd>Helper skill</dd>
                                  </div>
                                  <div>
                                    <dt>Skill ID</dt>
                                    <dd>{skill.id}</dd>
                                  </div>
                                  <div>
                                    <dt>Directory</dt>
                                    <dd>{skill.directory}</dd>
                                  </div>
                                  <div className="is-wide">
                                    <dt>Description</dt>
                                    <dd>{skill.description}</dd>
                                  </div>
                                </dl>
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                      {activePlugin.apps.map((app) => {
                        const itemID = `${activePlugin.id}:app:${app.appID}`
                        const isExpanded = expandedIncludedItemID === itemID
                        const status = activeConnectorStatusByAppID.get(app.appID)
                        const connectorKey = `${activePlugin.id}:${app.appID}`
                        const credentialKind = app.credential.kind === "oauth" ? "oauth" : "api_key"
                        const apiKeyCredential = app.credential.kind === "oauth" ? null : app.credential
                        const isBusy = savingPluginConnectorID === connectorKey
                        const isDiagnosing = diagnosingPluginConnectorID === connectorKey
                        const activeFlow = status?.activeFlow
                        const hasPendingFlow = activeFlow && ["pending", "waiting_user", "authorizing"].includes(activeFlow.status)

                        return (
                          <div key={`app:${app.appID}`} className="plugins-included-item">
                            <button
                              className={isExpanded ? "plugins-included-row is-expanded" : "plugins-included-row"}
                              type="button"
                              aria-expanded={isExpanded}
                              aria-controls={`${itemID}:detail`}
                              aria-label={`Show details for ${app.name}`}
                              onClick={() => toggleIncludedItem(itemID)}
                            >
                              <span className="plugins-included-icon"><ConnectedStatusIcon /></span>
                              <span className="plugins-included-copy">
                                <strong>{app.name}</strong>
                                <span>{app.description ?? "Connector-backed remote MCP"}</span>
                              </span>
                              <span className={status?.connected ? "plugins-toggle is-on" : "plugins-toggle"} aria-hidden="true">
                                <span />
                              </span>
                              <span className="plugins-included-chevron" aria-hidden="true"><ChevronDownIcon /></span>
                            </button>
                            {isExpanded ? (
                              <div className="plugins-included-detail" id={`${itemID}:detail`}>
                                <dl className="plugins-included-detail-grid">
                                  <div>
                                    <dt>Type</dt>
                                    <dd>App connector</dd>
                                  </div>
                                  <div>
                                    <dt>Status</dt>
                                    <dd>{connectorStatusLabel(status)}</dd>
                                  </div>
                                  <div>
                                    <dt>Connector ID</dt>
                                    <dd>plugin-app:{activePlugin.id}:{app.appID}</dd>
                                  </div>
                                  <div>
                                    <dt>Credential</dt>
                                    <dd>{app.credential.label}</dd>
                                  </div>
                                  <div>
                                    <dt>Credential kind</dt>
                                    <dd>{credentialKindLabel(credentialKind)}</dd>
                                  </div>
                                  {status?.email ? (
                                    <div>
                                      <dt>Account</dt>
                                      <dd>{status.email}</dd>
                                    </div>
                                  ) : null}
                                  <div>
                                    <dt>Endpoint</dt>
                                    <dd>{runtimePrimary(app.runtime)}</dd>
                                  </div>
                                  <div>
                                    <dt>Tools</dt>
                                    <dd>{toolSummary(app.tools)}</dd>
                                  </div>
                                  <div>
                                    <dt>Permissions</dt>
                                    <dd>{permissionSummary(app.permissions)}</dd>
                                  </div>
                                  <div className="is-wide">
                                    <dt>Description</dt>
                                    <dd>{app.description ?? app.credential.description ?? "Connector-backed remote MCP"}</dd>
                                  </div>
                                </dl>
                                {activeInstalledPlugin ? (
                                  <div className="plugins-connector-actions">
                                    {!apiKeyCredential ? (
                                      <>
                                        {hasPendingFlow ? (
                                          <button
                                            className="plugins-detail-uninstall-button"
                                            type="button"
                                            disabled={isBusy}
                                            onClick={() => void onCancelInstalledPluginConnectorAuthFlow(activePlugin.id, app.appID)}
                                          >
                                            {isBusy ? "Cancelling..." : "Cancel sign-in"}
                                          </button>
                                        ) : (
                                          <button
                                            className="plugins-detail-install-button"
                                            type="button"
                                            disabled={isBusy}
                                            onClick={() => void onStartInstalledPluginConnectorAuthFlow(activePlugin.id, app.appID)}
                                          >
                                            {isBusy ? "Opening..." : status?.connected ? "Reconnect" : "Sign in"}
                                          </button>
                                        )}
                                        {status?.connected ? (
                                          <button
                                            className="plugins-detail-uninstall-button"
                                            type="button"
                                            disabled={isBusy}
                                            onClick={() => void onDeleteInstalledPluginConnectorAuthSession(activePlugin.id, app.appID)}
                                          >
                                            {isBusy ? "Disconnecting..." : "Disconnect"}
                                          </button>
                                        ) : null}
                                      </>
                                    ) : (
                                      <>
                                        <label className="plugins-connector-key-field">
                                          <span>{app.credential.label}</span>
                                          <input
                                            type="password"
                                            value={pluginDraft.appApiKeys[app.appID] ?? ""}
                                            placeholder={apiKeyCredential.placeholder ?? "Enter API key"}
                                            onChange={(event) => onPluginDraftAppApiKeyChange(app.appID, event.target.value)}
                                          />
                                        </label>
                                        <button
                                          className="plugins-detail-install-button"
                                          type="button"
                                          disabled={isBusy}
                                          onClick={() => void onSaveInstalledPluginConnectorApiKey(activePlugin.id, app.appID)}
                                        >
                                          {isBusy ? "Saving..." : "Update key"}
                                        </button>
                                        {status?.connected ? (
                                          <button
                                            className="plugins-detail-uninstall-button"
                                            type="button"
                                            disabled={isBusy}
                                            onClick={() => void onDeleteInstalledPluginConnectorApiKey(activePlugin.id, app.appID)}
                                          >
                                            {isBusy ? "Clearing..." : "Disconnect"}
                                          </button>
                                        ) : null}
                                      </>
                                    )}
                                    <button
                                      className="plugins-detail-uninstall-button"
                                      type="button"
                                      disabled={isDiagnosing}
                                      onClick={() => void onDiagnoseInstalledPluginConnector(activePlugin.id, app.appID)}
                                    >
                                      {isDiagnosing ? "Checking..." : "Diagnose"}
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
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
                          <a
                            className="plugins-info-link"
                            href={activePlugin.homepage}
                            target="_blank"
                            rel="noreferrer"
                            title={`Open ${activePlugin.name} website`}
                            onClick={(event) => handlePluginInfoLinkClick(event, activePlugin.homepage!)}
                          >
                            <span className="plugins-info-link-text">{activePlugin.homepage}</span>
                            <OpenExternalIcon />
                          </a>
                        ) : (
                          <strong>未提供</strong>
                        )}
                      </div>
                      <div>
                        <span>文档</span>
                        {activePlugin.documentationUrl ? (
                          <a
                            className="plugins-info-link"
                            href={activePlugin.documentationUrl}
                            target="_blank"
                            rel="noreferrer"
                            title={`Open ${activePlugin.name} documentation`}
                            onClick={(event) => handlePluginInfoLinkClick(event, activePlugin.documentationUrl!)}
                          >
                            <span className="plugins-info-link-text">{activePlugin.documentationUrl}</span>
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
                    <div className="plugins-detail-actions" aria-label={`${activePlugin.name} plugin actions`}>
                      {activeInstalledPlugin && !activeInstalledPlugin.missingPackage ? (
                        <>
                          <span className="plugins-detail-action-status" aria-label={`${activePlugin.name} installed`}>
                            <ConnectedStatusIcon />
                            <span>{activeInstalledPlugin.enabled ? "Installed" : "Disabled"}</span>
                          </span>
                          <button
                            className="plugins-detail-uninstall-button"
                            type="button"
                            aria-label={`Uninstall ${activePlugin.name}`}
                            disabled={!canDeleteActivePlugin}
                            onClick={() => void onDeleteInstalledPlugin(activePlugin.id)}
                          >
                            <DeleteIcon />
                            <span>{activePluginUninstallLabel}</span>
                          </button>
                        </>
                      ) : (
                        <button
                          className="plugins-detail-install-button"
                          type="button"
                          aria-label={`Install ${activePlugin.name}`}
                          disabled={!canInstallActivePlugin}
                          onClick={() => onInstallPlugin(activePlugin.id)}
                        >
                          <PlusIcon />
                          <span>{activePluginInstallLabel}</span>
                        </button>
                      )}
                    </div>
                  </section>
                </>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </section>
  )
}
