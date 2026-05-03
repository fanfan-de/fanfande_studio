import type {
  AgentArchivedSessionDeleteResult,
  AgentArchivedSessionSummary,
  AgentBuiltinToolSelection,
  AgentBuiltinToolSummary,
  AgentBuiltinToolsPayload,
  AgentConfig,
  AgentFolderWorkspace,
  AgentGlobalSkillFileDocument,
  AgentGlobalSkillRenameResult,
  AgentGlobalSkillTree,
  AgentMcpServerDiagnostic,
  AgentMcpServerSummary,
  AgentInstalledPlugin,
  AgentPluginCatalogItem,
  AgentPluginConnectorStatus,
  AgentPluginDeleteResult,
  AgentPluginInstallInput,
  AgentPluginUpdateInput,
  AgentProjectDeleteResult,
  AgentProjectMcpSelection,
  AgentProjectModelSelection,
  AgentProjectModelsResult,
  AgentProjectSkillSelection,
  AgentProjectWorkspace,
  AgentPromptPresetDocument,
  AgentPromptPresetSelection,
  AgentPromptPresetSummary,
  AgentProviderAuthFlow,
  AgentProviderAuthState,
  AgentProviderCatalogItem,
  AgentProviderConnectionTestResult,
  AgentProviderModel,
  AgentPtySessionInfo,
  AgentSessionArchiveResult,
  AgentSessionBridgeIPCEvent,
  AgentSessionDeleteResult,
  AgentSessionDiffSummary,
  AgentSessionHistoryMessage,
  AgentSessionQuestionAnswerInput,
  AgentSessionQuestionAnswerResult,
  AgentSessionRuntimeDebugSnapshot,
  AgentSessionTurnRequestInput,
  AgentSideChatLink,
  AgentSkillInfo,
  AgentToolPermissionModePayload,
  AgentWorkspaceFileDocument,
  AgentWorkspaceFileSearchResult,
  AgentWorkspaceSession,
  MenuAnchor,
  MenuKey,
  PtyTransportIPCEvent,
  WindowAction,
} from "../main/types"
import type { AppearanceConfigDocument, AppearanceConfigSnapshot } from "./appearance"
import type {
  PermissionRequestPrompt,
  PermissionResolveInput,
  PermissionResolveResult,
} from "./permission"

export const DESKTOP_AGENT_SESSION_EVENT_CHANNEL = "desktop:agent-session-event"
export const DESKTOP_WORKSPACE_FILE_CHANGE_EVENT_CHANNEL = "desktop:workspace-file-change"
export const DESKTOP_PTY_EVENT_CHANNEL = "desktop:pty-event"
export const DESKTOP_WINDOW_STATE_EVENT_CHANNEL = "desktop:window-state-changed"

export type {
  AgentArchivedSessionDeleteResult,
  AgentArchivedSessionSummary,
  AgentBuiltinToolSelection,
  AgentBuiltinToolSummary,
  AgentBuiltinToolsPayload,
  AgentConfig,
  AgentFolderWorkspace,
  AgentGlobalSkillFileDocument,
  AgentGlobalSkillRenameResult,
  AgentGlobalSkillTree,
  AgentMcpServerDiagnostic,
  AgentMcpServerSummary,
  AgentInstalledPlugin,
  AgentPluginCatalogItem,
  AgentPluginConnectorStatus,
  AgentPluginDeleteResult,
  AgentPluginInstallInput,
  AgentPluginUpdateInput,
  AgentProjectDeleteResult,
  AgentProjectMcpSelection,
  AgentProjectModelSelection,
  AgentProjectModelsResult,
  AgentProjectSkillSelection,
  AgentProjectWorkspace,
  AgentPromptPresetDocument,
  AgentPromptPresetSelection,
  AgentPromptPresetSummary,
  AgentProviderAuthFlow,
  AgentProviderAuthState,
  AgentProviderCatalogItem,
  AgentProviderConnectionTestResult,
  AgentProviderModel,
  AgentPtySessionInfo,
  AgentSessionArchiveResult,
  AgentSessionBridgeIPCEvent,
  AgentSessionDeleteResult,
  AgentSessionDiffSummary,
  AgentSessionHistoryMessage,
  AgentSessionQuestionAnswerInput,
  AgentSessionQuestionAnswerResult,
  AgentSessionRuntimeDebugSnapshot,
  AgentSessionTurnRequestInput,
  AgentSideChatLink,
  AgentSkillInfo,
  AgentToolPermissionModePayload,
  AgentWorkspaceFileDocument,
  AgentWorkspaceFileSearchResult,
  AgentWorkspaceSession,
  AppearanceConfigDocument,
  AppearanceConfigSnapshot,
  MenuAnchor,
  MenuKey,
  PermissionRequestPrompt,
  PermissionResolveInput,
  PermissionResolveResult,
  WindowAction
}

export type AgentSessionSummary = AgentWorkspaceSession
export type ExternalEditorSummary = {
  id: string
  label: string
  executablePath: string
  iconPath?: string
  iconDataUrl?: string
}
export type GitActionResult = {
  directory: string
  root: string
  branch: string | null
  stdout: string
  stderr: string
  summary: string
  url?: string
}
export type GitCapabilityState = {
  enabled: boolean
  reason?: string
}
export type GitCapabilities = {
  directory: string
  root: string | null
  branch: string | null
  defaultBranch: string | null
  isGitRepo: boolean
  canCommit: GitCapabilityState
  canStageAllCommit: GitCapabilityState
  canPush: GitCapabilityState
  canCreatePullRequest: GitCapabilityState
  canCreateBranch: GitCapabilityState
}
export type GitBranchSummary = {
  name: string
  kind: "local" | "remote"
  current: boolean
}
export type WorkspaceDiffFileRestoreResult = {
  directory: string
  file: string
}
export type McpServerSummary = AgentMcpServerSummary
export type McpServerDiagnostic = AgentMcpServerDiagnostic
export type McpServerInput = AgentMcpServerSummary extends infer Server
  ? Server extends unknown
    ? Omit<Server, "id">
    : never
  : never
