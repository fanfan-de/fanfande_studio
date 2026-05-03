import * as Config from "#config/config.ts"
import PROMPT_ANTHROPIC from "../prompt/anthropic.txt"
import PROMPT_BEAST from "../prompt/beast.txt"
import PROMPT_CODEX from "../prompt/codex.txt"
import PROMPT_DEFAULT from "../prompt/default.txt"
import PROMPT_GEMINI from "../prompt/gemini.txt"
import PROMPT_GPT from "../prompt/gpt.txt"
import PROMPT_KIMI from "../prompt/kimi.txt"
import PROMPT_PLAN_REMINDER_ANTHROPIC from "../prompt/plan-reminder-anthropic.txt"
import PROMPT_PLAN from "../prompt/plan.txt"
import PROMPT_SIDE_CHAT from "../prompt/side-chat.txt"
import PROMPT_TRINITY from "../prompt/trinity.txt"

export type PromptPresetSource = "bundled" | "custom"
export type PromptPresetTarget = "system" | "plan" | "side-chat"

export interface PromptPresetSelection {
  systemPromptPresetID: string
  planModePromptPresetID: string
  sideChatPromptPresetID: string
}

export interface PromptPresetSummary {
  id: string
  label: string
  description: string
  source: PromptPresetSource
  editable: boolean
  hasOverride: boolean
  sourcePath?: string
}

export interface PromptPresetDocument extends PromptPresetSummary {
  content: string
}

export interface PromptPresetCreateInput {
  label?: string
  content?: string
  description?: string
}

export interface PromptPresetUpdateInput {
  label?: string
  content: string
  description?: string
}

interface PromptPresetDefinition {
  id: string
  label: string
  description: string
  sourcePath: string
  bundledContent: string
}

const DEFAULT_PROMPT_PRESET_SELECTION: PromptPresetSelection = {
  systemPromptPresetID: "system-default",
  planModePromptPresetID: "plan-mode",
  sideChatPromptPresetID: "side-chat",
}

const PROMPT_PRESET_DEFINITIONS: PromptPresetDefinition[] = [
  {
    id: "system-default",
    label: "System Prompt",
    description: "Base instructions applied to every session turn.",
    sourcePath: "src/session/prompt/default.txt",
    bundledContent: PROMPT_DEFAULT,
  },
  {
    id: "plan-mode",
    label: "Plan Mode Prompt",
    description: "Additional instructions appended when the plan agent is active.",
    sourcePath: "src/session/prompt/plan.txt",
    bundledContent: PROMPT_PLAN,
  },
  {
    id: "side-chat",
    label: "Side Chat Prompt",
    description: "Additional instructions appended when a side chat session is active.",
    sourcePath: "src/session/prompt/side-chat.txt",
    bundledContent: PROMPT_SIDE_CHAT,
  },
  {
    id: "provider-anthropic",
    label: "Anthropic Provider Prompt",
    description: "Reserved provider-specific prompt for Anthropic models.",
    sourcePath: "src/session/prompt/anthropic.txt",
    bundledContent: PROMPT_ANTHROPIC,
  },
  {
    id: "provider-beast",
    label: "Beast Provider Prompt",
    description: "Reserved provider-specific prompt for Beast-style model routing.",
    sourcePath: "src/session/prompt/beast.txt",
    bundledContent: PROMPT_BEAST,
  },
  {
    id: "provider-gemini",
    label: "Gemini Provider Prompt",
    description: "Reserved provider-specific prompt for Gemini models.",
    sourcePath: "src/session/prompt/gemini.txt",
    bundledContent: PROMPT_GEMINI,
  },
  {
    id: "provider-gpt",
    label: "GPT Provider Prompt",
    description: "Reserved provider-specific prompt for GPT-family models.",
    sourcePath: "src/session/prompt/gpt.txt",
    bundledContent: PROMPT_GPT,
  },
  {
    id: "provider-kimi",
    label: "Kimi Provider Prompt",
    description: "Reserved provider-specific prompt for Kimi models.",
    sourcePath: "src/session/prompt/kimi.txt",
    bundledContent: PROMPT_KIMI,
  },
  {
    id: "provider-codex",
    label: "Codex Provider Prompt",
    description: "Reserved provider-specific prompt for Codex models.",
    sourcePath: "src/session/prompt/codex.txt",
    bundledContent: PROMPT_CODEX,
  },
  {
    id: "provider-trinity",
    label: "Trinity Provider Prompt",
    description: "Reserved provider-specific prompt for Trinity models.",
    sourcePath: "src/session/prompt/trinity.txt",
    bundledContent: PROMPT_TRINITY,
  },
  {
    id: "helper-plan-reminder-anthropic",
    label: "Anthropic Plan Reminder",
    description: "Helper prompt reserved for provider-specific planning reminders.",
    sourcePath: "src/session/prompt/plan-reminder-anthropic.txt",
    bundledContent: PROMPT_PLAN_REMINDER_ANTHROPIC,
  },
]

