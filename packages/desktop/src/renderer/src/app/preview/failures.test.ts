import { describe, expect, it } from "vitest"
import { getPreviewFailure } from "./failures"

describe("preview failures", () => {
  it("maps common Electron preview load failures to actionable states", () => {
    expect(getPreviewFailure("ERR_CONNECTION_REFUSED", -102)).toMatchObject({
      code: "ERR_CONNECTION_REFUSED",
      kind: "connection-refused",
    })
    expect(getPreviewFailure("ERR_EMPTY_RESPONSE", -324)).toMatchObject({
      code: "ERR_EMPTY_RESPONSE",
      kind: "connection-reset",
    })
    expect(getPreviewFailure("ERR_NAME_NOT_RESOLVED", -105)).toMatchObject({
      code: "ERR_NAME_NOT_RESOLVED",
      kind: "dns",
    })
    expect(getPreviewFailure("ERR_BLOCKED_BY_RESPONSE", -27)).toMatchObject({
      code: "ERR_BLOCKED_BY_RESPONSE",
      kind: "embedded-blocked",
    })
    expect(getPreviewFailure("ERR_CERT_AUTHORITY_INVALID")).toMatchObject({
      kind: "certificate",
    })
  })
})