export type ProjectMcpSelection = AgentProjectMcpSelection
export type ProjectSkillSelection = AgentProjectSkillSelection
export type PluginCatalogItem = AgentPluginCatalogItem
export type InstalledPlugin = AgentInstalledPlugin
export type PluginConnectorStatus = AgentPluginConnectorStatus
export type PluginInstallInput = AgentPluginInstallInput
export type PluginUpdateInput = AgentPluginUpdateInput
export type PluginDeleteResult = AgentPluginDeleteResult
export type PtyIPCEvent = PtyTransportIPCEvent
export type PtySessionInfo = AgentPtySessionInfo
export type SkillInfo = AgentSkillInfo
export type WorkspaceFileChangeIPCEvent = {
  directory: string
  paths: string[]
}
export type WorkspaceFileDocument = AgentWorkspaceFileDocument
export type WorkspaceFileSearchResult = AgentWorkspaceFileSearchResult
export type GlobalSkillFileDocument = AgentGlobalSkillFileDocument
export type GlobalSkillTree = AgentGlobalSkillTree
export type PromptPresetDocument = AgentPromptPresetDocument
export type PromptPresetSelection = AgentPromptPresetSelection
export type PromptPresetSummary = AgentPromptPresetSummary
export type BuiltinToolSummary = AgentBuiltinToolSummary
export type BuiltinToolSelection = AgentBuiltinToolSelection
export type BuiltinToolsPayload = AgentBuiltinToolsPayload
export type ToolPermissionModePayload = AgentToolPermissionModePayload

export interface DesktopInfo {
  platform: string
  electron: string
  chrome: string
  node: string
}

export interface DesktopAppUpdateSettings {
  version: string
  automaticUpdates: boolean
  updateChecksSupported: boolean
}

export interface DesktopAppUpdateCheckResult {
  ok: boolean
  skipped?: boolean
  reason?: string
  error?: string
}

export interface DesktopWindowState {
  isMaximized: boolean
}

export interface DesktopAgentHealth {
  ok: boolean
  baseURL: string
  requestId?: string
  error?: string
}

export interface DesktopSessionMutationResult {
  session: AgentSessionSummary
  requestId?: string
}

export interface DesktopDeleteProjectWorkspaceResult extends AgentProjectDeleteResult {
  requestId?: string
}

export interface DesktopDeleteAgentSessionResult extends AgentSessionDeleteResult {
  requestId?: string
}

export interface DesktopArchiveAgentSessionResult extends AgentSessionArchiveResult {
  requestId?: string
}

export interface DesktopDeleteArchivedSessionResult extends AgentArchivedSessionDeleteResult {
  requestId?: string
}

export interface DesktopProviderMutationInput {
  name?: string
  env?: string[]
  options?: {
    apiKey?: string
    baseURL?: string
  }
}

export interface DesktopProviderMutationSummary {
  id: string
  name: string
  available: boolean
  apiKeyConfigured: boolean
  baseURL?: string
}

export interface DesktopProviderMutationResult {
  provider: DesktopProviderMutationSummary
  selection: AgentProjectModelSelection
}

export interface DesktopProviderDeleteResult {
  providerID: string
  selection: AgentProjectModelSelection
}

export interface DesktopProviderConnectionTestInput {
  providerID: string
  method?: string
  credentialMode?: "active" | "manual" | "environment"
  apiKey?: string | null
  baseURL?: string | null
}

export interface DesktopModelSelectionUpdateInput {
  model?: string | null
  small_model?: string | null
}

export interface DesktopAgentSessionTurnResult {
  clientTurnID: string
  requestId?: string
}

export interface DesktopAgentSessionCancelTurnResult {
  clientTurnID: string
  backendSessionID: string
  localRequestAborted: boolean
  backendCancelled: boolean
  backendCancelError?: string
}

export interface DesktopAgentSessionSubscriptionResult {
  backendSessionID: string
  lastEventID?: string
}

export interface DesktopAgentSessionUnsubscribeResult {
  backendSessionID: string
  removed: boolean
}

