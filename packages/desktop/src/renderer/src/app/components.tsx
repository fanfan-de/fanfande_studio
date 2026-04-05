import { useEffect, useRef, useState, type ChangeEvent, type Dispatch, type FocusEvent, type KeyboardEvent, type MouseEvent, type MutableRefObject, type PointerEvent, type RefObject, type SetStateAction } from "react"
import { canvasMenuItems, MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH, sidebarActions, titlebarMenus } from "./constants"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  DeleteIcon,
  FolderIcon,
  MaximizeIcon,
  MinimizeIcon,
  NavPlaceholderIcon,
  NewItemIcon,
  RestoreIcon,
  SettingsIcon,
  SortIcon,
} from "./icons"
import type {
  AssistantTraceItem,
  ProjectModelSelection,
  ProviderCatalogItem,
  ProviderDraftState,
  ProviderModel,
  SessionSummary,
  SidebarActionKey,
  TitlebarMenuKey,
  Turn,
  WindowAction,
  WorkspaceGroup,
} from "./types"
import { formatTime } from "./utils"

interface TitlebarProps {
  isWindowMaximized: boolean
  titlebarCommand: string
  onMenuClick: (menuKey: TitlebarMenuKey, event: MouseEvent<HTMLButtonElement>) => void
  onWindowAction: (action: WindowAction) => void
}

