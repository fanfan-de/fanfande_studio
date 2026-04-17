import path from "node:path"
import { createReadStream, realpathSync } from "node:fs"
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises"
import { Instance } from "#project/instance.ts"
import * as Filesystem from "#util/filesystem.ts"

const FAST_TEXT_READ_BYTES = 1024 * 1024
const TEXT_SAMPLE_BYTES = 8192

const BLOCKED_DEVICE_PATHS = new Set([
  "/dev/zero",
  "/dev/random",
  "/dev/urandom",
  "/dev/full",
  "/dev/stdin",
  "/dev/stdout",
  "/dev/stderr",
  "/dev/tty",
  "/dev/console",
  "/dev/fd/0",
  "/dev/fd/1",
  "/dev/fd/2",
])

const BINARY_EXTENSIONS = new Set([
  ".7z",
  ".a",
  ".avi",
  ".bin",
  ".bmp",
  ".class",
  ".dll",
  ".dmg",
  ".doc",
  ".docx",
  ".eot",
  ".exe",
  ".gif",
  ".gz",
  ".ico",
  ".jar",
  ".jpeg",
  ".jpg",
  ".lib",
  ".mov",
  ".mp3",
  ".mp4",
  ".o",
  ".otf",
  ".pdf",
  ".png",
  ".pyc",
  ".rar",
  ".so",
  ".sqlite",
  ".sqlite3",
  ".tar",
  ".ttf",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".xls",
  ".xlsx",
  ".zip",
])

const DEFAULT_SKIPPED_DIRECTORY_NAMES = new Set([
  ".git",
  "node_modules",
])

type TextFileAction = "read" | "write"
export type ProjectEntryKind = "file" | "directory"

export interface ProjectEntry {
  path: string
  relativePath: string
  displayPath: string
  kind: ProjectEntryKind
}

export interface WriteTextFileTarget {
  path: string
  displayPath: string
  exists: boolean
}

function isUncPath(targetPath: string) {
  return targetPath.startsWith("\\\\") || targetPath.startsWith("//")
}

function tryRealpath(targetPath: string): string | undefined {
  try {
    return Filesystem.normalizePath(realpathSync.native(targetPath))
  } catch {
    return undefined
  }
}

function resolveDeepestExistingPath(targetPath: string): string {
  const suffix: string[] = []
  let current = targetPath

  while (true) {
    const resolved = tryRealpath(current)
    if (resolved) {
      return Filesystem.normalizePath(
        suffix.length > 0 ? path.join(resolved, ...suffix) : resolved,
      )
    }

    const parent = path.dirname(current)
    if (parent === current) return Filesystem.normalizePath(targetPath)
    suffix.unshift(path.basename(current))
    current = parent
  }
}

export function resolveToolPath(inputPath: string): string {
  if (isUncPath(inputPath)) {
    throw new Error(`UNC paths are not supported: ${inputPath}`)
  }

  const resolved = path.isAbsolute(inputPath)
    ? path.resolve(inputPath)
    : path.resolve(Instance.directory, inputPath)
  const normalized = Filesystem.normalizePath(resolved)

  if (!Instance.containsPath(normalized)) {
    throw new Error(`Path is outside the active project boundary: ${inputPath}`)
  }

  const canonical = resolveDeepestExistingPath(normalized)
  const canonicalRoots = [
    resolveDeepestExistingPath(Instance.directory),
    resolveDeepestExistingPath(Instance.worktree),
  ]

  const insideCanonicalBoundary = canonicalRoots.some((root) =>
    Filesystem.contains(root, canonical)
  )

  if (!insideCanonicalBoundary) {
    throw new Error(`Path resolves outside the active project boundary: ${inputPath}`)
  }

  return normalized
}

export function toDisplayPath(resolvedPath: string): string {
  const relative = path.relative(Instance.directory, resolvedPath)
  return relative ? relative : "."
}

