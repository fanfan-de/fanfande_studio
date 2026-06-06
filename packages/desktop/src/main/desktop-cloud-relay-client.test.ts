import { describe, expect, it } from "vitest"
import { internal } from "./desktop-cloud-relay-client"

describe("desktop cloud relay entitlement errors", () => {
  it("maps relay entitlement failures to user-facing copy", () => {
    expect(internal.describeRelayRequestError("relay_disabled", "raw relay error", 403)).toContain("当前套餐不支持 Relay")
    expect(internal.describeRelayRequestError("device_limit_exceeded", "raw device error", 403)).toContain("桌面设备数量已达上限")
  })

  it("keeps server messages for unrelated relay errors", () => {
    expect(internal.describeRelayRequestError("pairing_expired", "Pairing expired.", 403)).toBe("Pairing expired.")
    expect(internal.describeRelayRequestError(undefined, undefined, 500)).toBe("Relay request failed with HTTP 500.")
  })
})
