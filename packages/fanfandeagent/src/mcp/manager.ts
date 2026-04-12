import { isDeepStrictEqual } from "node:util"
import { isAbsolute, resolve as resolvePath } from "node:path"
import type { JSONValue } from "@ai-sdk/provider"
import z from "zod"
import * as Config from "#config/config.ts"
import { Instance } from "#project/instance.ts"
import * as Tool from "#tool/tool.ts"
import * as Log from "#util/log.ts"
import { McpClient, type McpToolDefinition, type McpToolCallResult, getMcpToolDisplayName, summarizeToolCallResult } from "#mcp/client.ts"

const log = Log.create({ service: "mcp.manager" })

type JsonSchemaObject = Record<string, unknown>

type ManagedServer = {
  client?: McpClient
  config: Config.McpServerSummary
  configKey: string
  toolsPromise?: Promise<McpToolDefinition[]>
}

type LiteralValue = string | number | bigint | boolean | null | undefined

const MCP_STRUCTURED_CONTENT_KEY = "mcpStructuredContent"
const MCP_IS_ERROR_KEY = "mcpIsError"
const MCP_SERVER_ID_KEY = "serverID"
const MCP_TOOL_NAME_KEY = "toolName"

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function normalizeIdentifier(value: string) {
  const normalized = value.trim().replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "")
  return normalized || "tool"
}

function canonicalToolID(serverID: string, toolName: string) {
  return `mcp__${normalizeIdentifier(serverID)}__${normalizeIdentifier(toolName)}`
}

function isLiteralValue(value: unknown): value is LiteralValue {
  return value === null || ["string", "number", "bigint", "boolean", "undefined"].includes(typeof value)
}

function literalUnion(values: unknown[]) {
  if (values.length === 0) return z.never()
  if (values.every(isLiteralValue)) {
    const literals = values.map((value) => z.literal(value))
    if (literals.length === 1) return literals[0]!
    return z.union([literals[0]!, literals[1]!, ...literals.slice(2)] as [
      z.ZodLiteral<LiteralValue>,
      z.ZodLiteral<LiteralValue>,
      ...z.ZodLiteral<LiteralValue>[],
    ])
  }

  return z.custom((input) => values.some((value) => isDeepStrictEqual(value, input)))
}

function schemaUnion(options: z.ZodTypeAny[]) {
  if (options.length === 0) return z.any()
  if (options.length === 1) return options[0]!
  return z.union([options[0]!, options[1]!, ...options.slice(2)] as [
    z.ZodTypeAny,
    z.ZodTypeAny,
    ...z.ZodTypeAny[],
  ])
}

function jsonSchemaToZod(schema: unknown): z.ZodTypeAny {
  if (!schema || typeof schema !== "object") {
    return z.any()
  }

  const record = schema as JsonSchemaObject
  if (Array.isArray(record.enum)) {
    return literalUnion(record.enum as unknown[])
  }

  if ("const" in record) {
    return literalUnion([record.const])
  }

  if (Array.isArray(record.anyOf) && record.anyOf.length > 0) {
    return schemaUnion(record.anyOf.map((item) => jsonSchemaToZod(item)))
  }

  if (Array.isArray(record.oneOf) && record.oneOf.length > 0) {
    return schemaUnion(record.oneOf.map((item) => jsonSchemaToZod(item)))
  }

  const typeField = Array.isArray(record.type) ? record.type : typeof record.type === "string" ? [record.type] : []
  const allowsNull = typeField.includes("null")
  const primaryType = typeField.find((value) => value !== "null")

  let result: z.ZodTypeAny
  switch (primaryType) {
    case "string":
      result = z.string()
      break
    case "number":
      result = z.number()
      break
    case "integer":
      result = z.number().int()
      break
    case "boolean":
      result = z.boolean()
      break
    case "array": {
      const itemSchema = jsonSchemaToZod(record.items)
      result = z.array(itemSchema)
      break
    }
    case "object":
    default: {
      const properties = record.properties && typeof record.properties === "object" ? (record.properties as Record<string, unknown>) : {}
      const required = new Set(Array.isArray(record.required) ? (record.required as string[]) : [])
      const shape = Object.fromEntries(
        Object.entries(properties).map(([key, value]) => {
          const child = jsonSchemaToZod(value)
          return [key, required.has(key) ? child : child.optional()]
        }),
      )
      const additionalProperties = record.additionalProperties
      result =
        additionalProperties === false
          ? z.object(shape)
          : z.object(shape).catchall(additionalProperties ? jsonSchemaToZod(additionalProperties) : z.any())
      break
    }
  }

  if (typeof record.description === "string" && record.description.trim()) {
    result = result.describe(record.description.trim())
  }

  if (allowsNull) {
    result = result.nullable()
  }

  return result
}

