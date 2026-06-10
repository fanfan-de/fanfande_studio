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

const todoInputSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: "Todo title." },
    description: { type: "string", description: "Optional todo description." },
    priority: {
      type: "string",
      enum: ["low", "medium", "high"],
      description: "Todo priority. Defaults to medium."
    },
    dueAt: timestampSchema("Optional due time as a millisecond timestamp."),
    reminderAt: timestampSchema("Optional reminder time as a millisecond timestamp."),
    scheduledStartAt: timestampSchema("Optional scheduled start time as a millisecond timestamp."),
    scheduledEndAt: timestampSchema("Optional scheduled end time as a millisecond timestamp."),
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
    startAt: timestampSchema("Event start time as a millisecond timestamp."),
    endAt: timestampSchema("Event end time as a millisecond timestamp."),
    allDay: { type: "boolean", description: "Whether the event is all-day. Defaults to false." },
    timezone: { type: "string", description: "Event timezone. Defaults to UTC." },
    location: { type: "string", description: "Optional event location." },
    meetingUrl: { type: "string", description: "Optional meeting URL." },
    attendees: {
      type: "array",
      items: { type: "string" },
      description: "Optional event attendees."
    },
    linkedWorkspaceId: { type: "string", description: "Optional linked workspace id." }
  },
  required: ["title", "startAt", "endAt"],
  additionalProperties: false
}

const listInputSchema = {
  type: "object",
  properties: {
    startAt: timestampSchema("Optional range start as a millisecond timestamp."),
    endAt: timestampSchema("Optional range end as a millisecond timestamp."),
    sourceIds: {
      type: "array",
      items: { type: "string" },
      description: "Optional Calendar source ids to include."
    }
  },
  additionalProperties: false
}

const tools = [
  {
    name: "calendar_create_todo",
    title: "Create Calendar Todo",
    description: "Create an Anybox Calendar todo. Use millisecond timestamps for all time fields.",
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
    description: "Create an Anybox Calendar event. sourceId defaults to work.",
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

async function createTodo(args) {
  const todo = await apiRequest("/api/calendar/todos", {
    method: "POST",
    body: JSON.stringify(compactObject({
      title: args && args.title,
      description: args && args.description,
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
  const event = await apiRequest("/api/calendar/events", {
    method: "POST",
    body: JSON.stringify(compactObject({
      sourceId: args && args.sourceId ? args.sourceId : "work",
      title: args && args.title,
      description: args && args.description,
      startAt: args && args.startAt,
      endAt: args && args.endAt,
      allDay: args && args.allDay,
      timezone: args && args.timezone,
      location: args && args.location,
      meetingUrl: args && args.meetingUrl,
      attendees: args && args.attendees,
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

async function listItems(args) {
  const search = new URLSearchParams()
  if (args && args.startAt !== undefined) search.set("startAt", String(args.startAt))
  if (args && args.endAt !== undefined) search.set("endAt", String(args.endAt))
  if (args && Array.isArray(args.sourceIds) && args.sourceIds.length > 0) {
    search.set("sourceIds", args.sourceIds.join(","))
  }

  const suffix = search.toString() ? `?${search.toString()}` : ""
  const items = await apiRequest(`/api/calendar/items${suffix}`)
  const structuredContent = {
    kind: "calendar_list_items_result",
    itemCount: Array.isArray(items) ? items.length : 0,
    items: Array.isArray(items) ? items : []
  }

  return textResult(`Found ${structuredContent.itemCount} Calendar item(s).`, structuredContent)
}

async function callTool(name, args) {
  if (name === "calendar_create_todo") return await createTodo(args || {})
  if (name === "calendar_create_event") return await createEvent(args || {})
  if (name === "calendar_list_items") return await listItems(args || {})
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
