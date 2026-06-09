import z from "zod"
import * as Calendar from "#calendar/calendar.ts"
import { ApiError } from "#server/error.ts"

const TrimmedString = z.string().transform((value) => value.trim()).pipe(z.string().min(1))

const OptionalTrimmedString = z.string().transform((value) => value.trim()).pipe(z.string()).optional()

const TimestampInput = z
  .union([z.string(), z.number()])
  .transform((value) => Number(value))
  .pipe(z.number().int().nonnegative())

const NullableTimestampInput = z.union([TimestampInput, z.null()])

function splitSourceIds(value: string | undefined) {
  return value
    ?.split(",")
    .map((sourceId) => sourceId.trim())
    .filter(Boolean)
}

export const ListCalendarItemsQuery = z.object({
  startAt: TimestampInput.optional(),
  endAt: TimestampInput.optional(),
  sourceIds: z.string().optional().transform(splitSourceIds),
})

export const UpdateCalendarSourceBody = z.object({
  name: TrimmedString.optional(),
  enabled: z.boolean().optional(),
  color: TrimmedString.optional(),
  subtitle: TrimmedString.optional(),
})

export const CreateCalendarEventBody = z.object({
  sourceId: TrimmedString,
  title: TrimmedString,
  description: OptionalTrimmedString,
  startAt: TimestampInput,
  endAt: TimestampInput,
  allDay: z.boolean().optional().default(false),
  timezone: TrimmedString.optional().default("UTC"),
  location: OptionalTrimmedString,
  meetingUrl: OptionalTrimmedString,
  attendees: z.array(z.string()).optional().default([]),
  linkedPageIds: z.array(z.string()).optional().default([]),
  linkedWorkspaceId: OptionalTrimmedString,
})

export const UpdateCalendarEventBody = z.object({
  sourceId: TrimmedString.optional(),
  title: TrimmedString.optional(),
  description: OptionalTrimmedString,
  startAt: TimestampInput.optional(),
  endAt: TimestampInput.optional(),
  allDay: z.boolean().optional(),
  timezone: TrimmedString.optional(),
  location: OptionalTrimmedString,
  meetingUrl: OptionalTrimmedString,
  attendees: z.array(z.string()).optional(),
  linkedPageIds: z.array(z.string()).optional(),
  linkedWorkspaceId: OptionalTrimmedString,
})

export const CreateCalendarTaskBody = z.object({
  title: TrimmedString,
  description: OptionalTrimmedString,
  status: Calendar.PlannerTaskStatus.optional().default("todo"),
  priority: Calendar.PlannerTaskPriority.optional().default("medium"),
  dueAt: TimestampInput.optional(),
  scheduledStartAt: TimestampInput.optional(),
  scheduledEndAt: TimestampInput.optional(),
  estimateMinutes: z.number().int().positive().optional().default(60),
  workspaceId: OptionalTrimmedString,
})

export const UpdateCalendarTaskBody = z.object({
  title: TrimmedString.optional(),
  description: OptionalTrimmedString.or(z.null()).optional(),
  status: Calendar.PlannerTaskStatus.optional(),
  priority: Calendar.PlannerTaskPriority.optional(),
  dueAt: NullableTimestampInput.optional(),
  scheduledStartAt: NullableTimestampInput.optional(),
  scheduledEndAt: NullableTimestampInput.optional(),
  estimateMinutes: z.number().int().positive().optional(),
  workspaceId: OptionalTrimmedString.or(z.null()).optional(),
})

export const ScheduleCalendarTaskBody = z.object({
  scheduledStartAt: NullableTimestampInput.optional(),
  scheduledEndAt: NullableTimestampInput.optional(),
})

type CreateCalendarEventInput = z.output<typeof CreateCalendarEventBody>
type UpdateCalendarEventInput = z.output<typeof UpdateCalendarEventBody>
type UpdateCalendarSourceInput = z.output<typeof UpdateCalendarSourceBody>
type CreateCalendarTaskInput = z.output<typeof CreateCalendarTaskBody>
type UpdateCalendarTaskInput = z.output<typeof UpdateCalendarTaskBody>
type ScheduleCalendarTaskInput = z.output<typeof ScheduleCalendarTaskBody>

function requireSource(id: string) {
  const source = Calendar.getSource(id)
  if (!source) throw new ApiError(404, "CALENDAR_SOURCE_NOT_FOUND", `Calendar source '${id}' not found`)
  return source
}

function requireEventSource(id: string) {
  const source = requireSource(id)
  if (source.kind !== "external_calendar") {
    throw new ApiError(400, "INVALID_CALENDAR_EVENT_SOURCE", "Calendar events must use an external_calendar source")
  }
  return source
}

function requireEvent(id: string) {
  const event = Calendar.getEvent(id)
  if (!event) throw new ApiError(404, "CALENDAR_EVENT_NOT_FOUND", `Calendar event '${id}' not found`)
  return event
}

function requireTask(id: string) {
  const task = Calendar.getTask(id)
  if (!task) throw new ApiError(404, "CALENDAR_TASK_NOT_FOUND", `Calendar task '${id}' not found`)
  return task
}

function validateEventRange(input: { startAt: number; endAt: number }) {
  if (input.endAt < input.startAt) {
    throw new ApiError(400, "INVALID_CALENDAR_EVENT_RANGE", "Calendar event endAt must be greater than or equal to startAt")
  }
}

