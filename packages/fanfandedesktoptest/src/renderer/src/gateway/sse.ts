export interface ParsedSSEEvent {
  event: string
  data: string
}

export class SSEDecoder {
  private buffer = ""
  private eventName = "message"
  private dataLines: string[] = []

  push(chunk: string): ParsedSSEEvent[] {
    this.buffer += chunk
    const events: ParsedSSEEvent[] = []

    while (true) {
      const lineEnd = this.buffer.indexOf("\n")
      if (lineEnd < 0) break

      let line = this.buffer.slice(0, lineEnd)
      this.buffer = this.buffer.slice(lineEnd + 1)
      if (line.endsWith("\r")) line = line.slice(0, -1)

      if (line.length === 0) {
        const committed = this.commitEvent()
        if (committed) events.push(committed)
        continue
      }

      if (line.startsWith(":")) continue
      const colon = line.indexOf(":")
      const field = colon >= 0 ? line.slice(0, colon) : line
      const value = colon >= 0 ? line.slice(colon + 1).replace(/^ /, "") : ""

      if (field === "event") this.eventName = value || "message"
      else if (field === "data") this.dataLines.push(value)
    }

    return events
  }

  flush(): ParsedSSEEvent[] {
    const committed = this.commitEvent()
    return committed ? [committed] : []
  }

  private commitEvent(): ParsedSSEEvent | null {
    if (this.dataLines.length === 0) return null
    const event = {
      event: this.eventName,
      data: this.dataLines.join("\n"),
    }
    this.eventName = "message"
    this.dataLines = []
    return event
  }
}

export async function consumeSSEStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: ParsedSSEEvent) => void,
) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const sse = new SSEDecoder()

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    if (!value) continue

    const text = decoder.decode(value, { stream: true })
    const events = sse.push(text)
    for (const event of events) onEvent(event)
  }

  const trailing = sse.flush()
  for (const event of trailing) onEvent(event)
}
