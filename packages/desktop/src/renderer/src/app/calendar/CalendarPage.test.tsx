import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { CalendarPage } from "./CalendarPage"
import {
  createCalendarEvent,
  createCalendarTask,
  listCalendarItems,
  listCalendarSources,
  scheduleCalendarTask,
  updateCalendarEvent,
  updateCalendarSource,
  updateCalendarTask,
} from "./calendar-client"
import type { CalendarApiItem, CalendarEventRecord, CalendarSource, PlannerTaskRecord } from "./calendar-types"

vi.mock("./calendar-client", () => ({
  createCalendarEvent: vi.fn(),
  createCalendarTask: vi.fn(),
  deleteCalendarEvent: vi.fn(),
  deleteCalendarTask: vi.fn(),
  listCalendarItems: vi.fn(),
  listCalendarSources: vi.fn(),
  listCalendarTasks: vi.fn(),
  scheduleCalendarTask: vi.fn(),
  updateCalendarEvent: vi.fn(),
  updateCalendarSource: vi.fn(),
  updateCalendarTask: vi.fn(),
}))

const listCalendarSourcesMock = vi.mocked(listCalendarSources)
const listCalendarItemsMock = vi.mocked(listCalendarItems)
const createCalendarEventMock = vi.mocked(createCalendarEvent)
const createCalendarTaskMock = vi.mocked(createCalendarTask)
const updateCalendarEventMock = vi.mocked(updateCalendarEvent)
const updateCalendarSourceMock = vi.mocked(updateCalendarSource)
const updateCalendarTaskMock = vi.mocked(updateCalendarTask)
const scheduleCalendarTaskMock = vi.mocked(scheduleCalendarTask)

let apiSources: CalendarSource[]
let apiItems: CalendarApiItem[]

function createSources(): CalendarSource[] {
  return [
    {
      id: "work",
      name: "Work",
      subtitle: "Local calendar",
      kind: "external_calendar",
      color: "#3f7af0",
      enabled: true,
    },
    {
      id: "personal",
      name: "Personal",
      subtitle: "Local calendar",
      kind: "external_calendar",
      color: "#2f9d7e",
      enabled: true,
    },
    {
      id: "tasks",
      name: "My Tasks",
      subtitle: "Anybox task source",
      kind: "task_database",
      color: "#8a5cf6",
      enabled: true,
    },
  ]
}

function createApiItems(): CalendarApiItem[] {
  const now = new Date()
  now.setHours(10, 0, 0, 0)
  return [
    {
      id: "evt_weekly_sync",
      entityId: "evt_weekly_sync",
      entityType: "event",
      sourceId: "work",
      title: "Weekly product sync",
      description: "Loaded from API.",
      startAt: now.getTime(),
      endAt: now.getTime() + 45 * 60 * 1000,
      allDay: false,
      color: "#3f7af0",
      status: "scheduled",
      isReadOnly: false,
      isSuggestion: false,
      workspace: "Anybox Desktop",
    },
    {
      id: "tsk_calendar_spec",
      entityId: "tsk_calendar_spec",
      entityType: "task",
      sourceId: "tasks",
      title: "Connect tasks to calendar source",
      description: "Loaded from PlannerTask API.",
      allDay: false,
      color: "#8a5cf6",
      estimateMinutes: 75,
      status: "todo",
      isReadOnly: false,
      isSuggestion: false,
      workspace: "Anybox Desktop",
    },
    {
      id: "tsk_release_notes",
      entityId: "tsk_release_notes",
      entityType: "task",
      sourceId: "tasks",
      title: "Write mobile release notes",
      description: "Scheduled PlannerTask from API.",
      startAt: now.getTime() + 2 * 60 * 60 * 1000,
      endAt: now.getTime() + 3 * 60 * 60 * 1000,
      allDay: false,
      color: "#8a5cf6",
      estimateMinutes: 60,
      status: "doing",
      isReadOnly: false,
      isSuggestion: false,
      workspace: "Anybox Mobile",
    },
  ]
}

function enabledSourceIds() {
  return new Set(apiSources.filter((source) => source.enabled).map((source) => source.id))
}

