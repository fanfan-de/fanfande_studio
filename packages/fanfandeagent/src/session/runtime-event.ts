import z from "zod"
import * as Identifier from "#id/id.ts"
import * as Permission from "#permission/schema.ts"
import * as Message from "#session/message.ts"

const ModelRef = z.object({
  providerID: z.string(),
  modelID: z.string(),
})

export const RuntimeEventBase = z.object({
  eventID: Identifier.schema("event"),
  sessionID: Identifier.schema("session"),
  turnID: Identifier.schema("turn"),
  seq: z.number().int().positive(),
  timestamp: z.number().int().nonnegative(),
})

export const RuntimeEventCursor = z.object({
  timestamp: z.number().int().nonnegative(),
  turnID: Identifier.schema("turn"),
  seq: z.number().int().positive(),
})

const TurnStartedPayload = z.object({
  userMessageID: z.string().optional(),
  agent: z.string().optional(),
  model: ModelRef.optional(),
  resume: z.boolean().optional(),
})

const MessageRecordedPayload = z.object({
  message: Message.MessageInfo,
})

const PartRecordedPayload = z.object({
  part: Message.Part,
})

const PartRemovedPayload = z.object({
  partID: z.string(),
  messageID: z.string().optional(),
})

const PermissionRequestedPayload = z.object({
  request: Permission.Request,
  part: Message.PermissionPart,
})

const PermissionResolvedPayload = z.object({
  request: Permission.Request,
  part: Message.PermissionPart,
  rule: Permission.Rule.optional(),
})

const TurnCompletedPayload = z.object({
  status: z.enum(["completed", "blocked", "stopped"]),
  finishReason: z.string().optional(),
  message: Message.MessageInfo.optional(),
  parts: Message.Part.array().optional(),
})

const TurnFailedPayload = z.object({
  error: z.string(),
  message: Message.MessageInfo.optional(),
  parts: Message.Part.array().optional(),
})

const TextPartStartedPayload = z.object({
  messageID: z.string(),
  partID: z.string(),
  kind: z.literal("text"),
  text: z.string(),
  metadata: z.record(z.string(), z.any()).optional(),
})

const TextPartDeltaPayload = TextPartStartedPayload.extend({
  delta: z.string(),
})

const TextPartCompletedPayload = z.object({
  part: Message.TextPart,
})

const ReasoningPartStartedPayload = z.object({
  messageID: z.string(),
  partID: z.string(),
  kind: z.literal("reasoning"),
  text: z.string(),
  metadata: z.record(z.string(), z.any()).optional(),
})

const ReasoningPartDeltaPayload = ReasoningPartStartedPayload.extend({
  delta: z.string(),
})

const ReasoningPartCompletedPayload = z.object({
  part: Message.ReasoningPart,
})

const ToolCallPayload = z.object({
  part: Message.ToolPart,
})

const PatchGeneratedPayload = z.object({
  part: Message.PatchPart,
})

const SnapshotCapturedPayload = z.object({
  part: Message.SnapshotPart,
  phase: z.enum(["turn-start", "turn-end"]).optional(),
})

const RetryScheduledPayload = z.object({
  attempt: z.number().int().positive(),
  reason: z.string().optional(),
})

export const TurnStartedEvent = RuntimeEventBase.extend({
  type: z.literal("turn.started"),
  payload: TurnStartedPayload,
})

export const MessageRecordedEvent = RuntimeEventBase.extend({
  type: z.literal("message.recorded"),
  payload: MessageRecordedPayload,
})

export const PartRecordedEvent = RuntimeEventBase.extend({
  type: z.literal("part.recorded"),
  payload: PartRecordedPayload,
})

export const PartRemovedEvent = RuntimeEventBase.extend({
  type: z.literal("part.removed"),
  payload: PartRemovedPayload,
})

export const PermissionRequestedEvent = RuntimeEventBase.extend({
  type: z.literal("permission.requested"),
  payload: PermissionRequestedPayload,
})

export const PermissionResolvedEvent = RuntimeEventBase.extend({
  type: z.literal("permission.resolved"),
  payload: PermissionResolvedPayload,
})

export const TurnCompletedEvent = RuntimeEventBase.extend({
  type: z.literal("turn.completed"),
  payload: TurnCompletedPayload,
})

export const TurnFailedEvent = RuntimeEventBase.extend({
  type: z.literal("turn.failed"),
  payload: TurnFailedPayload,
})

export const TextPartStartedEvent = RuntimeEventBase.extend({
  type: z.literal("text.part.started"),
  payload: TextPartStartedPayload,
})

export const TextPartDeltaEvent = RuntimeEventBase.extend({
  type: z.literal("text.part.delta"),
  payload: TextPartDeltaPayload,
})

export const TextPartCompletedEvent = RuntimeEventBase.extend({
  type: z.literal("text.part.completed"),
  payload: TextPartCompletedPayload,
})

export const ReasoningPartStartedEvent = RuntimeEventBase.extend({
  type: z.literal("reasoning.part.started"),
  payload: ReasoningPartStartedPayload,
})

export const ReasoningPartDeltaEvent = RuntimeEventBase.extend({
  type: z.literal("reasoning.part.delta"),
  payload: ReasoningPartDeltaPayload,
})

export const ReasoningPartCompletedEvent = RuntimeEventBase.extend({
  type: z.literal("reasoning.part.completed"),
  payload: ReasoningPartCompletedPayload,
})

export const ToolCallStartedEvent = RuntimeEventBase.extend({
  type: z.literal("tool.call.started"),
  payload: ToolCallPayload,
})

