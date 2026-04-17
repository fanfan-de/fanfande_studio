import { generateText } from "ai"
import * as Config from "#config/config.ts"
import { Flag } from "#flag/flag.ts"
import * as Log from "#util/log.ts"
import * as Message from "#session/message.ts"
import * as Provider from "#provider/provider.ts"
import * as SessionMemory from "#session/memory-store.ts"
import { Instance } from "#project/instance.ts"

const log = Log.create({ service: "session.context-window" })

const DEFAULT_CONTEXT_LIMIT = 128_000
const DEFAULT_OUTPUT_LIMIT = 8_192
const RESERVED_OUTPUT_MIN = 2_048
const RESERVED_OUTPUT_MAX = 16_384
const DEFAULT_SOFT_RATIO = 0.72
const DEFAULT_HARD_RATIO = 0.82
const MAX_COMPACTION_ATTEMPTS = 4
const RECENT_TURNS_TO_KEEP = 6
const MIN_TURNS_TO_KEEP = 2
const MAX_COMPACTION_BATCH_TOKENS = 12_000
const PRUNED_TOOL_OUTPUT_CHARS = 1_200
const EMERGENCY_TOOL_OUTPUT_CHARS = 320
const MEMORY_BLOCK_MAX_CHARS = 10_000
const MEMORY_BLOCK_MIN_CHARS = 1_500

type SessionTurn = {
  messages: Message.WithParts[]
  userMessageID: string
  lastMessageID: string
}

type PromptBudget = {
  maxPromptTokens: number
  softThreshold: number
  hardThreshold: number
  reservedOutputTokens: number
  maxCompactionBatchTokens: number
}

type BuiltPromptWindow = {
  system: string[]
  messages: Message.WithParts[]
  estimatedTokens: number
  budget: PromptBudget
}

type SummaryGenerator = (input: {
  existingSummary?: string
  transcript: string
  model: Provider.Model
}) => Promise<string>

export type PreparedPromptContext = {
  system: string[]
  messages: Message.WithParts[]
  memory: SessionMemory.SessionMemoryRecord | null
  estimatedTokens: number
  budget: PromptBudget
}

export async function preparePromptContext(input: {
  sessionID: string
  model: Provider.Model
  system: string[]
  messages: Message.WithParts[]
  generateSummary?: SummaryGenerator
}): Promise<PreparedPromptContext> {
  const autoCompact = await isAutoCompactionEnabled()
  let memory = SessionMemory.readSessionMemory(input.sessionID) ?? null
  const summaryGenerator = input.generateSummary ?? generateCompactionSummary

  for (let attempt = 0; autoCompact && attempt < MAX_COMPACTION_ATTEMPTS; attempt += 1) {
    const window = buildPromptWindow({
      system: input.system,
      messages: input.messages,
      memory,
      model: input.model,
      allowTurnDropping: false,
    })

    if (window.estimatedTokens <= window.budget.softThreshold) {
      return {
        system: window.system,
        messages: window.messages,
        memory,
        estimatedTokens: window.estimatedTokens,
        budget: window.budget,
      }
    }

    const turns = turnsAfterWatermark(input.messages, memory?.watermarkMessageID)
    const selectedTurns = selectTurnsForCompaction(turns, window.budget)
    if (selectedTurns.length === 0) {
      return {
        system: window.system,
        messages: window.messages,
        memory,
        estimatedTokens: window.estimatedTokens,
        budget: window.budget,
      }
    }

    const compactionModel = await resolveCompactionModel(input.model)
    const nextMemory = await compactTurns({
      sessionID: input.sessionID,
      existing: memory,
      turns: selectedTurns,
      model: compactionModel,
      generateSummary: summaryGenerator,
    })

    SessionMemory.upsertSessionMemory(nextMemory)
    memory = nextMemory

    log.info("session memory compacted", {
      sessionID: input.sessionID,
      watermarkMessageID: nextMemory.watermarkMessageID,
      turnCount: nextMemory.turnCount,
      estimatedTokens: nextMemory.estimatedTokens,
    })
  }

  const window = buildPromptWindow({
    system: input.system,
    messages: input.messages,
    memory,
    model: input.model,
  })

  return {
    system: window.system,
    messages: window.messages,
    memory,
    estimatedTokens: window.estimatedTokens,
    budget: window.budget,
  }
}

