import util from "node:util"

type WritableLike = Pick<NodeJS.WriteStream, "write" | "writable" | "destroyed" | "on">

let streamGuardsInstalled = false

function isBrokenPipeError(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "EPIPE"
}

function ignoreBrokenPipe(error: Error) {
  if (isBrokenPipeError(error)) return
  throw error
}

function installStreamGuards() {
  if (streamGuardsInstalled) return
  streamGuardsInstalled = true
  process.stdout?.on?.("error", ignoreBrokenPipe)
  process.stderr?.on?.("error", ignoreBrokenPipe)
}

function writeToStream(stream: WritableLike | undefined, values: unknown[]) {
  installStreamGuards()
  if (!stream || stream.destroyed || !stream.writable) return

  const message = `${util.format(...values)}\n`
  try {
    stream.write(message)
  } catch (error) {
    if (isBrokenPipeError(error)) return
    throw error
  }
}

export function safeLog(...values: unknown[]) {
  writeToStream(process.stdout, values)
}

export function safeWarn(...values: unknown[]) {
  writeToStream(process.stderr, values)
}

export function safeError(...values: unknown[]) {
  writeToStream(process.stderr, values)
}