export interface DesktopIpcContract {
  "desktop:get-info": {
    input: void
    output: DesktopInfo
  }
  "desktop:get-app-update-settings": {
    input: void
    output: DesktopAppUpdateSettings
  }
  "desktop:set-automatic-updates-enabled": {
    input: { enabled: boolean }
    output: DesktopAppUpdateSettings
  }
  "desktop:check-for-app-updates": {
    input: void
    output: DesktopAppUpdateCheckResult
  }
  "desktop:get-window-state": {
    input: void
    output: DesktopWindowState
  }
  "desktop:get-appearance-config": {
    input: void
    output: AppearanceConfigSnapshot
  }
  "desktop:save-appearance-config": {
    input: { document: AppearanceConfigDocument }
    output: AppearanceConfigSnapshot
  }
  "desktop:window-action": {
    input: WindowAction
    output: void
  }
  "desktop:open-external-url": {
    input: { url: string }
    output: { ok: true; url: string }
  }
  "desktop:show-menu": {
    input: MenuKey | { menuKey: MenuKey; anchor?: MenuAnchor }
    output: void
  }
  "desktop:show-external-editor-menu": {
    input: { targetPath: string; anchor?: MenuAnchor }
    output: void
  }
  "desktop:list-external-editors-for-target": {
    input: { targetPath: string }
    output: ExternalEditorSummary[]
  }
  "desktop:open-in-external-editor": {
    input: { targetPath: string; editorID?: string }
    output: { ok: true; editor: ExternalEditorSummary; targetPath: string }
  }
  "desktop:get-agent-config": {
    input: void
    output: AgentConfig
  }
  "desktop:agent-health": {
    input: void
    output: DesktopAgentHealth
  }
  "desktop:list-folder-workspaces": {
    input: void
    output: AgentFolderWorkspace[]
  }
  "desktop:list-project-workspaces": {
    input: void
    output: AgentProjectWorkspace[]
  }
  "desktop:update-workspace-watch-directories": {
    input: { directories: string[] }
    output: { directories: string[] }
  }
  "desktop:create-pty-session": {
    input: { title?: string; cwd?: string; shell?: string; rows?: number; cols?: number } | undefined
    output: AgentPtySessionInfo
  }
  "desktop:get-pty-session": {
    input: { id: string }
    output: AgentPtySessionInfo
  }
  "desktop:update-pty-session": {
    input: { id: string; title?: string; rows?: number; cols?: number }
    output: AgentPtySessionInfo
  }
  "desktop:delete-pty-session": {
    input: { id: string }
    output: AgentPtySessionInfo
  }
  "desktop:attach-pty-session": {
    input: { id: string; cursor?: number }
    output: AgentPtySessionInfo
  }
  "desktop:detach-pty-session": {
    input: { id: string }
    output: boolean
  }
  "desktop:write-pty-input": {
    input: { id: string; data: string }
    output: void
  }
  "desktop:pick-project-directory": {
    input: void
    output: string | null
  }
  "desktop:pick-composer-attachments": {
    input: { allowImage?: boolean; allowPdf?: boolean } | undefined
    output: string[]
  }
  "desktop:git-get-capabilities": {
    input: { projectID: string; directory: string }
    output: GitCapabilities
  }
  "desktop:git-commit": {
    input: { projectID: string; directory: string; message: string; stageAll?: boolean }
    output: GitActionResult
  }
  "desktop:git-push": {
    input: { projectID: string; directory: string }
    output: GitActionResult
  }
  "desktop:git-create-branch": {
    input: { projectID: string; directory: string; name: string }
    output: GitActionResult
  }
  "desktop:git-list-branches": {
    input: { projectID: string; directory: string }
    output: GitBranchSummary[]
  }
  "desktop:git-checkout-branch": {
    input: { projectID: string; directory: string; name: string }
    output: GitActionResult
  }
  "desktop:git-create-pull-request": {
    input: { projectID: string; directory: string }
    output: GitActionResult
  }
  "desktop:create-project-workspace": {
    input: { directory: string }
    output: AgentProjectWorkspace
  }
  "desktop:open-folder-workspace": {
    input: { directory: string }
    output: AgentFolderWorkspace
  }
  "desktop:agent-create-session": {
    input: { directory?: string } | undefined
    output: DesktopSessionMutationResult
  }
  "desktop:create-folder-session": {
    input: { projectID: string; directory: string; title?: string }
    output: DesktopSessionMutationResult
  }
  "desktop:create-project-session": {
    input: { projectID: string; title?: string; directory?: string }
    output: DesktopSessionMutationResult
  }
  "desktop:create-side-chat": {
    input: { parentSessionID: string; anchorMessageID: string }
    output: DesktopSessionMutationResult
  }
  "desktop:list-side-chats": {
    input: { parentSessionID: string; anchorMessageID?: string }
    output: AgentSideChatLink[]
  }
  "desktop:get-side-chat-link": {
    input: { sessionID: string }
    output: AgentSideChatLink
  }
  "desktop:delete-project-workspace": {
    input: { projectID: string }
    output: DesktopDeleteProjectWorkspaceResult
  }
  "desktop:delete-agent-session": {
    input: { sessionID: string }
    output: DesktopDeleteAgentSessionResult
  }
  "desktop:archive-agent-session": {
    input: { sessionID: string }
    output: DesktopArchiveAgentSessionResult
  }
  "desktop:list-archived-sessions": {
    input: void
    output: AgentArchivedSessionSummary[]
  }
  "desktop:restore-archived-session": {
    input: { sessionID: string }
    output: DesktopSessionMutationResult
  }
  "desktop:delete-archived-session": {
    input: { sessionID: string }
    output: DesktopDeleteArchivedSessionResult
  }
  "desktop:get-session-diff": {
    input: { sessionID: string }
    output: AgentSessionDiffSummary
  }
  "desktop:restore-workspace-diff-file": {
    input: { directory: string; file: string }
    output: WorkspaceDiffFileRestoreResult
  }
  "desktop:get-session-runtime-debug": {
    input: { sessionID: string; limit?: number; turns?: number }
    output: AgentSessionRuntimeDebugSnapshot
  }
  "desktop:get-global-provider-catalog": {
    input: void
    output: AgentProviderCatalogItem[]
  }
  "desktop:refresh-global-provider-catalog": {
    input: void
    output: AgentProviderCatalogItem[]
  }
  "desktop:get-global-provider-auth": {
    input: { providerID: string }
    output: AgentProviderAuthState
  }
  "desktop:start-global-provider-auth-flow": {
    input: { providerID: string; method: string }
    output: AgentProviderAuthFlow
  }
  "desktop:get-global-provider-auth-flow": {
    input: { providerID: string; flowID: string }
    output: AgentProviderAuthFlow
  }
  "desktop:cancel-global-provider-auth-flow": {
    input: { providerID: string; flowID: string }
    output: AgentProviderAuthFlow
  }
  "desktop:save-global-provider-api-key": {
    input: { providerID: string; apiKey?: string | null }
    output: AgentProviderAuthState
  }
  "desktop:delete-global-provider-auth-session": {
    input: { providerID: string }
    output: AgentProviderAuthState
  }
  "desktop:test-global-provider-connection": {
    input: DesktopProviderConnectionTestInput
    output: AgentProviderConnectionTestResult
  }
  "desktop:get-global-models": {
    input: void
    output: { items: AgentProviderModel[]; selection: AgentProjectModelSelection }
  }
  "desktop:update-global-provider": {
    input: { providerID: string; provider: DesktopProviderMutationInput }
    output: DesktopProviderMutationResult
  }
  "desktop:delete-global-provider": {
    input: { providerID: string }
    output: DesktopProviderDeleteResult
  }
  "desktop:update-global-model-selection": {
    input: DesktopModelSelectionUpdateInput
    output: AgentProjectModelSelection
  }
  "desktop:get-global-mcp-servers": {
    input: void
    output: AgentMcpServerSummary[]
  }
  "desktop:get-global-mcp-server-diagnostic": {
    input: { serverID: string }
    output: AgentMcpServerDiagnostic
  }
  "desktop:update-global-mcp-server": {
    input: { serverID: string; server: McpServerInput }
    output: AgentMcpServerSummary
  }
  "desktop:delete-global-mcp-server": {
    input: { serverID: string }
    output: { serverID: string; removed: boolean }
  }
  "desktop:get-plugin-catalog": {
    input: void
    output: AgentPluginCatalogItem[]
  }
  "desktop:get-installed-plugins": {
    input: void
    output: AgentInstalledPlugin[]
  }
  "desktop:install-plugin": {
    input: AgentPluginInstallInput
    output: AgentInstalledPlugin
  }
  "desktop:update-installed-plugin": {
    input: AgentPluginUpdateInput
    output: AgentInstalledPlugin
  }
  "desktop:delete-installed-plugin": {
    input: { pluginID: string }
    output: AgentPluginDeleteResult
  }
  "desktop:get-installed-plugin-diagnostic": {
    input: { pluginID: string }
    output: AgentMcpServerDiagnostic
  }
  "desktop:get-installed-plugin-connectors": {
    input: { pluginID: string }
    output: AgentPluginConnectorStatus[]
  }
  "desktop:save-installed-plugin-connector-api-key": {
    input: { pluginID: string; appID: string; apiKey?: string | null }
    output: AgentPluginConnectorStatus
  }
  "desktop:delete-installed-plugin-connector-api-key": {
    input: { pluginID: string; appID: string }
    output: AgentPluginConnectorStatus
  }
  "desktop:get-installed-plugin-connector-diagnostic": {
    input: { pluginID: string; appID: string }
    output: AgentMcpServerDiagnostic
  }
  "desktop:get-builtin-tools": {
    input: void
    output: AgentBuiltinToolsPayload
  }
  "desktop:update-builtin-tool-selection": {
    input: AgentBuiltinToolSelection
    output: AgentBuiltinToolSelection
  }
  "desktop:get-tool-permission-mode": {
    input: void
    output: AgentToolPermissionModePayload
  }
  "desktop:update-tool-permission-mode": {
    input: AgentToolPermissionModePayload
    output: AgentToolPermissionModePayload
  }
  "desktop:get-global-skills": {
    input: void
    output: AgentSkillInfo[]
  }
  "desktop:get-prompt-presets": {
    input: void
    output: AgentPromptPresetSummary[]
  }
  "desktop:get-prompt-preset-selection": {
    input: void
    output: AgentPromptPresetSelection
  }
  "desktop:read-prompt-preset": {
    input: { presetID: string }
    output: AgentPromptPresetDocument
  }
  "desktop:update-prompt-preset": {
    input: { presetID: string; label?: string; content: string; description?: string }
    output: AgentPromptPresetDocument
  }
  "desktop:update-prompt-preset-selection": {
    input: AgentPromptPresetSelection
    output: AgentPromptPresetSelection
  }
  "desktop:create-prompt-preset": {
    input: { label?: string; content?: string; description?: string }
    output: AgentPromptPresetDocument
  }
  "desktop:reset-prompt-preset": {
    input: { presetID: string }
    output: AgentPromptPresetDocument
  }
  "desktop:delete-prompt-preset": {
    input: { presetID: string }
    output: AgentPromptPresetSelection
  }
  "desktop:get-global-skills-tree": {
    input: void
    output: AgentGlobalSkillTree
  }
  "desktop:read-global-skill-file": {
    input: { path: string }
    output: AgentGlobalSkillFileDocument
  }
  "desktop:search-workspace-files": {
    input: { directory: string; query: string }
    output: AgentWorkspaceFileSearchResult[]
  }
  "desktop:read-workspace-file": {
    input: { directory: string; path: string }
    output: AgentWorkspaceFileDocument
  }
  "desktop:update-global-skill-file": {
    input: { path: string; content: string }
    output: AgentGlobalSkillFileDocument
  }
  "desktop:create-global-skill": {
    input: { name: string }
    output: { directory: string; file: AgentGlobalSkillFileDocument }
  }
  "desktop:rename-global-skill": {
    input: { directory: string; name: string }
    output: AgentGlobalSkillRenameResult
  }
  "desktop:delete-global-skill": {
    input: { directory: string }
    output: { directory: string; removed: boolean }
  }
  "desktop:get-project-provider-catalog": {
    input: { projectID: string }
    output: AgentProviderCatalogItem[]
  }
  "desktop:refresh-project-provider-catalog": {
    input: { projectID: string }
    output: AgentProviderCatalogItem[]
  }
  "desktop:get-project-models": {
    input: { projectID: string }
    output: AgentProjectModelsResult
  }
  "desktop:get-session-models": {
    input: { sessionID: string }
    output: AgentProjectModelsResult
  }
  "desktop:update-project-provider": {
    input: { projectID: string; providerID: string; provider: DesktopProviderMutationInput }
    output: DesktopProviderMutationResult
  }
  "desktop:delete-project-provider": {
    input: { projectID: string; providerID: string }
    output: DesktopProviderDeleteResult
  }
  "desktop:update-project-model-selection": {
    input: { projectID: string } & DesktopModelSelectionUpdateInput
    output: AgentProjectModelSelection
  }
  "desktop:update-session-model-selection": {
    input: { sessionID: string } & DesktopModelSelectionUpdateInput
    output: AgentProjectModelSelection
  }
  "desktop:get-project-skills": {
    input: { projectID: string }
    output: AgentSkillInfo[]
  }
  "desktop:get-project-skill-selection": {
    input: { projectID: string }
    output: AgentProjectSkillSelection
  }
  "desktop:update-project-skill-selection": {
    input: { projectID: string; skillIDs: string[] }
    output: AgentProjectSkillSelection
  }
  "desktop:get-project-mcp-selection": {
    input: { projectID: string }
    output: AgentProjectMcpSelection
  }
  "desktop:update-project-mcp-selection": {
    input: { projectID: string; serverIDs: string[] }
    output: AgentProjectMcpSelection
  }
  "desktop:get-project-mcp-servers": {
    input: { projectID: string }
    output: AgentMcpServerSummary[]
  }
  "desktop:get-project-mcp-server-diagnostic": {
    input: { projectID: string; serverID: string }
    output: AgentMcpServerDiagnostic
  }
  "desktop:update-project-mcp-server": {
    input: { projectID: string; serverID: string; server: McpServerInput }
    output: AgentMcpServerSummary
  }
  "desktop:delete-project-mcp-server": {
    input: { projectID: string; serverID: string }
    output: { serverID: string; removed: boolean }
  }
  "desktop:agent-session-load-history": {
    input: { backendSessionID: string }
    output: AgentSessionHistoryMessage[]
  }
  "desktop:agent-session-send-turn": {
    input: AgentSessionTurnRequestInput
    output: DesktopAgentSessionTurnResult
  }
  "desktop:agent-session-resume-turn": {
    input: { clientTurnID: string; backendSessionID: string }
    output: DesktopAgentSessionTurnResult
  }
  "desktop:agent-session-cancel-turn": {
    input: { clientTurnID: string; backendSessionID: string }
    output: DesktopAgentSessionCancelTurnResult
  }
  "desktop:agent-session-answer-question": {
    input: { backendSessionID: string } & AgentSessionQuestionAnswerInput
    output: AgentSessionQuestionAnswerResult
  }
  "desktop:agent-session-subscribe": {
    input: { uiSessionID?: string; backendSessionID: string }
    output: DesktopAgentSessionSubscriptionResult
  }
  "desktop:agent-session-unsubscribe": {
    input: { backendSessionID: string }
    output: DesktopAgentSessionUnsubscribeResult
  }
  "desktop:agent-session-load-permission-requests": {
    input: { backendSessionID: string }
    output: PermissionRequestPrompt[]
  }
  "desktop:agent-session-respond-permission-request": {
    input: PermissionResolveInput
    output: PermissionResolveResult
  }
}

