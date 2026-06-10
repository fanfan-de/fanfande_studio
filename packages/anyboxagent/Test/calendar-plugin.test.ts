import { afterEach, describe, expect, test } from "bun:test"
import { databaseFile as testDatabaseFile } from "./sqlite.cleanup.ts"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, normalize, resolve } from "node:path"
import * as Calendar from "#calendar/calendar.ts"
import * as Config from "#config/config.ts"
import * as Sqlite from "#database/Sqlite.ts"
import * as Plugin from "#plugin/plugin.ts"
import { Instance } from "#project/instance.ts"
import { createServerApp } from "#server/server.ts"
import * as Tool from "#tool/tool.ts"
import * as ToolRegistry from "#tool/registry.ts"

interface JsonEnvelope<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

interface InstalledPluginBody {
  pluginID: string
  enabled: boolean
  mcpServerID: string
  mcpServerIDs: string[]
  packageRoot?: string
}

interface McpOutputData {
  structuredContent: Record<string, unknown>
  isError?: boolean
}

interface CalendarListStructuredContent extends Record<string, unknown> {
  items: Array<{
    displayKind: string
    title: string
  }>
}

const repoPluginRoot = resolve(import.meta.dir, "..", "..", "..", "plugins", "Anybox-Plugins")
const calendarMcpServerID = "plugin.calendar.calendar"
const calendarToolNames = [
  "calendar_list_sources",
  "calendar_update_source",
  "calendar_create_todo",
  "calendar_create_event",
  "calendar_list_items",
  "calendar_get_item",
  "calendar_list_todos",
  "calendar_update_todo",
  "calendar_schedule_todo",
  "calendar_complete_todo",
  "calendar_delete_todo",
  "calendar_update_event",
  "calendar_cancel_event",
  "calendar_delete_event",
  "calendar_find_free_time",
]
const createTodoToolID = calendarToolID("calendar_create_todo")
const createEventToolID = calendarToolID("calendar_create_event")
const listItemsToolID = calendarToolID("calendar_list_items")

function calendarToolID(name: string) {
  return `mcp__plugin_calendar_calendar__${name}`
}

let activeRoot: string | null = null
let previousDatabaseFile: string | undefined
let previousPluginLocalDir: string | undefined
let previousPluginInstallDir: string | undefined
let previousPluginRegistryIndexURL: string | undefined
let previousPluginRegistryCacheDir: string | undefined
let previousAgentBaseURL: string | undefined

function normalizePath(value: string | undefined) {
  return value ? normalize(value).replace(/\\/g, "/") : value
}

async function useCalendarPluginTestEnv() {
  activeRoot = await mkdtemp(join(tmpdir(), "anybox-calendar-plugin-"))
  previousDatabaseFile = process.env.ANYBOX_DATABASE_FILE
  Sqlite.setDatabaseFile(join(activeRoot, "calendar-plugin.db"))
  Sqlite.closeDatabase()

  previousPluginLocalDir = process.env.ANYBOX_PLUGIN_LOCAL_DIR
  previousPluginInstallDir = process.env.ANYBOX_PLUGIN_INSTALL_DIR
  previousPluginRegistryIndexURL = process.env.ANYBOX_PLUGIN_REGISTRY_INDEX_URL
  previousPluginRegistryCacheDir = process.env.ANYBOX_PLUGIN_REGISTRY_CACHE_DIR
  previousAgentBaseURL = process.env.ANYBOX_AGENT_BASE_URL

  process.env.ANYBOX_PLUGIN_LOCAL_DIR = repoPluginRoot
  process.env.ANYBOX_PLUGIN_INSTALL_DIR = join(activeRoot, "installed-plugins")
  process.env.ANYBOX_PLUGIN_REGISTRY_INDEX_URL = "off"
  process.env.ANYBOX_PLUGIN_REGISTRY_CACHE_DIR = join(activeRoot, "registry-cache")
  delete process.env.ANYBOX_AGENT_BASE_URL

  return activeRoot
}

function restoreEnvValue(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
    return
  }

  process.env[name] = value
}

