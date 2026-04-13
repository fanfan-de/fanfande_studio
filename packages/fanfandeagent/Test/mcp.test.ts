import { describe, expect, test } from "bun:test"
import "./sqlite.cleanup.ts"
import { $ } from "bun"
import { once } from "node:events"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import z from "zod"
import * as Config from "#config/config.ts"
import { McpClient } from "#mcp/client.ts"
import * as Mcp from "#mcp/manager.ts"
import { Instance } from "#project/instance.ts"
import * as Project from "#project/project.ts"
import * as db from "#database/Sqlite.ts"
import * as Tool from "#tool/tool.ts"

async function createGitRepo(root: string, seed: string) {
  await mkdir(root, { recursive: true })
  await writeFile(join(root, "README.md"), `# ${seed}\n`)
  await $`git init`.cwd(root).quiet()
  await $`git config user.email test@example.com`.cwd(root).quiet()
  await $`git config user.name fanfande-test`.cwd(root).quiet()
  await $`git add README.md`.cwd(root).quiet()
  await $`git commit -m init`.cwd(root).quiet()
}

async function writeMockMcpServer(root: string) {
  const script = join(root, "mock-mcp-server.js")
  await writeFile(
    script,
    [
      "const readline = require('node:readline')",
      "const rl = readline.createInterface({ input: process.stdin })",
      "function send(payload) { process.stdout.write(JSON.stringify(payload) + '\\n') }",
      "const tools = [{",
      "  name: 'echo',",
      "  title: 'Echo',",
      "  description: 'Echo back the provided value',",
      "  inputSchema: {",
      "    type: 'object',",
      "    properties: { value: { type: 'string' } },",
      "    required: ['value'],",
      "    additionalProperties: false,",
      "  },",
      "  annotations: { readOnlyHint: true },",
      "}]",
      "rl.on('line', (line) => {",
      "  if (!line.trim()) return",
      "  const message = JSON.parse(line)",
      "  if (message.method === 'initialize') {",
      "    send({",
      "      jsonrpc: '2.0',",
      "      id: message.id,",
      "      result: {",
      "        protocolVersion: '2025-06-18',",
      "        capabilities: { tools: { listChanged: false } },",
      "        serverInfo: { name: 'mock-stdio', version: '1.0.0' },",
      "      },",
      "    })",
      "    return",
      "  }",
      "  if (message.method === 'tools/list') {",
      "    send({ jsonrpc: '2.0', id: message.id, result: { tools } })",
      "    return",
      "  }",
      "  if (message.method === 'tools/call') {",
      "    const value = message.params?.arguments?.value ?? ''",
      "    send({",
      "      jsonrpc: '2.0',",
      "      id: message.id,",
      "      result: {",
      "        content: [{ type: 'text', text: `echo:${value}` }],",
      "        structuredContent: { echoed: value },",
      "        isError: false,",
      "      },",
      "    })",
      "    return",
      "  }",
      "  if (message.method === 'ping') {",
      "    send({ jsonrpc: '2.0', id: message.id, result: {} })",
      "    return",
      "  }",
      "  if (message.method === 'roots/list') {",
      "    send({ jsonrpc: '2.0', id: message.id, result: { roots: [] } })",
      "    return",
      "  }",
      "  if (String(message.method || '').startsWith('notifications/')) {",
      "    return",
      "  }",
      "  send({",
      "    jsonrpc: '2.0',",
      "    id: message.id ?? null,",
      "    error: { code: -32601, message: `Unknown method: ${message.method}` },",
      "  })",
      "})",
      "rl.on('close', () => process.exit(0))",
    ].join("\n"),
  )
  return script
}

async function startMockHttpMcpServer() {
  const seenHeaders: Array<Record<string, string | string[] | undefined>> = []
  const server = createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/mcp") {
      res.writeHead(405).end()
      return
    }

    const chunks: Buffer[] = []
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    const bodyText = Buffer.concat(chunks).toString("utf8")
    const body = bodyText ? JSON.parse(bodyText) : undefined

    seenHeaders.push({
      authorization: req.headers.authorization,
      "x-api-key": req.headers["x-api-key"],
    })

    const mcp = new McpServer({
      name: "mock-http",
      version: "1.0.0",
    })
    mcp.registerTool(
      "echo",
      {
        title: "Echo",
        description: "Echo back the provided value",
        inputSchema: {
          value: z.string(),
        },
        annotations: {
          readOnlyHint: true,
        },
      },
      async ({ value }) => ({
        content: [{ type: "text", text: `echo:${value}` }],
        structuredContent: { echoed: value },
        isError: false,
      }),
    )
    mcp.registerTool(
      "write",
      {
        title: "Write",
        description: "Pretend to mutate data",
        inputSchema: {
          value: z.string(),
        },
      },
      async ({ value }) => ({
        content: [{ type: "text", text: `write:${value}` }],
        structuredContent: { written: value },
        isError: false,
      }),
    )

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    })

    try {
      await mcp.connect(transport)
      await transport.handleRequest(req, res, body)
    } finally {
      res.on("close", () => {
        void transport.close()
        void mcp.close()
      })
    }
  })

  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = server.address()
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind mock HTTP MCP server.")
  }

  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    seenHeaders,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
    },
  }
}