export async function walkProjectEntries(
  root: string,
  options: {
    includeHidden?: boolean
    visit: (entry: ProjectEntry) => boolean | void | Promise<boolean | void>
  },
) {
  const info = await stat(root)
  if (!info.isDirectory()) return

  let stopped = false

  const walk = async (current: string): Promise<void> => {
    if (stopped) return

    const items = await readdir(current, { withFileTypes: true })
    items.sort((left, right) => left.name.localeCompare(right.name))

    for (const item of items) {
      if (stopped) return
      if (!options.includeHidden && item.name.startsWith(".")) continue
      if (item.isSymbolicLink()) continue

      const fullPath = path.join(current, item.name)
      const kind = item.isDirectory()
        ? "directory"
        : item.isFile()
          ? "file"
          : undefined

      if (!kind) continue
      if (kind === "directory" && DEFAULT_SKIPPED_DIRECTORY_NAMES.has(item.name)) continue

      const entry: ProjectEntry = {
        path: fullPath,
        relativePath: path.relative(root, fullPath) || item.name,
        displayPath: toDisplayPath(fullPath),
        kind,
      }

      if (await options.visit(entry) === false) {
        stopped = true
        return
      }

      if (kind === "directory") {
        await walk(fullPath)
      }
    }
  }

  await walk(root)
}

function formatTextFileAccessError(
  action: TextFileAction,
  resolvedPath: string,
  reason: string,
) {
  return `Cannot ${action} ${toDisplayPath(resolvedPath)} because ${reason}.`
}

function isBlockedDevicePath(resolvedPath: string): boolean {
  if (BLOCKED_DEVICE_PATHS.has(resolvedPath)) return true

  if (
    resolvedPath.startsWith("/proc/") &&
    (resolvedPath.endsWith("/fd/0") ||
      resolvedPath.endsWith("/fd/1") ||
      resolvedPath.endsWith("/fd/2"))
  ) {
    return true
  }

  return false
}

function isProbablyBinarySample(sample: Buffer): boolean {
  if (sample.length === 0) return false

  let suspicious = 0

  for (const byte of sample) {
    if (byte === 0) return true
    if ((byte < 7 || (byte > 14 && byte < 32) || byte === 127)) {
      suspicious += 1
    }
  }

  return suspicious / sample.length > 0.1
}

async function statIfExists(resolvedPath: string) {
  try {
    return await stat(resolvedPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined
    }

    throw error
  }
}

async function assertTextFileContent(resolvedPath: string, action: TextFileAction) {
  const extension = path.extname(resolvedPath).toLowerCase()
  if (BINARY_EXTENSIONS.has(extension)) {
    throw new Error(formatTextFileAccessError(action, resolvedPath, "it appears to be a binary file"))
  }

  const file = await open(resolvedPath, "r")

  try {
    const sample = Buffer.alloc(TEXT_SAMPLE_BYTES)
    const { bytesRead } = await file.read(sample, 0, sample.length, 0)
    if (isProbablyBinarySample(sample.subarray(0, bytesRead))) {
      throw new Error(formatTextFileAccessError(action, resolvedPath, "it appears to be a binary file"))
    }
  } finally {
    await file.close()
  }
}

async function assertReadableTextFile(resolvedPath: string) {
  if (isBlockedDevicePath(resolvedPath)) {
    throw new Error(formatTextFileAccessError("read", resolvedPath, "it is a blocked device path"))
  }

  const info = await stat(resolvedPath)

  if (info.isDirectory()) {
    throw new Error(formatTextFileAccessError("read", resolvedPath, "it is a directory"))
  }

  if (!info.isFile()) {
    throw new Error(formatTextFileAccessError("read", resolvedPath, "it is not a regular file"))
  }

  await assertTextFileContent(resolvedPath, "read")
}

export async function readTextFile(inputPath: string): Promise<string> {
  const resolved = resolveToolPath(inputPath)
  await assertReadableTextFile(resolved)
  return await readFile(resolved, "utf8")
}

export async function readSearchableTextFile(resolvedPath: string): Promise<string | undefined> {
  try {
    await assertReadableTextFile(resolvedPath)
    return await readFile(resolvedPath, "utf8")
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    const code = (error as NodeJS.ErrnoException | undefined)?.code

    if (
      code === "ENOENT" ||
      message.includes("binary file") ||
      message.includes("it is a directory") ||
      message.includes("it is not a regular file") ||
      message.includes("blocked device path")
    ) {
      return undefined
    }

    throw error
  }
}

export async function prepareWriteTextFile(inputPath: string): Promise<WriteTextFileTarget> {
  const resolved = resolveToolPath(inputPath)

  if (isBlockedDevicePath(resolved)) {
    throw new Error(formatTextFileAccessError("write", resolved, "it is a blocked device path"))
  }

  const info = await statIfExists(resolved)
  if (info?.isDirectory()) {
    throw new Error(formatTextFileAccessError("write", resolved, "it is a directory"))
  }

  if (info && !info.isFile()) {
    throw new Error(formatTextFileAccessError("write", resolved, "it is not a regular file"))
  }

  if (info) {
    await assertTextFileContent(resolved, "write")
  }

  return {
    path: resolved,
    displayPath: toDisplayPath(resolved),
    exists: info !== undefined,
  }
}

