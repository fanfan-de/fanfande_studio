import { afterEach, describe, expect, test } from "bun:test"
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { join } from "node:path"

const serverPath = join(import.meta.dir, "..", "connectors", "node-repl", "server.js")
const children: ChildProcessWithoutNullStreams[] = []

function startServer() {
  const child = spawn("node", [serverPath], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  })
  children.push(child)

  const lines: unknown[] = []
  child.stdout.setEncoding("utf8")
  child.stdout.on("data", (chunk: string) => {
    for (const line of chunk.split(/\r?\n/)) {
      if (line.trim()) lines.push(JSON.parse(line))
    }
  })

  let nextID = 1
  async function request(method: string, params?: unknown) {
    const id = nextID
    nextID += 1
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`)
    const started = Date.now()
    while (Date.now() - started < 5000) {
      const index = lines.findIndex((line) => (line as { id?: unknown }).id === id)
      if (index >= 0) return lines.splice(index, 1)[0] as { result?: unknown; error?: unknown }
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    throw new Error(`Timed out waiting for ${method}`)
  }

  return { child, request }
}

afterEach(() => {
  for (const child of children.splice(0)) {
    child.kill()
  }
})

describe("node-repl connector", () => {
  test("lists tools and preserves globalThis state", async () => {
    const server = startServer()
    await server.request("initialize")

    const list = await server.request("tools/list") as { result?: { tools?: Array<{ name: string }> } }
    expect(list.result?.tools?.map((tool) => tool.name)).toEqual([
      "node_repl_js",
      "node_repl_reset",
      "node_repl_add_node_module_dir",
    ])

    const first = await server.request("tools/call", {
      name: "node_repl_js",
      arguments: {
        code: "globalThis.answer = (globalThis.answer || 0) + 1\nreturn globalThis.answer",
      },
    }) as { result?: { structuredContent?: { result?: unknown } } }
    const second = await server.request("tools/call", {
      name: "node_repl_js",
      arguments: {
        code: "globalThis.answer = (globalThis.answer || 0) + 1\nreturn globalThis.answer",
      },
    }) as { result?: { structuredContent?: { result?: unknown } } }

    expect(first.result?.structuredContent?.result).toBe(1)
    expect(second.result?.structuredContent?.result).toBe(2)
  })

  test("preloads setupBrowserRuntime", async () => {
    const server = startServer()
    await server.request("initialize")

    const response = await server.request("tools/call", {
      name: "node_repl_js",
      arguments: {
        code: [
          "await setupBrowserRuntime({ globals: globalThis })",
          "const runtime = await agent.browsers.get('extension')",
          "return typeof runtime.tabs.open",
        ].join("\n"),
      },
    }) as { result?: { structuredContent?: { result?: unknown } } }

    expect(response.result?.structuredContent?.result).toBe("function")
  })
})
