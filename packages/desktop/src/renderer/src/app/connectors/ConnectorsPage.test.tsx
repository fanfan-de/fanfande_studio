import { fireEvent, render, screen } from "@testing-library/react"
import type { ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"
import { ConnectorsPage } from "./ConnectorsPage"

type ConnectorsPageProps = ComponentProps<typeof ConnectorsPage>
type ConnectorDefinition = ConnectorsPageProps["connectorCatalog"][number]
type ConnectorStatus = ConnectorsPageProps["connectorStatuses"][number]

function createConnector(overrides: Partial<ConnectorDefinition> = {}): ConnectorDefinition {
  return {
    id: overrides.id ?? "gmail",
    name: overrides.name ?? "Gmail",
    description: overrides.description ?? "Read and draft Gmail messages through a platform connector.",
    publisher: overrides.publisher ?? "Anybox",
    icon: overrides.icon,
    risk: overrides.risk ?? "medium",
    permissions: overrides.permissions ?? ["Read Gmail metadata"],
    tools: overrides.tools ?? [
      {
        name: "search_email_ids",
        title: "Search email",
        description: "Search Gmail messages.",
        readOnly: true,
      },
    ],
    configFields: overrides.configFields ?? [],
    oauthCallbackURL: overrides.oauthCallbackURL,
    credential: overrides.credential ?? {
      kind: "oauth",
      label: "Google account",
      clientID: "client",
      authorizationURL: "https://accounts.example.test/authorize",
      tokenURL: "https://accounts.example.test/token",
      scopes: ["gmail.readonly"],
    },
    runtime: overrides.runtime,
    installReview: overrides.installReview ?? ["Review requested OAuth scopes before connecting."],
    source: overrides.source ?? "platform",
    available: overrides.available ?? true,
    ...overrides,
  }
}

function createStatus(overrides: Partial<ConnectorStatus> = {}): ConnectorStatus {
  return {
    connectorID: overrides.connectorID ?? "connector:gmail:default",
    definitionID: overrides.definitionID ?? "gmail",
    name: overrides.name ?? "Gmail",
    connected: overrides.connected ?? true,
    available: overrides.available ?? true,
    configured: overrides.configured,
    configurationLabel: overrides.configurationLabel,
    authStatus: overrides.authStatus ?? "connected",
    credentialKind: overrides.credentialKind ?? "oauth",
    credentialLabel: overrides.credentialLabel ?? "Google account",
    email: overrides.email ?? "person@example.test",
    generatedMcpServerID: overrides.generatedMcpServerID ?? "connector.gmail.default",
    ...overrides,
  }
}

function createProps(overrides: Partial<ConnectorsPageProps> = {}): ConnectorsPageProps {
  return {
    activeConnectorID: "connector:gmail:default",
    connectorApiKeyDrafts: {},
    connectorCatalog: [createConnector()],
    connectorConfigDrafts: {},
    connectorStatuses: [createStatus()],
    connectorsError: null,
    diagnosingConnectorID: null,
    isLoading: false,
    message: null,
    savingConnectorID: null,
    onCancelConnectorAuthFlow: vi.fn(),
    onConnectorApiKeyDraftChange: vi.fn(),
    onConnectorConfigDraftChange: vi.fn(),
    onConnectorSelect: vi.fn(),
    onDeleteConnectorApiKey: vi.fn(),
    onDeleteConnectorConfig: vi.fn(),
    onDeleteConnectorAuthSession: vi.fn(),
    onDiagnoseConnector: vi.fn(),
    onDismissMessage: vi.fn(),
    onSaveConnectorApiKey: vi.fn(),
    onSaveConnectorConfig: vi.fn(),
    onStartConnectorAuthFlow: vi.fn(),
    ...overrides,
  }
}

describe("ConnectorsPage", () => {
  it("renders platform connector status and OAuth actions", () => {
    const onStartConnectorAuthFlow = vi.fn()
    const onDeleteConnectorAuthSession = vi.fn()
    const onDiagnoseConnector = vi.fn()

    render(
      <ConnectorsPage
        {...createProps({
          onStartConnectorAuthFlow,
          onDeleteConnectorAuthSession,
          onDiagnoseConnector,
        })}
      />,
    )

    expect(screen.getByLabelText("Connectors top menu")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Gmail Connected" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Gmail", level: 1 })).toBeInTheDocument()
    expect(screen.getByText("person@example.test")).toBeInTheDocument()
    expect(screen.getByText("connector.gmail.default")).toBeInTheDocument()
    expect(screen.getByText("Managed by Anybox")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Reconnect" }))
    expect(onStartConnectorAuthFlow).toHaveBeenCalledWith("connector:gmail:default")

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }))
    expect(onDeleteConnectorAuthSession).toHaveBeenCalledWith("connector:gmail:default")

    fireEvent.click(screen.getByRole("button", { name: "Diagnose" }))
    expect(onDiagnoseConnector).toHaveBeenCalledWith("connector:gmail:default")
  })

  it("edits API-key connector drafts and saves the selected connector", () => {
    const onConnectorApiKeyDraftChange = vi.fn()
    const onSaveConnectorApiKey = vi.fn()
    const docsConnector = createConnector({
      id: "docs",
      name: "Docs API",
      credential: {
        kind: "api_key",
        key: "DOCS_API_KEY",
        label: "Docs API key",
        type: "password",
        secret: true,
      },
    })

    render(
      <ConnectorsPage
        {...createProps({
          activeConnectorID: "connector:docs:default",
          connectorApiKeyDrafts: {
            "connector:docs:default": "sk-test",
          },
          connectorCatalog: [docsConnector],
          connectorStatuses: [
            createStatus({
              connectorID: "connector:docs:default",
              definitionID: "docs",
              name: "Docs API",
              connected: false,
              authStatus: "not_connected",
              credentialKind: "api_key",
              credentialLabel: "Docs API key",
              generatedMcpServerID: "connector.docs.default",
            }),
          ],
          onConnectorApiKeyDraftChange,
          onSaveConnectorApiKey,
        })}
      />,
    )

    fireEvent.change(screen.getByLabelText("Docs API key"), {
      target: {
        value: "sk-next",
      },
    })
    expect(onConnectorApiKeyDraftChange).toHaveBeenCalledWith("connector:docs:default", "sk-next")

    fireEvent.click(screen.getByRole("button", { name: "Update key" }))
    expect(onSaveConnectorApiKey).toHaveBeenCalledWith("connector:docs:default")
  })

  it("edits custom app connector credentials before OAuth sign-in", () => {
    const onConnectorConfigDraftChange = vi.fn()
    const onSaveConnectorConfig = vi.fn()
    const onStartConnectorAuthFlow = vi.fn()
    const feishuConnector = createConnector({
      id: "feishu",
      name: "Feishu",
      configFields: [
        {
          key: "FEISHU_APP_ID",
          label: "Feishu App ID",
          type: "text",
          required: true,
        },
        {
          key: "FEISHU_APP_SECRET",
          label: "Feishu App Secret",
          type: "password",
          required: true,
          secret: true,
        },
      ],
      oauthCallbackURL: "http://localhost:1455/auth/callback",
      credential: {
        kind: "oauth",
        label: "Feishu Custom App",
        clientIDConfigKey: "FEISHU_APP_ID",
        clientSecretConfigKey: "FEISHU_APP_SECRET",
        authorizationURL: "https://accounts.feishu.cn/open-apis/authen/v1/authorize",
        tokenURL: "https://open.feishu.cn/open-apis/authen/v2/oauth/token",
        scopes: ["offline_access"],
        tokenEndpointAuthMethod: "client_secret_post",
        tokenRequestFormat: "json",
      },
    })

    render(
      <ConnectorsPage
        {...createProps({
          activeConnectorID: "connector:feishu:default",
          connectorCatalog: [feishuConnector],
          connectorConfigDrafts: {
            "connector:feishu:default": {
              FEISHU_APP_ID: "cli_existing",
              FEISHU_APP_SECRET: "",
            },
          },
          connectorStatuses: [
            createStatus({
              connectorID: "connector:feishu:default",
              definitionID: "feishu",
              name: "Feishu",
              connected: false,
              configured: false,
              authStatus: "not_connected",
              credentialLabel: undefined,
              email: undefined,
              generatedMcpServerID: "connector.feishu.default",
            }),
          ],
          onConnectorConfigDraftChange,
          onSaveConnectorConfig,
          onStartConnectorAuthFlow,
        })}
      />,
    )

    expect(screen.getByText("http://localhost:1455/auth/callback")).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Feishu App ID"), {
      target: {
        value: "cli_next",
      },
    })
    expect(onConnectorConfigDraftChange).toHaveBeenCalledWith("connector:feishu:default", "FEISHU_APP_ID", "cli_next")

    fireEvent.click(screen.getByRole("button", { name: "Save credentials" }))
    expect(onSaveConnectorConfig).toHaveBeenCalledWith("connector:feishu:default")

    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled()
    expect(onStartConnectorAuthFlow).not.toHaveBeenCalled()
  })

})