export interface DesktopIpcEventPayloads {
  [DESKTOP_AGENT_SESSION_EVENT_CHANNEL]: AgentSessionBridgeIPCEvent
  [DESKTOP_WORKSPACE_FILE_CHANGE_EVENT_CHANNEL]: WorkspaceFileChangeIPCEvent
  [DESKTOP_PTY_EVENT_CHANNEL]: PtyTransportIPCEvent
  [DESKTOP_WINDOW_STATE_EVENT_CHANNEL]: DesktopWindowState
}

export type DesktopIpcChannel = keyof DesktopIpcContract
export type DesktopIpcEventChannel = keyof DesktopIpcEventPayloads
export type DesktopIpcInput<Channel extends DesktopIpcChannel> = DesktopIpcContract[Channel]["input"]
export type DesktopIpcOutput<Channel extends DesktopIpcChannel> = DesktopIpcContract[Channel]["output"]
export type DesktopIpcEventPayload<Channel extends DesktopIpcEventChannel> = DesktopIpcEventPayloads[Channel]

export interface DesktopAgentSessionApi {
  loadHistory(input: DesktopIpcInput<"desktop:agent-session-load-history">): Promise<DesktopIpcOutput<"desktop:agent-session-load-history">>
  sendTurn(input: DesktopIpcInput<"desktop:agent-session-send-turn">): Promise<DesktopIpcOutput<"desktop:agent-session-send-turn">>
  resumeTurn(input: DesktopIpcInput<"desktop:agent-session-resume-turn">): Promise<DesktopIpcOutput<"desktop:agent-session-resume-turn">>
  cancelTurn(input: DesktopIpcInput<"desktop:agent-session-cancel-turn">): Promise<DesktopIpcOutput<"desktop:agent-session-cancel-turn">>
  answerQuestion(input: DesktopIpcInput<"desktop:agent-session-answer-question">): Promise<DesktopIpcOutput<"desktop:agent-session-answer-question">>
  subscribe(input: DesktopIpcInput<"desktop:agent-session-subscribe">): Promise<DesktopIpcOutput<"desktop:agent-session-subscribe">>
  unsubscribe(input: DesktopIpcInput<"desktop:agent-session-unsubscribe">): Promise<DesktopIpcOutput<"desktop:agent-session-unsubscribe">>
  loadPermissionRequests(input: DesktopIpcInput<"desktop:agent-session-load-permission-requests">): Promise<DesktopIpcOutput<"desktop:agent-session-load-permission-requests">>
  respondPermissionRequest(input: DesktopIpcInput<"desktop:agent-session-respond-permission-request">): Promise<DesktopIpcOutput<"desktop:agent-session-respond-permission-request">>
  onEvent(listener: (event: DesktopIpcEventPayload<typeof DESKTOP_AGENT_SESSION_EVENT_CHANNEL>) => void): () => void
}

