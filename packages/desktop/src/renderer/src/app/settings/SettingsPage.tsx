import { useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent, type PointerEvent } from "react"
import { APPEARANCE_TOKEN_GROUPS, type AppearanceTokenMap, type AppearanceTokenName } from "../../../../shared/appearance"
import type { DesktopAppUpdateSettings } from "../../../../shared/desktop-ipc-contract"
import {
  ArchiveIcon,
  CloseIcon,
  ConnectedStatusIcon,
  DisconnectedStatusIcon,
  ChevronDownIcon,
  EyeIcon,
  EyeOffIcon,
  FileTextIcon,
  LayoutSidebarLeftIcon,
  MinimizeIcon,
  MonitorIcon,
  MoonIcon,
  PaletteIcon,
  PlusIcon,
  ResetIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
  TerminalIcon
} from "../icons"
import { normalizeAppearanceColorInputValue } from "../appearance-theme"
import { useI18n } from "../i18n/I18nProvider"
import { writeTextToClipboard } from "../shared-ui"
import type {
  ArchivedSessionSummary,
  AssistantTraceVisibility,
  AssistantTraceVisibilityKey,
  BrandTheme,
  ColorMode,
  McpServerDiagnostic,
  McpServerDraftState,
  McpServerSummary,
  McpToolPolicyValue,
  ProjectModelSelection,
  ProviderAuthCapability,
  ProviderCatalogItem,
  ProviderDraftState,
  ProviderModel
} from "../types"
import { McpToolsPolicyPanel } from "../mcp/McpToolsPolicyPanel"
import { clamp, formatTime } from "../utils"
import {
  checkForAppUpdates,
  getAppUpdateSettings,
  openExternalUrl,
  openMonitorWindow,
  setAutomaticUpdatesEnabled,
} from "./client"
import type { AppLocale } from "../../../../shared/locale"

const assistantTraceVisibilityOptions: Array<{
  key: AssistantTraceVisibilityKey
  title: string
  description: string
}> = [
  {
    key: "response",
    title: "Response",
    description: "Show the assistant's user-facing response text inside the main trace.",
  },
  {
    key: "reasoning",
    title: "Reasoning",
    description: "Show captured reasoning text segments when the model streams them.",
  },
  {
    key: "toolCalls",
    title: "Tool calls",
    description: "Show tool lifecycle entries such as running, waiting for approval, and completed calls.",
  },
  {
    key: "toolInputs",
    title: "Tool inputs",
    description: "Reveal streamed tool arguments and structured input payloads inside tool entries.",
  },
  {
    key: "toolOutputs",
    title: "Tool outputs",
    description: "Reveal completed tool results, failure messages, and denied reasons inside tool entries.",
  },
  {
    key: "sources",
    title: "Sources",
    description: "Show cited URLs and document references that the model used during this turn.",
  },
  {
    key: "files",
    title: "Files and attachments",
    description: "Show generated files, images, and patch summaries in the main trace.",
  },
  {
    key: "approvals",
    title: "Approvals",
    description: "Show permission requests, approval pauses, and related tool approval events.",
  },
  {
    key: "workflow",
    title: "Workflow events",
    description: "Show step boundaries, completion summaries, stream lifecycle, and other execution events.",
  },
  {
    key: "debugMetadata",
    title: "Debug metadata",
    description: "Show backend identifiers, payload previews, timing, and token metadata for each trace item.",
  },
]

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

const providerLogoBaseURL = "https://models.dev/logos"

function getProviderLogoUrl(providerID: string) {
  return `${providerLogoBaseURL}/${encodeURIComponent(providerID)}.svg`
}

function getProviderLogoInitial(provider: ProviderCatalogItem) {
  return (provider.name.trim() || provider.id.trim()).slice(0, 1).toUpperCase() || "?"
}

function ProviderLogo({ provider, className = "" }: { provider: ProviderCatalogItem; className?: string }) {
  return (
    <span className={className ? `provider-logo ${className}` : "provider-logo"} aria-hidden="true">
      <span className="provider-logo-fallback">{getProviderLogoInitial(provider)}</span>
      <img
        key={provider.id}
        className="provider-logo-image"
        src={getProviderLogoUrl(provider.id)}
        alt=""
        loading="lazy"
        decoding="async"
        onError={(event) => {
          event.currentTarget.hidden = true
        }}
      />
    </span>
  )
}

function AppearanceColorTextInput({
  label,
  onCommit,
  value,
}: {
  label: string
  onCommit: (value: string) => void
  value: string
}) {
  const [draftValue, setDraftValue] = useState(value)

  useEffect(() => {
    setDraftValue(value)
  }, [value])

  function commitDraftValue() {
    const normalizedValue = normalizeAppearanceColorInputValue(draftValue, value)
    setDraftValue(normalizedValue)
    onCommit(normalizedValue)
  }

  return (
    <input
      aria-label={`${label} hex color`}
      className="settings-theme-color-input"
      inputMode="text"
      spellCheck={false}
      type="text"
      value={draftValue}
      onBlur={commitDraftValue}
      onChange={(event) => setDraftValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault()
          event.currentTarget.blur()
          return
        }

        if (event.key === "Escape") {
          event.preventDefault()
          setDraftValue(value)
          event.currentTarget.blur()
        }
      }}
    />
  )
}

function buildModelTags(model: ProviderModel) {
  const tags = [`${formatContextWindow(model.limit.context)} ctx`]

  if (model.capabilities.reasoning) tags.push("Reasoning")
  if (model.capabilities.toolcall) tags.push("Tools")
  if (model.capabilities.input.image) tags.push("Vision")
  if (model.capabilities.output.image) tags.push("Image Out")
  if (model.capabilities.attachment && model.capabilities.input.pdf) tags.push("PDF")

  return tags
}

function toModelValue(model: ProviderModel) {
  return `${model.providerID}/${model.id}`
}

function toModelOptionLabel(model: ProviderModel, providers: ProviderCatalogItem[]) {
  const providerName = providers.find((item) => item.id === model.providerID)?.name ?? model.providerID
  return `${providerName} / ${model.name}`
}

function getProviderConnectionLabel(provider: ProviderCatalogItem) {
  const label = provider.connectionLabel ?? provider.authState.connectionLabel

  switch (provider.authState.status) {
    case "connected":
      return label ?? "Connected"
    case "pending":
      return label ?? "Pending"
    case "expired":
      return label ?? "Expired"
    case "error":
      return label ?? "Error"
    case "not_connected":
      if (provider.apiKeyConfigured) return "Configured"
      return label ?? "Not connected"
  }
}

function isProviderConnected(provider: ProviderCatalogItem) {
  return provider.authState.status === "connected"
}

function isAnyboxProvider(provider: ProviderCatalogItem) {
  return provider.id === "anybox"
}

function getProviderCredentialSummary(provider: ProviderCatalogItem) {
  const activeCredential =
    provider.authState.credentials.find((credential) => credential.method === provider.authState.activeMethod) ??
    provider.authState.credentials[0]

  if (!activeCredential?.configured) return null
  if (activeCredential.label) return activeCredential.label
  if (activeCredential.email) return activeCredential.email
  if (activeCredential.kind === "api_key") {
    return activeCredential.source === "environment" ? "Configured from environment" : "Stored API key"
  }
  if (activeCredential.source === "external_cache") {
    return "Using shared Codex login"
  }

  return "Stored session"
}

function getProviderAuthCapability(provider: ProviderCatalogItem, method: string | null | undefined) {
  if (!method) return null
  return provider.authCapabilities.find((capability) => capability.method === method) ?? null
}

function isProviderFlowTerminal(status?: string | null) {
  return !status || ["connected", "error", "expired", "cancelled"].includes(status)
}

function getProviderKeyPlaceholder(provider: ProviderCatalogItem) {
  const apiKeyCredential = provider.authState.credentials.find((credential) => credential.kind === "api_key")
  if (apiKeyCredential?.configured || provider.apiKeyConfigured) {
    return "Stored key detected. Leave blank to keep it."
  }

  if (provider.env.length > 0) {
    return `Or rely on ${provider.env.join(", ")}`
  }

  return "Enter API key"
}

type ProviderApiKeyMode = "environment" | "manual"

function getProviderActiveCredential(provider: ProviderCatalogItem) {
  return (
    provider.authState.credentials.find((credential) => credential.method === provider.authState.activeMethod) ??
    provider.authState.credentials.find((credential) => credential.configured) ??
    null
  )
}

function hasStoredProviderApiKey(provider: ProviderCatalogItem) {
  return provider.authState.credentials.some(
    (credential) =>
      credential.kind === "api_key" &&
      credential.configured &&
      credential.source !== "environment",
  )
}

function getProviderApiKeyMode(provider: ProviderCatalogItem): ProviderApiKeyMode {
  const activeCredential = getProviderActiveCredential(provider)
  if (activeCredential?.kind === "api_key" && activeCredential.source === "environment") {
    return "environment"
  }
  if (provider.source === "env" && provider.env.length > 0 && !hasStoredProviderApiKey(provider)) {
    return "environment"
  }
  return "manual"
}

function getProviderStatusText(provider: ProviderCatalogItem) {
  switch (provider.authState.status) {
    case "connected":
      return "已连接"
    case "pending":
      return "连接中"
    case "expired":
      return "已过期"
    case "error":
      return "连接异常"
    case "not_connected":
      return provider.apiKeyConfigured ? "已配置" : "未连接"
  }
}

function getProviderSourceText(provider: ProviderCatalogItem) {
  const activeCredential = getProviderActiveCredential(provider)
  if (isAnyboxProvider(provider) && activeCredential?.kind === "oauth_session") return "来自 Anybox 账号"
  if (activeCredential?.source === "environment" || provider.source === "env") return "来自环境变量"
  if (activeCredential?.source === "credential_store") return "来自已保存密钥"
  if (activeCredential?.source === "external_cache") return "来自共享登录"
  if (activeCredential?.source === "legacy_config") return "来自历史配置"
  return provider.configured ? "来自已保存配置" : "未配置凭据"
}

function getProviderHeaderSummary(provider: ProviderCatalogItem) {
  return `${getProviderStatusText(provider)} · 全应用共享 · ${getProviderSourceText(provider)}`
}

function getProviderAuthMethodOptionLabel(provider: ProviderCatalogItem, capability: ProviderAuthCapability) {
  if (isAnyboxProvider(provider) && capability.kind === "browser_oauth") return "Anybox 账号（浏览器登录）"
  if (provider.id === "openai" && capability.kind === "browser_oauth") return "ChatGPT Pro/Plus（浏览器登录）"
  if (provider.id === "openai" && capability.kind === "device_code") return "ChatGPT Pro/Plus（设备码登录）"
  return capability.recommended ? `${capability.label}（推荐）` : capability.label
}

