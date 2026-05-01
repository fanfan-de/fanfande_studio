import { createHash } from "node:crypto"
import path from "node:path"
import { rmSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import * as Global from "#global/global.ts"

export const DEFAULT_MAX_RESULT_CHARS = 50_000
export const PREVIEW_CHARS = 2_000

const METADATA_KIND = "persisted-tool-output"
const METADATA_VERSION = 1
const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/
const SCRUBBED_METADATA_KEYS = new Set([
  "body",
  "content",
  "output",
  "raw",
  "stderr",
  "stdout",
  "text",
])

export type PersistedOutputMetadata = {
  kind: typeof METADATA_KIND
  version: typeof METADATA_VERSION
  path?: string
  envelopePath?: string
  originalSizeChars: number
  originalSizeBytes: number
  previewChars: number
  hasMore: boolean
  replacement: string
  failed?: boolean
  error?: string
}

export function getEffectiveThreshold(maxResultSizeChars?: number) {
  if (maxResultSizeChars === Infinity) return Infinity
  if (typeof maxResultSizeChars === "number" && Number.isFinite(maxResultSizeChars) && maxResultSizeChars > 0) {
    return Math.min(maxResultSizeChars, DEFAULT_MAX_RESULT_CHARS)
  }

  return DEFAULT_MAX_RESULT_CHARS
}

export function makeSafeFileSegment(value: string) {
  if (SAFE_SEGMENT_PATTERN.test(value)) return value
  return `tool_${createHash("sha256").update(value).digest("hex").slice(0, 16)}`
}

export function getSessionOutputDirectory(sessionID: string) {
  return path.join(Global.Path.state, "sessions", makeSafeFileSegment(sessionID), "tool-results")
}

export function getSessionDirectory(sessionID: string) {
  return path.join(Global.Path.state, "sessions", makeSafeFileSegment(sessionID))
}

function assertWithin(parent: string, child: string) {
  const resolvedParent = path.resolve(parent)
  const resolvedChild = path.resolve(child)
  const relative = path.relative(resolvedParent, resolvedChild)
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return
  }

  throw new Error(`Resolved path is outside expected directory: ${resolvedChild}`)
}

export function removeSessionOutputDirectory(sessionID: string) {
  const sessionsRoot = path.join(Global.Path.state, "sessions")
  const sessionDir = getSessionDirectory(sessionID)
  assertWithin(sessionsRoot, sessionDir)
  rmSync(sessionDir, { recursive: true, force: true })
}

