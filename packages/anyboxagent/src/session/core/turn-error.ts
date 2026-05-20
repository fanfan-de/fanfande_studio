import z from "zod"
import type * as Message from "#session/core/message.ts"

export const TurnErrorInfo = z
  .object({
    name: z.string().optional(),
    message: z.string(),
    code: z.string().optional(),
    statusCode: z.number().optional(),
    retryable: z.boolean().optional(),
    providerID: z.string().optional(),
    modelID: z.string().optional(),
  })
  .meta({
    ref: "TurnErrorInfo",
  })
export type TurnErrorInfo = z.infer<typeof TurnErrorInfo>

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined
}

function readStringRecord(value: unknown) {
  const record = readRecord(value)
  if (!record) return undefined

  const entries = Object.entries(record).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

export function fromMessage(message: string, name?: string): TurnErrorInfo {
  return TurnErrorInfo.parse({
    name,
    message: message.trim() || "Unknown backend error",
  })
}

export function fromUnknown(error: unknown): TurnErrorInfo {
  const record = readRecord(error)
  const message =
    error instanceof Error && error.message
      ? error.message
      : readString(record?.message) ?? String(error)

  return TurnErrorInfo.parse({
    name: error instanceof Error ? readString(error.name) : readString(record?.name),
    message,
    code: readString(record?.code),
    statusCode: readNumber(record?.statusCode) ?? readNumber(record?.status),
    retryable: readBoolean(record?.isRetryable) ?? readBoolean(record?.retryable),
  })
}

export function withModelContext(
  errorInfo: TurnErrorInfo,
  model?: {
    providerID?: string
    modelID?: string
    id?: string
  },
): TurnErrorInfo {
  return TurnErrorInfo.parse({
    ...errorInfo,
    providerID: errorInfo.providerID ?? model?.providerID,
    modelID: errorInfo.modelID ?? model?.modelID ?? model?.id,
  })
}

export function toAssistantError(error: unknown): Message.Assistant["error"] {
  const info = fromUnknown(error)
  const record = readRecord(error)
  const sourceName = info.name
  const isProviderAPIError =
    sourceName === "AI_APICallError" ||
    sourceName === "APICallError" ||
    info.statusCode !== undefined ||
    readString(record?.responseBody) !== undefined

  if (isProviderAPIError) {
    const metadata: Record<string, string> = {}
    if (sourceName) metadata.sourceName = sourceName
    if (info.code) metadata.code = info.code

    return {
      name: "APIError",
      data: {
        message: info.message,
        statusCode: info.statusCode,
        isRetryable: info.retryable ?? false,
        responseHeaders: readStringRecord(record?.responseHeaders),
        responseBody: readString(record?.responseBody),
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      },
    } as Message.Assistant["error"]
  }

  return {
    name: "UnknownError",
    data: {
      message: info.message,
    },
  } as Message.Assistant["error"]
}

export function fromAssistantError(error: Message.Assistant["error"] | undefined): TurnErrorInfo | undefined {
  if (!error) return undefined

  const data = readRecord(error.data)
  const metadata = readRecord(data?.metadata)
  const message =
    readString(data?.message) ??
    (error.name === "MessageOutputLengthError"
      ? "Model output exceeded the configured limit."
      : "Assistant message failed.")

  return TurnErrorInfo.parse({
    name: readString(metadata?.sourceName) ?? error.name,
    message,
    code: readString(metadata?.code),
    statusCode: readNumber(data?.statusCode),
    retryable: readBoolean(data?.isRetryable),
  })
}
