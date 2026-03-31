import { HttpGateway } from "../http"

function sseResponse(payload: string) {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload))
      controller.close()
    },
  })
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
    },
  })
}

describe("HttpGateway integration", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("parses stream events from backend format", async () => {
    const streamText = [
      "event: started",
      'data: {"sessionID":"s1"}',
      "",
      "event: delta",
      'data: {"delta":"hello "}',
      "",
      "event: delta",
      'data: {"delta":"world"}',
      "",
      "event: done",
      'data: {"sessionID":"s1"}',
      "",
    ].join("\n")

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return sseResponse(streamText)
      }),
    )

    const gateway = new HttpGateway("http://127.0.0.1:4096")
    let result = ""
    let doneCalled = false

    const handle = gateway.streamSessionMessage(
      {
        sessionID: "s1",
        text: "hello",
      },
      {
        onDelta: (delta) => {
          result += delta
        },
        onDone: () => {
          doneCalled = true
        },
      },
    )

    await handle.done
    expect(result).toBe("hello world")
    expect(doneCalled).toBe(true)
  })
})
