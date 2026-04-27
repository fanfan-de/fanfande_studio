import { fireEvent, render, screen } from "@testing-library/react"
import type { ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"
import { DEFAULT_ASSISTANT_TRACE_VISIBILITY, type McpServerDraftState } from "../types"
import { SettingsPage } from "./SettingsPage"

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
        id: "exec_command",
        title: "Bash",
        description: "Run a bash command inside the current project boundary.",
        aliases: ["bash", "exec-command"],
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
    deletingPromptPresetID: null,
    deletingProviderID: null,
    isActivityRailVisible: true,
    isAgentDebugTraceEnabled: false,
    isBuiltinToolSelectionDirty: true,
    isCreatingPromptPreset: false,
    isDebugLineColorsEnabled: false,
    isDebugUiRegionsEnabled: false,
    isLoading: false,
    isLoadingArchivedSessions: false,
    isLoadingBuiltinTools: false,
    isLoadingPromptPreset: false,
    isLoadingPrompts: false,
    isOpen: true,
    isPlanModePromptPresetDirty: false,
    isPromptDirty: false,
    isRefreshingProviderCatalog: false,
    isSavingBuiltinTools: false,
    isSavingPromptPresetSelection: false,
    isSavingSelection: false,
    isSystemPromptPresetDirty: false,
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
    onCreatePromptPreset: vi.fn(),
    onDebugLineColorsChange: vi.fn(),
    onDebugUiRegionsChange: vi.fn(),
    onDeleteArchivedSession: vi.fn(),
    onDeleteMcpServer: vi.fn(),
    onDeletePromptPreset: vi.fn(),
    onDeleteProvider: vi.fn(),
    onDeleteProviderAuthSession: vi.fn(),
    onMcpServerDraftChange: vi.fn(),
    onMcpServerSelect: vi.fn(),
    onPromptDraftChange: vi.fn(),
    onPromptDraftLabelChange: vi.fn(),
    onPromptPresetSelect: vi.fn(),
    onPromptPresetSelectionChange: vi.fn(),
    onRefreshProviderCatalog: vi.fn(),
    onResetBuiltinTools: vi.fn(),
    onResetPromptPreset: vi.fn(),
    onRestoreArchivedSession: vi.fn(),
    onSaveBuiltinTools: vi.fn(),
    onSaveMcpServer: vi.fn(),
    onSavePromptPreset: vi.fn(),
    onSavePromptPresetSelection: vi.fn(),
    onSaveProvider: vi.fn(),
    onSaveProviderApiKey: vi.fn(),
    onSaveSelection: vi.fn(),
    onSelectionChange: vi.fn(),
    onStartNewMcpServer: vi.fn(),
    onStartProviderAuthFlow: vi.fn(),
    projectID: null,
    projectName: null,
    projectWorktree: null,
    promptDraftContent: "",
    promptDraftLabel: "",
    promptLoadError: null,
    promptPresets: [],
    promptPresetSelection: null,
    providerDrafts: {},
    resettingPromptPresetID: null,
    restoringArchivedSessionID: null,
    savedSelection: {
      model: null,
      smallModel: null,
    },
    savingMcpServerID: null,
    savingPromptPresetID: null,
    savingPromptPresetSelectionField: null,
    savingProviderID: null,
    selectedPromptPreset: null,
    selectionDraft: {
      model: null,
      smallModel: null,
    },
    ...overrides,
  } as ComponentProps<typeof SettingsPage>
}

describe("SettingsPage built-in tools", () => {
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
    expect(screen.getByText("Bash")).toBeInTheDocument()
    expect(screen.getByText("Shell access")).toBeInTheDocument()
    expect(screen.getByText("Read File")).toBeInTheDocument()
    expect(screen.getByText("Read-only")).toBeInTheDocument()

    const bashCard = screen.getByText("exec_command").closest("button")
    expect(bashCard).not.toBeNull()
    fireEvent.click(bashCard!)
    expect(onBuiltinToolToggle).toHaveBeenCalledWith("exec_command", false)

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))
    expect(onSaveBuiltinTools).toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Reset to default" }))
    expect(onResetBuiltinTools).toHaveBeenCalled()
  })
})
