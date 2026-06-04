import type { MobileMessage } from "@/api/mobile-api"

export function messageRole(message: MobileMessage) {
  return message.info?.role || "assistant"
}

export function messageText(message: MobileMessage) {
  const text = extractText(message.parts)
  return text || JSON.stringify(message.parts ?? "", null, 2)
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