beforeEach(() => {
  apiSources = createSources()
  apiItems = createApiItems()
  vi.clearAllMocks()

  listCalendarSourcesMock.mockImplementation(async () => apiSources)
  listCalendarItemsMock.mockImplementation(async () => {
    const enabled = enabledSourceIds()
    return apiItems.filter((item) => enabled.has(item.sourceId))
  })
  updateCalendarSourceMock.mockImplementation(async ({ sourceId, update }) => {
    apiSources = apiSources.map((source) => (source.id === sourceId ? { ...source, ...update } : source))
    return apiSources.find((source) => source.id === sourceId)!
  })
  updateCalendarEventMock.mockImplementation(async ({ eventId, update }) => {
    apiItems = apiItems.map((item) => (item.id === eventId ? {
      ...item,
      ...update,
      startAt: update.startAt ?? item.startAt,
      endAt: update.endAt ?? item.endAt,
    } : item))
    const item = apiItems.find((candidate) => candidate.id === eventId)!
    return {
      id: item.id,
      sourceId: item.sourceId,
      title: item.title,
      description: item.description,
      startAt: item.startAt!,
      endAt: item.endAt!,
      allDay: item.allDay,
      timezone: "UTC",
      attendees: [],
      linkedPageIds: [],
      createdAt: 1,
      updatedAt: 2,
    } satisfies CalendarEventRecord
  })
  updateCalendarTaskMock.mockImplementation(async ({ taskId, update }) => {
    apiItems = apiItems.map((item) => (item.id === taskId ? {
      ...item,
      title: update.title ?? item.title,
      description: update.description === null ? undefined : update.description ?? item.description,
      estimateMinutes: update.estimateMinutes ?? item.estimateMinutes,
      status: update.status ?? item.status,
      workspace: update.workspaceId === null ? undefined : update.workspaceId ?? item.workspace,
    } : item))
    const item = apiItems.find((candidate) => candidate.id === taskId)!
    return {
      id: item.id,
      title: item.title,
      description: item.description,
      status: item.status === "doing" || item.status === "done" || item.status === "canceled" ? item.status : "todo",
      priority: update.priority ?? "medium",
      scheduledStartAt: item.startAt,
      scheduledEndAt: item.endAt,
      estimateMinutes: item.estimateMinutes,
      workspaceId: item.workspace,
      createdAt: 1,
      updatedAt: 2,
    } satisfies PlannerTaskRecord
  })
  scheduleCalendarTaskMock.mockImplementation(async ({ taskId, schedule }) => {
    apiItems = apiItems.map((item) => (item.id === taskId ? {
      ...item,
      startAt: schedule.scheduledStartAt === null ? undefined : schedule.scheduledStartAt ?? item.startAt,
      endAt: schedule.scheduledEndAt === null ? undefined : schedule.scheduledEndAt ?? item.endAt,
    } : item))
    const item = apiItems.find((candidate) => candidate.id === taskId)!
    return {
      id: item.id,
      title: item.title,
      description: item.description,
      status: item.status === "doing" || item.status === "done" || item.status === "canceled" ? item.status : "todo",
      priority: "medium",
      scheduledStartAt: item.startAt,
      scheduledEndAt: item.endAt,
      estimateMinutes: item.estimateMinutes,
      workspaceId: item.workspace,
      createdAt: 1,
      updatedAt: 2,
    } satisfies PlannerTaskRecord
  })
  createCalendarEventMock.mockImplementation(async (input) => {
    const created: CalendarApiItem = {
      id: "evt_created",
      entityId: "evt_created",
      entityType: "event",
      sourceId: input.sourceId,
      title: input.title,
      description: input.description,
      startAt: input.startAt,
      endAt: input.endAt,
      allDay: input.allDay ?? false,
      color: "#3f7af0",
      status: "scheduled",
      isReadOnly: false,
      isSuggestion: false,
    }
    apiItems = [created, ...apiItems]
    return {
      id: created.id,
      sourceId: created.sourceId,
      title: created.title,
      description: created.description,
      startAt: created.startAt!,
      endAt: created.endAt!,
      allDay: created.allDay,
      timezone: input.timezone ?? "UTC",
      attendees: [],
      linkedPageIds: [],
      createdAt: 1,
      updatedAt: 1,
    } satisfies CalendarEventRecord
  })
  createCalendarTaskMock.mockImplementation(async (input) => {
    const created: CalendarApiItem = {
      id: "tsk_created",
      entityId: "tsk_created",
      entityType: "task",
      sourceId: "tasks",
      title: input.title,
      description: input.description,
      allDay: false,
      color: "#8a5cf6",
      estimateMinutes: input.estimateMinutes,
      status: input.status ?? "todo",
      isReadOnly: false,
      isSuggestion: false,
      workspace: input.workspaceId,
    }
    apiItems = [created, ...apiItems]
    return {
      id: created.id,
      title: created.title,
      description: created.description,
      status: "todo",
      priority: input.priority ?? "medium",
      estimateMinutes: created.estimateMinutes,
      workspaceId: created.workspace,
      createdAt: 1,
      updatedAt: 1,
    } satisfies PlannerTaskRecord
  })
})