describe("mcp integration", () => {
  test("McpClient should list and call stdio tools", async () => {
    const root = await mkdtemp(join(tmpdir(), "fanfande-mcp-client-"))

    try {
      const script = await writeMockMcpServer(root)
      const client = new McpClient({
        cwd: root,
        worktree: root,
        requestTimeoutMs: 1000,
        server: {
          id: "mock",
          name: "Mock",
          transport: "stdio",
          command: process.execPath,
          args: [script],
          enabled: true,
        },
      })

      try {
        const tools = await client.listTools()
        expect(tools).toHaveLength(1)
        expect(tools[0]).toMatchObject({
          name: "echo",
          title: "Echo",
        })

        const result = await client.callTool("echo", { value: "hello" })
        expect(result).toMatchObject({
          structuredContent: {
            echoed: "hello",
          },
          isError: false,
        })
        expect(result.content).toEqual([{ type: "text", text: "echo:hello" }])
      } finally {
        await client.dispose()
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("McpClient should list and call remote HTTP tools", async () => {
    const remote = await startMockHttpMcpServer()

    try {
      const client = new McpClient({
        cwd: process.cwd(),
        worktree: process.cwd(),
        requestTimeoutMs: 1000,
        server: {
          id: "remote",
          name: "Remote",
          transport: "remote",
          serverUrl: remote.url,
          authorization: "remote-token",
          headers: {
            "x-api-key": "secret",
          },
          enabled: true,
        },
      })

      try {
        const tools = await client.listTools()
        expect(tools.map((tool) => tool.name)).toEqual(["echo", "write"])

        const result = await client.callTool("echo", { value: "hello" })
        expect(result).toMatchObject({
          structuredContent: {
            echoed: "hello",
          },
          isError: false,
        })
      } finally {
        await client.dispose()
      }

      expect(remote.seenHeaders).not.toHaveLength(0)
      expect(remote.seenHeaders[0]?.authorization).toBe("Bearer remote-token")
      expect(remote.seenHeaders[0]?.["x-api-key"]).toBe("secret")
    } finally {
      await remote.close()
    }
  })

  test("Mcp manager should expose MCP tools through the registry shape", async () => {
    const root = await mkdtemp(join(tmpdir(), "fanfande-mcp-manager-"))
    let projectID: string | undefined

    try {
      await createGitRepo(root, "mcp-manager")
      const script = await writeMockMcpServer(root)
      const { project } = await Project.fromDirectory(root)
      projectID = project.id

      await Config.setMcpServer(project.id, "mock", {
        name: "Mock",
        command: process.execPath,
        args: [script],
        enabled: true,
      })

      await Instance.provide({
        directory: root,
        fn: async () => {
          const tools = await Mcp.tools()
          const info = tools.find((item) => item.id === "mcp__mock__echo")

          expect(info).toBeDefined()
          expect(info?.title).toBe("Mock/Echo")

          const runtime = await info!.init()
          const output = Tool.normalizeToolOutput(await runtime.execute(
            { value: "hello" },
            {
              sessionID: "session_test",
              messageID: "message_test",
            },
          ))

          expect(output.text).toBe("echo:hello")
          expect(output.metadata).toMatchObject({
            serverID: "mock",
            toolName: "echo",
            mcpIsError: false,
            mcpStructuredContent: {
              echoed: "hello",
            },
          })

          const modelOutput = await runtime.toModelOutput?.(output)
          expect(modelOutput).toEqual({
            type: "json",
            value: {
              echoed: "hello",
            },
          })
        },
      })
    } finally {
      await Instance.disposeAll()
      if (projectID) {
        db.deleteMany("project_configs", [{ column: "projectID", value: projectID }])
        db.deleteMany("projects", [{ column: "id", value: projectID }])
      }
      await rm(root, { recursive: true, force: true })
    }
  })

  test("Mcp manager should diagnose MCP tool discovery failures and successes", async () => {
    const root = await mkdtemp(join(tmpdir(), "fanfande-mcp-diagnose-"))
    let projectID: string | undefined

    try {
      await createGitRepo(root, "mcp-diagnose")
      const script = await writeMockMcpServer(root)
      const { project } = await Project.fromDirectory(root)
      projectID = project.id

      await Config.setMcpServer(project.id, "mock", {
        name: "Mock",
        command: process.execPath,
        args: [script],
        enabled: true,
      })

      await Instance.provide({
        directory: root,
        fn: async () => {
          const diagnostic = await Mcp.diagnose("mock")

          expect(diagnostic).toEqual({
            serverID: "mock",
            enabled: true,
            ok: true,
            toolCount: 1,
            toolNames: ["echo"],
          })
        },
      })
    } finally {
      await Instance.disposeAll()
      if (projectID) {
        db.deleteMany("project_configs", [{ column: "projectID", value: projectID }])
        db.deleteMany("projects", [{ column: "id", value: projectID }])
      }
      await rm(root, { recursive: true, force: true })
    }
  })

  test("Mcp manager should expose filtered remote HTTP tools through the registry shape", async () => {
    const root = await mkdtemp(join(tmpdir(), "fanfande-mcp-remote-manager-"))
    const remote = await startMockHttpMcpServer()
    let projectID: string | undefined

    try {
      await createGitRepo(root, "mcp-remote-manager")
      const { project } = await Project.fromDirectory(root)
      projectID = project.id

      await Config.setMcpServer(project.id, "remote", {
        name: "Remote",
        transport: "remote",
        serverUrl: remote.url,
        authorization: "remote-token",
        headers: {
          "x-api-key": "secret",
        },
        allowedTools: {
          readOnly: true,
        },
        enabled: true,
      })

      await Instance.provide({
        directory: root,
        fn: async () => {
          const tools = await Mcp.tools()

          expect(tools.find((item) => item.id === "mcp__remote__echo")).toBeDefined()
          expect(tools.find((item) => item.id === "mcp__remote__write")).toBeUndefined()
        },
      })
    } finally {
      await Instance.disposeAll()
      await remote.close()
      if (projectID) {
        db.deleteMany("project_configs", [{ column: "projectID", value: projectID }])
        db.deleteMany("projects", [{ column: "id", value: projectID }])
      }
      await rm(root, { recursive: true, force: true })
    }
  })
})
