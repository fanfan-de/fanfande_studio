import type { MobileMessage } from "@/api/mobile-api"

export interface PendingPromptOverlay {
  id: string
  text: string
  anchorMessageID?: string | null
}

export type AssistantContentKind = "reasoning" | "response"

export interface MessageContentSegment {
  kind: AssistantContentKind
  text: string
}

export interface StreamingAssistantOverlay {
  id: string
  segments: MessageContentSegment[]
  anchorMessageID?: string | null
}

export function messageRole(message: MobileMessage) {
  return message.info?.role || "assistant"
}

export function messageText(message: MobileMessage) {
  const text = extractText(message.parts)
  if (text) return text
  if (message.parts == null) return ""
  if (Array.isArray(message.parts) && message.parts.length === 0) return ""
  return JSON.stringify(message.parts, null, 2)
}

export function messageContentSegments(message: MobileMessage): MessageContentSegment[] {
  return extractContentSegments(message.parts)
}

export function extractText(value: unknown): string {
  if (typeof value === "string") return value
  if (Array.isArray(value)) return value.map(extractText).filter(Boolean).join("\n")
  if (!value || typeof value !== "object") return ""

  const record = value as Record<string, unknown>
  if (typeof record.text === "string") return record.text
  if (typeof record.content === "string") return record.content
  if (typeof record.value === "string") return record.value
  if (Array.isArray(record.parts)) return extractText(record.parts)
  return ""
}

export function appendMessageContentSegment(
  segments: MessageContentSegment[],
  kind: AssistantContentKind,
  text: string,
): MessageContentSegment[] {
  if (!text) return segments
  const last = segments.at(-1)
  if (last?.kind === kind) {
    return [
      ...segments.slice(0, -1),
      { ...last, text: `${last.text}${text}` },
    ]
  }
  return [...segments, { kind, text }]
}

export function mergeOptimisticMessages(
  messages: MobileMessage[],
  pendingPrompt: PendingPromptOverlay | null,
  streamingAssistant: StreamingAssistantOverlay | null,
) {
  const nextMessages = [...messages]
  const searchStart = pendingPrompt
    ? findOverlaySearchStart(nextMessages, pendingPrompt.anchorMessageID, 0)
    : findOverlaySearchStart(nextMessages, streamingAssistant?.anchorMessageID, nextMessages.length)
  let promptIndex = -1

  if (pendingPrompt) {
    const pendingText = normalizeMessageText(pendingPrompt.text)
    promptIndex = nextMessages.findIndex((message, index) => (
      index >= searchStart &&
      messageRole(message) === "user" &&
      normalizeMessageText(extractText(message.parts)) === pendingText
    ))

    if (promptIndex === -1) {
      promptIndex = nextMessages.length
      nextMessages.push(createOverlayMessage(pendingPrompt.id, "user", pendingPrompt.text))
    }
  }

  if (streamingAssistant) {
    const assistantSearchStart = promptIndex >= 0 ? promptIndex + 1 : searchStart
    const assistantIndex = nextMessages.findIndex((message, index) => (
      index >= assistantSearchStart &&
      messageRole(message) === "assistant"
    ))
    const assistantMessage = createAssistantOverlayMessage(streamingAssistant.id, streamingAssistant.segments)

    if (assistantIndex >= 0) {
      nextMessages[assistantIndex] = assistantMessage
    } else {
      nextMessages.push(assistantMessage)
    }
  }

  return nextMessages satisfies MobileMessage[]
}

function findOverlaySearchStart(messages: MobileMessage[], anchorMessageID: string | null | undefined, fallback: number) {
  if (anchorMessageID === null) return 0
  if (!anchorMessageID) return fallback
  const anchorIndex = messages.findIndex((message) => message.info?.id === anchorMessageID)
  return anchorIndex >= 0 ? anchorIndex + 1 : fallback
}

function createOverlayMessage(id: string, role: "user" | "assistant", text: string): MobileMessage {
  const now = Date.now()
  return {
    info: {
      id,
      role,
      created: now,
      updated: now,
    },
    parts: [{ type: "text", text }],
  }
}

function createAssistantOverlayMessage(id: string, segments: MessageContentSegment[]): MobileMessage {
  const now = Date.now()
  const parts = segments
    .filter((segment) => segment.text)
    .map((segment) => ({
      type: segment.kind === "reasoning" ? "reasoning" : "text",
      text: segment.text,
    }))

  return {
    info: {
      id,
      role: "assistant",
      created: now,
      updated: now,
    },
    parts: parts.length ? parts : [{ type: "text", text: "..." }],
  }
}

function normalizeMessageText(text: string) {
  return text.replace(/\s+/g, " ").trim()
}

function extractContentSegments(value: unknown, fallbackKind: AssistantContentKind = "response"): MessageContentSegment[] {
  if (typeof value === "string") return value ? [{ kind: fallbackKind, text: value }] : []
  if (Array.isArray(value)) {
    return mergeAdjacentSegments(value.flatMap((item) => extractContentSegments(item, fallbackKind)))
  }
  if (!value || typeof value !== "object") return []

  const record = value as Record<string, unknown>
  const kind = contentKind(record, fallbackKind)
  const directText = directRecordText(record)
  if (directText) return [{ kind, text: directText }]
  if (Array.isArray(record.parts)) return extractContentSegments(record.parts, kind)
  if (Array.isArray(record.content)) return extractContentSegments(record.content, kind)
  return []
}

function contentKind(record: Record<string, unknown>, fallbackKind: AssistantContentKind): AssistantContentKind {
  if (record.type === "reasoning" || record.kind === "reasoning" || record.reasoning === true) return "reasoning"
  if (record.type === "response" || record.kind === "response") return "response"
  return fallbackKind
}

function directRecordText(record: Record<string, unknown>) {
  if (typeof record.text === "string") return record.text
  if (typeof record.content === "string") return record.content
  if (typeof record.value === "string") return record.value
  return ""
}

function mergeAdjacentSegments(segments: MessageContentSegment[]) {
  return segments.reduce<MessageContentSegment[]>((result, segment) => (
    appendMessageContentSegment(result, segment.kind, segment.text)
  ), [])
}
