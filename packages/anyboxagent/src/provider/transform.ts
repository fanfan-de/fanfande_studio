import type { Model } from "#provider/provider.ts"
import * as Log from "#util/log.ts"
import {
  getSupportedReasoningEfforts,
  normalizeReasoningEffort as normalizeSharedReasoningEffort,
  supportsReasoningEffort,
  type ReasoningEffort,
} from "@anybox/shared"

const log = Log.create({ service: "provider.transform" })

const OPENAI_PROVIDER_ID = "openai"
const DEEPSEEK_PROVIDER_ID = "deepseek"
const OPENAI_CODEX_API_SEGMENT = "/backend-api/codex"

export function isOpenAICodexModel(model: Model) {
  return model.providerID === OPENAI_PROVIDER_ID && model.api.url.includes(OPENAI_CODEX_API_SEGMENT)
}

export function isOpenAIReasoningModel(model: Model) {
  return model.providerID === OPENAI_PROVIDER_ID && model.capabilities.reasoning
}

export function isDeepSeekReasoningModel(model: Model) {
  return model.providerID === DEEPSEEK_PROVIDER_ID && model.capabilities.reasoning
}

export function isProviderReasoningModel(model: Model) {
  return supportsReasoningEffort(toReasoningProfile(model))
}

function toReasoningProfile(model: Model) {
  return {
    providerID: model.providerID,
    modelID: model.id,
    reasoning: model.capabilities.reasoning,
  }
}

function normalizeReasoningEffort(model: Model, reasoningEffort?: ReasoningEffort) {
  if (!reasoningEffort || !isProviderReasoningModel(model)) return undefined

  const profile = toReasoningProfile(model)
  const normalized = normalizeSharedReasoningEffort({ ...profile, reasoningEffort })
  if (normalized) return normalized

  log.warn("ignoring unsupported provider reasoning effort", {
    modelID: model.id,
    providerID: model.providerID,
    reasoningEffort,
    supported: getSupportedReasoningEfforts(profile),
  })
  return undefined
}

function buildOpenAIProviderOptions(input: {
  model: Model
  systemPrompt: string
  reasoningEffort?: ReasoningEffort
}) {
  if (input.model.providerID !== OPENAI_PROVIDER_ID) return undefined

  const reasoningEffort = normalizeReasoningEffort(input.model, input.reasoningEffort)
  const isOpenAICodex = isOpenAICodexModel(input.model)
  const isOpenAIReasoning = isOpenAIReasoningModel(input.model)
  const options = {
    ...(isOpenAICodex
      ? {
          store: false,
          ...(input.systemPrompt
            ? {
                instructions: input.systemPrompt,
              }
            : {}),
        }
      : {}),
    ...(reasoningEffort
      ? {
          reasoningEffort,
        }
      : {}),
    ...(isOpenAIReasoning && reasoningEffort && reasoningEffort !== "none"
      ? {
          reasoningSummary: "auto",
        }
      : {}),
  }

  return Object.keys(options).length > 0 ? options : undefined
}

function buildDeepSeekProviderOptions(input: {
  model: Model
  reasoningEffort?: ReasoningEffort
}) {
  if (input.model.providerID !== DEEPSEEK_PROVIDER_ID) return undefined

  const reasoningEffort = normalizeReasoningEffort(input.model, input.reasoningEffort)
  if (!reasoningEffort) return undefined

  return {
    thinking: {
      type: "enabled",
    },
    reasoningEffort,
  }
}

export function buildProviderOptions(input: {
  model: Model
  systemPrompt: string
  reasoningEffort?: ReasoningEffort
}) {
  const openai = buildOpenAIProviderOptions(input)
  const deepseek = buildDeepSeekProviderOptions(input)
  const options = {
    ...(openai ? { openai } : {}),
    ...(deepseek ? { deepseek } : {}),
  }

  return Object.keys(options).length > 0 ? options : undefined
}
