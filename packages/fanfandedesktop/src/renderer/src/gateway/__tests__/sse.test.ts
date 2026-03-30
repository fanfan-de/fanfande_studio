import { SSEDecoder } from "../sse"

describe("SSEDecoder", () => {
  it("parses split chunks into full events", () => {
    const decoder = new SSEDecoder()
    const first = decoder.push("event: started\ndata: {\"ok\":tr")
    expect(first).toEqual([])

    const second = decoder.push("ue}\n\n")
    expect(second).toEqual([{ event: "started", data: "{\"ok\":true}" }])
  })

  it("supports multiline data payload", () => {
    const decoder = new SSEDecoder()
    const events = decoder.push("event: delta\ndata: line1\ndata: line2\n\n")
    expect(events).toEqual([{ event: "delta", data: "line1\nline2" }])
  })
})
