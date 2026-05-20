#!/usr/bin/env node

const readline = require("node:readline")

const FEISHU_API_BASE = process.env.FEISHU_API_BASE || "https://open.feishu.cn/open-apis"
const ACCESS_TOKEN = process.env.FEISHU_ACCESS_TOKEN || ""
const TOKEN_TYPE = process.env.FEISHU_TOKEN_TYPE || "Bearer"
const GRANTED_SCOPES = parseScopes(process.env.FEISHU_GRANTED_SCOPES || "")

function parseScopes(value) {
  return new Set(String(value || "").split(/\s+/).map((scope) => scope.trim()).filter(Boolean))
}

function send(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`)
}

function textResult(text, structuredContent) {
  return {
    content: [{ type: "text", text }],
    structuredContent,
    isError: false,
  }
}

function errorResult(error) {
  const message = error instanceof Error ? error.message : String(error)
  return {
    content: [{ type: "text", text: message }],
    structuredContent: { error: message },
    isError: true,
  }
}

function requireAccessToken() {
  if (!ACCESS_TOKEN.trim()) {
    throw new Error("Feishu connector is not connected. Missing FEISHU_ACCESS_TOKEN.")
  }
}

function appendParams(url, params) {
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null && String(item).trim()) {
          url.searchParams.append(key, String(item))
        }
      }
      continue
    }
    if (String(value).trim()) {
      url.searchParams.set(key, String(value))
    }
  }
}

async function feishuFetch(path, options = {}) {
  requireAccessToken()
  if (typeof fetch !== "function") {
    throw new Error("This Feishu connector requires a Node.js runtime with fetch support.")
  }

  const url = new URL(`${FEISHU_API_BASE}${path}`)
  appendParams(url, options.query)

  const headers = {
    accept: "application/json",
    authorization: `${TOKEN_TYPE || "Bearer"} ${ACCESS_TOKEN}`,
    ...(options.body ? { "content-type": "application/json; charset=utf-8" } : {}),
  }

  const response = await fetch(url, {
    method: options.method || (options.body ? "POST" : "GET"),
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  const contentType = response.headers.get("content-type") || ""
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => undefined)
    : await response.text().catch(() => "")

  if (!response.ok) {
    const detail = typeof payload === "string" ? payload : payload && (payload.msg || payload.message)
    throw new Error(String(detail || `Feishu API request failed with HTTP ${response.status}.`))
  }

  if (payload && typeof payload === "object" && "code" in payload && payload.code !== 0) {
    throw new Error(String(payload.msg || payload.message || `Feishu API returned code ${payload.code}.`))
  }

  return payload && typeof payload === "object" && "data" in payload ? payload.data : payload
}

function stringArg(args, name, options = {}) {
  const keys = [name, ...(options.aliases || [])]
  for (const key of keys) {
    const value = args && args[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }

  if (options.required !== false) {
    throw new Error(`${options.toolName || "Tool"} requires ${name}.`)
  }
  return undefined
}

function numberArg(args, name, options = {}) {
  const raw = args && args[name]
  const value = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : undefined
  if (!Number.isFinite(value)) return options.defaultValue

  const min = options.min ?? value
  const max = options.max ?? value
  return Math.min(Math.max(value, min), max)
}

function booleanArg(args, name, defaultValue = false) {
  const value = args && args[name]
  if (typeof value === "boolean") return value
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true
    if (value.toLowerCase() === "false") return false
  }
  return defaultValue
}

function extractTokenFromURL(input, patterns) {
  const raw = String(input || "").trim()
  if (!raw) return raw

  try {
    const url = new URL(raw)
    for (const pattern of patterns) {
      const match = url.pathname.match(pattern)
      if (match && match[1]) return match[1]
    }
  } catch {
    // Not a URL; treat the value as an already extracted token.
  }

  return raw
}

function extractDocxID(input) {
  const raw = extractTokenFromURL(input, [/\/docx\/([^/?#]+)/])
  if (!raw) throw new Error("feishu_read_docx_raw requires document_id.")
  return raw
}

function extractSpreadsheetToken(input) {
  const raw = extractTokenFromURL(input, [/\/sheets\/([^/?#]+)/])
  if (!raw) throw new Error("feishu_read_sheet_values requires spreadsheet_token.")
  return raw
}

function extractBitableAppToken(input) {
  const raw = extractTokenFromURL(input, [/\/base\/([^/?#]+)/])
  if (!raw) throw new Error("feishu_list_bitable_records requires app_token.")
  return raw
}

function extractWikiNodeToken(input) {
  const raw = extractTokenFromURL(input, [/\/wiki\/([^/?#]+)/])
  if (!raw) throw new Error("feishu_get_wiki_node requires node_token.")
  return raw
}

function normalizeFileItems(data) {
  if (Array.isArray(data?.files)) return data.files
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data?.entities)) return data.entities
  return []
}

function fileSummary(item) {
  return {
    name: item.name || item.title || item.docs_title || "",
    type: item.type || item.file_type || item.docs_type || "",
    token: item.token || item.file_token || item.docs_token || "",
    url: item.url || item.docs_url || "",
    owner: item.owner_id || item.owner || undefined,
    updatedTime: item.update_time || item.updated_time || item.edit_time || undefined,
  }
}

function arrayFromData(data, keys) {
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key]
  }
  return []
}

function pageInfo(data) {
  return {
    has_more: data?.has_more,
    page_token: data?.page_token,
  }
}

function toolDefinition(tool) {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
  }
}

function isToolEnabledForGrantedScopes(tool) {
  if (!GRANTED_SCOPES.size) return true
  return (tool.requiredScopes || []).every((scope) => GRANTED_SCOPES.has(scope))
}

function listedTools() {
  return toolRegistry.filter(isToolEnabledForGrantedScopes).map(toolDefinition)
}

const toolRegistry = [
  {
    name: "feishu_profile",
    title: "Feishu Profile",
    description: "Read the connected Feishu user profile.",
    requiredScopes: ["auth:user.id:read"],
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async handler() {
      const profile = await feishuFetch("/authen/v1/user_info")
      const label = profile.name || profile.en_name || profile.email || profile.open_id || "unknown"
      return textResult(`Feishu profile: ${label}`, { profile })
    },
  },
  {
    name: "feishu_search_files",
    title: "Search Feishu Files",
    description: "Search Feishu Drive files visible to the connected account.",
    requiredScopes: ["drive:drive.search:readonly"],
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search keyword.",
        },
        count: {
          type: "number",
          description: "Maximum number of files to return, capped at 20.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
    async handler(args) {
      const query = stringArg(args, "query", { toolName: "feishu_search_files" })
      const count = numberArg(args, "count", { defaultValue: 10, min: 1, max: 20 })
      const data = await feishuFetch("/drive/v1/files/search", {
        body: {
          search_word: query,
          count,
        },
      })
      const files = normalizeFileItems(data).slice(0, count).map(fileSummary)
      const lines = files.map((item) => {
        const name = item.name || "(untitled)"
        const type = item.type || "file"
        return `${type}: ${name}${item.token ? ` (${item.token})` : ""}`
      })
      return textResult(lines.length ? lines.join("\n") : "No Feishu files matched the query.", {
        query,
        files,
      })
    },
  },
  {
    name: "feishu_get_file_metadata",
    title: "Get Feishu File Metadata",
    description: "Fetch metadata for one or more Feishu Drive documents by token and document type.",
    requiredScopes: ["drive:drive.metadata:readonly"],
    inputSchema: {
      type: "object",
      properties: {
        file_token: {
          type: "string",
          description: "Document or file token. You can also pass a document URL.",
        },
        file_type: {
          type: "string",
          description: "Feishu document type, such as docx, sheet, bitable, doc, mindnote, file, or folder.",
        },
        files: {
          type: "array",
          description: "Optional batch of files to query.",
          items: {
            type: "object",
            properties: {
              file_token: { type: "string" },
              file_type: { type: "string" },
            },
            required: ["file_token", "file_type"],
            additionalProperties: false,
          },
        },
        with_url: {
          type: "boolean",
          description: "Whether to include document URLs in the metadata response.",
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async handler(args) {
      const files = Array.isArray(args?.files) && args.files.length
        ? args.files
        : [{
            file_token: stringArg(args, "file_token", { aliases: ["token"], toolName: "feishu_get_file_metadata" }),
            file_type: stringArg(args, "file_type", { aliases: ["type"], toolName: "feishu_get_file_metadata" }),
          }]

      const requestDocs = files.map((item) => ({
        doc_token: extractTokenFromURL(item.file_token, [
          /\/docx\/([^/?#]+)/,
          /\/sheets\/([^/?#]+)/,
          /\/base\/([^/?#]+)/,
          /\/file\/([^/?#]+)/,
          /\/folder\/([^/?#]+)/,
        ]),
        doc_type: String(item.file_type || "").trim(),
      })).filter((item) => item.doc_token && item.doc_type)

      if (!requestDocs.length) throw new Error("feishu_get_file_metadata requires at least one file token and type.")

      const data = await feishuFetch("/drive/v1/metas/batch_query", {
        body: {
          request_docs: requestDocs,
          with_url: booleanArg(args, "with_url", true),
        },
      })
      const metas = arrayFromData(data, ["metas", "items"])
      const names = metas.map((item) => item.title || item.name || item.doc_token || item.file_token).filter(Boolean)
      return textResult(
        names.length ? `Feishu metadata:\n${names.join("\n")}` : `Returned ${metas.length} Feishu metadata item(s).`,
        { metas, raw: data },
      )
    },
  },
  {
    name: "feishu_read_docx_raw",
    title: "Read Feishu Doc",
    description: "Read plain text content from a Feishu Docx document.",
    requiredScopes: ["docx:document:readonly"],
    inputSchema: {
      type: "object",
      properties: {
        document_id: {
          type: "string",
          description: "Feishu Docx document ID, or a Feishu Docx URL containing the document ID.",
        },
      },
      required: ["document_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async handler(args) {
      const documentID = extractDocxID(args && args.document_id)
      const data = await feishuFetch(`/docx/v1/documents/${encodeURIComponent(documentID)}/raw_content`)
      const content = typeof data?.content === "string" ? data.content : ""
      return textResult(content || "The Feishu document returned no plain text content.", {
        document_id: documentID,
        content,
      })
    },
  },
  {
    name: "feishu_list_docx_blocks",
    title: "List Feishu Doc Blocks",
    description: "List structured blocks from a Feishu Docx document.",
    requiredScopes: ["docx:document:readonly"],
    inputSchema: {
      type: "object",
      properties: {
        document_id: {
          type: "string",
          description: "Feishu Docx document ID, or a Feishu Docx URL containing the document ID.",
        },
        page_size: {
          type: "number",
          description: "Maximum number of blocks to return, capped at 500.",
        },
        page_token: {
          type: "string",
          description: "Pagination token from a previous response.",
        },
        document_revision_id: {
          type: "number",
          description: "Document revision ID. Omit to use the latest available revision.",
        },
      },
      required: ["document_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async handler(args) {
      const documentID = extractDocxID(args && args.document_id)
      const data = await feishuFetch(`/docx/v1/documents/${encodeURIComponent(documentID)}/blocks`, {
        query: {
          page_size: numberArg(args, "page_size", { defaultValue: 100, min: 1, max: 500 }),
          page_token: stringArg(args, "page_token", { required: false }),
          document_revision_id: numberArg(args, "document_revision_id", { defaultValue: undefined, min: -1, max: Number.MAX_SAFE_INTEGER }),
        },
      })
      const blocks = arrayFromData(data, ["items", "blocks"])
      return textResult(`Returned ${blocks.length} Feishu Docx block(s).`, {
        document_id: documentID,
        blocks,
        ...pageInfo(data),
      })
    },
  },
  {
    name: "feishu_list_wiki_spaces",
    title: "List Feishu Wiki Spaces",
    description: "List Feishu Wiki spaces visible to the connected account.",
    requiredScopes: ["wiki:wiki:readonly"],
    inputSchema: {
      type: "object",
      properties: {
        page_size: {
          type: "number",
          description: "Maximum number of spaces to return, capped at 50.",
        },
        page_token: {
          type: "string",
          description: "Pagination token from a previous response.",
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async handler(args) {
      const data = await feishuFetch("/wiki/v2/spaces", {
        query: {
          page_size: numberArg(args, "page_size", { defaultValue: 20, min: 1, max: 50 }),
          page_token: stringArg(args, "page_token", { required: false }),
        },
      })
      const spaces = arrayFromData(data, ["items", "spaces"])
      const lines = spaces.map((space) => `${space.name || "(untitled)"}${space.space_id ? ` (${space.space_id})` : ""}`)
      return textResult(lines.length ? lines.join("\n") : "No Feishu Wiki spaces returned.", {
        spaces,
        ...pageInfo(data),
      })
    },
  },
  {
    name: "feishu_get_wiki_node",
    title: "Get Feishu Wiki Node",
    description: "Resolve and read metadata for a Feishu Wiki node by node token or Wiki URL.",
    requiredScopes: ["wiki:wiki:readonly"],
    inputSchema: {
      type: "object",
      properties: {
        node_token: {
          type: "string",
          description: "Wiki node token, or a Feishu Wiki URL containing the node token.",
        },
      },
      required: ["node_token"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async handler(args) {
      const nodeToken = extractWikiNodeToken(args && args.node_token)
      const data = await feishuFetch("/wiki/v2/spaces/get_node", {
        query: {
          token: nodeToken,
        },
      })
      const node = data?.node || data
      const title = node?.title || node?.node_name || node?.name || nodeToken
      return textResult(`Feishu Wiki node: ${title}`, {
        node_token: nodeToken,
        node,
      })
    },
  },
  {
    name: "feishu_list_wiki_nodes",
    title: "List Feishu Wiki Nodes",
    description: "List child nodes in a Feishu Wiki space.",
    requiredScopes: ["wiki:wiki:readonly"],
    inputSchema: {
      type: "object",
      properties: {
        space_id: {
          type: "string",
          description: "Feishu Wiki space ID.",
        },
        parent_node_token: {
          type: "string",
          description: "Optional parent node token. Omit to list root nodes.",
        },
        page_size: {
          type: "number",
          description: "Maximum number of nodes to return, capped at 50.",
        },
        page_token: {
          type: "string",
          description: "Pagination token from a previous response.",
        },
      },
      required: ["space_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async handler(args) {
      const spaceID = stringArg(args, "space_id", { toolName: "feishu_list_wiki_nodes" })
      const data = await feishuFetch(`/wiki/v2/spaces/${encodeURIComponent(spaceID)}/nodes`, {
        query: {
          parent_node_token: stringArg(args, "parent_node_token", { required: false }),
          page_size: numberArg(args, "page_size", { defaultValue: 20, min: 1, max: 50 }),
          page_token: stringArg(args, "page_token", { required: false }),
        },
      })
      const nodes = arrayFromData(data, ["items", "nodes"])
      const lines = nodes.map((node) => `${node.title || node.node_name || node.name || "(untitled)"}${node.node_token ? ` (${node.node_token})` : ""}`)
      return textResult(lines.length ? lines.join("\n") : "No Feishu Wiki nodes returned.", {
        space_id: spaceID,
        nodes,
        ...pageInfo(data),
      })
    },
  },
  {
    name: "feishu_read_sheet_values",
    title: "Read Feishu Sheet Values",
    description: "Read cell values from a Feishu spreadsheet range.",
    requiredScopes: ["sheets:spreadsheet:readonly"],
    inputSchema: {
      type: "object",
      properties: {
        spreadsheet_token: {
          type: "string",
          description: "Spreadsheet token, or a Feishu Sheets URL containing the token.",
        },
        range: {
          type: "string",
          description: "A Feishu sheet range, for example Sheet1!A1:C10 or a sheet ID range.",
        },
      },
      required: ["spreadsheet_token", "range"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async handler(args) {
      const spreadsheetToken = extractSpreadsheetToken(args && args.spreadsheet_token)
      const range = stringArg(args, "range", { toolName: "feishu_read_sheet_values" })
      const data = await feishuFetch(
        `/sheets/v2/spreadsheets/${encodeURIComponent(spreadsheetToken)}/values/${encodeURIComponent(range)}`,
      )
      const values = data?.valueRange?.values || data?.values || []
      const rowCount = Array.isArray(values) ? values.length : 0
      return textResult(`Returned ${rowCount} Feishu sheet row(s).`, {
        spreadsheet_token: spreadsheetToken,
        range,
        valueRange: data?.valueRange,
        raw: data,
      })
    },
  },
  {
    name: "feishu_list_bitable_records",
    title: "List Feishu Bitable Records",
    description: "List records from a Feishu Bitable table.",
    requiredScopes: ["bitable:app:readonly"],
    inputSchema: {
      type: "object",
      properties: {
        app_token: {
          type: "string",
          description: "Bitable app token, or a Feishu Bitable URL containing the app token.",
        },
        table_id: {
          type: "string",
          description: "Bitable table ID.",
        },
        page_size: {
          type: "number",
          description: "Maximum number of records to return, capped at 100.",
        },
        page_token: {
          type: "string",
          description: "Pagination token from a previous response.",
        },
        view_id: {
          type: "string",
          description: "Optional view ID used to filter or order records.",
        },
      },
      required: ["app_token", "table_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async handler(args) {
      const appToken = extractBitableAppToken(args && args.app_token)
      const tableID = stringArg(args, "table_id", { toolName: "feishu_list_bitable_records" })
      const data = await feishuFetch(`/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableID)}/records`, {
        query: {
          page_size: numberArg(args, "page_size", { defaultValue: 20, min: 1, max: 100 }),
          page_token: stringArg(args, "page_token", { required: false }),
          view_id: stringArg(args, "view_id", { required: false }),
        },
      })
      const records = arrayFromData(data, ["items", "records"])
      return textResult(`Returned ${records.length} Feishu Bitable record(s).`, {
        app_token: appToken,
        table_id: tableID,
        records,
        ...pageInfo(data),
      })
    },
  },
]

const toolsByName = new Map(toolRegistry.map((tool) => [tool.name, tool]))

async function callTool(name, args) {
  const tool = toolsByName.get(name)
  if (!tool) throw new Error(`Unknown tool: ${name}`)
  return tool.handler(args || {})
}

const rl = readline.createInterface({ input: process.stdin })

rl.on("line", (line) => {
  void (async () => {
    if (!line.trim()) return
    const message = JSON.parse(line)

    if (message.method === "initialize") {
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "anybox-feishu", version: "0.1.0" },
        },
      })
      return
    }

    if (String(message.method || "").startsWith("notifications/")) return

    if (message.method === "tools/list") {
      send({ jsonrpc: "2.0", id: message.id, result: { tools: listedTools() } })
      return
    }

    if (message.method === "tools/call") {
      try {
        const result = await callTool(message.params && message.params.name, message.params && message.params.arguments)
        send({ jsonrpc: "2.0", id: message.id, result })
      } catch (error) {
        send({ jsonrpc: "2.0", id: message.id, result: errorResult(error) })
      }
      return
    }

    if (message.method === "ping") {
      send({ jsonrpc: "2.0", id: message.id, result: {} })
      return
    }

    if (message.method === "roots/list") {
      send({ jsonrpc: "2.0", id: message.id, result: { roots: [] } })
      return
    }

    if (message.id !== undefined) {
      send({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32601, message: `Unknown method: ${message.method}` },
      })
    }
  })().catch((error) => {
    send({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : String(error),
      },
    })
  })
})

rl.on("close", () => process.exit(0))
