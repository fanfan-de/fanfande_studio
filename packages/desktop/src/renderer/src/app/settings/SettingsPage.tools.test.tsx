import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ComponentProps } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_ASSISTANT_TRACE_VISIBILITY, type McpServerDraftState } from "../types"
import { SettingsPage } from "./SettingsPage"

function setDesktopMock(value: unknown) {
  Object.defineProperty(window, "desktop", {
    configurable: true,
    writable: true,
    value,
  })
}

function createMcpDraft(): McpServerDraftState {
  return {
    id: "",
    name: "",
    transport: "stdio",
    command: "",
    args: "",
    env: "",
    cwd: "",
    serverUrl: "",
    authorization: "",
    headers: "",
    allowedToolsMode: "all",
    allowedToolNames: "",
    toolPolicies: {},
    enabled: true,
    timeoutMs: "",
  }
}

function createSettingsPageProps(
  overrides: Partial<ComponentProps<typeof SettingsPage>> = {},
): ComponentProps<typeof SettingsPage> {
  return {
    activeMcpServerDiagnostic: null,
    activeMcpServerID: null,
    appearanceConfigError: null,
    appearanceConfigPath: null,
    appearanceConfigPreview: "{}",
    appearanceOverrides: {},
    appearanceTokenValues: {} as ComponentProps<typeof SettingsPage>["appearanceTokenValues"],
    archivedSessions: [],
    archivedSessionsError: null,
    assistantTraceVisibility: DEFAULT_ASSISTANT_TRACE_VISIBILITY,
    brandTheme: "sage",
    builtinTools: [
      {
        id: "git_bash_command",
        title: "Git Bash",
        description: "Run a Git Bash/MSYS Bash command inside the current project boundary.",
        aliases: [],
        capabilities: {
          kind: "exec",
          readOnly: false,
          destructive: true,
          concurrency: "exclusive",
          needsShell: true,
        },
        enabled: true,
      },
      {
        id: "read-file",
        title: "Read File",
        description: "Read a text file or a line range from the current project.",
        aliases: [],
        capabilities: {
          kind: "read",
          readOnly: true,
          destructive: false,
          concurrency: "safe",
        },
        enabled: false,
      },
    ],
    builtinToolsError: null,
    catalog: [],
    colorMode: "system",
    deletingArchivedSessionID: null,
    deletingMcpServerID: null,
    deletingProviderID: null,
    isActivityRailVisible: true,
    isAgentDebugTraceEnabled: false,
    isBuiltinToolSelectionDirty: true,
    isDebugLineColorsEnabled: false,
    isDebugUiRegionsEnabled: false,
    isLoading: false,
    isLoadingArchivedSessions: false,
    isLoadingBuiltinTools: false,
    isOpen: true,
    isRefreshingProviderCatalog: false,
    isSavingBuiltinTools: false,
    isSavingSelection: false,
    loadError: null,
    mcpServerDraft: createMcpDraft(),
    mcpServers: [],
    message: null,
    models: [],
    onActivityRailVisibilityChange: vi.fn(),
    onAgentDebugTraceChange: vi.fn(),
    onAppearancePaletteReset: vi.fn(),
    onAppearanceTokenChange: vi.fn(),
    onAppearanceTokenReset: vi.fn(),
    onAssistantTraceVisibilityChange: vi.fn(),
    onBrandThemeChange: vi.fn(),
    onBuiltinToolToggle: vi.fn(),
    onCancelProviderAuthFlow: vi.fn(),
    onClose: vi.fn(),
    onColorModeChange: vi.fn(),
    onDebugLineColorsChange: vi.fn(),
    onDebugUiRegionsChange: vi.fn(),
    onDismissMessage: vi.fn(),
    onDeleteArchivedSession: vi.fn(),
    onDeleteMcpServer: vi.fn(),
    onDeleteProvider: vi.fn(),
    onDeleteProviderAuthSession: vi.fn(),
    onMcpServerDraftChange: vi.fn(),
    onMcpToolPolicyChange: vi.fn(),
    onMcpServerSelect: vi.fn(),
    onRefreshProviderCatalog: vi.fn(),
    onResetBuiltinTools: vi.fn(),
    onRestoreArchivedSession: vi.fn(),
    onSaveBuiltinTools: vi.fn(),
    onSaveMcpServer: vi.fn(),
    onSaveProvider: vi.fn(),
    onSaveProviderApiKey: vi.fn(),
    onSaveSelection: vi.fn(),
    onSelectionChange: vi.fn(),
    onStartNewMcpServer: vi.fn(),
    onStartProviderAuthFlow: vi.fn(),
    providerDrafts: {},
    restoringArchivedSessionID: null,
    savedSelection: {
      model: null,
      smallModel: null,
    },
    savingMcpServerID: null,
    savingProviderID: null,
    selectionDraft: {
      model: null,
      smallModel: null,
    },
    ...overrides,
  } as ComponentProps<typeof SettingsPage>
}

