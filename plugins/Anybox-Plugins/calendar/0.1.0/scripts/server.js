#!/usr/bin/env node

const readline = require("node:readline")

const DEFAULT_AGENT_BASE_URL = "http://127.0.0.1:4096"

function timestampSchema(description) {
  return {
    anyOf: [
      { type: "integer" },
      { type: "string" }
    ],
    description
  }
}

function nullableTimestampSchema(description) {
  return {
    anyOf: [
      { type: "integer" },
      { type: "string" },
      { type: "null" }
    ],
    description
  }
}

function nullableStringSchema(description) {
  return {
    anyOf: [
      { type: "string" },
      { type: "null" }
    ],
    description
  }
}

function idSchema(description) {
  return { type: "string", description }
}

const todoInputSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: "Todo title." },
    description: { type: "string", description: "Optional todo description." },
    status: {
      type: "string",
      enum: ["todo", "doing", "done", "canceled"],
      description: "Todo status. Defaults to todo."
    },
    priority: {
      type: "string",
      enum: ["low", "medium", "high"],
      description: "Todo priority. Defaults to medium."
    },
    dueAt: timestampSchema("Optional due time as a millisecond timestamp or ISO-8601 string."),
    reminderAt: timestampSchema("Optional reminder time as a millisecond timestamp or ISO-8601 string."),
    scheduledStartAt: timestampSchema("Optional scheduled start time as a millisecond timestamp or ISO-8601 string."),
    scheduledEndAt: timestampSchema("Optional scheduled end time as a millisecond timestamp or ISO-8601 string."),
    estimateMinutes: {
      type: "integer",
      minimum: 1,
      description: "Estimated duration in minutes. Defaults to 60."
    },
    workspaceId: { type: "string", description: "Optional linked workspace id." },
    properties: {
      type: "object",
      additionalProperties: true,
      description: "Optional custom todo properties."
    },
    timezone: { type: "string", description: "Optional timezone name." }
  },
  required: ["title"],
  additionalProperties: false
}

const eventInputSchema = {
  type: "object",
  properties: {
    sourceId: {
      type: "string",
      description: "Calendar source id. Defaults to work."
    },
    title: { type: "string", description: "Event title." },
    description: { type: "string", description: "Optional event description." },
    status: {
      type: "string",
      enum: ["scheduled", "canceled"],
      description: "Event status. Defaults to scheduled."
    },
    startAt: timestampSchema("Event start time as a millisecond timestamp or ISO-8601 string."),
    endAt: timestampSchema("Event end time as a millisecond timestamp or ISO-8601 string."),
    allDay: { type: "boolean", description: "Whether the event is all-day. Defaults to false." },
    timezone: { type: "string", description: "Event timezone. Defaults to UTC." },
    location: { type: "string", description: "Optional event location." },
    meetingUrl: { type: "string", description: "Optional meeting URL." },
    attendees: {
      type: "array",
      items: { type: "string" },
      description: "Optional event attendees."
    },
    linkedPageIds: {
      type: "array",
      items: { type: "string" },
      description: "Optional linked page ids."
    },
    linkedWorkspaceId: { type: "string", description: "Optional linked workspace id." }
  },
  required: ["title", "startAt", "endAt"],
  additionalProperties: false
}

const listInputSchema = {
  type: "object",
  properties: {
    startAt: timestampSchema("Optional range start as a millisecond timestamp or ISO-8601 string."),
    endAt: timestampSchema("Optional range end as a millisecond timestamp or ISO-8601 string."),
    sourceIds: {
      type: "array",
      items: { type: "string" },
      description: "Optional Calendar source ids to include."
    }
  },
  additionalProperties: false
}

const emptyInputSchema = {
  type: "object",
  properties: {},
  additionalProperties: false
}

const sourceUpdateInputSchema = {
  type: "object",
  properties: {
    sourceId: idSchema("Calendar source id to update."),
    name: { type: "string", description: "Optional source display name." },
    enabled: { type: "boolean", description: "Whether this source appears in Calendar item projections." },
    color: { type: "string", description: "Optional source color." },
    subtitle: { type: "string", description: "Optional source subtitle." }
  },
  required: ["sourceId"],
  additionalProperties: false
}

