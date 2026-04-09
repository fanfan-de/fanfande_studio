import z from "zod"
import * as Identifier from "#id/id.ts"

export const PtyCursor = z.number().int().nonnegative()
export type PtyCursor = z.output<typeof PtyCursor>

export const PtyStatus = z.enum(["running", "exited", "deleted"])
export type PtyStatus = z.output<typeof PtyStatus>

export const PtySessionInfo = z.object({
  id: Identifier.schema("pty"),
  title: z.string(),
  cwd: z.string(),
  shell: z.string(),
  rows: z.number().int().min(4).max(400),
  cols: z.number().int().min(10).max(400),
  status: PtyStatus,
  exitCode: z.number().int().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  cursor: PtyCursor,
})
export type PtySessionInfo = z.output<typeof PtySessionInfo>

export const CreatePtySessionBody = z.object({
  title: z.string().min(1).max(160).optional(),
  cwd: z.string().min(1).optional(),
  shell: z.string().min(1).optional(),
  rows: z.number().int().min(4).max(400).optional(),
  cols: z.number().int().min(10).max(400).optional(),
})
export type CreatePtySessionBody = z.output<typeof CreatePtySessionBody>

export const UpdatePtySessionBody = z
  .object({
    title: z.string().min(1).max(160).optional(),
    rows: z.number().int().min(4).max(400).optional(),
    cols: z.number().int().min(10).max(400).optional(),
  })
  .refine((value) => value.title !== undefined || value.rows !== undefined || value.cols !== undefined, {
    message: "Body must include at least one field to update",
  })
export type UpdatePtySessionBody = z.output<typeof UpdatePtySessionBody>

export const PtyReplayPayload = z.object({
  mode: z.enum(["delta", "reset"]),
  buffer: z.string(),
  cursor: PtyCursor,
  startCursor: PtyCursor,
})
export type PtyReplayPayload = z.output<typeof PtyReplayPayload>

export const PtyClientMessage = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("input"),
    data: z.string(),
  }),
  z.object({
    type: z.literal("ping"),
  }),
])
export type PtyClientMessage = z.output<typeof PtyClientMessage>

export const PtyServerMessage = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ready"),
    session: PtySessionInfo,
    replay: PtyReplayPayload,
  }),
  z.object({
    type: z.literal("output"),
    id: Identifier.schema("pty"),
    data: z.string(),
    cursor: PtyCursor,
  }),
  z.object({
    type: z.literal("state"),
    session: PtySessionInfo,
  }),
  z.object({
    type: z.literal("exited"),
    session: PtySessionInfo,
  }),
  z.object({
    type: z.literal("deleted"),
    session: PtySessionInfo,
  }),
  z.object({
    type: z.literal("error"),
    code: z.string(),
    message: z.string(),
  }),
])
export type PtyServerMessage = z.output<typeof PtyServerMessage>