function getPromptPresetDefinition(presetID: string) {
  const normalizedPresetID = presetID.trim()
  return PROMPT_PRESET_DEFINITIONS.find((preset) => preset.id === normalizedPresetID)
}

function requirePromptPresetDefinition(presetID: string) {
  const preset = getPromptPresetDefinition(presetID)
  if (!preset) {
    throw new Error(`Unknown prompt preset '${presetID}'.`)
  }

  return preset
}

function hasPromptOverride(overrides: Record<string, string>, presetID: string) {
  return Object.prototype.hasOwnProperty.call(overrides, presetID)
}

function toPromptPresetSummary(
  preset: PromptPresetDefinition,
  overrides: Record<string, string>,
): PromptPresetSummary {
  return {
    id: preset.id,
    label: preset.label,
    description: preset.description,
    source: "bundled",
    editable: true,
    hasOverride: hasPromptOverride(overrides, preset.id),
    sourcePath: preset.sourcePath,
  }
}

function toCustomPromptPresetSummary(
  presetID: string,
  preset: Config.CustomPromptPreset,
): PromptPresetSummary {
  return {
    id: presetID,
    label: preset.label,
    description: preset.description ?? "Custom prompt preset.",
    source: "custom",
    editable: true,
    hasOverride: false,
  }
}

function normalizePromptPresetSelectionValue(
  presetID: string | undefined | null,
  availablePresetIDs: Set<string>,
  fallbackPresetID: string,
) {
  const normalizedPresetID = presetID?.trim()
  if (normalizedPresetID && availablePresetIDs.has(normalizedPresetID)) {
    return normalizedPresetID
  }

  return fallbackPresetID
}

function sanitizePromptPresetDescription(description: string | undefined) {
  return description?.trim() || undefined
}

function sanitizePromptPresetLabel(label: string | undefined) {
  return label?.trim() || ""
}

function slugifyPromptPresetLabel(label: string) {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return slug || "preset"
}

function createCustomPromptPresetID(label: string, existingPresetIDs: Set<string>) {
  const baseID = `custom-${slugifyPromptPresetLabel(label)}`
  let candidateID = baseID
  let suffix = 2

  while (existingPresetIDs.has(candidateID)) {
    candidateID = `${baseID}-${suffix}`
    suffix += 1
  }

  return candidateID
}

async function getCustomPromptPresetRecords(configID = Config.GLOBAL_CONFIG_ID) {
  const customPromptPresets = await Config.getCustomPromptPresets(configID)

  return Object.fromEntries(
    Object.entries(customPromptPresets).filter(([presetID]) => !getPromptPresetDefinition(presetID)),
  )
}

async function listAvailablePromptPresetIDs(configID = Config.GLOBAL_CONFIG_ID) {
  const customPromptPresets = await getCustomPromptPresetRecords(configID)
  return new Set<string>([
    ...PROMPT_PRESET_DEFINITIONS.map((preset) => preset.id),
    ...Object.keys(customPromptPresets),
  ])
}

async function persistPromptPresetSelection(
  selection: PromptPresetSelection,
  configID = Config.GLOBAL_CONFIG_ID,
) {
  await Config.setSelectedPromptPresetIDs(configID, selection)
  return selection
}

export function getBundledPromptPresetContent(presetID: string) {
  return requirePromptPresetDefinition(presetID).bundledContent
}

