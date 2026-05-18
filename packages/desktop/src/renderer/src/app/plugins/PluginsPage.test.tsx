import { fireEvent, render, screen, within } from "@testing-library/react"
import type { ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"
import { PluginsPage } from "./PluginsPage"

type PluginsPageProps = ComponentProps<typeof PluginsPage>
type CatalogPlugin = PluginsPageProps["pluginCatalog"][number]
type InstalledPlugin = PluginsPageProps["installedPlugins"][number]
type McpDiagnostic = PluginsPageProps["pluginDiagnostics"][string]

function createPlugin(overrides: Partial<CatalogPlugin> = {}): CatalogPlugin {
  const id = overrides.id ?? "filesystem"

  return {
    id,
    name: overrides.name ?? "Filesystem",
    description: overrides.description ?? "Expose a local directory to MCP.",
    version: overrides.version ?? "1.0.0",
    publisher: overrides.publisher ?? "Fanfande",
    category: overrides.category ?? "Code",
    risk: overrides.risk ?? "high",
    permissions: overrides.permissions ?? ["Read access inside the configured root path"],
    tools: overrides.tools ?? [
      {
        name: "read_file",
        title: "Read File",
        description: "Read files below the configured root.",
        readOnly: true,
      },
    ],
    mcpServers: overrides.mcpServers ?? [
      {
        id: "default",
        name: "Filesystem",
        description: "Expose local files.",
        risk: "high",
        permissions: ["Read access inside the configured root path"],
        tools: [
          {
            name: "read_file",
            description: "Read files below the configured root.",
            readOnly: true,
          },
        ],
        runtime: {
          transport: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "${ROOT_PATH}"],
          timeoutMs: 30000,
        },
      },
    ],
    skills: overrides.skills ?? [],
    apps: overrides.apps ?? [],
    configFields: overrides.configFields ?? [
      {
        key: "ROOT_PATH",
        label: "Root path",
        type: "path",
        required: true,
      },
    ],
    installReview: overrides.installReview ?? ["Prefer a narrow project folder."],
    ...overrides,
  }
}

function createDocsPlugin(): CatalogPlugin {
  return createPlugin({
    id: "docs",
    name: "Docs",
    description: "Search connected documentation.",
    category: "Docs",
    risk: "medium",
    configFields: [],
    tools: [
      {
        name: "search_docs",
        title: "Search Docs",
        description: "Search docs.",
        readOnly: true,
      },
    ],
    mcpServers: [],
    skills: [
      {
        id: "plugin:docs:review",
        name: "Review Docs",
        description: "Review documentation output.",
        directory: "review",
      },
    ],
    apps: [
      {
        appID: "docs-api",
        name: "Docs API",
        description: "Remote docs connector.",
        credential: {
          key: "DOCS_API_KEY",
          label: "Docs API key",
          type: "password",
          required: true,
          secret: true,
        },
        runtime: {
          transport: "remote",
          serverUrl: "https://docs.example.test/mcp",
          allowedTools: {
            readOnly: true,
          },
          requireApproval: "always",
          timeoutMs: 30000,
        },
      },
    ],
    permissions: ["Sends requests to docs.example.test"],
    installReview: ["API keys are injected only at runtime."],
  })
}

function createInstalledPlugin(overrides: Partial<InstalledPlugin> = {}): InstalledPlugin {
  return {
    pluginID: overrides.pluginID ?? "filesystem",
    version: overrides.version ?? "1.0.0",
    enabled: overrides.enabled ?? true,
    mcpServerID: overrides.mcpServerID ?? "plugin.filesystem",
    mcpServerIDs: overrides.mcpServerIDs ?? ["plugin.filesystem"],
    skillIDs: overrides.skillIDs ?? [],
    connectorIDs: overrides.connectorIDs ?? [],
    config: overrides.config ?? {
      ROOT_PATH: "C:\\Projects",
    },
    installedAt: overrides.installedAt ?? 1,
    updatedAt: overrides.updatedAt ?? 2,
    lastDiagnostic: overrides.lastDiagnostic,
    lastConnectorDiagnostics: overrides.lastConnectorDiagnostics,
  }
}

