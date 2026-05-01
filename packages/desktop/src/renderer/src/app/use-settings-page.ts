import { useEffect, useRef, useState } from "react"
import type {
  ArchivedSessionSummary,
  BuiltinToolSelection,
  BuiltinToolSummary,
  LoadedSessionSnapshot,
  McpAllowedTools,
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
  ProviderModel,
} from "./types"

interface SettingsMessage {
  tone: "success" | "error"
  text: string
}

interface LoadSettingsOptions {
  silent?: boolean
  preserveProviderDrafts?: boolean
}

interface UseSettingsPageOptions {
  isPromptPresetEditorOpen?: boolean
  onArchivedSessionRestored?: (session: LoadedSessionSnapshot) => void | Promise<void>
  onMcpUpdated?: () => void | Promise<void>
  onProviderModelsUpdated?: () => void | Promise<void>
}

type ProviderMutationPayload = {
  name?: string
  env?: string[]
  options?: {
    baseURL?: string
  }
}

function normalizeSelection(selection?: { model?: string; small_model?: string }): ProjectModelSelection {
  return {
    model: selection?.model ?? null,
    smallModel: selection?.small_model ?? null,
  }
}

const EMPTY_BUILTIN_TOOL_SELECTION: BuiltinToolSelection = { tools: {} }

function normalizeBuiltinToolSelection(selection?: BuiltinToolSelection | null): BuiltinToolSelection {
  return {
    tools: { ...(selection?.tools ?? {}) },
  }
}

function resolveBuiltinToolEnabled(tool: BuiltinToolSummary, selection: BuiltinToolSelection) {
  const explicitStates = [tool.id, ...tool.aliases]
    .map((name) => selection.tools[name])
    .filter((value): value is boolean => typeof value === "boolean")

  return !explicitStates.includes(false)
}

function applyBuiltinToolSelection(
  items: BuiltinToolSummary[],
  selection: BuiltinToolSelection,
) {
  return items.map((tool) => ({
    ...tool,
    enabled: resolveBuiltinToolEnabled(tool, selection),
  }))
}

function stableSelectionKey(selection: BuiltinToolSelection) {
  return JSON.stringify([...Object.entries(selection.tools)].sort(([left], [right]) => left.localeCompare(right)))
}

function buildProviderDrafts(items: ProviderCatalogItem[]) {
  return items.reduce<Record<string, ProviderDraftState>>((result, item) => {
    result[item.id] = {
      apiKey: "",
      baseURL: item.baseURL ?? "",
      selectedAuthMethod: item.authState.activeMethod ?? item.authCapabilities[0]?.method ?? null,
      activeFlow: item.authState.flow ?? null,
    }
    return result
  }, {})
}

function mergeProviderDrafts(
  defaults: Record<string, ProviderDraftState>,
  current: Record<string, ProviderDraftState>,
) {
  return Object.fromEntries(
    Object.entries(defaults).map(([providerID, draft]) => {
      const currentDraft = current[providerID]
      if (!currentDraft) return [providerID, draft]

      return [
        providerID,
        {
          ...draft,
          apiKey: currentDraft.apiKey,
          baseURL: currentDraft.baseURL,
          selectedAuthMethod: currentDraft.selectedAuthMethod ?? draft.selectedAuthMethod,
          activeFlow: draft.activeFlow ?? currentDraft.activeFlow ?? null,
        },
      ]
    }),
  )
}

