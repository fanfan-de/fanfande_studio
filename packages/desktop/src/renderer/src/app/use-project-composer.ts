import { useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  getDefaultReasoningEffort as getProviderDefaultReasoningEffort,
  getSupportedReasoningEfforts as getProviderSupportedReasoningEfforts,
  supportsReasoningEffort,
  type ReasoningEffort,
} from "@fanfande/shared"
import {
  describeComposerAttachmentSupport,
  getComposerAttachmentCapabilities,
  getComposerAttachmentDisabledReason,
  getComposerAttachmentError,
  isComposerAttachmentSupported,
} from "./composer/attachment-utils"
import type {
  ComposerMcpOption,
  ComposerModelOption,
  ComposerReasoningEffortOption,
  ComposerSkillOption,
  McpServerSummary,
  ProviderModel,
  SessionModelSelection,
  SkillInfo,
} from "./types"
const REASONING_EFFORT_COPY: Record<
  ReasoningEffort,
  {
    label: string
    description: string
  }
> = {
  none: {
    label: "None",
    description: "Skip deliberate reasoning for the fastest compatible response.",
  },
  minimal: {
    label: "Minimal",
    description: "Use a very shallow reasoning pass to reduce latency and reasoning tokens.",
  },
  low: {
    label: "Low",
    description: "Keep reasoning light for routine implementation and review tasks.",
  },
  medium: {
    label: "Medium",
    description: "Balance speed and depth for most coding work.",
  },
  high: {
    label: "High",
    description: "Spend more compute on harder or more ambiguous tasks.",
  },
  xhigh: {
    label: "X-High",
    description: "Use the deepest supported reasoning setting for long-horizon work.",
  },
  max: {
    label: "Max",
    description: "Use the maximum supported reasoning setting for the most complex tasks.",
  },
}

function toComposerModelValue(model: ProviderModel) {
  return `${model.providerID}/${model.id}`
}

function toComposerModelLabel(model: ProviderModel) {
  return model.name
}

const COMPOSER_PROVIDER_LABEL_OVERRIDES: Record<string, string> = {
  anthropic: "Anthropic",
  deepseek: "DeepSeek",
  google: "Google",
  groq: "Groq",
  mistral: "Mistral",
  ollama: "Ollama",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  xai: "xAI",
}

function formatComposerProviderID(providerID: string) {
  const normalized = providerID.trim()
  if (!normalized) return "Unknown provider"

  const override = COMPOSER_PROVIDER_LABEL_OVERRIDES[normalized.toLowerCase()]
  if (override) return override

  return normalized
    .replace(/[-_]+/g, " ")
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
}

function toComposerModelProviderLabel(model: ProviderModel) {
  return model.providerName?.trim() || formatComposerProviderID(model.providerID)
}

function toReasoningProfile(model: ProviderModel) {
  return {
    providerID: model.providerID,
    modelID: model.id,
    reasoning: model.capabilities.reasoning,
  }
}

function isReasoningEffortModel(model: ProviderModel | null): model is ProviderModel {
  return Boolean(model && supportsReasoningEffort(toReasoningProfile(model)))
}

function resolveComposerReasoningEffortOptions(model: ProviderModel | null): ComposerReasoningEffortOption[] {
  if (!isReasoningEffortModel(model)) return []

  return getProviderSupportedReasoningEfforts(toReasoningProfile(model)).map((value) => ({
    value,
    label: REASONING_EFFORT_COPY[value].label,
    description: REASONING_EFFORT_COPY[value].description,
  }))
}

function resolveDefaultReasoningEffort(
  model: ProviderModel | null,
  options: ComposerReasoningEffortOption[],
): ReasoningEffort | null {
  if (!isReasoningEffortModel(model) || options.length === 0) return null
  return getProviderDefaultReasoningEffort(toReasoningProfile(model)) ?? null
}