function toolCapabilities(tool: McpToolDefinition): Tool.ToolCapabilities {
  const readOnly = tool.annotations?.readOnlyHint ?? false
  const destructive =
    readOnly ? false : tool.annotations?.destructiveHint === undefined ? false : tool.annotations.destructiveHint

  return {
    kind: readOnly ? (tool.annotations?.openWorldHint ? "search" : "read") : "other",
    readOnly,
    destructive,
  }
}

function toAttachments(result: McpToolCallResult): Tool.ToolAttachment[] | undefined {
  const attachments: Tool.ToolAttachment[] = []

  for (const block of result.content) {
    if (!block || typeof block !== "object") continue
    const record = block as Record<string, unknown>

    if (record.type === "image" && typeof record.data === "string" && typeof record.mimeType === "string") {
      attachments.push({
        url: `data:${record.mimeType};base64,${record.data}`,
        mime: record.mimeType,
      })
      continue
    }

    if (record.type === "audio" && typeof record.data === "string" && typeof record.mimeType === "string") {
      attachments.push({
        url: `data:${record.mimeType};base64,${record.data}`,
        mime: record.mimeType,
      })
      continue
    }

    if (record.type === "resource" && record.resource && typeof record.resource === "object") {
      const resource = record.resource as Record<string, unknown>
      if (typeof resource.blob === "string" && typeof resource.mimeType === "string") {
        attachments.push({
          url: `data:${resource.mimeType};base64,${resource.blob}`,
          mime: resource.mimeType,
          filename: typeof resource.uri === "string" ? resource.uri.split("/").pop() : undefined,
        })
      }
    }
  }

  return attachments.length > 0 ? attachments : undefined
}

export class McpManager {
  private readonly handles = new Map<string, ManagedServer>()
  private readonly projectID: string

  constructor(projectID: string) {
    this.projectID = projectID
  }

  async dispose() {
    await Promise.all(Array.from(this.handles.values()).map((handle) => handle.client?.dispose()))
    this.handles.clear()
  }

  async tools(): Promise<Tool.ToolInfo[]> {
    const servers = await Config.listMcpServers(this.projectID)
    await this.reconcile(servers)
    const result: Tool.ToolInfo[] = []
    const seen = new Map<string, string>()

    for (const server of servers) {
      if (!server.enabled) continue

      const handle = this.handles.get(server.id)
      if (!handle) continue

      let tools: McpToolDefinition[]
      try {
        tools = await this.serverTools(handle)
      } catch (error) {
        log.warn("failed to list mcp tools", {
          projectID: this.projectID,
          serverID: server.id,
          error: error instanceof Error ? error.message : String(error),
        })
        continue
      }

      for (const toolDefinition of tools) {
        const id = canonicalToolID(server.id, toolDefinition.name)
        const existing = seen.get(id)
        if (existing) {
          throw new Error(`Duplicate MCP tool id '${id}' from '${existing}' and '${server.id}'.`)
        }
        seen.set(id, server.id)
        result.push(this.createToolInfo(server, toolDefinition, id))
      }
    }

    return result
  }

  private async reconcile(servers: Config.McpServerSummary[]) {
    const nextKeys = new Set<string>()

    for (const server of servers) {
      const key = JSON.stringify(server)
      nextKeys.add(server.id)
      const existing = this.handles.get(server.id)
      if (existing && existing.configKey === key) {
        continue
      }

      await existing?.client?.dispose()
      this.handles.set(server.id, {
        config: server,
        configKey: key,
      })
    }

    for (const [serverID, handle] of this.handles.entries()) {
      if (nextKeys.has(serverID)) continue
      await handle.client?.dispose()
      this.handles.delete(serverID)
    }
  }

