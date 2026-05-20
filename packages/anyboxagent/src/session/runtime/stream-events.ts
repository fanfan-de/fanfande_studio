import z from "zod"
import * as BusEvent from "#bus/bus-event.ts"
import * as Message from "#session/core/message.ts"

const ChunkReceived = BusEvent.define(
  "session.stream.chunk.received",
  z.object({
    sessionID: z.string(),
    turnID: z.string().optional(),
    messageID: z.string(),
    iteration: z.number().int().positive(),
    chunkType: z.string(),
    chunk: z.any(),
  }),
)

const PartPersistenceRequested = BusEvent.define(
  "session.stream.part.persist_requested",
  z.object({
    sessionID: z.string(),
    messageID: z.string(),
    part: Message.Part,
  }),
)

const ToolApprovalRegistrationRequested = BusEvent.define(
  "session.stream.tool_approval.register_requested",
  z.object({
    sessionID: z.string(),
    messageID: z.string(),
    assistant: Message.Assistant,
    toolPart: Message.ToolPart,
    turn: z.any().optional(),
  }),
)

export const Event = {
  ChunkReceived,
  PartPersistenceRequested,
  ToolApprovalRegistrationRequested,
}
