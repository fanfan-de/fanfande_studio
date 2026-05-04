import { describe, expect, it } from "vitest"
import { parseMcpConfigJson } from "./mcp-config-import"

describe("parseMcpConfigJson", () => {
  it("imports Claude Desktop and Cursor stdio mcpServers objects", () => {
    const result = parseMcpConfigJson(JSON.stringify({
      mcpServers: {
        filesystem: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "C:\\Projects"],
          env: {
            NODE_ENV: "production",
          },
          disabled: false,
        },
      },
    }))

    expect(result.servers).toEqual([
      {
        id: "filesystem",
        server: {
          transport: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "C:\\Projects"],
          env: {
            NODE_ENV: "production",
          },
          cwd: undefined,
          enabled: true,
        },
      },
    ])
  })

  it("imports remote HTTP servers and lifts Authorization into the dedicated field", () => {
    const result = parseMcpConfigJson(JSON.stringify({
      mcpServers: {
        context7: {
          type: "http",
          url: "https://mcp.context7.com/mcp",
          headers: {
            Authorization: "Bearer secret",
            "X-Workspace": "demo",
          },
          allowedTools: {
            readOnly: true,
            toolNames: ["resolve-library-id"],
          },
          timeoutMs: 30000,
        },
      },
    }))

    expect(result.servers).toEqual([
      {
        id: "context7",
        server: {
          transport: "remote",
          serverUrl: "https://mcp.context7.com/mcp",
          authorization: "Bearer secret",
          headers: {
            "X-Workspace": "demo",
          },
          allowedTools: {
            readOnly: true,
            toolNames: ["resolve-library-id"],
          },
          enabled: true,
          timeoutMs: 30000,
        },
      },
    ])
  })

  it("imports a single add-json style server object", () => {
    const result = parseMcpConfigJson(JSON.stringify({
      id: "weather",
      type: "stdio",
      command: "/path/to/weather-cli",
      args: ["--api-key", "abc123"],
    }))

    expect(result.servers).toEqual([
      {
        id: "weather",
        server: {
          transport: "stdio",
          command: "/path/to/weather-cli",
          args: ["--api-key", "abc123"],
          env: undefined,
          cwd: undefined,
          enabled: true,
        },
      },
    ])
  })

  it("warns when importing legacy SSE entries as remote HTTP", () => {
    const result = parseMcpConfigJson(JSON.stringify({
      mcpServers: {
        legacy: {
          type: "sse",
          url: "https://example.com/sse",
        },
      },
    }))

    expect(result.servers[0]?.server.transport).toBe("remote")
    expect(result.warnings).toEqual(["legacy: legacy SSE was imported as a remote HTTP endpoint."])
  })

  it("rejects malformed entries", () => {
    expect(() => parseMcpConfigJson("{}")).toThrow("Expected a JSON object with an mcpServers field.")
    expect(() => parseMcpConfigJson("{")).toThrow("Invalid JSON")
    expect(() => parseMcpConfigJson(JSON.stringify({
      mcpServers: {
        broken: {
          args: ["--missing-command"],
        },
      },
    }))).toThrow("Local MCP server 'broken' requires a command.")
  })
})