function formatProviderBalance(account: ProviderCatalogItem["authState"]["account"]) {
  if (account?.balanceMicrocents === undefined) return null
  const currency = account.currency || "CNY"
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(account.balanceMicrocents / 100_000_000)
}

function getAnyboxRechargeUrl(provider: ProviderCatalogItem) {
  const account = provider.authState.account
  const credential = getProviderActiveCredential(provider)
  const direct = account?.rechargeUrl ?? credential?.rechargeUrl
  if (direct) return direct

  const baseURL = provider.baseURL?.trim()
  if (!baseURL) return null
  return `${baseURL.replace(/\/+$/, "").replace(/\/v1$/, "")}/billing`
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

function getVisibleProvidersForSettings(catalog: ProviderCatalogItem[], rawQuery: string) {
  return catalog
    .map((provider, index) => ({ index, provider }))
    .filter(({ provider }) => matchesProviderSearch(provider, rawQuery))
    .sort((left, right) => {
      if (left.provider.available !== right.provider.available) {
        return left.provider.available ? -1 : 1
      }

      return left.index - right.index
    })
    .map(({ provider }) => provider)
}

interface ModelListViewProps {
  catalog: ProviderCatalogItem[]
  models: ProviderModel[]
  selectionDraft: ProjectModelSelection
}

interface ProviderModelPickerProps {
  catalog: ProviderCatalogItem[]
  emptyLabel: string
  label: string
  models: ProviderModel[]
  value: string | null
  onChange: (value: string | null) => void
}

interface ProviderModelPickerGroup {
  matchingModels: ProviderModel[]
  provider: ProviderCatalogItem
}

function matchesProviderModelSearch(provider: ProviderCatalogItem, model: ProviderModel, normalizedQuery: string) {
  if (!normalizedQuery) return true

  return `${provider.name} ${provider.id} ${model.name} ${model.id}`.toLowerCase().includes(normalizedQuery)
}

function matchesProviderModelPickerProviderSearch(provider: ProviderCatalogItem, normalizedQuery: string) {
  if (!normalizedQuery) return true

  return `${provider.name} ${provider.id}`.toLowerCase().includes(normalizedQuery)
}

function buildProviderModelPickerGroups(
  catalog: ProviderCatalogItem[],
  models: ProviderModel[],
  searchQuery: string,
): ProviderModelPickerGroup[] {
  const normalizedQuery = searchQuery.trim().toLowerCase()

  return catalog.flatMap((provider) => {
    if (!provider.available) return []

    const providerModels = models.filter((model) => model.providerID === provider.id)
    if (providerModels.length === 0) return []

    const providerMatches = matchesProviderModelPickerProviderSearch(provider, normalizedQuery)
    const matchingModels = normalizedQuery
      ? providerModels.filter((model) => matchesProviderModelSearch(provider, model, normalizedQuery))
      : providerModels

    if (normalizedQuery && !providerMatches && matchingModels.length === 0) return []

    return [
      {
        matchingModels: providerMatches ? providerModels : matchingModels,
        provider,
      },
    ]
  })
}

function ProviderModelPicker({
  catalog,
  emptyLabel,
  label,
  models,
  value,
  onChange,
}: ProviderModelPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeProviderID, setActiveProviderID] = useState<string | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const selectedModel = models.find((model) => toModelValue(model) === value) ?? null
  const selectedProviderID = selectedModel?.providerID ?? value?.split("/")[0] ?? null
  const selectedLabel = selectedModel ? toModelOptionLabel(selectedModel, catalog) : (value ?? emptyLabel)
  const allProviderGroups = useMemo(() => buildProviderModelPickerGroups(catalog, models, ""), [catalog, models])
  const providerGroups = useMemo(
    () => buildProviderModelPickerGroups(catalog, models, searchQuery),
    [catalog, models, searchQuery],
  )
  const activeProviderGroup =
    (activeProviderID ? providerGroups.find((group) => group.provider.id === activeProviderID) : null) ?? providerGroups[0] ?? null

  useEffect(() => {
    if (!isOpen) return

    setSearchQuery("")
    setActiveProviderID(
      selectedProviderID && allProviderGroups.some((group) => group.provider.id === selectedProviderID)
        ? selectedProviderID
        : (allProviderGroups[0]?.provider.id ?? null),
    )
  }, [allProviderGroups, isOpen, selectedProviderID])

  useEffect(() => {
    if (!isOpen) return
    if (activeProviderID && providerGroups.some((group) => group.provider.id === activeProviderID)) return

    setActiveProviderID(providerGroups[0]?.provider.id ?? null)
  }, [activeProviderID, isOpen, providerGroups])

  useEffect(() => {
    if (!isOpen) return

    function handleDocumentPointerDown(event: globalThis.PointerEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return

      setIsOpen(false)
    }

    document.addEventListener("pointerdown", handleDocumentPointerDown)
    return () => document.removeEventListener("pointerdown", handleDocumentPointerDown)
  }, [isOpen])

  function closePicker() {
    setIsOpen(false)
    setSearchQuery("")
    setActiveProviderID(null)
    buttonRef.current?.focus()
  }

  function handleModelSelect(model: ProviderModel) {
    closePicker()
    onChange(toModelValue(model))
  }

  return (
    <div className="provider-model-picker">
      <button
        ref={buttonRef}
        type="button"
        className={isOpen ? "provider-model-picker-button is-open" : "provider-model-picker-button"}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={`${label}: ${selectedLabel}`}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className={value ? "provider-model-picker-value" : "provider-model-picker-value is-empty"}>{selectedLabel}</span>
        <ChevronDownIcon />
      </button>

      {isOpen ? (
        <div
          ref={panelRef}
          className="provider-model-picker-panel"
          role="dialog"
          aria-label={`${label} model picker`}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return
            event.preventDefault()
            event.stopPropagation()
            closePicker()
          }}
        >
          <div className="provider-model-picker-search-row">
            <input
              aria-label="Search providers or models"
              autoFocus
              className="provider-model-picker-search"
              placeholder="搜索 Provider 或模型"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
            />
          </div>

          {providerGroups.length > 0 ? (
            <div className="provider-model-picker-body">
              <div className="provider-model-picker-provider-list" role="listbox" aria-label={`${label} providers`}>
                {providerGroups.map((group) => {
                  const isActive = activeProviderGroup?.provider.id === group.provider.id

                  return (
                    <button
                      key={group.provider.id}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      className={isActive ? "provider-model-picker-provider is-active" : "provider-model-picker-provider"}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        setActiveProviderID(group.provider.id)
                      }}
                    >
                      <span className="provider-model-picker-provider-name">{group.provider.name}</span>
                    </button>
                  )
                })}
              </div>

              <div className="provider-model-picker-model-list" role="listbox" aria-label={`${label} models`}>
                {activeProviderGroup && activeProviderGroup.matchingModels.length > 0 ? (
                  activeProviderGroup.matchingModels.map((model) => {
                    const modelValue = toModelValue(model)
                    const isSelected = value === modelValue

                    return (
                      <button
                        key={modelValue}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        className="provider-model-picker-model"
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          handleModelSelect(model)
                        }}
                      >
                        <span className="provider-model-picker-model-name">{model.name}</span>
                      </button>
                    )
                  })
                ) : (
                  <p className="provider-model-picker-empty">No models found.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="provider-model-picker-empty">
              {models.length === 0 ? "No models available." : "No providers or models found."}
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}

function ModelListView({ catalog, models, selectionDraft }: ModelListViewProps) {
  return (
    <div className="model-list">
      {models.map((model) => {
        const providerName = catalog.find((item) => item.id === model.providerID)?.name ?? model.providerID
        const modelValue = toModelValue(model)

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
                  {selectionDraft.imageModel === modelValue ? <span className="settings-badge is-highlight">Image</span> : null}
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

type SettingsSectionKey = "general" | "services" | "defaults" | "mcp" | "appearance" | "developer" | "archive"

type AppUpdateStatus = {
  tone: "success" | "error" | "muted"
  text: string
}

const SETTINGS_PAGE_DRAG_MARGIN = 16

interface SettingsPageOffset {
  x: number
  y: number
}

interface SettingsPageDragBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

interface SettingsPageDragState {
  bounds: SettingsPageDragBounds
  pointerID: number
  startClientX: number
  startClientY: number
  startOffset: SettingsPageOffset
}

function resolveSettingsPageDragBounds(
  overlayRect: DOMRect,
  pageRect: DOMRect,
  currentOffset: SettingsPageOffset,
): SettingsPageDragBounds {
  const leftLimit = currentOffset.x + overlayRect.left + SETTINGS_PAGE_DRAG_MARGIN - pageRect.left
  const rightLimit = currentOffset.x + overlayRect.right - SETTINGS_PAGE_DRAG_MARGIN - pageRect.right
  const topLimit = currentOffset.y + overlayRect.top + SETTINGS_PAGE_DRAG_MARGIN - pageRect.top
  const bottomLimit = currentOffset.y + overlayRect.bottom - SETTINGS_PAGE_DRAG_MARGIN - pageRect.bottom

  return {
    minX: Math.min(leftLimit, rightLimit),
    maxX: Math.max(leftLimit, rightLimit),
    minY: Math.min(topLimit, bottomLimit),
    maxY: Math.max(topLimit, bottomLimit),
  }
}

function clampSettingsPageOffset(offset: SettingsPageOffset, bounds: SettingsPageDragBounds): SettingsPageOffset {
  return {
    x: clamp(offset.x, bounds.minX, bounds.maxX),
    y: clamp(offset.y, bounds.minY, bounds.maxY),
  }
}

function shouldIgnoreSettingsDragTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false

  return Boolean(target.closest("button, a, input, select, textarea, [role='button']"))
}

interface SettingsPageProps {
  activeMcpServerID: string | null
  activeMcpServerDiagnostic: McpServerDiagnostic | null
  appearanceConfigError: string | null
  appearanceConfigPath: string | null
  appearanceConfigPreview: string
  appearanceOverrides: AppearanceTokenMap
  appearanceTokenValues: Record<AppearanceTokenName, string>
  assistantTraceVisibility: AssistantTraceVisibility
  archivedSessions: ArchivedSessionSummary[]
  archivedSessionsError: string | null
  catalog: ProviderCatalogItem[]
  deletingArchivedSessionID: string | null
  deletingMcpServerID: string | null
  deletingProviderID: string | null
  brandTheme: BrandTheme
  colorMode: ColorMode
  isActivityRailVisible: boolean
  isAgentDebugTraceEnabled: boolean
  isDebugLineColorsEnabled: boolean
  isDebugUiRegionsEnabled: boolean
  isLoading: boolean
  isLoadingArchivedSessions: boolean
  isOpen: boolean
  isRefreshingProviderCatalog: boolean
  loadError: string | null
  mcpServerDraft: McpServerDraftState
  mcpServers: McpServerSummary[]
  message: {
    tone: "success" | "error"
    text: string
  } | null
  models: ProviderModel[]
  providerDrafts: Record<string, ProviderDraftState>
  restoringArchivedSessionID: string | null
  savingMcpServerID: string | null
  savingProviderID: string | null
  testingProviderID: string | null
  selectionDraft: ProjectModelSelection
  onBrandThemeChange: (theme: BrandTheme) => void
  onColorModeChange: (mode: ColorMode) => void
  onActivityRailVisibilityChange: (value: boolean) => void
  onAppearancePaletteReset: () => void
  onAppearanceTokenChange: (tokenName: AppearanceTokenName, value: string) => void
  onAppearanceTokenReset: (tokenName: AppearanceTokenName) => void
  onAssistantTraceVisibilityChange: (key: AssistantTraceVisibilityKey, value: boolean) => void
  onAgentDebugTraceChange: (value: boolean) => void
  onDebugLineColorsChange: (value: boolean) => void
  onDebugUiRegionsChange: (value: boolean) => void
  onClose: () => void
  onDismissMessage: () => void
  onDeleteArchivedSession: (sessionID: string) => boolean | Promise<boolean>
  onDeleteMcpServer: (serverID: string) => void | Promise<void>
  onDeleteProvider: (providerID: string) => void | Promise<void>
  onDeleteProviderAuthSession: (providerID: string) => boolean | Promise<boolean>
  onMcpServerDraftChange: (field: keyof McpServerDraftState, value: string | boolean) => void
  onMcpToolPolicyChange: (toolName: string, policy: McpToolPolicyValue) => void
  onMcpServerSelect: (serverID: string) => void
  onProviderAuthMethodChange: (providerID: string, method: string) => void
  onProviderDraftChange: (providerID: string, field: "apiKey" | "baseURL", value: string) => void
  onRefreshProviderCatalog: () => boolean | Promise<boolean>
  onLoadArchivedSessions: () => void | Promise<void>
  onRestoreArchivedSession: (sessionID: string) => boolean | Promise<boolean>
  onSaveMcpServer: () => boolean | Promise<boolean>
  onSaveProviderApiKey: (providerID: string, apiKey?: string | null) => boolean | Promise<boolean>
  onSaveProvider: (providerID: string) => boolean | Promise<boolean>
  onSelectionChange: <K extends keyof ProjectModelSelection>(field: K, value: ProjectModelSelection[K]) => void
  onTestProviderConnection: (
    providerID: string,
    input?: {
      method?: string
      credentialMode?: "active" | "manual" | "environment"
      apiKey?: string | null
      baseURL?: string | null
    },
  ) => boolean | Promise<boolean>
  onStartProviderAuthFlow: (providerID: string) => boolean | Promise<boolean>
  onStartNewMcpServer: () => void
  onCancelProviderAuthFlow: (providerID: string) => boolean | Promise<boolean>
}

export function SettingsPage({
  activeMcpServerID,
  activeMcpServerDiagnostic,
  appearanceConfigError,
  appearanceConfigPath,
  appearanceConfigPreview,
  appearanceOverrides,
  appearanceTokenValues,
  assistantTraceVisibility,
  archivedSessions,
  archivedSessionsError,
  catalog,
  deletingArchivedSessionID,
  deletingMcpServerID,
  deletingProviderID,
  brandTheme,
  colorMode,
  isActivityRailVisible,
  isAgentDebugTraceEnabled,
  isDebugLineColorsEnabled,
  isDebugUiRegionsEnabled,
  isLoading,
  isLoadingArchivedSessions,
  isOpen,
  isRefreshingProviderCatalog,
  loadError,
  mcpServerDraft,
  mcpServers,
  message,
  models,
  providerDrafts,
  restoringArchivedSessionID,
  savingMcpServerID,
  savingProviderID,
  testingProviderID,
  selectionDraft,
  onBrandThemeChange,
  onColorModeChange,
  onActivityRailVisibilityChange,
  onAppearancePaletteReset,
  onAppearanceTokenChange,
  onAppearanceTokenReset,
  onAssistantTraceVisibilityChange,
  onAgentDebugTraceChange,
  onDebugLineColorsChange,
  onDebugUiRegionsChange,
  onClose,
  onDismissMessage,
  onDeleteArchivedSession,
  onDeleteMcpServer,
  onDeleteProvider,
  onDeleteProviderAuthSession,
  onMcpServerDraftChange,
  onMcpToolPolicyChange,
  onMcpServerSelect,
  onProviderAuthMethodChange,
  onProviderDraftChange,
  onRefreshProviderCatalog,
  onLoadArchivedSessions,
  onRestoreArchivedSession,
  onSaveMcpServer,
  onSaveProviderApiKey,
  onSaveProvider,
  onSelectionChange,
  onTestProviderConnection,
  onStartProviderAuthFlow,
  onStartNewMcpServer,
  onCancelProviderAuthFlow,
}: SettingsPageProps) {
  {
    const { error: localeError, locale, setLocale, t } = useI18n()
    const [activeSection, setActiveSection] = useState<SettingsSectionKey>("general")
    const [appUpdateSettings, setAppUpdateSettings] = useState<DesktopAppUpdateSettings | null>(null)
    const [appUpdateStatus, setAppUpdateStatus] = useState<AppUpdateStatus | null>(null)
    const [isCheckingAppUpdate, setIsCheckingAppUpdate] = useState(false)
    const [isSavingAutomaticUpdates, setIsSavingAutomaticUpdates] = useState(false)
    const [selectedProviderID, setSelectedProviderID] = useState<string | null>(null)
    const [providerSearch, setProviderSearch] = useState("")
    const [mcpServerSearchQuery, setMcpServerSearchQuery] = useState("")
    const [providerApiKeyModes, setProviderApiKeyModes] = useState<Record<string, ProviderApiKeyMode>>({})
    const [visibleProviderApiKeys, setVisibleProviderApiKeys] = useState<Record<string, boolean>>({})
    const settingsOverlayRef = useRef<HTMLElement | null>(null)
    const settingsPageRef = useRef<HTMLDivElement | null>(null)
    const serviceDetailPanelRef = useRef<HTMLDivElement | null>(null)
    const settingsPageOffsetRef = useRef<SettingsPageOffset>({ x: 0, y: 0 })
    const settingsPageDragRef = useRef<SettingsPageDragState | null>(null)
    const [settingsPageOffset, setSettingsPageOffset] = useState<SettingsPageOffset>({ x: 0, y: 0 })
    const [isSettingsPageDragging, setIsSettingsPageDragging] = useState(false)
    const enabledTraceVisibilityCount = assistantTraceVisibilityOptions.filter(
      (option) => assistantTraceVisibility[option.key],
    ).length

    const modelGroups = models.reduce<Record<string, ProviderModel[]>>((result, model) => {
      result[model.providerID] = [...(result[model.providerID] ?? []), model]
      return result
    }, {})
    const connectedProviderIDs = new Set(catalog.filter((item) => item.available).map((item) => item.id))
    const visibleModels = models.filter((model) => model.available && connectedProviderIDs.has(model.providerID))
    const visibleImageModels = visibleModels.filter((model) => model.capabilities.output.image)
    const filteredCatalog = getVisibleProvidersForSettings(catalog, providerSearch)
    const filteredMcpServers = mcpServers.filter((server) => doesMcpServerMatchSearch(server, mcpServerSearchQuery))
    const activeProvider = selectedProviderID ? catalog.find((item) => item.id === selectedProviderID) ?? null : null
    const activeProviderDraft = activeProvider
      ? (providerDrafts[activeProvider.id] ?? {
          apiKey: "",
          baseURL: activeProvider.baseURL ?? "",
          selectedAuthMethod: activeProvider.authState.activeMethod ?? activeProvider.authCapabilities[0]?.method ?? null,
          activeFlow: activeProvider.authState.flow ?? null,
        })
      : null
    const activeProviderModels = activeProvider ? modelGroups[activeProvider.id] ?? [] : []
    const activeProviderBusy = activeProvider ? savingProviderID === activeProvider.id || deletingProviderID === activeProvider.id : false
    const activeProviderSelectedMethod =
      activeProviderDraft?.selectedAuthMethod ?? activeProvider?.authState.activeMethod ?? activeProvider?.authCapabilities[0]?.method ?? null
    const activeProviderSelectedCapability = activeProvider
      ? getProviderAuthCapability(activeProvider, activeProviderSelectedMethod)
      : null
    const activeProviderApiKeyCapability =
      activeProvider?.authCapabilities.find((capability) => capability.kind === "api_key") ?? null
    const activeProviderFlow = activeProviderDraft?.activeFlow ?? activeProvider?.authState.flow ?? null
    const activeProviderConfigDirty = activeProvider
      ? (activeProviderDraft?.baseURL.trim() ?? "") !== (activeProvider.baseURL ?? "")
      : false
    const activeProviderApiKeyDirty =
      activeProviderSelectedCapability?.kind === "api_key" ? (activeProviderDraft?.apiKey.trim().length ?? 0) > 0 : false
    const activeProviderApiKeyMode = activeProvider
      ? providerApiKeyModes[activeProvider.id] ?? getProviderApiKeyMode(activeProvider)
      : "manual"
    const activeProviderUsesEnvironment =
      activeProviderSelectedCapability?.kind === "api_key" &&
      activeProviderApiKeyMode === "environment" &&
      Boolean(activeProvider?.env.length)
    const activeProviderApiKeyVisible = activeProvider ? Boolean(visibleProviderApiKeys[activeProvider.id]) : false
    const activeProviderCredentialModeDirty = Boolean(
      activeProvider &&
        activeProviderSelectedCapability?.kind === "api_key" &&
        activeProviderApiKeyMode === "environment" &&
        hasStoredProviderApiKey(activeProvider),
    )
    const activeProviderCanSave =
      activeProviderConfigDirty || activeProviderApiKeyDirty || activeProviderCredentialModeDirty
    const activeProviderIsTesting = activeProvider ? testingProviderID === activeProvider.id : false
    const activeProviderCredentialSummary = activeProvider ? getProviderCredentialSummary(activeProvider) : null
    const activeProviderAccountSummary =
      activeProvider?.authState.account?.label ??
      activeProvider?.authState.account?.email ??
      activeProvider?.authState.account?.workspaceName ??
      null
    const activeProviderAccount = activeProvider?.authState.account ?? null
    const activeProviderBalance = activeProvider ? formatProviderBalance(activeProvider.authState.account) : null
    const activeProviderRechargeUrl = activeProvider && isAnyboxProvider(activeProvider) ? getAnyboxRechargeUrl(activeProvider) : null
    const activeMcpServer = activeMcpServerID ? mcpServers.find((server) => server.id === activeMcpServerID) ?? null : null
    const mcpSaveLabel = activeMcpServer ? "Save server" : "Create server"
    const mcpServerBusyID = activeMcpServerID ?? mcpServerDraft.id.trim() ?? null
    const mcpServerBusy = Boolean(
      (mcpServerBusyID && savingMcpServerID === mcpServerBusyID) ||
      (mcpServerBusyID && deletingMcpServerID === mcpServerBusyID),
    )
    const mcpServerValidationError = !mcpServerDraft.id.trim()
      ? "MCP servers require an id."
      : mcpServerDraft.transport === "stdio"
        ? !mcpServerDraft.command.trim()
          ? "Local MCP servers require a command."
          : null
        : !mcpServerDraft.serverUrl.trim()
          ? "Remote MCP servers require a server URL."
          : (mcpServerDraft.allowedToolsMode === "names" || mcpServerDraft.allowedToolsMode === "read-only-names") &&
              !mcpServerDraft.allowedToolNames.trim()
            ? "Named tool filters require at least one tool name."
            : null
    const mcpServerCanSave = !mcpServerValidationError
    const showLoadedState = !isLoading && !loadError
    const showProviderSections = activeSection === "services" || activeSection === "defaults" || activeSection === "mcp"
    const appVersionLabel = appUpdateSettings?.version ? `Version ${appUpdateSettings.version}` : "Version ..."
    const automaticUpdatesEnabled = appUpdateSettings?.automaticUpdates ?? true
    useEffect(() => {
      if (!isOpen) {
        setActiveSection("general")
        setSelectedProviderID(null)
        setProviderSearch("")
        setAppUpdateStatus(null)
      }
    }, [isOpen])

    useEffect(() => {
      if (!isOpen || activeSection !== "archive") return

      void onLoadArchivedSessions()
    }, [activeSection, isOpen, onLoadArchivedSessions])

    useEffect(() => {
      if (!isOpen) return

      let disposed = false
      void getAppUpdateSettings()
        .then((settings) => {
          if (disposed || !settings) return
          setAppUpdateSettings(settings)
        })
        .catch((error: unknown) => {
          if (disposed) return
          const message = error instanceof Error ? error.message : String(error)
          setAppUpdateStatus({
            tone: "error",
            text: `Unable to load update settings. ${message}`,
          })
        })

      return () => {
        disposed = true
      }
    }, [isOpen])

    useEffect(() => {
      if (activeSection !== "services") return

      const visibleProviders = getVisibleProvidersForSettings(catalog, providerSearch)
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

    useEffect(() => {
      if (isOpen) return

      settingsPageDragRef.current = null
      setIsSettingsPageDragging(false)
    }, [isOpen])

    useEffect(() => {
      if (!isOpen) return

      function handleWindowResize() {
        clampSettingsPageIntoOverlay()
      }

      handleWindowResize()
      window.addEventListener("resize", handleWindowResize)
      return () => window.removeEventListener("resize", handleWindowResize)
    }, [isOpen])

    useEffect(() => {
      if (!isSettingsPageDragging) return

      function handleWindowPointerMove(event: globalThis.PointerEvent) {
        const dragState = settingsPageDragRef.current
        if (!dragState || event.pointerId !== dragState.pointerID) return

        event.preventDefault()
        updateSettingsPageOffset(
          clampSettingsPageOffset(
            {
              x: dragState.startOffset.x + event.clientX - dragState.startClientX,
              y: dragState.startOffset.y + event.clientY - dragState.startClientY,
            },
            dragState.bounds,
          ),
        )
      }

      function stopSettingsPageDrag(pointerID?: number) {
        const dragState = settingsPageDragRef.current
        if (dragState && typeof pointerID === "number" && pointerID !== dragState.pointerID) return

        settingsPageDragRef.current = null
        setIsSettingsPageDragging(false)
      }

      function handleWindowPointerStop(event: globalThis.PointerEvent) {
        stopSettingsPageDrag(event.pointerId)
      }

      function handleWindowBlur() {
        stopSettingsPageDrag()
      }

      document.body.classList.add("is-dragging-settings-page")
      window.addEventListener("pointermove", handleWindowPointerMove)
      window.addEventListener("pointerup", handleWindowPointerStop)
      window.addEventListener("pointercancel", handleWindowPointerStop)
      window.addEventListener("blur", handleWindowBlur)
      return () => {
        document.body.classList.remove("is-dragging-settings-page")
        window.removeEventListener("pointermove", handleWindowPointerMove)
        window.removeEventListener("pointerup", handleWindowPointerStop)
        window.removeEventListener("pointercancel", handleWindowPointerStop)
        window.removeEventListener("blur", handleWindowBlur)
      }
    }, [isSettingsPageDragging])

    if (!isOpen) return null

    function updateSettingsPageOffset(nextOffset: SettingsPageOffset) {
      settingsPageOffsetRef.current = nextOffset
      setSettingsPageOffset((currentOffset) =>
        currentOffset.x === nextOffset.x && currentOffset.y === nextOffset.y ? currentOffset : nextOffset,
      )
    }

    function clampSettingsPageIntoOverlay() {
      const overlayElement = settingsOverlayRef.current
      const pageElement = settingsPageRef.current
      if (!overlayElement || !pageElement) return

      const bounds = resolveSettingsPageDragBounds(
        overlayElement.getBoundingClientRect(),
        pageElement.getBoundingClientRect(),
        settingsPageOffsetRef.current,
      )
      updateSettingsPageOffset(clampSettingsPageOffset(settingsPageOffsetRef.current, bounds))
    }

    function handleSettingsHeaderPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.button !== 0 || shouldIgnoreSettingsDragTarget(event.target)) return

      const overlayElement = settingsOverlayRef.current
      const pageElement = settingsPageRef.current
      if (!overlayElement || !pageElement) return

      event.preventDefault()
      const startOffset = settingsPageOffsetRef.current
      settingsPageDragRef.current = {
        bounds: resolveSettingsPageDragBounds(
          overlayElement.getBoundingClientRect(),
          pageElement.getBoundingClientRect(),
          startOffset,
        ),
        pointerID: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startOffset,
      }
      setIsSettingsPageDragging(true)
    }

    function handleSettingsOverlayClick(event: MouseEvent<HTMLElement>) {
      if (event.target !== event.currentTarget) return
      onClose()
    }

    async function refreshAppUpdateSettings() {
      const settings = await getAppUpdateSettings()
      if (settings) {
        setAppUpdateSettings(settings)
      }
      return settings
    }

    function getManualUpdateCheckStatusText(result: Awaited<ReturnType<typeof checkForAppUpdates>> | null) {
      if (!result) return "Update check requested."
      if (!result.ok) return result.error ? `Update check failed. ${result.error}` : "Update check failed."
      if (result.reason === "not-packaged") return "Update checks run in packaged builds."
      if (result.reason === "already-checking") return "An update check is already in progress."
      return "Update check started."
    }

    async function handleCheckForUpdates() {
      if (isCheckingAppUpdate) return

      setIsCheckingAppUpdate(true)
      setAppUpdateStatus({
        tone: "muted",
        text: "Checking for updates...",
      })

      try {
        const result = await checkForAppUpdates()
        setAppUpdateStatus({
          tone: result?.ok === false ? "error" : "success",
          text: getManualUpdateCheckStatusText(result),
        })
        await refreshAppUpdateSettings()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setAppUpdateStatus({
          tone: "error",
          text: `Update check failed. ${message}`,
        })
      } finally {
        setIsCheckingAppUpdate(false)
      }
    }

    async function handleAutomaticUpdatesToggle() {
      if (!appUpdateSettings || isSavingAutomaticUpdates) return

      const enabled = !appUpdateSettings.automaticUpdates
      setIsSavingAutomaticUpdates(true)
      setAppUpdateStatus(null)

      try {
        const settings = await setAutomaticUpdatesEnabled(enabled)
        if (settings) {
          setAppUpdateSettings(settings)
        } else {
          setAppUpdateSettings({
            ...appUpdateSettings,
            automaticUpdates: enabled,
          })
        }
        setAppUpdateStatus({
          tone: "success",
          text: enabled ? "Automatic updates enabled." : "Automatic updates disabled.",
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setAppUpdateStatus({
          tone: "error",
          text: `Unable to save automatic update setting. ${message}`,
        })
      } finally {
        setIsSavingAutomaticUpdates(false)
      }
    }

    function setProviderApiKeyMode(providerID: string, mode: ProviderApiKeyMode) {
      setProviderApiKeyModes((current) => ({
        ...current,
        [providerID]: mode,
      }))
    }

    function toggleProviderApiKeyVisibility(providerID: string) {
      setVisibleProviderApiKeys((current) => ({
        ...current,
        [providerID]: !current[providerID],
      }))
    }

    function selectProviderAuthOption(providerID: string, method: string, apiKeyMode?: ProviderApiKeyMode) {
      if (apiKeyMode) {
        setProviderApiKeyMode(providerID, apiKeyMode)
      }
      onProviderAuthMethodChange(providerID, method)
    }

    async function handleActiveProviderSave() {
      if (!activeProvider || !activeProviderDraft) return

      if (activeProviderConfigDirty) {
        const didSaveConfig = await onSaveProvider(activeProvider.id)
        if (!didSaveConfig) return
      }

      if (activeProviderSelectedCapability?.kind === "api_key") {
        if (activeProviderCredentialModeDirty) {
          await onSaveProviderApiKey(activeProvider.id, null)
          return
        }

        if (activeProviderApiKeyMode === "manual" && activeProviderApiKeyDirty) {
          await onSaveProviderApiKey(activeProvider.id, activeProviderDraft.apiKey)
        }
      }
    }

    function handleActiveProviderTest() {
      if (!activeProvider || !activeProviderDraft) return

      void onTestProviderConnection(activeProvider.id, {
        method: activeProviderSelectedMethod ?? undefined,
        credentialMode:
          activeProviderSelectedCapability?.kind === "api_key" ? activeProviderApiKeyMode : "active",
        apiKey:
          activeProviderSelectedCapability?.kind === "api_key" &&
          activeProviderApiKeyMode === "manual" &&
          activeProviderDraft.apiKey.trim()
            ? activeProviderDraft.apiKey.trim()
            : undefined,
        baseURL: activeProviderDraft.baseURL.trim() || undefined,
      })
    }

    const brandThemeOptions = [
      {
        value: "terra" as const,
        label: "Warm Terra & Sand",
        description: "Muted pale red, warm stone surfaces, and a softer trust-first feel.",
      },
      {
        value: "sage" as const,
        label: "Sage / Slate",
        description: "Cool sage accents with the existing slate-driven shell.",
      },
    ]
    const languageOptions: Array<{ value: AppLocale; label: string; description: string }> = [
      {
        value: "zh-CN",
        label: t("settings.appearance.localeZh"),
        description: t("settings.appearance.localeZhDescription"),
      },
      {
        value: "en-US",
        label: t("settings.appearance.localeEn"),
        description: t("settings.appearance.localeEnDescription"),
      },
    ]
    const hasCustomAppearanceOverrides = Object.keys(appearanceOverrides).length > 0

    const primarySectionGroups = [
      {
        label: "\u9009\u9879",
        items: [
          { key: "general" as const, label: t("settings.nav.general"), Icon: MonitorIcon },
          { key: "services" as const, label: "Provider", Icon: SettingsIcon },
          { key: "defaults" as const, label: "Models", Icon: ConnectedStatusIcon },
          { key: "appearance" as const, label: "Appearance", Icon: LayoutSidebarLeftIcon },
          { key: "developer" as const, label: "Developer Mode", Icon: TerminalIcon },
          { key: "archive" as const, label: "Archived Sessions", Icon: ArchiveIcon },
        ],
      },
    ] as const

    const languageSection = (
      <section className="settings-panel">
        <div className="settings-section-header">
          <div>
            <span className="label">{t("settings.general.languageLabel")}</span>
            <h3>{t("settings.general.languageTitle")}</h3>
          </div>
          <p>{t("settings.general.languageCopy")}</p>
        </div>
        <div className="settings-color-mode-group" role="group" aria-label={t("settings.general.localeGroup")}>
          {languageOptions.map((option) => (
            <button
              key={option.value}
              className={locale === option.value ? "settings-color-mode-option is-active" : "settings-color-mode-option"}
              role="radio"
              aria-checked={locale === option.value}
              type="button"
              onClick={() => void setLocale(option.value)}
            >
              <span>{option.label}</span>
              <small>{option.description}</small>
            </button>
          ))}
        </div>
        {localeError ? (
          <p className="settings-helper-text settings-theme-config-error">
            {t("settings.general.localeSaveFailed")} {localeError}
          </p>
        ) : null}
      </section>
    )

    return (
      <section
        ref={settingsOverlayRef}
        className={isSettingsPageDragging ? "settings-page-overlay is-dragging-settings-page" : "settings-page-overlay"}
        role="presentation"
        onClick={handleSettingsOverlayClick}
      >
        <div
          ref={settingsPageRef}
          className={isSettingsPageDragging ? "settings-page is-dragging" : "settings-page"}
          role="dialog"
          aria-modal="true"
          aria-label="Settings"
          style={{ transform: `translate3d(${settingsPageOffset.x}px, ${settingsPageOffset.y}px, 0)` }}
        >
          <header className="settings-page-header" title="Drag settings" onPointerDown={handleSettingsHeaderPointerDown}>
            <button className="settings-page-close-button" aria-label="Close settings" title="Close settings" onClick={onClose}>
              <CloseIcon />
            </button>
          </header>

          {message ? (
            <div className="settings-toast-region">
              <div
                className={message.tone === "success" ? "settings-banner is-success" : "settings-banner is-error"}
                role={message.tone === "success" ? "status" : "alert"}
              >
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
            </div>
          ) : null}

          <div className="settings-page-shell">
            <aside className="settings-page-primary-nav" aria-label="Settings sections">
              {primarySectionGroups.map((group) => (
                <section key={group.label} className="settings-primary-nav-group" aria-label={group.label}>
                  <p className="settings-primary-nav-group-label">{group.label}</p>
                  <div className="settings-primary-nav-group-items">
                    {group.items.map((section) => {
                      const isActive = activeSection === section.key
                      const Icon = section.Icon

                      return (
                        <button
                          key={section.key}
                          className={isActive ? "settings-primary-nav-item is-active" : "settings-primary-nav-item"}
                          aria-current={isActive ? "page" : undefined}
                          type="button"
                          onClick={() => setActiveSection(section.key)}
                        >
                          <span className="settings-primary-nav-icon" aria-hidden="true">
                            <Icon />
                          </span>
                          <span className="settings-primary-nav-copy">
                            <span className="settings-primary-nav-label">{section.label}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
            </aside>

            <div className={activeSection === "services" ? "settings-page-main is-services" : "settings-page-main"}>
              {loadError && showProviderSections ? <div className="settings-banner is-error">{loadError}</div> : null}

              {archivedSessionsError && activeSection === "archive" ? (
                <div className="settings-banner is-error">{archivedSessionsError}</div>
              ) : null}

              {isLoading && showProviderSections ? (
                <article className="settings-empty-state">
                  <span className="label">Loading</span>
                  <h3>Fetching provider catalog</h3>
                  <p>Reading provider availability, model visibility, and saved model preferences.</p>
                </article>
              ) : null}

              {isLoadingArchivedSessions && activeSection === "archive" ? (
                <article className="settings-empty-state">
                  <span className="label">Loading</span>
                  <h3>Fetching archived sessions</h3>
                  <p>Reading archived session snapshots so you can restore or permanently delete them.</p>
                </article>
              ) : null}

              {activeSection === "general" ? (
                <div className="settings-general-layout">
                  <section className="settings-panel settings-about-panel" aria-label="About Fanfande Studio">
                    <div className="settings-about-row settings-about-version-row">
                      <div className="settings-about-copy">
                        <span className="label">About</span>
                        <h3>{appVersionLabel}</h3>
                        <p>Fanfande Studio desktop application.</p>
                      </div>
                      <button
                        className="primary-button settings-about-check-button"
                        type="button"
                        disabled={isCheckingAppUpdate}
                        onClick={() => void handleCheckForUpdates()}
                      >
                        {isCheckingAppUpdate ? "Checking..." : "Check for updates"}
                      </button>
                    </div>

                    <div className="settings-about-divider" />

                    <button
                      className={
                        automaticUpdatesEnabled
                          ? "settings-about-toggle-row is-active"
                          : "settings-about-toggle-row"
                      }
                      type="button"
                      role="switch"
                      aria-checked={automaticUpdatesEnabled}
                      disabled={!appUpdateSettings || isSavingAutomaticUpdates}
                      onClick={() => void handleAutomaticUpdatesToggle()}
                    >
                      <span className="settings-about-copy">
                        <span className="settings-about-title">Automatic updates</span>
                        <span className="settings-about-description">
                          Turn this off to prevent the app from checking for updates.
                        </span>
                      </span>
                      <span className="settings-toggle-control" aria-hidden="true">
                        <span className="settings-toggle-thumb" />
                      </span>
                    </button>

                    {appUpdateStatus ? (
                      <p className={`settings-about-status is-${appUpdateStatus.tone}`}>{appUpdateStatus.text}</p>
                    ) : null}
                  </section>

                  {languageSection}
                </div>
              ) : activeSection === "appearance" ? (
                <div className="settings-appearance-layout">
                  <section className="settings-panel">
                    <div className="settings-section-header">
                      <div>
                        <span className="label">Brand</span>
                        <h3>Accent Theme</h3>
                      </div>
                      <p>Switch between the new warm terra palette and the original cool sage shell.</p>
                    </div>
                    <div className="settings-theme-palette-group" role="group" aria-label="Accent theme">
                      {brandThemeOptions.map((theme) => (
                        <button
                          key={theme.value}
                          className={
                            brandTheme === theme.value
                              ? "settings-theme-palette-option is-active"
                              : "settings-theme-palette-option"
                          }
                          role="radio"
                          aria-checked={brandTheme === theme.value}
                          type="button"
                          onClick={() => onBrandThemeChange(theme.value)}
                        >
                          <span className={`settings-theme-palette-swatch is-${theme.value}`} aria-hidden="true">
                            <span />
                            <span />
                            <span />
                          </span>
                          <span className="settings-theme-palette-copy">
                            <strong>{theme.label}</strong>
                            <small>{theme.description}</small>
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="settings-panel">
                    <div className="settings-section-header">
                      <div>
                        <span className="label">Theme</span>
                        <h3>Color Mode</h3>
                      </div>
                      <p>Choose between light, dark, or system-matched color scheme.</p>
                    </div>
                    <div className="settings-color-mode-group" role="group" aria-label="Color mode">
                      {(["system", "light", "dark"] as const).map((mode) => (
                        <button
                          key={mode}
                          className={colorMode === mode ? "settings-color-mode-option is-active" : "settings-color-mode-option"}
                          role="radio"
                          aria-checked={colorMode === mode}
                          type="button"
                          onClick={() => onColorModeChange(mode)}
                        >
                          <span className="settings-color-mode-icon" aria-hidden="true">
                            {mode === "light" ? <SunIcon size={16} /> : mode === "dark" ? <MoonIcon size={16} /> : <MonitorIcon size={16} />}
                          </span>
                          <span>{mode === "system" ? "System" : mode === "light" ? "Light" : "Dark"}</span>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="settings-panel">
                    <div className="settings-section-header">
                      <div>
                        <span className="label">Config</span>
                        <h3>Theme Config File</h3>
                      </div>
                      <div className="settings-inline-actions">
                        <button
                          className="secondary-button"
                          type="button"
                          disabled={!hasCustomAppearanceOverrides}
                          onClick={onAppearancePaletteReset}
                        >
                          Reset Custom Colors
                        </button>
                      </div>
                    </div>

                    <div className="settings-theme-config-meta">
                      <div className="settings-theme-config-path">
                        <span className="label">Saved To</span>
                        <code>{appearanceConfigPath ?? "Appearance config bridge unavailable."}</code>
                      </div>
                      <p className="settings-helper-text">
                        This file is saved automatically. After you tune the palette here, you can ask the coding agent to
                        read this JSON and continue building UI against the exact same color scheme.
                      </p>
                      {appearanceConfigError ? (
                        <p className="settings-helper-text settings-theme-config-error">{appearanceConfigError}</p>
                      ) : null}
                    </div>

                    <label className="settings-theme-config-preview">
                      <span className="label">Current JSON</span>
                      <textarea
                        aria-label="Current appearance config JSON"
                        readOnly
                        value={appearanceConfigPreview}
                      />
                    </label>
                  </section>

                  {APPEARANCE_TOKEN_GROUPS.map((group) => (
                    <section key={group.id} className="settings-panel settings-theme-token-panel">
                      <div className="settings-section-header">
                        <div>
                          <h3>{group.label}</h3>
                        </div>
                        <p>{group.description}</p>
                      </div>

                      <div className="settings-theme-token-grid">
                        {group.rows.map((row) => {
                          const isLightCustomized = Boolean(appearanceOverrides[row.lightToken])
                          const isDarkCustomized = Boolean(appearanceOverrides[row.darkToken])
                          const isCustomized = isLightCustomized || isDarkCustomized
                          const lightColorLabel = `${group.label} ${row.label} Light ${row.lightToken}`
                          const darkColorLabel = `${group.label} ${row.label} Dark ${row.darkToken}`

                          return (
                            <article
                              key={row.id}
                              className={
                                isCustomized
                                  ? "settings-theme-token-card is-customized"
                                  : "settings-theme-token-card"
                              }
                            >
                              <div className="settings-theme-token-copy">
                                <strong>{row.label}</strong>
                                <code className="settings-theme-token-name">{row.id}</code>
                              </div>

                              <div className="settings-theme-token-controls">
                                <div className="settings-theme-token-mode">
                                  <span>Light</span>
                                  <input
                                    aria-label={lightColorLabel}
                                    className="settings-theme-color-picker"
                                    type="color"
                                    value={appearanceTokenValues[row.lightToken]}
                                    onChange={(event) => onAppearanceTokenChange(row.lightToken, event.target.value)}
                                  />
                                  <AppearanceColorTextInput
                                    label={lightColorLabel}
                                    value={appearanceTokenValues[row.lightToken]}
                                    onCommit={(value) => onAppearanceTokenChange(row.lightToken, value)}
                                  />
                                </div>
                                <div className="settings-theme-token-mode">
                                  <span>Dark</span>
                                  <input
                                    aria-label={darkColorLabel}
                                    className="settings-theme-color-picker"
                                    type="color"
                                    value={appearanceTokenValues[row.darkToken]}
                                    onChange={(event) => onAppearanceTokenChange(row.darkToken, event.target.value)}
                                  />
                                  <AppearanceColorTextInput
                                    label={darkColorLabel}
                                    value={appearanceTokenValues[row.darkToken]}
                                    onCommit={(value) => onAppearanceTokenChange(row.darkToken, value)}
                                  />
                                </div>
                                <button
                                  aria-label={`Use preset for ${group.label} ${row.label}`}
                                  className="secondary-button settings-theme-token-reset"
                                  type="button"
                                  disabled={!isCustomized}
                                  title="Use Preset"
                                  onClick={() => {
                                    onAppearanceTokenReset(row.lightToken)
                                    onAppearanceTokenReset(row.darkToken)
                                  }}
                                >
                                  <ResetIcon size={14} />
                                </button>
                              </div>
                            </article>
                          )
                        })}
                      </div>
                    </section>
                  ))}

                  <section className="settings-panel">
                    <div className="settings-section-header">
                      <div>
                        <span className="label">Shell</span>
                        <h3>Layout Visibility</h3>
                      </div>
                      <p>Control whether the narrow navigation rail is shown on the left edge of the desktop shell.</p>
                    </div>

                    <button
                      className={isActivityRailVisible ? "settings-toggle-card is-active" : "settings-toggle-card"}
                      role="switch"
                      aria-checked={isActivityRailVisible}
                      aria-label="Show left rail"
                      type="button"
                      onClick={() => onActivityRailVisibilityChange(!isActivityRailVisible)}
                    >
                      <span className="settings-toggle-copy">
                        <strong className="settings-toggle-title">
                          <span className="settings-toggle-icon" aria-hidden="true">
                            <LayoutSidebarLeftIcon />
                          </span>
                          <span>Show left rail</span>
                        </strong>
                        <small>Display the narrow rail and keep the sidebar toggle inside it.</small>
                      </span>
                      <span className="settings-toggle-control" aria-hidden="true">
                        <span className="settings-toggle-thumb" />
                      </span>
                    </button>

                    <p className="settings-helper-text">
                      When the left rail is hidden, its toggle moves into the left sidebar header or the left side of the canvas top menu. The right inspector has no rail, so its toggle always switches between the inspector header and the right side of the canvas top menu.
                    </p>
                  </section>

                  <section className="settings-panel">
                    <div className="settings-section-header">
                      <div>
                        <span className="label">Current</span>
                        <h3>Appearance State</h3>
                      </div>
                      <p>The left rail is optional. The right inspector stays toggle-only and does not use a dedicated rail.</p>
                    </div>

                    <div className="settings-section-summary">
                      <article className="settings-summary-card">
                        <span className="label">Left</span>
                        <strong>{isActivityRailVisible ? "Shown" : "Hidden"}</strong>
                        <p>
                          {isActivityRailVisible
                            ? "The narrow rail is visible and always contains the sidebar toggle."
                            : "The rail is hidden, and the toggle appears in the sidebar header or canvas top menu depending on the current layout."}
                        </p>
                      </article>
                      <article className="settings-summary-card">
                        <span className="label">Right</span>
                        <strong>No rail</strong>
                        <p>
                          The inspector toggle lives in the right sidebar header while the sidebar is open, and moves to the canvas top menu when the inspector is collapsed.
                        </p>
                      </article>
                    </div>
                  </section>
                </div>
              ) : activeSection === "developer" ? (
                <div className="settings-developer-layout">
                  <section className="settings-panel">
                    <div className="settings-section-header">
                      <div>
                        <span className="label">Monitor</span>
                        <h3>Agent Monitor</h3>
                      </div>
                      <p>Open the standalone monitor dashboard for local agent status, runtime sessions, and live logs.</p>
                    </div>

                    <div className="settings-actions-row">
                      <span className="settings-helper-text">
                        Opens a dedicated desktop window and falls back to the bundled monitor build when the dev server is not running.
                      </span>
                      <button
                        className="secondary-button"
                        type="button"
                        aria-label="Open monitor"
                        onClick={() => void openMonitorWindow()}
                      >
                        Open Monitor
                      </button>
                    </div>
                  </section>

                  <section className="settings-panel">
                    <div className="settings-section-header">
                      <div>
                        <span className="label">Development</span>
                        <h3>Debug Region Colors</h3>
                      </div>
                      <p>Toggle the temporary region background colors used during UI structure discussions and layout iteration.</p>
                    </div>

                    <button
                      className={isDebugUiRegionsEnabled ? "settings-toggle-card is-active" : "settings-toggle-card"}
                      role="switch"
                      aria-checked={isDebugUiRegionsEnabled}
                      aria-label="Show debug region colors"
                      type="button"
                      onClick={() => onDebugUiRegionsChange(!isDebugUiRegionsEnabled)}
                    >
                      <span className="settings-toggle-copy">
                        <strong className="settings-toggle-title">
                          <span className="settings-toggle-icon" aria-hidden="true">
                            <PaletteIcon />
                          </span>
                          <span>Show debug region colors</span>
                        </strong>
                        <small>Fill major UI regions with temporary colors so layout discussions can refer to them directly.</small>
                      </span>
                      <span className="settings-toggle-control" aria-hidden="true">
                        <span className="settings-toggle-thumb" />
                      </span>
                    </button>

                    <p className="settings-helper-text">
                      This development overlay follows the color mapping documented in the desktop UI structure guide and can be disabled once the layout is agreed.
                    </p>
                  </section>

                  <section className="settings-panel">
                    <div className="settings-section-header">
                      <div>
                        <span className="label">Development</span>
                        <h3>Debug Line Colors</h3>
                      </div>
                      <p>Color the remaining top-region dividers differently so it is obvious which line comes from the shell edge and which comes from the pane tabs.</p>
                    </div>

                    <button
                      className={isDebugLineColorsEnabled ? "settings-toggle-card is-active" : "settings-toggle-card"}
                      role="switch"
                      aria-checked={isDebugLineColorsEnabled}
                      aria-label="Show line debug colors"
                      type="button"
                      onClick={() => onDebugLineColorsChange(!isDebugLineColorsEnabled)}
                    >
                      <span className="settings-toggle-copy">
                        <strong className="settings-toggle-title">
                          <span className="settings-toggle-icon" aria-hidden="true">
                            <MinimizeIcon />
                          </span>
                          <span>Show line debug colors</span>
                        </strong>
                        <small>Use separate highlight colors for the shell top border and the pane tab divider.</small>
                      </span>
                      <span className="settings-toggle-control" aria-hidden="true">
                        <span className="settings-toggle-thumb" />
                      </span>
                    </button>

                    <p className="settings-helper-text">
                      This keeps the normal theme untouched until you need to inspect which remaining thin line is actually being painted in the top region.
                    </p>
                  </section>

                  <section className="settings-panel">
                    <div className="settings-section-header">
                      <div>
                        <span className="label">Agent</span>
                        <h3>Trace Visibility</h3>
                      </div>
                      <p>Decide which trace categories get a seat in the main thread, from user-facing response text down to workflow markers and backend metadata.</p>
                    </div>

                    <div className="settings-section-summary">
                      {assistantTraceVisibilityOptions.map((option) => {
                        const enabled = assistantTraceVisibility[option.key]

                        return (
                          <button
                            key={option.key}
                            className={enabled ? "settings-toggle-card is-active" : "settings-toggle-card"}
                            role="switch"
                            aria-checked={enabled}
                            aria-label={`Show trace ${option.title.toLowerCase()}`}
                            type="button"
                            onClick={() => onAssistantTraceVisibilityChange(option.key, !enabled)}
                          >
                            <span className="settings-toggle-copy">
                              <strong className="settings-toggle-title">
                                <span className="settings-toggle-icon" aria-hidden="true">
                                  <FileTextIcon />
                                </span>
                                <span>{option.title}</span>
                              </strong>
                              <small>{option.description}</small>
                            </span>
                            <span className="settings-toggle-control" aria-hidden="true">
                              <span className="settings-toggle-thumb" />
                            </span>
                          </button>
                        )
                      })}
                    </div>

                    <p className="settings-helper-text">
                      Tool calls stay visible through the main trace. The tool input and output switches control whether each tool entry reveals the streamed payloads behind that lifecycle item, while debug metadata adds backend-only identifiers and timing details to every entry.
                    </p>
                  </section>

                  <section className="settings-panel">
                    <div className="settings-section-header">
                      <div>
                        <span className="label">Current</span>
                        <h3>Developer State</h3>
                      </div>
                      <p>Region and line colors are development overlays, while the trace controls decide how much backend execution detail appears inside the main thread.</p>
                    </div>

                    <div className="settings-section-summary">
                      <article className="settings-summary-card">
                        <span className="label">Debug Regions</span>
                        <strong>{isDebugUiRegionsEnabled ? "Shown" : "Hidden"}</strong>
                        <p>
                          {isDebugUiRegionsEnabled
                            ? "Major interface regions use temporary background colors to make layout discussions faster."
                            : "Region debug colors are disabled, so the interface shows only the current visual theme."}
                        </p>
                      </article>
                      <article className="settings-summary-card">
                        <span className="label">Line Colors</span>
                        <strong>{isDebugLineColorsEnabled ? "Shown" : "Hidden"}</strong>
                        <p>
                          {isDebugLineColorsEnabled
                            ? "The remaining top-region dividers use separate colors so the shell border and pane divider can be distinguished immediately."
                            : "Top divider lines use the current theme colors, so they blend back into the regular interface."}
                        </p>
                      </article>
                      <article className="settings-summary-card">
                        <span className="label">Agent Trace</span>
                        <strong>{enabledTraceVisibilityCount}/{assistantTraceVisibilityOptions.length} enabled</strong>
                        <p>
                          {assistantTraceVisibility.debugMetadata
                            ? "The main trace is showing backend metadata in addition to the enabled response, tool, approval, file, and workflow categories."
                            : "The main trace is showing the enabled user-facing categories while backend metadata stays collapsed."}
                        </p>
                      </article>
                    </div>
                  </section>
                </div>
              ) : activeSection === "archive" ? (
                isLoadingArchivedSessions ? null : (
                <div className="settings-archive-layout">
                  <section className="settings-panel">
                    <div className="settings-section-header">
                      <div>
                        <span className="label">Archive</span>
                        <h3>Archived Sessions</h3>
                      </div>
                      <p>Archived sessions stay out of normal startup loading until you restore them.</p>
                    </div>

                    {archivedSessions.length === 0 ? (
                      <article className="settings-empty-state">
                        <span className="label">Empty</span>
                        <h3>No archived sessions</h3>
                        <p>Archive a session from the workspace sidebar to manage it here.</p>
                      </article>
                    ) : (
                      <div className="settings-archive-list" role="list" aria-label="Archived sessions">
                        {archivedSessions.map((session) => {
                          const isRestoring = restoringArchivedSessionID === session.id
                          const isDeleting = deletingArchivedSessionID === session.id
                          const projectLabel = session.projectName ?? session.projectID

                          return (
                            <article key={session.id} className="settings-archive-item" role="listitem">
                              <div className="settings-archive-copy">
                                <div className="settings-archive-heading">
                                  <strong>{session.title}</strong>
                                  {session.projectMissing ? (
                                    <span className="settings-badge settings-archive-badge is-warning">Project missing</span>
                                  ) : null}
                                </div>
                                <div className="settings-archive-meta">
                                  <span>{projectLabel}</span>
                                  <span>{session.directory}</span>
                                  <span>Updated {formatTime(session.updated)}</span>
                                  <span>Archived {formatTime(session.archivedAt)}</span>
                                  <span>{session.messageCount} messages</span>
                                  <span>{session.eventCount} events</span>
                                </div>
                              </div>

                              <div className="settings-inline-actions settings-archive-actions">
                                <button
                                  className="secondary-button"
                                  disabled={isRestoring || isDeleting}
                                  type="button"
                                  onClick={() => void onRestoreArchivedSession(session.id)}
                                >
                                  {isRestoring ? "Restoring..." : "Restore"}
                                </button>
                                <button
                                  className="secondary-button is-danger"
                                  disabled={isRestoring || isDeleting}
                                  type="button"
                                  onClick={() => void onDeleteArchivedSession(session.id)}
                                >
                                  {isDeleting ? "Deleting..." : "Delete"}
                                </button>
                              </div>
                            </article>
                          )
                        })}
                      </div>
                    )}
                  </section>
                </div>
                )
              ) : showLoadedState ? (
                activeSection === "services" ? (
                  <section className="settings-services-layout" aria-label="Provider layout">
                    <div className="settings-service-list-panel settings-provider-list-panel">
                      <div className="settings-provider-search-row">
                        <div className="settings-field settings-search-field">
                          <input
                            aria-label="Search providers"
                            type="text"
                            value={providerSearch}
                            placeholder="Search providers"
                            onChange={(event: ChangeEvent<HTMLInputElement>) => setProviderSearch(event.target.value)}
                          />
                        </div>
                        <button
                          className="secondary-button"
                          aria-label="Refresh provider catalog"
                          type="button"
                          disabled={isRefreshingProviderCatalog}
                          onClick={() => void onRefreshProviderCatalog()}
                        >
                          {isRefreshingProviderCatalog ? "Refreshing..." : "Refresh"}
                        </button>
                      </div>

                      <div className="settings-service-list-body">
                        {filteredCatalog.length > 0 ? (
                          <div className="settings-service-list" role="list" aria-label="Provider list">
                            {filteredCatalog.map((provider) => {
                              const isActive = provider.id === activeProvider?.id
                              const connectionLabel = getProviderConnectionLabel(provider)
                              const sourceLabel = providerSourceLabel(provider)

                              return (
                                <button
                                  key={provider.id}
                                  className={isActive ? "settings-service-item is-active" : "settings-service-item"}
                                  aria-label={`${provider.name} ${connectionLabel}`}
                                  aria-pressed={isActive}
                                  onClick={() => setSelectedProviderID(provider.id)}
                                >
                                  <div className="settings-service-item-header">
                                    <span className="settings-service-item-title">
                                      <ProviderLogo provider={provider} />
                                      <strong>{provider.name}</strong>
                                    </span>
                                    <span
                                      className={
                                        isProviderConnected(provider)
                                          ? "settings-status-indicator is-connected"
                                          : "settings-status-indicator is-disconnected"
                                      }
                                      aria-hidden="true"
                                      title={connectionLabel}
                                    >
                                      {isProviderConnected(provider) ? <ConnectedStatusIcon /> : <DisconnectedStatusIcon />}
                                    </span>
                                  </div>
                                  {sourceLabel !== "Catalog" ? <span className="settings-service-item-copy">{sourceLabel}</span> : null}
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
                          <div className="settings-panel provider-detail-card">
                            <div className="provider-detail-header">
                              <ProviderLogo provider={activeProvider} className="is-large" />
                              <div>
                                <h3>{activeProvider.name}</h3>
                                <p>
                                  <span
                                    className={
                                      isProviderConnected(activeProvider)
                                        ? "provider-detail-status-dot is-connected"
                                        : "provider-detail-status-dot"
                                    }
                                    aria-hidden="true"
                                  />
                                  {getProviderHeaderSummary(activeProvider)}
                                </p>
                              </div>
                            </div>

                            <div className="provider-detail-divider" />

                            <div className="provider-detail-body">
                              <div className="provider-detail-field">
                                <span className="settings-field-label">连接方式</span>

                                <div className="provider-radio-stack" role="radiogroup" aria-label={`${activeProvider.name} connection method`}>
                                  {activeProvider.authCapabilities
                                    .filter((capability) => capability.kind !== "api_key")
                                    .map((capability) => (
                                      <label key={capability.method} className="provider-radio-option">
                                        <input
                                          type="radio"
                                          name={`provider-${activeProvider.id}-connection-method`}
                                          checked={activeProviderSelectedMethod === capability.method}
                                          onChange={() => selectProviderAuthOption(activeProvider.id, capability.method)}
                                        />
                                        <span>{getProviderAuthMethodOptionLabel(activeProvider, capability)}</span>
                                      </label>
                                    ))}
                                  {activeProviderApiKeyCapability && activeProvider.env.length > 0 ? (
                                    <label className="provider-radio-option">
                                      <input
                                        type="radio"
                                        name={`provider-${activeProvider.id}-connection-method`}
                                        checked={
                                          activeProviderSelectedMethod === activeProviderApiKeyCapability.method &&
                                          activeProviderApiKeyMode === "environment"
                                        }
                                        onChange={() =>
                                          selectProviderAuthOption(activeProvider.id, activeProviderApiKeyCapability.method, "environment")
                                        }
                                      />
                                      <span>使用环境变量 {activeProvider.env.join(", ")}</span>
                                    </label>
                                  ) : null}
                                  {activeProviderApiKeyCapability ? (
                                    <label className="provider-radio-option">
                                      <input
                                        type="radio"
                                        name={`provider-${activeProvider.id}-connection-method`}
                                        checked={
                                          activeProviderSelectedMethod === activeProviderApiKeyCapability.method &&
                                          (activeProviderApiKeyMode === "manual" || activeProvider.env.length === 0)
                                        }
                                        onChange={() =>
                                          selectProviderAuthOption(activeProvider.id, activeProviderApiKeyCapability.method, "manual")
                                        }
                                      />
                                      <span>手动输入 API key</span>
                                    </label>
                                  ) : null}
                                </div>
                              </div>

                              {activeProviderSelectedCapability?.kind === "api_key" ? (
                                <div className="provider-detail-field">
                                  <label className="settings-field provider-key-field">
                                    <span className="settings-field-label">API key</span>
                                    <span className="provider-key-input-wrap">
                                      <input
                                        aria-label={`API key for ${activeProvider.name}`}
                                        type={activeProviderApiKeyVisible ? "text" : "password"}
                                        readOnly={activeProviderUsesEnvironment}
                                        value={
                                          activeProviderUsesEnvironment
                                            ? "••••••••••••••••••••••••"
                                            : activeProviderDraft.apiKey
                                        }
                                        placeholder={getProviderKeyPlaceholder(activeProvider)}
                                        onChange={(event) =>
                                          onProviderDraftChange(activeProvider.id, "apiKey", event.target.value)
                                        }
                                      />
                                      <button
                                        className="provider-key-visibility-button"
                                        type="button"
                                        aria-label={activeProviderApiKeyVisible ? "隐藏 API key" : "显示 API key"}
                                        onClick={() => toggleProviderApiKeyVisibility(activeProvider.id)}
                                      >
                                        {activeProviderApiKeyVisible ? <EyeIcon /> : <EyeOffIcon />}
                                      </button>
                                    </span>
                                  </label>
                                  <p className="provider-detail-helper">
                                    {activeProviderUsesEnvironment
                                      ? "当前连接来自环境变量，修改需更新本地环境变量。"
                                      : activeProviderCredentialSummary ?? "API key 会保存到全应用共享凭据中。"}
                                  </p>
                                </div>
                              ) : null}

                              {activeProviderSelectedCapability?.kind === "browser_oauth" ? (
                                <div className="provider-detail-field">
                                  <p className="provider-detail-helper">
                                    {activeProviderFlow && !isProviderFlowTerminal(activeProviderFlow.status)
                                      ? activeProviderFlow.errorMessage ?? "请在浏览器中完成登录。"
                                      : activeProviderAccountSummary ?? activeProvider.lastAuthError ?? "使用浏览器登录来连接此 provider。"}
                                  </p>
                                  {isAnyboxProvider(activeProvider) && activeProvider.authState.status === "connected" ? (
                                    <div className="provider-account-summary" aria-label="Anybox account summary">
                                      {activeProviderAccount?.email ? (
                                        <div className="provider-account-summary-row">
                                          <span>账号</span>
                                          <strong>{activeProviderAccount.email}</strong>
                                        </div>
                                      ) : null}
                                      {activeProviderAccount?.workspaceName || activeProviderAccount?.planType ? (
                                        <div className="provider-account-summary-row">
                                          <span>工作区 / 套餐</span>
                                          <strong>
                                            {[activeProviderAccount.workspaceName, activeProviderAccount.planType]
                                              .filter(Boolean)
                                              .join(" / ")}
                                          </strong>
                                        </div>
                                      ) : null}
                                      {activeProviderBalance ? (
                                        <div className="provider-account-summary-row">
                                          <span>余额</span>
                                          <strong>{activeProviderBalance}</strong>
                                        </div>
                                      ) : null}
                                    </div>
                                  ) : null}
                                  <div className="settings-inline-actions">
                                    {isAnyboxProvider(activeProvider) && activeProviderRechargeUrl ? (
                                      <button
                                        className="secondary-button"
                                        disabled={activeProviderBusy}
                                        onClick={() => void openExternalUrl(activeProviderRechargeUrl)}
                                      >
                                        充值
                                      </button>
                                    ) : null}
                                    {activeProvider.authState.status !== "not_connected" ? (
                                      <button
                                        className="secondary-button"
                                        disabled={activeProviderBusy}
                                        onClick={() => void onDeleteProviderAuthSession(activeProvider.id)}
                                      >
                                        断开连接
                                      </button>
                                    ) : null}
                                    {activeProviderFlow && !isProviderFlowTerminal(activeProviderFlow.status) ? (
                                      <button
                                        className="secondary-button"
                                        disabled={activeProviderBusy}
                                        onClick={() => void onCancelProviderAuthFlow(activeProvider.id)}
                                      >
                                        取消
                                      </button>
                                    ) : null}
                                    <button
                                      className="primary-button"
                                      disabled={activeProviderBusy}
                                      onClick={() => void onStartProviderAuthFlow(activeProvider.id)}
                                    >
                                      {activeProvider.authState.status === "connected" ? "重新登录" : "继续登录"}
                                    </button>
                                  </div>
                                </div>
                              ) : null}

                              {activeProviderSelectedCapability?.kind === "device_code" ? (
                                <div className="provider-detail-field">
                                  <div className="settings-field-grid">
                                    <label className="settings-field">
                                      <span className="settings-field-label">验证链接</span>
                                      <input
                                        aria-label={`${activeProvider.name} verification URL`}
                                        type="text"
                                        readOnly
                                        value={activeProviderFlow?.verificationURI ?? ""}
                                        placeholder="启动设备登录后生成链接"
                                      />
                                    </label>

                                    <label className="settings-field">
                                      <span className="settings-field-label">一次性代码</span>
                                      <input
                                        aria-label={`${activeProvider.name} device code`}
                                        type="text"
                                        readOnly
                                        value={activeProviderFlow?.userCode ?? ""}
                                        placeholder="启动设备登录后生成代码"
                                      />
                                    </label>
                                  </div>
                                  <p className="provider-detail-helper">
                                    {activeProviderFlow && !isProviderFlowTerminal(activeProviderFlow.status)
                                      ? activeProviderFlow.errorMessage ?? "输入代码并保持此窗口打开。"
                                      : activeProvider.lastAuthError ?? "当浏览器登录无法完成时使用设备代码连接。"}
                                  </p>
                                  <div className="settings-inline-actions">
                                    {activeProviderFlow?.verificationURI ? (
                                      <button
                                        className="secondary-button"
                                        onClick={() => void openExternalUrl(activeProviderFlow.verificationURI!)}
                                      >
                                        打开链接
                                      </button>
                                    ) : null}
                                    {activeProviderFlow?.verificationURI ? (
                                      <button
                                        className="secondary-button"
                                        onClick={() => void writeTextToClipboard(activeProviderFlow.verificationURI!)}
                                      >
                                        复制链接
                                      </button>
                                    ) : null}
                                    {activeProviderFlow?.userCode ? (
                                      <button
                                        className="secondary-button"
                                        onClick={() => void writeTextToClipboard(activeProviderFlow.userCode!)}
                                      >
                                        复制代码
                                      </button>
                                    ) : null}
                                    {activeProviderFlow && !isProviderFlowTerminal(activeProviderFlow.status) ? (
                                      <button
                                        className="secondary-button"
                                        disabled={activeProviderBusy}
                                        onClick={() => void onCancelProviderAuthFlow(activeProvider.id)}
                                      >
                                        取消
                                      </button>
                                    ) : null}
                                    <button
                                      className="primary-button"
                                      disabled={activeProviderBusy}
                                      onClick={() => void onStartProviderAuthFlow(activeProvider.id)}
                                    >
                                      {activeProviderFlow && !isProviderFlowTerminal(activeProviderFlow.status) ? "重新开始" : "开始设备登录"}
                                    </button>
                                  </div>
                                </div>
                              ) : null}

                              <details className="provider-advanced-settings">
                                <summary>
                                  <span>高级设置</span>
                                  <ChevronDownIcon />
                                </summary>
                                <div className="provider-advanced-settings-body">
                                  <label className="settings-field">
                                    <span className="settings-field-label">
                                      {isAnyboxProvider(activeProvider) ? "Anybox API URL" : "Base URL"}
                                    </span>
                                    <input
                                      aria-label={`Base URL for ${activeProvider.name}`}
                                      type="text"
                                      value={activeProviderDraft.baseURL}
                                      placeholder={activeProvider.baseURL ?? "Optional custom endpoint"}
                                      onChange={(event) =>
                                        onProviderDraftChange(activeProvider.id, "baseURL", event.target.value)
                                      }
                                    />
                                  </label>
                                </div>
                              </details>
                            </div>

                            <div className="provider-detail-footer">
                              <div className="settings-inline-actions">
                                <button
                                  className="secondary-button"
                                  type="button"
                                  disabled={activeProviderBusy || activeProviderIsTesting}
                                  onClick={handleActiveProviderTest}
                                >
                                  {activeProviderIsTesting ? "测试中..." : "测试连接"}
                                </button>
                                <button
                                  className="primary-button"
                                  aria-label={`Save ${activeProvider.name} settings`}
                                  type="button"
                                  disabled={activeProviderBusy || activeProviderIsTesting || !activeProviderCanSave}
                                  onClick={() => void handleActiveProviderSave()}
                                >
                                  {savingProviderID === activeProvider.id ? "保存中..." : "保存"}
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="settings-panel">
                            <div className="settings-section-header">
                              <div>
                                <h3>Provider Models</h3>
                              </div>
                            </div>

                            {activeProviderModels.length > 0 ? (
                              <ModelListView catalog={catalog} models={activeProviderModels} selectionDraft={selectionDraft} />
                            ) : (
                              <article className="settings-empty-state">
                                <span className="label">No Models</span>
                                <h3>No models are visible for this provider yet</h3>
                                <p>Connect a shared sign-in method or store an API key, then refresh the catalog to populate visible models.</p>
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
                ) : activeSection === "mcp" ? (
                  <section className="settings-services-layout" aria-label="MCP server layout">
                    <div className="settings-service-list-panel mcp-servers-list-panel">
                      <div className="mcp-servers-search-row" role="search">
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
                      <div className="settings-service-list-body">
                        <div className="settings-service-list mcp-servers-list-stack" role="list" aria-label="MCP servers">
                          {filteredMcpServers.length > 0 ? (
                            filteredMcpServers.map((server) => {
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
                          ) : mcpServers.length > 0 ? (
                            <article className="settings-empty-state settings-service-list-empty-state">
                              <span className="label">No Match</span>
                              <h3>No MCP servers match this search</h3>
                            </article>
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
                      <>
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
                        </>
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
                        <div className="settings-field">
                          <span className="settings-field-label">Primary model</span>
                          <ProviderModelPicker
                            catalog={catalog}
                            emptyLabel="Use server default"
                            label="Primary model"
                            models={visibleModels}
                            value={selectionDraft.model}
                            onChange={(value) => onSelectionChange("model", value)}
                          />
                        </div>

                        <div className="settings-field">
                          <span className="settings-field-label">Small model</span>
                          <ProviderModelPicker
                            catalog={catalog}
                            emptyLabel="Use server default"
                            label="Small model"
                            models={visibleModels}
                            value={selectionDraft.smallModel}
                            onChange={(value) => onSelectionChange("smallModel", value)}
                          />
                        </div>

                        <div className="settings-field">
                          <span className="settings-field-label">Image generation model</span>
                          <ProviderModelPicker
                            catalog={catalog}
                            emptyLabel="Not configured"
                            label="Image generation model"
                            models={visibleImageModels}
                            value={selectionDraft.imageModel}
                            onChange={(value) => onSelectionChange("imageModel", value)}
                          />
                        </div>

                        <label className="settings-field">
                          <span className="settings-field-label">Default image size</span>
                          <select
                            aria-label="Default image size"
                            value={selectionDraft.imageDefaultSize ?? ""}
                            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                              onSelectionChange("imageDefaultSize", event.target.value ? event.target.value : null)
                            }
                          >
                            <option value="">Provider default</option>
                            <option value="1024x1024">1024x1024</option>
                            <option value="1024x1536">1024x1536</option>
                            <option value="1536x1024">1536x1024</option>
                          </select>
                        </label>

                        <label className="settings-field">
                          <span className="settings-field-label">Default image count</span>
                          <select
                            aria-label="Default image count"
                            value={selectionDraft.imageDefaultCount?.toString() ?? ""}
                            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                              onSelectionChange("imageDefaultCount", event.target.value ? Number(event.target.value) : null)
                            }
                          >
                            <option value="">1 image</option>
                            <option value="2">2 images</option>
                            <option value="3">3 images</option>
                            <option value="4">4 images</option>
                          </select>
                        </label>
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
                                <div className="provider-row-title">
                                  <ProviderLogo provider={provider} className="is-large" />
                                  <div>
                                    <span className="label">{providerSourceLabel(provider)}</span>
                                    <h4>{provider.name}</h4>
                                  </div>
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
                      <div className="settings-field">
                        <span className="settings-field-label">Primary model</span>
                        <ProviderModelPicker
                          catalog={catalog}
                          emptyLabel="Use server default"
                          label="Primary model"
                          models={visibleModels}
                          value={selectionDraft.model}
                          onChange={(value) => onSelectionChange("model", value)}
                        />
                      </div>

                      <div className="settings-field">
                        <span className="settings-field-label">Small model</span>
                        <ProviderModelPicker
                          catalog={catalog}
                          emptyLabel="Use server default"
                          label="Small model"
                          models={visibleModels}
                          value={selectionDraft.smallModel}
                          onChange={(value) => onSelectionChange("smallModel", value)}
                        />
                      </div>
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
                      <p>Open the Provider tab, connect a provider account or API key, then come back here to review the unlocked models.</p>
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
