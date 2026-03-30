import { stat, unlink } from "node:fs/promises"
import z from "zod"
import * as Tool from "#tool/tool.ts"
import { readTextFile, resolveToolPath, toDisplayPath, writeTextFile } from "#tool/shared.ts"

type HunkLine = {
  type: "context" | "add" | "remove"
  text: string
}

type Hunk = {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  lines: HunkLine[]
}

type FilePatch = {
  oldPath: string | null
  newPath: string | null
  hunks: Hunk[]
  oldNoNewlineAtEnd?: boolean
  newNoNewlineAtEnd?: boolean
}

type ApplyAction =
  | { kind: "created"; path: string; additions: number; deletions: number }
  | { kind: "updated"; path: string; additions: number; deletions: number }
  | { kind: "deleted"; path: string; additions: number; deletions: number }
  | { kind: "moved"; from: string; to: string; additions: number; deletions: number }
  | { kind: "unchanged"; path: string; additions: number; deletions: number }

type SplitContent = {
  lines: string[]
  newline: "\n" | "\r\n"
  hasFinalNewline: boolean
}

function parsePatchPath(raw: string): string | null {
  let value = raw.trim()

  const tabIndex = value.indexOf("\t")
  if (tabIndex >= 0) {
    value = value.slice(0, tabIndex)
  }

  if (value.startsWith("\"") && value.endsWith("\"") && value.length >= 2) {
    value = value
      .slice(1, -1)
      .replaceAll("\\\\", "\\")
      .replaceAll("\\\"", "\"")
  }

  if (value === "/dev/null") return null
  if (value.startsWith("a/") || value.startsWith("b/")) value = value.slice(2)

  if (!value) {
    throw new Error("Patch contains an empty file path.")
  }

  return value
}

function parseHunkHeader(line: string): Hunk {
  const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line)
  if (!match) {
    throw new Error(`Invalid hunk header: ${line}`)
  }

  return {
    oldStart: Number(match[1]),
    oldCount: Number(match[2] ?? "1"),
    newStart: Number(match[3]),
    newCount: Number(match[4] ?? "1"),
    lines: [],
  }
}

function parseUnifiedDiff(diff: string): FilePatch[] {
  type MutableFilePatch = {
    oldPath?: string | null
    newPath?: string | null
    hunks: Hunk[]
    oldNoNewlineAtEnd?: boolean
    newNoNewlineAtEnd?: boolean
  }

  const normalized = diff.replace(/\r\n/g, "\n")
  const lines = normalized.split("\n")
  const files: FilePatch[] = []

  let index = 0
  let current: MutableFilePatch | undefined
  let hunk: Hunk | undefined
  let lastLineType: HunkLine["type"] | undefined

  const ensureCurrent = () => {
    if (!current) {
      current = { hunks: [] }
    }
  }

  const finalizeHunk = () => {
    if (!hunk) return
    ensureCurrent()
    current!.hunks.push(hunk)
    hunk = undefined
    lastLineType = undefined
  }

  const finalizeFile = () => {
    if (!current) return
    finalizeHunk()

    if (current.oldPath === undefined || current.newPath === undefined) {
      throw new Error("Patch file header is incomplete. Expected both --- and +++ lines.")
    }

    files.push({
      oldPath: current.oldPath,
      newPath: current.newPath,
      hunks: current.hunks,
      oldNoNewlineAtEnd: current.oldNoNewlineAtEnd,
      newNoNewlineAtEnd: current.newNoNewlineAtEnd,
    })

    current = undefined
  }

  while (index < lines.length) {
    const line = lines[index]!

    if (line.startsWith("diff --git ")) {
      finalizeFile()
      current = { hunks: [] }
      index += 1
      continue
    }

    if (line.startsWith("--- ")) {
      if (current?.oldPath !== undefined && current?.newPath !== undefined) {
        finalizeFile()
      }

      ensureCurrent()
      current!.oldPath = parsePatchPath(line.slice(4))

      const next = lines[index + 1]
      if (!next || !next.startsWith("+++ ")) {
        throw new Error("Patch file header is incomplete. Expected a +++ line after ---.")
      }
      current!.newPath = parsePatchPath(next.slice(4))

      index += 2
      continue
    }

    if (line.startsWith("@@ ")) {
      ensureCurrent()
      if (current!.oldPath === undefined || current!.newPath === undefined) {
        throw new Error("Encountered a hunk before a file header.")
      }
      finalizeHunk()
      hunk = parseHunkHeader(line)
      index += 1
      continue
    }

    if (hunk) {
      if (line.startsWith(" ")) {
        hunk.lines.push({ type: "context", text: line.slice(1) })
        lastLineType = "context"
        index += 1
        continue
      }
      if (line.startsWith("+")) {
        hunk.lines.push({ type: "add", text: line.slice(1) })
        lastLineType = "add"
        index += 1
        continue
      }
      if (line.startsWith("-")) {
        hunk.lines.push({ type: "remove", text: line.slice(1) })
        lastLineType = "remove"
        index += 1
        continue
      }
      if (line === "\\ No newline at end of file") {
        ensureCurrent()
        if (lastLineType === "add") current!.newNoNewlineAtEnd = true
        else if (lastLineType === "remove") current!.oldNoNewlineAtEnd = true
        else if (lastLineType === "context") {
          current!.oldNoNewlineAtEnd = true
          current!.newNoNewlineAtEnd = true
        }
        index += 1
        continue
      }

      finalizeHunk()
      continue
    }

    if (!line.trim()) {
      index += 1
      continue
    }

    if (current) {
      index += 1
      continue
    }

    index += 1
  }

  finalizeFile()

  if (files.length === 0) {
    throw new Error("Patch does not contain any file changes.")
  }

  return files
}