const eventUpdateInputSchema = {
  type: "object",
  properties: {
    eventId: idSchema("Calendar event id to update."),
    sourceId: { type: "string", description: "Optional Calendar source id." },
    title: { type: "string", description: "Optional event title." },
    description: nullableStringSchema("Optional event description. Pass null or an empty string to clear."),
    status: {
      type: "string",
      enum: ["scheduled", "canceled"],
      description: "Optional event status."
    },
    startAt: timestampSchema("Optional event start time as a millisecond timestamp or ISO-8601 string."),
    endAt: timestampSchema("Optional event end time as a millisecond timestamp or ISO-8601 string."),
    allDay: { type: "boolean", description: "Whether the event is all-day." },
    timezone: { type: "string", description: "Optional event timezone." },
    location: nullableStringSchema("Optional event location. Pass null or an empty string to clear."),
    meetingUrl: nullableStringSchema("Optional meeting URL. Pass null or an empty string to clear."),
    attendees: {
      type: "array",
      items: { type: "string" },
      description: "Optional event attendees."
    },
    linkedPageIds: {
      type: "array",
      items: { type: "string" },
      description: "Optional linked page ids."
    },
    linkedWorkspaceId: nullableStringSchema("Optional linked workspace id. Pass null or an empty string to clear.")
  },
  required: ["eventId"],
  additionalProperties: false
}

const eventIdInputSchema = {
  type: "object",
  properties: {
    eventId: idSchema("Calendar event id.")
  },
  required: ["eventId"],
  additionalProperties: false
}

const todoUpdateInputSchema = {
  type: "object",
  properties: {
    todoId: idSchema("Calendar todo/task id to update."),
    title: { type: "string", description: "Optional todo title." },
    description: nullableStringSchema("Optional todo description. Pass null or an empty string to clear."),
    status: {
      type: "string",
      enum: ["todo", "doing", "done", "canceled"],
      description: "Optional todo status."
    },
    priority: {
      type: "string",
      enum: ["low", "medium", "high"],
      description: "Optional todo priority."
    },
    dueAt: nullableTimestampSchema("Optional due time as a millisecond timestamp or ISO-8601 string. Pass null to clear."),
    reminderAt: nullableTimestampSchema("Optional reminder time as a millisecond timestamp or ISO-8601 string. Pass null to clear."),
    scheduledStartAt: nullableTimestampSchema("Optional scheduled start time as a millisecond timestamp or ISO-8601 string. Pass null to clear."),
    scheduledEndAt: nullableTimestampSchema("Optional scheduled end time as a millisecond timestamp or ISO-8601 string. Pass null to clear."),
    estimateMinutes: {
      type: "integer",
      minimum: 1,
      description: "Optional estimated duration in minutes."
    },
    workspaceId: nullableStringSchema("Optional linked workspace id. Pass null or an empty string to clear."),
    properties: {
      type: "object",
      additionalProperties: true,
      description: "Optional custom todo properties."
    },
    timezone: nullableStringSchema("Optional timezone name. Pass null or an empty string to clear.")
  },
  required: ["todoId"],
  additionalProperties: false
}

const todoScheduleInputSchema = {
  type: "object",
  properties: {
    todoId: idSchema("Calendar todo/task id to schedule."),
    scheduledStartAt: nullableTimestampSchema("Scheduled start time as a millisecond timestamp or ISO-8601 string. Pass null to clear the schedule."),
    scheduledEndAt: nullableTimestampSchema("Scheduled end time as a millisecond timestamp or ISO-8601 string. Pass null to clear the schedule.")
  },
  required: ["todoId"],
  additionalProperties: false
}

const todoIdInputSchema = {
  type: "object",
  properties: {
    todoId: idSchema("Calendar todo/task id.")
  },
  required: ["todoId"],
  additionalProperties: false
}

const getItemInputSchema = {
  type: "object",
  properties: {
    id: idSchema("Calendar item id, event id, todo item id, or todo/task entity id.")
  },
  required: ["id"],
  additionalProperties: false
}

const freeTimeInputSchema = {
  type: "object",
  properties: {
    startAt: timestampSchema("Search range start as a millisecond timestamp or ISO-8601 string."),
    endAt: timestampSchema("Search range end as a millisecond timestamp or ISO-8601 string."),
    minimumDurationMinutes: {
      type: "integer",
      minimum: 1,
      description: "Minimum free-window duration in minutes. Defaults to 30."
    },
    sourceIds: {
      type: "array",
      items: { type: "string" },
      description: "Optional Calendar source ids to include."
    }
  },
  required: ["startAt", "endAt"],
  additionalProperties: false
}