describe("SettingsPage built-in tools", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete (window as typeof window & { desktop?: unknown }).desktop
  })

  it("renders about update controls and saves the automatic update setting", async () => {
    const getAppUpdateSettings = vi.fn().mockResolvedValue({
      version: "1.2.3",
      automaticUpdates: true,
      updateChecksSupported: true,
    })
    const checkForAppUpdates = vi.fn().mockResolvedValue({ ok: true })
    const setAutomaticUpdatesEnabled = vi.fn().mockResolvedValue({
      version: "1.2.3",
      automaticUpdates: false,
      updateChecksSupported: true,
    })

    setDesktopMock({
      getAppUpdateSettings,
      checkForAppUpdates,
      setAutomaticUpdatesEnabled,
    })

    render(<SettingsPage {...createSettingsPageProps()} />)

    expect(await screen.findByText("Version 1.2.3")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Check for updates" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }))
    await waitFor(() => expect(checkForAppUpdates).toHaveBeenCalledTimes(1))

    const automaticUpdatesSwitch = screen.getByRole("switch", { name: /Automatic updates/i })
    expect(automaticUpdatesSwitch).toHaveAttribute("aria-checked", "true")

    fireEvent.click(automaticUpdatesSwitch)
    await waitFor(() => expect(setAutomaticUpdatesEnabled).toHaveBeenCalledWith({ enabled: false }))
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: /Automatic updates/i })).toHaveAttribute("aria-checked", "false"),
    )
  })

  it("renders a dismiss button for settings messages", () => {
    const onDismissMessage = vi.fn()

    render(
      <SettingsPage
        {...createSettingsPageProps({
          message: {
            tone: "success",
            text: "Provider catalog refreshed.",
          },
          onDismissMessage,
        })}
      />,
    )

    expect(screen.getByText("Provider catalog refreshed.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Dismiss settings message" }))
    expect(onDismissMessage).toHaveBeenCalledTimes(1)
  })

  it("renders built-in tools, toggles selection, saves, and resets", () => {
    const onBuiltinToolToggle = vi.fn()
    const onSaveBuiltinTools = vi.fn()
    const onResetBuiltinTools = vi.fn()

    render(
      <SettingsPage
        {...createSettingsPageProps({
          onBuiltinToolToggle,
          onResetBuiltinTools,
          onSaveBuiltinTools,
        })}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Tools" }))

    expect(screen.getByText("Global tool availability")).toBeInTheDocument()
    expect(screen.getByText("1 of 2 built-in tools enabled.")).toBeInTheDocument()
    expect(screen.getByText("Git Bash")).toBeInTheDocument()
    expect(screen.getByText("Shell access")).toBeInTheDocument()
    expect(screen.getByText("Read File")).toBeInTheDocument()
    expect(screen.getByText("Read-only")).toBeInTheDocument()

    const bashCard = screen.getByText("git_bash_command").closest("button")
    expect(bashCard).not.toBeNull()
    fireEvent.click(bashCard!)
    expect(onBuiltinToolToggle).toHaveBeenCalledWith("git_bash_command", false)

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))
    expect(onSaveBuiltinTools).toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Reset to default" }))
    expect(onResetBuiltinTools).toHaveBeenCalled()
  })
})
