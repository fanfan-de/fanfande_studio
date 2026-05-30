import { describe, expect, test } from "bun:test"
import "./sqlite.cleanup.ts"
import * as Automation from "#automation/automation.ts"
import { createServerApp } from "#server/server.ts"

interface JsonEnvelope<T = unknown> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

interface AutomationDefinition {
  id: string
  name: string
  status: string
  nextRunAt?: number
}

async function readJson<T>(response: Response) {
  return await response.json() as JsonEnvelope<T>
}

async function readStreamUntil(response: Response, pattern: string) {
  const reader = response.body?.getReader()
  if (!reader) throw new Error("Expected response body")

  const decoder = new TextDecoder()
  let text = ""

  for (let index = 0; index < 20; index += 1) {
    const { value, done } = await reader.read()
    if (done) break
    text += decoder.decode(value, { stream: true })
    if (text.includes(pattern)) {
      await reader.cancel()
      return text
    }
  }

  await reader.cancel()
  return text
}

describe("automation api", () => {
  test("creates, lists, updates, and deletes a project automation", async () => {
    const app = createServerApp()
    const createResponse = await app.request("/api/automations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Daily review",
        kind: "project",
        schedule: {
          type: "rrule",
          expression: "FREQ=DAILY;BYHOUR=9;BYMINUTE=15",
          timezone: "UTC",
        },
        scope: {
          projectIDs: ["proj_test"],
        },
        prompt: "Review the project and return any actionable findings.",
      }),
    })

    expect(createResponse.status).toBe(201)
    const created = await readJson<AutomationDefinition>(createResponse)
    expect(created.success).toBe(true)
    expect(created.data?.id).toStartWith("aut_")
    expect(created.data?.status).toBe("active")
    expect(created.data?.nextRunAt).toBeNumber()

    const listResponse = await app.request("/api/automations")
    expect(listResponse.status).toBe(200)
    const list = await readJson<AutomationDefinition[]>(listResponse)
    expect(list.data?.map((automation) => automation.id)).toContain(created.data!.id)

    const updateResponse = await app.request(`/api/automations/${created.data!.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: "paused",
      }),
    })
    expect(updateResponse.status).toBe(200)
    const updated = await readJson<AutomationDefinition>(updateResponse)
    expect(updated.data?.status).toBe("paused")

    const deleteResponse = await app.request(`/api/automations/${created.data!.id}`, {
      method: "DELETE",
    })
    expect(deleteResponse.status).toBe(200)

    const listAfterDeleteResponse = await app.request("/api/automations")
    const listAfterDelete = await readJson<AutomationDefinition[]>(listAfterDeleteResponse)
    expect(listAfterDelete.data?.map((automation) => automation.id)).not.toContain(created.data!.id)
  })

  test("creates project automation with worktree execution", async () => {
    const app = createServerApp()
    const createResponse = await app.request("/api/automations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Worktree review",
        kind: "project",
        schedule: {
          type: "cron",
          expression: "*/10 * * * *",
          timezone: "UTC",
        },
        scope: {
          projectIDs: ["proj_test"],
        },
        execution: {
          environment: "worktree",
        },
        prompt: "Review the project in an isolated worktree.",
      }),
    })

    expect(createResponse.status).toBe(201)
    const created = await readJson<AutomationDefinition>(createResponse)
    expect(created.success).toBe(true)
    expect(created.data?.id).toStartWith("aut_")
  })

  test("streams automation run and session events", async () => {
    const app = createServerApp()
    const createResponse = await app.request("/api/automations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Sidebar refresh smoke",
        kind: "project",
        schedule: {
          type: "cron",
          expression: "*/5 * * * *",
          timezone: "UTC",
        },
        scope: {
          projectIDs: ["proj_test"],
        },
        prompt: "Run a short smoke check.",
      }),
    })
    const created = await readJson<AutomationDefinition>(createResponse)
    const automation = Automation.getAutomation(created.data!.id)
    expect(automation).toBeTruthy()

    const streamResponse = await app.request("/api/automation-events/stream")
    expect(streamResponse.status).toBe(200)
    expect(streamResponse.headers.get("content-type")).toContain("text/event-stream")

    const run = Automation.createRun({
      automation: automation!,
      trigger: "manual",
    })
    Automation.markRunStarted(run.id, {
      directory: "C:\\Projects\\smoke",
      projectID: "proj_test",
      sessionID: "ses_test",
    })

    const streamText = await readStreamUntil(streamResponse, "automation.session.created")
    expect(streamText).toContain("event: automation.run.created")
    expect(streamText).toContain("event: automation.session.created")
    expect(streamText).toContain("\"sessionID\":\"ses_test\"")
  })

  test("claims due automations and creates scheduled runs atomically", async () => {
    const app = createServerApp()
    const createResponse = await app.request("/api/automations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Transactional scheduled run",
        kind: "project",
        schedule: {
          type: "cron",
          expression: "*/5 * * * *",
          timezone: "UTC",
        },
        scope: {
          projectIDs: ["proj_a", "proj_b"],
          directories: ["C:\\Projects\\scheduled"],
        },
        prompt: "Check scheduled targets.",
      }),
    })
    const created = await readJson<AutomationDefinition>(createResponse)
    const automation = Automation.getAutomation(created.data!.id)
    expect(automation).toBeTruthy()

    const now = Date.now()
    Automation.updateAutomationRecord(Automation.AutomationDefinition.parse({
      ...automation!,
      nextRunAt: now - 1000,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      updatedAt: now - 1000,
    }))

    const claimed = Automation.claimDueAutomationRuns({
      now,
      owner: "test-scheduler",
      leaseMs: 60_000,
    })

    expect(claimed).toHaveLength(1)
    const claim = claimed[0]
    if (!claim) throw new Error("Expected one claimed automation")
    expect(claim.automation.id).toBe(automation!.id)
    expect(claim.automation.nextRunAt).toBeGreaterThan(now)
    expect(claim.runs).toHaveLength(3)

    const storedRunIDs = Automation.listRuns({ automationID: automation!.id })
      .map((run) => run.id)
      .sort()
    expect(storedRunIDs).toEqual(claim.runs.map((run) => run.id).sort())

    const storedAutomation = Automation.getAutomation(automation!.id)
    expect(storedAutomation?.nextRunAt).toBe(claim.automation.nextRunAt)
    expect(storedAutomation?.leaseOwner).toBe("test-scheduler")
  })

})
