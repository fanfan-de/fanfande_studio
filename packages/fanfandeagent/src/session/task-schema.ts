import z from "zod"
import * as Identifier from "#id/id.ts"

export const SessionTaskStatus = z.enum(["pending", "in_progress", "completed"]).meta({
  ref: "SessionTaskStatus",
})
export type SessionTaskStatus = z.infer<typeof SessionTaskStatus>

export const SessionTaskRecord = z
  .object({
    id: z.string().min(1),
    sessionID: Identifier.schema("session"),
    subject: z.string().min(1),
    description: z.string().min(1),
    activeForm: z.string().min(1),
    owner: z.string().min(1),
    status: SessionTaskStatus,
    blocks: z.array(z.string().min(1)),
    blockedBy: z.array(z.string().min(1)),
    metadata: z.record(z.string(), z.any()),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    startedAt: z.number().int().nonnegative().optional(),
    completedAt: z.number().int().nonnegative().optional(),
    sourceAssistantMessageID: Identifier.schema("message").optional(),
    sourceUserMessageID: Identifier.schema("message").optional(),
    toolCallID: z.string().optional(),
  })
  .meta({
    ref: "SessionTaskRecord",
  })
export type SessionTaskRecord = z.infer<typeof SessionTaskRecord>

export const SessionTaskPeer = z
  .object({
    id: z.string(),
    subject: z.string(),
    status: SessionTaskStatus,
    owner: z.string(),
  })
  .meta({
    ref: "SessionTaskPeer",
  })
export type SessionTaskPeer = z.infer<typeof SessionTaskPeer>

export const SessionTaskView = SessionTaskRecord.extend({
  isBlocked: z.boolean(),
  blockingTasks: z.array(SessionTaskPeer),
  blockedTasks: z.array(SessionTaskPeer),
})
  .meta({
    ref: "SessionTaskView",
  })
export type SessionTaskView = z.infer<typeof SessionTaskView>

export const SessionTaskOwnerActivity = z
  .object({
    owner: z.string(),
    current: SessionTaskView.optional(),
    next: SessionTaskView.optional(),
  })
  .meta({
    ref: "SessionTaskOwnerActivity",
  })
export type SessionTaskOwnerActivity = z.infer<typeof SessionTaskOwnerActivity>

export const SessionTaskTeammateActivity = z
  .object({
    id: z.string(),
    owner: z.string(),
    title: z.string(),
    status: z.string(),
    active: z.boolean(),
    childSessionID: Identifier.schema("session").optional(),
    updatedAt: z.number().int().nonnegative().optional(),
  })
  .meta({
    ref: "SessionTaskTeammateActivity",
  })
export type SessionTaskTeammateActivity = z.infer<typeof SessionTaskTeammateActivity>

export const SessionTaskListView = z
  .object({
    sessionID: Identifier.schema("session"),
    generatedAt: z.number().int().nonnegative(),
    tasks: z.array(SessionTaskView),
    current: z.array(SessionTaskView),
    next: z.array(SessionTaskView),
    blocked: z.array(SessionTaskView),
    owners: z.array(SessionTaskOwnerActivity),
    teammateActivity: z.array(SessionTaskTeammateActivity),
    summary: z.object({
      total: z.number().int().nonnegative(),
      completed: z.number().int().nonnegative(),
      pending: z.number().int().nonnegative(),
      inProgress: z.number().int().nonnegative(),
      blocked: z.number().int().nonnegative(),
    }),
  })
  .meta({
    ref: "SessionTaskListView",
  })
export type SessionTaskListView = z.infer<typeof SessionTaskListView>