function normalizeProviderCatalogItem(item: ProviderCatalogItem): ProviderCatalogItem {
  const partial = item as Partial<ProviderCatalogItem>
  const authCapabilities: ProviderAuthCapability[] =
    Array.isArray(partial.authCapabilities) && partial.authCapabilities.length > 0
      ? partial.authCapabilities
      : [
          {
            method: "api-key",
            label: "API key",
            kind: "api_key",
            supportsDisconnect: true,
          },
        ]
  const fallbackMethod = partial.activeAuthMethod ?? authCapabilities[0]?.method ?? undefined
  const authStatePartial = partial.authState as Partial<ProviderCatalogItem["authState"]> | undefined
  const status =
    authStatePartial?.status ??
    (partial.available ? "connected" : partial.lastAuthError ? "error" : "not_connected")
  const connectionLabel =
    partial.connectionLabel ??
    authStatePartial?.connectionLabel ??
    (status === "connected"
      ? "Connected"
      : status === "pending"
        ? "Pending"
        : status === "expired"
          ? "Expired"
          : status === "error"
            ? "Error"
            : partial.apiKeyConfigured
              ? "Configured"
              : "Not connected")

  return {
    ...item,
    authCapabilities,
    authState: {
      providerID: partial.id ?? item.id,
      scope: "global",
      activeMethod: authStatePartial?.activeMethod ?? fallbackMethod,
      status,
      connectionLabel,
      lastError: partial.lastAuthError ?? authStatePartial?.lastError,
      expiresAt: authStatePartial?.expiresAt,
      account: authStatePartial?.account,
      capabilities: authStatePartial?.capabilities ?? authCapabilities,
      credentials: authStatePartial?.credentials ?? [],
      flow: authStatePartial?.flow,
    },
    authScope: "global",
    activeAuthMethod: partial.activeAuthMethod ?? authStatePartial?.activeMethod ?? fallbackMethod,
    connectionLabel,
    lastAuthError: partial.lastAuthError ?? authStatePartial?.lastError,
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function tryParseStringArrayLiteral(input: string) {
  const trimmed = input.trim()
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null

  try {
    const parsed = JSON.parse(trimmed)
    if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) {
      return null
    }

    return parsed
      .map((value) => value.trim())
      .filter(Boolean)
  } catch {
    return null
  }
}

function parseLineList(input: string) {
  const parsedLiteral = tryParseStringArrayLiteral(input)
  if (parsedLiteral) return parsedLiteral

  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function stringifyLineList(entries?: string[]) {
  return (entries ?? [])
    .flatMap((entry) => tryParseStringArrayLiteral(entry) ?? [entry])
    .map((entry) => entry.trim())
    .filter(Boolean)
    .join("\n")
}

function stringifyKeyValueEntries(entries?: Record<string, string>) {
  return Object.entries(entries ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")
}

function stringifyAllowedToolNames(allowedTools?: McpAllowedTools) {
  if (Array.isArray(allowedTools)) {
    return stringifyLineList(allowedTools)
  }

  return stringifyLineList(allowedTools?.toolNames)
}

function resolveAllowedToolsMode(allowedTools?: McpAllowedTools): McpServerDraftState["allowedToolsMode"] {
  if (!allowedTools) return "all"
  if (Array.isArray(allowedTools)) return "names"
  if (allowedTools.readOnly && (allowedTools.toolNames?.length ?? 0) > 0) return "read-only-names"
  if (allowedTools.readOnly) return "read-only"
  if ((allowedTools.toolNames?.length ?? 0) > 0) return "names"
  return "all"
}

function toMcpDraft(server?: McpServerSummary): McpServerDraftState {
  return {
    id: server?.id ?? "",
    name: server?.name ?? "",
    transport: server?.transport ?? "stdio",
    command: server?.transport === "stdio" ? server.command : "",
    args: server?.transport === "stdio" ? stringifyLineList(server.args) : "",
    env: server?.transport === "stdio" ? stringifyKeyValueEntries(server.env) : "",
    cwd: server?.transport === "stdio" ? (server.cwd ?? "") : "",
    serverUrl: server?.transport === "remote" ? (server.serverUrl ?? "") : "",
    authorization: server?.transport === "remote" ? (server.authorization ?? "") : "",
    headers: server?.transport === "remote" ? stringifyKeyValueEntries(server.headers) : "",
    allowedToolsMode: server?.transport === "remote" ? resolveAllowedToolsMode(server.allowedTools) : "all",
    allowedToolNames: server?.transport === "remote" ? stringifyAllowedToolNames(server.allowedTools) : "",
    enabled: server?.enabled ?? true,
    timeoutMs: typeof server?.timeoutMs === "number" ? String(server.timeoutMs) : "",
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function formatMcpDiagnosticMessage(diagnostic: McpServerDiagnostic): SettingsMessage {
  if (diagnostic.ok) {
    return {
      tone: "success",
      text:
        diagnostic.toolCount > 0
          ? `MCP server reachable. Listed ${diagnostic.toolCount} tool${diagnostic.toolCount === 1 ? "" : "s"}.`
          : "MCP server reachable, but it did not expose any tools.",
    }
  }

  return {
    tone: "error",
    text: diagnostic.error
      ? `MCP server saved, but tool discovery failed: ${diagnostic.error}`
      : "MCP server saved, but tool discovery failed.",
  }
}

function parseMcpKeyValue(input: string, label: string) {
  const entries = parseLineList(input).map((line) => {
    const separatorIndex = line.indexOf("=")
    if (separatorIndex === -1) {
      throw new Error(`Invalid ${label} line '${line}'. Use KEY=value format.`)
    }

    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1)
    if (!key) {
      throw new Error(`Invalid ${label} line '${line}'. Keys cannot be empty.`)
    }

    return [key, value] as const
  })

  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function buildAllowedTools(draft: McpServerDraftState): McpAllowedTools | undefined {
  const toolNames = parseLineList(draft.allowedToolNames)

  switch (draft.allowedToolsMode) {
    case "all":
      return undefined
    case "names":
      return toolNames.length > 0 ? toolNames : undefined
    case "read-only":
      return { readOnly: true }
    case "read-only-names":
      return {
        readOnly: true,
        ...(toolNames.length > 0 ? { toolNames } : {}),
      }
  }
}

function getMcpServerValidationError(draft: McpServerDraftState) {
  const serverID = draft.id.trim()
  if (!serverID) {
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
    parseLineList(draft.allowedToolNames).length === 0
  ) {
    return "Named tool filters require at least one tool name."
  }

  return null
}

export function useSettingsPage(options: UseSettingsPageOptions) {
  const isPromptPresetEditorOpen = options.isPromptPresetEditorOpen ?? false
  const [isOpen, setIsOpen] = useState(false)
  const [catalog, setCatalog] = useState<ProviderCatalogItem[]>([])
  const [models, setModels] = useState<ProviderModel[]>([])
  const [savedSelection, setSavedSelection] = useState<ProjectModelSelection>({
    model: null,
    smallModel: null,
  })
  const [selectionDraft, setSelectionDraft] = useState<ProjectModelSelection>({
    model: null,
    smallModel: null,
  })
  const [providerDrafts, setProviderDrafts] = useState<Record<string, ProviderDraftState>>({})
  const [mcpServers, setMcpServers] = useState<McpServerSummary[]>([])
  const [mcpDiagnostics, setMcpDiagnostics] = useState<Record<string, McpServerDiagnostic>>({})
  const [activeMcpServerID, setActiveMcpServerID] = useState<string | null>(null)
  const [mcpServerDraft, setMcpServerDraft] = useState<McpServerDraftState>(() => toMcpDraft())
  const [builtinTools, setBuiltinTools] = useState<BuiltinToolSummary[]>([])
  const [builtinToolSelection, setBuiltinToolSelection] = useState<BuiltinToolSelection>(EMPTY_BUILTIN_TOOL_SELECTION)
  const [savedBuiltinToolSelection, setSavedBuiltinToolSelection] =
    useState<BuiltinToolSelection>(EMPTY_BUILTIN_TOOL_SELECTION)
  const [promptPresets, setPromptPresets] = useState<PromptPresetSummary[]>([])
  const [promptPresetSelection, setPromptPresetSelection] = useState<PromptPresetSelection | null>(null)
  const [savedPromptPresetSelection, setSavedPromptPresetSelection] = useState<PromptPresetSelection | null>(null)
  const [selectedPromptPresetID, setSelectedPromptPresetID] = useState<string | null>(null)
  const [selectedPromptPreset, setSelectedPromptPreset] = useState<PromptPresetDocument | null>(null)
  const [promptDraftLabel, setPromptDraftLabel] = useState("")
  const [savedPromptLabel, setSavedPromptLabel] = useState("")
  const [promptDraftContent, setPromptDraftContent] = useState("")
  const [savedPromptContent, setSavedPromptContent] = useState("")
  const [archivedSessions, setArchivedSessions] = useState<ArchivedSessionSummary[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingBuiltinTools, setIsLoadingBuiltinTools] = useState(false)
  const [isLoadingPrompts, setIsLoadingPrompts] = useState(false)
  const [isLoadingPromptPreset, setIsLoadingPromptPreset] = useState(false)
  const [isLoadingArchivedSessions, setIsLoadingArchivedSessions] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [builtinToolsError, setBuiltinToolsError] = useState<string | null>(null)
  const [promptLoadError, setPromptLoadError] = useState<string | null>(null)
  const [archivedSessionsError, setArchivedSessionsError] = useState<string | null>(null)
  const [message, setMessage] = useState<SettingsMessage | null>(null)
  const [savingProviderID, setSavingProviderID] = useState<string | null>(null)
  const [deletingProviderID, setDeletingProviderID] = useState<string | null>(null)
  const [testingProviderID, setTestingProviderID] = useState<string | null>(null)
  const [isRefreshingProviderCatalog, setIsRefreshingProviderCatalog] = useState(false)
  const [isSavingSelection, setIsSavingSelection] = useState(false)
  const [savingMcpServerID, setSavingMcpServerID] = useState<string | null>(null)
  const [deletingMcpServerID, setDeletingMcpServerID] = useState<string | null>(null)
  const [isSavingBuiltinTools, setIsSavingBuiltinTools] = useState(false)
  const [isCreatingPromptPreset, setIsCreatingPromptPreset] = useState(false)
  const [isSavingPromptPresetSelection, setIsSavingPromptPresetSelection] = useState(false)
  const [savingPromptPresetSelectionField, setSavingPromptPresetSelectionField] =
    useState<keyof PromptPresetSelection | null>(null)
  const [deletingPromptPresetID, setDeletingPromptPresetID] = useState<string | null>(null)
  const [savingPromptPresetID, setSavingPromptPresetID] = useState<string | null>(null)
  const [resettingPromptPresetID, setResettingPromptPresetID] = useState<string | null>(null)
  const [restoringArchivedSessionID, setRestoringArchivedSessionID] = useState<string | null>(null)
  const [deletingArchivedSessionID, setDeletingArchivedSessionID] = useState<string | null>(null)
  const requestIDRef = useRef(0)
  const builtinToolsRequestIDRef = useRef(0)
  const archivedSessionsRequestIDRef = useRef(0)
  const mcpDiagnosticRequestIDRef = useRef<Record<string, number>>({})
  const promptPresetsRequestIDRef = useRef(0)
  const promptPresetDocumentRequestIDRef = useRef(0)

  useEffect(() => {
    if (!isOpen) return

    void loadSettingsData()
    void loadBuiltinTools()
    void loadArchivedSessions()
  }, [isOpen])

  useEffect(() => {
    if (!isPromptPresetEditorOpen) return

    void loadPromptPresets()
  }, [isPromptPresetEditorOpen])

  async function notifyMcpUpdated() {
    try {
      await options.onMcpUpdated?.()
    } catch (error) {
      console.error("[desktop] global MCP sync failed:", error)
    }
  }

  async function notifyProviderModelsUpdated() {
    try {
      await options.onProviderModelsUpdated?.()
    } catch (error) {
      console.error("[desktop] composer model sync failed:", error)
    }
  }

  async function notifyArchivedSessionRestored(session: LoadedSessionSnapshot) {
    try {
      await options.onArchivedSessionRestored?.(session)
    } catch (error) {
      console.error("[desktop] archived session restore sync failed:", error)
    }
  }

  function syncPromptPresetSummary(document: PromptPresetDocument) {
    setPromptPresets((current) => {
      const nextSummary: PromptPresetSummary = {
        id: document.id,
        label: document.label,
        description: document.description,
        source: document.source,
        hasOverride: document.hasOverride,
        editable: document.editable,
        sourcePath: document.sourcePath,
      }

      if (current.some((preset) => preset.id === document.id)) {
        return current.map((preset) => (preset.id === document.id ? nextSummary : preset))
      }

      return [...current, nextSummary]
    })
  }

  async function loadPromptPresetDocument(presetID: string, optionsArg?: LoadSettingsOptions) {
    const readPromptPreset = window.desktop?.readPromptPreset
    if (!readPromptPreset) {
      setSelectedPromptPresetID(null)
      setSelectedPromptPreset(null)
      setPromptDraftLabel("")
      setSavedPromptLabel("")
      setPromptDraftContent("")
      setSavedPromptContent("")
      setPromptLoadError("Desktop prompt preset APIs are unavailable.")
      return null
    }

    const requestID = ++promptPresetDocumentRequestIDRef.current
    if (!optionsArg?.silent) {
      setIsLoadingPromptPreset(true)
    }
    setPromptLoadError(null)

    try {
      const document = await readPromptPreset({ presetID })
      if (promptPresetDocumentRequestIDRef.current !== requestID) return null
      setSelectedPromptPresetID(document.id)
      setSelectedPromptPreset(document)
      setPromptDraftLabel(document.label)
      setSavedPromptLabel(document.label)
      setPromptDraftContent(document.content)
      setSavedPromptContent(document.content)
      syncPromptPresetSummary(document)
      return document
    } catch (error) {
      if (promptPresetDocumentRequestIDRef.current !== requestID) return null
      setPromptLoadError(getErrorMessage(error))
      return null
    } finally {
      if (promptPresetDocumentRequestIDRef.current === requestID) {
        setIsLoadingPromptPreset(false)
      }
    }
  }

  async function loadPromptPresets(optionsArg?: LoadSettingsOptions) {
    const getPromptPresets = window.desktop?.getPromptPresets
    const getPromptPresetSelection = window.desktop?.getPromptPresetSelection
    if (!getPromptPresets || !getPromptPresetSelection) {
      setPromptPresets([])
      setPromptPresetSelection(null)
      setSavedPromptPresetSelection(null)
      setSelectedPromptPresetID(null)
      setSelectedPromptPreset(null)
      setPromptDraftLabel("")
      setSavedPromptLabel("")
      setPromptDraftContent("")
      setSavedPromptContent("")
      setPromptLoadError("Desktop prompt preset APIs are unavailable.")
      return
    }

    const requestID = ++promptPresetsRequestIDRef.current
    if (!optionsArg?.silent) {
      setIsLoadingPrompts(true)
    }
    setPromptLoadError(null)

    try {
      const [nextPromptPresets, nextPromptPresetSelection] = await Promise.all([
        getPromptPresets(),
        getPromptPresetSelection(),
      ])
      if (promptPresetsRequestIDRef.current !== requestID) return

      setPromptPresets(nextPromptPresets)
      setPromptPresetSelection(nextPromptPresetSelection)
      setSavedPromptPresetSelection(nextPromptPresetSelection)
      const preferredPresetID =
        (selectedPromptPresetID && nextPromptPresets.some((preset) => preset.id === selectedPromptPresetID)
          ? selectedPromptPresetID
          : nextPromptPresets.find((preset) => preset.id === nextPromptPresetSelection.systemPromptPresetID)?.id ??
            nextPromptPresets[0]?.id) ?? null

      if (!preferredPresetID) {
        setSelectedPromptPresetID(null)
        setSelectedPromptPreset(null)
        setPromptDraftLabel("")
        setSavedPromptLabel("")
        setPromptDraftContent("")
        setSavedPromptContent("")
        return
      }

      await loadPromptPresetDocument(preferredPresetID, { silent: true })
    } catch (error) {
      if (promptPresetsRequestIDRef.current !== requestID) return
      setPromptPresets([])
      setPromptPresetSelection(null)
      setSavedPromptPresetSelection(null)
      setSelectedPromptPresetID(null)
      setSelectedPromptPreset(null)
      setPromptDraftLabel("")
      setSavedPromptLabel("")
      setPromptDraftContent("")
      setSavedPromptContent("")
      setPromptLoadError(getErrorMessage(error))
    } finally {
      if (promptPresetsRequestIDRef.current === requestID) {
        setIsLoadingPrompts(false)
      }
    }
  }

  useEffect(() => {
    if (!isOpen || !activeMcpServerID) return

    void loadMcpServerDiagnostic(activeMcpServerID)
  }, [activeMcpServerID, isOpen])

  async function loadArchivedSessions(optionsArg?: LoadSettingsOptions) {
    const listArchivedSessions = window.desktop?.listArchivedSessions
    if (!listArchivedSessions) {
      setArchivedSessions([])
      setArchivedSessionsError("Desktop archived session APIs are unavailable.")
      return
    }

    const requestID = ++archivedSessionsRequestIDRef.current
    if (!optionsArg?.silent) {
      setIsLoadingArchivedSessions(true)
    }
    setArchivedSessionsError(null)

    try {
      const nextArchivedSessions = await listArchivedSessions()
      if (archivedSessionsRequestIDRef.current !== requestID) return
      setArchivedSessions(nextArchivedSessions)
    } catch (error) {
      if (archivedSessionsRequestIDRef.current !== requestID) return
      setArchivedSessions([])
      setArchivedSessionsError(getErrorMessage(error))
    } finally {
      if (archivedSessionsRequestIDRef.current === requestID) {
        setIsLoadingArchivedSessions(false)
      }
    }
  }

  async function loadSettingsData(optionsArg?: LoadSettingsOptions) {
    const loadProviderCatalog = window.desktop?.getGlobalProviderCatalog
    const loadModels = window.desktop?.getGlobalModels

    if (!loadProviderCatalog || !loadModels || !window.desktop?.getGlobalMcpServers) {
      setLoadError("Desktop provider settings APIs are unavailable.")
      setCatalog([])
      setModels([])
      setProviderDrafts({})
      setMcpServers([])
      setMcpDiagnostics({})
      setMcpServerDraft(toMcpDraft())
      setActiveMcpServerID(null)
      return
    }

    const requestID = ++requestIDRef.current
    if (!optionsArg?.silent) {
      setIsLoading(true)
    }
    setLoadError(null)

    try {
      const [nextCatalog, modelPayload, nextMcpServers] = await Promise.all([
        loadProviderCatalog(),
        loadModels(),
        window.desktop.getGlobalMcpServers(),
      ])
      const normalizedCatalog = nextCatalog.map((item) => normalizeProviderCatalogItem(item))

      if (requestIDRef.current !== requestID) return

      const nextSelection = normalizeSelection(modelPayload.selection)
      setCatalog(normalizedCatalog)
      setModels(modelPayload.items)
      setSavedSelection(nextSelection)
      setSelectionDraft(nextSelection)
      const nextProviderDrafts = buildProviderDrafts(normalizedCatalog)
      if (optionsArg?.preserveProviderDrafts) {
        setProviderDrafts((current) => mergeProviderDrafts(nextProviderDrafts, current))
      } else {
        setProviderDrafts(nextProviderDrafts)
      }
      setMcpServers(nextMcpServers)
      setMcpDiagnostics((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([serverID]) => nextMcpServers.some((server) => server.id === serverID)),
        ),
      )
      setActiveMcpServerID((current) => {
        if (!current) return current
        return nextMcpServers.some((server) => server.id === current) ? current : null
      })
      setMcpServerDraft((currentDraft) => {
        if (!currentDraft.id) return toMcpDraft()
        const updated = nextMcpServers.find((server) => server.id === currentDraft.id)
        return updated ? toMcpDraft(updated) : toMcpDraft()
      })
    } catch (error) {
      if (requestIDRef.current !== requestID) return
      setCatalog([])
      setModels([])
      setProviderDrafts({})
      setMcpServers([])
      setMcpDiagnostics({})
      setMcpServerDraft(toMcpDraft())
      setActiveMcpServerID(null)
      setLoadError(getErrorMessage(error))
    } finally {
      if (requestIDRef.current === requestID) {
        setIsLoading(false)
      }
    }
  }

  async function loadBuiltinTools(optionsArg?: LoadSettingsOptions) {
    const getBuiltinTools = window.desktop?.getBuiltinTools
    if (!getBuiltinTools) {
      setBuiltinTools([])
      setBuiltinToolSelection(normalizeBuiltinToolSelection())
      setSavedBuiltinToolSelection(normalizeBuiltinToolSelection())
      setBuiltinToolsError("Desktop built-in tool settings APIs are unavailable.")
      return
    }

    const requestID = ++builtinToolsRequestIDRef.current
    if (!optionsArg?.silent) {
      setIsLoadingBuiltinTools(true)
    }
    setBuiltinToolsError(null)

    try {
      const payload = await getBuiltinTools()
      if (builtinToolsRequestIDRef.current !== requestID) return

      const selection = normalizeBuiltinToolSelection(payload.selection)
      setBuiltinToolSelection(selection)
      setSavedBuiltinToolSelection(selection)
      setBuiltinTools(applyBuiltinToolSelection(payload.items, selection))
    } catch (error) {
      if (builtinToolsRequestIDRef.current !== requestID) return
      setBuiltinTools([])
      setBuiltinToolSelection(normalizeBuiltinToolSelection())
      setSavedBuiltinToolSelection(normalizeBuiltinToolSelection())
      setBuiltinToolsError(getErrorMessage(error))
    } finally {
      if (builtinToolsRequestIDRef.current === requestID) {
        setIsLoadingBuiltinTools(false)
      }
    }
  }

  async function loadMcpServerDiagnostic(serverID: string) {
    if (!window.desktop?.getGlobalMcpServerDiagnostic) return null

    const requestID = (mcpDiagnosticRequestIDRef.current[serverID] ?? 0) + 1
    mcpDiagnosticRequestIDRef.current[serverID] = requestID

    try {
      const diagnostic = await window.desktop.getGlobalMcpServerDiagnostic({
        serverID,
      })

      if (mcpDiagnosticRequestIDRef.current[serverID] !== requestID) return null

      setMcpDiagnostics((current) => ({
        ...current,
        [serverID]: diagnostic,
      }))

      return diagnostic
    } catch (error) {
      if (mcpDiagnosticRequestIDRef.current[serverID] !== requestID) return null

      const diagnostic: McpServerDiagnostic = {
        serverID,
        enabled: true,
        ok: false,
        toolCount: 0,
        toolNames: [],
        error: getErrorMessage(error),
      }
      setMcpDiagnostics((current) => ({
        ...current,
        [serverID]: diagnostic,
      }))
      return diagnostic
    }
  }

  function openSettings() {
    setMessage(null)
    setIsOpen(true)
  }

  function closeSettings() {
    setMessage(null)
    setIsOpen(false)
  }

  function dismissMessage() {
    setMessage(null)
  }

  function setProviderDraftValue(providerID: string, field: "apiKey" | "baseURL", value: string) {
    setProviderDrafts((current) => ({
      ...current,
      [providerID]: {
        apiKey: current[providerID]?.apiKey ?? "",
        baseURL: current[providerID]?.baseURL ?? "",
        selectedAuthMethod: current[providerID]?.selectedAuthMethod ?? null,
        activeFlow: current[providerID]?.activeFlow ?? null,
        [field]: value,
      },
    }))
  }

  function setProviderAuthMethod(providerID: string, method: string) {
    setProviderDrafts((current) => ({
      ...current,
      [providerID]: {
        apiKey: current[providerID]?.apiKey ?? "",
        baseURL: current[providerID]?.baseURL ?? "",
        selectedAuthMethod: method,
        activeFlow: current[providerID]?.activeFlow?.method === method ? current[providerID]?.activeFlow ?? null : null,
      },
    }))
  }

  function setSelectionDraftValue(field: keyof ProjectModelSelection, value: string | null) {
    setSelectionDraft((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function startNewMcpServer() {
    setActiveMcpServerID(null)
    setMcpServerDraft(toMcpDraft())
  }

  function selectMcpServer(serverID: string) {
    const server = mcpServers.find((item) => item.id === serverID)
    if (!server) return

    setActiveMcpServerID(serverID)
    setMcpServerDraft(toMcpDraft(server))
  }

  function setMcpServerDraftValue(field: keyof McpServerDraftState, value: string | boolean) {
    setMcpServerDraft((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function setBuiltinToolEnabled(toolID: string, enabled: boolean) {
    setBuiltinToolSelection((current) => {
      return {
        tools: {
          ...current.tools,
          [toolID]: enabled,
        },
      }
    })
    setBuiltinTools((items) => items.map((tool) => (tool.id === toolID ? { ...tool, enabled } : tool)))
  }

  async function saveBuiltinTools() {
    const updateBuiltinToolSelection = window.desktop?.updateBuiltinToolSelection
    if (!updateBuiltinToolSelection) return false

    setIsSavingBuiltinTools(true)
    setMessage(null)

    try {
      const selection = normalizeBuiltinToolSelection(
        await updateBuiltinToolSelection(builtinToolSelection),
      )
      setSavedBuiltinToolSelection(selection)
      setBuiltinToolSelection(selection)
      setBuiltinTools((items) => applyBuiltinToolSelection(items, selection))
      setMessage({
        tone: "success",
        text: "Built-in tool settings saved.",
      })
      return true
    } catch (error) {
      setMessage({
        tone: "error",
        text: getErrorMessage(error),
      })
      return false
    } finally {
      setIsSavingBuiltinTools(false)
    }
  }

  async function resetBuiltinTools() {
    const updateBuiltinToolSelection = window.desktop?.updateBuiltinToolSelection
    if (!updateBuiltinToolSelection) return false

    setIsSavingBuiltinTools(true)
    setMessage(null)

    try {
      const selection = normalizeBuiltinToolSelection(await updateBuiltinToolSelection({ tools: {} }))
      setSavedBuiltinToolSelection(selection)
      setBuiltinToolSelection(selection)
      setBuiltinTools((items) => applyBuiltinToolSelection(items, selection))
      setMessage({
        tone: "success",
        text: "Built-in tool settings reset to defaults.",
      })
      return true
    } catch (error) {
      setMessage({
        tone: "error",
        text: getErrorMessage(error),
      })
      return false
    } finally {
      setIsSavingBuiltinTools(false)
    }
  }

  function setPromptDraftValue(value: string) {
    setPromptDraftContent(value)
  }

  function setPromptDraftLabelValue(value: string) {
    setPromptDraftLabel(value)
  }

  function setPromptPresetSelectionValue(
    field: keyof PromptPresetSelection,
    value: string,
  ) {
    setPromptPresetSelection((current) => {
      if (current) {
        return {
          ...current,
          [field]: value,
        }
      }

      return {
        systemPromptPresetID: field === "systemPromptPresetID" ? value : selectedPromptPresetID ?? value,
        planModePromptPresetID: field === "planModePromptPresetID" ? value : selectedPromptPresetID ?? value,
      }
    })
  }

  async function selectPromptPreset(presetID: string) {
    const document = await loadPromptPresetDocument(presetID)
    return Boolean(document)
  }

  async function savePromptPresetSelection(field?: keyof PromptPresetSelection) {
    if (!promptPresetSelection || !window.desktop?.updatePromptPresetSelection) return false

    const selectionToSave =
      field && savedPromptPresetSelection
        ? {
            systemPromptPresetID:
              field === "systemPromptPresetID"
                ? promptPresetSelection.systemPromptPresetID
                : savedPromptPresetSelection.systemPromptPresetID,
            planModePromptPresetID:
              field === "planModePromptPresetID"
                ? promptPresetSelection.planModePromptPresetID
                : savedPromptPresetSelection.planModePromptPresetID,
          }
        : promptPresetSelection

    setIsSavingPromptPresetSelection(true)
    setSavingPromptPresetSelectionField(field ?? null)
    setMessage(null)

    try {
      const selection = await window.desktop.updatePromptPresetSelection(selectionToSave)
      setPromptPresetSelection((current) => {
        if (!current || !field) return selection

        return {
          systemPromptPresetID:
            field === "systemPromptPresetID" ? selection.systemPromptPresetID : current.systemPromptPresetID,
          planModePromptPresetID:
            field === "planModePromptPresetID" ? selection.planModePromptPresetID : current.planModePromptPresetID,
        }
      })
      setSavedPromptPresetSelection(selection)
      setMessage({
        tone: "success",
        text:
          field === "systemPromptPresetID"
            ? "System prompt updated."
            : field === "planModePromptPresetID"
              ? "Plan prompt updated."
              : "Prompt assignments updated.",
      })
      return true
    } catch (error) {
      setMessage({
        tone: "error",
        text: getErrorMessage(error),
      })
      return false
    } finally {
      setIsSavingPromptPresetSelection(false)
      setSavingPromptPresetSelectionField(null)
    }
  }

  async function createPromptPreset() {
    if (!window.desktop?.createPromptPreset) return false

    setIsCreatingPromptPreset(true)
    setMessage(null)

    try {
      const document = await window.desktop.createPromptPreset({
        label: "Untitled preset",
        content: "",
      })
      setPromptPresets((current) => [...current, {
        id: document.id,
        label: document.label,
        description: document.description,
        source: document.source,
        hasOverride: document.hasOverride,
        editable: document.editable,
        sourcePath: document.sourcePath,
      }])
      setSelectedPromptPresetID(document.id)
      setSelectedPromptPreset(document)
      setPromptDraftLabel(document.label)
      setSavedPromptLabel(document.label)
      setPromptDraftContent(document.content)
      setSavedPromptContent(document.content)
      setMessage({
        tone: "success",
        text: "Prompt preset created.",
      })
      return true
    } catch (error) {
      setMessage({
        tone: "error",
        text: getErrorMessage(error),
      })
      return false
    } finally {
      setIsCreatingPromptPreset(false)
    }
  }

  async function savePromptPreset() {
    if (!selectedPromptPresetID || !selectedPromptPreset || !window.desktop?.updatePromptPreset) return false

    setSavingPromptPresetID(selectedPromptPresetID)
    setMessage(null)

    try {
      const document = await window.desktop.updatePromptPreset({
        presetID: selectedPromptPresetID,
        label: selectedPromptPreset.source === "custom" ? promptDraftLabel : undefined,
        content: promptDraftContent,
      })
      setSelectedPromptPreset(document)
      setSavedPromptLabel(document.label)
      setPromptDraftLabel(document.label)
      setSavedPromptContent(document.content)
      setPromptDraftContent(document.content)
      syncPromptPresetSummary(document)
      setMessage({
        tone: "success",
        text: "Prompt preset saved.",
      })
      return true
    } catch (error) {
      setMessage({
        tone: "error",
        text: getErrorMessage(error),
      })
      return false
    } finally {
      setSavingPromptPresetID(null)
    }
  }

  async function resetPromptPreset() {
    if (
      !selectedPromptPresetID ||
      selectedPromptPreset?.source !== "bundled" ||
      !window.desktop?.resetPromptPreset
    ) {
      return false
    }

    setResettingPromptPresetID(selectedPromptPresetID)
    setMessage(null)

    try {
      const document = await window.desktop.resetPromptPreset({
        presetID: selectedPromptPresetID,
      })
      setSelectedPromptPreset(document)
      setSavedPromptLabel(document.label)
      setPromptDraftLabel(document.label)
      setSavedPromptContent(document.content)
      setPromptDraftContent(document.content)
      syncPromptPresetSummary(document)
      setMessage({
        tone: "success",
        text: "Prompt preset reset to default.",
      })
      return true
    } catch (error) {
      setMessage({
        tone: "error",
        text: getErrorMessage(error),
      })
      return false
    } finally {
      setResettingPromptPresetID(null)
    }
  }

  async function deletePromptPreset() {
    if (
      !selectedPromptPresetID ||
      selectedPromptPreset?.source !== "custom" ||
      !window.desktop?.deletePromptPreset
    ) {
      return false
    }

    setDeletingPromptPresetID(selectedPromptPresetID)
    setMessage(null)

    try {
      const nextSelection = await window.desktop.deletePromptPreset({
        presetID: selectedPromptPresetID,
      })
      const remainingPromptPresets = promptPresets.filter((preset) => preset.id !== selectedPromptPresetID)
      setPromptPresets(remainingPromptPresets)
      setPromptPresetSelection(nextSelection)
      setSavedPromptPresetSelection(nextSelection)

      const nextPresetID =
        remainingPromptPresets.find((preset) => preset.id === nextSelection.systemPromptPresetID)?.id ??
        remainingPromptPresets[0]?.id ??
        null

      if (!nextPresetID) {
        setSelectedPromptPresetID(null)
        setSelectedPromptPreset(null)
        setPromptDraftLabel("")
        setSavedPromptLabel("")
        setPromptDraftContent("")
        setSavedPromptContent("")
      } else {
        await loadPromptPresetDocument(nextPresetID, { silent: true })
      }

      setMessage({
        tone: "success",
        text: "Prompt preset deleted.",
      })
      return true
    } catch (error) {
      setMessage({
        tone: "error",
        text: getErrorMessage(error),
      })
      return false
    } finally {
      setDeletingPromptPresetID(null)
    }
  }

  async function saveProvider(providerID: string) {
    const updateProvider = window.desktop?.updateGlobalProvider
    if (!updateProvider) return false

    const provider = catalog.find((item) => item.id === providerID)
    if (!provider) return false

    const draft = providerDrafts[providerID] ?? {
      apiKey: "",
      baseURL: provider.baseURL ?? "",
      selectedAuthMethod: provider.authState.activeMethod ?? provider.authCapabilities[0]?.method ?? null,
      activeFlow: provider.authState.flow ?? null,
    }
    const baseURL = draft.baseURL.trim()
    const nextProvider: ProviderMutationPayload = {
      name: provider.name,
      env: provider.env,
    }
    const optionsPayload: NonNullable<ProviderMutationPayload["options"]> = {}

    if (baseURL !== (provider.baseURL ?? "")) {
      optionsPayload.baseURL = baseURL
    }

    if (Object.keys(optionsPayload).length > 0) {
      nextProvider.options = optionsPayload
    }

    if (!nextProvider.options) {
      setMessage({
        tone: "error",
        text: `No changes to save for ${provider.name}.`,
      })
      return false
    }

    setSavingProviderID(providerID)
    setMessage(null)

    try {
      await updateProvider({
        providerID,
        provider: nextProvider,
      })
      await loadSettingsData({ silent: true })
      await notifyProviderModelsUpdated()
      setMessage({
        tone: "success",
        text: "Provider settings saved.",
      })
      return true
    } catch (error) {
      setMessage({
        tone: "error",
        text: getErrorMessage(error),
      })
      return false
    } finally {
      setSavingProviderID(null)
    }
  }

  async function pollProviderAuthFlow(providerID: string, flowID: string) {
    if (!window.desktop?.getGlobalProviderAuthFlow) return

    while (true) {
      try {
        const flow = await window.desktop.getGlobalProviderAuthFlow({
          providerID,
          flowID,
        })

        setProviderDrafts((current) => ({
          ...current,
          [providerID]: {
            apiKey: current[providerID]?.apiKey ?? "",
            baseURL: current[providerID]?.baseURL ?? "",
            selectedAuthMethod: current[providerID]?.selectedAuthMethod ?? flow.method,
            activeFlow: flow,
          },
        }))

        if (["connected", "error", "expired", "cancelled"].includes(flow.status)) {
          await loadSettingsData({ silent: true })
          await notifyProviderModelsUpdated()

          if (flow.status === "connected") {
            setMessage({
              tone: "success",
              text: "Provider authentication connected.",
            })
          } else if (flow.status === "cancelled") {
            setMessage({
              tone: "error",
              text: flow.errorMessage ?? "Provider authentication was cancelled.",
            })
          } else {
            setMessage({
              tone: "error",
              text: flow.errorMessage ?? "Provider authentication failed.",
            })
          }
          return
        }
      } catch (error) {
        setMessage({
          tone: "error",
          text: getErrorMessage(error),
        })
        return
      }

      await sleep(1500)
    }
  }

  async function startProviderAuthFlow(providerID: string) {
    if (!window.desktop?.startGlobalProviderAuthFlow) return false

    const provider = catalog.find((item) => item.id === providerID)
    const draft = providerDrafts[providerID]
    const method = draft?.selectedAuthMethod ?? provider?.authState.activeMethod ?? provider?.authCapabilities[0]?.method
    if (!provider || !method) return false

    setSavingProviderID(providerID)
    setMessage(null)

    try {
      const flow = await window.desktop.startGlobalProviderAuthFlow({
        providerID,
        method,
      })

      setProviderDrafts((current) => ({
        ...current,
        [providerID]: {
          apiKey: current[providerID]?.apiKey ?? "",
          baseURL: current[providerID]?.baseURL ?? provider.baseURL ?? "",
          selectedAuthMethod: method,
          activeFlow: flow,
        },
      }))

      const continuationURL = flow.authorizationURL ?? flow.verificationURI
      if (continuationURL && window.desktop?.openExternalUrl) {
        await window.desktop.openExternalUrl({
          url: continuationURL,
        })
      }

      setMessage({
        tone: "success",
        text:
          flow.kind === "device_code"
            ? "Complete the device code sign-in in your browser."
            : "Continue the sign-in flow in your browser.",
      })

      void pollProviderAuthFlow(providerID, flow.id)
      return true
    } catch (error) {
      setMessage({
        tone: "error",
        text: getErrorMessage(error),
      })
      return false
    } finally {
      setSavingProviderID(null)
    }
  }

  async function cancelProviderAuthFlow(providerID: string) {
    const flowID = providerDrafts[providerID]?.activeFlow?.id
    if (!flowID || !window.desktop?.cancelGlobalProviderAuthFlow) return false

    setSavingProviderID(providerID)
    setMessage(null)

    try {
      await window.desktop.cancelGlobalProviderAuthFlow({
        providerID,
        flowID,
      })
      await loadSettingsData({ silent: true })
      setMessage({
        tone: "success",
        text: "Provider authentication cancelled.",
      })
      return true
    } catch (error) {
      setMessage({
        tone: "error",
        text: getErrorMessage(error),
      })
      return false
    } finally {
      setSavingProviderID(null)
    }
  }

  async function saveProviderApiKey(providerID: string, nextApiKey?: string | null) {
    if (!window.desktop?.saveGlobalProviderApiKey) return false

    const apiKey =
      (nextApiKey === undefined ? providerDrafts[providerID]?.apiKey ?? "" : nextApiKey ?? "").trim()

    setSavingProviderID(providerID)
    setMessage(null)

    try {
      await window.desktop.saveGlobalProviderApiKey({
        providerID,
        apiKey: apiKey || null,
      })
      await loadSettingsData({ silent: true })
      await notifyProviderModelsUpdated()
      setMessage({
        tone: "success",
        text: apiKey ? "API key saved." : "API key cleared.",
      })
      return true
    } catch (error) {
      setMessage({
        tone: "error",
        text: getErrorMessage(error),
      })
      return false
    } finally {
      setSavingProviderID(null)
    }
  }

  async function deleteProviderAuthSession(providerID: string) {
    if (!window.desktop?.deleteGlobalProviderAuthSession) return false

    setSavingProviderID(providerID)
    setMessage(null)

    try {
      await window.desktop.deleteGlobalProviderAuthSession({
        providerID,
      })
      await loadSettingsData({ silent: true })
      await notifyProviderModelsUpdated()
      setMessage({
        tone: "success",
        text: "Shared provider session removed.",
      })
      return true
    } catch (error) {
      setMessage({
        tone: "error",
        text: getErrorMessage(error),
      })
      return false
    } finally {
      setSavingProviderID(null)
    }
  }

  async function testProviderConnection(
    providerID: string,
    input: {
      method?: string
      credentialMode?: "active" | "manual" | "environment"
      apiKey?: string | null
      baseURL?: string | null
    } = {},
  ) {
    if (!window.desktop?.testGlobalProviderConnection) return false

    setTestingProviderID(providerID)
    setMessage(null)

    try {
      const result = await window.desktop.testGlobalProviderConnection({
        providerID,
        ...input,
      })
      await loadSettingsData({ silent: true, preserveProviderDrafts: true })
      await notifyProviderModelsUpdated()
      setMessage({
        tone: result.ok ? "success" : "error",
        text: result.message,
      })
      return result.ok
    } catch (error) {
      setMessage({
        tone: "error",
        text: getErrorMessage(error),
      })
      return false
    } finally {
      setTestingProviderID(null)
    }
  }

  async function refreshProviderCatalog() {
    const refreshProviderCatalogApi = window.desktop?.refreshGlobalProviderCatalog

    if (!refreshProviderCatalogApi) {
      setMessage({
        tone: "error",
        text: "Desktop provider refresh API is unavailable.",
      })
      return false
    }

    setIsRefreshingProviderCatalog(true)
    setMessage(null)

    try {
      await refreshProviderCatalogApi()
      await loadSettingsData({ silent: true })
      await notifyProviderModelsUpdated()
      setMessage({
        tone: "success",
        text: "Provider catalog refreshed.",
      })
      return true
    } catch (error) {
      setMessage({
        tone: "error",
        text: getErrorMessage(error),
      })
      return false
    } finally {
      setIsRefreshingProviderCatalog(false)
    }
  }

  async function deleteProvider(providerID: string) {
    const removeProvider = window.desktop?.deleteGlobalProvider
    if (!removeProvider) return

    setDeletingProviderID(providerID)
    setMessage(null)

    try {
      await removeProvider({
        providerID,
      })
      await loadSettingsData({ silent: true })
      await notifyProviderModelsUpdated()
      setMessage({
        tone: "success",
        text: "Provider settings reset.",
      })
    } catch (error) {
      setMessage({
        tone: "error",
        text: getErrorMessage(error),
      })
    } finally {
      setDeletingProviderID(null)
    }
  }

  async function saveSelection() {
    const updateModelSelection = window.desktop?.updateGlobalModelSelection
    if (!updateModelSelection) return

    setIsSavingSelection(true)
    setMessage(null)

    try {
      await updateModelSelection({
        model: selectionDraft.model,
        small_model: selectionDraft.smallModel,
      })
      setSavedSelection(selectionDraft)
      await notifyProviderModelsUpdated()
      setMessage({
        tone: "success",
        text: "Model settings saved.",
      })
    } catch (error) {
      setMessage({
        tone: "error",
        text: getErrorMessage(error),
      })
    } finally {
      setIsSavingSelection(false)
    }
  }

  async function saveMcpServer() {
    if (!window.desktop?.updateGlobalMcpServer) return false

    const serverID = mcpServerDraft.id.trim()
    const validationError = getMcpServerValidationError(mcpServerDraft)
    if (validationError) {
      setMessage({
        tone: "error",
        text: validationError,
      })
      return false
    }

    setSavingMcpServerID(serverID)
    setMessage(null)

    try {
      await window.desktop.updateGlobalMcpServer({
        serverID,
        server:
          mcpServerDraft.transport === "stdio"
            ? {
                name: mcpServerDraft.name.trim() || undefined,
                transport: "stdio",
                command: mcpServerDraft.command.trim(),
                args: parseLineList(mcpServerDraft.args),
                env: parseMcpKeyValue(mcpServerDraft.env, "environment"),
                cwd: mcpServerDraft.cwd.trim() || undefined,
                enabled: mcpServerDraft.enabled,
                timeoutMs: mcpServerDraft.timeoutMs.trim() ? Number(mcpServerDraft.timeoutMs.trim()) : undefined,
              }
            : {
                name: mcpServerDraft.name.trim() || undefined,
                transport: "remote",
                serverUrl: mcpServerDraft.serverUrl.trim(),
                authorization: mcpServerDraft.authorization.trim() || undefined,
                headers: parseMcpKeyValue(mcpServerDraft.headers, "header"),
                allowedTools: buildAllowedTools(mcpServerDraft),
                enabled: mcpServerDraft.enabled,
                timeoutMs: mcpServerDraft.timeoutMs.trim() ? Number(mcpServerDraft.timeoutMs.trim()) : undefined,
              },
      })
      await loadSettingsData({ silent: true })
      await notifyMcpUpdated()
      setActiveMcpServerID(serverID)
      const diagnostic = await loadMcpServerDiagnostic(serverID)
      setMessage(diagnostic ? formatMcpDiagnosticMessage(diagnostic) : {
        tone: "success",
        text: "MCP server saved.",
      })
      return true
    } catch (error) {
      setMessage({
        tone: "error",
        text: getErrorMessage(error),
      })
      return false
    } finally {
      setSavingMcpServerID(null)
    }
  }

  async function deleteMcpServer(serverID: string) {
    if (!window.desktop?.deleteGlobalMcpServer) return

    setDeletingMcpServerID(serverID)
    setMessage(null)

    try {
      await window.desktop.deleteGlobalMcpServer({
        serverID,
      })
      await loadSettingsData({ silent: true })
      await notifyMcpUpdated()
      if (activeMcpServerID === serverID) {
        startNewMcpServer()
      }
      setMcpDiagnostics((current) => {
        const next = { ...current }
        delete next[serverID]
        return next
      })
      setMessage({
        tone: "success",
        text: "MCP server removed.",
      })
    } catch (error) {
      setMessage({
        tone: "error",
        text: getErrorMessage(error),
      })
    } finally {
      setDeletingMcpServerID(null)
    }
  }

  async function restoreArchivedSession(sessionID: string) {
    const restoreArchivedSessionApi = window.desktop?.restoreArchivedSession
    if (!restoreArchivedSessionApi) return false

    setRestoringArchivedSessionID(sessionID)
    setMessage(null)

    try {
      const result = await restoreArchivedSessionApi({ sessionID })
      await loadArchivedSessions({ silent: true })
      await notifyArchivedSessionRestored(result.session)
      setMessage({
        tone: "success",
        text: "Archived session restored.",
      })
      return true
    } catch (error) {
      setMessage({
        tone: "error",
        text: getErrorMessage(error),
      })
      return false
    } finally {
      setRestoringArchivedSessionID(null)
    }
  }

  async function deleteArchivedSession(sessionID: string) {
    const deleteArchivedSessionApi = window.desktop?.deleteArchivedSession
    if (!deleteArchivedSessionApi) return false

    setDeletingArchivedSessionID(sessionID)
    setMessage(null)

    try {
      await deleteArchivedSessionApi({ sessionID })
      await loadArchivedSessions({ silent: true })
      setMessage({
        tone: "success",
        text: "Archived session deleted.",
      })
      return true
    } catch (error) {
      setMessage({
        tone: "error",
        text: getErrorMessage(error),
      })
      return false
    } finally {
      setDeletingArchivedSessionID(null)
    }
  }

  const isPromptDirty =
    selectedPromptPresetID !== null &&
    (promptDraftLabel !== savedPromptLabel || promptDraftContent !== savedPromptContent)
  const isSystemPromptPresetDirty =
    promptPresetSelection !== null &&
    savedPromptPresetSelection !== null &&
    promptPresetSelection.systemPromptPresetID !== savedPromptPresetSelection.systemPromptPresetID
  const isPlanModePromptPresetDirty =
    promptPresetSelection !== null &&
    savedPromptPresetSelection !== null &&
    promptPresetSelection.planModePromptPresetID !== savedPromptPresetSelection.planModePromptPresetID
  const isBuiltinToolSelectionDirty =
    stableSelectionKey(builtinToolSelection) !== stableSelectionKey(savedBuiltinToolSelection)

  return {
    activeMcpServerID,
    activeMcpServerDiagnostic: activeMcpServerID ? mcpDiagnostics[activeMcpServerID] ?? null : null,
    archivedSessions,
    archivedSessionsError,
    builtinTools,
    builtinToolsError,
    cancelProviderAuthFlow,
    catalog,
    closeSettings,
    dismissMessage,
    deleteArchivedSession,
    deleteProviderAuthSession,
    deleteMcpServer,
    deleteProvider,
    deletingArchivedSessionID,
    deletingMcpServerID,
    deletingPromptPresetID,
    deletingProviderID,
    isCreatingPromptPreset,
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
    openSettings,
    promptDraftLabel,
    promptDraftContent,
    promptLoadError,
    promptPresets,
    promptPresetSelection,
    providerDrafts,
    createPromptPreset,
    deletePromptPreset,
    refreshProviderCatalog,
    resetPromptPreset,
    resetBuiltinTools,
    resettingPromptPresetID,
    restoringArchivedSessionID,
    savedSelection,
    saveMcpServer,
    saveBuiltinTools,
    savePromptPreset,
    savePromptPresetSelection,
    savingPromptPresetSelectionField,
    saveProviderApiKey,
    saveProvider,
    saveSelection,
    savingMcpServerID,
    savingPromptPresetID,
    savingProviderID,
    testProviderConnection,
    testingProviderID,
    selectedPromptPreset,
    setProviderAuthMethod,
    setPromptDraftLabelValue,
    setPromptPresetSelectionValue,
    selectPromptPreset,
    selectMcpServer,
    selectionDraft,
    setMcpServerDraftValue,
    setPromptDraftValue,
    setProviderDraftValue,
    setSelectionDraftValue,
    setBuiltinToolEnabled,
    startProviderAuthFlow,
    startNewMcpServer,
    restoreArchivedSession,
  }
}
