import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { pathToFileURL } from "node:url"
import * as Log from "#util/log.ts"
import type { McpServerSummary } from "#config/config.ts"

const log = Log.create({ service: "mcp.client" })
const JSONRPC_VERSION = "2.0" as const
const MCP_PROTOCOL_VERSION = "2025-06-18"
const JSONRPC_METHOD_NOT_FOUND = -32601

type JsonRpcID = number | string

interface JsonRpcRequest {
  jsonrpc: typeof JSONRPC_VERSION
  id: JsonRpcID
  method: string
  params?: unknown
}

interface JsonRpcNotification {
  jsonrpc: typeof JSONRPC_VERSION
  method: string
  params?: unknown
}

interface JsonRpcSuccess {
  jsonrpc: typeof JSONRPC_VERSION
  id: JsonRpcID
  result: unknown
}

interface JsonRpcFailure {
  jsonrpc: typeof JSONRPC_VERSION
  id: JsonRpcID | null
  error: {
    code: number
    message: string
    data?: unknown
  }
}

export interface McpToolDefinition {
  name: string
  title?: string
  description?: string
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  annotations?: {
    title?: string
    readOnlyHint?: boolean
    destructiveHint?: boolean
    idempotentHint?: boolean
    openWorldHint?: boolean
  }
}

export interface McpToolCallResult {
  content: unknown[]
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

type PendingRequest = {
  reject: (error: Error) => void
  resolve: (value: unknown) => void
  timer: ReturnType<typeof setTimeout>
}

export interface McpClientOptions {
  cwd: string
  onToolsChanged?: () => void
  requestTimeoutMs: number
  server: McpServerSummary
  worktree: string
}

function createRpcErrorMessage(method: string, error: JsonRpcFailure["error"]) {
  return `${method} failed (${error.code}): ${error.message}`
}

function getToolDisplayName(tool: McpToolDefinition) {
  return tool.title || tool.annotations?.title || tool.name
}

export class McpClient {
  private child?: ChildProcessWithoutNullStreams
  private closed = false
  private initializePromise?: Promise<void>
  private nextRequestID = 1
  private pending = new Map<JsonRpcID, PendingRequest>()
  private readonly options: McpClientOptions
  private readonly stderrLines: string[] = []
  private stdoutBuffer = ""

  constructor(options: McpClientOptions) {
    this.options = options
  }

  async dispose() {
    if (this.closed) return
    this.closed = true

    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timer)
      pending.reject(new Error(`MCP request ${String(id)} was interrupted because the server closed.`))
    }
    this.pending.clear()

    if (!this.child) return

