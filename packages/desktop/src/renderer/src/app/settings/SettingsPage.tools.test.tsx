import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ComponentProps } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { DesktopAppUpdateState } from "../../../../shared/desktop-ipc-contract"
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

function createAppUpdateState(overrides: Partial<DesktopAppUpdateState> = {}): DesktopAppUpdateState {
  return {
    phase: "idle",
    version: "1.2.3",
    automaticUpdates: true,
    updateChecksSupported: true,
    latestVersion: null,
    downloadPercent: null,
    error: null,
    lastCheckedAt: null,
    releaseNotes: null,
    ...overrides,
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
    fontFamily: "default",
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
    appUpdateState: createAppUpdateState(),
    appUpdateStatus: null,
    isCheckingAppUpdate: false,
    isSavingAutomaticUpdates: false,
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
    onAutomaticUpdatesToggle: vi.fn(),
    onAssistantTraceVisibilityChange: vi.fn(),
    onBrandThemeChange: vi.fn(),
    onCancelProviderAuthFlow: vi.fn(),
    onCheckForUpdates: vi.fn(),
    onClose: vi.fn(),
    onColorModeChange: vi.fn(),
    onFontFamilyChange: vi.fn(),
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
    onOpenUpdateCenter: vi.fn(),
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
      reasoningEffort: null,
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
    const onAutomaticUpdatesToggle = vi.fn()
    const onCheckForUpdates = vi.fn()

    render(<SettingsPage {...createSettingsPageProps({ onAutomaticUpdatesToggle, onCheckForUpdates })} />)

    expect(screen.getByText("Version 1.2.3")).toBeInTheDocument()
    expect(screen.getByText("Installer version: 1.2.3")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Read release notes" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Check for updates" })).toBeInTheDocument()

    const automaticUpdatesSwitch = screen.getByRole("switch", { name: /Automatic updates/i })
    expect(automaticUpdatesSwitch).toHaveAttribute("aria-checked", "true")

    fireEvent.click(automaticUpdatesSwitch)
    expect(onAutomaticUpdatesToggle).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }))
    expect(onCheckForUpdates).toHaveBeenCalledTimes(1)
  })

  it("does not expose a duplicate dedicated updates settings section", () => {
    render(<SettingsPage {...createSettingsPageProps()} />)

    expect(screen.queryByRole("button", { name: "Updates" })).not.toBeInTheDocument()
    expect(screen.getByText("Version 1.2.3")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Check for updates" })).toBeInTheDocument()
    expect(screen.getByRole("switch", { name: /Automatic updates/i })).toBeInTheDocument()
  })

  it("routes downloaded update entry points to the global update center", () => {
    const onOpenUpdateCenter = vi.fn()

    render(
      <SettingsPage
        {...createSettingsPageProps({
          appUpdateState: createAppUpdateState({
            phase: "downloaded",
            latestVersion: "1.2.4",
            downloadPercent: 100,
            lastCheckedAt: 1,
            releaseNotes: "Improved update experience.",
          }),
          onOpenUpdateCenter,
        })}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /Open update center/i }))
    expect(onOpenUpdateCenter).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole("button", { name: /Read release notes/i }))
    expect(onOpenUpdateCenter).toHaveBeenCalledTimes(2)
  })

  it("scrolls the active settings section back to the top when its nav item is clicked again", () => {
    const { container } = render(<SettingsPage {...createSettingsPageProps()} />)
    const overlay = container.querySelector(".settings-page-overlay") as HTMLElement | null
    const mainPanel = container.querySelector(".settings-page-main") as HTMLDivElement | null
    expect(overlay).not.toBeNull()
    expect(mainPanel).not.toBeNull()

    overlay!.scrollTop = 80
    mainPanel!.scrollTop = 120
    fireEvent.click(screen.getByRole("button", { name: "General" }))

    expect(overlay!.scrollTop).toBe(0)
    expect(mainPanel!.scrollTop).toBe(0)
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
    fireEvent.click(screen.getByRole("button", { name: /Agent Monitor/ }))
    fireEvent.click(screen.getByRole("button", { name: "Open monitor" }))

    await waitFor(() => {
      expect(openMonitorWindow).toHaveBeenCalledTimes(1)
    })
  })

  it("keeps storage paths inside the developer mode storage disclosure", async () => {
    const getStoragePaths = vi.fn().mockResolvedValue({
      appData: "C:\\Users\\tester\\AppData\\Roaming\\anybox-desktop-agent",
      agentRoot: "C:\\Users\\tester\\AppData\\Roaming\\anybox-desktop-agent\\agent",
      agentData: "C:\\Users\\tester\\AppData\\Roaming\\anybox-desktop-agent\\agent\\data",
      installedPlugins: "C:\\Users\\tester\\AppData\\Roaming\\anybox-desktop-agent\\agent\\data\\plugins\\installed",
      pluginRegistryCache: "C:\\Users\\tester\\AppData\\Roaming\\anybox-desktop-agent\\agent\\data\\plugins\\registry-cache",
      agentCache: "C:\\Users\\tester\\AppData\\Roaming\\anybox-desktop-agent\\agent\\cache",
      pluginInstallTemp: "C:\\Users\\tester\\AppData\\Roaming\\anybox-desktop-agent\\agent\\cache\\plugin-installs",
    })
    setDesktopMock({ getStoragePaths })

    render(<SettingsPage {...createSettingsPageProps()} />)

    expect(screen.queryByText("Storage Locations")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Developer Mode" }))

    const storageDisclosure = screen.getByRole("button", { name: /Storage Locations/ })
    expect(storageDisclosure).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("Application data")).not.toBeInTheDocument()

    await waitFor(() => {
      expect(getStoragePaths).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(storageDisclosure)

    expect(await screen.findByText("Application data")).toBeInTheDocument()
    expect(screen.getByText("Plugin install temp")).toBeInTheDocument()
    expect(screen.getByTitle("C:\\Users\\tester\\AppData\\Roaming\\anybox-desktop-agent")).toBeInTheDocument()
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

    expect(await screen.findByRole("combobox", { name: "Display Language" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "General" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "About" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Appearance" }))
    expect(screen.queryByRole("combobox", { name: "Display Language" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "General" }))

    fireEvent.change(screen.getByRole("combobox", { name: "Display Language" }), {
      target: {
        value: "zh-CN",
      },
    })

    await waitFor(() => {
      expect(saveLocaleConfig).toHaveBeenCalledWith({
        document: expect.objectContaining({
          locale: "zh-CN",
          version: 1,
        }),
      })
    })
    expect(await screen.findByText("显示语言")).toBeInTheDocument()
  })

  it("selects the interface font from appearance settings", () => {
    const onFontFamilyChange = vi.fn()

    render(
      <SettingsPage
        {...createSettingsPageProps({
          fontFamily: "system",
          onFontFamilyChange,
        })}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Appearance" }))
    expect(screen.getByText("Interface Font")).toBeInTheDocument()

    fireEvent.change(screen.getByRole("combobox", { name: "Interface Font" }), {
      target: {
        value: "microsoft-yahei",
      },
    })

    expect(onFontFamilyChange).toHaveBeenCalledWith("microsoft-yahei")
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
            reasoningEffort: null,
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