async function writeResolvedTextFile(resolvedPath: string, content: string) {
  await mkdir(path.dirname(resolvedPath), { recursive: true })

  const tempPath = path.join(
    path.dirname(resolvedPath),
    `.${path.basename(resolvedPath)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  )

  await writeFile(tempPath, content, "utf8")

  try {
    // Prefer replace-by-rename so a successful write does not leave a partially written file behind.
    await rename(tempPath, resolvedPath)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== "EEXIST" && code !== "EPERM") {
      throw error
    }

    await writeFile(resolvedPath, content, "utf8")
  } finally {
    await rm(tempPath, { force: true }).catch(() => undefined)
  }
}

export async function writePreparedTextFile(
  target: WriteTextFileTarget,
  content: string,
): Promise<{ path: string; bytes: number; existed: boolean }> {
  await writeResolvedTextFile(target.path, content)
  return {
    path: target.path,
    bytes: Buffer.byteLength(content, "utf8"),
    existed: target.exists,
  }
}

export async function writeTextFile(
  inputPath: string,
  content: string,
): Promise<{ path: string; bytes: number; existed: boolean }> {
  const target = await prepareWriteTextFile(inputPath)
  return await writePreparedTextFile(target, content)
}

function splitTextLines(text: string) {
  const normalized = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  return normalized.split(/\r?\n/)
}

function createFormattedLineRange(
  selectedLines: string[],
  startLine: number,
  endLine: number,
  totalLines: number,
) {
  const width = String(Math.max(endLine, 1)).length
  const rendered = selectedLines
    .map((line, index) => {
      const number = String(startLine + index).padStart(width, " ")
      return `${number} | ${line}`
    })
    .join("\n")

  return {
    rendered,
    totalLines,
    startLine,
    endLine,
    outOfRange: startLine > totalLines,
  }
}

export function formatLineRange(text: string, startLine = 1, endLine?: number) {
  const lines = splitTextLines(text)
  const from = Math.max(1, startLine)
  const to = Math.min(endLine ?? lines.length, lines.length)
  return createFormattedLineRange(lines.slice(from - 1, to), from, to, lines.length)
}

export async function readTextFileRange(
  inputPath: string,
  startLine = 1,
  endLine?: number,
) {
  const resolved = resolveToolPath(inputPath)
  await assertReadableTextFile(resolved)

  const info = await stat(resolved)
  if (info.size <= FAST_TEXT_READ_BYTES) {
    const text = await readFile(resolved, "utf8")
    return formatLineRange(text, startLine, endLine)
  }

  const from = Math.max(1, startLine)
  const to = endLine == null ? Number.POSITIVE_INFINITY : Math.max(from, endLine)

  return await new Promise<ReturnType<typeof formatLineRange>>((resolve, reject) => {
    const selectedLines: string[] = []
    let currentLine = 1
    let carry = ""
    let isFirstChunk = true
    const stream = createReadStream(resolved, { encoding: "utf8" })

    stream.on("data", (chunk: string) => {
      if (isFirstChunk) {
        isFirstChunk = false
        if (chunk.charCodeAt(0) === 0xfeff) {
          chunk = chunk.slice(1)
        }
      }

      const data = carry + chunk
      let start = 0

      while (true) {
        const newline = data.indexOf("\n", start)
        if (newline === -1) break

        let line = data.slice(start, newline)
        if (line.endsWith("\r")) line = line.slice(0, -1)
        if (currentLine >= from && currentLine <= to) {
          selectedLines.push(line)
        }

        currentLine += 1
        start = newline + 1
      }

      carry = data.slice(start)
    })

    stream.once("error", reject)
    stream.once("end", () => {
      let line = carry
      if (line.endsWith("\r")) line = line.slice(0, -1)
      if (currentLine >= from && currentLine <= to) {
        selectedLines.push(line)
      }

      const totalLines = currentLine
      const finalEndLine = Math.min(to, totalLines)
      resolve(createFormattedLineRange(selectedLines, from, finalEndLine, totalLines))
    })
  })
}
