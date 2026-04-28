import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent, type PointerEvent } from "react"
import { APPEARANCE_TOKEN_GROUPS, type AppearanceTokenMap, type AppearanceTokenName } from "../../../../shared/appearance"
import {
  ArchiveIcon,
  CloseIcon,
  ConnectedStatusIcon,
  DisconnectedStatusIcon,
  ChevronDownIcon,
  EyeIcon,
  EyeOffIcon,
  FileTextIcon,
  FolderIcon,
  LayoutSidebarLeftIcon,
  MinimizeIcon,
  MonitorIcon,
  MoonIcon,
  PaletteIcon,
  ResetIcon,
  SettingsIcon,
  SunIcon,
  TerminalIcon
} from "../icons"
import { writeTextToClipboard } from "../shared-ui"
import type {
  ArchivedSessionSummary,
  AssistantTraceVisibility,
  AssistantTraceVisibilityKey,
  BrandTheme,
  BuiltinToolSummary,
  ColorMode,
  McpServerDiagnostic,
  McpServerDraftState,
  McpServerSummary,
  ProjectModelSelection,
  PromptPresetDocument,
  PromptPresetSelection,
  PromptPresetSummary,
  ProviderAuthCapability,
  ProviderCatalogItem,
  ProviderDraftState,
  ProviderModel
} from "../types"
import { clamp, formatTime } from "../utils"
import { openExternalUrl } from "./client"

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

