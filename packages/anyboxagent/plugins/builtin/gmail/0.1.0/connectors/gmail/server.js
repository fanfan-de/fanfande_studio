#!/usr/bin/env node

const readline = require("node:readline")

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users"
const USER_ID = process.env.GMAIL_USER_ID || "me"
const ACCESS_TOKEN = process.env.GMAIL_ACCESS_TOKEN || ""
const TOKEN_TYPE = process.env.GMAIL_TOKEN_TYPE || "Bearer"

const tools = [
  {
    name: "gmail_profile",
    title: "Gmail Profile",
    description: "Read the connected Gmail profile summary.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "gmail_search_messages",
    title: "Search Gmail",
    description: "Search Gmail messages with Gmail search syntax.",
    inputSchema: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description: "Gmail search query, for example 'from:alice@example.com newer_than:7d'.",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of messages to return, capped at 10.",
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "gmail_read_message",
    title: "Read Gmail Message",
    description: "Read headers and snippet for a Gmail message.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Gmail message ID returned by gmail_search_messages.",
        },
      },
      required: ["id"],
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
    throw new Error("Gmail connector is not connected. Missing GMAIL_ACCESS_TOKEN.")
  }
}

function appendParams(url, params) {
  for (const [key, value] of Object.entries(params || {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null && String(item).trim()) {
          url.searchParams.append(key, String(item))
        }
      }
      continue
    }
    if (value !== undefined && value !== null && String(value).trim()) {
      url.searchParams.set(key, String(value))
    }
  }
}

async function gmailFetch(path, params) {
  requireAccessToken()
  if (typeof fetch !== "function") {
    throw new Error("This Gmail connector requires a Node.js runtime with fetch support.")
  }

  const url = new URL(`${GMAIL_API_BASE}/${encodeURIComponent(USER_ID)}${path}`)
  appendParams(url, params)

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      authorization: `${TOKEN_TYPE || "Bearer"} ${ACCESS_TOKEN}`,
    },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(body.trim() || `Gmail API request failed with HTTP ${response.status}.`)
  }

  return response.json()
}

function headerMap(message) {
  const headers = message && message.payload && Array.isArray(message.payload.headers)
    ? message.payload.headers
    : []
  const result = {}
  for (const header of headers) {
    if (!header || typeof header.name !== "string") continue
    result[header.name.toLowerCase()] = String(header.value || "")
  }
  return result
}

function messageSummary(message) {
  const headers = headerMap(message)
  return {
    id: message.id,
    threadId: message.threadId,
    labelIds: message.labelIds || [],
    snippet: message.snippet || "",
    from: headers.from,
    to: headers.to,
    subject: headers.subject,
    date: headers.date,
  }
}

async function readMessage(id) {
  if (!id || !String(id).trim()) throw new Error("gmail_read_message requires a message id.")
  const message = await gmailFetch(`/messages/${encodeURIComponent(String(id).trim())}`, {
    format: "metadata",
    metadataHeaders: ["From", "To", "Cc", "Subject", "Date", "Message-ID"],
  })
  return messageSummary(message)
}

async function callTool(name, args) {
  if (name === "gmail_profile") {
    const profile = await gmailFetch("/profile")
    return textResult(
      `Gmail profile: ${profile.emailAddress || "unknown"} (${profile.messagesTotal || 0} messages, ${profile.threadsTotal || 0} threads)`,
      { profile },
    )
  }

  if (name === "gmail_search_messages") {
    const maxResults = Math.min(Math.max(Number(args && args.maxResults) || 5, 1), 10)
    const query = args && typeof args.q === "string" ? args.q.trim() : ""
    const result = await gmailFetch("/messages", {
      q: query,
      maxResults,
    })
    const messages = Array.isArray(result.messages) ? result.messages : []
    const summaries = []
    for (const item of messages.slice(0, maxResults)) {
      if (item && item.id) summaries.push(await readMessage(item.id))
    }
    const lines = summaries.map((item) => {
      const subject = item.subject || "(no subject)"
      const from = item.from || "unknown sender"
      return `${item.id}: ${subject} - ${from}`
    })
    return textResult(lines.length ? lines.join("\n") : "No Gmail messages matched the query.", {
      query,
      messages: summaries,
      resultSizeEstimate: result.resultSizeEstimate || 0,
    })
  }

  if (name === "gmail_read_message") {
    const message = await readMessage(args && args.id)
    return textResult(
      `${message.subject || "(no subject)"}\nFrom: ${message.from || "unknown"}\nDate: ${message.date || "unknown"}\n\n${message.snippet || ""}`,
      { message },
    )
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
          serverInfo: { name: "anybox-gmail", version: "0.1.0" },
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
