import type { WorkspaceFileLineRange } from "../types"

const CODE_FENCE_LANGUAGE_BY_EXTENSION: Record<string, string> = {
  css: "css",
  html: "html",
  js: "javascript",
  json: "json",
  jsx: "jsx",
  log: "text",
  md: "markdown",
  toml: "toml",
  ts: "typescript",
  tsx: "tsx",
  txt: "text",
  yaml: "yaml",
  yml: "yaml",
}

export function normalizeWorkspaceFileLineRange(startLineNumber: number, endLineNumber = startLineNumber): WorkspaceFileLineRange {
  return startLineNumber <= endLineNumber
    ? { startLineNumber, endLineNumber }
    : { startLineNumber: endLineNumber, endLineNumber: startLineNumber }
}

export function formatWorkspaceFileLineRangeLabel(startLineNumber: number, endLineNumber = startLineNumber) {
  return startLineNumber === endLineNumber
    ? `Line ${String(startLineNumber)}`
    : `Lines ${String(startLineNumber)}-${String(endLineNumber)}`
}

function getWorkspaceFileName(filePath: string) {
  const normalizedPath = filePath.replace(/\\/g, "/")
  const segments = normalizedPath.split("/").filter(Boolean)
  return segments[segments.length - 1] ?? filePath
}

export function buildWorkspaceFileCommentReferenceLabel(filePath: string, startLineNumber: number, endLineNumber = startLineNumber) {
  const fileName = getWorkspaceFileName(filePath)
  return startLineNumber === endLineNumber
    ? `${fileName}:L${String(startLineNumber)}`
    : `${fileName}:L${String(startLineNumber)}-L${String(endLineNumber)}`
}

function resolveCodeFenceLanguage(extension: string | null) {
  if (!extension) return ""
  return CODE_FENCE_LANGUAGE_BY_EXTENSION[extension.toLowerCase()] ?? extension.toLowerCase()
}

export function buildWorkspaceFileCommentDraft(input: {
  content: string
  extension: string | null
  filePath: string
  comment: {
    text: string
    startLineNumber: number
    endLineNumber: number
  }
}) {
  const commentText = input.comment.text.trim()
  if (!commentText) return ""

  const range = normalizeWorkspaceFileLineRange(input.comment.startLineNumber, input.comment.endLineNumber)
  const fileLines = input.content.split(/\r?\n/)
  const selectedLines = fileLines
    .slice(range.startLineNumber - 1, range.endLineNumber)
    .map((line, index) => `${String(range.startLineNumber + index)} | ${line}`)

  if (selectedLines.length === 0) return ""

  const language = resolveCodeFenceLanguage(input.extension)
  const codeFence = `\`\`\`${language}`

  return [
    `File feedback for ${input.filePath} (${formatWorkspaceFileLineRangeLabel(range.startLineNumber, range.endLineNumber)})`,
    "",
    codeFence,
    ...selectedLines,
    "```",
    "",
    "Comment:",
    commentText,
  ].join("\n")
}