async function readJson<T>(response: Response) {
  return await response.json() as JsonEnvelope<T>
}

function mcpOutputData(output: Tool.ToolOutput): McpOutputData {
  const data = output.data
  if (!data || typeof data !== "object" || !("structuredContent" in data)) {
    throw new Error("Expected MCP output data with structuredContent.")
  }

  return data as McpOutputData
}

function startAgentServer() {
  const app = createServerApp()
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: app.fetch,
  })

  return {
    baseURL: `http://127.0.0.1:${server.port}`,
    close() {
      server.stop(true)
    },
  }
}

async function installCalendarPlugin() {
  const app = createServerApp()
  const response = await app.request("/api/plugins/installed/calendar", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: true }),
  })
  const body = await readJson<InstalledPluginBody>(response)

  expect(response.status).toBe(200)
  expect(body.success).toBe(true)
  expect(body.data?.pluginID).toBe("calendar")
  expect(body.data?.enabled).toBe(true)
  expect(body.data?.mcpServerID).toBe(calendarMcpServerID)
  expect(body.data?.mcpServerIDs).toEqual([calendarMcpServerID])

  return body.data!
}

afterEach(async () => {
  await Instance.disposeAll()
  restoreEnvValue("ANYBOX_PLUGIN_LOCAL_DIR", previousPluginLocalDir)
  restoreEnvValue("ANYBOX_PLUGIN_INSTALL_DIR", previousPluginInstallDir)
  restoreEnvValue("ANYBOX_PLUGIN_REGISTRY_INDEX_URL", previousPluginRegistryIndexURL)
  restoreEnvValue("ANYBOX_PLUGIN_REGISTRY_CACHE_DIR", previousPluginRegistryCacheDir)
  restoreEnvValue("ANYBOX_AGENT_BASE_URL", previousAgentBaseURL)
  previousPluginLocalDir = undefined
  previousPluginInstallDir = undefined
  previousPluginRegistryIndexURL = undefined
  previousPluginRegistryCacheDir = undefined
  previousAgentBaseURL = undefined
  Sqlite.closeDatabase()
  Sqlite.setDatabaseFile(previousDatabaseFile ?? testDatabaseFile)
  previousDatabaseFile = undefined
  Sqlite.closeDatabase()
  if (activeRoot) {
    await rm(activeRoot, { recursive: true, force: true }).catch(() => undefined)
    activeRoot = null
  }
})

