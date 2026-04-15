import { useEffect, useRef, useState } from "react"
import type {
  ComposerMcpOption,
  ComposerModelOption,
  ComposerSkillOption,
  McpServerSummary,
  ProviderModel,
  SkillInfo,
} from "./types"

interface ComposerAttachmentCapabilities {
  image: boolean
  pdf: boolean
}

type ComposerAttachmentKind = "image" | "pdf" | "unsupported"

const IMAGE_ATTACHMENT_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"])

function getComposerAttachmentKind(path: string): ComposerAttachmentKind {
  const normalizedPath = path.trim().toLowerCase()
  const extension = normalizedPath.split(".").pop() ?? ""
  if (IMAGE_ATTACHMENT_EXTENSIONS.has(extension)) return "image"
  if (extension === "pdf") return "pdf"
  return "unsupported"
}

function toComposerModelValue(model: ProviderModel) {
  return `${model.providerID}/${model.id}`
}

function toComposerModelLabel(model: ProviderModel) {
  return model.name
}

function resolveComposerEffectiveModel(
  selectedModel: string | null,
  models: ProviderModel[],
  defaultModel: ProviderModel | null,
) {
  if (!selectedModel) return defaultModel
  return models.find((model) => toComposerModelValue(model) === selectedModel) ?? defaultModel
}

function getComposerAttachmentCapabilities(model: ProviderModel | null): ComposerAttachmentCapabilities {
  return {
    image: Boolean(model?.capabilities.input.image),
    pdf: Boolean(model?.capabilities.attachment && model?.capabilities.input.pdf),
  }
}

function isComposerAttachmentSupported(path: string, capabilities: ComposerAttachmentCapabilities) {
  const kind = getComposerAttachmentKind(path)
  if (kind === "image") return capabilities.image
  if (kind === "pdf") return capabilities.pdf
  return false
}

function describeComposerAttachmentSupport(capabilities: ComposerAttachmentCapabilities) {
  if (capabilities.image && capabilities.pdf) return "images and PDFs"
  if (capabilities.image) return "images"
  if (capabilities.pdf) return "PDFs"
  return null
}

function getComposerAttachmentDisabledReason(
  model: ProviderModel | null,
  capabilities: ComposerAttachmentCapabilities,
  isLoading: boolean,
) {
  if (describeComposerAttachmentSupport(capabilities)) return null
  if (isLoading) return "Loading model capabilities..."
  if (!model) return "No available model for this project supports image or PDF input."
  return `${model.name} does not support image or PDF input.`
}

function getComposerAttachmentError(
  attachmentPaths: string[],
  model: ProviderModel | null,
  capabilities: ComposerAttachmentCapabilities,
) {
  const unsupportedAttachments = attachmentPaths.filter((path) => !isComposerAttachmentSupported(path, capabilities))
  if (unsupportedAttachments.length === 0) return null

  const unsupportedKinds = new Set(unsupportedAttachments.map((path) => getComposerAttachmentKind(path)))
  if (unsupportedKinds.has("unsupported")) {
    return "Desktop composer attachments currently support images and PDFs only."
  }

  const supportedDescription = describeComposerAttachmentSupport(capabilities)
  if (!supportedDescription) {
    if (!model) return "Attachments are unavailable until a compatible model is available."
    return `${model.name} does not support image or PDF input. Remove attachments or switch models.`
  }

  return `${model?.name ?? "The current model"} only accepts ${supportedDescription}. Remove incompatible attachments or switch models.`
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

export interface UseProjectComposerOptions {
  attachmentPaths: string[]
  projectID: string | null
  refreshToken?: number
}

export function useProjectComposer({ attachmentPaths, projectID, refreshToken = 0 }: UseProjectComposerOptions) {
  const [models, setModels] = useState<ProviderModel[]>([])
  const [defaultModel, setDefaultModel] = useState<ProviderModel | null>(null)
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [smallModel, setSmallModel] = useState<string | null>(null)
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
    if (!projectID || !getProjectModels) {
      setModels([])
      setDefaultModel(null)
      setSelectedModel(null)
      setSmallModel(null)
      setIsLoadingModels(false)
      return
    }

    const requestID = ++modelsRequestRef.current
    setIsLoadingModels(true)

    void getProjectModels({ projectID })
      .then((payload) => {
        if (modelsRequestRef.current !== requestID) return
        setModels(payload.items)
        setDefaultModel(payload.effectiveModel ?? null)
        setSelectedModel(payload.selection?.model ?? null)
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
  }, [projectID, refreshToken])

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

  async function awaitPendingModelSelection() {
    await pendingModelSelectionRef.current?.catch(() => undefined)
  }

  async function handleModelChange(value: string | null) {
    const updateProjectModelSelection = window.desktop?.updateProjectModelSelection
    const previousSelection = selectedModel
    setSelectedModel(value)

    if (!projectID || !updateProjectModelSelection) {
      return
    }

    const saveTask = (async () => {
      try {
        const result = await updateProjectModelSelection({
          projectID,
          model: value,
          small_model: smallModel,
        })
        setSelectedModel(result.model ?? null)
        setSmallModel(result.small_model ?? smallModel)
      } catch (error) {
        console.error("[desktop] updateProjectComposerModelSelection failed:", error)
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

  return {
    attachmentCapabilities,
    attachmentButtonTitle,
    attachmentDisabledReason,
    attachmentError,
    awaitPendingModelSelection,
    contextWindow,
    handleMcpToggle,
    handleModelChange,
    handleSkillToggle,
    mcpOptions,
    modelOptions,
    selectedMcpLabel,
    selectedMcpServerIDs,
    selectedModel,
    selectedModelLabel,
    selectedSkillIDs,
    selectedSkillLabel,
    skillOptions,
    unsupportedAttachmentPaths: attachmentPaths.filter(
      (path) => !isComposerAttachmentSupported(path, attachmentCapabilities),
    ),
  }
}