export function makePreview(text: string, maxChars = PREVIEW_CHARS) {
  if (text.length <= maxChars) return text

  const slice = text.slice(0, maxChars)
  const lastNewline = slice.lastIndexOf("\n")

  if (lastNewline > maxChars * 0.5) {
    return slice.slice(0, lastNewline)
  }

  return slice
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB"]
  let value = bytes / 1024
  for (const unit of units) {
    if (value < 1024 || unit === units[units.length - 1]) {
      return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`
    }
    value /= 1024
  }

  return `${bytes} B`
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  return String(error)
}

function buildPersistedMessage(input: {
  path?: string
  bytes: number
  preview: string
  hasMore: boolean
  failed?: boolean
  error?: string
}) {
  const lines = [
    "<persisted-output>",
    input.failed
      ? `Output too large (${formatBytes(input.bytes)}). Full output could not be saved: ${input.error ?? "unknown error"}`
      : `Output too large (${formatBytes(input.bytes)}). Full output saved to: ${input.path}`,
    input.failed ? undefined : "Use read-file with this path if you need the full output.",
    "",
    `Preview (first ${PREVIEW_CHARS} chars):`,
    input.preview,
    input.hasMore ? "" : undefined,
    input.hasMore ? "[output truncated in context; read the file for full output]" : undefined,
    "</persisted-output>",
  ].filter((line): line is string => line !== undefined)

  return lines.join("\n")
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return JSON.stringify({
      serializationError: "Value could not be JSON serialized.",
      value: String(value),
    }, null, 2)
  }
}

async function writeOnce(filepath: string, content: string) {
  await writeFile(filepath, content, { encoding: "utf8", flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") return
    throw error
  })
}

function shouldScrubMetadataString(key: string, value: string) {
  return SCRUBBED_METADATA_KEYS.has(key.toLowerCase()) || value.length > PREVIEW_CHARS
}

export function scrubMetadataForPersistedOutput(
  value: Record<string, unknown>,
  persisted: PersistedOutputMetadata,
): Record<string, unknown> {
  function scrub(current: unknown, key = "", depth = 0): unknown {
    if (typeof current === "string") {
      if (shouldScrubMetadataString(key, current)) {
        return `[omitted from context; full tool output is saved at ${persisted.path ?? "(save failed)"}]`
      }
      return current
    }

    if (!current || typeof current !== "object" || depth > 6) {
      return current
    }

    if (Array.isArray(current)) {
      return current.map((item) => scrub(item, key, depth + 1))
    }

    const output: Record<string, unknown> = {}
    for (const [childKey, childValue] of Object.entries(current as Record<string, unknown>)) {
      output[childKey] = scrub(childValue, childKey, depth + 1)
    }
    return output
  }

  const scrubbed = scrub(value) as Record<string, unknown>
  return {
    ...scrubbed,
    persistedOutput: persisted,
  } as Record<string, unknown>
}

export function readPersistedOutputMetadata(metadata: Record<string, unknown> | undefined): PersistedOutputMetadata | undefined {
  const candidate = metadata?.persistedOutput
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return undefined
  const record = candidate as Record<string, unknown>
  if (record.kind !== METADATA_KIND || record.version !== METADATA_VERSION) return undefined
  if (typeof record.replacement !== "string") return undefined

  return record as PersistedOutputMetadata
}

export async function maybePersistToolResult(input: {
  sessionID: string
  toolCallID: string
  toolName: string
  output: string
  metadata: Record<string, unknown>
  modelOutput: unknown
  maxResultSizeChars?: number
}): Promise<{
  output: string
  metadata: Record<string, unknown>
  modelOutput: unknown
  persisted?: PersistedOutputMetadata
}> {
  const threshold = getEffectiveThreshold(input.maxResultSizeChars)
  if (threshold === Infinity || input.output.length <= threshold) {
    return {
      output: input.output,
      metadata: input.metadata,
      modelOutput: input.modelOutput,
    }
  }

  const bytes = Buffer.byteLength(input.output, "utf8")
  const preview = makePreview(input.output, PREVIEW_CHARS)
  const hasMore = input.output.length > preview.length

  try {
    const dir = getSessionOutputDirectory(input.sessionID)
    await mkdir(dir, { recursive: true })

    const safeToolCallID = makeSafeFileSegment(input.toolCallID)
    const filepath = path.join(dir, `${safeToolCallID}.txt`)
    const envelopePath = path.join(dir, `${safeToolCallID}.json`)
    assertWithin(dir, filepath)
    assertWithin(dir, envelopePath)

    await writeOnce(filepath, input.output)
    await writeOnce(envelopePath, safeJson({
      version: METADATA_VERSION,
      sessionID: input.sessionID,
      toolCallID: input.toolCallID,
      toolName: input.toolName,
      output: input.output,
      metadata: input.metadata,
      modelOutput: input.modelOutput,
    }))

    const replacement = buildPersistedMessage({
      path: filepath,
      bytes,
      preview,
      hasMore,
    })
    const persisted: PersistedOutputMetadata = {
      kind: METADATA_KIND,
      version: METADATA_VERSION,
      path: filepath,
      envelopePath,
      originalSizeChars: input.output.length,
      originalSizeBytes: bytes,
      previewChars: preview.length,
      hasMore,
      replacement,
    }

    return {
      output: replacement,
      metadata: scrubMetadataForPersistedOutput(input.metadata, persisted),
      modelOutput: undefined,
      persisted,
    }
  } catch (error) {
    const replacement = buildPersistedMessage({
      bytes,
      preview,
      hasMore,
      failed: true,
      error: errorMessage(error),
    })
    const persisted: PersistedOutputMetadata = {
      kind: METADATA_KIND,
      version: METADATA_VERSION,
      originalSizeChars: input.output.length,
      originalSizeBytes: bytes,
      previewChars: preview.length,
      hasMore,
      replacement,
      failed: true,
      error: errorMessage(error),
    }

    return {
      output: replacement,
      metadata: scrubMetadataForPersistedOutput(input.metadata, persisted),
      modelOutput: undefined,
      persisted,
    }
  }
}