export const ToolCallWaitingApprovalEvent = RuntimeEventBase.extend({
  type: z.literal("tool.call.waiting_approval"),
  payload: ToolCallPayload,
})

export const ToolCallApprovedEvent = RuntimeEventBase.extend({
  type: z.literal("tool.call.approved"),
  payload: ToolCallPayload,
})

export const ToolCallDeniedEvent = RuntimeEventBase.extend({
  type: z.literal("tool.call.denied"),
  payload: ToolCallPayload,
})

export const ToolCallCompletedEvent = RuntimeEventBase.extend({
  type: z.literal("tool.call.completed"),
  payload: ToolCallPayload,
})

export const ToolCallFailedEvent = RuntimeEventBase.extend({
  type: z.literal("tool.call.failed"),
  payload: ToolCallPayload,
})

export const PatchGeneratedEvent = RuntimeEventBase.extend({
  type: z.literal("patch.generated"),
  payload: PatchGeneratedPayload,
})

export const SnapshotCapturedEvent = RuntimeEventBase.extend({
  type: z.literal("snapshot.captured"),
  payload: SnapshotCapturedPayload,
})

export const RetryScheduledEvent = RuntimeEventBase.extend({
  type: z.literal("retry.scheduled"),
  payload: RetryScheduledPayload,
})

export const RuntimeEvent = z.discriminatedUnion("type", [
  TurnStartedEvent,
  MessageRecordedEvent,
  PartRecordedEvent,
  PartRemovedEvent,
  PermissionRequestedEvent,
  PermissionResolvedEvent,
  TurnCompletedEvent,
  TurnFailedEvent,
  TextPartStartedEvent,
  TextPartDeltaEvent,
  TextPartCompletedEvent,
  ReasoningPartStartedEvent,
  ReasoningPartDeltaEvent,
  ReasoningPartCompletedEvent,
  ToolCallStartedEvent,
  ToolCallWaitingApprovalEvent,
  ToolCallApprovedEvent,
  ToolCallDeniedEvent,
  ToolCallCompletedEvent,
  ToolCallFailedEvent,
  PatchGeneratedEvent,
  SnapshotCapturedEvent,
  RetryScheduledEvent,
])

export type RuntimeEvent = z.infer<typeof RuntimeEvent>
export type RuntimeEventType = RuntimeEvent["type"]
export type RuntimeEventCursor = z.infer<typeof RuntimeEventCursor>

export type RuntimeEventPayloadByType = {
  "turn.started": z.infer<typeof TurnStartedPayload>
  "message.recorded": z.infer<typeof MessageRecordedPayload>
  "part.recorded": z.infer<typeof PartRecordedPayload>
  "part.removed": z.infer<typeof PartRemovedPayload>
  "permission.requested": z.infer<typeof PermissionRequestedPayload>
  "permission.resolved": z.infer<typeof PermissionResolvedPayload>
  "turn.completed": z.infer<typeof TurnCompletedPayload>
  "turn.failed": z.infer<typeof TurnFailedPayload>
  "text.part.started": z.infer<typeof TextPartStartedPayload>
  "text.part.delta": z.infer<typeof TextPartDeltaPayload>
  "text.part.completed": z.infer<typeof TextPartCompletedPayload>
  "reasoning.part.started": z.infer<typeof ReasoningPartStartedPayload>
  "reasoning.part.delta": z.infer<typeof ReasoningPartDeltaPayload>
  "reasoning.part.completed": z.infer<typeof ReasoningPartCompletedPayload>
  "tool.call.started": z.infer<typeof ToolCallPayload>
  "tool.call.waiting_approval": z.infer<typeof ToolCallPayload>
  "tool.call.approved": z.infer<typeof ToolCallPayload>
  "tool.call.denied": z.infer<typeof ToolCallPayload>
  "tool.call.completed": z.infer<typeof ToolCallPayload>
  "tool.call.failed": z.infer<typeof ToolCallPayload>
  "patch.generated": z.infer<typeof PatchGeneratedPayload>
  "snapshot.captured": z.infer<typeof SnapshotCapturedPayload>
  "retry.scheduled": z.infer<typeof RetryScheduledPayload>
}

export function createRuntimeEventFactory(input: {
  sessionID: string
  turnID: string
  timestamp?: () => number
}) {
  let seq = 0
  const now = input.timestamp ?? (() => Date.now())

  return {
    next<TType extends RuntimeEventType>(type: TType, payload: RuntimeEventPayloadByType[TType]) {
      seq += 1
      return RuntimeEvent.parse({
        eventID: Identifier.ascending("event"),
        sessionID: input.sessionID,
        turnID: input.turnID,
        seq,
        timestamp: now(),
        type,
        payload,
      })
    },
    currentSeq() {
      return seq
    },
  }
}

export function cursorOf(
  event:
    | RuntimeEvent
    | {
        timestamp: number
        turnID: string
        seq: number
      },
) {
  return RuntimeEventCursor.parse({
    timestamp: event.timestamp,
    turnID: event.turnID,
    seq: event.seq,
  })
}

export function serializeCursor(cursor: RuntimeEventCursor) {
  return `${cursor.timestamp}:${cursor.turnID}:${cursor.seq}`
}

export function parseCursor(value: string) {
  const [timestamp, turnID, seq] = value.split(":")
  return RuntimeEventCursor.parse({
    timestamp: Number(timestamp),
    turnID,
    seq: Number(seq),
  })
}

export function isTerminalRuntimeEvent(event: RuntimeEvent) {
  return event.type === "turn.completed" || event.type === "turn.failed"
}
