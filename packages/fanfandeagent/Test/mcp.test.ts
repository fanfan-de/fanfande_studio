import { describe, expect, test } from "bun:test"
import { $ } from "bun"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
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
      "    send({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2025-06-18' } })",
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
})
