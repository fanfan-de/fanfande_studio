import fsp from "node:fs/promises"
import path from "node:path"

export type SourceRuntimeSnapshot = Map<string, string>

function normalizeWatchKey(watchRoot: string, changedPath: string) {
  const trimmed = changedPath.trim()
  if (!trimmed) return ""

  const relativePath = path.isAbsolute(trimmed) ? path.relative(watchRoot, trimmed) : trimmed
  const normalized = path.normalize(relativePath)
  if (!normalized || normalized === "." || normalized.startsWith("..")) {
    return ""
  }

  return process.platform === "win32" ? normalized.toLowerCase() : normalized
}

async function readEntrySignature(targetPath: string) {
  try {
    const stat = await fsp.stat(targetPath)
    const mtimeMs = Math.trunc(stat.mtimeMs)
    const ctimeMs = Math.trunc(stat.ctimeMs)

    if (stat.isDirectory()) {
      return `dir:${mtimeMs}:${ctimeMs}`
    }

    if (stat.isFile()) {
      return `file:${stat.size}:${mtimeMs}:${ctimeMs}`
    }

    return `other:${mtimeMs}:${ctimeMs}`
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === "ENOENT") return undefined
    throw error
  }
}

async function collectSnapshot(
  watchRoot: string,
  snapshot: SourceRuntimeSnapshot,
  relativeDirectory = "",
): Promise<void> {
  const directoryPath = relativeDirectory ? path.join(watchRoot, relativeDirectory) : watchRoot
  const entries = await fsp.readdir(directoryPath, { withFileTypes: true })

  for (const entry of entries) {
    const relativePath = relativeDirectory ? path.join(relativeDirectory, entry.name) : entry.name
    const key = normalizeWatchKey(watchRoot, relativePath)
    if (!key) continue

    const absolutePath = path.join(watchRoot, relativePath)
    const signature = await readEntrySignature(absolutePath)
    if (signature) {
      snapshot.set(key, signature)
    }

    if (entry.isDirectory()) {
      await collectSnapshot(watchRoot, snapshot, relativePath)
    }
  }
}

export async function createSourceRuntimeSnapshot(watchRoot: string) {
  const snapshot: SourceRuntimeSnapshot = new Map()
  await collectSnapshot(watchRoot, snapshot)
  return snapshot
}

export async function shouldRestartForSourceRuntimeChange(input: {
  watchRoot: string
  snapshot: SourceRuntimeSnapshot
  changedPath: string
}) {
  const key = normalizeWatchKey(input.watchRoot, input.changedPath)
  if (!key) return true

  const absolutePath = path.join(input.watchRoot, key)
  const previousSignature = input.snapshot.get(key)
  const nextSignature = await readEntrySignature(absolutePath)

  if (previousSignature === nextSignature) {
    return false
  }

  if (nextSignature === undefined) {
    input.snapshot.delete(key)
  } else {
    input.snapshot.set(key, nextSignature)
  }

  return true
}

export const internal = {
  normalizeWatchKey,
}
