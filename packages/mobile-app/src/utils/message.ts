import type { MobileMessage } from "@/api/mobile-api"

export interface PendingPromptOverlay {
  id: string
  text: string
  anchorMessageID?: string | null
}

export interface StreamingAssistantOverlay {
  id: string
  text: string
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
    const assistantMessage = createOverlayMessage(streamingAssistant.id, "assistant", streamingAssistant.text || "...")

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

function normalizeMessageText(text: string) {
  return text.replace(/\s+/g, " ").trim()
}