function splitContent(text: string): SplitContent {
  const newline: "\n" | "\r\n" = text.includes("\r\n") ? "\r\n" : "\n"
  const normalized = text.replace(/\r\n/g, "\n")

  if (!normalized.length) {
    return {
      lines: [],
      newline,
      hasFinalNewline: false,
    }
  }

  const hasFinalNewline = normalized.endsWith("\n")
  const lines = normalized.split("\n")
  if (hasFinalNewline) {
    lines.pop()
  }

  return {
    lines,
    newline,
    hasFinalNewline,
  }
}

function joinContent(content: SplitContent): string {
  if (!content.lines.length) {
    return content.hasFinalNewline ? content.newline : ""
  }

  const body = content.lines.join(content.newline)
  return content.hasFinalNewline ? `${body}${content.newline}` : body
}

function applyHunks(sourceLines: string[], hunks: Hunk[], label: string): string[] {
  if (hunks.length === 0) return sourceLines.slice()

  const output: string[] = []
  let cursor = 0

  for (const hunk of hunks) {
    const expectedIndex = Math.max(0, hunk.oldStart - 1)
    if (expectedIndex < cursor || expectedIndex > sourceLines.length) {
      throw new Error(`Hunk target is out of range for ${label} at line ${hunk.oldStart}.`)
    }

    output.push(...sourceLines.slice(cursor, expectedIndex))
    cursor = expectedIndex

    let oldSeen = 0
    let newSeen = 0

    for (const line of hunk.lines) {
      if (line.type === "context") {
        const actual = sourceLines[cursor]
        if (actual !== line.text) {
          throw new Error(
            `Patch context mismatch in ${label} at line ${cursor + 1}. Expected "${line.text}" but found "${actual ?? "<EOF>"}".`,
          )
        }
        output.push(actual)
        cursor += 1
        oldSeen += 1
        newSeen += 1
        continue
      }

      if (line.type === "remove") {
        const actual = sourceLines[cursor]
        if (actual !== line.text) {
          throw new Error(
            `Patch removal mismatch in ${label} at line ${cursor + 1}. Expected "${line.text}" but found "${actual ?? "<EOF>"}".`,
          )
        }
        cursor += 1
        oldSeen += 1
        continue
      }

      output.push(line.text)
      newSeen += 1
    }

    if (oldSeen !== hunk.oldCount) {
      throw new Error(
        `Hunk old-count mismatch in ${label}: expected ${hunk.oldCount}, applied ${oldSeen}.`,
      )
    }

    if (newSeen !== hunk.newCount) {
      throw new Error(
        `Hunk new-count mismatch in ${label}: expected ${hunk.newCount}, produced ${newSeen}.`,
      )
    }
  }

  output.push(...sourceLines.slice(cursor))
  return output
}

function additionsOf(hunks: Hunk[]) {
  return hunks.reduce((count, hunk) => count + hunk.lines.filter((line) => line.type === "add").length, 0)
}

function deletionsOf(hunks: Hunk[]) {
  return hunks.reduce((count, hunk) => count + hunk.lines.filter((line) => line.type === "remove").length, 0)
}

async function pathExists(filepath: string): Promise<boolean> {
  return await stat(filepath).then(() => true).catch(() => false)
}