function createDiagnostic(overrides: Partial<McpDiagnostic> = {}): McpDiagnostic {
  return {
    serverID: overrides.serverID ?? "plugin.filesystem",
    enabled: overrides.enabled ?? true,
    ok: overrides.ok ?? true,
    toolCount: overrides.toolCount ?? 1,
    toolNames: overrides.toolNames ?? ["read_file"],
    tools: overrides.tools ?? [],
    error: overrides.error,
  }
}

function createProps(overrides: Partial<PluginsPageProps> = {}): PluginsPageProps {
  return {
    activePluginID: null,
    deletingPluginID: null,
    diagnosingPluginConnectorID: null,
    diagnosingPluginID: null,
    installingPluginID: null,
    installedPlugins: [],
    isLoading: false,
    loadError: null,
    message: null,
    pluginCatalog: [createPlugin()],
    pluginConnectorStatuses: {},
    pluginDiagnostics: {},
    pluginDraft: {
      pluginID: null,
      config: {},
      appApiKeys: {},
    },
    savingPluginConnectorID: null,
    updatingPluginID: null,
    onDeleteInstalledPlugin: vi.fn(),
    onDeleteInstalledPluginConnectorApiKey: vi.fn(),
    onDiagnoseInstalledPlugin: vi.fn(),
    onDiagnoseInstalledPluginConnector: vi.fn(),
    onDismissMessage: vi.fn(),
    onInstallPlugin: vi.fn(),
    onPluginDraftAppApiKeyChange: vi.fn(),
    onPluginDraftConfigChange: vi.fn(),
    onPluginSelect: vi.fn(),
    onSaveInstalledPluginConnectorApiKey: vi.fn(),
    onSaveInstalledPluginConfig: vi.fn(),
    onSetInstalledPluginEnabled: vi.fn(),
    ...overrides,
  }
}