function validateTaskSchedule(input: { scheduledStartAt?: number; scheduledEndAt?: number }) {
  if (input.scheduledStartAt === undefined && input.scheduledEndAt === undefined) return
  if (input.scheduledStartAt === undefined || input.scheduledEndAt === undefined) {
    throw new ApiError(400, "INVALID_CALENDAR_TASK_SCHEDULE", "Calendar task schedule must include both scheduledStartAt and scheduledEndAt")
  }
  if (input.scheduledEndAt < input.scheduledStartAt) {
    throw new ApiError(400, "INVALID_CALENDAR_TASK_SCHEDULE", "Calendar task scheduledEndAt must be greater than or equal to scheduledStartAt")
  }
}

export function listSources() {
  return Calendar.listSources()
}

export function updateSource(id: string, input: UpdateCalendarSourceInput) {
  const existing = requireSource(id)
  const now = Date.now()
  return Calendar.updateSourceRecord(Calendar.CalendarSource.parse({
    ...existing,
    ...input,
    updatedAt: now,
  }))
}

export function listItems(input: z.output<typeof ListCalendarItemsQuery>) {
  if (input.startAt !== undefined && input.endAt !== undefined && input.endAt < input.startAt) {
    throw new ApiError(400, "INVALID_CALENDAR_RANGE", "Calendar range endAt must be greater than or equal to startAt")
  }
  return Calendar.listItems(input)
}

export function createEvent(input: CreateCalendarEventInput) {
  requireEventSource(input.sourceId)
  validateEventRange(input)
  const now = Date.now()
  return Calendar.insertEvent(Calendar.CalendarEvent.parse({
    id: Calendar.createCalendarEventID(),
    sourceId: input.sourceId,
    title: input.title,
    description: input.description || undefined,
    startAt: input.startAt,
    endAt: input.endAt,
    allDay: input.allDay,
    timezone: input.timezone,
    location: input.location || undefined,
    meetingUrl: input.meetingUrl || undefined,
    attendees: input.attendees,
    linkedPageIds: input.linkedPageIds,
    linkedWorkspaceId: input.linkedWorkspaceId || undefined,
    createdAt: now,
    updatedAt: now,
  }))
}

export function updateEvent(id: string, input: UpdateCalendarEventInput) {
  const existing = requireEvent(id)
  if (input.sourceId) requireEventSource(input.sourceId)
  const next = Calendar.CalendarEvent.parse({
    ...existing,
    ...input,
    description: input.description === "" ? undefined : input.description ?? existing.description,
    location: input.location === "" ? undefined : input.location ?? existing.location,
    meetingUrl: input.meetingUrl === "" ? undefined : input.meetingUrl ?? existing.meetingUrl,
    linkedWorkspaceId: input.linkedWorkspaceId === "" ? undefined : input.linkedWorkspaceId ?? existing.linkedWorkspaceId,
    updatedAt: Date.now(),
  })
  validateEventRange(next)
  return Calendar.updateEventRecord(next)
}

export function deleteEvent(id: string) {
  requireEvent(id)
  Calendar.deleteEvent(id)
  return {
    eventID: id,
    deleted: true,
  }
}

export function listTasks() {
  return Calendar.listTasks()
}

export function createTask(input: CreateCalendarTaskInput) {
  validateTaskSchedule(input)
  const now = Date.now()
  return Calendar.insertTask(Calendar.PlannerTask.parse({
    id: Calendar.createPlannerTaskID(),
    title: input.title,
    description: input.description || undefined,
    status: input.status,
    priority: input.priority,
    dueAt: input.dueAt,
    scheduledStartAt: input.scheduledStartAt,
    scheduledEndAt: input.scheduledEndAt,
    estimateMinutes: input.estimateMinutes,
    workspaceId: input.workspaceId || undefined,
    createdAt: now,
    updatedAt: now,
  }))
}

export function updateTask(id: string, input: UpdateCalendarTaskInput) {
  const existing = requireTask(id)
  const next = Calendar.PlannerTask.parse({
    ...existing,
    ...input,
    description: input.description === "" || input.description === null
      ? undefined
      : input.description ?? existing.description,
    dueAt: input.dueAt === null ? undefined : input.dueAt ?? existing.dueAt,
    scheduledStartAt: input.scheduledStartAt === null
      ? undefined
      : input.scheduledStartAt ?? existing.scheduledStartAt,
    scheduledEndAt: input.scheduledEndAt === null
      ? undefined
      : input.scheduledEndAt ?? existing.scheduledEndAt,
    workspaceId: input.workspaceId === "" || input.workspaceId === null
      ? undefined
      : input.workspaceId ?? existing.workspaceId,
    updatedAt: Date.now(),
  })
  validateTaskSchedule(next)
  return Calendar.updateTaskRecord(next)
}

export function scheduleTask(id: string, input: ScheduleCalendarTaskInput) {
  const existing = requireTask(id)
  const clearSchedule = input.scheduledStartAt === null || input.scheduledEndAt === null
  const next = Calendar.PlannerTask.parse({
    ...existing,
    scheduledStartAt: clearSchedule
      ? undefined
      : input.scheduledStartAt ?? existing.scheduledStartAt,
    scheduledEndAt: clearSchedule
      ? undefined
      : input.scheduledEndAt ?? existing.scheduledEndAt,
    updatedAt: Date.now(),
  })
  validateTaskSchedule(next)
  return Calendar.updateTaskRecord(next)
}

export function deleteTask(id: string) {
  requireTask(id)
  Calendar.deleteTask(id)
  return {
    taskID: id,
    deleted: true,
  }
}
