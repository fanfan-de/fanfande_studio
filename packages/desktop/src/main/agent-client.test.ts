import { describe, expect, it } from "vitest"
import { consumeSSEBuffer, parseSSE, readAgentSSEStream } from "./agent-client"

describe("agent SSE parsing", () => {
  it("ignores keepalive comment blocks in completed responses", () => {
    const events = parseSSE(
      [
        "event: started",
        'data: {"sessionID":"session-1"}',
        "",
        ": keepalive 1744300000000",
        "",
        "event: delta",
        'data: {"kind":"text","delta":"Streaming answer"}',
        "",
      ].join("\n"),
    )

    expect(events).toEqual([
      {
        event: "started",
        data: {
          sessionID: "session-1",
        },
      },
      {
        event: "delta",
        data: {
          kind: "text",
          delta: "Streaming answer",
        },
      },
    ])
  })

  it("ignores split keepalive comment blocks while incrementally consuming stream chunks", () => {
    const firstChunk = consumeSSEBuffer(
      [
        "event: started",
        'data: {"sessionID":"session-1"}',
        "",
        ": keep",
      ].join("\n"),
    )

    expect(firstChunk.events).toEqual([
      {
        event: "started",
        data: {
          sessionID: "session-1",
        },
      },
    ])
    expect(firstChunk.remainder).toBe(": keep")

    const secondChunk = consumeSSEBuffer(
      `${firstChunk.remainder}alive 1744300000000\n\nevent: done\ndata: {"sessionID":"session-1","parts":[]}\n\n`,
    )

    expect(secondChunk.events).toEqual([
      {
        event: "done",
        data: {
          sessionID: "session-1",
          parts: [],
        },
      },
    ])
    expect(secondChunk.remainder).toBe("")
  })

  it("preserves SSE ids so callers can resume from the last cursor", () => {
    const events = parseSSE(
      [
        "id: 1740000000000:turn-1:2",
        "event: delta",
        'data: {"kind":"text","delta":"Recovered chunk"}',
        "",
      ].join("\n"),
    )

    expect(events).toEqual([
      {
        id: "1740000000000:turn-1:2",
        event: "delta",
        data: {
          kind: "text",
          delta: "Recovered chunk",
        },
      },
    ])
  })

  it("streams events through the callback without returning an accumulated event array", async () => {
    const encoder = new TextEncoder()
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode("event: delta\n"))
          controller.enqueue(encoder.encode('data: {"kind":"text","delta":"chunk"}\n\n'))
          controller.close()
        },
      }),
    )
    const events: ReturnType<typeof parseSSE> = []

    const result = await readAgentSSEStream(response, (event) => {
      events.push(event)
    })

    expect(result).toBeUndefined()
    expect(events).toEqual([
      {
        event: "delta",
        data: {
          kind: "text",
          delta: "chunk",
        },
      },
    ])
  })
})