function buildPromptWindow(input: {
  system: string[]
  messages: Message.WithParts[]
  memory: SessionMemory.SessionMemoryRecord | null
  model: Provider.Model
  allowTurnDropping?: boolean
}): BuiltPromptWindow {
  const budget = resolvePromptBudget(input.model)
  const rawTurns = turnsAfterWatermark(input.messages, input.memory?.watermarkMessageID)
  let activeTurns = rawTurns
  let activeMessages = flattenTurns(activeTurns)
  let system = appendMemoryBlock(input.system, input.memory?.summaryText)
  let estimatedTokens = estimatePromptTokens(system, activeMessages)

  if (estimatedTokens > budget.hardThreshold) {
    activeMessages = pruneToolOutputsInMessages(activeMessages, PRUNED_TOOL_OUTPUT_CHARS)
    estimatedTokens = estimatePromptTokens(system, activeMessages)
  }

  if (estimatedTokens > budget.hardThreshold) {
    activeMessages = pruneToolOutputsInMessages(activeMessages, EMERGENCY_TOOL_OUTPUT_CHARS)
    estimatedTokens = estimatePromptTokens(system, activeMessages)
  }

  if (input.allowTurnDropping !== false && estimatedTokens > budget.hardThreshold && activeTurns.length > 0) {
    const minimumTurnsToKeep = Math.min(MIN_TURNS_TO_KEEP, activeTurns.length)
    while (activeTurns.length > minimumTurnsToKeep && estimatedTokens > budget.hardThreshold) {
      activeTurns = activeTurns.slice(1)
      activeMessages = flattenTurns(activeTurns)
      activeMessages = pruneToolOutputsInMessages(activeMessages, EMERGENCY_TOOL_OUTPUT_CHARS)
      estimatedTokens = estimatePromptTokens(system, activeMessages)
    }
  }

  if (estimatedTokens > budget.hardThreshold && input.memory?.summaryText) {
    const shrunkSummary = shrinkSummaryText({
      baseSystem: input.system,
      messages: activeMessages,
      summaryText: input.memory.summaryText,
      budget,
    })
    system = appendMemoryBlock(input.system, shrunkSummary)
    estimatedTokens = estimatePromptTokens(system, activeMessages)
  }

  return {
    system,
    messages: activeMessages,
    estimatedTokens,
    budget,
  }
}

function appendMemoryBlock(system: string[], summaryText?: string) {
  if (!summaryText?.trim()) return [...system]
  return [
    ...system,
    [
      "<session_memory>",
      "The following block is a rolling summary of earlier session history.",
      "Treat it as durable memory for messages that are no longer replayed verbatim.",
      summaryText.trim(),
      "</session_memory>",
    ].join("\n"),
  ]
}

function resolvePromptBudget(model: Provider.Model): PromptBudget {
  const contextLimit = positiveInteger(model?.limit?.context) ?? DEFAULT_CONTEXT_LIMIT
  const modelOutputLimit = positiveInteger(model?.limit?.output) ?? DEFAULT_OUTPUT_LIMIT
  const modelInputLimit = positiveInteger(model?.limit?.input)
  const reservedOutputTokens = clamp(
    Math.min(modelOutputLimit, Math.floor(contextLimit * 0.2)),
    RESERVED_OUTPUT_MIN,
    RESERVED_OUTPUT_MAX,
  )

  const inputCap = modelInputLimit ?? Math.max(256, contextLimit - reservedOutputTokens)
  const maxPromptTokens = Math.max(256, Math.min(inputCap, contextLimit - Math.floor(reservedOutputTokens / 2)))
  const hardThreshold = Math.max(128, Math.floor(maxPromptTokens * DEFAULT_HARD_RATIO))
  const softThreshold = Math.max(128, Math.floor(maxPromptTokens * DEFAULT_SOFT_RATIO))

  return {
    maxPromptTokens,
    softThreshold,
    hardThreshold,
    reservedOutputTokens,
    maxCompactionBatchTokens: Math.min(MAX_COMPACTION_BATCH_TOKENS, Math.floor(maxPromptTokens * 0.4)),
  }
}

