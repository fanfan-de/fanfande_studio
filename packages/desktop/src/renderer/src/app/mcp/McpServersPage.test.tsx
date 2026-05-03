import { fireEvent, render, screen } from "@testing-library/react"
import type { ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"
import type { McpServerDiagnostic, McpServerDraftState } from "../types"
import { McpServersPage } from "./McpServersPage"

function createDraft(overrides: Partial<McpServerDraftState> = {}): McpServerDraftState {
  return {
    id: "context7",
    name: "Context7",
    transport: "remote",
    command: "",
    args: "",
    env: "",
    cwd: "",
    serverUrl: "https://mcp.context7.com/mcp",
    authorization: "",
    headers: "",
    allowedToolsMode: "all",
    allowedToolNames: "",
    toolPolicies: {},
    enabled: true,
    timeoutMs: "",
    ...overrides,
  }
}

function createDiagnostic(overrides: Partial<McpServerDiagnostic> = {}): McpServerDiagnostic {
  return {
    serverID: "context7",
    enabled: true,
    ok: true,
    toolCount: 2,
    toolNames: ["resolve-library-id", "get-library-docs"],
    tools: [
      {
        name: "resolve-library-id",
        title: "Resolve Library ID",
        displayName: "Resolve Library ID",
        description: "Resolve a package name to a Context7 library id.",
        inputSchema: {
          type: "object",
          properties: {
            libraryName: {
              type: "string",
            },
          },
        },
        annotations: {
          readOnlyHint: true,
        },
        riskHint: "read-only",
        recommendedPolicy: "auto",
      },
      {
        name: "get-library-docs",
        title: "Get Library Docs",
        displayName: "Get Library Docs",
        description: "Fetch documentation for a library.",
        inputSchema: {
          type: "object",
        },
        annotations: {},
        riskHint: "unknown",
        recommendedPolicy: "ask",
      },
    ],
    ...overrides,
  }
}

function createProps(
  overrides: Partial<ComponentProps<typeof McpServersPage>> = {},
): ComponentProps<typeof McpServersPage> {
  return {
    activeMcpServerID: "context7",
    activeMcpServerDiagnostic: createDiagnostic(),
    deletingMcpServerID: null,
    isLoading: false,
    loadError: null,
    mcpServerDraft: createDraft(),
    mcpServers: [
      {
        id: "context7",
        name: "Context7",
        transport: "remote",
        serverUrl: "https://mcp.context7.com/mcp",
        enabled: true,
      },
    ],
    message: null,
    savingMcpServerID: null,
    onDeleteMcpServer: vi.fn(),
    onDismissMessage: vi.fn(),
    onMcpServerDraftChange: vi.fn(),
    onMcpToolPolicyChange: vi.fn(),
    onMcpServerSelect: vi.fn(),
    onSaveMcpServer: vi.fn(),
    onStartNewMcpServer: vi.fn(),
    ...overrides,
  }
}

describe("McpServersPage tool policies", () => {
  it("renders discovered tools and changes a per-tool policy", () => {
    const onMcpToolPolicyChange = vi.fn()

    render(<McpServersPage {...createProps({ onMcpToolPolicyChange })} />)

    expect(screen.getByText("Tool Permissions")).toBeInTheDocument()
    expect(screen.getByText("resolve-library-id")).toBeInTheDocument()
    expect(screen.getByText("get-library-docs")).toBeInTheDocument()
    expect(screen.getByText("read-only")).toBeInTheDocument()
    expect(screen.queryByText("Resolve a package name to a Context7 library id.")).not.toBeInTheDocument()
    expect(screen.queryByText("Input schema")).not.toBeInTheDocument()

    const docsPolicy = screen.getByLabelText("Policy for get-library-docs") as HTMLSelectElement
    expect(docsPolicy.value).toBe("auto")

    fireEvent.change(docsPolicy, {
      target: {
        value: "disabled",
      },
    })

    expect(onMcpToolPolicyChange).toHaveBeenCalledWith("get-library-docs", "disabled")

    const resolveDetailsButton = screen.getByRole("button", { name: "Show details for resolve-library-id" })
    expect(resolveDetailsButton).toHaveAttribute("aria-expanded", "false")

    fireEvent.click(resolveDetailsButton)

    expect(resolveDetailsButton).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("Resolve a package name to a Context7 library id.")).toBeInTheDocument()
    expect(screen.getByText("Input schema")).toBeInTheDocument()
    expect(screen.getByText(/"libraryName"/)).toBeInTheDocument()
  })

  it("shows the tools policy section for stdio MCP servers", () => {
    render(
      <McpServersPage
        {...createProps({
          activeMcpServerDiagnostic: createDiagnostic({
            serverID: "pencil",
            toolCount: 1,
            toolNames: ["batch_design"],
            tools: [
              {
                name: "batch_design",
                displayName: "batch_design",
                description: "Execute design operations.",
                annotations: {},
                riskHint: "unknown",
                recommendedPolicy: "ask",
              },
            ],
          }),
          mcpServerDraft: createDraft({
            id: "pencil",
            name: "Pencil",
            transport: "stdio",
            command: "pencil-mcp.exe",
            serverUrl: "",
          }),
          mcpServers: [
            {
              id: "pencil",
              name: "Pencil",
              transport: "stdio",
              command: "pencil-mcp.exe",
              enabled: true,
            },
          ],
        })}
      />,
    )

    expect(screen.getByText("Tool Permissions")).toBeInTheDocument()
    expect(screen.getAllByText("batch_design")).toHaveLength(2)
    expect((screen.getByLabelText("Policy for batch_design") as HTMLSelectElement).value).toBe("auto")
  })

  it("maps legacy remote read-only filters to understandable tool policy defaults", () => {
    render(
      <McpServersPage
        {...createProps({
          activeMcpServerDiagnostic: createDiagnostic({
            toolCount: 1,
            toolNames: ["resolve-library-id"],
            tools: [
              ...createDiagnostic().tools,
              {
                name: "write-docs",
                displayName: "write-docs",
                description: "Pretend to mutate documentation.",
                annotations: {},
                riskHint: "unknown",
                recommendedPolicy: "ask",
              },
            ],
          }),
          mcpServerDraft: createDraft({
            allowedToolsMode: "read-only",
          }),
        })}
      />,
    )

    expect((screen.getByLabelText("Policy for resolve-library-id") as HTMLSelectElement).value).toBe("auto")
    expect((screen.getByLabelText("Policy for write-docs") as HTMLSelectElement).value).toBe("disabled")
  })
})
