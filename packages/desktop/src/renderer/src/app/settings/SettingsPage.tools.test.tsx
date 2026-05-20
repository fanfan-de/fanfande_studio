import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ComponentProps } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { I18nProvider } from "../i18n/I18nProvider"
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
    connectorId: "",
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
    catalog: [],
    colorMode: "system",
    deletingArchivedSessionID: null,
    deletingMcpServerID: null,
    deletingProviderID: null,
    isActivityRailVisible: true,
    isAgentDebugTraceEnabled: false,
    isDebugLineColorsEnabled: false,
    isDebugUiRegionsEnabled: false,
    isLoading: false,
    isLoadingArchivedSessions: false,
    isOpen: true,
    isRefreshingProviderCatalog: false,
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
    onLoadArchivedSessions: vi.fn(),
    onRefreshProviderCatalog: vi.fn(),
    onRestoreArchivedSession: vi.fn(),
    onSaveMcpServer: vi.fn(),
    onSaveProvider: vi.fn(),
    onSaveProviderApiKey: vi.fn(),
    onSelectionChange: vi.fn(),
    onStartNewMcpServer: vi.fn(),
    onStartProviderAuthFlow: vi.fn(),
    providerDrafts: {},
    restoringArchivedSessionID: null,
    savingMcpServerID: null,
    savingProviderID: null,
    selectionDraft: {
      model: null,
      smallModel: null,
      imageModel: null,
      imageDefaultSize: null,
      imageDefaultCount: null,
    },
    ...overrides,
  } as ComponentProps<typeof SettingsPage>
}

function createProvider(id: string, name: string): ComponentProps<typeof SettingsPage>["catalog"][number] {
  return {
    id,
    name,
    source: "config",
    env: [],
    configured: true,
    available: true,
    apiKeyConfigured: true,
    modelCount: 1,
    authCapabilities: [],
    authScope: "global",
    authState: {
      providerID: id,
      scope: "global",
      status: "connected",
      capabilities: [],
      credentials: [],
    },
  }
}

function createModel(
  providerID: string,
  id: string,
  name: string,
  input?: {
    family?: string
    imageOutput?: boolean
    reasoning?: boolean
  },
): ComponentProps<typeof SettingsPage>["models"][number] {
  return {
    id,
    providerID,
    name,
    family: input?.family,
    status: "active",
    available: true,
    capabilities: {
      temperature: true,
      reasoning: input?.reasoning ?? false,
      attachment: false,
      toolcall: true,
      input: {
        text: true,
        audio: false,
        image: false,
        video: false,
        pdf: false,
      },
      output: {
        text: true,
        audio: false,
        image: input?.imageOutput ?? false,
        video: false,
        pdf: false,
      },
    },
    limit: {
      context: 128000,
      output: 8192,
    },
  }
}