async function isAutoCompactionEnabled() {
  if (Flag.FanFande_DISABLE_AUTOCOMPACT) return false
  const config = await Config.get(Instance.project.id).catch(() => undefined)
  return config?.compaction?.auto !== false
}

async function compactTurns(input: {
  sessionID: string
  existing: SessionMemory.SessionMemoryRecord | null
  turns: SessionTurn[]
  model: Provider.Model
  generateSummary: SummaryGenerator
}) {
  const transcript = renderTurnsForSummary(input.turns)
  const summaryText = await input.generateSummary({
    existingSummary: input.existing?.summaryText,
    transcript,
    model: input.model,
  })

  const watermarkMessageID = input.turns[input.turns.length - 1]!.lastMessageID
  const turnCount = (input.existing?.turnCount ?? 0) + input.turns.length
  const normalizedSummaryText = summaryText.trim().slice(0, MEMORY_BLOCK_MAX_CHARS * 2)

  return SessionMemory.SessionMemoryRecord.parse({
    sessionID: input.sessionID,
    watermarkMessageID,
    summaryText: normalizedSummaryText,
    estimatedTokens: estimateStringTokens(normalizedSummaryText),
    turnCount,
    updatedAt: Date.now(),
    modelProviderID: input.model.providerID,
    modelID: input.model.id,
  })
}

