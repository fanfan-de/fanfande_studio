import { useEffect, useRef, useState } from "react"
import type {
  McpServerDraftState,
  McpServerSummary,
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
  projectID: string | null
  projectName?: string | null
  projectWorktree?: string | null
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

function toMcpDraft(server?: McpServerSummary): McpServerDraftState {
  return {
    id: server?.id ?? "",
    name: server?.name ?? "",
    command: server?.command ?? "",
    args: (server?.args ?? []).join("\n"),
    env: Object.entries(server?.env ?? {})
      .map(([key, value]) => `${key}=${value}`)
      .join("\n"),
    cwd: server?.cwd ?? "",
    enabled: server?.enabled ?? true,
    timeoutMs: typeof server?.timeoutMs === "number" ? String(server.timeoutMs) : "",
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function parseMcpEnv(input: string) {
  const entries = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf("=")
      if (separatorIndex === -1) {
        throw new Error(`Invalid environment line '${line}'. Use KEY=value format.`)
      }

      const key = line.slice(0, separatorIndex).trim()
      const value = line.slice(separatorIndex + 1)
      if (!key) {
        throw new Error(`Invalid environment line '${line}'. Environment keys cannot be empty.`)
      }

      return [key, value] as const
    })

  return entries.length > 0 ? Object.fromEntries(entries) : undefined
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
  const [activeMcpServerID, setActiveMcpServerID] = useState<string | null>(null)
  const [mcpServerDraft, setMcpServerDraft] = useState<McpServerDraftState>(() => toMcpDraft())
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [message, setMessage] = useState<SettingsMessage | null>(null)
  const [savingProviderID, setSavingProviderID] = useState<string | null>(null)
  const [deletingProviderID, setDeletingProviderID] = useState<string | null>(null)
  const [isSavingSelection, setIsSavingSelection] = useState(false)
  const [savingMcpServerID, setSavingMcpServerID] = useState<string | null>(null)
  const [deletingMcpServerID, setDeletingMcpServerID] = useState<string | null>(null)
  const requestIDRef = useRef(0)

  useEffect(() => {
    if (!isOpen) return

    void loadSettingsData()
  }, [isOpen, options.projectID])

  async function loadSettingsData(optionsArg?: LoadSettingsOptions) {
    if (!window.desktop?.getGlobalProviderCatalog || !window.desktop?.getGlobalModels) {
      setLoadError("Desktop provider settings APIs are unavailable.")
      setCatalog([])
      setModels([])
      setProviderDrafts({})
      setMcpServers([])
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
        window.desktop.getGlobalProviderCatalog(),
        window.desktop.getGlobalModels(),
        options.projectID && window.desktop?.getProjectMcpServers
          ? window.desktop.getProjectMcpServers({ projectID: options.projectID })
          : Promise.resolve([] as McpServerSummary[]),
      ])

      if (requestIDRef.current !== requestID) return

      const nextSelection = normalizeSelection(modelPayload.selection)
      setCatalog(nextCatalog)
      setModels(modelPayload.items)
      setSavedSelection(nextSelection)
      setSelectionDraft(nextSelection)
      setProviderDrafts(buildProviderDrafts(nextCatalog))
      setMcpServers(nextMcpServers)
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
      setMcpServerDraft(toMcpDraft())
      setActiveMcpServerID(null)
      setLoadError(getErrorMessage(error))
    } finally {
      if (requestIDRef.current === requestID) {
        setIsLoading(false)
      }
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
    if (!window.desktop?.updateGlobalProvider) return false

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
      await window.desktop.updateGlobalProvider({
        providerID,
        provider: nextProvider,
      })
      await loadSettingsData({ silent: true })
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
    if (!window.desktop?.deleteGlobalProvider) return

    setDeletingProviderID(providerID)
    setMessage(null)

    try {
      await window.desktop.deleteGlobalProvider({
        providerID,
      })
      await loadSettingsData({ silent: true })
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
    if (!window.desktop?.updateGlobalModelSelection) return

    setIsSavingSelection(true)
    setMessage(null)

    try {
      await window.desktop.updateGlobalModelSelection({
        model: selectionDraft.model,
        small_model: selectionDraft.smallModel,
      })
      setSavedSelection(selectionDraft)
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
    if (!options.projectID || !window.desktop?.updateProjectMcpServer) return false

    const serverID = mcpServerDraft.id.trim()
    const command = mcpServerDraft.command.trim()
    if (!serverID || !command) {
      setMessage({
        tone: "error",
        text: "MCP servers require both an id and a command.",
      })
      return false
    }

    setSavingMcpServerID(serverID)
    setMessage(null)

    try {
      await window.desktop.updateProjectMcpServer({
        projectID: options.projectID,
        serverID,
        server: {
          name: mcpServerDraft.name.trim() || undefined,
          transport: "stdio",
          command,
          args: mcpServerDraft.args
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean),
          env: parseMcpEnv(mcpServerDraft.env),
          cwd: mcpServerDraft.cwd.trim() || undefined,
          enabled: mcpServerDraft.enabled,
          timeoutMs: mcpServerDraft.timeoutMs.trim() ? Number(mcpServerDraft.timeoutMs.trim()) : undefined,
        },
      })
      await loadSettingsData({ silent: true })
      setActiveMcpServerID(serverID)
      setMessage({
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
    if (!options.projectID || !window.desktop?.deleteProjectMcpServer) return

    setDeletingMcpServerID(serverID)
    setMessage(null)

    try {
      await window.desktop.deleteProjectMcpServer({
        projectID: options.projectID,
        serverID,
      })
      await loadSettingsData({ silent: true })
      if (activeMcpServerID === serverID) {
        startNewMcpServer()
      }
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

  return {
    activeMcpServerID,
    catalog,
    closeSettings,
    deleteMcpServer,
    deleteProvider,
    deletingMcpServerID,
    deletingProviderID,
    isLoading,
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
  }
}
