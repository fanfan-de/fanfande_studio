import { describe, expect, test } from "bun:test"
import { Hono } from "hono"
import z from "zod"
import { ApiError, isApiError } from "#server/error.ts"
import { ok, parseJsonBody } from "#server/http.ts"
import type { AppEnv } from "#server/types.ts"
import * as SessionUseCase from "#server/usecases/session.ts"
import * as SettingsUseCase from "#server/usecases/settings.ts"

interface JsonEnvelope<T = Record<string, unknown>> {
  success: boolean
  requestId?: string
  data?: T
  error?: {
    code: string
    message: string
  }
}

function createHttpHelperHarness() {
  const app = new Hono<AppEnv>()

  app.use("*", async (c, next) => {
    c.set("requestId", "req_test")
    await next()
  })

  app.post("/body", async (c) => {
    const payload = await parseJsonBody(
      c,
      z.object({
        name: z.string().min(1),
      }),
      "Name is required",
    )
    return ok(c, payload, 201)
  })

  app.onError((error, c) => {
    if (isApiError(error)) {
      return c.json(
        {
          success: false,
          error: { code: error.code, message: error.message },
          requestId: c.get("requestId"),
        },
        error.status,
      )
    }

    throw error
  })

  return app
}

describe("server route refactor helpers", () => {
  test("parseJsonBody and ok preserve the existing JSON envelope shape", async () => {
    const app = createHttpHelperHarness()

    const response = await app.request("http://localhost/body", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ada" }),
    })
    const body = (await response.json()) as JsonEnvelope<{ name: string }>

    expect(response.status).toBe(201)
    expect(body).toEqual({
      success: true,
      data: { name: "Ada" },
      requestId: "req_test",
    })
  })

  test("parseJsonBody maps invalid and malformed bodies to INVALID_PAYLOAD", async () => {
    const app = createHttpHelperHarness()

    for (const body of ["{}", "{"]) {
      const response = await app.request("http://localhost/body", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      })
      const envelope = (await response.json()) as JsonEnvelope

      expect(response.status).toBe(400)
      expect(envelope.success).toBe(false)
      expect(envelope.error?.code).toBe("INVALID_PAYLOAD")
      expect(envelope.error?.message).toBe("Name is required")
      expect(envelope.requestId).toBe("req_test")
    }
  })

  test("session stream payload schema still accepts question answers and attachments", () => {
    expect(
      SessionUseCase.StreamSessionMessageBody.safeParse({
        questionAnswer: {
          questionID: "question_1",
          selectedOptions: ["Use the default"],
        },
      }).success,
    ).toBe(true)

    expect(
      SessionUseCase.StreamSessionMessageBody.safeParse({
        attachments: [{ path: "screenshot.png" }],
      }).success,
    ).toBe(true)

    expect(SessionUseCase.StreamSessionMessageBody.safeParse({}).success).toBe(false)
  })

  test("settings usecase maps known skill manager errors to ApiError", async () => {
    try {
      await SettingsUseCase.readSkillFile({ path: `missing-skill-${crypto.randomUUID()}/SKILL.md` })
      throw new Error("Expected readSkillFile to fail")
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      if (error instanceof ApiError) {
        expect(error.status).toBe(404)
        expect(error.code).toBe("SKILL_FILE_NOT_FOUND")
      }
    }
  })
})