function resolveSelectedReasoningEffort(
  selectedReasoningEffort: ReasoningEffort | null,
  defaultReasoningEffort: ReasoningEffort | null,
  options: ComposerReasoningEffortOption[],
) {
  if (selectedReasoningEffort && options.some((option) => option.value === selectedReasoningEffort)) {
    return selectedReasoningEffort
  }

  return defaultReasoningEffort
}

function resolveComposerEffectiveModel(
  selectedModel: string | null,
  models: ProviderModel[],
  defaultModel: ProviderModel | null,
) {
  if (!selectedModel) return defaultModel
  return models.find((model) => toComposerModelValue(model) === selectedModel) ?? defaultModel
}

function resolveComposerModelLabel(
  selectedModel: string | null,
  models: ProviderModel[],
  effectiveModel: ProviderModel | null,
  isLoading: boolean,
) {
  if (isLoading && models.length === 0 && !effectiveModel) return "Loading..."
  if (!selectedModel) {
    return effectiveModel ? `Server default (${effectiveModel.name})` : "Server default"
  }
  return models.find((model) => toComposerModelValue(model) === selectedModel)?.name ?? selectedModel
}

function resolveComposerSkillLabel(selectedSkillIDs: string[], skills: SkillInfo[], isLoading: boolean) {
  if (isLoading && skills.length === 0) return "Loading skills..."
  if (selectedSkillIDs.length === 0) return "Skills"
  if (selectedSkillIDs.length === 1) {
    return skills.find((skill) => skill.id === selectedSkillIDs[0])?.name ?? "1 skill"
  }
  return `${selectedSkillIDs.length} skills`
}

function describeComposerMcpServer(server: McpServerSummary) {
  if (server.transport === "stdio") {
    return server.command
  }

  return server.serverUrl ?? server.connectorId ?? "Remote HTTP MCP"
}

function resolveComposerMcpLabel(selectedServerIDs: string[], servers: McpServerSummary[], isLoading: boolean) {
  if (isLoading && servers.length === 0) return "Loading MCP..."
  if (selectedServerIDs.length === 0) return "MCP"
  if (selectedServerIDs.length === 1) {
    return servers.find((server) => server.id === selectedServerIDs[0])?.name ?? "1 server"
  }
  return `${selectedServerIDs.length} servers`
}

function resolveComposerReasoningEffortLabel(
  selectedReasoningEffort: ReasoningEffort | null,
  options: ComposerReasoningEffortOption[],
) {
  if (!selectedReasoningEffort) return ""
  return options.find((option) => option.value === selectedReasoningEffort)?.label ?? REASONING_EFFORT_COPY[selectedReasoningEffort].label
}

const projectComposerModelItemsCache = new Map<string, ProviderModel[]>()
const shouldUseComposerResourceCache = import.meta.env.MODE !== "test"

interface ComposerModelsPayload {
  effectiveModel?: ProviderModel | null
  items: ProviderModel[]
  selection?: {
    model?: string
    small_model?: string
  }
}

interface ComposerSkillsPayload {
  selectedSkillIDs: string[]
  skills: SkillInfo[]
}

interface ComposerMcpPayload {
  selectedMcpServerIDs: string[]
  servers: McpServerSummary[]
}

const projectComposerModelsPayloadCache = new Map<string, ComposerModelsPayload>()
const sessionComposerModelsPayloadCache = new Map<string, ComposerModelsPayload>()
const projectComposerSkillsPayloadCache = new Map<string, ComposerSkillsPayload>()
const projectComposerMcpPayloadCache = new Map<string, ComposerMcpPayload>()

function getComposerResourceCacheKey(scopeID: string, refreshToken: number) {
  return `${refreshToken}\u0000${scopeID}`
}

export interface UseProjectComposerOptions {
  attachmentPaths: string[]
  onSessionModelSelectionChange?: (sessionID: string, selection: SessionModelSelection | undefined) => void
  projectID: string | null
  refreshToken?: number
  sessionModelSelection?: SessionModelSelection
  sessionID?: string | null
}

