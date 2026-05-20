#!/usr/bin/env node

const readline = require("node:readline")

const FEISHU_API_BASE = process.env.FEISHU_API_BASE || "https://open.feishu.cn/open-apis"
const ACCESS_TOKEN = process.env.FEISHU_ACCESS_TOKEN || ""
const TOKEN_TYPE = process.env.FEISHU_TOKEN_TYPE || "Bearer"

const tools = [
  {
    name: "feishu_profile",
    title: "Feishu Profile",
    description: "Read the connected Feishu user profile.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "feishu_search_files",
    title: "Search Feishu Files",
    description: "Search Feishu Drive files visible to the connected account.",
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
    annotations: { readOnlyHint: true },
  },
  {
    name: "feishu_read_docx_raw",
    title: "Read Feishu Doc",
    description: "Read plain text content from a Feishu Docx document.",
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
  },
]

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
    if (value !== undefined && value !== null && String(value).trim()) {
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

function extractDocxID(input) {
  const raw = String(input || "").trim()
  if (!raw) throw new Error("feishu_read_docx_raw requires document_id.")

  try {
    const url = new URL(raw)
    const match = url.pathname.match(/\/docx\/([^/?#]+)/)
    if (match && match[1]) return match[1]
  } catch {
    // Not a URL; treat the value as the document ID.
  }

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

async function callTool(name, args) {
  if (name === "feishu_profile") {
    const profile = await feishuFetch("/authen/v1/user_info")
    const label = profile.name || profile.en_name || profile.email || profile.open_id || "unknown"
    return textResult(`Feishu profile: ${label}`, { profile })
  }

  if (name === "feishu_search_files") {
    const query = args && typeof args.query === "string" ? args.query.trim() : ""
    if (!query) throw new Error("feishu_search_files requires a query.")
    const count = Math.min(Math.max(Number(args && args.count) || 10, 1), 20)
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
  }

  if (name === "feishu_read_docx_raw") {
    const documentID = extractDocxID(args && args.document_id)
    const data = await feishuFetch(`/docx/v1/documents/${encodeURIComponent(documentID)}/raw_content`)
    const content = typeof data?.content === "string" ? data.content : ""
    return textResult(content || "The Feishu document returned no plain text content.", {
      document_id: documentID,
      content,
    })
  }

  throw new Error(`Unknown tool: ${name}`)
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
      send({ jsonrpc: "2.0", id: message.id, result: { tools } })
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
