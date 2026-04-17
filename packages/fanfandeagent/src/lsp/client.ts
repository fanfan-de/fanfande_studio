import path from "node:path"
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { pathToFileURL } from "node:url"
import * as Env from "#env/env.ts"
import type { LanguageServerCommand, LanguageServerSpec } from "#lsp/languages.ts"
import type {
  JsonRpcErrorObject,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
} from "#lsp/types.ts"
import * as Log from "#util/log.ts"

const DEFAULT_REQUEST_TIMEOUT_MS = 20_000
const log = Log.create({ service: "lsp.client" })

type PendingRequest = {
  method: string
  reject: (error: Error) => void
  resolve: (value: unknown) => void
  timeout: ReturnType<typeof setTimeout>
  abortCleanup?: () => void
}

type SyncedDocument = {
  languageId: string
  text: string
  version: number
}

type ClientOptions = {
  command: LanguageServerCommand
  requestTimeoutMs?: number
  root: string
  spec: LanguageServerSpec
}

class MessageBuffer {
  private buffer = Buffer.alloc(0)
  private contentLength: number | null = null

  push(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    const messages: unknown[] = []

    while (true) {
      if (this.contentLength == null) {
        const separator = this.buffer.indexOf("\r\n\r\n")
        if (separator === -1) break

        const rawHeaders = this.buffer.subarray(0, separator).toString("utf8")
        this.buffer = this.buffer.subarray(separator + 4)
        const headers = new Map<string, string>()

        for (const line of rawHeaders.split("\r\n")) {
          const index = line.indexOf(":")
          if (index === -1) continue
          const key = line.slice(0, index).trim().toLowerCase()
          const value = line.slice(index + 1).trim()
          headers.set(key, value)
        }

        const header = headers.get("content-length")
        const parsed = header ? Number.parseInt(header, 10) : Number.NaN
        if (!Number.isInteger(parsed) || parsed < 0) {
          throw new Error(`Invalid LSP Content-Length header: ${header ?? "(missing)"}`)
        }

        this.contentLength = parsed
      }

      if (this.buffer.length < this.contentLength) break

      const payload = this.buffer.subarray(0, this.contentLength).toString("utf8")
      this.buffer = this.buffer.subarray(this.contentLength)
      this.contentLength = null
      messages.push(JSON.parse(payload))
    }

    return messages
  }
}

export class LspClient {
  private closing = false
  private disposed = false
  private readonly documents = new Map<string, SyncedDocument>()
  private initializePromise?: Promise<void>
  private nextID = 1
  private readonly options: ClientOptions
  private readonly parser = new MessageBuffer()
  private readonly pending = new Map<number, PendingRequest>()
  private process?: ChildProcessWithoutNullStreams
  private readonly stderrLines: string[] = []

  constructor(options: ClientOptions) {
    this.options = options
  }

  async ensureInitialized() {
    if (this.initializePromise) return await this.initializePromise

    const promise = (async () => {
      if (this.disposed || this.closing) {
        throw new Error(`LSP client '${this.options.spec.label}' is closed.`)
      }

      const proc = this.spawnProcess()
      this.process = proc

      const rootUri = pathToFileURL(this.options.root).toString()
      await this.sendRequest("initialize", {
        processId: process.pid,
        clientInfo: {
          name: "fanfandeagent",
          version: "1.0.0",
        },
        rootUri,
        workspaceFolders: [
          {
            uri: rootUri,
            name: path.basename(this.options.root) || this.options.root,
          },
        ],
        capabilities: {
          workspace: {
            workspaceFolders: true,
            symbol: {
              dynamicRegistration: false,
            },
          },
          textDocument: {
            definition: {
              dynamicRegistration: false,
              linkSupport: true,
            },
            hover: {
              dynamicRegistration: false,
              contentFormat: ["markdown", "plaintext"],
            },
            references: {
              dynamicRegistration: false,
            },
            synchronization: {
              dynamicRegistration: false,
              didSave: false,
              willSave: false,
              willSaveWaitUntil: false,
            },
          },
        },
      })

      this.sendNotification("initialized", {})
    })().catch((error) => {
      this.initializePromise = undefined
      this.rejectAllPending(error instanceof Error ? error : new Error(String(error)))
      void this.disposeProcess()
      throw error
    })

    this.initializePromise = promise
    return await promise
  }

