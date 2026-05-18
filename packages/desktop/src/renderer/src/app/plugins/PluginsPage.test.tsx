import { fireEvent, render, screen } from "@testing-library/react"
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
    longDescription: overrides.longDescription,
    version: overrides.version ?? "1.0.0",
    publisher: overrides.publisher ?? "Fanfande",
    category: overrides.category ?? "Code",
    iconUrl: overrides.iconUrl,
    thumbnailUrl: overrides.thumbnailUrl,
    heroImageUrl: overrides.heroImageUrl,
    screenshots: overrides.screenshots ?? [],
    tags: overrides.tags ?? [],
    brandColor: overrides.brandColor,
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
    onPluginDeselect: vi.fn(),
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

    fireEvent.click(screen.getByRole("button", { name: "Install Filesystem" }))
    expect(onInstallPlugin).toHaveBeenCalledWith("filesystem")
  })

  it("opens selected plugin details as a second-level view and returns to the marketplace", () => {
    const onInstallPlugin = vi.fn()
    const onPluginDeselect = vi.fn()
    const onPluginSelect = vi.fn()
    const { rerender } = render(
      <PluginsPage
        {...createProps({
          onInstallPlugin,
          onPluginDeselect,
          onPluginSelect,
        })}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Filesystem not installed" }))
    expect(onPluginSelect).toHaveBeenCalledWith("filesystem")

    rerender(
      <PluginsPage
        {...createProps({
          activePluginID: "filesystem",
          onInstallPlugin,
          onPluginDeselect,
          onPluginSelect,
        })}
      />,
    )

    expect(screen.queryByRole("region", { name: "Plugin marketplace layout" })).not.toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Selected plugin details" })).toBeInTheDocument()
    expect(screen.getByRole("navigation", { name: "Plugin detail breadcrumb" })).toHaveTextContent("插件")
    expect(screen.getByRole("heading", { name: "Filesystem", level: 1 })).toBeInTheDocument()
    const installButton = screen.getByRole("button", { name: "Install Filesystem" })
    expect(installButton.closest(".plugins-detail-actions")).not.toBeNull()
    fireEvent.click(installButton)
    expect(onInstallPlugin).toHaveBeenCalledWith("filesystem")

    fireEvent.click(screen.getByRole("button", { name: "插件" }))
    expect(onPluginDeselect).toHaveBeenCalledTimes(1)
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

    fireEvent.change(screen.getByLabelText("Category"), {
      target: {
        value: "Docs",
      },
    })
    expect(screen.getByRole("button", { name: "Docs not installed" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Docs not installed" }))
    expect(onPluginSelect).toHaveBeenCalledWith("docs")
  })

  it("renders rich marketplace metadata in plugin details", () => {
    const imageUrl = "https://cdn.example.test/filesystem.png"
    render(
      <PluginsPage
        {...createProps({
          activePluginID: "filesystem",
          pluginCatalog: [
            createPlugin({
              longDescription: "A longer plugin marketplace description.",
              tags: ["files", "local"],
              thumbnailUrl: imageUrl,
              heroImageUrl: imageUrl,
              screenshots: [imageUrl],
              brandColor: "#112233",
            }),
          ],
        })}
      />,
    )

    expect(screen.getByText("A longer plugin marketplace description.")).toBeInTheDocument()
    expect(screen.getByText("files")).toBeInTheDocument()
    expect(screen.getByText("local")).toBeInTheDocument()
    expect(screen.getByAltText("Filesystem screenshot 1")).toHaveAttribute("src", imageUrl)
    expect(screen.getByText("#112233")).toBeInTheDocument()
  })

  it("hides legacy management panels from selected plugin details", () => {
    const plugin = createDocsPlugin()
    const installed = createInstalledPlugin({
      pluginID: "docs",
      mcpServerID: "plugin.docs.app.docs-api",
      mcpServerIDs: ["plugin.docs.app.docs-api"],
      skillIDs: ["plugin:docs:review"],
      connectorIDs: ["plugin-app:docs:docs-api"],
      config: {},
    })
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
          pluginDiagnostics: {
            docs: createDiagnostic({
              serverID: "plugin.docs.app.docs-api",
              toolNames: ["search_docs"],
            }),
          },
        })}
      />,
    )

    expect(screen.getByRole("region", { name: "Selected plugin details" })).toBeInTheDocument()
    const installedStatus = screen.getByLabelText("Docs installed")
    expect(installedStatus).toHaveTextContent("Installed")
    expect(installedStatus.closest(".plugins-detail-actions")).not.toBeNull()
    expect(screen.getByText("Docs API")).toBeInTheDocument()
    expect(screen.getByText("Review Docs")).toBeInTheDocument()

    expect(screen.queryByText("Manage Plugin")).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Tools Preview" })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Included Capabilities" })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "MCP Bindings" })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Install Review" })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Connectors" })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Plugin Values" })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Docs API key/)).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Update key" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Diagnose" })).not.toBeInTheDocument()
    expect(screen.queryByText("Connector reachable. Tools: search_docs")).not.toBeInTheDocument()
  })
})
