import type {
  McpAllowedTools,
  RemoteMcpServerSummary,
  StdioMcpServerSummary,
} from "../types"

export type ImportedMcpServerInput =
  | Omit<StdioMcpServerSummary, "id">
  | Omit<RemoteMcpServerSummary, "id">

export interface ImportedMcpServer {
  id: string
  server: ImportedMcpServerInput
}

export interface ParsedMcpConfigImport {
  servers: ImportedMcpServer[]
  warnings: string[]
}

type JsonRecord = Record<string, unknown>

const SERVER_CONTAINER_KEYS = ["mcpServers", "servers"] as const
const SINGLE_SERVER_HINT_KEYS = ["command", "url", "serverUrl", "server_url", "type", "transport"] as const

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function getRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`)
  }

  return value
}

function getOptionalRecord(value: unknown, label: string): JsonRecord | undefined {
  if (value === undefined || value === null) return undefined
  return getRecord(value, label)
}

function getString(record: JsonRecord, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value !== "string") continue
    const trimmed = value.trim()
    if (trimmed) return trimmed
  }

  return undefined
}

function getBoolean(record: JsonRecord, key: string): boolean | undefined {
  const value = record[key]
  return typeof value === "boolean" ? value : undefined
}

function getTimeoutMs(record: JsonRecord): number | undefined {
  const value = record.timeoutMs ?? record.timeout_ms
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined
  return value
}

function getEnabled(record: JsonRecord): boolean {
  return getBoolean(record, "enabled") ?? !getBoolean(record, "disabled")
}

function getStringArray(value: unknown, label: string): string[] | undefined {
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array of strings.`)
  }

  const entries = value.map((entry, index) => {
    if (typeof entry !== "string") {
      throw new Error(`${label}[${index}] must be a string.`)
    }
    return entry
  })

  return entries.length > 0 ? entries : undefined
}

function getStringRecord(value: unknown, label: string): Record<string, string> | undefined {
  if (value === undefined || value === null) return undefined
  const record = getRecord(value, label)
  const entries = Object.entries(record)

  if (entries.length === 0) return undefined

  return Object.fromEntries(
    entries.map(([key, entry]) => {
      if (typeof entry !== "string") {
        throw new Error(`${label}.${key} must be a string.`)
      }

      return [key, entry]
    }),
  )
}

function getAllowedTools(value: unknown): McpAllowedTools | undefined {
  if (value === undefined || value === null) return undefined

  if (Array.isArray(value)) {
    return getStringArray(value, "allowedTools")
  }

  const record = getRecord(value, "allowedTools")
  const readOnly = typeof record.readOnly === "boolean" ? record.readOnly : undefined
  const toolNames = getStringArray(record.toolNames, "allowedTools.toolNames")

  if (readOnly === undefined && !toolNames) return undefined
  return {
    ...(readOnly === undefined ? {} : { readOnly }),
    ...(toolNames ? { toolNames } : {}),
  }
}

function getTransportKind(record: JsonRecord) {
  const raw = getString(record, ["transport", "type"])?.toLowerCase()
  if (!raw) return undefined

  if (raw === "stdio") return "stdio"
  if (raw === "remote" || raw === "http" || raw === "streamable-http" || raw === "streamable_http") return "remote"
  if (raw === "sse") return "sse"

  throw new Error(`Unsupported MCP transport '${raw}'.`)
}

function removeAuthorizationHeader(headers: Record<string, string> | undefined) {
  if (!headers) return undefined

  const entries = Object.entries(headers).filter(([key]) => key.toLowerCase() !== "authorization")
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function getAuthorization(headers: Record<string, string> | undefined, record: JsonRecord) {
  const explicit = getString(record, ["authorization", "auth"])
  if (explicit) return explicit

  return Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === "authorization")?.[1]?.trim()
}

function normalizeServerID(id: string) {
  return id.trim().replace(/\s+/g, "-")
}

function normalizeServerEntry(id: string, value: unknown, warnings: string[]): ImportedMcpServer {
  const serverID = normalizeServerID(id)
  if (!serverID) {
    throw new Error("Imported MCP server ids cannot be empty.")
  }

  const record = getRecord(value, `mcpServers.${serverID}`)
  const transportKind = getTransportKind(record)
  const serverUrl = getString(record, ["serverUrl", "server_url", "url"])
  const name = getString(record, ["name", "title"])
  const timeoutMs = getTimeoutMs(record)
  const enabled = getEnabled(record)

  if (transportKind === "remote" || transportKind === "sse" || (!transportKind && serverUrl)) {
    if (!serverUrl) {
      throw new Error(`Remote MCP server '${serverID}' requires a url.`)
    }

    if (transportKind === "sse") {
      warnings.push(`${serverID}: legacy SSE was imported as a remote HTTP endpoint.`)
    }

    if (record.oauth !== undefined) {
      warnings.push(`${serverID}: OAuth settings were not imported; configure auth in the MCP server after import.`)
    }

    if (record.headersHelper !== undefined) {
      warnings.push(`${serverID}: headersHelper is not supported by this app and was ignored.`)
    }

    const rawHeaders = getStringRecord(record.headers, `mcpServers.${serverID}.headers`)
    const authorization = getAuthorization(rawHeaders, record)
    const headers = removeAuthorizationHeader(rawHeaders)
    const allowedTools = getAllowedTools(record.allowedTools)

    return {
      id: serverID,
      server: {
        ...(name ? { name } : {}),
        transport: "remote",
        serverUrl,
        ...(authorization ? { authorization } : {}),
        ...(headers ? { headers } : {}),
        ...(allowedTools ? { allowedTools } : {}),
        enabled,
        ...(timeoutMs ? { timeoutMs } : {}),
      },
    }
  }

  const command = getString(record, ["command"])
  if (!command) {
    throw new Error(`Local MCP server '${serverID}' requires a command.`)
  }

  return {
    id: serverID,
    server: {
      ...(name ? { name } : {}),
      transport: "stdio",
      command,
      args: getStringArray(record.args, `mcpServers.${serverID}.args`) ?? [],
      env: getStringRecord(record.env, `mcpServers.${serverID}.env`),
      cwd: getString(record, ["cwd", "workingDirectory", "working_directory"]),
      enabled,
      ...(timeoutMs ? { timeoutMs } : {}),
    },
  }
}

function getServerEntries(root: JsonRecord): [string, unknown][] {
  for (const key of SERVER_CONTAINER_KEYS) {
    const container = getOptionalRecord(root[key], key)
    if (container) return Object.entries(container)
  }

  if (SINGLE_SERVER_HINT_KEYS.some((key) => root[key] !== undefined)) {
    return [[getString(root, ["id", "name"]) ?? "imported-mcp-server", root]]
  }

  throw new Error("Expected a JSON object with an mcpServers field.")
}

export function parseMcpConfigJson(input: string): ParsedMcpConfigImport {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error("Paste an MCP configuration JSON object.")
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid JSON: ${message}`)
  }

  const root = getRecord(parsed, "MCP configuration")
  const warnings: string[] = []
  const servers = getServerEntries(root).map(([id, value]) => normalizeServerEntry(id, value, warnings))

  if (servers.length === 0) {
    throw new Error("No MCP servers were found in the JSON.")
  }

  return {
    servers,
    warnings,
  }
}
