import { Hono } from "hono"
import { ok, parseJsonBody, parseQuery } from "#server/http.ts"
import type { AppEnv } from "#server/types.ts"
import * as AutomationUseCase from "#server/usecases/automations.ts"

export function AutomationRoutes() {
  const app = new Hono<AppEnv>()

  app.get("/", (c) => ok(c, AutomationUseCase.listAutomations()))

  app.post("/", async (c) => {
    const payload = await parseJsonBody(
      c,
      AutomationUseCase.CreateAutomationBody,
      "Body must include name, schedule, prompt, and a valid scope",
    )
    return ok(c, AutomationUseCase.createAutomation(payload), 201)
  })

  app.get("/:id/runs", (c) => ok(c, AutomationUseCase.listAutomationRuns(c.req.param("id"))))

  app.post("/:id/run", (c) => ok(c, AutomationUseCase.runAutomation(c.req.param("id")), 202))

  app.get("/:id", (c) => ok(c, AutomationUseCase.getAutomation(c.req.param("id"))))

  app.patch("/:id", async (c) => {
    const payload = await parseJsonBody(
      c,
      AutomationUseCase.UpdateAutomationBody,
      "Body must contain valid automation fields",
      {},
    )
    return ok(c, AutomationUseCase.updateAutomation(c.req.param("id"), payload))
  })

  app.delete("/:id", (c) => ok(c, AutomationUseCase.deleteAutomation(c.req.param("id"))))

  return app
}

export function AutomationRunRoutes() {
  const app = new Hono<AppEnv>()

  app.get("/", (c) => {
    const payload = parseQuery(
      c.req.query(),
      AutomationUseCase.ListAutomationRunsQuery,
      "INVALID_QUERY",
      "Automation run query is invalid",
    )
    return ok(c, AutomationUseCase.listRuns(payload))
  })

  app.get("/:id", (c) => ok(c, AutomationUseCase.getRun(c.req.param("id"))))

  app.post("/:id/archive", (c) => ok(c, AutomationUseCase.archiveRun(c.req.param("id"))))

  app.post("/:id/read", (c) => ok(c, AutomationUseCase.markRunRead(c.req.param("id"))))

  app.post("/:id/cancel", (c) => ok(c, AutomationUseCase.cancelRun(c.req.param("id"))))

  app.patch("/:id/triage", async (c) => {
    const payload = await parseJsonBody(
      c,
      AutomationUseCase.UpdateAutomationRunTriageBody,
      "Body must include a valid triageStatus",
    )
    return ok(c, AutomationUseCase.updateRunTriage(c.req.param("id"), payload))
  })

  return app
}

