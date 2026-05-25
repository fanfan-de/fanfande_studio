import type {
  AssistantTraceDraftPatchPreview,
  AssistantTraceFileChange,
  AssistantTraceStatus,
} from "./types"

const PATCH_PROPERTY_PATTERN = /"(patch|input|cmd|command|content)"\s*:/g
const MAX_RAW_TOOL_INPUT_BYTES = 1024 * 1024
const MAX_PREVIEW_FILES = 200
const MAX_PREVIEW_ROWS = 5000

type StreamingPatchStatus = NonNullable<AssistantTraceFileChange["previewState"]>
type PatchOperation = "add" | "update" | "delete" | "move"

interface PartialJsonStringResult {
  complete: boolean
  endIndex?: number
  invalid?: boolean
  value: string
}

interface MutablePatchFile {
  additions: number
  deletions: number
  file: string
  fromFile?: string
  operation: PatchOperation
  previewHunks: NonNullable<AssistantTraceFileChange["previewHunks"]>
}

export interface StreamingPatchInputExtraction {
  complete: boolean
  invalid?: boolean
  patch?: string
  truncated?: boolean
}

export interface StreamingPatchPreview {
  files: AssistantTraceFileChange[]
  pendingLine?: string
  status: StreamingPatchStatus | "empty"
  truncated?: boolean
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).length
}

function truncateToMaxBytes(value: string, maxBytes: number) {
  if (byteLength(value) <= maxBytes) {
    return {
      truncated: false,
      value,
    }
  }

  let bytes = 0
  let result = ""
  for (const char of value) {
    const nextBytes = byteLength(char)
    if (bytes + nextBytes > maxBytes) break
    bytes += nextBytes
    result += char
  }
  return {
    truncated: true,
    value: result,
  }
}

function decodeJsonEscape(value: string) {
  switch (value) {
    case "\"":
      return "\""
    case "\\":
      return "\\"
    case "/":
      return "/"
    case "b":
      return "\b"
    case "f":
      return "\f"
    case "n":
      return "\n"
    case "r":
      return "\r"
    case "t":
      return "\t"
    default:
      return value
  }
}

function parsePartialJsonString(input: string, quoteIndex: number): PartialJsonStringResult {
  let value = ""
  let index = quoteIndex + 1

  while (index < input.length) {
    const char = input[index] ?? ""
    if (char === "\"") {
      return {
        complete: true,
        endIndex: index + 1,
        value,
      }
    }

    if (char !== "\\") {
      value += char
      index += 1
      continue
    }

    index += 1
    if (index >= input.length) {
      return {
        complete: false,
        endIndex: index,
        value,
      }
    }

    const escaped = input[index] ?? ""
    if (escaped !== "u") {
      value += decodeJsonEscape(escaped)
      index += 1
      continue
    }

    const hex = input.slice(index + 1, index + 5)
    if (hex.length < 4) {
      return {
        complete: false,
        endIndex: index,
        value,
      }
    }
    if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
      return {
        complete: false,
        endIndex: index + 1,
        invalid: true,
        value,
      }
    }

    value += String.fromCharCode(Number.parseInt(hex, 16))
    index += 5
  }

  return {
    complete: false,
    endIndex: input.length,
    value,
  }
}

function isPatchString(value: string) {
  return value.includes("*** Begin Patch")
}

function readPatchFromParsedJson(input: string): StreamingPatchInputExtraction | null {
  try {
    const parsed = JSON.parse(input) as unknown
    if (typeof parsed === "string") {
      return isPatchString(parsed)
        ? {
            complete: true,
            patch: parsed,
          }
        : null
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
    const patch = (parsed as { patch?: unknown }).patch
    if (typeof patch === "string") {
      return {
        complete: true,
        patch,
      }
    }
    if (patch !== undefined) {
      return {
        complete: true,
        invalid: true,
      }
    }

    for (const key of ["input", "cmd", "command", "content"]) {
      const value = (parsed as Record<string, unknown>)[key]
      if (typeof value === "string" && isPatchString(value)) {
        return {
          complete: true,
          patch: value,
        }
      }
    }

    return null
  } catch {
    return null
  }
}

function findPatchPropertyString(input: string): StreamingPatchInputExtraction | null {
  PATCH_PROPERTY_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = PATCH_PROPERTY_PATTERN.exec(input)) !== null) {
    const key = match[1] ?? ""
    let index = PATCH_PROPERTY_PATTERN.lastIndex
    while (index < input.length && /\s/.test(input[index] ?? "")) index += 1

    if (input[index] !== "\"") {
      if (index >= input.length) {
        return {
          complete: false,
        }
      }
      continue
    }

    const parsed = parsePartialJsonString(input, index)
    if (key !== "patch" && !isPatchString(parsed.value)) {
      continue
    }
    return {
      complete: parsed.complete,
      invalid: parsed.invalid,
      patch: parsed.value,
    }
  }

  return null
}