  async syncDocument(input: {
    abort?: AbortSignal
    languageId: string
    path: string
    text: string
  }) {
    await this.ensureInitialized()

    if (input.abort?.aborted) {
      throw new Error("LSP document sync was aborted.")
    }

    const uri = pathToFileURL(input.path).toString()
    const existing = this.documents.get(uri)

    if (!existing) {
      this.sendNotification("textDocument/didOpen", {
        textDocument: {
          uri,
          languageId: input.languageId,
          version: 1,
          text: input.text,
        },
      })
      this.documents.set(uri, {
        languageId: input.languageId,
        text: input.text,
        version: 1,
      })

      return {
        uri,
        version: 1,
      }
    }

    if (existing.text === input.text && existing.languageId === input.languageId) {
      return {
        uri,
        version: existing.version,
      }
    }

    const version = existing.version + 1
    this.sendNotification("textDocument/didChange", {
      textDocument: {
        uri,
        version,
      },
      contentChanges: [
        {
          text: input.text,
        },
      ],
    })
    this.documents.set(uri, {
      languageId: input.languageId,
      text: input.text,
      version,
    })

    return {
      uri,
      version,
    }
  }

  async request<Result = unknown>(
    method: string,
    params?: unknown,
    abort?: AbortSignal,
  ): Promise<Result> {
    await this.ensureInitialized()
    return await this.sendRequest<Result>(method, params, abort)
  }

  async dispose() {
    if (this.disposed || this.closing) return
    this.closing = true

    const proc = this.process
    if (proc && proc.exitCode == null && !proc.killed) {
      try {
        await this.sendRequest("shutdown")
      } catch {
        // ignore shutdown failures while disposing
      }

      try {
        this.sendNotification("exit")
      } catch {
        // ignore exit notification failures while disposing
      }
    }

    await this.disposeProcess()
    this.documents.clear()
    this.closing = false
    this.disposed = true
  }

  private async sendRequest<Result = unknown>(
    method: string,
    params?: unknown,
    abort?: AbortSignal,
  ): Promise<Result> {
    if (!this.process || this.process.killed || this.process.exitCode != null) {
      throw this.createProcessError(`LSP server '${this.options.spec.label}' is not running.`)
    }

    if (abort?.aborted) {
      throw new Error(`LSP request '${method}' was aborted.`)
    }

    const id = this.nextID++
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    }

