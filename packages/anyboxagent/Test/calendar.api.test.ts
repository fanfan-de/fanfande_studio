import { describe, expect, test } from "bun:test"
import "./sqlite.cleanup.ts"
import { createServerApp } from "#server/server.ts"

interface JsonEnvelope<T = unknown> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

interface CalendarSource {
  id: string
  name: string
  enabled: boolean
  color: string
}

interface CalendarEvent {
  id: string
  sourceId: string
  title: string
  startAt: number
  endAt: number
  allDay: boolean
}

interface PlannerTask {
  id: string
  title: string
  status: string
  priority: string
  scheduledStartAt?: number
  scheduledEndAt?: number
  estimateMinutes?: number
  workspaceId?: string
}

interface CalendarItem {
  id: string
  sourceId: string
  entityType: string
  entityId: string
  title: string
  startAt?: number
  endAt?: number
  color: string
}

async function readJson<T>(response: Response) {
  return await response.json() as JsonEnvelope<T>
}

describe("calendar api", () => {
  test("seeds default sources", async () => {
    const app = createServerApp()
    const response = await app.request("/api/calendar/sources")

    expect(response.status).toBe(200)
    const body = await readJson<CalendarSource[]>(response)
    expect(body.success).toBe(true)
    expect(body.data?.map((source) => source.id)).toEqual(["work", "personal", "tasks"])
    expect(body.data?.every((source) => source.enabled)).toBe(true)
  })

  test("creates, lists, updates, filters, and deletes local calendar events", async () => {
    const app = createServerApp()
    const rangeStart = Date.UTC(2026, 5, 10, 0, 0, 0)
    const eventStart = Date.UTC(2026, 5, 10, 9, 30, 0)
    const eventEnd = Date.UTC(2026, 5, 10, 10, 30, 0)
    const rangeEnd = Date.UTC(2026, 5, 10, 23, 59, 59)

    const createResponse = await app.request("/api/calendar/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceId: "work",
        title: "Calendar API smoke",
        description: "Created by the calendar API test.",
        startAt: eventStart,
        endAt: eventEnd,
        timezone: "UTC",
      }),
    })

    expect(createResponse.status).toBe(201)
    const created = await readJson<CalendarEvent>(createResponse)
    expect(created.success).toBe(true)
    expect(created.data?.id).toStartWith("evt_")
    expect(created.data?.allDay).toBe(false)

    const listResponse = await app.request(`/api/calendar/items?startAt=${rangeStart}&endAt=${rangeEnd}`)
    expect(listResponse.status).toBe(200)
    const list = await readJson<CalendarItem[]>(listResponse)
    expect(list.data?.map((item) => item.id)).toContain(created.data!.id)
    const listedItem = list.data?.find((item) => item.id === created.data!.id)
    expect(listedItem?.entityType).toBe("event")
    expect(listedItem?.entityId).toBe(created.data!.id)
    expect(listedItem?.color).toBe("#3f7af0")

    const updateResponse = await app.request(`/api/calendar/events/${created.data!.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Updated calendar API smoke",
        sourceId: "personal",
      }),
    })
    expect(updateResponse.status).toBe(200)
    const updated = await readJson<CalendarEvent>(updateResponse)
    expect(updated.data?.title).toBe("Updated calendar API smoke")
    expect(updated.data?.sourceId).toBe("personal")

    const workOnlyResponse = await app.request(`/api/calendar/items?startAt=${rangeStart}&endAt=${rangeEnd}&sourceIds=work`)
    const workOnly = await readJson<CalendarItem[]>(workOnlyResponse)
    expect(workOnly.data?.map((item) => item.id)).not.toContain(created.data!.id)

    const disableResponse = await app.request("/api/calendar/sources/personal", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    })
    expect(disableResponse.status).toBe(200)

    const disabledListResponse = await app.request(
      `/api/calendar/items?startAt=${rangeStart}&endAt=${rangeEnd}&sourceIds=personal`,
    )
    const disabledList = await readJson<CalendarItem[]>(disabledListResponse)
    expect(disabledList.data).toEqual([])

    await app.request("/api/calendar/sources/personal", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    })

    const deleteResponse = await app.request(`/api/calendar/events/${created.data!.id}`, {
      method: "DELETE",
    })
    expect(deleteResponse.status).toBe(200)

    const afterDeleteResponse = await app.request(`/api/calendar/items?startAt=${rangeStart}&endAt=${rangeEnd}`)
    const afterDelete = await readJson<CalendarItem[]>(afterDeleteResponse)
    expect(afterDelete.data?.map((item) => item.id)).not.toContain(created.data!.id)
  })

  test("rejects invalid ranges", async () => {
    const app = createServerApp()
    const response = await app.request("/api/calendar/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceId: "work",
        title: "Invalid range",
        startAt: 2000,
        endAt: 1000,
      }),
    })

    expect(response.status).toBe(400)
    const body = await readJson(response)
    expect(body.error?.code).toBe("INVALID_CALENDAR_EVENT_RANGE")
  })

  test("creates, schedules, updates, filters, and deletes local planner tasks", async () => {
    const app = createServerApp()
    const rangeStart = Date.UTC(2026, 5, 11, 0, 0, 0)
    const taskStart = Date.UTC(2026, 5, 11, 13, 0, 0)
    const taskEnd = Date.UTC(2026, 5, 11, 14, 15, 0)
    const rangeEnd = Date.UTC(2026, 5, 11, 23, 59, 59)

    const createResponse = await app.request("/api/calendar/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Write task model tests",
        description: "Created by the calendar task API test.",
        estimateMinutes: 75,
        workspaceId: "Anybox Desktop",
      }),
    })

    expect(createResponse.status).toBe(201)
    const created = await readJson<PlannerTask>(createResponse)
    expect(created.success).toBe(true)
    expect(created.data?.id).toStartWith("tsk_")
    expect(created.data?.status).toBe("todo")
    expect(created.data?.priority).toBe("medium")
    expect(created.data?.scheduledStartAt).toBeUndefined()

    const unscheduledResponse = await app.request(`/api/calendar/items?startAt=${rangeStart}&endAt=${rangeEnd}`)
    const unscheduledList = await readJson<CalendarItem[]>(unscheduledResponse)
    const unscheduledItem = unscheduledList.data?.find((item) => item.id === created.data!.id)
    expect(unscheduledItem?.entityType).toBe("task")
    expect(unscheduledItem?.sourceId).toBe("tasks")
    expect(unscheduledItem?.startAt).toBeUndefined()

    const scheduleResponse = await app.request(`/api/calendar/tasks/${created.data!.id}/schedule`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scheduledStartAt: taskStart,
        scheduledEndAt: taskEnd,
      }),
    })
    expect(scheduleResponse.status).toBe(200)
    const scheduled = await readJson<PlannerTask>(scheduleResponse)
    expect(scheduled.data?.scheduledStartAt).toBe(taskStart)
    expect(scheduled.data?.scheduledEndAt).toBe(taskEnd)

    const scheduledResponse = await app.request(`/api/calendar/items?startAt=${rangeStart}&endAt=${rangeEnd}`)
    const scheduledList = await readJson<CalendarItem[]>(scheduledResponse)
    const scheduledItem = scheduledList.data?.find((item) => item.id === created.data!.id)
    expect(scheduledItem?.startAt).toBe(taskStart)
    expect(scheduledItem?.endAt).toBe(taskEnd)
    expect(scheduledItem?.title).toBe("Write task model tests")

    const updateResponse = await app.request(`/api/calendar/tasks/${created.data!.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Updated task model tests",
        status: "doing",
      }),
    })
    expect(updateResponse.status).toBe(200)
    const updated = await readJson<PlannerTask>(updateResponse)
    expect(updated.data?.title).toBe("Updated task model tests")
    expect(updated.data?.status).toBe("doing")

    const disableResponse = await app.request("/api/calendar/sources/tasks", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    })
    expect(disableResponse.status).toBe(200)

    const disabledResponse = await app.request(`/api/calendar/items?startAt=${rangeStart}&endAt=${rangeEnd}&sourceIds=tasks`)
    const disabledList = await readJson<CalendarItem[]>(disabledResponse)
    expect(disabledList.data).toEqual([])

    await app.request("/api/calendar/sources/tasks", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    })

    const deleteResponse = await app.request(`/api/calendar/tasks/${created.data!.id}`, {
      method: "DELETE",
    })
    expect(deleteResponse.status).toBe(200)

    const afterDeleteResponse = await app.request(`/api/calendar/items?startAt=${rangeStart}&endAt=${rangeEnd}`)
    const afterDelete = await readJson<CalendarItem[]>(afterDeleteResponse)
    expect(afterDelete.data?.map((item) => item.id)).not.toContain(created.data!.id)
  })
})