describe("CalendarPage", () => {
  it("loads API calendar events and switches persisted source visibility", async () => {
    render(<CalendarPage />)

    expect(screen.getByRole("region", { name: "Calendar" })).toBeInTheDocument()
    expect(screen.getByRole("complementary", { name: "Calendar sources" })).toBeInTheDocument()
    expect(screen.getByRole("main", { name: "week calendar view" })).toBeInTheDocument()
    expect(await screen.findAllByText("Weekly product sync")).not.toHaveLength(0)

    fireEvent.click(screen.getByRole("button", { name: /^Work/ }))

    await waitFor(() => expect(updateCalendarSourceMock).toHaveBeenCalledWith({
      sourceId: "work",
      update: { enabled: false },
    }))
    await waitFor(() => expect(screen.queryByText("Weekly product sync")).not.toBeInTheDocument())
  })

  it("persists local calendar event title edits", async () => {
    render(<CalendarPage />)

    const detailPanel = screen.getByRole("complementary", { name: "Calendar details" })
    const titleInput = await within(detailPanel).findByDisplayValue("Weekly product sync")
    fireEvent.change(titleInput, { target: { value: "Renamed product sync" } })

    await waitFor(() => expect(updateCalendarEventMock).toHaveBeenCalledWith({
      eventId: "evt_weekly_sync",
      update: { title: "Renamed product sync" },
    }))
  })

  it("persists planner task title and status edits", async () => {
    render(<CalendarPage />)

    fireEvent.click(await screen.findByText("Connect tasks to calendar source"))

    const detailPanel = screen.getByRole("complementary", { name: "Calendar details" })
    const titleInput = await within(detailPanel).findByDisplayValue("Connect tasks to calendar source")
    fireEvent.change(titleInput, { target: { value: "Connect real tasks to calendar" } })

    await waitFor(() => expect(updateCalendarTaskMock).toHaveBeenCalledWith({
      taskId: "tsk_calendar_spec",
      update: { title: "Connect real tasks to calendar" },
    }))

    fireEvent.change(within(detailPanel).getByDisplayValue("Todo"), { target: { value: "doing" } })

    await waitFor(() => expect(updateCalendarTaskMock).toHaveBeenCalledWith({
      taskId: "tsk_calendar_spec",
      update: { status: "doing" },
    }))
  })

  it("creates and accepts Agent suggested blocks without the API suggestion model", async () => {
    render(<CalendarPage />)

    await screen.findByText("Connect tasks to calendar source")
    fireEvent.click(screen.getByRole("button", { name: "Ask Agent" }))

    const detailPanel = screen.getByRole("complementary", { name: "Calendar details" })
    expect(await within(detailPanel).findByText("Suggestion")).toBeInTheDocument()
    expect(within(detailPanel).getByText("Connect tasks to calendar source")).toBeInTheDocument()

    fireEvent.click(within(detailPanel).getByRole("button", { name: "Accept suggestion" }))

    await waitFor(() => expect(scheduleCalendarTaskMock).toHaveBeenCalledWith({
      taskId: "tsk_calendar_spec",
      schedule: expect.objectContaining({
        scheduledStartAt: expect.any(Number),
        scheduledEndAt: expect.any(Number),
      }),
    }))
    expect(within(detailPanel).getByText("Task")).toBeInTheDocument()
    expect(within(detailPanel).queryByRole("button", { name: "Accept suggestion" })).not.toBeInTheDocument()
  })

  it("adds a persisted local calendar event from quick add", async () => {
    render(<CalendarPage />)

    await screen.findByRole("button", { name: /^Work/ })
    fireEvent.change(screen.getByRole("textbox", { name: "Add event or task" }), {
      target: { value: "Prototype check at 15:00" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Add calendar item" }))

    await waitFor(() => expect(createCalendarEventMock).toHaveBeenCalledWith(expect.objectContaining({
      sourceId: "work",
      title: "Prototype check at 15:00",
    })))
    const detailPanel = screen.getByRole("complementary", { name: "Calendar details" })
    expect(await within(detailPanel).findByDisplayValue("Prototype check at 15:00")).toBeInTheDocument()
    expect(within(detailPanel).getByText("Event")).toBeInTheDocument()
  })

  it("adds a persisted planner task from quick add", async () => {
    render(<CalendarPage />)

    await screen.findByRole("button", { name: /^My Tasks/ })
    fireEvent.change(screen.getByRole("textbox", { name: "Add event or task" }), {
      target: { value: "Write release checklist task" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Add calendar item" }))

    await waitFor(() => expect(createCalendarTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      title: "Write release checklist task",
      status: "todo",
      priority: "medium",
    })))
    const detailPanel = screen.getByRole("complementary", { name: "Calendar details" })
    expect(await within(detailPanel).findByDisplayValue("Write release checklist task")).toBeInTheDocument()
    expect(within(detailPanel).getByText("Task")).toBeInTheDocument()
  })

  it("shows an error state when the local agent API is unavailable", async () => {
    listCalendarSourcesMock.mockRejectedValue(new Error("API offline"))
    listCalendarItemsMock.mockRejectedValue(new Error("API offline"))

    render(<CalendarPage />)

    expect(await screen.findByRole("alert")).toHaveTextContent("Calendar data unavailable: API offline")
    expect(screen.getAllByText("Mobile release target").length).toBeGreaterThan(0)
  })
})