describe("PluginsPage", () => {
  it("renders the plugin marketplace without the development blocker", () => {
    const onInstallPlugin = vi.fn()
    render(<PluginsPage {...createProps({ onInstallPlugin })} />)

    expect(screen.getByRole("region", { name: "Plugin marketplace layout" })).toBeInTheDocument()
    expect(screen.queryByText("Plugin module is under development")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Install" }))
    expect(onInstallPlugin).toHaveBeenCalledWith("filesystem")
  })

  it("filters plugins by search and category and selects a plugin from the list", () => {
    const onPluginSelect = vi.fn()
    render(
      <PluginsPage
        {...createProps({
          pluginCatalog: [
            createPlugin(),
            createDocsPlugin(),
          ],
          onPluginSelect,
        })}
      />,
    )

    fireEvent.change(screen.getByLabelText("Search"), {
      target: {
        value: "docs",
      },
    })

    expect(screen.getByRole("button", { name: "Docs not installed" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Filesystem not installed" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Docs" }))
    expect(screen.getByRole("button", { name: "Docs not installed" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Docs not installed" }))
    expect(onPluginSelect).toHaveBeenCalledWith("docs")
  })

  it("saves installed plugin configuration and exposes lifecycle actions", () => {
    const plugin = createPlugin()
    const installed = createInstalledPlugin()
    const onPluginDraftConfigChange = vi.fn()
    const onSaveInstalledPluginConfig = vi.fn()
    const onSetInstalledPluginEnabled = vi.fn()
    const onDiagnoseInstalledPlugin = vi.fn()
    const onDeleteInstalledPlugin = vi.fn()

    render(
      <PluginsPage
        {...createProps({
          activePluginID: "filesystem",
          pluginCatalog: [plugin],
          installedPlugins: [installed],
          pluginDraft: {
            pluginID: "filesystem",
            config: {
              ROOT_PATH: "D:\\Workspace",
            },
            appApiKeys: {},
          },
          onPluginDraftConfigChange,
          onSaveInstalledPluginConfig,
          onSetInstalledPluginEnabled,
          onDiagnoseInstalledPlugin,
          onDeleteInstalledPlugin,
        })}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Root path/), {
      target: {
        value: "E:\\Workspace",
      },
    })
    expect(onPluginDraftConfigChange).toHaveBeenCalledWith("ROOT_PATH", "E:\\Workspace")

    fireEvent.click(screen.getByRole("button", { name: "Save config" }))
    expect(onSaveInstalledPluginConfig).toHaveBeenCalledWith("filesystem")

    fireEvent.click(screen.getByRole("button", { name: "Disable" }))
    expect(onSetInstalledPluginEnabled).toHaveBeenCalledWith("filesystem", false)

    fireEvent.click(screen.getByRole("button", { name: "Diagnose" }))
    expect(onDiagnoseInstalledPlugin).toHaveBeenCalledWith("filesystem")

    fireEvent.click(screen.getByRole("button", { name: "Remove" }))
    expect(onDeleteInstalledPlugin).toHaveBeenCalledWith("filesystem")
  })

  it("renders connector credentials and dispatches connector actions", () => {
    const plugin = createDocsPlugin()
    const installed = createInstalledPlugin({
      pluginID: "docs",
      mcpServerID: "plugin.docs.app.docs-api",
      mcpServerIDs: ["plugin.docs.app.docs-api"],
      skillIDs: ["plugin:docs:review"],
      connectorIDs: ["plugin-app:docs:docs-api"],
      config: {},
    })
    const onPluginDraftAppApiKeyChange = vi.fn()
    const onSaveInstalledPluginConnectorApiKey = vi.fn()
    const onDiagnoseInstalledPluginConnector = vi.fn()
    const onDeleteInstalledPluginConnectorApiKey = vi.fn()

    render(
      <PluginsPage
        {...createProps({
          activePluginID: "docs",
          pluginCatalog: [plugin],
          installedPlugins: [installed],
          pluginConnectorStatuses: {
            docs: [
              {
                pluginID: "docs",
                appID: "docs-api",
                connectorID: "plugin-app:docs:docs-api",
                connected: true,
                credentialLabel: "Docs API key",
                generatedMcpServerID: "plugin.docs.app.docs-api",
                lastDiagnostic: createDiagnostic({
                  serverID: "plugin.docs.app.docs-api",
                  toolNames: ["search_docs"],
                }),
              },
            ],
          },
          pluginDraft: {
            pluginID: "docs",
            config: {},
            appApiKeys: {
              "docs-api": "next-key",
            },
          },
          onPluginDraftAppApiKeyChange,
          onSaveInstalledPluginConnectorApiKey,
          onDiagnoseInstalledPluginConnector,
          onDeleteInstalledPluginConnectorApiKey,
        })}
      />,
    )

    expect(screen.getByText("Connector reachable. Tools: search_docs")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/Docs API key/), {
      target: {
        value: "new-key",
      },
    })
    expect(onPluginDraftAppApiKeyChange).toHaveBeenCalledWith("docs-api", "new-key")

    fireEvent.click(screen.getByRole("button", { name: "Update key" }))
    expect(onSaveInstalledPluginConnectorApiKey).toHaveBeenCalledWith("docs", "docs-api")

    const connectorsPanel = screen.getByRole("heading", { name: "Connectors" }).closest("section")
    expect(connectorsPanel).not.toBeNull()

    fireEvent.click(within(connectorsPanel as HTMLElement).getByRole("button", { name: "Diagnose" }))
    expect(onDiagnoseInstalledPluginConnector).toHaveBeenCalledWith("docs", "docs-api")

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }))
    expect(onDeleteInstalledPluginConnectorApiKey).toHaveBeenCalledWith("docs", "docs-api")
  })

  it("shows installed plugin diagnostics", () => {
    render(
      <PluginsPage
        {...createProps({
          activePluginID: "filesystem",
          installedPlugins: [createInstalledPlugin()],
          pluginDiagnostics: {
            filesystem: createDiagnostic({
              toolNames: ["read_file", "write_file"],
              toolCount: 2,
            }),
          },
          pluginDraft: {
            pluginID: "filesystem",
            config: {
              ROOT_PATH: "C:\\Projects",
            },
            appApiKeys: {},
          },
        })}
      />,
    )

    expect(screen.getByText("Diagnostics passed. Tools: read_file, write_file")).toBeInTheDocument()
  })
})
