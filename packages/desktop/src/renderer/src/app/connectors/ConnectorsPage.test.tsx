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
    publisher: overrides.publisher ?? "Fanfande",
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
    connectorStatuses: [createStatus()],
    connectorsError: null,
    diagnosingConnectorID: null,
    isLoading: false,
    message: null,
    savingConnectorID: null,
    onCancelConnectorAuthFlow: vi.fn(),
    onConnectorApiKeyDraftChange: vi.fn(),
    onConnectorSelect: vi.fn(),
    onDeleteConnectorApiKey: vi.fn(),
    onDeleteConnectorAuthSession: vi.fn(),
    onDiagnoseConnector: vi.fn(),
    onDismissMessage: vi.fn(),
    onSaveConnectorApiKey: vi.fn(),
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
})