const tools = [
  {
    name: "calendar_list_sources",
    title: "List Calendar Sources",
    description: "List local Anybox Calendar sources and whether each source is enabled.",
    inputSchema: emptyInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true
    }
  },
  {
    name: "calendar_update_source",
    title: "Update Calendar Source",
    description: "Update a Calendar source name, color, subtitle, or enabled state.",
    inputSchema: sourceUpdateInputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false
    }
  },
  {
    name: "calendar_create_todo",
    title: "Create Calendar Todo",
    description: "Create an Anybox Calendar todo. Time fields accept millisecond timestamps or ISO-8601 strings.",
    inputSchema: todoInputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false
    }
  },
  {
    name: "calendar_create_event",
    title: "Create Calendar Event",
    description: "Create an Anybox Calendar event. sourceId defaults to work. Time fields accept millisecond timestamps or ISO-8601 strings.",
    inputSchema: eventInputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false
    }
  },
  {
    name: "calendar_list_items",
    title: "List Calendar Items",
    description: "List projected Anybox Calendar items for verification.",
    inputSchema: listInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true
    }
  },
  {
    name: "calendar_get_item",
    title: "Get Calendar Item",
    description: "Find a Calendar item by item id, event id, or todo/task entity id.",
    inputSchema: getItemInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true
    }
  },
  {
    name: "calendar_list_todos",
    title: "List Calendar Todos",
    description: "List raw Calendar todos/tasks, including unscheduled todos that do not appear in a time range.",
    inputSchema: emptyInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true
    }
  },
  {
    name: "calendar_update_todo",
    title: "Update Calendar Todo",
    description: "Update a Calendar todo's title, status, priority, due time, reminder, schedule, estimate, workspace, or custom properties.",
    inputSchema: todoUpdateInputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false
    }
  },
  {
    name: "calendar_schedule_todo",
    title: "Schedule Calendar Todo",
    description: "Schedule, reschedule, or unschedule a Calendar todo. Pass null for a schedule field to clear the schedule.",
    inputSchema: todoScheduleInputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false
    }
  },
  {
    name: "calendar_complete_todo",
    title: "Complete Calendar Todo",
    description: "Mark a Calendar todo as done.",
    inputSchema: todoIdInputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false
    }
  },
  {
    name: "calendar_delete_todo",
    title: "Delete Calendar Todo",
    description: "Delete a Calendar todo/task by id.",
    inputSchema: todoIdInputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false
    }
  },
  {
    name: "calendar_update_event",
    title: "Update Calendar Event",
    description: "Update a Calendar event's title, status, time range, location, meeting URL, attendees, source, or linked workspace.",
    inputSchema: eventUpdateInputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false
    }
  },
  {
    name: "calendar_cancel_event",
    title: "Cancel Calendar Event",
    description: "Mark a Calendar event as canceled without deleting its record.",
    inputSchema: eventIdInputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false
    }
  },
  {
    name: "calendar_delete_event",
    title: "Delete Calendar Event",
    description: "Delete a Calendar event by id.",
    inputSchema: eventIdInputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false
    }
  },
  {
    name: "calendar_find_free_time",
    title: "Find Calendar Free Time",
    description: "Find free windows inside a time range from scheduled Calendar items.",
    inputSchema: freeTimeInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true
    }
  }
]