async function generateCompactionSummary(input: {
  existingSummary?: string
  transcript: string
  model: Provider.Model
}) {
  try {
    const languageModel = await Provider.getLanguage(input.model, Instance.project.id)
    const result = await generateText({
      model: languageModel,
      temperature: 0,
      system: [
        "You compress coding-agent conversation history into durable session memory.",
        "Keep only facts that matter for continuing the task.",
        "Preserve goals, repository state, important files, decisions, errors, tool outcomes, and the next likely steps.",
        "Do not mention that content was omitted. Do not invent facts.",
        "Write concise Markdown with these headings only:",
        "## Goal",
        "## Current State",
        "## Important Files",
        "## Decisions",
        "## Open Issues",
        "## Next Useful Context",
      ].join("\n"),
      prompt: [
        input.existingSummary?.trim()
          ? `Existing memory:\n${input.existingSummary.trim()}`
          : "Existing memory:\n(none)",
        `New transcript to merge:\n${input.transcript}`,
      ].join("\n\n"),
    })

    if (result.text.trim()) return result.text.trim()
  } catch (error) {
    log.warn("llm compaction failed, using fallback summary", {
      providerID: input.model.providerID,
      modelID: input.model.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return buildFallbackSummary(input.existingSummary, input.transcript)
}

function buildFallbackSummary(existingSummary: string | undefined, transcript: string) {
  const existing = existingSummary?.trim()
  const transcriptExcerpt = transcript.trim().slice(0, MEMORY_BLOCK_MAX_CHARS)
  return [
    "## Goal",
    existing ? "Continue the existing task based on the prior memory below." : "Continue the active coding task.",
    "",
    "## Current State",
    existing ? existing.slice(0, Math.floor(MEMORY_BLOCK_MAX_CHARS / 2)) : "(no prior summary)",
    "",
    "## Important Files",
    "- Review the compacted transcript excerpt below when reconstructing file context.",
    "",
    "## Decisions",
    "- Use the preserved summary plus the latest raw turns as the source of truth.",
    "",
    "## Open Issues",
    "- Some detail may have been compacted from earlier turns.",
    "",
    "## Next Useful Context",
    transcriptExcerpt || "(empty transcript)",
  ].join("\n")
}

async function resolveCompactionModel(fallbackModel: Provider.Model) {
  try {
    const selection = await Provider.getSelection(Instance.project.id)
    const reference = parseModelReference(selection.small_model)
    if (!reference) return fallbackModel
    return await Provider.getModel(reference.providerID, reference.modelID, Instance.project.id)
  } catch {
    return fallbackModel
  }
}

function parseModelReference(value?: string) {
  if (!value) return
  const [providerID, ...rest] = value.split("/")
  const modelID = rest.join("/")
  if (!providerID || !modelID) return
  return {
    providerID,
    modelID,
  }
}

function partitionTurns(messages: Message.WithParts[]) {
  const turns: SessionTurn[] = []
  let current: SessionTurn | undefined

  for (const message of messages) {
    if (message.info.role === "user") {
      if (current) turns.push(current)
      current = {
        messages: [message],
        userMessageID: message.info.id,
        lastMessageID: message.info.id,
      }
      continue
    }

    if (!current) continue
    current.messages.push(message)
    current.lastMessageID = message.info.id
  }

  if (current) turns.push(current)
  return turns
}

function turnsAfterWatermark(messages: Message.WithParts[], watermarkMessageID?: string) {
  const turns = partitionTurns(messages)
  if (!watermarkMessageID) return turns

  return turns.filter((turn) => turn.userMessageID > watermarkMessageID)
}

function selectTurnsForCompaction(turns: SessionTurn[], budget: PromptBudget) {
  const compactableCount = Math.max(0, turns.length - RECENT_TURNS_TO_KEEP)
  if (compactableCount === 0) return []

  const compactableTurns = turns.slice(0, compactableCount)
  const selected: SessionTurn[] = []
  let accumulatedTokens = 0

  for (const turn of compactableTurns) {
    const turnTokens = estimateMessagesTokens(turn.messages)
    if (
      selected.length > 0 &&
      accumulatedTokens + turnTokens > budget.maxCompactionBatchTokens
    ) {
      break
    }

    selected.push(turn)
    accumulatedTokens += turnTokens
  }

  return selected.length > 0 ? selected : compactableTurns.slice(0, 1)
}

function flattenTurns(turns: SessionTurn[]) {
  return turns.flatMap((turn) => turn.messages)
}

function renderTurnsForSummary(turns: SessionTurn[]) {
  return turns
    .map((turn, index) => {
      const renderedMessages = turn.messages.map(renderMessageForSummary).join("\n")
      return [`[Turn ${index + 1}]`, renderedMessages].join("\n")
    })
    .join("\n\n")
}

function renderMessageForSummary(message: Message.WithParts) {
  const role = message.info.role.toUpperCase()
  const parts = message.parts
    .map((part) => renderPartForSummary(part))
    .filter(Boolean)
    .join("\n")

  return `${role} ${message.info.id}\n${parts}`.trim()
}

function renderPartForSummary(part: Message.Part) {
  switch (part.type) {
    case "text":
      return `- text: ${truncateInline(part.text, 800)}`
    case "source-url":
      return `- source: ${part.title ?? part.url}`
    case "source-document":
      return `- source document: ${part.title}${part.filename ? ` (${part.filename})` : ""}`
    case "file":
      return `- file: ${part.filename ?? part.url} (${part.mime})`
    case "image":
      return `- image: ${part.filename ?? part.url} (${part.mime})`
    case "subtask":
      return `- subtask: ${truncateInline(part.description, 400)}`
    case "patch":
      return `- patch: ${part.files.join(", ")}`
    case "tool":
      return renderToolPartForSummary(part)
    default:
      return ""
  }
}

function renderToolPartForSummary(part: Message.ToolPart) {
  const state = part.state
  if (state.status === "completed") {
    return `- tool ${part.tool} completed: ${truncateInline(state.output, 1_000)}`
  }
  if (state.status === "error") {
    return `- tool ${part.tool} error: ${truncateInline(state.error, 600)}`
  }
  if (state.status === "denied") {
    return `- tool ${part.tool} denied: ${truncateInline(state.reason, 300)}`
  }
  if (state.status === "waiting-approval") {
    return `- tool ${part.tool} waiting for approval`
  }
  return `- tool ${part.tool} pending`
}

function pruneToolOutputsInMessages(messages: Message.WithParts[], maxChars: number) {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) => prunePartForContext(part, maxChars)),
  }))
}

