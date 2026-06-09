import z from "zod"
import * as db from "#database/Sqlite.ts"
import * as Identifier from "#id/id.ts"

export const CalendarSourceKind = z.enum([
  "external_calendar",
  "task_database",
  "project_database",
  "reminder_database",
  "agent_plan",
])
export type CalendarSourceKind = z.output<typeof CalendarSourceKind>

export const CalendarEntityType = z.enum(["event", "task", "project", "reminder", "agent_suggestion"])
export type CalendarEntityType = z.output<typeof CalendarEntityType>

export const PlannerTaskStatus = z.enum(["todo", "doing", "done", "canceled"])
export type PlannerTaskStatus = z.output<typeof PlannerTaskStatus>

export const PlannerTaskPriority = z.enum(["low", "medium", "high"])
export type PlannerTaskPriority = z.output<typeof PlannerTaskPriority>

export const CalendarSource = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  kind: CalendarSourceKind,
  enabled: z.boolean(),
  color: z.string().trim().min(1),
  subtitle: z.string().trim().min(1),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})
export type CalendarSource = z.output<typeof CalendarSource>

export const CalendarEvent = z.object({
  id: Identifier.schema("event"),
  sourceId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().optional(),
  startAt: z.number().int().nonnegative(),
  endAt: z.number().int().nonnegative(),
  allDay: z.boolean(),
  timezone: z.string().trim().min(1),
  location: z.string().optional(),
  meetingUrl: z.string().optional(),
  attendees: z.array(z.string()),
  linkedPageIds: z.array(z.string()),
  linkedWorkspaceId: z.string().optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})
export type CalendarEvent = z.output<typeof CalendarEvent>

export const PlannerTask = z.object({
  id: Identifier.schema("task"),
  title: z.string().trim().min(1),
  description: z.string().optional(),
  status: PlannerTaskStatus,
  priority: PlannerTaskPriority,
  dueAt: z.number().int().nonnegative().optional(),
  scheduledStartAt: z.number().int().nonnegative().optional(),
  scheduledEndAt: z.number().int().nonnegative().optional(),
  estimateMinutes: z.number().int().positive().optional(),
  workspaceId: z.string().optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})
export type PlannerTask = z.output<typeof PlannerTask>

export const CalendarItem = z.object({
  id: z.string(),
  sourceId: z.string(),
  entityType: CalendarEntityType,
  entityId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  startAt: z.number().int().nonnegative().optional(),
  endAt: z.number().int().nonnegative().optional(),
  allDay: z.boolean(),
  color: z.string(),
  estimateMinutes: z.number().int().positive().optional(),
  status: z.string().optional(),
  isReadOnly: z.boolean(),
  isSuggestion: z.boolean(),
  workspace: z.string().optional(),
})
export type CalendarItem = z.output<typeof CalendarItem>

const CALENDAR_SOURCES_TABLE = "calendar_sources"
const CALENDAR_EVENTS_TABLE = "calendar_events"
const PLANNER_TASKS_TABLE = "planner_tasks"
export const TASK_SOURCE_ID = "tasks"
let calendarTablesGeneration = -1

const DEFAULT_SOURCES = [
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
    id: TASK_SOURCE_ID,
    name: "My Tasks",
    subtitle: "Anybox task source",
    kind: "task_database",
    color: "#8a5cf6",
    enabled: true,
  },
] satisfies Array<Omit<CalendarSource, "createdAt" | "updatedAt">>

function ensureCalendarTables() {
  const generation = db.getDatabaseGeneration()
  if (calendarTablesGeneration === generation && generation > 0) return

  db.syncTableColumnsWithZodObject(CALENDAR_SOURCES_TABLE, CalendarSource)
  db.syncTableColumnsWithZodObject(CALENDAR_EVENTS_TABLE, CalendarEvent)
  db.syncTableColumnsWithZodObject(PLANNER_TASKS_TABLE, PlannerTask)

  db.db.run(`
    CREATE INDEX IF NOT EXISTS "idx_calendar_events_range"
    ON "calendar_events" ("sourceId", "startAt", "endAt");
  `)
  db.db.run(`
    CREATE INDEX IF NOT EXISTS "idx_calendar_sources_enabled"
    ON "calendar_sources" ("enabled");
  `)
  db.db.run(`
    CREATE INDEX IF NOT EXISTS "idx_planner_tasks_schedule"
    ON "planner_tasks" ("scheduledStartAt", "scheduledEndAt");
  `)
  db.db.run(`
    CREATE INDEX IF NOT EXISTS "idx_planner_tasks_status"
    ON "planner_tasks" ("status", "updatedAt");
  `)

  seedDefaultSources()
  calendarTablesGeneration = db.getDatabaseGeneration()
}

function seedDefaultSources() {
  const now = Date.now()
  for (const [index, source] of DEFAULT_SOURCES.entries()) {
    if (db.findById(CALENDAR_SOURCES_TABLE, CalendarSource, source.id)) continue
    db.insertOneWithSchema(
      CALENDAR_SOURCES_TABLE,
      CalendarSource.parse({
        ...source,
        createdAt: now + index,
        updatedAt: now + index,
      }),
      CalendarSource,
    )
  }
}

export function createCalendarEventID() {
  return Identifier.descending("event")
}

export function createPlannerTaskID() {
  return Identifier.descending("task")
}

export function listSources() {
  ensureCalendarTables()
  return db.findManyWithSchema(CALENDAR_SOURCES_TABLE, CalendarSource, {
    orderBy: [{ column: "createdAt", direction: "ASC" }],
  })
}

export function getSource(id: string) {
  ensureCalendarTables()
  return db.findById(CALENDAR_SOURCES_TABLE, CalendarSource, id)
}