  private createToolInfo(server: Config.McpServerSummary, definition: McpToolDefinition, id: string): Tool.ToolInfo {
    const parameters = jsonSchemaToZod(
      definition.inputSchema && typeof definition.inputSchema === "object"
        ? definition.inputSchema
        : { type: "object", additionalProperties: true },
    )

    return Tool.define(
      id,
      async () => ({
        title: getMcpToolDisplayName(server, definition),
        description: definition.description ?? `${definition.name} (from MCP server ${server.name ?? server.id})`,
        parameters,
        execute: async (args, ctx) => {
          const result = await this.call(server.id, definition.name, args as Record<string, unknown>, ctx.abort)
          const summary = summarizeToolCallResult(result)
          const metadata: Record<string, unknown> = {
            [MCP_SERVER_ID_KEY]: server.id,
            [MCP_TOOL_NAME_KEY]: definition.name,
            [MCP_IS_ERROR_KEY]: summary.isError,
          }

          if (isRecord(result.structuredContent)) {
            metadata[MCP_STRUCTURED_CONTENT_KEY] = result.structuredContent
          }

          return {
            title: getMcpToolDisplayName(server, definition),
            text: summary.text,
            metadata,
            data: isRecord(result.structuredContent)
              ? {
                  structuredContent: result.structuredContent,
                  isError: summary.isError,
                }
              : undefined,
            attachments: toAttachments(result),
          }
        },
        toModelOutput: (output) => {
          const metadata = isRecord(output.metadata) ? output.metadata : undefined
          const data = isRecord(output.data) ? output.data : undefined
          const structuredContent = isRecord(metadata?.[MCP_STRUCTURED_CONTENT_KEY])
            ? (metadata[MCP_STRUCTURED_CONTENT_KEY] as Record<string, unknown>)
            : isRecord(data?.structuredContent)
              ? (data.structuredContent as Record<string, unknown>)
              : undefined
          const isError = Boolean(metadata?.[MCP_IS_ERROR_KEY] ?? data?.isError)

          if (structuredContent) {
            if (isError) {
              return {
                type: "error-json" as const,
                value: structuredContent as JSONValue,
              }
            }

            return {
              type: "json" as const,
              value: structuredContent as JSONValue,
            }
          }

          if (isError) {
            return {
              type: "error-text" as const,
              value: output.text,
            }
          }

          return {
            type: "text" as const,
            value: output.text,
          }
        },
      }),
      {
        title: getMcpToolDisplayName(server, definition),
        capabilities: toolCapabilities(definition),
      },
    )
  }

  private async call(
    serverID: string,
    toolName: string,
    args: Record<string, unknown>,
    abort?: AbortSignal,
  ) {
    const handle = this.handles.get(serverID)
    if (!handle) {
      throw new Error(`MCP server '${serverID}' is not configured for project '${this.projectID}'.`)
    }

    const client = await this.clientFor(handle)
    return await client.callTool(toolName, args, abort)
  }

  private async serverTools(handle: ManagedServer) {
    handle.toolsPromise ??= this.clientFor(handle).then((client) => client.listTools())
    return await handle.toolsPromise
  }

  private async clientFor(handle: ManagedServer) {
    if (handle.client) return handle.client

    const timeout = handle.config.timeoutMs ?? (await Config.get(this.projectID)).experimental?.mcp_timeout ?? 30_000
    handle.client = new McpClient({
      cwd: resolveServerCwd(handle.config.cwd),
      onToolsChanged: () => {
        handle.toolsPromise = undefined
      },
      requestTimeoutMs: timeout,
      server: handle.config,
      worktree: Instance.worktree,
    })

    return handle.client
  }
}

function resolveServerCwd(cwd: string | undefined) {
  if (!cwd) return Instance.directory
  if (isAbsolute(cwd)) return cwd
  return resolvePath(Instance.worktree, cwd)
}

const managerState = Instance.state(
  () => new McpManager(Instance.project.id),
  async (manager) => {
    await manager.dispose()
  },
)

export async function tools() {
  return await managerState().tools()
}