function prunePartForContext(part: Message.Part, maxChars: number): Message.Part {
  if (part.type !== "tool") return part

  const state = part.state
  if (state.status === "completed") {
    const output = truncateText(state.output, maxChars)
    return {
      ...part,
      state: {
        ...state,
        output,
        modelOutput: undefined,
        metadata: {
          ...(state.metadata ?? {}),
          truncatedForContext: output !== state.output,
        },
      },
    }
  }

  if (state.status === "error") {
    return {
      ...part,
      state: {
        ...state,
        error: truncateText(state.error, maxChars),
      },
    }
  }

  if (state.status === "denied") {
    return {
      ...part,
      state: {
        ...state,
        reason: truncateText(state.reason, maxChars),
      },
    }
  }

  return part
}

function shrinkSummaryText(input: {
  baseSystem: string[]
  messages: Message.WithParts[]
  summaryText: string
  budget: PromptBudget
}) {
  let summaryText = input.summaryText
  let system = appendMemoryBlock(input.baseSystem, summaryText)
  let estimatedTokens = estimatePromptTokens(system, input.messages)

  while (summaryText.length > MEMORY_BLOCK_MIN_CHARS && estimatedTokens > input.budget.hardThreshold) {
    const nextLength = Math.max(MEMORY_BLOCK_MIN_CHARS, Math.floor(summaryText.length * 0.85))
    summaryText = truncateText(summaryText, nextLength)
    system = appendMemoryBlock(input.baseSystem, summaryText)
    estimatedTokens = estimatePromptTokens(system, input.messages)
  }

  return summaryText
}

function estimatePromptTokens(system: string[], messages: Message.WithParts[]) {
  const systemTokens = system.reduce((total, item) => total + estimateStringTokens(item) + 8, 0)
  return systemTokens + estimateMessagesTokens(messages)
}

function estimateMessagesTokens(messages: Message.WithParts[]) {
  return messages.reduce((total, message) => total + estimateMessageTokens(message), 0)
}

function estimateMessageTokens(message: Message.WithParts) {
  const roleOverhead = message.info.role === "assistant" ? 10 : 8
  return roleOverhead + message.parts.reduce((total, part) => total + estimatePartTokens(part), 0)
}

function estimatePartTokens(part: Message.Part): number {
  switch (part.type) {
    case "text":
      return estimateStringTokens(part.text) + 4
    case "reasoning":
      return 0
    case "source-url":
      return estimateStringTokens(part.title ?? part.url) + 12
    case "source-document":
      return estimateStringTokens(part.title) + estimateStringTokens(part.filename ?? "") + 14
    case "file":
      return 700
    case "image":
      return 900
    case "patch":
      return estimateStringTokens(part.files.join(", ")) + 12
    case "subtask":
      return estimateStringTokens(part.prompt) + estimateStringTokens(part.description) + 12
    case "tool":
      return estimateToolPartTokens(part)
    default:
      return 6
  }
}

function estimateToolPartTokens(part: Message.ToolPart) {
  const state = part.state
  const inputTokens = estimateStringTokens(safeStringify(state.input))

  switch (state.status) {
    case "completed":
      return inputTokens + estimateStringTokens(state.output) + 24
    case "error":
      return inputTokens + estimateStringTokens(state.error) + 16
    case "denied":
      return inputTokens + estimateStringTokens(state.reason) + 16
    case "waiting-approval":
      return inputTokens + 16
    default:
      return inputTokens + 12
  }
}

function estimateStringTokens(value: string) {
  if (!value) return 0
  return Math.ceil(value.length / 4)
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value) ?? ""
  } catch {
    return String(value)
  }
}

function truncateInline(value: string, maxChars: number) {
  return truncateText(value.replace(/\s+/g, " ").trim(), maxChars)
}

function truncateText(value: string, maxChars: number) {
  if (value.length <= maxChars) return value
  const head = Math.max(64, Math.floor(maxChars * 0.65))
  const tail = Math.max(32, maxChars - head - 24)
  return `${value.slice(0, head)}\n...[truncated]...\n${value.slice(-tail)}`
}

function positiveInteger(value: unknown) {
  if (typeof value !== "number") return undefined
  if (!Number.isFinite(value) || value <= 0) return undefined
  return Math.floor(value)
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
