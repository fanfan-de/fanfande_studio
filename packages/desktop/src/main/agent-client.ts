import type { AgentConfig, AgentEnvelope, AgentSSEEvent } from "./types"

const DEFAULT_AGENT_BASE_URL = "http://127.0.0.1:4096"

export class AgentAPIError extends Error {
  readonly status: number
  readonly code?: string
  readonly requestId?: string

  constructor(input: { message: string; status: number; code?: string; requestId?: string }) {
    super(input.message)
    this.name = "AgentAPIError"
    this.status = input.status
    this.code = input.code
    this.requestId = input.requestId
  }
}

export function getAgentConfig(): AgentConfig {
  return {
    baseURL: process.env.FANFANDE_AGENT_BASE_URL?.trim() || DEFAULT_AGENT_BASE_URL,
    defaultDirectory: process.env.FANFANDE_AGENT_WORKDIR?.trim() || process.cwd(),
  }
}

export function resolveAgentURL(pathname: string) {
  const { baseURL } = getAgentConfig()
  const normalizedBase = baseURL.endsWith("/") ? baseURL : `${baseURL}/`
  return new URL(pathname, normalizedBase).toString()
}

export function resolveAgentWebSocketURL(
  pathname: string,
  searchParams?: Record<string, string | number | undefined>,
) {
  const url = new URL(resolveAgentURL(pathname))
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"

  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value === undefined || value === null || value === "") continue
      url.searchParams.set(key, String(value))
    }
  }

  return url.toString()
}

export async function requestAgentJSON<T>(pathname: string, init?: RequestInit) {
  const response = await fetch(resolveAgentURL(pathname), init)
  const envelope = (await response.json().catch(() => null)) as AgentEnvelope<T> | null

  if (!response.ok || !envelope || envelope.success !== true || envelope.data === undefined) {
    const fallback = `Agent API request failed (${response.status})`
    throw new AgentAPIError({
      message: envelope?.error?.message || fallback,
      status: response.status,
      code: envelope?.error?.code,
      requestId: response.headers.get("x-request-id") ?? undefined,
    })
  }

  return {
    data: envelope.data,
    requestId: response.headers.get("x-request-id") ?? undefined,
  }
}

export function parseSSE(raw: string): AgentSSEEvent[] {
  const events: AgentSSEEvent[] = []

  for (const block of raw.split(/\r?\n\r?\n/)) {
    const parsed = parseSSEBlock(block)
    if (parsed) events.push(parsed)
  }

  return events
}

function parseSSEBlock(block: string): AgentSSEEvent | null {
  if (!block.trim()) return null

  let eventID = ""
  let eventName = ""
  const dataLines: string[] = []

  for (const rawLine of block.split(/\r?\n/)) {
    if (!rawLine || rawLine.startsWith(":")) continue

    const separatorIndex = rawLine.indexOf(":")
    const field = separatorIndex === -1 ? rawLine : rawLine.slice(0, separatorIndex)
    let value = separatorIndex === -1 ? "" : rawLine.slice(separatorIndex + 1)
    if (value.startsWith(" ")) {
      value = value.slice(1)
    }

    if (field === "id") {
      eventID = value.trim()
      continue
    }

    if (field === "event") {
      eventName = value.trim()
      continue
    }

    if (field === "data") {
      dataLines.push(value)
    }
  }

  const payload = dataLines.join("\n")

  if (!eventName || !payload) return null

  let data: unknown = payload
  try {
    data = JSON.parse(payload)
  } catch {
    data = payload
  }

  return {
    ...(eventID ? { id: eventID } : {}),
    event: eventName,
    data,
  }
}

export function consumeSSEBuffer(raw: string, flush = false) {
  const events: AgentSSEEvent[] = []
  const boundaryPattern = /\r?\n\r?\n/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = boundaryPattern.exec(raw)) !== null) {
    const parsed = parseSSEBlock(raw.slice(lastIndex, match.index))
    if (parsed) events.push(parsed)
    lastIndex = match.index + match[0].length
  }

  const remainder = raw.slice(lastIndex)
  if (flush) {
    const parsed = parseSSEBlock(remainder)
    if (parsed) events.push(parsed)
    return {
      events,
      remainder: "",
    }
  }

  return {
    events,
    remainder,
  }
}

export async function readAgentSSEStream(
  response: Response,
  onEvent: (event: AgentSSEEvent) => void,
): Promise<AgentSSEEvent[]> {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error("Agent stream body is unavailable")
  }

  const decoder = new TextDecoder()
  const events: AgentSSEEvent[] = []
  let buffer = ""

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const parsed = consumeSSEBuffer(buffer)
    buffer = parsed.remainder

    for (const event of parsed.events) {
      events.push(event)
      onEvent(event)
    }
  }

  buffer += decoder.decode()
  const trailing = consumeSSEBuffer(buffer, true)
  for (const event of trailing.events) {
    events.push(event)
    onEvent(event)
  }

  return events
}
