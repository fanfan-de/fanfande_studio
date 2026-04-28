import z from "zod"
import * as Identifier from "#id/id.ts"

export const SessionProgressItemStatus = z.enum(["pending", "in_progress", "completed"]).meta({
  ref: "SessionProgressItemStatus",
})
export type SessionProgressItemStatus = z.infer<typeof SessionProgressItemStatus>

export const SessionProgressItem = z
  .object({
    id: Identifier.schema("task"),
    step: z.string(),
    status: SessionProgressItemStatus,
  })
  .meta({
    ref: "SessionProgressItem",
  })
export type SessionProgressItem = z.infer<typeof SessionProgressItem>

export const SessionProgressState = z
  .object({
    explanation: z.string().optional(),
    items: z.array(SessionProgressItem),
    updatedAt: z.number(),
    sourceAssistantMessageID: Identifier.schema("message").optional(),
    sourceUserMessageID: Identifier.schema("message").optional(),
    toolCallID: z.string().optional(),
  })
  .meta({
    ref: "SessionProgressState",
  })
export type SessionProgressState = z.infer<typeof SessionProgressState>

export function normalizeProgressStepKey(step: string) {
  return step.trim().replace(/\s+/g, " ")
}

function previousIDsByStep(previous: SessionProgressState | undefined) {
  const result = new Map<string, string[]>()

  for (const item of previous?.items ?? []) {
    const key = normalizeProgressStepKey(item.step)
    const existing = result.get(key) ?? []
    existing.push(item.id)
    result.set(key, existing)
  }

  return result
}

export function createSessionProgressState(input: {
  explanation?: string
  plan: Array<{
    step: string
    status: SessionProgressItemStatus
  }>
  previous?: SessionProgressState
  now?: number
  sourceAssistantMessageID?: string
  sourceUserMessageID?: string
  toolCallID?: string
}) {
  const idsByStep = previousIDsByStep(input.previous)
  const items = input.plan.map((item) => {
    const step = normalizeProgressStepKey(item.step)
    const reusableIDs = idsByStep.get(step)
    const id = reusableIDs?.shift() ?? Identifier.ascending("task")
    return SessionProgressItem.parse({
      id,
      step,
      status: item.status,
    })
  })

  const explanation = input.explanation?.trim()

  return SessionProgressState.parse({
    explanation: explanation || undefined,
    items,
    updatedAt: input.now ?? Date.now(),
    sourceAssistantMessageID: input.sourceAssistantMessageID,
    sourceUserMessageID: input.sourceUserMessageID,
    toolCallID: input.toolCallID,
  })
}
