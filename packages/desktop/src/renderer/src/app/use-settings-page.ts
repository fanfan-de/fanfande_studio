import { useEffect, useRef, useState } from "react"
import type {
  ArchivedSessionSummary,
  McpAllowedTools,
  McpServerDiagnostic,
  McpServerDraftState,
  McpServerSummary,
  LoadedSessionSnapshot,
  ProjectModelSelection,
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
}

interface UseSettingsPageOptions {
  onArchivedSessionRestored?: (session: LoadedSessionSnapshot) => void | Promise<void>
  onMcpUpdated?: () => void | Promise<void>
  onProviderModelsUpdated?: () => void | Promise<void>
  projectID: string | null
  projectName?: string | null
  projectWorktree?: string | null
}

type ProviderMutationPayload = {
  name?: string
  env?: string[]
  options?: {
    apiKey?: string
    baseURL?: string
  }
}

function normalizeSelection(selection?: { model?: string; small_model?: string }): ProjectModelSelection {
  return {
    model: selection?.model ?? null,
    smallModel: selection?.small_model ?? null,
  }
}

function buildProviderDrafts(items: ProviderCatalogItem[]) {
  return items.reduce<Record<string, ProviderDraftState>>((result, item) => {
    result[item.id] = {
      apiKey: "",
      baseURL: item.baseURL ?? "",
    }
    return result
  }, {})
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
  const [archivedSessions, setArchivedSessions] = useState<ArchivedSessionSummary[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingArchivedSessions, setIsLoadingArchivedSessions] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [archivedSessionsError, setArchivedSessionsError] = useState<string | null>(null)
  const [message, setMessage] = useState<SettingsMessage | null>(null)
  const [savingProviderID, setSavingProviderID] = useState<string | null>(null)
  const [deletingProviderID, setDeletingProviderID] = useState<string | null>(null)
  const [isSavingSelection, setIsSavingSelection] = useState(false)
  const [savingMcpServerID, setSavingMcpServerID] = useState<string | null>(null)
  const [deletingMcpServerID, setDeletingMcpServerID] = useState<string | null>(null)
  const [restoringArchivedSessionID, setRestoringArchivedSessionID] = useState<string | null>(null)
  const [deletingArchivedSessionID, setDeletingArchivedSessionID] = useState<string | null>(null)
  const requestIDRef = useRef(0)
  const archivedSessionsRequestIDRef = useRef(0)
  const mcpDiagnosticRequestIDRef = useRef<Record<string, number>>({})

  useEffect(() => {
    if (!isOpen) return

    void loadSettingsData()
    void loadArchivedSessions()
  }, [isOpen, options.projectID])

  function resolveProjectProviderSettingsProjectID() {
    const projectID = options.projectID?.trim()
    if (!projectID) return null

    if (
      window.desktop?.getProjectProviderCatalog &&
      window.desktop?.getProjectModels &&
      window.desktop?.updateProjectProvider &&
      window.desktop?.deleteProjectProvider &&
      window.desktop?.updateProjectModelSelection
    ) {
      return projectID
    }

    return null
  }

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

  useEffect(() => {
    if (!isOpen || !options.projectID || !activeMcpServerID) return

    void loadMcpServerDiagnostic(options.projectID, activeMcpServerID)
  }, [activeMcpServerID, isOpen, options.projectID])

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
    const projectID = resolveProjectProviderSettingsProjectID()
    const loadProviderCatalog = projectID
      ? () => window.desktop!.getProjectProviderCatalog!({ projectID })
      : window.desktop?.getGlobalProviderCatalog
    const loadModels = projectID
      ? () => window.desktop!.getProjectModels!({ projectID })
      : window.desktop?.getGlobalModels

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

      if (requestIDRef.current !== requestID) return

      const nextSelection = normalizeSelection(modelPayload.selection)
      setCatalog(nextCatalog)
      setModels(modelPayload.items)
      setSavedSelection(nextSelection)
      setSelectionDraft(nextSelection)
      setProviderDrafts(buildProviderDrafts(nextCatalog))
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

  async function loadMcpServerDiagnostic(projectID: string, serverID: string) {
    if (!window.desktop?.getProjectMcpServerDiagnostic) return null

    const requestID = (mcpDiagnosticRequestIDRef.current[serverID] ?? 0) + 1
    mcpDiagnosticRequestIDRef.current[serverID] = requestID

    try {
      const diagnostic = await window.desktop.getProjectMcpServerDiagnostic({
        projectID,
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

  function setProviderDraftValue(providerID: string, field: keyof ProviderDraftState, value: string) {
    setProviderDrafts((current) => ({
      ...current,
      [providerID]: {
        apiKey: current[providerID]?.apiKey ?? "",
        baseURL: current[providerID]?.baseURL ?? "",
        [field]: value,
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

  async function saveProvider(providerID: string) {
    const projectID = resolveProjectProviderSettingsProjectID()
    const updateProvider = projectID
      ? (provider: ProviderMutationPayload) =>
          window.desktop!.updateProjectProvider!({
            projectID,
            providerID,
            provider,
          })
      : window.desktop?.updateGlobalProvider
        ? (provider: ProviderMutationPayload) =>
            window.desktop!.updateGlobalProvider!({
              providerID,
              provider,
            })
        : null
    if (!updateProvider) return false

    const provider = catalog.find((item) => item.id === providerID)
    if (!provider) return false

    const draft = providerDrafts[providerID] ?? {
      apiKey: "",
      baseURL: provider.baseURL ?? "",
    }
    const apiKey = draft.apiKey.trim()
    const baseURL = draft.baseURL.trim()
    const nextProvider: {
      name?: string
      env?: string[]
      options?: {
        apiKey?: string
        baseURL?: string
      }
    } = {
      name: provider.name,
      env: provider.env,
    }
    const optionsPayload: {
      apiKey?: string
      baseURL?: string
    } = {}

    if (apiKey) {
      optionsPayload.apiKey = apiKey
    }

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
      await updateProvider(nextProvider)
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

  async function deleteProvider(providerID: string) {
    const projectID = resolveProjectProviderSettingsProjectID()
    const removeProvider = projectID
      ? () =>
          window.desktop!.deleteProjectProvider!({
            projectID,
            providerID,
          })
      : window.desktop?.deleteGlobalProvider
        ? () =>
            window.desktop!.deleteGlobalProvider!({
              providerID,
            })
        : null
    if (!removeProvider) return

    setDeletingProviderID(providerID)
    setMessage(null)

    try {
      await removeProvider()
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
    const projectID = resolveProjectProviderSettingsProjectID()
    const updateModelSelection = projectID
      ? (selection: { model?: string | null; small_model?: string | null }) =>
          window.desktop!.updateProjectModelSelection!({
            projectID,
            ...selection,
          })
      : window.desktop?.updateGlobalModelSelection
        ? (selection: { model?: string | null; small_model?: string | null }) =>
            window.desktop!.updateGlobalModelSelection!(selection)
        : null
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
      const diagnostic = options.projectID ? await loadMcpServerDiagnostic(options.projectID, serverID) : null
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

  return {
    activeMcpServerID,
    activeMcpServerDiagnostic: activeMcpServerID ? mcpDiagnostics[activeMcpServerID] ?? null : null,
    archivedSessions,
    archivedSessionsError,
    catalog,
    closeSettings,
    deleteArchivedSession,
    deleteMcpServer,
    deleteProvider,
    deletingArchivedSessionID,
    deletingMcpServerID,
    deletingProviderID,
    isLoading,
    isLoadingArchivedSessions,
    isOpen,
    isSavingSelection,
    loadError,
    mcpServerDraft,
    mcpServers,
    message,
    models,
    openSettings,
    projectID: options.projectID,
    projectName: options.projectName ?? null,
    projectWorktree: options.projectWorktree ?? null,
    providerDrafts,
    restoringArchivedSessionID,
    savedSelection,
    saveMcpServer,
    saveProvider,
    saveSelection,
    savingMcpServerID,
    savingProviderID,
    selectMcpServer,
    selectionDraft,
    setMcpServerDraftValue,
    setProviderDraftValue,
    setSelectionDraftValue,
    startNewMcpServer,
    restoreArchivedSession,
  }
}
