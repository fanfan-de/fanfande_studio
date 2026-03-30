import path from "node:path"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { Instance } from "#project/instance.ts"
import * as Filesystem from "#util/filesystem.ts"

export function resolveToolPath(inputPath: string): string {
  const resolved = path.isAbsolute(inputPath)
    ? path.resolve(inputPath)
    : path.resolve(Instance.directory, inputPath)

  if (!Instance.containsPath(resolved)) {
    throw new Error(`Path is outside the active project boundary: ${inputPath}`)
  }

  return Filesystem.normalizePath(resolved)
}

export function toDisplayPath(resolvedPath: string): string {
  const relative = path.relative(Instance.directory, resolvedPath)
  return relative ? relative : "."
}

export async function readTextFile(inputPath: string): Promise<string> {
  const resolved = resolveToolPath(inputPath)
  return await readFile(resolved, "utf8")
}

export async function writeTextFile(inputPath: string, content: string): Promise<{ path: string; bytes: number }> {
  const resolved = resolveToolPath(inputPath)
  await mkdir(path.dirname(resolved), { recursive: true })
  await writeFile(resolved, content, "utf8")
  return {
    path: resolved,
    bytes: Buffer.byteLength(content, "utf8"),
  }
}

export function formatLineRange(text: string, startLine = 1, endLine?: number) {
  const lines = text.split(/\r?\n/)
  const from = Math.max(1, startLine)
  const to = Math.min(endLine ?? lines.length, lines.length)
  const outOfRange = from > lines.length
  const width = String(Math.max(to, 1)).length

  const rendered = lines
    .slice(from - 1, to)
    .map((line, index) => {
      const number = String(from + index).padStart(width, " ")
      return `${number} | ${line}`
    })
    .join("\n")

  return {
    rendered,
    totalLines: lines.length,
    startLine: from,
    endLine: to,
    outOfRange,
  }
}