export async function getResolvedPromptPresetContent(
  presetID: string,
  configID = Config.GLOBAL_CONFIG_ID,
) {
  const preset = getPromptPresetDefinition(presetID)
  if (preset) {
    const overrides = await Config.getPromptOverrides(configID)
    return hasPromptOverride(overrides, preset.id) ? overrides[preset.id] : preset.bundledContent
  }

  const customPromptPresets = await getCustomPromptPresetRecords(configID)
  const customPromptPreset = customPromptPresets[presetID.trim()]
  if (!customPromptPreset) {
    throw new Error(`Unknown prompt preset '${presetID}'.`)
  }

  return customPromptPreset.content
}

export async function getPromptPresetSelection(
  configID = Config.GLOBAL_CONFIG_ID,
): Promise<PromptPresetSelection> {
  const [
    availablePresetIDs,
    selectedSystemPromptPresetID,
    selectedPlanModePromptPresetID,
    selectedSideChatPromptPresetID,
  ] = await Promise.all([
    listAvailablePromptPresetIDs(configID),
    Config.getSelectedSystemPromptPresetID(configID),
    Config.getSelectedPlanModePromptPresetID(configID),
    Config.getSelectedSideChatPromptPresetID(configID),
  ])

  return {
    systemPromptPresetID: normalizePromptPresetSelectionValue(
      selectedSystemPromptPresetID,
      availablePresetIDs,
      DEFAULT_PROMPT_PRESET_SELECTION.systemPromptPresetID,
    ),
    planModePromptPresetID: normalizePromptPresetSelectionValue(
      selectedPlanModePromptPresetID,
      availablePresetIDs,
      DEFAULT_PROMPT_PRESET_SELECTION.planModePromptPresetID,
    ),
    sideChatPromptPresetID: normalizePromptPresetSelectionValue(
      selectedSideChatPromptPresetID,
      availablePresetIDs,
      DEFAULT_PROMPT_PRESET_SELECTION.sideChatPromptPresetID,
    ),
  }
}

export async function updatePromptPresetSelection(
  selection: PromptPresetSelection,
  configID = Config.GLOBAL_CONFIG_ID,
) {
  const availablePresetIDs = await listAvailablePromptPresetIDs(configID)
  const normalizedSelection: PromptPresetSelection = {
    systemPromptPresetID: selection.systemPromptPresetID.trim(),
    planModePromptPresetID: selection.planModePromptPresetID.trim(),
    sideChatPromptPresetID: selection.sideChatPromptPresetID.trim(),
  }

  if (!availablePresetIDs.has(normalizedSelection.systemPromptPresetID)) {
    throw new Error(`Unknown prompt preset '${selection.systemPromptPresetID}'.`)
  }

  if (!availablePresetIDs.has(normalizedSelection.planModePromptPresetID)) {
    throw new Error(`Unknown prompt preset '${selection.planModePromptPresetID}'.`)
  }

  if (!availablePresetIDs.has(normalizedSelection.sideChatPromptPresetID)) {
    throw new Error(`Unknown prompt preset '${selection.sideChatPromptPresetID}'.`)
  }

  return persistPromptPresetSelection(normalizedSelection, configID)
}

export async function listPromptPresetSummaries(
  configID = Config.GLOBAL_CONFIG_ID,
): Promise<PromptPresetSummary[]> {
  const [overrides, customPromptPresets] = await Promise.all([
    Config.getPromptOverrides(configID),
    getCustomPromptPresetRecords(configID),
  ])
  const bundledPromptPresets = PROMPT_PRESET_DEFINITIONS.map((preset) =>
    toPromptPresetSummary(preset, overrides),
  )
  const customPromptPresetSummaries = Object.entries(customPromptPresets)
    .map(([presetID, preset]) => toCustomPromptPresetSummary(presetID, preset))
    .sort((left, right) => left.label.localeCompare(right.label))

  return [...bundledPromptPresets, ...customPromptPresetSummaries]
}