function findJsonStringContainingPatch(input: string): StreamingPatchInputExtraction | null {
  let index = 0
  while (index < input.length) {
    if (input[index] !== "\"") {
      index += 1
      continue
    }

    const parsed = parsePartialJsonString(input, index)
    if (isPatchString(parsed.value)) {
      return {
        complete: parsed.complete,
        invalid: parsed.invalid,
        patch: parsed.value,
      }
    }

    index = Math.max(index + 1, parsed.endIndex ?? index + 1)
  }

  return null
}

export function extractStreamingPatchInput(rawToolInput: string): StreamingPatchInputExtraction {
  const truncatedInput = truncateToMaxBytes(rawToolInput, MAX_RAW_TOOL_INPUT_BYTES)
  const input = truncatedInput.value
  const parsed = readPatchFromParsedJson(input)
  const extracted = parsed ?? findPatchPropertyString(input) ?? findJsonStringContainingPatch(input)
  if (extracted) {
    return {
      ...extracted,
      complete: extracted.complete || Boolean(extracted.patch?.includes("*** End Patch")),
      truncated: truncatedInput.truncated,
    }
  }

  const markerIndex = input.indexOf("*** Begin Patch")
  if (markerIndex === -1) {
    return {
      complete: false,
      truncated: truncatedInput.truncated,
    }
  }

  const patch = input.slice(markerIndex)
  return {
    complete: patch.includes("*** End Patch"),
    patch,
    truncated: truncatedInput.truncated,
  }
}

function parsePatchPath(raw: string) {
  let value = raw.trim()
  const tabIndex = value.indexOf("\t")
  if (tabIndex >= 0) value = value.slice(0, tabIndex)
  if (value.startsWith("\"") && value.endsWith("\"") && value.length >= 2) {
    value = value.slice(1, -1).replaceAll("\\\\", "\\").replaceAll("\\\"", "\"")
  }
  if (value === "/dev/null") return ""
  return value
}

function createPatchFile(operation: PatchOperation, file: string, fromFile?: string): MutablePatchFile {
  return {
    additions: 0,
    deletions: 0,
    file,
    ...(fromFile ? { fromFile } : {}),
    operation,
    previewHunks: [],
  }
}

function ensureHunk(file: MutablePatchFile, header: string) {
  let hunk = file.previewHunks[file.previewHunks.length - 1]
  if (!hunk) {
    hunk = {
      header,
      rows: [],
    }
    file.previewHunks.push(hunk)
  }
  return hunk
}

function pushHunkLine(
  file: MutablePatchFile,
  tone: "add" | "context" | "remove",
  content: string,
  header = "Patch hunk",
) {
  const hunk = ensureHunk(file, header)
  hunk.rows.push({
    content,
    tone,
  })
  if (tone === "add") file.additions += 1
  if (tone === "remove") file.deletions += 1
}

function toFileChange(file: MutablePatchFile, status: StreamingPatchStatus): AssistantTraceFileChange {
  return {
    file: file.file,
    additions: file.additions,
    deletions: file.deletions,
    ...(file.fromFile ? { fromFile: file.fromFile } : {}),
    operation: file.operation,
    previewHunks: file.previewHunks,
    previewState: status,
  }
}

function trimPreviewToLimits(files: MutablePatchFile[]) {
  let rows = 0
  let truncated = files.length > MAX_PREVIEW_FILES
  const keptFiles = files.slice(0, MAX_PREVIEW_FILES)

  for (const file of keptFiles) {
    for (const hunk of file.previewHunks) {
      if (rows >= MAX_PREVIEW_ROWS) {
        hunk.rows = []
        truncated = true
        continue
      }

      const remaining = MAX_PREVIEW_ROWS - rows
      if (hunk.rows.length > remaining) {
        hunk.rows = hunk.rows.slice(0, remaining)
        truncated = true
      }
      rows += hunk.rows.length
    }
  }

  return {
    files: keptFiles,
    truncated,
  }
}

