import { useEffect, useRef, useState } from "react"
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
  OpenAIReasoningEffort,
  ProviderModel,
  SkillInfo,
} from "./types"
const DEFAULT_OPENAI_REASONING_EFFORTS: OpenAIReasoningEffort[] = ["low", "medium", "high"]
const OPENAI_REASONING_EFFORT_COPY: Record<
  OpenAIReasoningEffort,
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
}

function toComposerModelValue(model: ProviderModel) {
  return `${model.providerID}/${model.id}`
}

function toComposerModelLabel(model: ProviderModel) {
  return model.name
}

function isOpenAIReasoningModel(model: ProviderModel | null): model is ProviderModel {
  return Boolean(model && model.providerID === "openai" && model.capabilities.reasoning)
}

function getSupportedOpenAIReasoningEfforts(modelID: string): OpenAIReasoningEffort[] {
  const normalized = modelID.trim().toLowerCase()
  if (!normalized) return DEFAULT_OPENAI_REASONING_EFFORTS

  if (normalized.startsWith("gpt-5-pro")) {
    return ["high"]
  }

  if (normalized.startsWith("gpt-5.4-pro") || normalized.startsWith("gpt-5.2-pro")) {
    return ["medium", "high", "xhigh"]
  }

  if (normalized.startsWith("gpt-5.4") || normalized.startsWith("gpt-5.2")) {
    return ["none", "low", "medium", "high", "xhigh"]
  }

  if (normalized.startsWith("gpt-5.3-codex")) {
    return ["low", "medium", "high", "xhigh"]
  }

  if (normalized.startsWith("gpt-5.1-codex-max")) {
    return ["none", "medium", "high", "xhigh"]
  }

  if (normalized.startsWith("gpt-5.1")) {
    return ["none", "low", "medium", "high"]
  }

  if (normalized.startsWith("gpt-5")) {
    return ["minimal", "low", "medium", "high"]
  }

  return DEFAULT_OPENAI_REASONING_EFFORTS
}

function resolveComposerReasoningEffortOptions(model: ProviderModel | null): ComposerReasoningEffortOption[] {
  if (!isOpenAIReasoningModel(model)) return []

  return getSupportedOpenAIReasoningEfforts(model.id).map((value) => ({
    value,
    label: OPENAI_REASONING_EFFORT_COPY[value].label,
    description: OPENAI_REASONING_EFFORT_COPY[value].description,
  }))
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
  selectedReasoningEffort: OpenAIReasoningEffort | null,
  options: ComposerReasoningEffortOption[],
) {
  if (!selectedReasoningEffort) return "Model default"
  return options.find((option) => option.value === selectedReasoningEffort)?.label ?? OPENAI_REASONING_EFFORT_COPY[selectedReasoningEffort].label
}

export interface UseProjectComposerOptions {
  attachmentPaths: string[]
  projectID: string | null
  refreshToken?: number
  sessionID?: string | null
}

export function useProjectComposer({ attachmentPaths, projectID, refreshToken = 0, sessionID = null }: UseProjectComposerOptions) {
  const [models, setModels] = useState<ProviderModel[]>([])
  const [defaultModel, setDefaultModel] = useState<ProviderModel | null>(null)
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [smallModel, setSmallModel] = useState<string | null>(null)
  const [selectedReasoningEffort, setSelectedReasoningEffort] = useState<OpenAIReasoningEffort | null>(null)
  const [isLoadingModels, setIsLoadingModels] = useState(false)

  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [selectedSkillIDs, setSelectedSkillIDs] = useState<string[]>([])
  const [isLoadingSkills, setIsLoadingSkills] = useState(false)

  const [mcpServers, setMcpServers] = useState<McpServerSummary[]>([])
  const [selectedMcpServerIDs, setSelectedMcpServerIDs] = useState<string[]>([])
  const [isLoadingMcp, setIsLoadingMcp] = useState(false)

  const modelsRequestRef = useRef(0)
  const skillsRequestRef = useRef(0)
  const skillSelectionRequestRef = useRef(0)
  const mcpRequestRef = useRef(0)
  const mcpSelectionRequestRef = useRef(0)
  const pendingModelSelectionRef = useRef<Promise<void> | null>(null)

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

    const requestID = ++modelsRequestRef.current
    setIsLoadingModels(true)

    const isSessionModelRequest = Boolean(sessionID && getSessionModels)
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
        setModels(payload.items)
        setDefaultModel(payload.effectiveModel ?? null)
        setSelectedModel(isSessionModelRequest || !getSessionModels ? payload.selection?.model ?? null : null)
        setSmallModel(payload.selection?.small_model ?? null)
      })
      .catch((error) => {
        if (modelsRequestRef.current !== requestID) return
        console.error("[desktop] refreshProjectComposerModels failed:", error)
        setModels([])
        setDefaultModel(null)
        setSelectedModel(null)
        setSmallModel(null)
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

    const requestID = ++skillsRequestRef.current
    setIsLoadingSkills(true)

    void Promise.all([getProjectSkills({ projectID }), getProjectSkillSelection({ projectID })])
      .then(([nextSkills, selection]) => {
        if (skillsRequestRef.current !== requestID) return
        const availableSkillIDs = new Set(nextSkills.map((skill) => skill.id))
        setSkills(nextSkills)
        setSelectedSkillIDs(selection.skillIDs.filter((skillID) => availableSkillIDs.has(skillID)))
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

    const requestID = ++mcpRequestRef.current
    setIsLoadingMcp(true)

    void Promise.all([getGlobalMcpServers(), getProjectMcpSelection({ projectID })])
      .then(([servers, selection]) => {
        if (mcpRequestRef.current !== requestID) return
        const availableServerIDs = new Set(servers.map((server) => server.id))
        setMcpServers(servers)
        setSelectedMcpServerIDs(selection.serverIDs.filter((serverID) => availableServerIDs.has(serverID)))
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
  const selectedReasoningEffortLabel = resolveComposerReasoningEffortLabel(
    selectedReasoningEffort,
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
    const previousSelection = selectedModel
    setSelectedModel(value)

    if (!sessionID || !updateSessionModelSelection) {
      return
    }

    const saveTask = (async () => {
      try {
        const result = await updateSessionModelSelection({
          sessionID,
          model: value,
        })
        setSelectedModel(result.model ?? null)
        setSmallModel(result.small_model ?? smallModel)
      } catch (error) {
        console.error("[desktop] updateSessionComposerModelSelection failed:", error)
        setSelectedModel(previousSelection)
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
      setSelectedSkillIDs(result.skillIDs.filter((skillID) => availableSkillIDs.has(skillID)))
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
      setSelectedMcpServerIDs(result.serverIDs.filter((serverID) => availableServerIDs.has(serverID)))
    } catch (error) {
      if (mcpSelectionRequestRef.current !== requestID) return
      console.error("[desktop] updateProjectComposerMcpSelection failed:", error)
    }
  }

  function handleReasoningEffortChange(value: OpenAIReasoningEffort | null) {
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
    selectedReasoningEffort,
    selectedReasoningEffortLabel,
    selectedSkillIDs,
    selectedSkillLabel,
    skillOptions,
    unsupportedAttachmentPaths: attachmentPaths.filter(
      (path) => !isComposerAttachmentSupported(path, attachmentCapabilities),
    ),
  }
}