describe("SettingsPage built-in tools", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
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

  it("does not render built-in tools inside settings", () => {
    render(<SettingsPage {...createSettingsPageProps()} />)

    expect(screen.queryByRole("button", { name: "Tools" })).not.toBeInTheDocument()
    expect(screen.queryByText("Global tool availability")).not.toBeInTheDocument()
  })

  it("opens the monitor app from developer mode settings", async () => {
    const openMonitorWindow = vi.fn().mockResolvedValue({
      ok: true,
      reused: false,
      source: "file",
    })
    setDesktopMock({ openMonitorWindow })

    render(<SettingsPage {...createSettingsPageProps()} />)

    fireEvent.click(screen.getByRole("button", { name: "Developer Mode" }))
    fireEvent.click(screen.getByRole("button", { name: "Open monitor" }))

    await waitFor(() => {
      expect(openMonitorWindow).toHaveBeenCalledTimes(1)
    })
  })

  it("switches the display language from general settings", async () => {
    window.localStorage.setItem("desktop.locale", "en-US")
    const saveLocaleConfig = vi.fn().mockResolvedValue({
      path: "locale-settings.json",
      exists: true,
      document: {
        version: 1,
        locale: "zh-CN",
        updatedAt: 1,
      },
    })

    setDesktopMock({
      getLocaleConfig: vi.fn().mockResolvedValue({
        path: "locale-settings.json",
        exists: true,
        document: {
          version: 1,
          locale: "en-US",
          updatedAt: 1,
        },
      }),
      saveLocaleConfig,
    })

    render(
      <I18nProvider>
        <SettingsPage {...createSettingsPageProps()} />
      </I18nProvider>,
    )

    expect(await screen.findByRole("heading", { name: "Display Language" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "General" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "About" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Appearance" }))
    expect(screen.queryByRole("heading", { name: "Display Language" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "General" }))

    fireEvent.click(screen.getByRole("radio", { name: /中文/ }))

    await waitFor(() => {
      expect(saveLocaleConfig).toHaveBeenCalledWith({
        document: expect.objectContaining({
          locale: "zh-CN",
          version: 1,
        }),
      })
    })
    expect(await screen.findByRole("heading", { name: "显示语言" })).toBeInTheDocument()
  })

  it("selects the primary model through the provider model picker", () => {
    const onSelectionChange = vi.fn()

    render(
      <SettingsPage
        {...createSettingsPageProps({
          catalog: [createProvider("deepseek", "DeepSeek"), createProvider("openai", "OpenAI")],
          models: [
            createModel("deepseek", "deepseek-reasoner", "DeepSeek Reasoner", { reasoning: true }),
            createModel("openai", "gpt-4o-mini", "GPT-4o mini"),
          ],
          onSelectionChange,
          selectionDraft: {
            model: "deepseek/deepseek-reasoner",
            smallModel: null,
            imageModel: null,
            imageDefaultSize: null,
            imageDefaultCount: null,
          },
        })}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Models" }))
    fireEvent.click(screen.getByRole("button", { name: "Primary model: DeepSeek / DeepSeek Reasoner" }))

    const picker = screen.getByRole("dialog", { name: "Primary model model picker" })
    const providerList = within(picker).getByRole("listbox", { name: "Primary model providers" })
    const modelList = within(picker).getByRole("listbox", { name: "Primary model models" })
    expect(within(providerList).getByRole("option", { name: /DeepSeek/ })).toHaveAttribute("aria-selected", "true")
    expect(within(modelList).getByRole("option", { name: "DeepSeek Reasoner" })).toHaveAttribute(
      "aria-selected",
      "true",
    )

    fireEvent.change(within(picker).getByRole("searchbox", { name: "Search providers or models" }), {
      target: {
        value: "openai",
      },
    })

    expect(within(providerList).queryByRole("option", { name: /DeepSeek/ })).not.toBeInTheDocument()
    fireEvent.click(within(modelList).getByRole("option", { name: "GPT-4o mini" }))
    expect(onSelectionChange).toHaveBeenCalledWith("model", "openai/gpt-4o-mini")
  })

  it("uses the picker for small models and filters image generation models", () => {
    const onSelectionChange = vi.fn()

    render(
      <SettingsPage
        {...createSettingsPageProps({
          catalog: [createProvider("deepseek", "DeepSeek"), createProvider("openai", "OpenAI")],
          models: [
            createModel("deepseek", "deepseek-reasoner", "DeepSeek Reasoner", { reasoning: true }),
            createModel("openai", "gpt-4o-mini", "GPT-4o mini"),
            createModel("openai", "gpt-image-1", "GPT Image", { imageOutput: true }),
          ],
          onSelectionChange,
        })}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Models" }))
    expect(screen.queryByRole("button", { name: "Save model selection" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Small model: Use server default" }))
    fireEvent.click(screen.getByRole("option", { name: "DeepSeek Reasoner" }))
    expect(onSelectionChange).toHaveBeenCalledWith("smallModel", "deepseek/deepseek-reasoner")
    expect(screen.queryByRole("dialog", { name: "Small model model picker" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Image generation model: Not configured" }))
    const picker = screen.getByRole("dialog", { name: "Image generation model model picker" })
    const modelList = within(picker).getByRole("listbox", { name: "Image generation model models" })

    expect(within(modelList).getByRole("option", { name: "GPT Image" })).toBeInTheDocument()
    expect(within(modelList).queryByRole("option", { name: "GPT-4o mini" })).not.toBeInTheDocument()

    fireEvent.click(within(modelList).getByRole("option", { name: "GPT Image" }))
    expect(onSelectionChange).toHaveBeenCalledWith("imageModel", "openai/gpt-image-1")
  })
})