function send(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`)
}

function baseURL() {
  return (
    process.env.ANYBOX_AGENT_BASE_URL ||
    process.env.ANYBOX_CALENDAR_AGENT_BASE_URL ||
    DEFAULT_AGENT_BASE_URL
  ).replace(/\/+$/, "")
}

function textResult(text, structuredContent) {
  return {
    content: [{ type: "text", text }],
    structuredContent,
    isError: false
  }
}

function errorResult(error) {
  const message = error && typeof error.message === "string" ? error.message : String(error)
  const code = error && typeof error.code === "string" ? error.code : "CALENDAR_PLUGIN_ERROR"
  const status = error && Number.isInteger(error.status) ? error.status : undefined

  return {
    content: [{ type: "text", text: message }],
    structuredContent: {
      kind: "calendar_error",
      error: {
        code,
        message,
        status
      }
    },
    isError: true
  }
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  )
}

function encodePathSegment(value) {
  return encodeURIComponent(String(value))
}

function normalizeTimestampValue(value, fieldName) {
  if (value === undefined || value === null) return value
  if (typeof value === "number") {
    if (Number.isInteger(value) && value >= 0) return value
  }
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const numeric = Number(trimmed)
    if (Number.isInteger(numeric) && numeric >= 0) return numeric
    const parsed = Date.parse(trimmed)
    if (Number.isInteger(parsed) && parsed >= 0) return parsed
  }

  const error = new Error(`${fieldName} must be a nonnegative millisecond timestamp or a valid ISO-8601 string.`)
  error.code = "INVALID_CALENDAR_TIMESTAMP"
  throw error
}

function withNormalizedTimestamps(args, fieldNames) {
  const next = { ...(args || {}) }
  for (const fieldName of fieldNames) {
    if (Object.prototype.hasOwnProperty.call(next, fieldName)) {
      next[fieldName] = normalizeTimestampValue(next[fieldName], fieldName)
    }
  }
  return next
}

function normalizeNullableEventText(value) {
  return value === null ? "" : value
}

function calendarItemsPath(args) {
  const search = new URLSearchParams()
  if (args && args.startAt !== undefined) search.set("startAt", String(args.startAt))
  if (args && args.endAt !== undefined) search.set("endAt", String(args.endAt))
  if (args && Array.isArray(args.sourceIds) && args.sourceIds.length > 0) {
    search.set("sourceIds", args.sourceIds.join(","))
  }

  const suffix = search.toString() ? `?${search.toString()}` : ""
  return `/api/calendar/items${suffix}`
}

async function apiRequest(pathname, init = {}) {
  const url = new URL(pathname, `${baseURL()}/`)
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers || {})
    }
  })
  const text = await response.text()
  let body
  try {
    body = text ? JSON.parse(text) : undefined
  } catch {
    body = undefined
  }

  if (!response.ok || !body || body.success !== true) {
    const apiError = body && body.error && typeof body.error === "object" ? body.error : undefined
    const error = new Error(
      apiError && typeof apiError.message === "string"
        ? apiError.message
        : `Calendar API request failed with status ${response.status}`
    )
    error.code = apiError && typeof apiError.code === "string" ? apiError.code : `HTTP_${response.status}`
    error.status = response.status
    throw error
  }

  return body.data
}

async function listSources() {
  const sources = await apiRequest("/api/calendar/sources")
  const structuredContent = {
    kind: "calendar_list_sources_result",
    sourceCount: Array.isArray(sources) ? sources.length : 0,
    sources: Array.isArray(sources) ? sources : []
  }

  return textResult(`Found ${structuredContent.sourceCount} Calendar source(s).`, structuredContent)
}

async function updateSource(args) {
  const sourceId = args && args.sourceId
  const source = await apiRequest(`/api/calendar/sources/${encodePathSegment(sourceId)}`, {
    method: "PATCH",
    body: JSON.stringify(compactObject({
      name: args && args.name,
      enabled: args && args.enabled,
      color: args && args.color,
      subtitle: args && args.subtitle
    }))
  })

  const structuredContent = {
    kind: "calendar_update_source_result",
    updated: true,
    source
  }

  return textResult(`Updated Calendar source '${source.name}' (${source.id}).`, structuredContent)
}

async function createTodo(args) {
  args = withNormalizedTimestamps(args, ["dueAt", "reminderAt", "scheduledStartAt", "scheduledEndAt"])
  const todo = await apiRequest("/api/calendar/todos", {
    method: "POST",
    body: JSON.stringify(compactObject({
      title: args && args.title,
      description: args && args.description,
      status: args && args.status,
      priority: args && args.priority,
      dueAt: args && args.dueAt,
      reminderAt: args && args.reminderAt,
      scheduledStartAt: args && args.scheduledStartAt,
      scheduledEndAt: args && args.scheduledEndAt,
      estimateMinutes: args && args.estimateMinutes,
      workspaceId: args && args.workspaceId,
      properties: args && args.properties,
      timezone: args && args.timezone
    }))
  })

  const structuredContent = {
    kind: "calendar_create_todo_result",
    created: true,
    type: "todo",
    id: todo.id,
    title: todo.title,
    dueAt: todo.dueAt,
    reminderAt: todo.reminderAt,
    scheduledStartAt: todo.scheduledStartAt,
    scheduledEndAt: todo.scheduledEndAt,
    estimateMinutes: todo.estimateMinutes,
    workspaceId: todo.workspaceId,
    timezone: todo.timezone
  }

  return textResult(`Created Calendar todo '${todo.title}' (${todo.id}).`, structuredContent)
}

async function createEvent(args) {
  args = withNormalizedTimestamps(args, ["startAt", "endAt"])
  const event = await apiRequest("/api/calendar/events", {
    method: "POST",
    body: JSON.stringify(compactObject({
      sourceId: args && args.sourceId ? args.sourceId : "work",
      title: args && args.title,
      description: args && args.description,
      status: args && args.status,
      startAt: args && args.startAt,
      endAt: args && args.endAt,
      allDay: args && args.allDay,
      timezone: args && args.timezone,
      location: args && args.location,
      meetingUrl: args && args.meetingUrl,
      attendees: args && args.attendees,
      linkedPageIds: args && args.linkedPageIds,
      linkedWorkspaceId: args && args.linkedWorkspaceId
    }))
  })

  const structuredContent = {
    kind: "calendar_create_event_result",
    created: true,
    type: "event",
    id: event.id,
    title: event.title,
    sourceId: event.sourceId,
    startAt: event.startAt,
    endAt: event.endAt,
    allDay: event.allDay,
    timezone: event.timezone,
    location: event.location,
    meetingUrl: event.meetingUrl,
    linkedWorkspaceId: event.linkedWorkspaceId
  }

  return textResult(`Created Calendar event '${event.title}' (${event.id}).`, structuredContent)
}

async function fetchItems(args) {
  return await apiRequest(calendarItemsPath(args))
}

async function listItems(args) {
  args = withNormalizedTimestamps(args, ["startAt", "endAt"])
  const items = await fetchItems(args)
  const structuredContent = {
    kind: "calendar_list_items_result",
    itemCount: Array.isArray(items) ? items.length : 0,
    items: Array.isArray(items) ? items : []
  }

  return textResult(`Found ${structuredContent.itemCount} Calendar item(s).`, structuredContent)
}

async function getItem(args) {
  const id = args && args.id
  const items = await fetchItems({})
  const item = Array.isArray(items)
    ? items.find((entry) => entry && (entry.id === id || entry.entityId === id))
    : undefined

  if (item) {
    return textResult(`Found Calendar item '${item.title}' (${item.id}).`, {
      kind: "calendar_get_item_result",
      found: true,
      item
    })
  }

  const todos = await apiRequest("/api/calendar/todos")
  const todo = Array.isArray(todos) ? todos.find((entry) => entry && entry.id === id) : undefined
  if (todo) {
    return textResult(`Found Calendar todo '${todo.title}' (${todo.id}).`, {
      kind: "calendar_get_item_result",
      found: true,
      todo
    })
  }

  return textResult(`No Calendar item found for '${id}'.`, {
    kind: "calendar_get_item_result",
    found: false,
    id
  })
}

async function listTodos() {
  const todos = await apiRequest("/api/calendar/todos")
  const structuredContent = {
    kind: "calendar_list_todos_result",
    todoCount: Array.isArray(todos) ? todos.length : 0,
    todos: Array.isArray(todos) ? todos : []
  }

  return textResult(`Found ${structuredContent.todoCount} Calendar todo(s).`, structuredContent)
}

async function updateTodo(args) {
  args = withNormalizedTimestamps(args, ["dueAt", "reminderAt", "scheduledStartAt", "scheduledEndAt"])
  const todoId = args && args.todoId
  const todo = await apiRequest(`/api/calendar/todos/${encodePathSegment(todoId)}`, {
    method: "PATCH",
    body: JSON.stringify(compactObject({
      title: args && args.title,
      description: args && args.description,
      status: args && args.status,
      priority: args && args.priority,
      dueAt: args && args.dueAt,
      reminderAt: args && args.reminderAt,
      scheduledStartAt: args && args.scheduledStartAt,
      scheduledEndAt: args && args.scheduledEndAt,
      estimateMinutes: args && args.estimateMinutes,
      workspaceId: args && args.workspaceId,
      properties: args && args.properties,
      timezone: args && args.timezone
    }))
  })

  const structuredContent = {
    kind: "calendar_update_todo_result",
    updated: true,
    todo
  }

  return textResult(`Updated Calendar todo '${todo.title}' (${todo.id}).`, structuredContent)
}

async function scheduleTodo(args) {
  args = withNormalizedTimestamps(args, ["scheduledStartAt", "scheduledEndAt"])
  const todoId = args && args.todoId
  const todo = await apiRequest(`/api/calendar/todos/${encodePathSegment(todoId)}/schedule`, {
    method: "PATCH",
    body: JSON.stringify(compactObject({
      scheduledStartAt: args && args.scheduledStartAt,
      scheduledEndAt: args && args.scheduledEndAt
    }))
  })

  const scheduled = todo.scheduledStartAt !== undefined && todo.scheduledEndAt !== undefined
  const structuredContent = {
    kind: "calendar_schedule_todo_result",
    scheduled,
    todo
  }

  return textResult(
    scheduled
      ? `Scheduled Calendar todo '${todo.title}' (${todo.id}).`
      : `Unscheduled Calendar todo '${todo.title}' (${todo.id}).`,
    structuredContent
  )
}

async function completeTodo(args) {
  const todoId = args && args.todoId
  const todo = await apiRequest(`/api/calendar/todos/${encodePathSegment(todoId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "done" })
  })

  const structuredContent = {
    kind: "calendar_complete_todo_result",
    completed: true,
    todo
  }

  return textResult(`Completed Calendar todo '${todo.title}' (${todo.id}).`, structuredContent)
}