export function Titlebar({ isWindowMaximized, titlebarCommand, onMenuClick, onWindowAction }: TitlebarProps) {
  return (
    <header className="titlebar">
      <div className="titlebar-surface">
        <div className="titlebar-left">
          <div className="titlebar-brand" aria-hidden="true">
            <span className="titlebar-mark">*</span>
          </div>
          <nav className="titlebar-menus" aria-label="Application menu">
            {titlebarMenus.map((menu) => (
              <button key={menu.key} className="titlebar-menu-button" onClick={(event) => onMenuClick(menu.key, event)}>
                {menu.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="titlebar-right">
          <div className="titlebar-command">{titlebarCommand}</div>
          <div className="titlebar-controls" aria-label="Window controls">
            <button className="window-control" aria-label="Minimize window" onClick={() => onWindowAction("minimize")}>
              <MinimizeIcon />
            </button>
            <button
              className="window-control"
              aria-label={isWindowMaximized ? "Restore window" : "Maximize window"}
              onClick={() => onWindowAction("toggle-maximize")}
            >
              {isWindowMaximized ? <RestoreIcon /> : <MaximizeIcon />}
            </button>
            <button className="window-control is-close" aria-label="Close window" onClick={() => onWindowAction("close")}>
              <CloseIcon />
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}

interface SidebarProps {
  activeSessionID: string | null
  deletingSessionID: string | null
  expandedFolderID: string | null
  hoveredFolderID: string | null
  isCreatingProject: boolean
  isCreatingSession: boolean
  isSettingsOpen: boolean
  projectRowRefs: MutableRefObject<Record<string, HTMLButtonElement | null>>
  selectedFolderID: string | null
  workspaces: WorkspaceGroup[]
  onHoveredFolderChange: Dispatch<SetStateAction<string | null>>
  onOpenSettings: () => void
  onProjectClick: (workspace: WorkspaceGroup) => void
  onProjectCreateSession: (workspace: WorkspaceGroup, event: MouseEvent<HTMLButtonElement>) => void | Promise<void>
  onProjectRemove: (workspace: WorkspaceGroup, event: MouseEvent<HTMLButtonElement>) => void
  onSessionDelete: (workspace: WorkspaceGroup, session: SessionSummary, event: MouseEvent<HTMLButtonElement>) => void
  onSessionSelect: (workspaceID: string, sessionID: string) => void
  onSidebarAction: (action: SidebarActionKey) => void | Promise<void>
}

export function Sidebar({
  activeSessionID,
  deletingSessionID,
  expandedFolderID,
  hoveredFolderID,
  isCreatingProject,
  isCreatingSession,
  isSettingsOpen,
  projectRowRefs,
  selectedFolderID,
  workspaces,
  onHoveredFolderChange,
  onOpenSettings,
  onProjectClick,
  onProjectCreateSession,
  onProjectRemove,
  onSessionDelete,
  onSessionSelect,
  onSidebarAction,
}: SidebarProps) {
  return (
    <aside id="app-sidebar" className="sidebar" aria-label="Folder navigation">
      <div className="sidebar-actions" aria-label="Sidebar actions">
        {sidebarActions.map((action) => (
          <button
            key={action.key}
            className="sidebar-action"
            aria-label={action.label}
            title={action.label}
            disabled={action.key === "project" ? isCreatingProject : false}
            onClick={() => void onSidebarAction(action.key)}
          >
            {action.key === "project" ? <FolderIcon /> : null}
            {action.key === "sort" ? <SortIcon /> : null}
            {action.key === "new" ? <NewItemIcon /> : null}
          </button>
        ))}
      </div>

      <div className="sidebar-projects">
        {workspaces.map((workspace) => {
          const isActiveWorkspace = workspace.id === selectedFolderID
          const isExpanded = workspace.id === expandedFolderID
          const showStateIcon = workspace.id === hoveredFolderID
          const leadingIcon = showStateIcon ? (isExpanded ? "expanded" : "collapsed") : "folder"
          const removeLabel = "\u79FB\u9664"
          const removeFolderLabel = `${removeLabel} ${workspace.name}`
          const createSessionLabel = `Create session for ${workspace.name}`

          function handleProjectBlur(event: FocusEvent<HTMLDivElement>) {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
            onHoveredFolderChange((current) => (current === workspace.id ? null : current))
          }

          return (
            <section key={workspace.id} className="project-block">
              <div className="project-row-shell">
                <div
                  className={isActiveWorkspace ? "project-row is-active" : "project-row"}
                  onMouseEnter={() => onHoveredFolderChange(workspace.id)}
                  onMouseLeave={() => onHoveredFolderChange((current) => (current === workspace.id ? null : current))}
                  onFocus={() => onHoveredFolderChange(workspace.id)}
                  onBlur={handleProjectBlur}
                >
                  <button
                    ref={(node) => {
                      projectRowRefs.current[workspace.id] = node
                    }}
                    className="project-row-trigger"
                    aria-label={workspace.name}
                    aria-expanded={isExpanded}
                    data-folder-id={workspace.id}
                    onClick={() => onProjectClick(workspace)}
                  >
                  <span className="project-row-leading" data-icon={leadingIcon} data-testid={`project-leading-${workspace.id}`} aria-hidden="true">
                    {showStateIcon ? isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon /> : <FolderIcon />}
                  </span>
                  <span className="project-row-text">
                    <span className="project-row-label">{workspace.name}</span>
                    <span className="project-row-meta">{workspace.project.name}</span>
                  </span>
                </button>
                  <div className="project-row-actions" aria-label={`${workspace.name} actions`}>
                    <button
                      className="row-action project-row-action"
                      aria-label={removeFolderLabel}
                      title={removeFolderLabel}
                      onClick={(event) => onProjectRemove(workspace, event)}
                    >
                      <DeleteIcon />
                    </button>
                    <button
                      className="row-action project-row-action"
                      aria-label={createSessionLabel}
                      title={createSessionLabel}
                      disabled={isCreatingSession}
                      onClick={(event) => void onProjectCreateSession(workspace, event)}
                    >
                      <NewItemIcon />
                    </button>
                  </div>
                </div>
              </div>

              {isExpanded ? (
                <div className="session-tree">
                  {workspace.sessions.map((session) => {
                    const active = session.id === activeSessionID

                    return (
                      <div key={session.id} className="session-row-shell">
                        <button
                          className={active ? "session-row is-active" : "session-row"}
                          onClick={() => onSessionSelect(workspace.id, session.id)}
                        >
                          <span className="session-row-label">{session.title}</span>
                        </button>
                        <button
                          className="row-action"
                          aria-label={`Delete session ${session.title}`}
                          title={`Delete session ${session.title}`}
                          disabled={deletingSessionID === session.id}
                          onClick={(event) => onSessionDelete(workspace, session, event)}
                        >
                          <DeleteIcon />
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </section>
          )
        })}
      </div>

      <button
        className={isSettingsOpen ? "sidebar-settings is-active" : "sidebar-settings"}
        aria-label="Open settings"
        aria-pressed={isSettingsOpen}
        title="Open settings"
        onClick={onOpenSettings}
      >
        <SettingsIcon />
      </button>
    </aside>
  )
}

interface SidebarResizerProps {
  isSidebarResizing: boolean
  sidebarWidth: number
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void
}

export function SidebarResizer({ isSidebarResizing, sidebarWidth, onKeyDown, onPointerDown }: SidebarResizerProps) {
  return (
    <div
      className={isSidebarResizing ? "sidebar-resizer is-active" : "sidebar-resizer"}
      role="separator"
      aria-label="Resize sidebar"
      aria-controls="app-sidebar"
      aria-orientation="vertical"
      aria-valuemin={MIN_SIDEBAR_WIDTH}
      aria-valuemax={MAX_SIDEBAR_WIDTH}
      aria-valuenow={sidebarWidth}
      data-testid="sidebar-resizer"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
    />
  )
}

export function CanvasTopMenu() {
  return (
    <nav className="canvas-top-menu" aria-label="Main content menu">
      <div className="canvas-top-menu-group">
        {canvasMenuItems.map((item, index) => (
          <button key={item.key} className={index === 0 ? "canvas-top-menu-button is-active" : "canvas-top-menu-button"}>
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  )
}

function formatContextWindow(value: number) {
  if (value >= 1000) {
    const formatted = value >= 100000 ? Math.round(value / 1000) : Number((value / 1000).toFixed(1))
    return `${String(formatted).replace(/\.0$/, "")}k`
  }

  return String(value)
}

function providerSourceLabel(provider: ProviderCatalogItem) {
  if (provider.source === "config") return "Saved config"
  if (provider.source === "env") return "Environment"
  if (provider.source === "custom") return "Custom"
  return "Catalog"
}

function buildModelTags(model: ProviderModel) {
  const tags = [`${formatContextWindow(model.limit.context)} ctx`]

  if (model.capabilities.reasoning) tags.push("Reasoning")
  if (model.capabilities.toolcall) tags.push("Tools")
  if (model.capabilities.input.image || model.capabilities.attachment) tags.push("Vision")

  return tags
}

function toModelOptionLabel(model: ProviderModel, providers: ProviderCatalogItem[]) {
  const providerName = providers.find((item) => item.id === model.providerID)?.name ?? model.providerID
  return `${providerName} / ${model.name}`
}

function getProviderConnectionLabel(provider: ProviderCatalogItem) {
  if (provider.available) return "Connected"
  if (provider.apiKeyConfigured) return "Configured"
  return "Not connected"
}

function getProviderKeyPlaceholder(provider: ProviderCatalogItem) {
  if (provider.apiKeyConfigured) {
    return "Stored key detected. Leave blank to keep it."
  }

  if (provider.env.length > 0) {
    return `Or rely on ${provider.env.join(", ")}`
  }

  return "Enter API key"
}

function getProviderActionHint(provider: ProviderCatalogItem) {
  if (provider.source === "config") {
    return "Reset removes the saved provider configuration and falls back to environment or catalog defaults."
  }

  if (provider.source === "env") {
    return "This provider can also inherit credentials from the current environment."
  }

  return "Saving here updates the shared provider configuration for the app."
}

function matchesProviderSearch(provider: ProviderCatalogItem, rawQuery: string) {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return true

  const haystack = [
    provider.id,
    provider.name,
    provider.baseURL ?? "",
    provider.env.join(" "),
    providerSourceLabel(provider),
  ]
    .join(" ")
    .toLowerCase()

  return haystack.includes(query)
}

interface ModelListViewProps {
  catalog: ProviderCatalogItem[]
  models: ProviderModel[]
  selectionDraft: ProjectModelSelection
}

function ModelListView({ catalog, models, selectionDraft }: ModelListViewProps) {
  return (
    <div className="model-list">
      {models.map((model) => {
        const providerName = catalog.find((item) => item.id === model.providerID)?.name ?? model.providerID
        const modelValue = `${model.providerID}/${model.id}`

        return (
          <article key={modelValue} className="model-row">
            <div className="model-row-main">
              <div className="model-row-heading">
                <div>
                  <h4>{model.name}</h4>
                  <p className="model-row-copy">
                    <strong>{providerName}</strong>
                    {model.family ? ` / ${model.family}` : ""}
                  </p>
                </div>

                <div className="model-row-statuses">
                  <span className="settings-badge">{model.status}</span>
                  <span className="settings-badge">{model.available ? "Visible" : "Catalog"}</span>
                  {selectionDraft.model === modelValue ? <span className="settings-badge is-highlight">Primary</span> : null}
                  {selectionDraft.smallModel === modelValue ? <span className="settings-badge is-highlight">Small</span> : null}
                </div>
              </div>

              <div className="model-row-tags">
                {buildModelTags(model).map((tag) => (
                  <span key={`${modelValue}-${tag}`} className="settings-badge">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

interface SettingsPageProps {
  catalog: ProviderCatalogItem[]
  deletingProviderID: string | null
  isLoading: boolean
  isOpen: boolean
  isSavingSelection: boolean
  loadError: string | null
  message: {
    tone: "success" | "error"
    text: string
  } | null
  models: ProviderModel[]
  providerDrafts: Record<string, ProviderDraftState>
  savedSelection: ProjectModelSelection
  savingProviderID: string | null
  selectionDraft: ProjectModelSelection
  onClose: () => void
  onDeleteProvider: (providerID: string) => void | Promise<void>
  onProviderDraftChange: (providerID: string, field: keyof ProviderDraftState, value: string) => void
  onSaveProvider: (providerID: string) => boolean | Promise<boolean>
  onSaveSelection: () => void | Promise<void>
  onSelectionChange: (field: keyof ProjectModelSelection, value: string | null) => void
}

export function SettingsPage({
  catalog,
  deletingProviderID,
  isLoading,
  isOpen,
  isSavingSelection,
  loadError,
  message,
  models,
  providerDrafts,
  savedSelection,
  savingProviderID,
  selectionDraft,
  onClose,
  onDeleteProvider,
  onProviderDraftChange,
  onSaveProvider,
  onSaveSelection,
  onSelectionChange,
}: SettingsPageProps) {
  {
    const [activeSection, setActiveSection] = useState<"services" | "defaults">("services")
    const [selectedProviderID, setSelectedProviderID] = useState<string | null>(null)
    const [providerSearch, setProviderSearch] = useState("")
    const serviceDetailPanelRef = useRef<HTMLDivElement | null>(null)

    const modelGroups = models.reduce<Record<string, ProviderModel[]>>((result, model) => {
      result[model.providerID] = [...(result[model.providerID] ?? []), model]
      return result
    }, {})
    const connectedProviderIDs = new Set(catalog.filter((item) => item.available).map((item) => item.id))
    const visibleModels = models.filter((model) => model.available && connectedProviderIDs.has(model.providerID))
    const filteredCatalog = catalog.filter((provider) => matchesProviderSearch(provider, providerSearch))
    const activeProvider = selectedProviderID ? catalog.find((item) => item.id === selectedProviderID) ?? null : null
    const activeProviderDraft = activeProvider
      ? (providerDrafts[activeProvider.id] ?? {
          apiKey: "",
          baseURL: activeProvider.baseURL ?? "",
        })
      : null
    const activeProviderModels = activeProvider ? modelGroups[activeProvider.id] ?? [] : []
    const activeProviderBusy = activeProvider ? savingProviderID === activeProvider.id || deletingProviderID === activeProvider.id : false
    const activeProviderDirty = activeProvider
      ? (activeProviderDraft?.apiKey.trim().length ?? 0) > 0 || (activeProviderDraft?.baseURL.trim() ?? "") !== (activeProvider.baseURL ?? "")
      : false
    const activeProviderCanReset = activeProvider?.source === "config"
    const selectionUnchanged =
      savedSelection.model === selectionDraft.model && savedSelection.smallModel === selectionDraft.smallModel
    const showLoadedState = !isLoading && !loadError
    useEffect(() => {
      if (!isOpen) {
        setActiveSection("services")
        setSelectedProviderID(null)
        setProviderSearch("")
      }
    }, [isOpen])

    useEffect(() => {
      if (activeSection !== "services") return

      const visibleProviders = catalog.filter((provider) => matchesProviderSearch(provider, providerSearch))
      if (visibleProviders.length === 0) {
        if (selectedProviderID !== null) {
          setSelectedProviderID(null)
        }
        return
      }

      if (!selectedProviderID || !visibleProviders.some((provider) => provider.id === selectedProviderID)) {
        setSelectedProviderID(visibleProviders[0].id)
      }
    }, [activeSection, catalog, providerSearch, selectedProviderID])

    useEffect(() => {
      if (activeSection !== "services") return
      if (!serviceDetailPanelRef.current) return

      if (typeof serviceDetailPanelRef.current.scrollTo === "function") {
        serviceDetailPanelRef.current.scrollTo({ top: 0 })
      } else {
        serviceDetailPanelRef.current.scrollTop = 0
      }
    }, [activeSection, selectedProviderID])

    useEffect(() => {
      if (!isOpen) return

      function handleWindowKeyDown(event: globalThis.KeyboardEvent) {
        if (event.key !== "Escape") return

        event.preventDefault()
        onClose()
      }

      window.addEventListener("keydown", handleWindowKeyDown)
      return () => window.removeEventListener("keydown", handleWindowKeyDown)
    }, [isOpen, onClose])

    if (!isOpen) return null

    function handleSettingsOverlayClick(event: MouseEvent<HTMLElement>) {
      if (event.target !== event.currentTarget) return
      onClose()
    }

    const primarySections = [
      { key: "services" as const, label: "Provider", meta: `${catalog.length} providers` },
      { key: "defaults" as const, label: "Models", meta: `${visibleModels.length} available` },
    ]

    return (
      <section className="settings-page-overlay" role="presentation" onClick={handleSettingsOverlayClick}>
        <div className="settings-page" role="dialog" aria-modal="true" aria-label="Settings">
          <header className="settings-page-header">
            <button className="settings-page-close-button" aria-label="Close settings" title="Close settings" onClick={onClose}>
              <CloseIcon />
            </button>
          </header>

          <div className="settings-page-shell">
            <aside className="settings-page-primary-nav" aria-label="Settings sections">
              {primarySections.map((section) => {
                const isActive = activeSection === section.key

                return (
                  <button
                    key={section.key}
                    className={isActive ? "settings-primary-nav-item is-active" : "settings-primary-nav-item"}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => setActiveSection(section.key)}
                  >
                    <span className="settings-primary-nav-icon" aria-hidden="true">
                      <NavPlaceholderIcon />
                    </span>
                    <span className="settings-primary-nav-copy">
                      <span className="settings-primary-nav-label">{section.label}</span>
                      <small>{section.meta}</small>
                    </span>
                  </button>
                )
              })}
            </aside>

            <div className={activeSection === "services" ? "settings-page-main is-services" : "settings-page-main"}>
              {message ? (
                <div className={message.tone === "success" ? "settings-banner is-success" : "settings-banner is-error"}>{message.text}</div>
              ) : null}

              {loadError ? <div className="settings-banner is-error">{loadError}</div> : null}

              {isLoading ? (
                <article className="settings-empty-state">
                  <span className="label">Loading</span>
                  <h3>Fetching provider catalog</h3>
                  <p>Reading provider availability, model visibility, and saved model preferences.</p>
                </article>
              ) : null}

              {showLoadedState ? (
                activeSection === "services" ? (
                  <section className="settings-services-layout" aria-label="Provider layout">
                    <div className="settings-service-list-panel">
                      <label className="settings-field settings-search-field">
                        <span className="settings-field-label">Search providers</span>
                        <input
                          aria-label="Search providers"
                          type="text"
                          value={providerSearch}
                          placeholder="Search providers"
                          onChange={(event: ChangeEvent<HTMLInputElement>) => setProviderSearch(event.target.value)}
                        />
                      </label>

                      <div className="settings-service-list-body">
                        {filteredCatalog.length > 0 ? (
                          <div className="settings-service-list" role="list" aria-label="Provider list">
                            {filteredCatalog.map((provider) => {
                              const providerModels = modelGroups[provider.id] ?? []
                              const isActive = provider.id === activeProvider?.id

                              return (
                                <button
                                  key={provider.id}
                                  className={isActive ? "settings-service-item is-active" : "settings-service-item"}
                                  aria-pressed={isActive}
                                  onClick={() => setSelectedProviderID(provider.id)}
                                >
                                  <div className="settings-service-item-header">
                                    <strong>{provider.name}</strong>
                                    <span className="settings-badge">{getProviderConnectionLabel(provider)}</span>
                                  </div>
                                  <span className="settings-service-item-copy">{providerSourceLabel(provider)}</span>
                                  <span className="settings-service-item-copy">
                                    {providerModels.length > 0 ? `${providerModels.length} known models` : "No known models yet"}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        ) : (
                          <article className="settings-empty-state settings-service-list-empty-state">
                            <span className="label">No Match</span>
                            <h3>No provider matches this search</h3>
                            <p>Try a provider name, ID, endpoint, or environment variable.</p>
                          </article>
                        )}
                      </div>
                    </div>

                    <div ref={serviceDetailPanelRef} className="settings-service-detail-panel">
                      {activeProvider && activeProviderDraft ? (
                        <>
                          <div className="settings-detail-hero">
                            <div>
                              <span className="label">{providerSourceLabel(activeProvider)}</span>
                              <h3>{activeProvider.name}</h3>
                              <p>Save shared credentials and endpoint overrides for this provider.</p>
                            </div>

                            <div className="provider-row-statuses">
                              <span className="settings-badge">{getProviderConnectionLabel(activeProvider)}</span>
                              {activeProvider.apiKeyConfigured ? <span className="settings-badge">Key ready</span> : null}
                              <span className="settings-badge">{activeProvider.modelCount} models</span>
                            </div>
                          </div>

                          <div className="settings-detail-meta-grid">
                            <div className="settings-detail-meta-card">
                              <span className="label">Provider ID</span>
                              <strong>{activeProvider.id}</strong>
                              <p>{activeProvider.baseURL ?? "No default endpoint exposed by the catalog."}</p>
                            </div>
                            <div className="settings-detail-meta-card">
                              <span className="label">Environment</span>
                              <strong>{activeProvider.env.length > 0 ? activeProvider.env.join(", ") : "No env fallback"}</strong>
                              <p>
                                {activeProvider.available
                                  ? "The provider is currently available in the app."
                                  : "Save credentials to make it available here."}
                              </p>
                            </div>
                          </div>

                          <div className="settings-panel">
                            <div className="settings-section-header">
                              <div>
                                <span className="label">Connection</span>
                                <h3>Provider Configuration</h3>
                              </div>
                              <p>Edit the shared credentials and endpoint the app should use when routing to {activeProvider.name}.</p>
                            </div>

                            <div className="settings-field-grid">
                              <label className="settings-field">
                                <span className="settings-field-label">API key</span>
                                <input
                                  aria-label={`API key for ${activeProvider.name}`}
                                  type="password"
                                  value={activeProviderDraft.apiKey}
                                  placeholder={getProviderKeyPlaceholder(activeProvider)}
                                  onChange={(event) => onProviderDraftChange(activeProvider.id, "apiKey", event.target.value)}
                                />
                              </label>

                              <label className="settings-field">
                                <span className="settings-field-label">Base URL</span>
                                <input
                                  aria-label={`Base URL for ${activeProvider.name}`}
                                  type="text"
                                  value={activeProviderDraft.baseURL}
                                  placeholder={activeProvider.baseURL ?? "Optional custom endpoint"}
                                  onChange={(event) => onProviderDraftChange(activeProvider.id, "baseURL", event.target.value)}
                                />
                              </label>
                            </div>

                            <div className="settings-actions-row">
                              <span className="settings-helper-text">{getProviderActionHint(activeProvider)}</span>

                              <div className="settings-inline-actions">
                                {activeProviderCanReset ? (
                                  <button
                                    className="secondary-button"
                                    aria-label={`Reset ${activeProvider.name} settings`}
                                    disabled={activeProviderBusy}
                                    onClick={() => void onDeleteProvider(activeProvider.id)}
                                  >
                                    {deletingProviderID === activeProvider.id ? "Resetting..." : "Reset"}
                                  </button>
                                ) : null}
                                <button
                                  className="primary-button"
                                  aria-label={`Save ${activeProvider.name} settings`}
                                  disabled={activeProviderBusy || !activeProviderDirty}
                                  onClick={() => void onSaveProvider(activeProvider.id)}
                                >
                                  {savingProviderID === activeProvider.id ? "Saving..." : "Save"}
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="settings-panel">
                            <div className="settings-section-header">
                              <div>
                                <span className="label">Models</span>
                                <h3>Provider Models</h3>
                              </div>
                              <p>Models below come from the selected provider and show how they map into the current app defaults.</p>
                            </div>

                            {activeProviderModels.length > 0 ? (
                              <ModelListView catalog={catalog} models={activeProviderModels} selectionDraft={selectionDraft} />
                            ) : (
                              <article className="settings-empty-state">
                                <span className="label">No Models</span>
                                <h3>No models are visible for this provider yet</h3>
                                <p>Save the provider configuration, then refresh the catalog to populate its models.</p>
                              </article>
                            )}
                          </div>
                        </>
                      ) : (
                        <article className="settings-empty-state settings-detail-empty-state">
                          <span className="label">No Provider</span>
                          <h3>Select a provider from the list</h3>
                          <p>The right side will show credentials, endpoint overrides, and provider models for the current selection.</p>
                        </article>
                      )}
                    </div>
                  </section>
                ) : (
                  <div className="settings-default-layout">
                    <section className="settings-panel">
                      <div className="settings-section-header">
                        <div>
                          <span className="label">Routing</span>
                          <h3>Models</h3>
                        </div>
                        <p>Choose the preferred primary and small models from the providers already connected in the app.</p>
                      </div>

                      <div className="settings-field-grid">
                        <label className="settings-field">
                          <span className="settings-field-label">Primary model</span>
                          <select
                            aria-label="Primary model"
                            value={selectionDraft.model ?? ""}
                            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                              onSelectionChange("model", event.target.value ? event.target.value : null)
                            }
                          >
                            <option value="">Use server default</option>
                            {visibleModels.map((model) => (
                              <option key={`${model.providerID}/${model.id}`} value={`${model.providerID}/${model.id}`}>
                                {toModelOptionLabel(model, catalog)}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="settings-field">
                          <span className="settings-field-label">Small model</span>
                          <select
                            aria-label="Small model"
                            value={selectionDraft.smallModel ?? ""}
                            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                              onSelectionChange("smallModel", event.target.value ? event.target.value : null)
                            }
                          >
                            <option value="">Use server default</option>
                            {visibleModels.map((model) => (
                              <option key={`small-${model.providerID}/${model.id}`} value={`${model.providerID}/${model.id}`}>
                                {toModelOptionLabel(model, catalog)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="settings-actions-row">
                        <span className="settings-helper-text">Use the small model for lightweight tasks such as naming, titling, or utility generations.</span>
                        <button
                          className="primary-button"
                          aria-label="Save model selection"
                          disabled={isSavingSelection || selectionUnchanged}
                          onClick={() => void onSaveSelection()}
                        >
                          {isSavingSelection ? "Saving..." : "Save model selection"}
                        </button>
                      </div>
                    </section>

                    <section className="settings-panel">
                      <div className="settings-section-header">
                        <div>
                          <span className="label">Available</span>
                          <h3>Connected Models</h3>
                        </div>
                        <p>Every row below comes from a provider that is already configured and available in the app.</p>
                      </div>

                      {visibleModels.length > 0 ? (
                        <ModelListView catalog={catalog} models={visibleModels} selectionDraft={selectionDraft} />
                      ) : (
                        <article className="settings-empty-state">
                          <span className="label">No Models</span>
                          <h3>No connected provider is exposing models yet</h3>
                          <p>Open the Provider page, configure a provider, then come back here to review the unlocked models.</p>
                        </article>
                      )}
                    </section>
                  </div>
                )
              ) : null}
            </div>
          </div>
        </div>
      </section>
    )
  }
}

/*
  const [activeTab, setActiveTab] = useState<"provider" | "model">("provider")
  const [connectProviderID, setConnectProviderID] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setActiveTab("provider")
      setConnectProviderID(null)
    }
  }, [isOpen])

  useEffect(() => {
    if (activeTab !== "provider") {
      setConnectProviderID(null)
    }
  }, [activeTab])

  useEffect(() => {
    if (connectProviderID && !catalog.some((item) => item.id === connectProviderID)) {
      setConnectProviderID(null)
    }
  }, [catalog, connectProviderID])

  useEffect(() => {
    if (!isOpen) return

    function handleWindowKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return

      event.preventDefault()

      if (connectProviderID) {
        setConnectProviderID(null)
        return
      }

      onClose()
    }

    window.addEventListener("keydown", handleWindowKeyDown)
    return () => window.removeEventListener("keydown", handleWindowKeyDown)
  }, [connectProviderID, isOpen, onClose])

  if (!isOpen) return null

  const modelGroups = models.reduce<Record<string, ProviderModel[]>>((result, model) => {
    result[model.providerID] = [...(result[model.providerID] ?? []), model]
    return result
  }, {})
  const connectedProviderIDs = new Set(catalog.filter((item) => item.available).map((item) => item.id))
  const visibleModels = models.filter((model) => model.available && connectedProviderIDs.has(model.providerID))
  const activeProvider = connectProviderID ? catalog.find((item) => item.id === connectProviderID) ?? null : null
  const activeProviderDraft = activeProvider
    ? (providerDrafts[activeProvider.id] ?? {
        apiKey: "",
        baseURL: activeProvider.baseURL ?? "",
      })
    : null
  const selectionUnchanged =
    savedSelection.model === selectionDraft.model && savedSelection.smallModel === selectionDraft.smallModel
  const showEmptyState = !project
  const showLoadedState = !showEmptyState && !isLoading && !loadError

  async function handleProviderSubmit() {
    if (!activeProvider) return

    const didSave = await onSaveProvider(activeProvider.id)

    if (didSave) {
      setConnectProviderID(null)
    }
  }

  function handleSettingsOverlayClick(event: MouseEvent<HTMLElement>) {
    if (event.target !== event.currentTarget || connectProviderID) return
    onClose()
  }

  function handleProviderOverlayClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return
    setConnectProviderID(null)
  }

  return (
    <section className="settings-page-overlay" role="presentation" onClick={handleSettingsOverlayClick}>
      <div className="settings-page" role="dialog" aria-modal="true" aria-labelledby="settings-page-title">
        <header className="settings-page-header">
          <div>
            <span className="label">Settings</span>
            <h2 id="settings-page-title">Provider &amp; Model</h2>
            <p className="settings-page-copy">Connect providers for this project, then review the models that become available.</p>
          </div>

          <div className="settings-page-actions">
            {project ? (
              <div className="settings-project-chip">
                <strong>{project.name}</strong>
                <span>{project.worktree}</span>
              </div>
            ) : null}
            <button className="secondary-button" aria-label="Close settings" onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        <div className="settings-page-body">
          <aside className="settings-page-nav" aria-label="Settings sections">
            <button
              className={activeTab === "provider" ? "settings-nav-item is-active" : "settings-nav-item"}
              aria-current={activeTab === "provider" ? "page" : undefined}
              onClick={() => setActiveTab("provider")}
            >
              <span>Provider</span>
              <small>{catalog.length} entries</small>
            </button>
            <button
              className={activeTab === "model" ? "settings-nav-item is-active" : "settings-nav-item"}
              aria-current={activeTab === "model" ? "page" : undefined}
              onClick={() => setActiveTab("model")}
            >
              <span>Model</span>
              <small>{visibleModels.length} available</small>
            </button>
          </aside>

          <div className="settings-page-content">
            {message ? (
              <div className={message.tone === "success" ? "settings-banner is-success" : "settings-banner is-error"}>{message.text}</div>
            ) : null}

            {loadError ? <div className="settings-banner is-error">{loadError}</div> : null}

            {showEmptyState ? (
              <article className="settings-empty-state">
                <span className="label">No Project</span>
                <h3>Select a workspace first</h3>
                <p>Provider settings are stored per project. Pick a folder workspace from the sidebar, then reopen settings.</p>
              </article>
            ) : null}

            {isLoading ? (
              <article className="settings-empty-state">
                <span className="label">Loading</span>
                <h3>Fetching provider catalog</h3>
                <p>Reading provider availability, model visibility, and saved project selection.</p>
              </article>
            ) : null}

            {showLoadedState ? (
              <>
                {activeTab === "provider" ? (
                  <section className="settings-panel">
                    <div className="settings-section-header">
                      <div>
                        <span className="label">Catalog</span>
                        <h3>Provider Connections</h3>
                      </div>
                      <p>Select a provider and open a dedicated connect window to submit the API key for this project.</p>
                    </div>

                    <div className="settings-section-summary">
                      <div className="settings-summary-card">
                        <span className="label">Connected</span>
                        <strong>{catalog.filter((provider) => provider.available).length}</strong>
                        <p>Providers already unlocked for this workspace.</p>
                      </div>
                      <div className="settings-summary-card">
                        <span className="label">Potential</span>
                        <strong>{catalog.length}</strong>
                        <p>All providers discovered from the catalog, environment, and project config.</p>
                      </div>
                    </div>

                    <div className="provider-list">
                      {catalog.map((provider) => {
                        const providerModels = modelGroups[provider.id] ?? []
                        const providerBusy = savingProviderID === provider.id || deletingProviderID === provider.id
                        const canResetProvider = provider.source === "config"

                        return (
                          <article key={provider.id} className={provider.available ? "provider-row" : "provider-row is-muted"}>
                            <div className="provider-row-main">
                              <div className="provider-row-heading">
                                <div>
                                  <span className="label">{providerSourceLabel(provider)}</span>
                                  <h4>{provider.name}</h4>
                                </div>

                                <div className="provider-row-statuses">
                                  <span className="settings-badge">{provider.available ? "Connected" : "Not connected"}</span>
                                  {provider.apiKeyConfigured ? <span className="settings-badge">Key ready</span> : null}
                                  <span className="settings-badge">{provider.modelCount} models</span>
                                </div>
                              </div>

                              <p className="provider-row-copy">
                                <strong>{provider.id}</strong>
                                {provider.env.length > 0 ? ` / Env ${provider.env.join(", ")}` : " / No env key fallback"}
                                {provider.baseURL ? ` / ${provider.baseURL}` : ""}
                              </p>

                              <div className="provider-row-models">
                                {providerModels.length > 0 ? (
                                  providerModels.slice(0, 3).map((model) => (
                                    <div key={`${model.providerID}/${model.id}`} className="provider-model-chip">
                                      <strong>{model.name}</strong>
                                      <span>{buildModelTags(model).join(" / ")}</span>
                                    </div>
                                  ))
                                ) : (
                                  <span className="provider-model-empty">No project-visible models yet.</span>
                                )}
                              </div>
                            </div>

                            <div className="provider-row-actions">
                              {canResetProvider ? (
                                <button
                                  className="secondary-button"
                                  aria-label={`Reset ${provider.name} settings`}
                                  disabled={providerBusy}
                                  onClick={() => void onDeleteProvider(provider.id)}
                                >
                                  {deletingProviderID === provider.id ? "Resetting..." : "Reset"}
                                </button>
                              ) : null}
                              <button
                                className="primary-button"
                                aria-label={`Connect ${provider.name}`}
                                disabled={providerBusy}
                                onClick={() => setConnectProviderID(provider.id)}
                              >
                                Connect
                              </button>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  </section>
                ) : (
                  <section className="settings-panel">
                    <div className="settings-section-header">
                      <div>
                        <span className="label">Routing</span>
                        <h3>Default Model Selection</h3>
                      </div>
                      <p>Choose the preferred primary and small models from the providers already connected to this project.</p>
                    </div>

                    <div className="settings-field-grid">
                      <label className="settings-field">
                        <span className="settings-field-label">Primary model</span>
                        <select
                          aria-label="Primary model"
                          value={selectionDraft.model ?? ""}
                          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                            onSelectionChange("model", event.target.value ? event.target.value : null)
                          }
                        >
                          <option value="">Use server default</option>
                          {visibleModels.map((model) => (
                            <option key={`${model.providerID}/${model.id}`} value={`${model.providerID}/${model.id}`}>
                              {toModelOptionLabel(model, catalog)}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="settings-field">
                        <span className="settings-field-label">Small model</span>
                        <select
                          aria-label="Small model"
                          value={selectionDraft.smallModel ?? ""}
                          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                            onSelectionChange("smallModel", event.target.value ? event.target.value : null)
                          }
                        >
                          <option value="">Use server default</option>
                          {visibleModels.map((model) => (
                            <option key={`small-${model.providerID}/${model.id}`} value={`${model.providerID}/${model.id}`}>
                              {toModelOptionLabel(model, catalog)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="settings-actions-row">
                      <span className="settings-helper-text">Use the small model for lightweight tasks such as naming, titling, or utility generations.</span>
                      <button
                        className="primary-button"
                        aria-label="Save model selection"
                        disabled={isSavingSelection || selectionUnchanged}
                        onClick={() => void onSaveSelection()}
                      >
                        {isSavingSelection ? "Saving..." : "Save model selection"}
                      </button>
                    </div>
                  </section>
                )}

                {activeTab === "model" ? (
                  <section className="settings-panel">
                    <div className="settings-section-header">
                      <div>
                        <span className="label">Available</span>
                        <h3>Connected Models</h3>
                      </div>
                      <p>Every row below comes from a provider that is already configured and available in this project.</p>
                    </div>

                  {visibleModels.length > 0 ? (
                    <div className="model-list">
                      {visibleModels.map((model) => {
                        const providerName = catalog.find((item) => item.id === model.providerID)?.name ?? model.providerID
                        const modelValue = `${model.providerID}/${model.id}`

                        return (
                          <article key={modelValue} className="model-row">
                            <div className="model-row-main">
                              <div className="model-row-heading">
                                <div>
                                  <h4>{model.name}</h4>
                                  <p className="model-row-copy">
                                    <strong>{providerName}</strong>
                                    {model.family ? ` / ${model.family}` : ""}
                                  </p>
                                </div>

                                <div className="model-row-statuses">
                                  <span className="settings-badge">{model.status}</span>
                                  {selectionDraft.model === modelValue ? <span className="settings-badge is-highlight">Primary</span> : null}
                                  {selectionDraft.smallModel === modelValue ? <span className="settings-badge is-highlight">Small</span> : null}
                                </div>
                              </div>

                              <div className="model-row-tags">
                                {buildModelTags(model).map((tag) => (
                                  <span key={`${modelValue}-${tag}`} className="settings-badge">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  ) : (
                    <article className="settings-empty-state">
                      <span className="label">No Models</span>
                      <h3>No connected provider is exposing models yet</h3>
                      <p>Open the Provider tab, connect a provider with an API key, then come back here to review the unlocked models.</p>
                    </article>
                  )}

                  {false ? (
                    <div className="provider-grid">
                    {catalog.map((provider) => {
                      const draft = providerDrafts[provider.id] ?? {
                        apiKey: "",
                        baseURL: provider.baseURL ?? "",
                      }
                      const providerModels = modelGroups[provider.id] ?? []
                      const providerBusy = savingProviderID === provider.id || deletingProviderID === provider.id
                      const providerDirty = draft.apiKey.trim().length > 0 || draft.baseURL.trim() !== (provider.baseURL ?? "")
                      const canResetProvider = provider.source === "config"

                      return (
                        <article key={provider.id} className={provider.available ? "provider-card" : "provider-card is-muted"}>
                          <div className="provider-card-header">
                            <div>
                              <span className="label">{providerSourceLabel(provider)}</span>
                              <h4>{provider.name}</h4>
                            </div>

                            <div className="provider-card-statuses">
                              <span className="settings-badge">{provider.available ? "Available" : "Needs key"}</span>
                              {provider.apiKeyConfigured ? <span className="settings-badge">Key ready</span> : null}
                              <span className="settings-badge">{provider.modelCount} models</span>
                            </div>
                          </div>

                          <p className="provider-card-copy">
                            <strong>{provider.id}</strong>
                            {provider.env.length > 0 ? ` · Env ${provider.env.join(", ")}` : " · No env key required"}
                          </p>

                          <div className="provider-model-strip">
                            {providerModels.length > 0 ? (
                              providerModels.slice(0, 3).map((model) => (
                                <div key={`${model.providerID}/${model.id}`} className="provider-model-chip">
                                  <strong>{model.name}</strong>
                                  <span>{buildModelTags(model).join(" · ")}</span>
                                </div>
                              ))
                            ) : (
                              <span className="provider-model-empty">No project-visible models yet.</span>
                            )}
                          </div>

                          <div className="settings-field-grid">
                            <label className="settings-field">
                              <span className="settings-field-label">API key</span>
                              <input
                                aria-label={`API key for ${provider.name}`}
                                type="password"
                                value={draft.apiKey}
                                placeholder={
                                  provider.apiKeyConfigured
                                    ? "Stored key detected. Leave blank to keep it."
                                    : provider.env.length > 0
                                      ? `Or rely on ${provider.env.join(", ")}`
                                      : "Enter API key"
                                }
                                onChange={(event) => onProviderDraftChange(provider.id, "apiKey", event.target.value)}
                              />
                            </label>

                            <label className="settings-field">
                              <span className="settings-field-label">Base URL</span>
                              <input
                                aria-label={`Base URL for ${provider.name}`}
                                type="text"
                                value={draft.baseURL}
                                placeholder={provider.baseURL ?? "Optional custom endpoint"}
                                onChange={(event) => onProviderDraftChange(provider.id, "baseURL", event.target.value)}
                              />
                            </label>
                          </div>

                          <div className="settings-actions-row">
                            <span className="settings-helper-text">
                              {canResetProvider
                                ? "Reset removes the project override and falls back to environment or catalog defaults."
                                : provider.source === "env"
                                  ? "This provider is currently active because the environment already exposes its key."
                                  : "Save a project override to make this provider selectable here."}
                            </span>

                            <div className="settings-inline-actions">
                              <button
                                className="secondary-button"
                                aria-label={`Reset ${provider.name} settings`}
                                disabled={!canResetProvider || providerBusy}
                                onClick={() => void onDeleteProvider(provider.id)}
                              >
                                {deletingProviderID === provider.id ? "Resetting..." : "Reset"}
                              </button>
                              <button
                                className="primary-button"
                                aria-label={`Save ${provider.name} settings`}
                                disabled={providerBusy || !providerDirty}
                                onClick={() => void onSaveProvider(provider.id)}
                              >
                                {savingProviderID === provider.id ? "Saving..." : "Save"}
                              </button>
                            </div>
                          </div>
                        </article>
                      )
                    })}
                    </div>
                  ) : null}
                </section>
                ) : null}
              </>
            ) : null}

            {activeProvider && activeProviderDraft ? (
              <div className="provider-connect-overlay" role="presentation" onClick={handleProviderOverlayClick}>
                <article className="provider-connect-modal" role="dialog" aria-modal="true" aria-labelledby="provider-connect-title">
                  <header className="provider-connect-header">
                    <div>
                      <span className="label">{providerSourceLabel(activeProvider)}</span>
                      <h3 id="provider-connect-title">Connect {activeProvider.name}</h3>
                      <p>
                        Enter the API key below, then submit to enable this provider for {project?.name ?? "the current project"}.
                      </p>
                    </div>

                    <button className="secondary-button" aria-label="Close provider connect dialog" onClick={() => setConnectProviderID(null)}>
                      Close
                    </button>
                  </header>

                  <div className="provider-connect-body">
                    <label className="settings-field">
                      <span className="settings-field-label">API key</span>
                      <input
                        aria-label={`API key for ${activeProvider.name}`}
                        autoFocus
                        type="password"
                        value={activeProviderDraft.apiKey}
                        placeholder={
                          activeProvider.apiKeyConfigured
                            ? "Stored key detected. Leave blank to keep it."
                            : activeProvider.env.length > 0
                              ? `Or rely on ${activeProvider.env.join(", ")}`
                              : "Enter API key"
                        }
                        onChange={(event) => onProviderDraftChange(activeProvider.id, "apiKey", event.target.value)}
                      />
                    </label>

                    <label className="settings-field">
                      <span className="settings-field-label">Base URL</span>
                      <input
                        aria-label={`Base URL for ${activeProvider.name}`}
                        type="text"
                        value={activeProviderDraft.baseURL}
                        placeholder={activeProvider.baseURL ?? "Optional custom endpoint"}
                        onChange={(event) => onProviderDraftChange(activeProvider.id, "baseURL", event.target.value)}
                      />
                    </label>
                  </div>

                  <div className="settings-actions-row">
                    <span className="settings-helper-text">
                      {activeProvider.source === "env"
                        ? "This provider can also inherit credentials from the current environment."
                        : "Submitting saves a project-level provider override without changing the global catalog."}
                    </span>

                    <div className="settings-inline-actions">
                      <button className="secondary-button" onClick={() => setConnectProviderID(null)}>
                        Cancel
                      </button>
                      <button
                        className="primary-button"
                        aria-label={`Submit ${activeProvider.name} provider settings`}
                        disabled={
                          savingProviderID === activeProvider.id ||
                          (activeProviderDraft.apiKey.trim().length === 0 && activeProviderDraft.baseURL.trim() === (activeProvider.baseURL ?? ""))
                        }
                        onClick={() => void handleProviderSubmit()}
                      >
                        {savingProviderID === activeProvider.id ? "Submitting..." : "Submit"}
                      </button>
                    </div>
                  </div>
                </article>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
*/

interface ThreadViewProps {
  activeSession: SessionSummary | null
  activeTurns: Turn[]
  threadColumnRef: RefObject<HTMLDivElement | null>
}

function TraceItemView({ item }: { item: AssistantTraceItem }) {
  const className = [
    "trace-item",
    `trace-kind-${item.kind}`,
    item.isStreaming ? "is-streaming" : "",
    item.status ? `is-${item.status}` : "",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <article className={className} data-kind={item.kind}>
      <div className="trace-item-header">
        <span className="trace-item-label">{item.label}</span>
        {item.title ? <strong className="trace-item-title">{item.title}</strong> : null}
        {item.status ? <span className={`trace-item-status is-${item.status}`}>{item.status}</span> : null}
      </div>
      {item.text ? <p className="trace-item-text">{item.text}</p> : null}
      {item.detail ? <p className="trace-item-detail">{item.detail}</p> : null}
    </article>
  )
}

export function ThreadView({ activeSession, activeTurns, threadColumnRef }: ThreadViewProps) {
  return (
    <section className="thread-shell">
      <div ref={threadColumnRef} className="thread-column">
        {!activeSession ? (
          <article className="turn assistant-turn">
            <div className="assistant-shell">
              <header className="assistant-header">
                <div>
                  <span className="label">Agent Turn</span>
                  <h3>No session selected</h3>
                </div>
              </header>

              <div className="assistant-trace-list">
                <TraceItemView
                  item={{
                    id: "empty-no-session",
                    kind: "system",
                    timestamp: Date.now(),
                    label: "System",
                    title: "No session selected",
                    detail: "Load a folder from the sidebar or create a new session to begin.",
                    status: "completed",
                  }}
                />
              </div>
            </div>
          </article>
        ) : activeTurns.length === 0 ? null : (
          activeTurns.map((turn) => {
            if (turn.kind === "user") {
              return (
                <article key={turn.id} className="turn user-turn">
                  <div className="turn-meta">
                    <span>You</span>
                    <time>{formatTime(turn.timestamp)}</time>
                  </div>
                  <div className="user-bubble">{turn.text}</div>
                </article>
              )
            }

            const visibleItems = turn.items.filter((item) => item.kind !== "system")
            if (visibleItems.length === 0) return null

            return (
              <article key={turn.id} className="turn assistant-turn">
                <div className={turn.isStreaming ? "assistant-shell is-streaming" : "assistant-shell"}>
                  <div className="assistant-trace-list">
                    {visibleItems.map((item) => (
                      <TraceItemView key={item.id} item={item} />
                    ))}
                  </div>
                </div>
              </article>
            )
          })
        )}
      </div>
    </section>
  )
}

interface ComposerProps {
  draft: string
  hasActiveSession: boolean
  isSending: boolean
  onClear: () => void
  onDraftChange: (value: string) => void
  onSend: () => void | Promise<void>
}

export function Composer({ draft, hasActiveSession, isSending, onClear, onDraftChange, onSend }: ComposerProps) {
  return (
    <footer className="composer prompt-input-shell">
      <textarea
        aria-label="Task draft"
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        placeholder="Describe the UI, implementation task, or review target for the agent."
        rows={3}
      />

      <div className="composer-toolbar">
        <div className="composer-pills">
          <span className="composer-pill">GPT-5.4</span>
          <span className="composer-pill">Desktop</span>
          <span className="composer-pill">Anybox Ref</span>
        </div>

        <div className="composer-actions">
          <button aria-label="Clear draft" className="secondary-button" onClick={onClear}>
            Clear
          </button>
          <button aria-label="Send task" className="primary-button" disabled={isSending || !hasActiveSession} onClick={() => void onSend()}>
            {isSending ? "Sending..." : "Send task"}
          </button>
        </div>
      </div>
    </footer>
  )
}
