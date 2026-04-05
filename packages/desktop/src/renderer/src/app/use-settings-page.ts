import { useEffect, useRef, useState } from "react"
import type { ProjectModelSelection, ProviderCatalogItem, ProviderDraftState, ProviderModel } from "./types"

interface SettingsMessage {
  tone: "success" | "error"
  text: string
}

interface LoadSettingsOptions {
  silent?: boolean
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function useSettingsPage() {
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
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [message, setMessage] = useState<SettingsMessage | null>(null)
  const [savingProviderID, setSavingProviderID] = useState<string | null>(null)
  const [deletingProviderID, setDeletingProviderID] = useState<string | null>(null)
  const [isSavingSelection, setIsSavingSelection] = useState(false)
  const requestIDRef = useRef(0)

  useEffect(() => {
    if (!isOpen) return

    void loadSettingsData()
  }, [isOpen])

  async function loadSettingsData(options?: LoadSettingsOptions) {
    if (!window.desktop?.getGlobalProviderCatalog || !window.desktop?.getGlobalModels) {
      setLoadError("Desktop provider settings APIs are unavailable.")
      setCatalog([])
      setModels([])
      setProviderDrafts({})
      return
    }

    const requestID = ++requestIDRef.current
    if (!options?.silent) {
      setIsLoading(true)
    }
    setLoadError(null)

    try {
      const [nextCatalog, modelPayload] = await Promise.all([
        window.desktop.getGlobalProviderCatalog(),
        window.desktop.getGlobalModels(),
      ])

      if (requestIDRef.current !== requestID) return

      const nextSelection = normalizeSelection(modelPayload.selection)
      setCatalog(nextCatalog)
      setModels(modelPayload.items)
      setSavedSelection(nextSelection)
      setSelectionDraft(nextSelection)
      setProviderDrafts(buildProviderDrafts(nextCatalog))
    } catch (error) {
      if (requestIDRef.current !== requestID) return
      setCatalog([])
      setModels([])
      setProviderDrafts({})
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
    const options: {
      apiKey?: string
      baseURL?: string
    } = {}

    if (apiKey) {
      options.apiKey = apiKey
    }

    if (baseURL !== (provider.baseURL ?? "")) {
      options.baseURL = baseURL
    }

    if (Object.keys(options).length > 0) {
      nextProvider.options = options
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

  return {
    catalog,
    closeSettings,
    deleteProvider,
    deletingProviderID,
    isLoading,
    isOpen,
    isSavingSelection,
    loadError,
    message,
    models,
    openSettings,
    providerDrafts,
    savedSelection,
    saveProvider,
    saveSelection,
    savingProviderID,
    selectionDraft,
    setProviderDraftValue,
    setSelectionDraftValue,
  }
}
