import { Hono } from "hono"
import { ok, parseJsonBody, parseQuery } from "#server/http.ts"
import type { AppEnv } from "#server/types.ts"
import * as CalendarUseCase from "#server/usecases/calendar.ts"

export function CalendarRoutes() {
  const app = new Hono<AppEnv>()

  app.get("/sources", (c) => ok(c, CalendarUseCase.listSources()))

  app.patch("/sources/:id", async (c) => {
    const payload = await parseJsonBody(
      c,
      CalendarUseCase.UpdateCalendarSourceBody,
      "Body must contain valid calendar source fields",
      {},
    )
    return ok(c, CalendarUseCase.updateSource(c.req.param("id"), payload))
  })

  app.get("/items", (c) => {
    const payload = parseQuery(
      c.req.query(),
      CalendarUseCase.ListCalendarItemsQuery,
      "INVALID_CALENDAR_QUERY",
      "Calendar item query is invalid",
    )
    return ok(c, CalendarUseCase.listItems(payload))
  })

  app.post("/events", async (c) => {
    const payload = await parseJsonBody(
      c,
      CalendarUseCase.CreateCalendarEventBody,
      "Body must include sourceId, title, startAt, and endAt",
    )
    return ok(c, CalendarUseCase.createEvent(payload), 201)
  })

  app.patch("/events/:id", async (c) => {
    const payload = await parseJsonBody(
      c,
      CalendarUseCase.UpdateCalendarEventBody,
      "Body must contain valid calendar event fields",
      {},
    )
    return ok(c, CalendarUseCase.updateEvent(c.req.param("id"), payload))
  })

  app.delete("/events/:id", (c) => ok(c, CalendarUseCase.deleteEvent(c.req.param("id"))))

  app.get("/tasks", (c) => ok(c, CalendarUseCase.listTasks()))

  app.post("/tasks", async (c) => {
    const payload = await parseJsonBody(
      c,
      CalendarUseCase.CreateCalendarTaskBody,
      "Body must include a valid calendar task title",
    )
    return ok(c, CalendarUseCase.createTask(payload), 201)
  })

  app.patch("/tasks/:id", async (c) => {
    const payload = await parseJsonBody(
      c,
      CalendarUseCase.UpdateCalendarTaskBody,
      "Body must contain valid calendar task fields",
      {},
    )
    return ok(c, CalendarUseCase.updateTask(c.req.param("id"), payload))
  })

  app.patch("/tasks/:id/schedule", async (c) => {
    const payload = await parseJsonBody(
      c,
      CalendarUseCase.ScheduleCalendarTaskBody,
      "Body must contain valid calendar task schedule fields",
      {},
    )
    return ok(c, CalendarUseCase.scheduleTask(c.req.param("id"), payload))
  })

  app.delete("/tasks/:id", (c) => ok(c, CalendarUseCase.deleteTask(c.req.param("id"))))

  return app
}