    this.child.stdout.removeAllListeners()
    this.child.stderr.removeAllListeners()
    this.child.removeAllListeners()
    this.child.kill()
    this.child = undefined
  }

  async listTools(): Promise<McpToolDefinition[]> {
    await this.ensureInitialized()
    const tools: McpToolDefinition[] = []
    let cursor: string | undefined

    do {
      const result = (await this.request("tools/list", cursor ? { cursor } : undefined)) as {
        nextCursor?: string
        tools?: McpToolDefinition[]
      }
      tools.push(...(result.tools ?? []))
      cursor = result.nextCursor
    } while (cursor)

    return tools
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown> | undefined,
    abort?: AbortSignal,
  ): Promise<McpToolCallResult> {
    await this.ensureInitialized()

    return (await this.request(
      "tools/call",
      {
        name: toolName,
        arguments: args,
      },
      abort,
    )) as McpToolCallResult
  }

  private async ensureInitialized() {
    if (this.initializePromise) return this.initializePromise

    this.initializePromise = (async () => {
      const child = this.startProcess()
      this.child = child

      const initialize = (await this.request("initialize", {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          roots: {
            listChanged: false,
          },
        },
        clientInfo: {
          name: "fanfandeagent",
          version: "1.0.0",
        },
      })) as {
        protocolVersion?: string
      }

      if (initialize.protocolVersion && initialize.protocolVersion !== MCP_PROTOCOL_VERSION) {
        throw new Error(
          `MCP server '${this.options.server.id}' requested unsupported protocol version '${initialize.protocolVersion}'.`,
        )
      }

      this.notify("notifications/initialized")
    })()

    return this.initializePromise
  }

  private startProcess() {
    const child = spawn(this.options.server.command, this.options.server.args ?? [], {
      cwd: this.options.cwd,
      env: {
        ...process.env,
        ...(this.options.server.env ?? {}),
      },
      stdio: "pipe",
    })

    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")

    child.stdout.on("data", (chunk: string) => {
      this.stdoutBuffer += chunk
      this.flushStdoutBuffer()
    })

    child.stderr.on("data", (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed) continue
        this.stderrLines.push(trimmed)
        if (this.stderrLines.length > 50) {
          this.stderrLines.shift()
        }
      }
    })

    child.on("exit", (code, signal) => {
      const detail = this.stderrLines.at(-1)
      const reason = [
        `MCP server '${this.options.server.id}' exited`,
        typeof code === "number" ? `with code ${code}` : "",
        signal ? `after signal ${signal}` : "",
        detail ? `(${detail})` : "",
      ]
        .filter(Boolean)
        .join(" ")
      this.rejectAllPending(new Error(reason))
      this.child = undefined
      this.initializePromise = undefined
      if (!this.closed) {
        log.warn("mcp server exited", {
          serverID: this.options.server.id,
          code,
          signal,
          detail,
        })
      }
    })

    child.on("error", (error) => {
      this.rejectAllPending(error)
      this.child = undefined
      this.initializePromise = undefined
    })

    return child
  }

  private flushStdoutBuffer() {
    while (true) {
      const newlineIndex = this.stdoutBuffer.indexOf("\n")
      if (newlineIndex === -1) break

      const line = this.stdoutBuffer.slice(0, newlineIndex).trim()
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1)
      if (!line) continue
      this.handleIncoming(line)
    }
  }

  private handleIncoming(line: string) {
    let payload: unknown
    try {
      payload = JSON.parse(line)
    } catch (error) {
      log.warn("failed to parse mcp message", {
        serverID: this.options.server.id,
        error: error instanceof Error ? error.message : String(error),
        line,
      })
      return
    }

    if (Array.isArray(payload)) {
      for (const item of payload) {
        this.handleMessage(item)
      }
      return
    }

    this.handleMessage(payload)
  }

  private handleMessage(payload: unknown) {
    if (!payload || typeof payload !== "object") return

    const record = payload as Record<string, unknown>
    if (typeof record.method === "string" && "id" in record) {
      void this.handleServerRequest(record as unknown as JsonRpcRequest)
      return
    }

    if (typeof record.method === "string") {
      this.handleNotification(record as unknown as JsonRpcNotification)
      return
    }

    if ("id" in record && "result" in record) {
      this.resolvePending(record as unknown as JsonRpcSuccess)
      return
    }

    if ("id" in record && "error" in record) {
      this.rejectPending(record as unknown as JsonRpcFailure)
    }
  }

  private async handleServerRequest(request: JsonRpcRequest) {
    try {
      if (request.method === "ping") {
        this.respond(request.id, {})
        return
      }

      if (request.method === "roots/list") {
        const roots = [this.options.cwd, this.options.worktree]
          .filter((value, index, all) => value && all.indexOf(value) === index)
          .map((value) => ({
            uri: pathToFileURL(value).toString(),
            name: value === this.options.cwd ? "cwd" : "worktree",
          }))

        this.respond(request.id, { roots })
        return
      }

      this.respondError(request.id, {
        code: JSONRPC_METHOD_NOT_FOUND,
        message: `Unsupported MCP method '${request.method}'`,
      })
    } catch (error) {
      this.respondError(request.id, {
        code: -32000,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private handleNotification(notification: JsonRpcNotification) {
    switch (notification.method) {
      case "notifications/tools/list_changed":
        this.options.onToolsChanged?.()
        return
      case "notifications/message":
      case "notifications/progress":
      case "notifications/resources/list_changed":
      case "notifications/prompts/list_changed":
      case "notifications/resources/updated":
      case "notifications/cancelled":
        return
      default:
        log.debug("ignored mcp notification", {
          serverID: this.options.server.id,
          method: notification.method,
        })
    }
  }

  private async request(method: string, params?: unknown, abort?: AbortSignal): Promise<unknown> {
    await this.ensureProcessWritable()
    const id = this.nextRequestID++

    return await new Promise<unknown>((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => {
        this.pending.delete(id)
        settled = true
        this.notify("notifications/cancelled", {
          requestId: id,
          reason: `${method} timed out`,
        })
        reject(
          new Error(
            `MCP request '${method}' timed out after ${this.options.requestTimeoutMs}ms for server '${this.options.server.id}'.`,
          ),
        )
      }, this.options.requestTimeoutMs)

      const finalize = <T>(fn: (value: T) => void, value: T) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        abort?.removeEventListener("abort", abortListener)
        fn(value)
      }

      const abortListener = () => {
        this.pending.delete(id)
        this.notify("notifications/cancelled", {
          requestId: id,
          reason: `${method} aborted`,
        })
        finalize(reject, new Error(`MCP request '${method}' was aborted.`))
      }

      if (abort?.aborted) {
        finalize(reject, new Error(`MCP request '${method}' was aborted.`))
        return
      }

      abort?.addEventListener("abort", abortListener, { once: true })
      this.pending.set(id, {
        resolve: (value) => finalize(resolve, value),
        reject: (error) => finalize(reject, error),
        timer,
      })

      this.write({
        jsonrpc: JSONRPC_VERSION,
        id,
        method,
        params,
      })
    })
  }

  private ensureProcessWritable() {
    if (this.closed) {
      throw new Error(`MCP server '${this.options.server.id}' is closed.`)
    }

    if (!this.child?.stdin.writable) {
      throw new Error(
        `MCP server '${this.options.server.id}' is not accepting requests.${this.stderrHint()}`,
      )
    }
  }

  private notify(method: string, params?: unknown) {
    if (!this.child?.stdin.writable) return
    this.write({
      jsonrpc: JSONRPC_VERSION,
      method,
      params,
    })
  }

  private respond(id: JsonRpcID, result: unknown) {
    this.write({
      jsonrpc: JSONRPC_VERSION,
      id,
      result,
    })
  }

  private respondError(id: JsonRpcID, error: JsonRpcFailure["error"]) {
    this.write({
      jsonrpc: JSONRPC_VERSION,
      id,
      error,
    })
  }

  private write(payload: object) {
    if (!this.child?.stdin.writable) {
      throw new Error(`MCP server '${this.options.server.id}' closed before the request could be written.`)
    }

    this.child.stdin.write(`${JSON.stringify(payload)}\n`)
  }

  private rejectAllPending(error: Error) {
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timer)
      pending.reject(error)
      this.pending.delete(id)
    }
  }

  private resolvePending(response: JsonRpcSuccess) {
    const pending = this.pending.get(response.id)
    if (!pending) return
    this.pending.delete(response.id)
    clearTimeout(pending.timer)
    pending.resolve(response.result)
  }

  private rejectPending(response: JsonRpcFailure) {
    if (response.id === null) return
    const pending = this.pending.get(response.id)
    if (!pending) return
    this.pending.delete(response.id)
    clearTimeout(pending.timer)
    pending.reject(new Error(createRpcErrorMessage("request", response.error)))
  }

  private stderrHint() {
    const lastLine = this.stderrLines.at(-1)
    return lastLine ? ` Last stderr: ${lastLine}` : ""
  }
}

export function summarizeToolCallResult(result: McpToolCallResult) {
  const textParts: string[] = []

  for (const block of result.content) {
    if (!block || typeof block !== "object") continue
    const record = block as Record<string, unknown>

    if (record.type === "text" && typeof record.text === "string") {
      textParts.push(record.text)
      continue
    }

    if (record.type === "resource" && record.resource && typeof record.resource === "object") {
      const resource = record.resource as Record<string, unknown>
      if (typeof resource.text === "string") {
        textParts.push(resource.text)
      } else if (typeof resource.uri === "string") {
        textParts.push(resource.uri)
      }
      continue
    }

    if (record.type === "resource_link" && typeof record.uri === "string") {
      textParts.push(record.uri)
      continue
    }

    textParts.push(JSON.stringify(block))
  }

  const text = textParts.filter(Boolean).join("\n\n").trim()
  return {
    text: text || JSON.stringify(result.structuredContent ?? result.content),
    isError: result.isError ?? false,
  }
}

export function getMcpToolDisplayName(server: McpServerSummary, tool: McpToolDefinition) {
  return `${server.name ?? server.id}/${getToolDisplayName(tool)}`
}