async function deleteTodo(args) {
  const todoId = args && args.todoId
  const result = await apiRequest(`/api/calendar/todos/${encodePathSegment(todoId)}`, {
    method: "DELETE"
  })

  const structuredContent = {
    kind: "calendar_delete_todo_result",
    deleted: true,
    result
  }

  return textResult(`Deleted Calendar todo '${todoId}'.`, structuredContent)
}

async function updateEvent(args) {
  args = withNormalizedTimestamps(args, ["startAt", "endAt"])
  const eventId = args && args.eventId
  const event = await apiRequest(`/api/calendar/events/${encodePathSegment(eventId)}`, {
    method: "PATCH",
    body: JSON.stringify(compactObject({
      sourceId: args && args.sourceId,
      title: args && args.title,
      description: args && normalizeNullableEventText(args.description),
      status: args && args.status,
      startAt: args && args.startAt,
      endAt: args && args.endAt,
      allDay: args && args.allDay,
      timezone: args && args.timezone,
      location: args && normalizeNullableEventText(args.location),
      meetingUrl: args && normalizeNullableEventText(args.meetingUrl),
      attendees: args && args.attendees,
      linkedPageIds: args && args.linkedPageIds,
      linkedWorkspaceId: args && normalizeNullableEventText(args.linkedWorkspaceId)
    }))
  })

  const structuredContent = {
    kind: "calendar_update_event_result",
    updated: true,
    event
  }

  return textResult(`Updated Calendar event '${event.title}' (${event.id}).`, structuredContent)
}