function buildModelTags(model: ProviderModel) {
  const tags = [`${formatContextWindow(model.limit.context)} ctx`]

  if (model.capabilities.reasoning) tags.push("Reasoning")
  if (model.capabilities.toolcall) tags.push("Tools")
  if (model.capabilities.input.image) tags.push("Vision")
  if (model.capabilities.attachment && model.capabilities.input.pdf) tags.push("PDF")

  return tags
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
  if (provider.id === "openai" && capability.kind === "browser_oauth") return "ChatGPT Pro/Plus（浏览器登录）"
  if (provider.id === "openai" && capability.kind === "device_code") return "ChatGPT Pro/Plus（设备码登录）"
  return capability.recommended ? `${capability.label}（推荐）` : capability.label
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

function getMcpServerSummaryLine(server: McpServerSummary) {
  if (server.transport === "stdio") {
    return server.command
  }

  return server.serverUrl ?? server.connectorId ?? "Remote HTTP MCP"
}

function getMcpTransportLabel(transport: McpServerSummary["transport"] | McpServerDraftState["transport"]) {
  return transport === "remote" ? "http" : "stdio"
}

function getPromptPresetSourceLabel(source: PromptPresetSummary["source"]) {
  return source === "custom" ? "Custom" : "Bundled"
}

function getPromptPresetUsageLabels(
  presetID: string,
  selection: PromptPresetSelection | null,
) {
  if (!selection) return []

  const labels: string[] = []
  if (selection.systemPromptPresetID === presetID) {
    labels.push("System")
  }
  if (selection.planModePromptPresetID === presetID) {
    labels.push("Plan")
  }

  return labels
}

function getBuiltinToolKindLabel(tool: BuiltinToolSummary) {
  return getBuiltinToolGroupLabel(tool.capabilities.kind ?? "other")
}

function getBuiltinToolGroupLabel(kind: BuiltinToolSummary["capabilities"]["kind"] | "other") {
  switch (kind) {
    case "exec":
      return "Shell"
    case "write":
      return "Write"
    case "search":
      return "Search"
    case "read":
      return "Read"
    case "workflow":
      return "Workflow"
    case "interaction":
      return "Interaction"
    case "delegation":
      return "Delegation"
    default:
      return "Other"
  }
}

function getBuiltinToolRiskLabel(tool: BuiltinToolSummary) {
  if (tool.capabilities.needsShell || tool.capabilities.kind === "exec") return "Shell access"
  if (tool.capabilities.kind === "delegation") return tool.capabilities.readOnly ? "Delegation status" : "Delegates work"
  if (tool.capabilities.kind === "workflow") return "Workflow control"
  if (tool.capabilities.kind === "interaction") return "User interaction"
  if (tool.capabilities.destructive) return "High risk"
  if (tool.capabilities.readOnly) return "Read-only"
  return "Moderate"
}

function getBuiltinToolRiskBadgeClassName(tool: BuiltinToolSummary) {
  if (
    tool.capabilities.needsShell ||
    tool.capabilities.kind === "exec" ||
    tool.capabilities.destructive ||
    (tool.capabilities.kind === "delegation" && !tool.capabilities.readOnly) ||
    (tool.capabilities.kind === "workflow" && !tool.capabilities.readOnly)
  ) {
    return "settings-badge is-warning"
  }
  if (tool.capabilities.readOnly) {
    return "settings-badge is-highlight"
  }
  return "settings-badge"
}

type SettingsSectionKey = "services" | "defaults" | "mcp" | "tools" | "prompts" | "appearance" | "developer" | "archive"

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
  builtinTools: BuiltinToolSummary[]
  builtinToolsError: string | null
  catalog: ProviderCatalogItem[]
  deletingArchivedSessionID: string | null
  deletingMcpServerID: string | null
  deletingPromptPresetID: string | null
  deletingProviderID: string | null
  brandTheme: BrandTheme
  colorMode: ColorMode
  isCreatingPromptPreset: boolean
  isActivityRailVisible: boolean
  isAgentDebugTraceEnabled: boolean
  isDebugLineColorsEnabled: boolean
  isDebugUiRegionsEnabled: boolean
  isLoading: boolean
  isLoadingBuiltinTools: boolean
  isLoadingPromptPreset: boolean
  isLoadingPrompts: boolean
  isLoadingArchivedSessions: boolean
  isOpen: boolean
  isPromptDirty: boolean
  isBuiltinToolSelectionDirty: boolean
  isSystemPromptPresetDirty: boolean
  isPlanModePromptPresetDirty: boolean
  isRefreshingProviderCatalog: boolean
  isSavingPromptPresetSelection: boolean
  isSavingBuiltinTools: boolean
  isSavingSelection: boolean
  loadError: string | null
  mcpServerDraft: McpServerDraftState
  mcpServers: McpServerSummary[]
  message: {
    tone: "success" | "error"
    text: string
  } | null
  models: ProviderModel[]
  promptDraftLabel: string
  promptDraftContent: string
  promptLoadError: string | null
  promptPresets: PromptPresetSummary[]
  promptPresetSelection: PromptPresetSelection | null
  providerDrafts: Record<string, ProviderDraftState>
  onCreatePromptPreset: () => boolean | Promise<boolean>
  onDeletePromptPreset: () => boolean | Promise<boolean>
  resettingPromptPresetID: string | null
  restoringArchivedSessionID: string | null
  savedSelection: ProjectModelSelection
  savingMcpServerID: string | null
  savingPromptPresetID: string | null
  savingPromptPresetSelectionField: keyof PromptPresetSelection | null
  savingProviderID: string | null
  testingProviderID: string | null
  selectedPromptPreset: PromptPresetDocument | null
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
  onBuiltinToolToggle: (toolID: string, enabled: boolean) => void
  onDeleteArchivedSession: (sessionID: string) => boolean | Promise<boolean>
  onDeleteMcpServer: (serverID: string) => void | Promise<void>
  onDeleteProviderAuthSession: (providerID: string) => boolean | Promise<boolean>
  onMcpServerDraftChange: (field: keyof McpServerDraftState, value: string | boolean) => void
  onPromptDraftLabelChange: (value: string) => void
  onPromptDraftChange: (value: string) => void
  onPromptPresetSelectionChange: (field: keyof PromptPresetSelection, value: string) => void
  onSavePromptPresetSelection: (field?: keyof PromptPresetSelection) => boolean | Promise<boolean>
  onPromptPresetSelect: (presetID: string) => boolean | Promise<boolean>
  onMcpServerSelect: (serverID: string) => void
  onProviderAuthMethodChange: (providerID: string, method: string) => void
  onProviderDraftChange: (providerID: string, field: "apiKey" | "baseURL", value: string) => void
  onRefreshProviderCatalog: () => boolean | Promise<boolean>
  onResetPromptPreset: () => boolean | Promise<boolean>
  onResetBuiltinTools: () => boolean | Promise<boolean>
  onRestoreArchivedSession: (sessionID: string) => boolean | Promise<boolean>
  onSaveBuiltinTools: () => boolean | Promise<boolean>
  onSaveMcpServer: () => boolean | Promise<boolean>
  onSavePromptPreset: () => boolean | Promise<boolean>
  onSaveProviderApiKey: (providerID: string, apiKey?: string | null) => boolean | Promise<boolean>
  onSaveProvider: (providerID: string) => boolean | Promise<boolean>
  onSaveSelection: () => void | Promise<void>
  onSelectionChange: (field: keyof ProjectModelSelection, value: string | null) => void
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
  builtinTools,
  builtinToolsError,
  catalog,
  deletingArchivedSessionID,
  deletingMcpServerID,
  deletingPromptPresetID,
  deletingProviderID,
  brandTheme,
  colorMode,
  isCreatingPromptPreset,
  isActivityRailVisible,
  isAgentDebugTraceEnabled,
  isDebugLineColorsEnabled,
  isDebugUiRegionsEnabled,
  isLoading,
  isLoadingBuiltinTools,
  isLoadingPromptPreset,
  isLoadingPrompts,
  isLoadingArchivedSessions,
  isOpen,
  isPromptDirty,
  isBuiltinToolSelectionDirty,
  isSystemPromptPresetDirty,
  isPlanModePromptPresetDirty,
  isRefreshingProviderCatalog,
  isSavingPromptPresetSelection,
  isSavingBuiltinTools,
  isSavingSelection,
  loadError,
  mcpServerDraft,
  mcpServers,
  message,
  models,
  promptDraftLabel,
  promptDraftContent,
  promptLoadError,
  promptPresets,
  promptPresetSelection,
  providerDrafts,
  onCreatePromptPreset,
  onDeletePromptPreset,
  resettingPromptPresetID,
  restoringArchivedSessionID,
  savedSelection,
  savingMcpServerID,
  savingPromptPresetID,
  savingPromptPresetSelectionField,
  savingProviderID,
  testingProviderID,
  selectedPromptPreset,
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
  onBuiltinToolToggle,
  onDeleteArchivedSession,
  onDeleteMcpServer,
  onDeleteProviderAuthSession,
  onMcpServerDraftChange,
  onPromptDraftLabelChange,
  onPromptDraftChange,
  onPromptPresetSelectionChange,
  onSavePromptPresetSelection,
  onPromptPresetSelect,
  onMcpServerSelect,
  onProviderAuthMethodChange,
  onProviderDraftChange,
  onRefreshProviderCatalog,
  onResetPromptPreset,
  onResetBuiltinTools,
  onRestoreArchivedSession,
  onSaveBuiltinTools,
  onSaveMcpServer,
  onSavePromptPreset,
  onSaveProviderApiKey,
  onSaveProvider,
  onSaveSelection,
  onSelectionChange,
  onTestProviderConnection,
  onStartProviderAuthFlow,
  onStartNewMcpServer,
  onCancelProviderAuthFlow,
}: SettingsPageProps) {
  {
    const [activeSection, setActiveSection] = useState<SettingsSectionKey>("services")
    const [selectedProviderID, setSelectedProviderID] = useState<string | null>(null)
    const [providerSearch, setProviderSearch] = useState("")
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
    const filteredCatalog = getVisibleProvidersForSettings(catalog, providerSearch)
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
    const selectionUnchanged =
      savedSelection.model === selectionDraft.model && savedSelection.smallModel === selectionDraft.smallModel
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
    const enabledBuiltinToolCount = builtinTools.filter((tool) => tool.enabled).length
    const builtinToolKindOrder = ["exec", "write", "delegation", "workflow", "interaction", "search", "read", "other"] as const
    const builtinToolGroups = builtinToolKindOrder
      .map((kind) => {
        const items = builtinTools.filter((tool) => (tool.capabilities.kind ?? "other") === kind)
        return {
          kind,
          label: getBuiltinToolGroupLabel(kind),
          items,
        }
      })
      .filter((group) => group.items.length > 0)
    const promptPresetOptions = [...promptPresets].sort((left, right) => {
      if (left.source !== right.source) {
        return left.source === "bundled" ? -1 : 1
      }

      return left.label.localeCompare(right.label)
    })
    const selectedPromptPresetBusy =
      selectedPromptPreset !== null &&
      (
        savingPromptPresetID === selectedPromptPreset.id ||
        resettingPromptPresetID === selectedPromptPreset.id ||
        deletingPromptPresetID === selectedPromptPreset.id
      )
    useEffect(() => {
      if (!isOpen) {
        setActiveSection("services")
        setSelectedProviderID(null)
        setProviderSearch("")
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

    function handlePromptPresetSelection(presetID: string) {
      if (presetID === selectedPromptPreset?.id) return
      if (
        isPromptDirty &&
        typeof window.confirm === "function" &&
        !window.confirm("Discard unsaved prompt changes and switch presets?")
      ) {
        return
      }

      void onPromptPresetSelect(presetID)
    }

    function handlePromptPresetCreate() {
      if (
        isPromptDirty &&
        typeof window.confirm === "function" &&
        !window.confirm("Discard unsaved prompt changes and create a new preset?")
      ) {
        return
      }

      void onCreatePromptPreset()
    }

    const selectedPromptPresetUsageLabels = selectedPromptPreset
      ? getPromptPresetUsageLabels(selectedPromptPreset.id, promptPresetSelection)
      : []
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
    const hasCustomAppearanceOverrides = Object.keys(appearanceOverrides).length > 0

    const primarySectionGroups = [
      {
        label: "\u9009\u9879",
        items: [
          { key: "services" as const, label: "Provider", Icon: SettingsIcon },
          { key: "defaults" as const, label: "Models", Icon: ConnectedStatusIcon },
          { key: "mcp" as const, label: "MCP", Icon: FolderIcon },
          { key: "tools" as const, label: "Tools", Icon: TerminalIcon },
          { key: "prompts" as const, label: "Prompts", Icon: FileTextIcon },
          { key: "appearance" as const, label: "Appearance", Icon: LayoutSidebarLeftIcon },
          { key: "developer" as const, label: "Developer Mode", Icon: TerminalIcon },
          { key: "archive" as const, label: "Archived Sessions", Icon: ArchiveIcon },
        ],
      },
    ] as const

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

            <div
              className={
                activeSection === "services" || activeSection === "prompts"
                  ? "settings-page-main is-services"
                  : "settings-page-main"
              }
            >
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

              {loadError && showProviderSections ? <div className="settings-banner is-error">{loadError}</div> : null}

              {archivedSessionsError && activeSection === "archive" ? (
                <div className="settings-banner is-error">{archivedSessionsError}</div>
              ) : null}

              {promptLoadError && activeSection === "prompts" ? (
                <div className="settings-banner is-error">{promptLoadError}</div>
              ) : null}

              {builtinToolsError && activeSection === "tools" ? (
                <div className="settings-banner is-error">{builtinToolsError}</div>
              ) : null}

              {isLoading && showProviderSections ? (
                <article className="settings-empty-state">
                  <span className="label">Loading</span>
                  <h3>Fetching provider catalog</h3>
                  <p>Reading provider availability, model visibility, and saved model preferences.</p>
                </article>
              ) : null}

              {isLoadingBuiltinTools && activeSection === "tools" ? (
                <article className="settings-empty-state">
                  <span className="label">Loading</span>
                  <h3>Fetching built-in tools</h3>
                  <p>Reading the built-in registry and saved global availability limits.</p>
                </article>
              ) : null}

              {isLoadingPrompts && activeSection === "prompts" ? (
                <article className="settings-empty-state">
                  <span className="label">Loading</span>
                  <h3>Fetching prompt presets</h3>
                  <p>Reading the prompt catalog, override state, and current editable content.</p>
                </article>
              ) : null}

              {isLoadingArchivedSessions && activeSection === "archive" ? (
                <article className="settings-empty-state">
                  <span className="label">Loading</span>
                  <h3>Fetching archived sessions</h3>
                  <p>Reading archived session snapshots so you can restore or permanently delete them.</p>
                </article>
              ) : null}

              {activeSection === "tools" ? (
                isLoadingBuiltinTools ? null : (
                  <section className="settings-panel settings-tools-panel" aria-label="Built-in tools">
                    <div className="settings-tools-header">
                      <div>
                        <span className="label">Built-in tools</span>
                        <h2>Global tool availability</h2>
                        <p>
                          {enabledBuiltinToolCount} of {builtinTools.length} built-in tools enabled.
                        </p>
                      </div>
                      <div className="settings-tools-actions">
                        <button
                          className="secondary-button"
                          type="button"
                          disabled={isSavingBuiltinTools}
                          onClick={() => void onResetBuiltinTools()}
                        >
                          {isSavingBuiltinTools ? "Resetting..." : "Reset to default"}
                        </button>
                        <button
                          className="primary-button"
                          type="button"
                          disabled={!isBuiltinToolSelectionDirty || isSavingBuiltinTools}
                          onClick={() => void onSaveBuiltinTools()}
                        >
                          {isSavingBuiltinTools ? "Saving..." : "Save changes"}
                        </button>
                      </div>
                    </div>

                    {builtinTools.length > 0 ? (
                      <div className="settings-tool-groups">
                        {builtinToolGroups.map((group) => (
                          <section key={group.kind} className="settings-tool-group" aria-label={`${group.label} tools`}>
                            <div className="settings-tool-group-heading">
                              <h3>{group.label}</h3>
                              <span className="settings-badge">{group.items.length}</span>
                            </div>
                            <div className="settings-tool-list">
                              {group.items.map((tool) => (
                                <button
                                  key={tool.id}
                                  className={
                                    tool.enabled
                                      ? "settings-toggle-card is-active settings-tool-card"
                                      : "settings-toggle-card settings-tool-card"
                                  }
                                  type="button"
                                  aria-pressed={tool.enabled}
                                  onClick={() => onBuiltinToolToggle(tool.id, !tool.enabled)}
                                >
                                  <span className="settings-toggle-copy">
                                    <span className="settings-tool-card-header">
                                      <strong>{tool.title}</strong>
                                      <span className="settings-tool-id">{tool.id}</span>
                                    </span>
                                    <small>{tool.description}</small>
                                    <span className="settings-tool-meta">
                                      <span className="settings-badge">{getBuiltinToolKindLabel(tool)}</span>
                                      <span className={getBuiltinToolRiskBadgeClassName(tool)}>{getBuiltinToolRiskLabel(tool)}</span>
                                      {tool.aliases.length > 0 ? (
                                        <span className="settings-badge">{tool.aliases.length} aliases</span>
                                      ) : null}
                                    </span>
                                  </span>
                                  <span className="settings-toggle-control" aria-hidden="true">
                                    <span className="settings-toggle-thumb" />
                                  </span>
                                </button>
                              ))}
                            </div>
                          </section>
                        ))}
                      </div>
                    ) : (
                      <article className="settings-empty-state">
                        <h3>No built-in tools</h3>
                        <p>The agent registry did not return any built-in tools.</p>
                      </article>
                    )}
                  </section>
                )
              ) : activeSection === "prompts" ? (
                isLoadingPrompts ? null : (
                  <section className="settings-prompts-shell" aria-label="Prompt preset layout">
                    <section className="settings-panel settings-prompt-slots-panel">
                      <div className="settings-prompt-assignment-list">
                        <div className="settings-prompt-assignment-row">
                          <div className="settings-prompt-assignment-copy">
                            <span className="settings-prompt-assignment-title">System</span>
                            <span className="settings-prompt-assignment-note">Every turn</span>
                          </div>

                          <div className="settings-prompt-assignment-control">
                            <div className="settings-prompt-assignment-actions">
                              <select
                                id="settings-system-prompt-preset"
                                aria-label="System prompt preset"
                                value={promptPresetSelection?.systemPromptPresetID ?? ""}
                                disabled={!promptPresetSelection || isSavingPromptPresetSelection}
                                onChange={(event) =>
                                  onPromptPresetSelectionChange("systemPromptPresetID", event.target.value)
                                }
                              >
                                {promptPresetOptions.map((preset) => (
                                  <option key={`system-${preset.id}`} value={preset.id}>
                                    {preset.label}
                                  </option>
                                ))}
                              </select>
                              <button
                                className="secondary-button"
                                type="button"
                                aria-label="Confirm system prompt preset"
                                disabled={!isSystemPromptPresetDirty || isSavingPromptPresetSelection}
                                onClick={() => void onSavePromptPresetSelection("systemPromptPresetID")}
                              >
                                {savingPromptPresetSelectionField === "systemPromptPresetID" ? "Saving..." : "Confirm"}
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="settings-prompt-assignment-row">
                          <div className="settings-prompt-assignment-copy">
                            <span className="settings-prompt-assignment-title">Plan</span>
                            <span className="settings-prompt-assignment-note">Plan only</span>
                          </div>

                          <div className="settings-prompt-assignment-control">
                            <div className="settings-prompt-assignment-actions">
                              <select
                                id="settings-plan-mode-prompt-preset"
                                aria-label="Plan mode prompt preset"
                                value={promptPresetSelection?.planModePromptPresetID ?? ""}
                                disabled={!promptPresetSelection || isSavingPromptPresetSelection}
                                onChange={(event) =>
                                  onPromptPresetSelectionChange("planModePromptPresetID", event.target.value)
                                }
                              >
                                {promptPresetOptions.map((preset) => (
                                  <option key={`plan-${preset.id}`} value={preset.id}>
                                    {preset.label}
                                  </option>
                                ))}
                              </select>
                              <button
                                className="secondary-button"
                                type="button"
                                aria-label="Confirm plan mode prompt preset"
                                disabled={!isPlanModePromptPresetDirty || isSavingPromptPresetSelection}
                                onClick={() => void onSavePromptPresetSelection("planModePromptPresetID")}
                              >
                                {savingPromptPresetSelectionField === "planModePromptPresetID" ? "Saving..." : "Confirm"}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>

                    <div className="settings-services-layout settings-prompts-layout">
                      <div className="settings-service-list-panel settings-prompt-library-panel">
                        <div className="settings-prompt-section-bar">
                          <h3>Presets</h3>
                          <button
                            className="secondary-button"
                            type="button"
                            disabled={isCreatingPromptPreset}
                            onClick={handlePromptPresetCreate}
                          >
                            {isCreatingPromptPreset ? "Creating..." : "New"}
                          </button>
                        </div>

                        <div className="settings-service-list-body">
                          {promptPresetOptions.length > 0 ? (
                            <div className="settings-service-list settings-prompt-library" role="list" aria-label="Prompt presets">
                              {promptPresetOptions.map((preset) => {
                                const isActive = preset.id === selectedPromptPreset?.id
                                const usageLabels = getPromptPresetUsageLabels(preset.id, promptPresetSelection)

                                return (
                                  <button
                                    key={preset.id}
                                    className={
                                      isActive
                                        ? "settings-service-item settings-prompt-library-item is-active"
                                        : "settings-service-item settings-prompt-library-item"
                                    }
                                    aria-label={preset.label}
                                    aria-pressed={isActive}
                                    type="button"
                                    onClick={() => handlePromptPresetSelection(preset.id)}
                                  >
                                    <div className="settings-service-item-header">
                                      <strong>{preset.label}</strong>
                                      <span className="settings-badge">{getPromptPresetSourceLabel(preset.source)}</span>
                                    </div>
                                    <div className="settings-prompt-item-statuses">
                                      {usageLabels.map((label) => (
                                        <span key={`${preset.id}-${label}`} className="settings-badge is-highlight">
                                          {label}
                                        </span>
                                      ))}
                                      {preset.hasOverride ? <span className="settings-badge is-warning">Edited</span> : null}
                                    </div>
                                  </button>
                                )
                              })}
                            </div>
                          ) : (
                            <article className="settings-empty-state settings-service-list-empty-state">
                              <h3>No presets</h3>
                            </article>
                          )}
                        </div>
                      </div>

                      <div className="settings-service-detail-panel settings-prompt-detail-panel">
                        {selectedPromptPreset ? (
                          <section className="settings-panel settings-prompt-editor-panel">
                            <div className="settings-prompt-editor-header">
                              <div className="settings-prompt-editor-meta">
                                {selectedPromptPreset.source === "custom" ? (
                                  <input
                                    className="settings-prompt-name-input"
                                    aria-label="Preset name"
                                    value={promptDraftLabel}
                                    readOnly={isLoadingPromptPreset}
                                    onChange={(event) => onPromptDraftLabelChange(event.target.value)}
                                  />
                                ) : (
                                  <h3>{selectedPromptPreset.label}</h3>
                                )}

                                <div className="settings-prompt-item-statuses">
                                  <span className="settings-badge">{getPromptPresetSourceLabel(selectedPromptPreset.source)}</span>
                                  {selectedPromptPresetUsageLabels.map((label) => (
                                    <span key={`${selectedPromptPreset.id}-${label}`} className="settings-badge is-highlight">
                                      {label}
                                    </span>
                                  ))}
                                  {selectedPromptPreset.hasOverride ? (
                                    <span className="settings-badge is-warning">Edited</span>
                                  ) : null}
                                  {isLoadingPromptPreset ? <span className="settings-badge">Loading</span> : null}
                                </div>
                              </div>

                              <div className="settings-inline-actions">
                                {selectedPromptPreset.source === "custom" ? (
                                  <button
                                    className="secondary-button"
                                    type="button"
                                    disabled={selectedPromptPresetBusy || isLoadingPromptPreset}
                                    onClick={() => void onDeletePromptPreset()}
                                  >
                                    {deletingPromptPresetID === selectedPromptPreset.id ? "Deleting..." : "Delete"}
                                  </button>
                                ) : (
                                  <button
                                    className="secondary-button"
                                    type="button"
                                    disabled={!selectedPromptPreset.hasOverride || selectedPromptPresetBusy || isLoadingPromptPreset}
                                    onClick={() => void onResetPromptPreset()}
                                  >
                                    {resettingPromptPresetID === selectedPromptPreset.id ? "Resetting..." : "Reset"}
                                  </button>
                                )}
                                <button
                                  className="primary-button"
                                  type="button"
                                  disabled={!isPromptDirty || selectedPromptPresetBusy || isLoadingPromptPreset}
                                  onClick={() => void onSavePromptPreset()}
                                >
                                  {savingPromptPresetID === selectedPromptPreset.id ? "Saving..." : "Save"}
                                </button>
                              </div>
                            </div>

                            <label className="settings-field settings-prompt-editor-field">
                              <textarea
                                className="settings-prompt-editor"
                                aria-label={`${selectedPromptPreset.label} content`}
                                value={promptDraftContent}
                                readOnly={!selectedPromptPreset.editable || isLoadingPromptPreset}
                                onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onPromptDraftChange(event.target.value)}
                              />
                            </label>

                            {selectedPromptPreset.sourcePath ? (
                              <p className="settings-helper-text settings-prompt-source-path">
                                <code>{selectedPromptPreset.sourcePath}</code>
                              </p>
                            ) : null}
                          </section>
                        ) : (
                          <article className="settings-empty-state settings-detail-empty-state">
                            <h3>Select a preset</h3>
                          </article>
                        )}
                      </div>
                    </div>
                  </section>
                )
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
                                    aria-label={`${group.label} ${row.label} Light ${row.lightToken}`}
                                    className="settings-theme-color-picker"
                                    type="color"
                                    value={appearanceTokenValues[row.lightToken]}
                                    onChange={(event) => onAppearanceTokenChange(row.lightToken, event.target.value)}
                                  />
                                  <code>{appearanceTokenValues[row.lightToken]}</code>
                                </div>
                                <div className="settings-theme-token-mode">
                                  <span>Dark</span>
                                  <input
                                    aria-label={`${group.label} ${row.label} Dark ${row.darkToken}`}
                                    className="settings-theme-color-picker"
                                    type="color"
                                    value={appearanceTokenValues[row.darkToken]}
                                    onChange={(event) => onAppearanceTokenChange(row.darkToken, event.target.value)}
                                  />
                                  <code>{appearanceTokenValues[row.darkToken]}</code>
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
                                  <div className="settings-inline-actions">
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
                                    <span className="settings-field-label">Base URL</span>
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
                    <div className="settings-service-list-panel">
                      <div className="settings-panel">
                        <div className="settings-section-header">
                          <div>
                            <span className="label">Global</span>
                            <h3>MCP Servers</h3>
                          </div>
                          <p>Configure reusable local and remote MCP servers once, then enable them per project from the session canvas top menu.</p>
                        </div>

                        <div className="settings-actions-row">
                          <span className="settings-helper-text">
                            Global server definitions are shared across projects. Set a working directory on stdio servers when the server expects one.
                          </span>
                          <button className="secondary-button" onClick={onStartNewMcpServer} type="button">
                            New server
                          </button>
                        </div>
                      </div>

                      <div className="settings-service-list-body">
                        {mcpServers.length > 0 ? (
                          <div className="settings-service-list" role="list" aria-label="MCP servers">
                            {mcpServers.map((server) => {
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
                                  <span className="settings-service-item-copy">{getMcpServerSummaryLine(server)}</span>
                                </button>
                              )
                            })}
                          </div>
                        ) : (
                          <article className="settings-empty-state settings-service-list-empty-state">
                            <span className="label">No Servers</span>
                            <h3>No global MCP servers configured yet</h3>
                            <p>Create a reusable local or remote server here, then enable it from a project when needed.</p>
                          </article>
                        )}
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
                          <div className="settings-section-header">
                            <div>
                              <span className="label">Definition</span>
                              <h3>Server Configuration</h3>
                            </div>
                            <p>
                              {mcpServerDraft.transport === "stdio"
                                ? "Use one argument per line and one environment variable per line in KEY=value format."
                                : "Connect a remote MCP server over HTTP. Headers are sent by the local agent, and tool approval stays in the local permission system."}
                            </p>
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

                            <div className="settings-actions-row">
                              <span className="settings-helper-text">
                                {mcpServerValidationError
                                  ? mcpServerValidationError
                                  : mcpServerDraft.transport === "remote"
                                    ? "Remote MCP servers are connected locally over HTTP. Approval still flows through the existing permission system."
                                    : "Servers start lazily when a project enables them and the agent resolves tools. Tool approval still flows through the existing permission system."}
                              </span>
                              <div className="settings-inline-actions">
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