describe("calendar plugin tools", () => {
  test("catalogs and installs the Calendar MCP plugin", async () => {
    await useCalendarPluginTestEnv()
    const app = createServerApp()

    const catalogResponse = await app.request("/api/plugins/catalog")
    const catalogBody = await readJson<Array<{
      id: string
      mcpServers: Array<{
        id: string
        tools: Array<{ name: string; readOnly?: boolean; destructive?: boolean }>
        runtime: { transport: string }
      }>
    }>>(catalogResponse)
    const calendarPlugin = catalogBody.data?.find((item) => item.id === "calendar")

    expect(catalogResponse.status).toBe(200)
    expect(calendarPlugin?.mcpServers).toHaveLength(1)
    expect(calendarPlugin?.mcpServers[0]?.id).toBe("calendar")
    expect(calendarPlugin?.mcpServers[0]?.runtime.transport).toBe("stdio")
    expect(calendarPlugin?.mcpServers[0]?.tools.map((tool) => tool.name)).toEqual(calendarToolNames)
    expect(calendarPlugin?.mcpServers[0]?.tools.find((tool) => tool.name === "calendar_list_items")?.readOnly).toBe(true)
    expect(calendarPlugin?.mcpServers[0]?.tools.find((tool) => tool.name === "calendar_delete_event")?.destructive).toBe(true)

    const installed = await installCalendarPlugin()
    const server = await Config.getMcpServer(Config.GLOBAL_CONFIG_ID, calendarMcpServerID)

    expect(normalizePath(installed.packageRoot)).toContain("/calendar/0.1.0")
    expect(server?.transport).toBe("stdio")
    expect(server?.name).toBe("Calendar")
    expect(server?.transport === "stdio" ? server.command : undefined).toBe("node")
    expect(normalizePath(server?.transport === "stdio" ? server.args?.[0] : undefined)).toContain("/calendar/0.1.0/scripts/server.js")
    expect(server?.transport === "stdio" ? server.env?.ANYBOX_CALENDAR_AGENT_BASE_URL : undefined).toBe("http://127.0.0.1:4096")
    expect(server?.toolPolicies).toEqual({
      calendar_list_sources: { policy: "auto" },
      calendar_update_source: { policy: "ask" },
      calendar_create_todo: { policy: "ask" },
      calendar_create_event: { policy: "ask" },
      calendar_list_items: { policy: "auto" },
      calendar_get_item: { policy: "auto" },
      calendar_list_todos: { policy: "auto" },
      calendar_update_todo: { policy: "ask" },
      calendar_schedule_todo: { policy: "ask" },
      calendar_complete_todo: { policy: "ask" },
      calendar_delete_todo: { policy: "ask" },
      calendar_update_event: { policy: "ask" },
      calendar_cancel_event: { policy: "ask" },
      calendar_delete_event: { policy: "ask" },
      calendar_find_free_time: { policy: "auto" },
    })
  })

  test("exposes Calendar MCP tools through ToolRegistry and writes Calendar data", async () => {
    const root = await useCalendarPluginTestEnv()
    const agentServer = startAgentServer()
    process.env.ANYBOX_AGENT_BASE_URL = agentServer.baseURL

    try {
      await installCalendarPlugin()

      await Instance.provide({
        directory: root,
        fn: async () => {
          await Config.setSelectedPluginIDs(Instance.project.id, ["calendar"])

          const tools = await ToolRegistry.tools()
          const ids = tools.map((tool) => tool.id)

          for (const toolName of calendarToolNames) {
            expect(ids).not.toContain(toolName)
            expect(ids).toContain(calendarToolID(toolName))
          }

          const modelNames = new Map<string, string>()
          for (const tool of tools) {
            const exposedNames = [tool.id, ...(tool.aliases ?? [])]
            for (const name of exposedNames) {
              const modelName = Tool.toModelToolName(name)
              const existing = modelNames.get(modelName)
              expect(existing === undefined || existing === tool.id).toBe(true)
              modelNames.set(modelName, tool.id)
            }
          }

          const createTodoTool = await ToolRegistry.get(createTodoToolID)
          const createEventTool = await ToolRegistry.get(createEventToolID)
          const listItemsTool = await ToolRegistry.get(listItemsToolID)
          const listSourcesTool = await ToolRegistry.get(calendarToolID("calendar_list_sources"))
          const listTodosTool = await ToolRegistry.get(calendarToolID("calendar_list_todos"))
          const updateTodoTool = await ToolRegistry.get(calendarToolID("calendar_update_todo"))
          const scheduleTodoTool = await ToolRegistry.get(calendarToolID("calendar_schedule_todo"))
          const completeTodoTool = await ToolRegistry.get(calendarToolID("calendar_complete_todo"))
          const updateEventTool = await ToolRegistry.get(calendarToolID("calendar_update_event"))
          const cancelEventTool = await ToolRegistry.get(calendarToolID("calendar_cancel_event"))
          const findFreeTimeTool = await ToolRegistry.get(calendarToolID("calendar_find_free_time"))
          expect(createTodoTool?.capabilities?.readOnly).toBe(false)
          expect(createEventTool?.capabilities?.readOnly).toBe(false)
          expect(listItemsTool?.capabilities?.readOnly).toBe(true)
          expect(listSourcesTool?.capabilities?.readOnly).toBe(true)
          expect(listTodosTool?.capabilities?.readOnly).toBe(true)
          expect(findFreeTimeTool?.capabilities?.readOnly).toBe(true)

          const createTodo = await createTodoTool!.init()
          const createEvent = await createEventTool!.init()
          const listItems = await listItemsTool!.init()
          const listSources = await listSourcesTool!.init()
          const listTodos = await listTodosTool!.init()
          const updateTodo = await updateTodoTool!.init()
          const scheduleTodo = await scheduleTodoTool!.init()
          const completeTodo = await completeTodoTool!.init()
          const updateEvent = await updateEventTool!.init()
          const cancelEvent = await cancelEventTool!.init()
          const findFreeTime = await findFreeTimeTool!.init()
          const ctx = {
            sessionID: "session_calendar_plugin",
            messageID: "message_calendar_plugin",
            cwd: root,
          }

          const rangeStart = Date.UTC(2026, 5, 11, 0, 0, 0)
          const scheduledStart = Date.UTC(2026, 5, 11, 13, 0, 0)
          const scheduledEnd = Date.UTC(2026, 5, 11, 14, 0, 0)
          const rescheduledStart = Date.UTC(2026, 5, 11, 14, 0, 0)
          const rescheduledEnd = Date.UTC(2026, 5, 11, 15, 0, 0)
          const eventStart = Date.UTC(2026, 5, 11, 16, 0, 0)
          const eventEnd = Date.UTC(2026, 5, 11, 17, 0, 0)
          const rangeEnd = Date.UTC(2026, 5, 11, 23, 59, 59)

          const sources = await listSources.execute({}, ctx)
          expect(mcpOutputData(sources).structuredContent).toMatchObject({
            kind: "calendar_list_sources_result",
            sourceCount: 1,
          })

          const unscheduled = await createTodo.execute({
            title: "Capture plugin migration notes",
          }, ctx)
          const unscheduledData = mcpOutputData(unscheduled).structuredContent as { id: string }
          expect(mcpOutputData(unscheduled).structuredContent).toMatchObject({
            kind: "calendar_create_todo_result",
            created: true,
            type: "todo",
            title: "Capture plugin migration notes",
          })
          expect(unscheduledData.id).toStartWith("tsk_")
          expect(Calendar.listTasks().some((task) => task.title === "Capture plugin migration notes")).toBe(true)

          const todos = await listTodos.execute({}, ctx)
          expect(mcpOutputData(todos).structuredContent).toMatchObject({
            kind: "calendar_list_todos_result",
            todoCount: 1,
            todos: [
              expect.objectContaining({
                id: unscheduledData.id,
                title: "Capture plugin migration notes",
              }),
            ],
          })

          const unscheduledItems = await listItems.execute({ startAt: rangeStart, endAt: rangeEnd }, ctx)
          expect(mcpOutputData(unscheduledItems).structuredContent).toMatchObject({
            kind: "calendar_list_items_result",
            itemCount: 0,
            items: [],
          })

          const scheduled = await createTodo.execute({
            title: "Review scheduled plugin todo",
            scheduledStartAt: scheduledStart,
            scheduledEndAt: scheduledEnd,
          }, ctx)
          const scheduledData = mcpOutputData(scheduled).structuredContent as { id: string }
          expect(mcpOutputData(scheduled).structuredContent).toMatchObject({
            created: true,
            type: "todo",
            title: "Review scheduled plugin todo",
            scheduledStartAt: scheduledStart,
            scheduledEndAt: scheduledEnd,
          })

          const updatedTodo = await updateTodo.execute({
            todoId: scheduledData.id,
            priority: "high",
            reminderAt: new Date(scheduledStart - 15 * 60 * 1000).toISOString(),
          }, ctx)
          expect(mcpOutputData(updatedTodo).structuredContent).toMatchObject({
            kind: "calendar_update_todo_result",
            updated: true,
            todo: {
              id: scheduledData.id,
              priority: "high",
              reminderAt: scheduledStart - 15 * 60 * 1000,
            },
          })

          const rescheduled = await scheduleTodo.execute({
            todoId: scheduledData.id,
            scheduledStartAt: new Date(rescheduledStart).toISOString(),
            scheduledEndAt: new Date(rescheduledEnd).toISOString(),
          }, ctx)
          expect(mcpOutputData(rescheduled).structuredContent).toMatchObject({
            kind: "calendar_schedule_todo_result",
            scheduled: true,
            todo: {
              id: scheduledData.id,
              scheduledStartAt: rescheduledStart,
              scheduledEndAt: rescheduledEnd,
            },
          })

          const completed = await completeTodo.execute({ todoId: scheduledData.id }, ctx)
          expect(mcpOutputData(completed).structuredContent).toMatchObject({
            kind: "calendar_complete_todo_result",
            completed: true,
            todo: {
              id: scheduledData.id,
              status: "done",
            },
          })

          const scheduledItems = await listItems.execute({ startAt: rangeStart, endAt: rangeEnd }, ctx)
          const scheduledItemsData = mcpOutputData(scheduledItems).structuredContent as CalendarListStructuredContent
          expect(scheduledItemsData.items)
            .toEqual(expect.arrayContaining([
              expect.objectContaining({
                displayKind: "scheduled_todo",
                title: "Review scheduled plugin todo",
              }),
            ]))

          const event = await createEvent.execute({
            title: "Calendar plugin smoke event",
            startAt: eventStart,
            endAt: eventEnd,
          }, ctx)
          const eventData = mcpOutputData(event).structuredContent as { id: string }
          expect(mcpOutputData(event).structuredContent).toMatchObject({
            kind: "calendar_create_event_result",
            created: true,
            type: "event",
            title: "Calendar plugin smoke event",
            sourceId: "work",
            startAt: eventStart,
            endAt: eventEnd,
          })

          const updatedEvent = await updateEvent.execute({
            eventId: eventData.id,
            location: "Updated Smoke Test Room",
            meetingUrl: "https://example.test/calendar-plugin",
          }, ctx)
          expect(mcpOutputData(updatedEvent).structuredContent).toMatchObject({
            kind: "calendar_update_event_result",
            updated: true,
            event: {
              id: eventData.id,
              location: "Updated Smoke Test Room",
              meetingUrl: "https://example.test/calendar-plugin",
            },
          })

          const eventItems = await listItems.execute({ startAt: rangeStart, endAt: rangeEnd, sourceIds: ["work"] }, ctx)
          const eventItemsData = mcpOutputData(eventItems).structuredContent as CalendarListStructuredContent
          expect(eventItemsData.items)
            .toEqual(expect.arrayContaining([
              expect.objectContaining({
                displayKind: "external_event",
                title: "Calendar plugin smoke event",
              }),
            ]))

          const canceledEvent = await cancelEvent.execute({ eventId: eventData.id }, ctx)
          expect(mcpOutputData(canceledEvent).structuredContent).toMatchObject({
            kind: "calendar_cancel_event_result",
            canceled: true,
            event: {
              id: eventData.id,
              status: "canceled",
            },
          })

          const freeTime = await findFreeTime.execute({
            startAt: new Date(rangeStart).toISOString(),
            endAt: new Date(rangeEnd).toISOString(),
            minimumDurationMinutes: 60,
          }, ctx)
          expect(mcpOutputData(freeTime).structuredContent).toMatchObject({
            kind: "calendar_find_free_time_result",
            windowCount: 1,
            busyCount: 0,
          })

          const invalidEvent = await createEvent.execute({
            title: "Invalid plugin event",
            startAt: eventEnd,
            endAt: eventStart,
          }, ctx)
          expect(mcpOutputData(invalidEvent).isError).toBe(true)
          expect(mcpOutputData(invalidEvent).structuredContent).toMatchObject({
            kind: "calendar_error",
            error: {
              code: "INVALID_CALENDAR_EVENT_RANGE",
            },
          })

          const invalidTodo = await createTodo.execute({
            title: "Invalid plugin todo",
            scheduledStartAt: scheduledStart,
          }, ctx)
          expect(mcpOutputData(invalidTodo).isError).toBe(true)
          expect(mcpOutputData(invalidTodo).structuredContent).toMatchObject({
            kind: "calendar_error",
            error: {
              code: "INVALID_CALENDAR_TASK_SCHEDULE",
            },
          })
        },
      })
    } finally {
      agentServer.close()
    }
  })
})
