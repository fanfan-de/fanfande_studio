import { Hono } from "hono"
import z from "zod"
import * as Permission from "#permission/permission.ts"
import * as Session from "#session/session.ts"
import * as Prompt from "#session/prompt.ts"
import { Instance } from "#project/instance.ts"
import { ApiError } from "#server/error.ts"
import type { AppEnv } from "#server/types.ts"

const ListRequestsQuery = z.object({
  status: Permission.RequestStatus.optional(),
  sessionID: z.string().optional(),
  view: z.enum(["prompt", "full"]).optional(),
})

const ResolveBody = Permission.RequestResolution.extend({
  resume: z.boolean().optional(),
})

const LegacyRespondBody = z.object({
  scope: Permission.ApprovalScope.optional(),
  reason: z.string().optional(),
  resume: z.boolean().optional(),
})

function decisionFromLegacy(approved: boolean, scope?: Permission.ApprovalScope): Permission.Decision {
  if (!approved) return "deny"

  switch (scope) {
    case "session":
      return "allow-session"
    case "project":
      return "allow-project"
    case "forever":
      return "allow-forever"
    case "once":
    default:
      return "allow-once"
  }
}

function safeReadSession(sessionID: string) {
  try {
    return Session.DataBaseRead("sessions", sessionID) as Session.SessionInfo | null
  } catch {
    return null
  }
}

export function PermissionsRoutes() {
  const app = new Hono<AppEnv>()

  app.get("/rules", async (c) => {
    return c.json({
      success: true,
      data: await Permission.listRules(),
      requestId: c.get("requestId"),
    })
  })

  app.post("/rules", async (c) => {
    const payload = Permission.RuleInput.safeParse(await c.req.json().catch(() => undefined))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must be a valid permission rule")
    }

    const rule = await Permission.createRule(payload.data)
    return c.json(
      {
        success: true,
        data: rule,
        requestId: c.get("requestId"),
      },
      201,
    )
  })

  app.delete("/rules/:id", async (c) => {
    const id = c.req.param("id")
    const removed = await Permission.deleteRule(id)
    if (!removed) {
      throw new ApiError(404, "PERMISSION_RULE_NOT_FOUND", `Permission rule '${id}' not found`)
    }

    return c.json({
      success: true,
      data: removed,
      requestId: c.get("requestId"),
    })
  })

  app.get("/requests", async (c) => {
    const query = ListRequestsQuery.safeParse({
      status: c.req.query("status"),
      sessionID: c.req.query("sessionID"),
    })
    if (!query.success) {
      throw new ApiError(400, "INVALID_QUERY", "Query parameters must include an optional valid status and sessionID")
    }

    return c.json({
      success: true,
      data: query.data.view === "full"
        ? await Permission.listRequests(query.data)
        : await Permission.listRequestPrompts(query.data),
      requestId: c.get("requestId"),
    })
  })

  app.get("/requests/:id", async (c) => {
    const id = c.req.param("id")
    const request = await Permission.getRequest(id)
    if (!request) {
      throw new ApiError(404, "PERMISSION_REQUEST_NOT_FOUND", `Permission request '${id}' not found`)
    }

    return c.json({
      success: true,
      data: request,
      requestId: c.get("requestId"),
    })
  })

  app.post("/requests/:id/approve", async (c) => {
    const id = c.req.param("id")
    const payload = LegacyRespondBody.safeParse(await c.req.json().catch(() => ({})))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must contain a valid approval response")
    }

    const resolved = await Permission.resolveRequest(id, {
      decision: decisionFromLegacy(true, payload.data.scope),
      scope: payload.data.scope,
      note: payload.data.reason,
    }).catch((error) => {
      throw new ApiError(400, "PERMISSION_REQUEST_RESOLUTION_FAILED", error instanceof Error ? error.message : String(error))
    })

    let resumed: unknown
    if (payload.data.resume) {
      const session = safeReadSession(resolved.request.sessionID)
      if (!session) {
        throw new ApiError(404, "SESSION_NOT_FOUND", `Session '${resolved.request.sessionID}' not found`)
      }

      resumed = await Instance.provide({
        directory: session.directory,
        fn: () => Prompt.resume({ sessionID: session.id }),
      })
    }

    return c.json({
      success: true,
      data: {
        ...resolved,
        request: await Permission.getRequestPrompt(resolved.request.id),
        resumed,
      },
      requestId: c.get("requestId"),
    })
  })

  app.post("/requests/:id/deny", async (c) => {
    const id = c.req.param("id")
    const payload = LegacyRespondBody.safeParse(await c.req.json().catch(() => ({})))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must contain a valid denial response")
    }

    const resolved = await Permission.resolveRequest(id, {
      decision: decisionFromLegacy(false, payload.data.scope),
      scope: payload.data.scope,
      note: payload.data.reason,
    }).catch((error) => {
      throw new ApiError(400, "PERMISSION_REQUEST_RESOLUTION_FAILED", error instanceof Error ? error.message : String(error))
    })

    let resumed: unknown
    if (payload.data.resume) {
      const session = safeReadSession(resolved.request.sessionID)
      if (!session) {
        throw new ApiError(404, "SESSION_NOT_FOUND", `Session '${resolved.request.sessionID}' not found`)
      }

      resumed = await Instance.provide({
        directory: session.directory,
        fn: () => Prompt.resume({ sessionID: session.id }),
      })
    }

    return c.json({
      success: true,
      data: {
        ...resolved,
        request: await Permission.getRequestPrompt(resolved.request.id),
        resumed,
      },
      requestId: c.get("requestId"),
    })
  })

  app.post("/requests/:id/resolve", async (c) => {
    const id = c.req.param("id")
    const payload = ResolveBody.safeParse(await c.req.json().catch(() => ({})))
    if (!payload.success) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Body must contain a valid permission decision")
    }

    const resolved = await Permission.resolveRequest(id, {
      decision: payload.data.decision,
      scope: payload.data.scope,
      note: payload.data.note,
    }).catch((error) => {
      throw new ApiError(400, "PERMISSION_REQUEST_RESOLUTION_FAILED", error instanceof Error ? error.message : String(error))
    })

    let resumed: unknown
    if (payload.data.resume) {
      const session = safeReadSession(resolved.request.sessionID)
      if (!session) {
        throw new ApiError(404, "SESSION_NOT_FOUND", `Session '${resolved.request.sessionID}' not found`)
      }

      resumed = await Instance.provide({
        directory: session.directory,
        fn: () => Prompt.resume({ sessionID: session.id }),
      })
    }

    return c.json({
      success: true,
      data: {
        ...resolved,
        request: await Permission.getRequestPrompt(resolved.request.id),
        resumed,
      },
      requestId: c.get("requestId"),
    })
  })

  return app
}
