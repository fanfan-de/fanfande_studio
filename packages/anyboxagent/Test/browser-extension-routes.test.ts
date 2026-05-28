import { describe, expect, test } from "bun:test"
import "./sqlite.cleanup.ts"
import { createServerApp } from "#server/server.ts"

interface JsonEnvelope<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

describe("browser extension command routes", () => {
  test("releases local tab ownership without requiring an extension connection", async () => {
    const app = createServerApp()

    const response = await app.request("/api/browser-extension/command", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        method: "tabs.release",
        params: {
          tabId: 123,
        },
      }),
    })
    const body = (await response.json()) as JsonEnvelope<{ tabId: number; released: boolean }>

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toEqual({ tabId: 123, released: false })
  })

  test("rejects script execution through the MCP command route", async () => {
    const app = createServerApp()

    const response = await app.request("/api/browser-extension/command", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        method: "page.executeScript",
        params: {
          script: "document.title",
        },
      }),
    })
    const body = (await response.json()) as JsonEnvelope<unknown>

    expect(response.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error?.code).toBe("INVALID_PAYLOAD")
  })
})