export interface DesktopApiBase {
  platform: string
  previewGuestPreloadPath?: string
  versions: Partial<NodeJS.ProcessVersions>
}

export interface DesktopApiMethods {
  getInfo(): Promise<DesktopIpcOutput<"desktop:get-info">>
  getAppUpdateSettings(): Promise<DesktopIpcOutput<"desktop:get-app-update-settings">>
  setAutomaticUpdatesEnabled(
    input: DesktopIpcInput<"desktop:set-automatic-updates-enabled">,
  ): Promise<DesktopIpcOutput<"desktop:set-automatic-updates-enabled">>
  checkForAppUpdates(): Promise<DesktopIpcOutput<"desktop:check-for-app-updates">>
  getWindowState(): Promise<DesktopIpcOutput<"desktop:get-window-state">>
  getAppearanceConfig(): Promise<DesktopIpcOutput<"desktop:get-appearance-config">>
  saveAppearanceConfig(input: DesktopIpcInput<"desktop:save-appearance-config">): Promise<DesktopIpcOutput<"desktop:save-appearance-config">>
  showMenu(menuKey: MenuKey, anchor?: MenuAnchor): Promise<DesktopIpcOutput<"desktop:show-menu">>
  showExternalEditorMenu(input: DesktopIpcInput<"desktop:show-external-editor-menu">): Promise<DesktopIpcOutput<"desktop:show-external-editor-menu">>
  listExternalEditorsForTarget(input: DesktopIpcInput<"desktop:list-external-editors-for-target">): Promise<DesktopIpcOutput<"desktop:list-external-editors-for-target">>
  openInExternalEditor(input: DesktopIpcInput<"desktop:open-in-external-editor">): Promise<DesktopIpcOutput<"desktop:open-in-external-editor">>
  openExternalUrl(input: DesktopIpcInput<"desktop:open-external-url">): Promise<DesktopIpcOutput<"desktop:open-external-url">>
  windowAction(action: DesktopIpcInput<"desktop:window-action">): Promise<DesktopIpcOutput<"desktop:window-action">>
  getAgentConfig(): Promise<DesktopIpcOutput<"desktop:get-agent-config">>
  getAgentHealth(): Promise<DesktopIpcOutput<"desktop:agent-health">>
  createPtySession(input?: DesktopIpcInput<"desktop:create-pty-session">): Promise<DesktopIpcOutput<"desktop:create-pty-session">>
  getPtySession(input: DesktopIpcInput<"desktop:get-pty-session">): Promise<DesktopIpcOutput<"desktop:get-pty-session">>
  updatePtySession(input: DesktopIpcInput<"desktop:update-pty-session">): Promise<DesktopIpcOutput<"desktop:update-pty-session">>
  deletePtySession(input: DesktopIpcInput<"desktop:delete-pty-session">): Promise<DesktopIpcOutput<"desktop:delete-pty-session">>
  attachPtySession(input: DesktopIpcInput<"desktop:attach-pty-session">): Promise<DesktopIpcOutput<"desktop:attach-pty-session">>
  detachPtySession(input: DesktopIpcInput<"desktop:detach-pty-session">): Promise<DesktopIpcOutput<"desktop:detach-pty-session">>
  writePtyInput(input: DesktopIpcInput<"desktop:write-pty-input">): Promise<DesktopIpcOutput<"desktop:write-pty-input">>
  pickProjectDirectory(): Promise<DesktopIpcOutput<"desktop:pick-project-directory">>
  pickComposerAttachments(input?: DesktopIpcInput<"desktop:pick-composer-attachments">): Promise<DesktopIpcOutput<"desktop:pick-composer-attachments">>
  gitGetCapabilities(input: DesktopIpcInput<"desktop:git-get-capabilities">): Promise<DesktopIpcOutput<"desktop:git-get-capabilities">>
  gitCommit(input: DesktopIpcInput<"desktop:git-commit">): Promise<DesktopIpcOutput<"desktop:git-commit">>
  gitPush(input: DesktopIpcInput<"desktop:git-push">): Promise<DesktopIpcOutput<"desktop:git-push">>
  gitCreateBranch(input: DesktopIpcInput<"desktop:git-create-branch">): Promise<DesktopIpcOutput<"desktop:git-create-branch">>
  gitListBranches(input: DesktopIpcInput<"desktop:git-list-branches">): Promise<DesktopIpcOutput<"desktop:git-list-branches">>
  gitCheckoutBranch(input: DesktopIpcInput<"desktop:git-checkout-branch">): Promise<DesktopIpcOutput<"desktop:git-checkout-branch">>
  gitCreatePullRequest(input: DesktopIpcInput<"desktop:git-create-pull-request">): Promise<DesktopIpcOutput<"desktop:git-create-pull-request">>
  updateWorkspaceWatchDirectories(input: DesktopIpcInput<"desktop:update-workspace-watch-directories">): Promise<DesktopIpcOutput<"desktop:update-workspace-watch-directories">>
  listFolderWorkspaces(): Promise<DesktopIpcOutput<"desktop:list-folder-workspaces">>
  listProjectWorkspaces(): Promise<DesktopIpcOutput<"desktop:list-project-workspaces">>
  openFolderWorkspace(input: DesktopIpcInput<"desktop:open-folder-workspace">): Promise<DesktopIpcOutput<"desktop:open-folder-workspace">>
  createProjectWorkspace(input: DesktopIpcInput<"desktop:create-project-workspace">): Promise<DesktopIpcOutput<"desktop:create-project-workspace">>
  createAgentSession(input?: DesktopIpcInput<"desktop:agent-create-session">): Promise<DesktopIpcOutput<"desktop:agent-create-session">>
  createFolderSession(input: DesktopIpcInput<"desktop:create-folder-session">): Promise<DesktopIpcOutput<"desktop:create-folder-session">>
  createProjectSession(input: DesktopIpcInput<"desktop:create-project-session">): Promise<DesktopIpcOutput<"desktop:create-project-session">>
  createSideChat(input: DesktopIpcInput<"desktop:create-side-chat">): Promise<DesktopIpcOutput<"desktop:create-side-chat">>
  listSideChats(input: DesktopIpcInput<"desktop:list-side-chats">): Promise<DesktopIpcOutput<"desktop:list-side-chats">>
  getSideChatLink(input: DesktopIpcInput<"desktop:get-side-chat-link">): Promise<DesktopIpcOutput<"desktop:get-side-chat-link">>
  deleteProjectWorkspace(input: DesktopIpcInput<"desktop:delete-project-workspace">): Promise<DesktopIpcOutput<"desktop:delete-project-workspace">>
  deleteAgentSession(input: DesktopIpcInput<"desktop:delete-agent-session">): Promise<DesktopIpcOutput<"desktop:delete-agent-session">>
  archiveAgentSession(input: DesktopIpcInput<"desktop:archive-agent-session">): Promise<DesktopIpcOutput<"desktop:archive-agent-session">>
  listArchivedSessions(): Promise<DesktopIpcOutput<"desktop:list-archived-sessions">>
  restoreArchivedSession(input: DesktopIpcInput<"desktop:restore-archived-session">): Promise<DesktopIpcOutput<"desktop:restore-archived-session">>
  deleteArchivedSession(input: DesktopIpcInput<"desktop:delete-archived-session">): Promise<DesktopIpcOutput<"desktop:delete-archived-session">>
  getSessionDiff(input: DesktopIpcInput<"desktop:get-session-diff">): Promise<DesktopIpcOutput<"desktop:get-session-diff">>
  restoreWorkspaceDiffFile(input: DesktopIpcInput<"desktop:restore-workspace-diff-file">): Promise<DesktopIpcOutput<"desktop:restore-workspace-diff-file">>
  getSessionRuntimeDebug(input: DesktopIpcInput<"desktop:get-session-runtime-debug">): Promise<DesktopIpcOutput<"desktop:get-session-runtime-debug">>
  agentSession: DesktopAgentSessionApi
  getGlobalProviderCatalog(): Promise<DesktopIpcOutput<"desktop:get-global-provider-catalog">>
  refreshGlobalProviderCatalog(): Promise<DesktopIpcOutput<"desktop:refresh-global-provider-catalog">>
  getGlobalProviderAuth(input: DesktopIpcInput<"desktop:get-global-provider-auth">): Promise<DesktopIpcOutput<"desktop:get-global-provider-auth">>
  startGlobalProviderAuthFlow(input: DesktopIpcInput<"desktop:start-global-provider-auth-flow">): Promise<DesktopIpcOutput<"desktop:start-global-provider-auth-flow">>
  getGlobalProviderAuthFlow(input: DesktopIpcInput<"desktop:get-global-provider-auth-flow">): Promise<DesktopIpcOutput<"desktop:get-global-provider-auth-flow">>
  cancelGlobalProviderAuthFlow(input: DesktopIpcInput<"desktop:cancel-global-provider-auth-flow">): Promise<DesktopIpcOutput<"desktop:cancel-global-provider-auth-flow">>
  saveGlobalProviderApiKey(input: DesktopIpcInput<"desktop:save-global-provider-api-key">): Promise<DesktopIpcOutput<"desktop:save-global-provider-api-key">>
  deleteGlobalProviderAuthSession(input: DesktopIpcInput<"desktop:delete-global-provider-auth-session">): Promise<DesktopIpcOutput<"desktop:delete-global-provider-auth-session">>
  testGlobalProviderConnection(input: DesktopIpcInput<"desktop:test-global-provider-connection">): Promise<DesktopIpcOutput<"desktop:test-global-provider-connection">>
  getGlobalModels(): Promise<DesktopIpcOutput<"desktop:get-global-models">>
  updateGlobalProvider(input: DesktopIpcInput<"desktop:update-global-provider">): Promise<DesktopIpcOutput<"desktop:update-global-provider">>
  deleteGlobalProvider(input: DesktopIpcInput<"desktop:delete-global-provider">): Promise<DesktopIpcOutput<"desktop:delete-global-provider">>
  updateGlobalModelSelection(input: DesktopIpcInput<"desktop:update-global-model-selection">): Promise<DesktopIpcOutput<"desktop:update-global-model-selection">>
  getGlobalMcpServers(): Promise<DesktopIpcOutput<"desktop:get-global-mcp-servers">>
  getGlobalMcpServerDiagnostic(input: DesktopIpcInput<"desktop:get-global-mcp-server-diagnostic">): Promise<DesktopIpcOutput<"desktop:get-global-mcp-server-diagnostic">>
  updateGlobalMcpServer(input: DesktopIpcInput<"desktop:update-global-mcp-server">): Promise<DesktopIpcOutput<"desktop:update-global-mcp-server">>
  deleteGlobalMcpServer(input: DesktopIpcInput<"desktop:delete-global-mcp-server">): Promise<DesktopIpcOutput<"desktop:delete-global-mcp-server">>
  getPluginCatalog(): Promise<DesktopIpcOutput<"desktop:get-plugin-catalog">>
  getInstalledPlugins(): Promise<DesktopIpcOutput<"desktop:get-installed-plugins">>
  installPlugin(input: DesktopIpcInput<"desktop:install-plugin">): Promise<DesktopIpcOutput<"desktop:install-plugin">>
  updateInstalledPlugin(input: DesktopIpcInput<"desktop:update-installed-plugin">): Promise<DesktopIpcOutput<"desktop:update-installed-plugin">>
  deleteInstalledPlugin(input: DesktopIpcInput<"desktop:delete-installed-plugin">): Promise<DesktopIpcOutput<"desktop:delete-installed-plugin">>
  getInstalledPluginDiagnostic(input: DesktopIpcInput<"desktop:get-installed-plugin-diagnostic">): Promise<DesktopIpcOutput<"desktop:get-installed-plugin-diagnostic">>
  getInstalledPluginConnectors(input: DesktopIpcInput<"desktop:get-installed-plugin-connectors">): Promise<DesktopIpcOutput<"desktop:get-installed-plugin-connectors">>
  saveInstalledPluginConnectorApiKey(input: DesktopIpcInput<"desktop:save-installed-plugin-connector-api-key">): Promise<DesktopIpcOutput<"desktop:save-installed-plugin-connector-api-key">>
  deleteInstalledPluginConnectorApiKey(input: DesktopIpcInput<"desktop:delete-installed-plugin-connector-api-key">): Promise<DesktopIpcOutput<"desktop:delete-installed-plugin-connector-api-key">>
  getInstalledPluginConnectorDiagnostic(input: DesktopIpcInput<"desktop:get-installed-plugin-connector-diagnostic">): Promise<DesktopIpcOutput<"desktop:get-installed-plugin-connector-diagnostic">>
  getBuiltinTools(): Promise<DesktopIpcOutput<"desktop:get-builtin-tools">>
  updateBuiltinToolSelection(input: DesktopIpcInput<"desktop:update-builtin-tool-selection">): Promise<DesktopIpcOutput<"desktop:update-builtin-tool-selection">>
  getToolPermissionMode(): Promise<DesktopIpcOutput<"desktop:get-tool-permission-mode">>
  updateToolPermissionMode(input: DesktopIpcInput<"desktop:update-tool-permission-mode">): Promise<DesktopIpcOutput<"desktop:update-tool-permission-mode">>
  getGlobalSkills(): Promise<DesktopIpcOutput<"desktop:get-global-skills">>
  getPromptPresets(): Promise<DesktopIpcOutput<"desktop:get-prompt-presets">>
  getPromptPresetSelection(): Promise<DesktopIpcOutput<"desktop:get-prompt-preset-selection">>
  readPromptPreset(input: DesktopIpcInput<"desktop:read-prompt-preset">): Promise<DesktopIpcOutput<"desktop:read-prompt-preset">>
  createPromptPreset(input: DesktopIpcInput<"desktop:create-prompt-preset">): Promise<DesktopIpcOutput<"desktop:create-prompt-preset">>
  getGlobalSkillsTree(): Promise<DesktopIpcOutput<"desktop:get-global-skills-tree">>
  readGlobalSkillFile(input: DesktopIpcInput<"desktop:read-global-skill-file">): Promise<DesktopIpcOutput<"desktop:read-global-skill-file">>
  searchWorkspaceFiles(input: DesktopIpcInput<"desktop:search-workspace-files">): Promise<DesktopIpcOutput<"desktop:search-workspace-files">>
  readWorkspaceFile(input: DesktopIpcInput<"desktop:read-workspace-file">): Promise<DesktopIpcOutput<"desktop:read-workspace-file">>
  updateGlobalSkillFile(input: DesktopIpcInput<"desktop:update-global-skill-file">): Promise<DesktopIpcOutput<"desktop:update-global-skill-file">>
  updatePromptPreset(input: DesktopIpcInput<"desktop:update-prompt-preset">): Promise<DesktopIpcOutput<"desktop:update-prompt-preset">>
  updatePromptPresetSelection(input: DesktopIpcInput<"desktop:update-prompt-preset-selection">): Promise<DesktopIpcOutput<"desktop:update-prompt-preset-selection">>
  resetPromptPreset(input: DesktopIpcInput<"desktop:reset-prompt-preset">): Promise<DesktopIpcOutput<"desktop:reset-prompt-preset">>
  deletePromptPreset(input: DesktopIpcInput<"desktop:delete-prompt-preset">): Promise<DesktopIpcOutput<"desktop:delete-prompt-preset">>
  createGlobalSkill(input: DesktopIpcInput<"desktop:create-global-skill">): Promise<DesktopIpcOutput<"desktop:create-global-skill">>
  renameGlobalSkill(input: DesktopIpcInput<"desktop:rename-global-skill">): Promise<DesktopIpcOutput<"desktop:rename-global-skill">>
  deleteGlobalSkill(input: DesktopIpcInput<"desktop:delete-global-skill">): Promise<DesktopIpcOutput<"desktop:delete-global-skill">>
  getProjectProviderCatalog(input: DesktopIpcInput<"desktop:get-project-provider-catalog">): Promise<DesktopIpcOutput<"desktop:get-project-provider-catalog">>
  refreshProjectProviderCatalog(input: DesktopIpcInput<"desktop:refresh-project-provider-catalog">): Promise<DesktopIpcOutput<"desktop:refresh-project-provider-catalog">>
  getProjectModels(input: DesktopIpcInput<"desktop:get-project-models">): Promise<DesktopIpcOutput<"desktop:get-project-models">>
  getSessionModels(input: DesktopIpcInput<"desktop:get-session-models">): Promise<DesktopIpcOutput<"desktop:get-session-models">>
  getProjectSkills(input: DesktopIpcInput<"desktop:get-project-skills">): Promise<DesktopIpcOutput<"desktop:get-project-skills">>
  getProjectSkillSelection(input: DesktopIpcInput<"desktop:get-project-skill-selection">): Promise<DesktopIpcOutput<"desktop:get-project-skill-selection">>
  updateProjectSkillSelection(input: DesktopIpcInput<"desktop:update-project-skill-selection">): Promise<DesktopIpcOutput<"desktop:update-project-skill-selection">>
  getProjectMcpSelection(input: DesktopIpcInput<"desktop:get-project-mcp-selection">): Promise<DesktopIpcOutput<"desktop:get-project-mcp-selection">>
  updateProjectMcpSelection(input: DesktopIpcInput<"desktop:update-project-mcp-selection">): Promise<DesktopIpcOutput<"desktop:update-project-mcp-selection">>
  getProjectMcpServers(input: DesktopIpcInput<"desktop:get-project-mcp-servers">): Promise<DesktopIpcOutput<"desktop:get-project-mcp-servers">>
  getProjectMcpServerDiagnostic(input: DesktopIpcInput<"desktop:get-project-mcp-server-diagnostic">): Promise<DesktopIpcOutput<"desktop:get-project-mcp-server-diagnostic">>
  updateProjectMcpServer(input: DesktopIpcInput<"desktop:update-project-mcp-server">): Promise<DesktopIpcOutput<"desktop:update-project-mcp-server">>
  deleteProjectMcpServer(input: DesktopIpcInput<"desktop:delete-project-mcp-server">): Promise<DesktopIpcOutput<"desktop:delete-project-mcp-server">>
  updateProjectProvider(input: DesktopIpcInput<"desktop:update-project-provider">): Promise<DesktopIpcOutput<"desktop:update-project-provider">>
  deleteProjectProvider(input: DesktopIpcInput<"desktop:delete-project-provider">): Promise<DesktopIpcOutput<"desktop:delete-project-provider">>
  updateProjectModelSelection(input: DesktopIpcInput<"desktop:update-project-model-selection">): Promise<DesktopIpcOutput<"desktop:update-project-model-selection">>
  updateSessionModelSelection(input: DesktopIpcInput<"desktop:update-session-model-selection">): Promise<DesktopIpcOutput<"desktop:update-session-model-selection">>
  onWorkspaceFileChange(listener: (event: DesktopIpcEventPayload<typeof DESKTOP_WORKSPACE_FILE_CHANGE_EVENT_CHANNEL>) => void): () => void
  onPtyEvent(listener: (event: DesktopIpcEventPayload<typeof DESKTOP_PTY_EVENT_CHANNEL>) => void): () => void
  onWindowStateChange(listener: (state: DesktopIpcEventPayload<typeof DESKTOP_WINDOW_STATE_EVENT_CHANNEL>) => void): () => void
}

export type DesktopPreloadApi = DesktopApiBase & DesktopApiMethods
export type DesktopApi = DesktopApiBase & Pick<DesktopApiMethods, "getInfo"> & Partial<DesktopApiMethods>