export async function readPromptPresetDocument(
  presetID: string,
  configID = Config.GLOBAL_CONFIG_ID,
): Promise<PromptPresetDocument> {
  const preset = getPromptPresetDefinition(presetID)
  if (preset) {
    const overrides = await Config.getPromptOverrides(configID)

    return {
      ...toPromptPresetSummary(preset, overrides),
      content: hasPromptOverride(overrides, preset.id) ? (overrides[preset.id] ?? "") : preset.bundledContent,
    }
  }

  const customPromptPresets = await getCustomPromptPresetRecords(configID)
  const customPromptPreset = customPromptPresets[presetID.trim()]
  if (!customPromptPreset) {
    throw new Error(`Unknown prompt preset '${presetID}'.`)
  }

  return {
    ...toCustomPromptPresetSummary(presetID.trim(), customPromptPreset),
    content: customPromptPreset.content,
  }
}

export async function createPromptPreset(
  input: PromptPresetCreateInput,
  configID = Config.GLOBAL_CONFIG_ID,
) {
  const label = sanitizePromptPresetLabel(input.label) || "Untitled preset"
  const existingPresetIDs = await listAvailablePromptPresetIDs(configID)
  const presetID = createCustomPromptPresetID(label, existingPresetIDs)
  await Config.setCustomPromptPreset(configID, presetID, {
    label,
    content: input.content ?? "",
    description: sanitizePromptPresetDescription(input.description),
  })

  return readPromptPresetDocument(presetID, configID)
}

export async function updatePromptPreset(
  presetID: string,
  input: PromptPresetUpdateInput,
  configID = Config.GLOBAL_CONFIG_ID,
) {
  const bundledPreset = getPromptPresetDefinition(presetID)
  if (bundledPreset) {
    await Config.setPromptOverride(configID, bundledPreset.id, input.content)
    return readPromptPresetDocument(bundledPreset.id, configID)
  }

  const customPromptPresets = await getCustomPromptPresetRecords(configID)
  const customPromptPreset = customPromptPresets[presetID.trim()]
  if (!customPromptPreset) {
    throw new Error(`Unknown prompt preset '${presetID}'.`)
  }

  const label = sanitizePromptPresetLabel(input.label) || customPromptPreset.label
  await Config.setCustomPromptPreset(configID, presetID, {
    label,
    content: input.content,
    description: sanitizePromptPresetDescription(input.description) ?? customPromptPreset.description,
  })

  return readPromptPresetDocument(presetID, configID)
}

export async function resetPromptPreset(
  presetID: string,
  configID = Config.GLOBAL_CONFIG_ID,
) {
  const preset = getPromptPresetDefinition(presetID)
  if (!preset) {
    throw new Error(`Prompt preset '${presetID}' cannot be reset.`)
  }

  await Config.clearPromptOverride(configID, preset.id)
  return readPromptPresetDocument(preset.id, configID)
}

export async function deletePromptPreset(
  presetID: string,
  configID = Config.GLOBAL_CONFIG_ID,
) {
  if (getPromptPresetDefinition(presetID)) {
    throw new Error(`Prompt preset '${presetID}' cannot be deleted.`)
  }

  const customPromptPresets = await getCustomPromptPresetRecords(configID)
  if (!customPromptPresets[presetID.trim()]) {
    throw new Error(`Unknown prompt preset '${presetID}'.`)
  }

  await Config.removeCustomPromptPreset(configID, presetID)
  const resolvedSelection = await getPromptPresetSelection(configID)
  const nextSelection: PromptPresetSelection = {
    systemPromptPresetID:
      resolvedSelection.systemPromptPresetID === presetID
        ? DEFAULT_PROMPT_PRESET_SELECTION.systemPromptPresetID
        : resolvedSelection.systemPromptPresetID,
    planModePromptPresetID:
      resolvedSelection.planModePromptPresetID === presetID
        ? DEFAULT_PROMPT_PRESET_SELECTION.planModePromptPresetID
        : resolvedSelection.planModePromptPresetID,
    sideChatPromptPresetID:
      resolvedSelection.sideChatPromptPresetID === presetID
        ? DEFAULT_PROMPT_PRESET_SELECTION.sideChatPromptPresetID
        : resolvedSelection.sideChatPromptPresetID,
  }

  return persistPromptPresetSelection(nextSelection, configID)
}