export function useProjectComposer({
  attachmentPaths,
  onSessionModelSelectionChange,
  projectID,
  refreshToken = 0,
  sessionModelSelection,
  sessionID = null,
}: UseProjectComposerOptions) {
  const [models, setModels] = useState<ProviderModel[]>([])
  const [defaultModel, setDefaultModel] = useState<ProviderModel | null>(null)
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [smallModel, setSmallModel] = useState<string | null>(null)
  const [selectedReasoningEffort, setSelectedReasoningEffort] = useState<ReasoningEffort | null>(null)
  const [isLoadingModels, setIsLoadingModels] = useState(false)

  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [selectedSkillIDs, setSelectedSkillIDs] = useState<string[]>([])
  const [isLoadingSkills, setIsLoadingSkills] = useState(false)

  const [mcpServers, setMcpServers] = useState<McpServerSummary[]>([])
  const [selectedMcpServerIDs, setSelectedMcpServerIDs] = useState<string[]>([])
  const [isLoadingMcp, setIsLoadingMcp] = useState(false)

  const modelsRequestRef = useRef(0)
  const modelSelectionRequestRef = useRef(0)
  const skillsRequestRef = useRef(0)
  const skillSelectionRequestRef = useRef(0)
  const mcpRequestRef = useRef(0)
  const mcpSelectionRequestRef = useRef(0)
  const pendingModelSelectionRef = useRef<Promise<void> | null>(null)
  const currentModelScopeRef = useRef({ projectID, sessionID })
  const sessionSelectionModel = sessionModelSelection?.model?.trim() || null
  const sessionSelectionSmallModel = sessionModelSelection?.small_model?.trim() || null

  currentModelScopeRef.current = { projectID, sessionID }

  useLayoutEffect(() => {
    const projectCacheKey = projectID ? getComposerResourceCacheKey(projectID, refreshToken) : null
    const sessionCacheKey = sessionID ? getComposerResourceCacheKey(sessionID, refreshToken) : null
    const cachedPayload = shouldUseComposerResourceCache
      ? (sessionCacheKey ? sessionComposerModelsPayloadCache.get(sessionCacheKey) : null) ??
        (projectCacheKey ? projectComposerModelsPayloadCache.get(projectCacheKey) : null)
      : null

    modelsRequestRef.current += 1
    modelSelectionRequestRef.current += 1
    pendingModelSelectionRef.current = null

    setModels(cachedPayload?.items ?? (projectID ? projectComposerModelItemsCache.get(projectID) ?? [] : []))
    setDefaultModel(cachedPayload?.effectiveModel ?? null)
    setSelectedModel(sessionID ? sessionSelectionModel : cachedPayload?.selection?.model ?? null)
    setSmallModel(sessionID ? sessionSelectionSmallModel : cachedPayload?.selection?.small_model ?? null)
    setIsLoadingModels(Boolean(
      !cachedPayload &&
      projectID &&
      (window.desktop?.getProjectModels || (sessionID && window.desktop?.getSessionModels)),
    ))
  }, [projectID, refreshToken, sessionID])

  useEffect(() => {
    if (!sessionID) return
    setSelectedModel(sessionSelectionModel)
    setSmallModel(sessionSelectionSmallModel)
  }, [sessionID, sessionSelectionModel, sessionSelectionSmallModel])

  useEffect(() => {
    const getProjectModels = window.desktop?.getProjectModels
    const getSessionModels = window.desktop?.getSessionModels
    if (!projectID || (!getProjectModels && !(sessionID && getSessionModels))) {
      setModels([])
      setDefaultModel(null)
      setSelectedModel(null)
      setSmallModel(null)
      setIsLoadingModels(false)
      return
    }

    const projectCacheKey = getComposerResourceCacheKey(projectID, refreshToken)
    const sessionCacheKey = sessionID ? getComposerResourceCacheKey(sessionID, refreshToken) : null
    const cachedPayload = shouldUseComposerResourceCache
      ? (sessionCacheKey ? sessionComposerModelsPayloadCache.get(sessionCacheKey) : null) ??
        projectComposerModelsPayloadCache.get(projectCacheKey)
      : null
    if (cachedPayload) {
      setModels(cachedPayload.items)
      setDefaultModel(cachedPayload.effectiveModel ?? null)
      if (sessionID) {
        setSelectedModel(sessionSelectionModel)
        setSmallModel(sessionSelectionSmallModel)
      } else {
        setSelectedModel(cachedPayload.selection?.model ?? null)
        setSmallModel(cachedPayload.selection?.small_model ?? null)
      }
      setIsLoadingModels(false)
      return
    }

    const requestID = ++modelsRequestRef.current
    setIsLoadingModels(true)

    const isSessionModelRequest = Boolean(sessionID && getSessionModels)
    const requestProjectID = projectID
    const requestSessionID = sessionID
    const modelRequest =
      isSessionModelRequest && sessionID && getSessionModels
        ? getSessionModels({ sessionID })
        : getProjectModels?.({ projectID })

    if (!modelRequest) {
      setIsLoadingModels(false)
      return
    }

    void modelRequest
      .then((payload) => {
        if (modelsRequestRef.current !== requestID) return
        if (currentModelScopeRef.current.projectID !== requestProjectID) return
        if (currentModelScopeRef.current.sessionID !== requestSessionID) return
        projectComposerModelItemsCache.set(requestProjectID, payload.items)
        if (shouldUseComposerResourceCache) {
          const payloadCacheKey = getComposerResourceCacheKey(
            isSessionModelRequest && requestSessionID ? requestSessionID : requestProjectID,
            refreshToken,
          )
          const cache = isSessionModelRequest && requestSessionID
            ? sessionComposerModelsPayloadCache
            : projectComposerModelsPayloadCache
          cache.set(payloadCacheKey, payload)
        }
        setModels(payload.items)
        setDefaultModel(payload.effectiveModel ?? null)
        if (isSessionModelRequest || !requestSessionID || !getSessionModels) {
          setSelectedModel(payload.selection?.model ?? null)
          setSmallModel(payload.selection?.small_model ?? null)
          if (isSessionModelRequest && requestSessionID) {
            onSessionModelSelectionChange?.(requestSessionID, {
              ...(payload.selection?.model ? { model: payload.selection.model } : {}),
              ...(payload.selection?.small_model ? { small_model: payload.selection.small_model } : {}),
            })
          }
        }
      })
      .catch((error) => {
        if (modelsRequestRef.current !== requestID) return
        if (currentModelScopeRef.current.projectID !== requestProjectID) return
        if (currentModelScopeRef.current.sessionID !== requestSessionID) return
        console.error("[desktop] refreshProjectComposerModels failed:", error)
        setModels(projectComposerModelItemsCache.get(requestProjectID) ?? [])
        setDefaultModel(null)
      })
      .finally(() => {
        if (modelsRequestRef.current === requestID) {
          setIsLoadingModels(false)
        }
      })
  }, [projectID, refreshToken, sessionID])

  useEffect(() => {
    const getProjectSkills = window.desktop?.getProjectSkills
    const getProjectSkillSelection = window.desktop?.getProjectSkillSelection
    if (!projectID || !getProjectSkills || !getProjectSkillSelection) {
      setSkills([])
      setSelectedSkillIDs([])
      setIsLoadingSkills(false)
      return
    }

    const cacheKey = getComposerResourceCacheKey(projectID, refreshToken)
    const cachedPayload = shouldUseComposerResourceCache ? projectComposerSkillsPayloadCache.get(cacheKey) : null
    if (cachedPayload) {
      setSkills(cachedPayload.skills)
      setSelectedSkillIDs(cachedPayload.selectedSkillIDs)
      setIsLoadingSkills(false)
      return
    }

    const requestID = ++skillsRequestRef.current
    setIsLoadingSkills(true)

    void Promise.all([getProjectSkills({ projectID }), getProjectSkillSelection({ projectID })])
      .then(([nextSkills, selection]) => {
        if (skillsRequestRef.current !== requestID) return
        const availableSkillIDs = new Set(nextSkills.map((skill) => skill.id))
        const nextSelectedSkillIDs = selection.skillIDs.filter((skillID) => availableSkillIDs.has(skillID))
        if (shouldUseComposerResourceCache) {
          projectComposerSkillsPayloadCache.set(cacheKey, {
            skills: nextSkills,
            selectedSkillIDs: nextSelectedSkillIDs,
          })
        }
        setSkills(nextSkills)
        setSelectedSkillIDs(nextSelectedSkillIDs)
      })
      .catch((error) => {
        if (skillsRequestRef.current !== requestID) return
        console.error("[desktop] refreshProjectComposerSkills failed:", error)
        setSkills([])
        setSelectedSkillIDs([])
      })
      .finally(() => {
        if (skillsRequestRef.current === requestID) {
          setIsLoadingSkills(false)
        }
      })
  }, [projectID, refreshToken])

  useEffect(() => {
    const getGlobalMcpServers = window.desktop?.getGlobalMcpServers
    const getProjectMcpSelection = window.desktop?.getProjectMcpSelection
    if (!projectID || !getGlobalMcpServers || !getProjectMcpSelection) {
      setMcpServers([])
      setSelectedMcpServerIDs([])
      setIsLoadingMcp(false)
      return
    }

    const cacheKey = getComposerResourceCacheKey(projectID, refreshToken)
    const cachedPayload = shouldUseComposerResourceCache ? projectComposerMcpPayloadCache.get(cacheKey) : null
    if (cachedPayload) {
      setMcpServers(cachedPayload.servers)
      setSelectedMcpServerIDs(cachedPayload.selectedMcpServerIDs)
      setIsLoadingMcp(false)
      return
    }

    const requestID = ++mcpRequestRef.current
    setIsLoadingMcp(true)

    void Promise.all([getGlobalMcpServers(), getProjectMcpSelection({ projectID })])
      .then(([servers, selection]) => {
        if (mcpRequestRef.current !== requestID) return
        const availableServerIDs = new Set(servers.map((server) => server.id))
        const nextSelectedMcpServerIDs = selection.serverIDs.filter((serverID) => availableServerIDs.has(serverID))
        if (shouldUseComposerResourceCache) {
          projectComposerMcpPayloadCache.set(cacheKey, {
            servers,
            selectedMcpServerIDs: nextSelectedMcpServerIDs,
          })
        }
        setMcpServers(servers)
        setSelectedMcpServerIDs(nextSelectedMcpServerIDs)
      })
      .catch((error) => {
        if (mcpRequestRef.current !== requestID) return
        console.error("[desktop] refreshProjectComposerMcp failed:", error)
        setMcpServers([])
        setSelectedMcpServerIDs([])
      })
      .finally(() => {
        if (mcpRequestRef.current === requestID) {
          setIsLoadingMcp(false)
        }
      })
  }, [projectID, refreshToken])

  const modelOptions: ComposerModelOption[] = models
    .filter((model) => model.available)
    .map((model) => ({
      value: toComposerModelValue(model),
      label: toComposerModelLabel(model),
      providerID: model.providerID,
      providerLabel: toComposerModelProviderLabel(model),
    }))
  const effectiveModel = resolveComposerEffectiveModel(selectedModel, models, defaultModel)
  const attachmentCapabilities = getComposerAttachmentCapabilities(effectiveModel)
  const attachmentDisabledReason = getComposerAttachmentDisabledReason(
    effectiveModel,
    attachmentCapabilities,
    isLoadingModels,
  )
  const attachmentError = getComposerAttachmentError(attachmentPaths, effectiveModel, attachmentCapabilities)
  const attachmentButtonTitle =
    attachmentDisabledReason ??
    `Add ${describeComposerAttachmentSupport(attachmentCapabilities) ?? "attachments"}.`
  const skillOptions: ComposerSkillOption[] = skills.map((skill) => ({
    value: skill.id,
    label: skill.name,
    description: skill.description,
  }))
  const mcpOptions: ComposerMcpOption[] = mcpServers.map((server) => ({
    value: server.id,
    label: server.name ?? server.id,
    description: describeComposerMcpServer(server),
  }))
  const selectedModelLabel = resolveComposerModelLabel(selectedModel, models, effectiveModel, isLoadingModels)
  const selectedSkillLabel = resolveComposerSkillLabel(selectedSkillIDs, skills, isLoadingSkills)
  const selectedMcpLabel = resolveComposerMcpLabel(selectedMcpServerIDs, mcpServers, isLoadingMcp)
  const contextWindow = effectiveModel?.limit.context ?? null
  const reasoningEffortOptions = resolveComposerReasoningEffortOptions(effectiveModel)
  const defaultReasoningEffort = resolveDefaultReasoningEffort(effectiveModel, reasoningEffortOptions)
  const effectiveReasoningEffort = resolveSelectedReasoningEffort(
    selectedReasoningEffort,
    defaultReasoningEffort,
    reasoningEffortOptions,
  )
  const selectedReasoningEffortLabel = resolveComposerReasoningEffortLabel(
    effectiveReasoningEffort,
    reasoningEffortOptions,
  )

  useEffect(() => {
    if (!selectedReasoningEffort) return
    if (reasoningEffortOptions.some((option) => option.value === selectedReasoningEffort)) return
    setSelectedReasoningEffort(null)
  }, [reasoningEffortOptions, selectedReasoningEffort])

  async function awaitPendingModelSelection() {
    await pendingModelSelectionRef.current?.catch(() => undefined)
  }

  async function handleModelChange(value: string | null) {
    const updateSessionModelSelection = window.desktop?.updateSessionModelSelection
    const targetSessionID = sessionID
    const previousSelection = selectedModel
    const previousSmallModel = smallModel
    const requestID = ++modelSelectionRequestRef.current
    setSelectedModel(value)

    if (targetSessionID) {
      onSessionModelSelectionChange?.(targetSessionID, {
        ...(value ? { model: value } : {}),
        ...(previousSmallModel ? { small_model: previousSmallModel } : {}),
      })
    }

    if (!targetSessionID || !updateSessionModelSelection) {
      return
    }

    const saveTask = (async () => {
      try {
        const result = await updateSessionModelSelection({
          sessionID: targetSessionID,
          model: value,
        })
        if (modelSelectionRequestRef.current !== requestID) return
        if (currentModelScopeRef.current.sessionID !== targetSessionID) return

        setSelectedModel(result.model ?? null)
        setSmallModel(result.small_model ?? null)
        onSessionModelSelectionChange?.(targetSessionID, {
          ...(result.model ? { model: result.model } : {}),
          ...(result.small_model ? { small_model: result.small_model } : {}),
        })
      } catch (error) {
        if (modelSelectionRequestRef.current !== requestID) return
        if (currentModelScopeRef.current.sessionID !== targetSessionID) return
        console.error("[desktop] updateSessionComposerModelSelection failed:", error)
        setSelectedModel(previousSelection)
        setSmallModel(previousSmallModel)
        onSessionModelSelectionChange?.(targetSessionID, {
          ...(previousSelection ? { model: previousSelection } : {}),
          ...(previousSmallModel ? { small_model: previousSmallModel } : {}),
        })
        throw error
      }
    })()

    const trackedTask = saveTask.finally(() => {
      if (pendingModelSelectionRef.current === trackedTask) {
        pendingModelSelectionRef.current = null
      }
    })
    pendingModelSelectionRef.current = trackedTask

    await trackedTask
  }

  async function handleSkillToggle(value: string) {
    const updateProjectSkillSelection = window.desktop?.updateProjectSkillSelection
    if (!projectID || !updateProjectSkillSelection) {
      return
    }

    const nextSelection = selectedSkillIDs.includes(value)
      ? selectedSkillIDs.filter((item) => item !== value)
      : [...selectedSkillIDs, value]
    setSelectedSkillIDs(nextSelection)

    const requestID = ++skillSelectionRequestRef.current

    try {
      const result = await updateProjectSkillSelection({
        projectID,
        skillIDs: nextSelection,
      })
      if (skillSelectionRequestRef.current !== requestID) return

      const availableSkillIDs = new Set(skills.map((skill) => skill.id))
      const nextSelectedSkillIDs = result.skillIDs.filter((skillID) => availableSkillIDs.has(skillID))
      if (shouldUseComposerResourceCache) {
        projectComposerSkillsPayloadCache.set(getComposerResourceCacheKey(projectID, refreshToken), {
          skills,
          selectedSkillIDs: nextSelectedSkillIDs,
        })
      }
      setSelectedSkillIDs(nextSelectedSkillIDs)
    } catch (error) {
      if (skillSelectionRequestRef.current !== requestID) return
      console.error("[desktop] updateProjectComposerSkillSelection failed:", error)
    }
  }

  async function handleMcpToggle(value: string) {
    const updateProjectMcpSelection = window.desktop?.updateProjectMcpSelection
    if (!projectID || !updateProjectMcpSelection) {
      return
    }

    const nextSelection = selectedMcpServerIDs.includes(value)
      ? selectedMcpServerIDs.filter((item) => item !== value)
      : [...selectedMcpServerIDs, value]
    setSelectedMcpServerIDs(nextSelection)

    const requestID = ++mcpSelectionRequestRef.current

    try {
      const result = await updateProjectMcpSelection({
        projectID,
        serverIDs: nextSelection,
      })
      if (mcpSelectionRequestRef.current !== requestID) return

      const availableServerIDs = new Set(mcpServers.map((server) => server.id))
      const nextSelectedMcpServerIDs = result.serverIDs.filter((serverID) => availableServerIDs.has(serverID))
      if (shouldUseComposerResourceCache) {
        projectComposerMcpPayloadCache.set(getComposerResourceCacheKey(projectID, refreshToken), {
          servers: mcpServers,
          selectedMcpServerIDs: nextSelectedMcpServerIDs,
        })
      }
      setSelectedMcpServerIDs(nextSelectedMcpServerIDs)
    } catch (error) {
      if (mcpSelectionRequestRef.current !== requestID) return
      console.error("[desktop] updateProjectComposerMcpSelection failed:", error)
    }
  }

  function handleReasoningEffortChange(value: ReasoningEffort | null) {
    setSelectedReasoningEffort(value)
  }

  return {
    attachmentCapabilities,
    attachmentButtonTitle,
    attachmentDisabledReason,
    attachmentError,
    awaitPendingModelSelection,
    contextWindow,
    handleMcpToggle,
    handleModelChange,
    handleReasoningEffortChange,
    handleSkillToggle,
    mcpOptions,
    modelOptions,
    reasoningEffortOptions,
    selectedMcpLabel,
    selectedMcpServerIDs,
    selectedModel,
    selectedModelLabel,
    selectedReasoningEffort: effectiveReasoningEffort,
    selectedReasoningEffortLabel,
    selectedSkillIDs,
    selectedSkillLabel,
    skillOptions,
    unsupportedAttachmentPaths: attachmentPaths.filter(
      (path) => !isComposerAttachmentSupported(path, attachmentCapabilities),
    ),
  }
}
