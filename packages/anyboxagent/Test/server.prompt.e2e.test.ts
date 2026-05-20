import { expect, test } from "bun:test"
import "./sqlite.cleanup.ts"
import { createServerApp } from "#server/server.ts"

interface SSEEvent {
  event: string
  data: unknown
}

interface JsonEnvelope {
  success: boolean
  data?: Record<string, unknown>
  error?: {
    code: string
    message: string
  }
}

function isRuntimeEventData(value: unknown): value is {
  type: string
  payload?: Record<string, unknown>
} {
  return Boolean(value && typeof value === "object" && "type" in value)
}

function parseSSE(input: string): SSEEvent[] {
  const blocks = input.split(/\r?\n\r?\n/).map((x) => x.trim()).filter(Boolean)
  const result: SSEEvent[] = []

  for (const block of blocks) {
    const lines = block.split(/\r?\n/)
    const eventLine = lines.find((line) => line.startsWith("event:"))
    const dataLines = lines.filter((line) => line.startsWith("data:"))

    if (!eventLine || dataLines.length === 0) continue

    const event = eventLine.slice("event:".length).trim()
    const dataRaw = dataLines.map((line) => line.slice("data:".length).trim()).join("\n")

    let data: unknown = dataRaw
    try {
      data = JSON.parse(dataRaw)
    } catch {
      // keep raw string
    }

    result.push({ event, data })
  }

  return result
}

test("api e2e: create and send message with streaming assistant response", async () => {
  expect(process.env.DEEPSEEK_API_KEY).toBeTruthy()

  const app = createServerApp()

  const createResponse = await app.request("http://localhost/api/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ directory: process.cwd() }),
  })
  expect(createResponse.status).toBe(201)
  const createBody = (await createResponse.json()) as JsonEnvelope
  const sessionID = createBody.data?.id
  expect(sessionID).toBeTruthy()

  const streamResponse = await app.request(`http://localhost/api/sessions/${sessionID as string}/messages/stream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: "请只回复 OK。",
      system: "你是简洁助手。只允许输出 OK，不要调用工具。",
      model: {
        providerID: "deepseek",
        modelID: "deepseek-reasoner",
      },
    }),
  })

  expect(streamResponse.status).toBe(200)
  expect(streamResponse.headers.get("content-type")).toContain("text/event-stream")

  const raw = await streamResponse.text()
  const events = parseSSE(raw)
  expect(events.length).toBeGreaterThan(0)

  const errorEvent = events.find((event) => event.event === "error")
  expect(errorEvent).toBeUndefined()
  const runtimeEvents = events
    .filter((event) => event.event === "runtime" && isRuntimeEventData(event.data))
    .map((event) => event.data as { type: string; payload?: Record<string, unknown> })

  expect(runtimeEvents.some((event) => event.type === "turn.started")).toBe(true)
  expect(runtimeEvents.some((event) => event.type === "turn.completed")).toBe(true)
  expect(
    runtimeEvents.some((event) => event.type === "text.part.delta" || event.type === "part.recorded"),
  ).toBe(true)

  const completed = [...runtimeEvents].reverse().find((event) => event.type === "turn.completed")
  const completedPayload = completed?.payload as { message?: { role?: string } } | undefined
  expect(completedPayload?.message?.role).toBe("assistant")
}, 240000)