function samePath(left: string, right: string) {
  if (process.platform === "win32") {
    return left.toLowerCase() === right.toLowerCase()
  }
  return left === right
}

function formatAction(action: ApplyAction): string {
  const diffStat = `(+${action.additions} -${action.deletions})`

  if (action.kind === "created") {
    return `created ${action.path} ${diffStat}`
  }
  if (action.kind === "updated") {
    return `updated ${action.path} ${diffStat}`
  }
  if (action.kind === "deleted") {
    return `deleted ${action.path} ${diffStat}`
  }
  if (action.kind === "unchanged") {
    return `unchanged ${action.path} ${diffStat}`
  }
  return `moved ${action.from} -> ${action.to} ${diffStat}`
}

export const ApplyPatchTool = Tool.define(
  "apply_patch",
  async () => {
    return {
      description: "Apply a Git-style unified diff patch to project files.",
      parameters: z.object({
        patch: z.string().min(1).describe("Unified diff text (Git format) containing one or more file patches."),
      }),
      execute: async (parameters) => {
        const filePatches = parseUnifiedDiff(parameters.patch)
        const actions: ApplyAction[] = []

        for (const filePatch of filePatches) {
          const additions = additionsOf(filePatch.hunks)
          const deletions = deletionsOf(filePatch.hunks)

          if (filePatch.oldPath === null && filePatch.newPath === null) {
            throw new Error("Patch contains an invalid file header with both paths set to /dev/null.")
          }

          if (filePatch.oldPath === null) {
            const targetResolved = resolveToolPath(filePatch.newPath!)
            if (await pathExists(targetResolved)) {
              throw new Error(`Cannot create ${toDisplayPath(targetResolved)} because it already exists.`)
            }

            const updatedLines = applyHunks([], filePatch.hunks, toDisplayPath(targetResolved))
            const content: SplitContent = {
              lines: updatedLines,
              newline: "\n",
              hasFinalNewline: filePatch.newNoNewlineAtEnd ? false : updatedLines.length > 0,
            }

            await writeTextFile(filePatch.newPath!, joinContent(content))
            actions.push({
              kind: "created",
              path: toDisplayPath(targetResolved),
              additions,
              deletions,
            })
            continue
          }

          if (filePatch.newPath === null) {
            const sourceResolved = resolveToolPath(filePatch.oldPath)
            const originalText = await readTextFile(filePatch.oldPath)
            const source = splitContent(originalText)
            const updatedLines = applyHunks(source.lines, filePatch.hunks, toDisplayPath(sourceResolved))

            if (updatedLines.length > 0) {
              throw new Error(`Delete patch for ${toDisplayPath(sourceResolved)} did not remove all lines.`)
            }

            await unlink(sourceResolved)
            actions.push({
              kind: "deleted",
              path: toDisplayPath(sourceResolved),
              additions,
              deletions,
            })
            continue
          }

          const sourceResolved = resolveToolPath(filePatch.oldPath)
          const targetResolved = resolveToolPath(filePatch.newPath)
          const rename = !samePath(sourceResolved, targetResolved)

          if (rename && await pathExists(targetResolved)) {
            throw new Error(`Cannot move to ${toDisplayPath(targetResolved)} because it already exists.`)
          }

          const originalText = await readTextFile(filePatch.oldPath)
          const source = splitContent(originalText)
          const updatedLines = applyHunks(source.lines, filePatch.hunks, toDisplayPath(sourceResolved))

          const content: SplitContent = {
            lines: updatedLines,
            newline: source.newline,
            hasFinalNewline: filePatch.newNoNewlineAtEnd ? false : source.hasFinalNewline,
          }
          const updatedText = joinContent(content)

          if (rename) {
            await writeTextFile(filePatch.newPath, updatedText)
            await unlink(sourceResolved)
            actions.push({
              kind: "moved",
              from: toDisplayPath(sourceResolved),
              to: toDisplayPath(targetResolved),
              additions,
              deletions,
            })
            continue
          }

          if (updatedText === originalText) {
            actions.push({
              kind: "unchanged",
              path: toDisplayPath(targetResolved),
              additions,
              deletions,
            })
            continue
          }

          await writeTextFile(filePatch.newPath, updatedText)
          actions.push({
            kind: "updated",
            path: toDisplayPath(targetResolved),
            additions,
            deletions,
          })
        }

        return {
          title: "Applied unified diff",
          output: [
            `Applied patch to ${actions.length} file(s).`,
            "",
            ...actions.map((action) => `- ${formatAction(action)}`),
          ].join("\n"),
        }
      },
    }
  },
)
