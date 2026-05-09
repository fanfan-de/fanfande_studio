import { describe, expect, it } from "vitest"
import {
  AgentRouteSchemas,
  ApiEnvelopeSchema,
  DesktopIpcSchemas,
  SessionEventSchema,
} from "./index"

describe("shared contracts", () => {
  it("accepts API success and failure envelopes", () => {
    expect(ApiEnvelopeSchema.parse({ success: true, data: { ok: true }, requestId: "req_1" }).success).toBe(true)
    expect(
      ApiEnvelopeSchema.parse({
        success: false,
        error: { code: "INVALID_PAYLOAD", message: "Bad payload" },
      }).success,
    ).toBe(false)
  })

  it("validates session stream request payloads", () => {
    expect(AgentRouteSchemas.sessions.streamMessage.body.safeParse({ text: "hello" }).success).toBe(true)
    expect(AgentRouteSchemas.sessions.streamMessage.body.safeParse({ attachments: [{ path: "/tmp/a.png" }] }).success).toBe(true)
    expect(AgentRouteSchemas.sessions.streamMessage.body.safeParse({}).success).toBe(false)
  })

  it("validates desktop openPath and session event contracts", () => {
    expect(DesktopIpcSchemas.openPath.input.parse({ targetPath: "/tmp/project" }).targetPath).toBe("/tmp/project")
    expect(SessionEventSchema.parse({ event: "message", data: { text: "ok" }, id: "1" }).event).toBe("message")
  })
})