export function parseStreamingBeginPatch(patch: string): StreamingPatchPreview {
  const normalized = patch.replace(/\r\n/g, "\n")
  const allLines = normalized.split("\n")
  let pendingLine = normalized.endsWith("\n") ? undefined : allLines.pop()
  if (pendingLine === "*** End Patch") {
    allLines.push(pendingLine)
    pendingLine = undefined
  }
  const firstContentIndex = allLines.findIndex((line) => line.trim().length > 0)
  if (firstContentIndex === -1 || allLines[firstContentIndex] !== "*** Begin Patch") {
    return {
      files: [],
      pendingLine,
      status: "empty",
    }
  }

  const files: MutablePatchFile[] = []
  let current: MutablePatchFile | null = null
  let complete = false
  let invalid = false

  for (let index = firstContentIndex + 1; index < allLines.length; index += 1) {
    const line = allLines[index] ?? ""
    if (line === "*** End Patch") {
      complete = true
      break
    }

    if (line.startsWith("*** Add File: ")) {
      const file = parsePatchPath(line.slice("*** Add File: ".length))
      if (!file) {
        invalid = true
        current = null
        continue
      }
      current = createPatchFile("add", file)
      files.push(current)
      ensureHunk(current, "New file")
      continue
    }

    if (line.startsWith("*** Update File: ")) {
      const file = parsePatchPath(line.slice("*** Update File: ".length))
      if (!file) {
        invalid = true
        current = null
        continue
      }
      current = createPatchFile("update", file)
      files.push(current)
      continue
    }

    if (line.startsWith("*** Delete File: ")) {
      const file = parsePatchPath(line.slice("*** Delete File: ".length))
      if (!file) {
        invalid = true
        current = null
        continue
      }
      current = createPatchFile("delete", file)
      files.push(current)
      continue
    }

    if (line.startsWith("*** Move to: ")) {
      const file = parsePatchPath(line.slice("*** Move to: ".length))
      if (!current || !file) {
        invalid = true
        continue
      }
      current.fromFile = current.file
      current.file = file
      current.operation = "move"
      continue
    }

    if (line === "@@" || line.startsWith("@@ ")) {
      if (!current || current.operation === "add" || current.operation === "delete") {
        invalid = true
        continue
      }
      current.previewHunks.push({
        header: line.slice(2).trim() || "Patch hunk",
        rows: [],
      })
      continue
    }

    if (!current) {
      if (line.trim()) invalid = true
      continue
    }

    if (line === "*** End of File" || line === "\\ No newline at end of file") {
      continue
    }

    if (current.operation === "delete") {
      if (line.trim()) invalid = true
      continue
    }

    if (current.operation === "add") {
      if (line.startsWith("+")) {
        pushHunkLine(current, "add", line.slice(1), "New file")
      } else if (line.trim()) {
        invalid = true
      }
      continue
    }

    if (line.startsWith(" ")) {
      pushHunkLine(current, "context", line.slice(1))
      continue
    }
    if (line.startsWith("-")) {
      pushHunkLine(current, "remove", line.slice(1))
      continue
    }
    if (line.startsWith("+")) {
      pushHunkLine(current, "add", line.slice(1))
      continue
    }

    if (line.trim()) invalid = true
  }

  const limited = trimPreviewToLimits(files)
  const status: StreamingPatchStatus = limited.truncated
    ? "truncated"
    : invalid
      ? "invalid"
      : complete
        ? "complete"
        : "streaming"

  return {
    files: limited.files.map((file) => toFileChange(file, status)),
    pendingLine,
    status,
    truncated: limited.truncated,
  }
}

function summarizeFiles(files: AssistantTraceFileChange[]) {
  return files.reduce(
    (summary, file) => ({
      additions: summary.additions + file.additions,
      deletions: summary.deletions + file.deletions,
      files: summary.files + 1,
    }),
    {
      additions: 0,
      deletions: 0,
      files: 0,
    },
  )
}

function normalizeDraftStatus(status: AssistantTraceStatus | undefined, previewStatus: StreamingPatchPreview["status"]) {
  if (status && status !== "pending") return status
  if (previewStatus === "invalid") return "error"
  return "running"
}

export function toDraftPatchPreview(input: {
  rawToolInput: string
  status?: AssistantTraceStatus
}): AssistantTraceDraftPatchPreview | null {
  const extracted = extractStreamingPatchInput(input.rawToolInput)
  if (!extracted.patch) return null

  const parsed = parseStreamingBeginPatch(extracted.patch)
  if (parsed.files.length === 0) return null

  const files = extracted.truncated
    ? parsed.files.map((file) => ({
        ...file,
        previewState: "truncated" as const,
      }))
    : parsed.files
  const stats = summarizeFiles(files)
  const status = normalizeDraftStatus(input.status, extracted.invalid ? "invalid" : parsed.status)
  const isTerminal = status === "completed" || status === "cancelled" || status === "denied" || status === "error"

  return {
    title: `${stats.files} draft file change${stats.files === 1 ? "" : "s"} (+${stats.additions} -${stats.deletions})`,
    detail: extracted.truncated
      ? "Streaming apply_patch preview is truncated."
      : parsed.status === "invalid" || extracted.invalid
        ? "Streaming apply_patch input is not yet valid."
        : "Streaming apply_patch preview. The patch has not been confirmed by workspace diff yet.",
    fileChanges: files,
    filePaths: files.map((file) => file.file),
    status,
    isStreaming: !isTerminal,
  }
}