async function cancelEvent(args) {
  const eventId = args && args.eventId
  const event = await apiRequest(`/api/calendar/events/${encodePathSegment(eventId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "canceled" })
  })

  const structuredContent = {
    kind: "calendar_cancel_event_result",
    canceled: true,
    event
  }

  return textResult(`Canceled Calendar event '${event.title}' (${event.id}).`, structuredContent)
}

async function deleteEvent(args) {
  const eventId = args && args.eventId
  const result = await apiRequest(`/api/calendar/events/${encodePathSegment(eventId)}`, {
    method: "DELETE"
  })

  const structuredContent = {
    kind: "calendar_delete_event_result",
    deleted: true,
    result
  }

  return textResult(`Deleted Calendar event '${eventId}'.`, structuredContent)
}

function isBlockingItem(item) {
  if (!item || item.startAt === undefined || item.endAt === undefined) return false
  if (item.allDay) return false
  if (item.status === "canceled" || item.status === "done") return false
  return item.displayKind === "external_event" || item.displayKind === "scheduled_todo" || item.displayKind === "reminder"
}

function buildFreeWindows(items, startAt, endAt, minimumDurationMinutes) {
  const minimumDurationMs = minimumDurationMinutes * 60 * 1000
  const busyBlocks = items
    .filter(isBlockingItem)
    .map((item) => ({
      itemId: item.id,
      title: item.title,
      startAt: Math.max(item.startAt, startAt),
      endAt: Math.min(item.endAt, endAt)
    }))
    .filter((block) => block.endAt > block.startAt)
    .sort((left, right) => left.startAt - right.startAt || left.endAt - right.endAt)

  const windows = []
  let cursor = startAt
  for (const block of busyBlocks) {
    if (block.endAt <= cursor) continue
    if (block.startAt > cursor && block.startAt - cursor >= minimumDurationMs) {
      windows.push({
        startAt: cursor,
        endAt: block.startAt,
        durationMinutes: Math.floor((block.startAt - cursor) / 60000)
      })
    }
    cursor = Math.max(cursor, block.endAt)
  }

  if (endAt > cursor && endAt - cursor >= minimumDurationMs) {
    windows.push({
      startAt: cursor,
      endAt,
      durationMinutes: Math.floor((endAt - cursor) / 60000)
    })
  }

  return { windows, busyBlocks }
}

async function findFreeTime(args) {
  args = withNormalizedTimestamps(args, ["startAt", "endAt"])
  const startAt = args && args.startAt
  const endAt = args && args.endAt
  if (endAt < startAt) {
    const error = new Error("Calendar free-time search endAt must be greater than or equal to startAt.")
    error.code = "INVALID_CALENDAR_RANGE"
    throw error
  }

  const minimumDurationMinutes = args && args.minimumDurationMinutes ? args.minimumDurationMinutes : 30
  const items = await fetchItems({
    startAt,
    endAt,
    sourceIds: args && args.sourceIds
  })
  const { windows, busyBlocks } = buildFreeWindows(
    Array.isArray(items) ? items : [],
    startAt,
    endAt,
    minimumDurationMinutes
  )
  const structuredContent = {
    kind: "calendar_find_free_time_result",
    startAt,
    endAt,
    minimumDurationMinutes,
    windowCount: windows.length,
    windows,
    busyCount: busyBlocks.length,
    busyBlocks
  }

  return textResult(`Found ${windows.length} free Calendar window(s).`, structuredContent)
}

async function callTool(name, args) {
  if (name === "calendar_list_sources") return await listSources(args || {})
  if (name === "calendar_update_source") return await updateSource(args || {})
  if (name === "calendar_create_todo") return await createTodo(args || {})
  if (name === "calendar_create_event") return await createEvent(args || {})
  if (name === "calendar_list_items") return await listItems(args || {})
  if (name === "calendar_get_item") return await getItem(args || {})
  if (name === "calendar_list_todos") return await listTodos(args || {})
  if (name === "calendar_update_todo") return await updateTodo(args || {})
  if (name === "calendar_schedule_todo") return await scheduleTodo(args || {})
  if (name === "calendar_complete_todo") return await completeTodo(args || {})
  if (name === "calendar_delete_todo") return await deleteTodo(args || {})
  if (name === "calendar_update_event") return await updateEvent(args || {})
  if (name === "calendar_cancel_event") return await cancelEvent(args || {})
  if (name === "calendar_delete_event") return await deleteEvent(args || {})
  if (name === "calendar_find_free_time") return await findFreeTime(args || {})
  throw new Error(`Unknown tool: ${name}`)
}

const rl = readline.createInterface({ input: process.stdin })

rl.on("line", (line) => {
  void (async () => {
    if (!line.trim()) return
    const message = JSON.parse(line)

    if (message.method === "initialize") {
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "anybox-calendar", version: "0.1.0" }
        }
      })
      return
    }

    if (String(message.method || "").startsWith("notifications/")) return

    if (message.method === "tools/list") {
      send({ jsonrpc: "2.0", id: message.id, result: { tools } })
      return
    }

    if (message.method === "tools/call") {
      try {
        const result = await callTool(
          message.params && message.params.name,
          message.params && message.params.arguments
        )
        send({ jsonrpc: "2.0", id: message.id, result })
      } catch (error) {
        send({ jsonrpc: "2.0", id: message.id, result: errorResult(error) })
      }
      return
    }

    send({
      jsonrpc: "2.0",
      id: message.id,
      error: { code: -32601, message: `Unknown method: ${message.method}` }
    })
  })().catch((error) => {
    send({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : String(error)
      }
    })
  })
})