    return await new Promise<Result>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(this.createProcessError(`LSP request '${method}' timed out.`))
        try {
          this.sendNotification("$/cancelRequest", { id })
        } catch {
          // ignore cancellation failures after timeout
        }
      }, this.options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS)

      const pending: PendingRequest = {
        method,
        resolve: (value) => resolve(value as Result),
        reject,
        timeout,
      }

      if (abort) {
        const onAbort = () => {
          this.pending.delete(id)
          clearTimeout(timeout)
          reject(new Error(`LSP request '${method}' was aborted.`))
          try {
            this.sendNotification("$/cancelRequest", { id })
          } catch {
            // ignore cancellation failures after abort
          }
        }

        abort.addEventListener("abort", onAbort, { once: true })
        pending.abortCleanup = () => abort.removeEventListener("abort", onAbort)
      }

      this.pending.set(id, pending)

      try {
        this.sendMessage(request)
      } catch (error) {
        this.pending.delete(id)
        clearTimeout(timeout)
        pending.abortCleanup?.()
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  private sendNotification(method: string, params?: unknown) {
    const notification: JsonRpcNotification = {
      jsonrpc: "2.0",
      method,
      params,
    }

    this.sendMessage(notification)
  }

  private sendMessage(message: JsonRpcRequest | JsonRpcNotification | JsonRpcResponse) {
    if (!this.process?.stdin || this.process.stdin.destroyed) {
      throw this.createProcessError(`Failed to send LSP message '${"method" in message ? message.method : "response"}'.`)
    }

    const payload = JSON.stringify(message)
    const header = `Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n`
    this.process.stdin.write(header)
    this.process.stdin.write(payload)
  }

  private spawnProcess() {
    const env = {
      ...Env.all(),
      ...(this.options.command.env ?? {}),
    }
    const proc = spawn(this.options.command.command, this.options.command.args, {
      cwd: this.options.command.cwd ?? this.options.root,
      env,
      windowsHide: true,
      stdio: "pipe",
    })

    proc.stdout.on("data", (chunk: Buffer | string) => {
      try {
        const buffer = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk
        const messages = this.parser.push(buffer)
        for (const message of messages) {
          this.handleMessage(message)
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        this.rejectAllPending(this.createProcessError(`Failed to parse LSP server response. ${detail}`))
      }
    })

    proc.stderr.setEncoding("utf8")
    proc.stderr.on("data", (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed) continue
        this.stderrLines.push(trimmed)
        if (this.stderrLines.length > 50) {
          this.stderrLines.shift()
        }
      }
    })

    proc.on("error", (error) => {
      if (this.closing || this.disposed) return
      this.rejectAllPending(this.createProcessError(`LSP server '${this.options.spec.label}' failed to start: ${error.message}`))
    })

    proc.on("close", (code, signal) => {
      this.process = undefined
      this.initializePromise = undefined

      if (this.closing || this.disposed) return

      this.rejectAllPending(
        this.createProcessError(
          `LSP server '${this.options.spec.label}' closed unexpectedly (code=${code ?? "null"}, signal=${signal ?? "null"}).`,
        ),
      )
    })

    log.info("lsp server started", {
      server: this.options.spec.id,
      command: this.options.command.command,
      args: this.options.command.args,
      cwd: this.options.command.cwd ?? this.options.root,
    })

    return proc
  }

  private handleMessage(message: unknown) {
    if (!message || typeof message !== "object") return

    const record = message as Record<string, unknown>
    if ("id" in record && ("result" in record || "error" in record)) {
      this.handleResponse(record as unknown as JsonRpcResponse)
      return
    }

    if (typeof record.method === "string") {
      this.handleServerRequest(record as unknown as JsonRpcRequest)
    }
  }

  private handleResponse(message: JsonRpcResponse) {
    if (typeof message.id !== "number") return

    const pending = this.pending.get(message.id)
    if (!pending) return

    this.pending.delete(message.id)
    clearTimeout(pending.timeout)
    pending.abortCleanup?.()

    if (message.error) {
      pending.reject(this.fromJsonRpcError(pending.method, message.error))
      return
    }

    pending.resolve(message.result)
  }

  private handleServerRequest(message: JsonRpcRequest) {
    if (typeof message.id === "undefined") {
      return
    }

    let result: unknown = null
    if (message.method === "workspace/configuration") {
      const items = Array.isArray((message.params as { items?: unknown[] } | undefined)?.items)
        ? (message.params as { items: unknown[] }).items
        : []
      result = items.map(() => null)
    } else if (message.method === "workspace/workspaceFolders") {
      result = [
        {
          uri: pathToFileURL(this.options.root).toString(),
          name: path.basename(this.options.root) || this.options.root,
        },
      ]
    }

    try {
      this.sendMessage({
        jsonrpc: "2.0",
        id: message.id,
        result,
      })
    } catch (error) {
      log.warn("failed to answer lsp server request", {
        server: this.options.spec.id,
        method: message.method,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private async disposeProcess() {
    const proc = this.process
    this.process = undefined
    this.initializePromise = undefined
    this.rejectAllPending(this.createProcessError(`LSP server '${this.options.spec.label}' was disposed.`))

    if (!proc) return

    try {
      proc.stdin.end()
    } catch {
      // ignore shutdown pipe errors
    }

    if (proc.exitCode != null || proc.killed) {
      return
    }

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (proc.exitCode == null && !proc.killed) {
          proc.kill()
        }
      }, 200)

      proc.once("close", () => {
        clearTimeout(timer)
        resolve()
      })

      proc.once("error", () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }

  private rejectAllPending(error: Error) {
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timeout)
      pending.abortCleanup?.()
      pending.reject(error)
      this.pending.delete(id)
    }
  }

  private fromJsonRpcError(method: string, error: JsonRpcErrorObject) {
    const detail = typeof error.data === "undefined" ? "" : ` ${JSON.stringify(error.data)}`
    return this.createProcessError(`LSP request '${method}' failed: ${error.message}${detail}`)
  }

  private createProcessError(prefix: string) {
    const detail = this.stderrLines.at(-1)
    return detail ? new Error(`${prefix} Last stderr: ${detail}`) : new Error(prefix)
  }
}