export function updateSourceRecord(source: CalendarSource) {
  ensureCalendarTables()
  db.updateByIdWithSchema(CALENDAR_SOURCES_TABLE, source.id, source, CalendarSource)
  return source
}

export function insertEvent(event: CalendarEvent) {
  ensureCalendarTables()
  db.insertOneWithSchema(CALENDAR_EVENTS_TABLE, event, CalendarEvent)
  return event
}

export function updateEventRecord(event: CalendarEvent) {
  ensureCalendarTables()
  db.updateByIdWithSchema(CALENDAR_EVENTS_TABLE, event.id, event, CalendarEvent)
  return event
}

export function getEvent(id: string) {
  ensureCalendarTables()
  return db.findById(CALENDAR_EVENTS_TABLE, CalendarEvent, id)
}

export function deleteEvent(id: string) {
  ensureCalendarTables()
  return db.deleteById(CALENDAR_EVENTS_TABLE, id)
}

export function listTasks() {
  ensureCalendarTables()
  return db.findManyWithSchema(PLANNER_TASKS_TABLE, PlannerTask, {
    orderBy: [
      { column: "createdAt", direction: "DESC" },
      { column: "id", direction: "ASC" },
    ],
  })
}

export function getTask(id: string) {
  ensureCalendarTables()
  return db.findById(PLANNER_TASKS_TABLE, PlannerTask, id)
}

export function insertTask(task: PlannerTask) {
  ensureCalendarTables()
  db.insertOneWithSchema(PLANNER_TASKS_TABLE, task, PlannerTask)
  return task
}

export function updateTaskRecord(task: PlannerTask) {
  ensureCalendarTables()
  db.updateByIdWithSchema(PLANNER_TASKS_TABLE, task.id, task, PlannerTask)
  return task
}

export function deleteTask(id: string) {
  ensureCalendarTables()
  return db.deleteById(PLANNER_TASKS_TABLE, id)
}

export function listEvents(input: {
  startAt?: number
  endAt?: number
  sourceIds?: string[]
} = {}) {
  ensureCalendarTables()
  const sourceIdSet = new Set(input.sourceIds?.filter(Boolean))
  return db.findManyWithSchema(CALENDAR_EVENTS_TABLE, CalendarEvent, {
    orderBy: [
      { column: "startAt", direction: "ASC" },
      { column: "id", direction: "ASC" },
    ],
  }).filter((event) => {
    if (sourceIdSet.size > 0 && !sourceIdSet.has(event.sourceId)) return false
    if (input.startAt !== undefined && event.endAt < input.startAt) return false
    if (input.endAt !== undefined && event.startAt > input.endAt) return false
    return true
  })
}

export function listItems(input: {
  startAt?: number
  endAt?: number
  sourceIds?: string[]
} = {}) {
  const sources = listSources()
  const enabledSourceIds = new Set(sources.filter((source) => source.enabled).map((source) => source.id))
  const sourceById = new Map(sources.map((source) => [source.id, source]))
  const hasSourceFilter = input.sourceIds !== undefined && input.sourceIds.length > 0
  const requestedSourceIds = input.sourceIds?.filter((sourceId) => enabledSourceIds.has(sourceId))
  if (hasSourceFilter && requestedSourceIds?.length === 0) return []
  const effectiveSourceIds = hasSourceFilter ? requestedSourceIds ?? [] : [...enabledSourceIds]
  const events = listEvents({
    startAt: input.startAt,
    endAt: input.endAt,
    sourceIds: effectiveSourceIds,
  })
  const taskSource = sourceById.get(TASK_SOURCE_ID)
  const shouldIncludeTasks = effectiveSourceIds.includes(TASK_SOURCE_ID)

  const eventItems = events
    .filter((event) => enabledSourceIds.has(event.sourceId))
    .map((event) => toCalendarItem(event, sourceById.get(event.sourceId)))

  const taskItems = shouldIncludeTasks && taskSource?.enabled
    ? listTasks()
        .filter((task) => taskMatchesRange(task, input))
        .map((task) => toTaskCalendarItem(task, taskSource))
    : []

  return [...eventItems, ...taskItems]
}

export function toCalendarItem(event: CalendarEvent, source?: CalendarSource): CalendarItem {
  return CalendarItem.parse({
    id: event.id,
    sourceId: event.sourceId,
    entityType: "event",
    entityId: event.id,
    title: event.title,
    description: event.description,
    startAt: event.startAt,
    endAt: event.endAt,
    allDay: event.allDay,
    color: source?.color ?? "#64748b",
    status: "scheduled",
    isReadOnly: false,
    isSuggestion: false,
    workspace: event.linkedWorkspaceId,
  })
}

export function toTaskCalendarItem(task: PlannerTask, source?: CalendarSource): CalendarItem {
  return CalendarItem.parse({
    id: task.id,
    sourceId: TASK_SOURCE_ID,
    entityType: "task",
    entityId: task.id,
    title: task.title,
    description: task.description,
    startAt: task.scheduledStartAt,
    endAt: task.scheduledEndAt,
    allDay: false,
    color: source?.color ?? "#8a5cf6",
    estimateMinutes: task.estimateMinutes,
    status: task.status,
    isReadOnly: false,
    isSuggestion: false,
    workspace: task.workspaceId,
  })
}

function taskMatchesRange(task: PlannerTask, input: { startAt?: number; endAt?: number }) {
  if (task.scheduledStartAt === undefined || task.scheduledEndAt === undefined) return true
  if (input.startAt !== undefined && task.scheduledEndAt < input.startAt) return false
  if (input.endAt !== undefined && task.scheduledStartAt > input.endAt) return false
  return true
}
