import type {
  AgentArchivedSessionDeleteResult,
  AgentArchivedSessionSummary,
  AgentBuiltinToolSelection,
  AgentBuiltinToolSummary,
  AgentBuiltinToolsPayload,
  AgentConfig,
  AgentConnectorDefinition,
  AgentConnectorStatus,
  AgentFolderWorkspace,
  AgentGlobalSkillFileDocument,
  AgentGlobalSkillFolderRenameResult,
  AgentGlobalSkillFolderResult,
  AgentGlobalSkillMoveResult,
  AgentGlobalSkillRenameResult,
  AgentGlobalSkillTree,
  AgentInstalledGlobalSkill,
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
  AgentProjectPluginSelection,
  AgentProjectSkillSelection,
  AgentProjectWorkspace,
  AgentPromptPresetDocument,
  AgentPromptPresetSelection,
  AgentPromptPresetSummary,
  AgentPromptUrlInstallCandidate,
  AgentPromptUrlInstallPreview,
  AgentPromptUrlInstallResult,
  AgentProviderAuthFlow,
  AgentProviderAuthState,
  AgentProviderCatalogItem,
  AgentProviderConnectionTestResult,
  AgentProviderModel,
  AgentPtySessionInfo,
  AgentSessionArchiveResult,
  AgentSessionBridgeIPCEvent,
  AgentSessionDeleteResult,
  AgentSessionDiffScope,
  AgentSessionDiffSummary,
  AgentSessionHistoryMessage,
  AgentSessionQuestionAnswerInput,
  AgentSessionQuestionAnswerResult,
  AgentSessionRuntimeDebugSnapshot,
  AgentSessionTaskListView,
  AgentSessionTraceExport,
  AgentSessionTurnRequestInput,
  AgentSessionWorkflowUpdateInput,
  AgentSideChatLink,
  AgentSkillGitInstallPreview,
  AgentSkillInfo,
  AgentSkillInstallCandidate,
  AgentSkillGitInstallResult,
  AgentToolPermissionModePayload,
  AgentWorkspaceFileDocument,
  AgentWorkspaceDirectoryEntry,
  AgentWorkspaceFileSearchResult,
  AgentWorkspaceSession,
  MenuAnchor,
  MenuKey,
  PtyTransportIPCEvent,
  WindowAction,
} from "../main/types"
import type { DesktopOpenPathInput, DesktopOpenPathResult } from "@anybox/shared"
import type { AppearanceConfigDocument, AppearanceConfigSnapshot } from "./appearance"
import type { LocaleConfigDocument, LocaleConfigSnapshot } from "./locale"
import type {
  PermissionRequestPrompt,
  PermissionResolveInput,
  PermissionResolveResult,
} from "./permission"

export const DESKTOP_AGENT_SESSION_EVENT_CHANNEL = "desktop:agent-session-event"
export const DESKTOP_WORKSPACE_FILE_CHANGE_EVENT_CHANNEL = "desktop:workspace-file-change"
export const DESKTOP_PTY_EVENT_CHANNEL = "desktop:pty-event"
export const DESKTOP_WINDOW_STATE_EVENT_CHANNEL = "desktop:window-state-changed"
export const DESKTOP_WORKBENCH_STATE_EVENT_CHANNEL = "desktop:workbench-state-changed"

export interface DesktopPluginCatalogInput {
  freshness?: "cached" | "fresh"
}

export type {
  AgentArchivedSessionDeleteResult,
  AgentArchivedSessionSummary,
  AgentBuiltinToolSelection,
  AgentBuiltinToolSummary,
  AgentBuiltinToolsPayload,
  AgentConfig,
  AgentConnectorDefinition,
  AgentConnectorStatus,
  AgentFolderWorkspace,
  AgentGlobalSkillFileDocument,
  AgentGlobalSkillFolderRenameResult,
  AgentGlobalSkillFolderResult,
  AgentGlobalSkillMoveResult,
  AgentGlobalSkillRenameResult,
  AgentGlobalSkillTree,
  AgentInstalledGlobalSkill,
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
  AgentProjectPluginSelection,
  AgentProjectSkillSelection,
  AgentProjectWorkspace,
  AgentPromptPresetDocument,
  AgentPromptPresetSelection,
  AgentPromptPresetSummary,
  AgentPromptUrlInstallCandidate,
  AgentPromptUrlInstallPreview,
  AgentPromptUrlInstallResult,
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
  AgentSessionTraceExport,
  AgentSessionTurnRequestInput,
  AgentSessionWorkflowUpdateInput,
  AgentSideChatLink,
  AgentSkillGitInstallPreview,
  AgentSkillInfo,
  AgentSkillInstallCandidate,
  AgentSkillGitInstallResult,
  AgentToolPermissionModePayload,
  AgentWorkspaceFileDocument,
  AgentWorkspaceDirectoryEntry,
  AgentWorkspaceFileSearchResult,
  AgentWorkspaceSession,
  AppearanceConfigDocument,
  AppearanceConfigSnapshot,
  LocaleConfigDocument,
  LocaleConfigSnapshot,
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
export type GitGetCapabilitiesInput = {
  projectID: string
  directory: string
  includePullRequestRemoteCheck?: boolean
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
export type WorkspaceDiffPatchReverseApplyInput = {
  directory: string
  diffs: Array<{
    file: string
    patch?: string
  }>
}
export type WorkspaceDiffPatchReverseApplyResult = {
  directory: string
  restored: Array<{ file: string }>
  failed: Array<{ file: string; message: string }>
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
export type ProjectPluginSelection = AgentProjectPluginSelection
export type ConnectorDefinition = AgentConnectorDefinition
export type ConnectorStatus = AgentConnectorStatus
export type PluginCatalogItem = AgentPluginCatalogItem
export type InstalledPlugin = AgentInstalledPlugin
export type PluginConnectorStatus = AgentPluginConnectorStatus
export type PluginInstallInput = AgentPluginInstallInput
export type PluginUpdateInput = AgentPluginUpdateInput
export type PluginDeleteResult = AgentPluginDeleteResult
export type PtyIPCEvent = PtyTransportIPCEvent
export type PtySessionInfo = AgentPtySessionInfo
export type SkillInfo = AgentSkillInfo
export type SkillInstallCandidate = AgentSkillInstallCandidate
export type SkillGitInstallPreview = AgentSkillGitInstallPreview
export type InstalledGlobalSkill = AgentInstalledGlobalSkill
export type SkillGitInstallResult = AgentSkillGitInstallResult
export type WorkspaceFileChangeIPCEvent = {
  directory: string
  paths: string[]
}
export type WorkspaceFileDocument = AgentWorkspaceFileDocument
export type WorkspaceDirectoryEntry = AgentWorkspaceDirectoryEntry
export type WorkspaceFileSearchResult = AgentWorkspaceFileSearchResult
export type GlobalSkillFileDocument = AgentGlobalSkillFileDocument
export type GlobalSkillTree = AgentGlobalSkillTree
export type PromptPresetDocument = AgentPromptPresetDocument
export type PromptPresetSelection = AgentPromptPresetSelection
export type PromptPresetSummary = AgentPromptPresetSummary
export type PromptUrlInstallCandidate = AgentPromptUrlInstallCandidate
export type PromptUrlInstallPreview = AgentPromptUrlInstallPreview
export type PromptUrlInstallResult = AgentPromptUrlInstallResult
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

export interface DesktopStoragePaths {
  appData: string
  agentRoot: string
  agentData: string
  agentCache: string
  installedPlugins: string
  pluginRegistryCache: string
  pluginInstallTemp: string
}

export interface DesktopWindowState {
  isMaximized: boolean
}

export type WorkbenchWindowKind = "main" | "session-popout"
export type WorkbenchSurfaceKind = "main" | "session-popout"
export type WorkbenchPanelPlacement = "within" | "left" | "right" | "top" | "bottom"

export interface WorkbenchPanelReference {
  kind: "session"
  sessionID: string
}

export interface WorkbenchWindowSummary {
  id: string
  kind: WorkbenchWindowKind
  ownedPanelIDs: string[]
  surfaceID?: string
}

export interface WorkbenchSurfaceSummary {
  surfaceID: string
  kind: WorkbenchSurfaceKind
  windowID: string
  ownedPanelIDs: string[]
  layout?: unknown
}

export interface WorkbenchPanelOwnership {
  panelID: string
  ownerWindowID: string
  ownerSurfaceID?: string
  reference: WorkbenchPanelReference
  lastMainGroupID?: string | null
  title?: string
}

export interface WorkbenchPaneRenderSnapshot {
  panelID: string
  reference: WorkbenchPanelReference
  title?: string
}

export interface WorkbenchSharedState {
  version: number
  windows: WorkbenchWindowSummary[]
  surfaces?: WorkbenchSurfaceSummary[]
  ownership: WorkbenchPanelOwnership[]
  panels: Record<string, WorkbenchPaneRenderSnapshot>
}

export interface WorkbenchWindowContext {
  windowID: string
  kind: WorkbenchWindowKind
  surfaceID?: string
  ownedPanelIDs: string[]
  panelID?: string
  reference?: WorkbenchPanelReference | null
  state: WorkbenchSharedState
}

export interface WorkbenchWindowBounds {
  height: number
  width: number
  x?: number
  y?: number
}

export interface WorkbenchDetachSessionPanelInput {
  bounds?: WorkbenchWindowBounds
  lastMainGroupID?: string | null
  panelID: string
  sessionID: string
  sourceSurfaceID?: string | null
  title?: string
}

export interface WorkbenchDetachSessionPanelResult {
  ok: boolean
  panelID: string
  reason?: string
  windowID: string
  state: WorkbenchSharedState
}

export interface WorkbenchWindowReadyInput {
  windowID: string
}

export interface WorkbenchPanelMountedInput {
  panelID: string
  windowID: string
}

export interface WorkbenchDockSessionPanelInput {
  panelID: string
  reason?: "button" | "close" | "crash" | "timeout"
  targetGroupID?: string | null
  windowID?: string
}

export interface WorkbenchMoveSessionPanelInput {
  panelID: string
  placement?: WorkbenchPanelPlacement
  sourceSurfaceID?: string | null
  targetGroupID?: string | null
  targetSurfaceID: string
}

export interface WorkbenchMoveSessionPanelResult {
  ok: boolean
  reason?: string
  state: WorkbenchSharedState
}

export interface WorkbenchFocusSessionPanelInput {
  panelID: string
}

export interface WorkbenchFocusSessionPanelResult {
  ok: boolean
  panelID: string
  reason?: string
  state: WorkbenchSharedState
  windowID?: string
}

export interface WorkbenchPanelDragInput {
  dragID: string
  panelID: string
  sourceSurfaceID: string
}

export interface WorkbenchPanelDragState extends WorkbenchPanelDragInput {
  startedAt: number
}

export interface WorkbenchPanelMoveEvent {
  panelID: string
  placement: WorkbenchPanelPlacement
  reference: WorkbenchPanelReference
  sourceSurfaceID: string
  targetGroupID?: string | null
  targetSurfaceID: string
  title?: string
}

export interface WorkbenchStateEvent {
  reason: "snapshot" | "detached" | "dock" | "restored" | "move" | "focus"
  panelID?: string
  move?: WorkbenchPanelMoveEvent
  state: WorkbenchSharedState
}

export interface DesktopAgentHealth {
  ok: boolean
  baseURL: string
  requestId?: string
  error?: string
}

export interface DesktopComposerPastedImageAttachment {
  dataUrl: string
  mimeType: string
  name?: string
}

export interface DesktopSaveComposerPastedImagesInput {
  images: DesktopComposerPastedImageAttachment[]
}

export interface DesktopPreviewScreenshotCaptureInput {
  bounds: {
    height: number
    width: number
    x: number
    y: number
  }
  url?: string
}

export interface DesktopPreviewScreenshotCaptureResult {
  path: string
}

export interface DesktopLocalPreviewService {
  port: number
  statusCode: number
  url: string
}

export type DesktopPreviewTargetKind = "url" | "artifact" | "file"
export type DesktopPreviewRenderer =
  | "url-webview"
  | "markdown-preview"
  | "html-preview"
  | "svg-preview"
  | "json-viewer"
  | "table-preview"
  | "image-preview"
  | "code-viewer"
  | "system-open"

export interface DesktopResolvePreviewTargetInput {
  value: string
  workspaceRoot?: string | null
}

export interface DesktopPreviewExternalOpenTarget {
  kind: "url" | "path"
  value: string
}

export interface DesktopResolvedPreviewTarget {
  artifactID?: string
  artifactType?: string
  entry?: string
  error?: string
  externalOpenTarget?: DesktopPreviewExternalOpenTarget
  input: string
  kind: DesktopPreviewTargetKind
  mime: string
  normalizedInput: string
  path?: string
  renderer: DesktopPreviewRenderer
  safePreviewUrl?: string
  textReadable: boolean
  title: string
  workspaceRoot?: string
}

export interface DesktopReadPreviewTextInput {
  path: string
  workspaceRoot?: string | null
}

export interface DesktopReadPreviewTextResult {
  content: string
  path: string
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
  image_model?: string | null
  image_generation?: {
    default_size?: string
    default_count?: number
  } | null
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

export interface DesktopAgentSessionInterruptResult {
  backendSessionID: string
  clientTurnID?: string
  localRequestsAborted: number
  backendCancelled: boolean
  activeCancelled?: boolean
  queuedCancelled?: number
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

export interface DesktopSaveSessionTraceExportResult {
  canceled: boolean
  path?: string
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
  "desktop:get-storage-paths": {
    input: void
    output: DesktopStoragePaths
  }
  "desktop:get-window-state": {
    input: void
    output: DesktopWindowState
  }
  "desktop:get-workbench-window-context": {
    input: void
    output: WorkbenchWindowContext
  }
  "desktop:workbench-publish-state-snapshot": {
    input: WorkbenchSharedState
    output: WorkbenchSharedState
  }
  "desktop:workbench-detach-session-panel": {
    input: WorkbenchDetachSessionPanelInput
    output: WorkbenchDetachSessionPanelResult
  }
  "desktop:workbench-window-ready": {
    input: WorkbenchWindowReadyInput
    output: void
  }
  "desktop:workbench-panel-mounted": {
    input: WorkbenchPanelMountedInput
    output: WorkbenchSharedState
  }
  "desktop:workbench-dock-session-panel": {
    input: WorkbenchDockSessionPanelInput
    output: WorkbenchSharedState
  }
  "desktop:workbench-move-session-panel": {
    input: WorkbenchMoveSessionPanelInput
    output: WorkbenchMoveSessionPanelResult
  }
  "desktop:workbench-focus-session-panel": {
    input: WorkbenchFocusSessionPanelInput
    output: WorkbenchFocusSessionPanelResult
  }
  "desktop:workbench-begin-panel-drag": {
    input: WorkbenchPanelDragInput
    output: WorkbenchPanelDragState
  }
  "desktop:workbench-end-panel-drag": {
    input: { dragID: string }
    output: void
  }
  "desktop:workbench-get-panel-drag": {
    input: { dragID?: string }
    output: WorkbenchPanelDragState | null
  }
  "desktop:get-appearance-config": {
    input: void
    output: AppearanceConfigSnapshot
  }
  "desktop:save-appearance-config": {
    input: { document: AppearanceConfigDocument }
    output: AppearanceConfigSnapshot
  }
  "desktop:get-locale-config": {
    input: void
    output: LocaleConfigSnapshot
  }
  "desktop:save-locale-config": {
    input: { document: LocaleConfigDocument }
    output: LocaleConfigSnapshot
  }
  "desktop:window-action": {
    input: WindowAction
    output: void
  }
  "desktop:open-external-url": {
    input: { url: string }
    output: { ok: true; url: string }
  }
  "desktop:open-path": {
    input: DesktopOpenPathInput
    output: DesktopOpenPathResult
  }
  "desktop:open-monitor-window": {
    input: void
    output:
      | { ok: true; reused: false; source: "dev-server"; url: string }
      | { filePath: string; ok: true; reused: false; source: "file" }
      | { ok: true; reused: true; source: "existing" }
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
    input: { sessionID: string; title?: string; shell?: string; rows?: number; cols?: number }
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
  "desktop:save-composer-pasted-images": {
    input: DesktopSaveComposerPastedImagesInput
    output: string[]
  }
  "desktop:capture-preview-screenshot": {
    input: DesktopPreviewScreenshotCaptureInput
    output: DesktopPreviewScreenshotCaptureResult
  }
  "desktop:detect-local-preview-services": {
    input: void
    output: DesktopLocalPreviewService[]
  }
  "desktop:resolve-preview-target": {
    input: DesktopResolvePreviewTargetInput
    output: DesktopResolvedPreviewTarget
  }
  "desktop:read-preview-text": {
    input: DesktopReadPreviewTextInput
    output: DesktopReadPreviewTextResult
  }
  "desktop:git-get-capabilities": {
    input: GitGetCapabilitiesInput
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
    input: { sessionID: string; scope?: AgentSessionDiffScope }
    output: AgentSessionDiffSummary
  }
  "desktop:get-session-tasks": {
    input: { sessionID: string }
    output: AgentSessionTaskListView
  }
  "desktop:restore-workspace-diff-file": {
    input: { directory: string; file: string }
    output: WorkspaceDiffFileRestoreResult
  }
  "desktop:stage-workspace-diff-file": {
    input: { directory: string; file: string }
    output: WorkspaceDiffFileRestoreResult
  }
  "desktop:unstage-workspace-diff-file": {
    input: { directory: string; file: string }
    output: WorkspaceDiffFileRestoreResult
  }
  "desktop:reverse-apply-workspace-diff-patches": {
    input: WorkspaceDiffPatchReverseApplyInput
    output: WorkspaceDiffPatchReverseApplyResult
  }
  "desktop:get-session-runtime-debug": {
    input: { sessionID: string; limit?: number; turns?: number }
    output: AgentSessionRuntimeDebugSnapshot
  }
  "desktop:get-session-trace-export": {
    input: { sessionID: string }
    output: AgentSessionTraceExport
  }
  "desktop:save-session-trace-export": {
    input: { sessionID: string }
    output: DesktopSaveSessionTraceExportResult
  }
  "desktop:update-session-workflow": {
    input: { sessionID: string } & AgentSessionWorkflowUpdateInput
    output: DesktopSessionMutationResult
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
    input: {
      providerID: string
      method: string
      baseURL?: string | null
    }
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
    input: DesktopPluginCatalogInput | void
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
  "desktop:get-connector-catalog": {
    input: void
    output: AgentConnectorDefinition[]
  }
  "desktop:get-connectors": {
    input: void
    output: AgentConnectorStatus[]
  }
  "desktop:get-connector": {
    input: { connectorID: string }
    output: AgentConnectorStatus
  }
  "desktop:save-connector-api-key": {
    input: { connectorID: string; apiKey?: string | null }
    output: AgentConnectorStatus
  }
  "desktop:delete-connector-api-key": {
    input: { connectorID: string }
    output: AgentConnectorStatus
  }
  "desktop:save-connector-config": {
    input: { connectorID: string; config: Record<string, string | null | undefined> }
    output: AgentConnectorStatus
  }
  "desktop:delete-connector-config": {
    input: { connectorID: string }
    output: AgentConnectorStatus
  }
  "desktop:start-connector-auth-flow": {
    input: { connectorID: string }
    output: AgentProviderAuthFlow
  }
  "desktop:get-connector-auth-flow": {
    input: { connectorID: string; flowID: string }
    output: AgentProviderAuthFlow | undefined
  }
  "desktop:cancel-connector-auth-flow": {
    input: { connectorID: string; flowID: string }
    output: AgentProviderAuthFlow | undefined
  }
  "desktop:delete-connector-auth-session": {
    input: { connectorID: string }
    output: AgentConnectorStatus
  }
  "desktop:get-connector-diagnostic": {
    input: { connectorID: string }
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
  "desktop:start-installed-plugin-connector-auth-flow": {
    input: { pluginID: string; appID: string }
    output: AgentProviderAuthFlow
  }
  "desktop:get-installed-plugin-connector-auth-flow": {
    input: { pluginID: string; appID: string; flowID: string }
    output: AgentProviderAuthFlow | undefined
  }
  "desktop:cancel-installed-plugin-connector-auth-flow": {
    input: { pluginID: string; appID: string; flowID: string }
    output: AgentProviderAuthFlow | undefined
  }
  "desktop:delete-installed-plugin-connector-auth-session": {
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
  "desktop:preview-prompt-url-install": {
    input: { source: string }
    output: AgentPromptUrlInstallPreview
  }
  "desktop:install-prompts-from-url": {
    input: { previewID: string; promptIDs: string[] }
    output: AgentPromptUrlInstallResult
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
  "desktop:list-workspace-directory": {
    input: { directory: string; path?: string | null }
    output: AgentWorkspaceDirectoryEntry[]
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
    input: { name: string; parentDirectory?: string | null }
    output: { directory: string; file: AgentGlobalSkillFileDocument }
  }
  "desktop:preview-global-skill-git-install": {
    input: { source: string; parentDirectory?: string | null }
    output: AgentSkillGitInstallPreview
  }
  "desktop:install-global-skills-from-git": {
    input: { previewID: string; skillIDs: string[]; parentDirectory?: string | null }
    output: AgentSkillGitInstallResult
  }
  "desktop:install-global-skill-from-local-file": {
    input: { parentDirectory?: string | null } | undefined
    output: AgentSkillGitInstallResult | null
  }
  "desktop:rename-global-skill": {
    input: { directory: string; name: string }
    output: AgentGlobalSkillRenameResult
  }
  "desktop:delete-global-skill": {
    input: { directory: string }
    output: { directory: string; removed: boolean }
  }
  "desktop:create-global-skill-folder": {
    input: { name: string; parentDirectory?: string | null }
    output: AgentGlobalSkillFolderResult
  }
  "desktop:rename-global-skill-folder": {
    input: { directory: string; name: string }
    output: AgentGlobalSkillFolderRenameResult
  }
  "desktop:delete-global-skill-folder": {
    input: { directory: string }
    output: { directory: string; removed: boolean }
  }
  "desktop:move-global-skill-directory": {
    input: { directory: string; parentDirectory?: string | null }
    output: AgentGlobalSkillMoveResult
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
  "desktop:get-project-plugins": {
    input: { projectID: string }
    output: AgentInstalledPlugin[]
  }
  "desktop:get-project-plugin-selection": {
    input: { projectID: string }
    output: AgentProjectPluginSelection
  }
  "desktop:update-project-plugin-selection": {
    input: { projectID: string; pluginIDs: string[] }
    output: AgentProjectPluginSelection
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
    input: { backendSessionID: string; view?: "active" | "all" }
    output: AgentSessionHistoryMessage[]
  }
  "desktop:update-session-active-message": {
    input: { sessionID: string; messageID: string }
    output: AgentWorkspaceSession
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
  "desktop:agent-session-interrupt": {
    input: { backendSessionID: string; clientTurnID?: string; reason?: "user-interrupt" }
    output: DesktopAgentSessionInterruptResult
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
  [DESKTOP_WORKBENCH_STATE_EVENT_CHANNEL]: WorkbenchStateEvent
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
  interrupt(input: DesktopIpcInput<"desktop:agent-session-interrupt">): Promise<DesktopIpcOutput<"desktop:agent-session-interrupt">>
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
  getStoragePaths(): Promise<DesktopIpcOutput<"desktop:get-storage-paths">>
  getWindowState(): Promise<DesktopIpcOutput<"desktop:get-window-state">>
  getWorkbenchWindowContext(): Promise<DesktopIpcOutput<"desktop:get-workbench-window-context">>
  publishWorkbenchSnapshot(input: DesktopIpcInput<"desktop:workbench-publish-state-snapshot">): Promise<DesktopIpcOutput<"desktop:workbench-publish-state-snapshot">>
  detachSessionPanel(input: DesktopIpcInput<"desktop:workbench-detach-session-panel">): Promise<DesktopIpcOutput<"desktop:workbench-detach-session-panel">>
  markWorkbenchWindowReady(input: DesktopIpcInput<"desktop:workbench-window-ready">): Promise<DesktopIpcOutput<"desktop:workbench-window-ready">>
  markWorkbenchPanelMounted(input: DesktopIpcInput<"desktop:workbench-panel-mounted">): Promise<DesktopIpcOutput<"desktop:workbench-panel-mounted">>
  dockSessionPanel(input: DesktopIpcInput<"desktop:workbench-dock-session-panel">): Promise<DesktopIpcOutput<"desktop:workbench-dock-session-panel">>
  moveWorkbenchPanel(input: DesktopIpcInput<"desktop:workbench-move-session-panel">): Promise<DesktopIpcOutput<"desktop:workbench-move-session-panel">>
  focusWorkbenchPanel(input: DesktopIpcInput<"desktop:workbench-focus-session-panel">): Promise<DesktopIpcOutput<"desktop:workbench-focus-session-panel">>
  beginWorkbenchPanelDrag(input: DesktopIpcInput<"desktop:workbench-begin-panel-drag">): Promise<DesktopIpcOutput<"desktop:workbench-begin-panel-drag">>
  endWorkbenchPanelDrag(input: DesktopIpcInput<"desktop:workbench-end-panel-drag">): Promise<DesktopIpcOutput<"desktop:workbench-end-panel-drag">>
  getWorkbenchPanelDrag(input: DesktopIpcInput<"desktop:workbench-get-panel-drag">): Promise<DesktopIpcOutput<"desktop:workbench-get-panel-drag">>
  getAppearanceConfig(): Promise<DesktopIpcOutput<"desktop:get-appearance-config">>
  saveAppearanceConfig(input: DesktopIpcInput<"desktop:save-appearance-config">): Promise<DesktopIpcOutput<"desktop:save-appearance-config">>
  getLocaleConfig(): Promise<DesktopIpcOutput<"desktop:get-locale-config">>
  saveLocaleConfig(input: DesktopIpcInput<"desktop:save-locale-config">): Promise<DesktopIpcOutput<"desktop:save-locale-config">>
  showMenu(menuKey: MenuKey, anchor?: MenuAnchor): Promise<DesktopIpcOutput<"desktop:show-menu">>
  showExternalEditorMenu(input: DesktopIpcInput<"desktop:show-external-editor-menu">): Promise<DesktopIpcOutput<"desktop:show-external-editor-menu">>
  listExternalEditorsForTarget(input: DesktopIpcInput<"desktop:list-external-editors-for-target">): Promise<DesktopIpcOutput<"desktop:list-external-editors-for-target">>
  openInExternalEditor(input: DesktopIpcInput<"desktop:open-in-external-editor">): Promise<DesktopIpcOutput<"desktop:open-in-external-editor">>
  openExternalUrl(input: DesktopIpcInput<"desktop:open-external-url">): Promise<DesktopIpcOutput<"desktop:open-external-url">>
  openPath(input: DesktopIpcInput<"desktop:open-path">): Promise<DesktopIpcOutput<"desktop:open-path">>
  openMonitorWindow(): Promise<DesktopIpcOutput<"desktop:open-monitor-window">>
  windowAction(action: DesktopIpcInput<"desktop:window-action">): Promise<DesktopIpcOutput<"desktop:window-action">>
  getAgentConfig(): Promise<DesktopIpcOutput<"desktop:get-agent-config">>
  getAgentHealth(): Promise<DesktopIpcOutput<"desktop:agent-health">>
  createPtySession(input: DesktopIpcInput<"desktop:create-pty-session">): Promise<DesktopIpcOutput<"desktop:create-pty-session">>
  getPtySession(input: DesktopIpcInput<"desktop:get-pty-session">): Promise<DesktopIpcOutput<"desktop:get-pty-session">>
  updatePtySession(input: DesktopIpcInput<"desktop:update-pty-session">): Promise<DesktopIpcOutput<"desktop:update-pty-session">>
  deletePtySession(input: DesktopIpcInput<"desktop:delete-pty-session">): Promise<DesktopIpcOutput<"desktop:delete-pty-session">>
  attachPtySession(input: DesktopIpcInput<"desktop:attach-pty-session">): Promise<DesktopIpcOutput<"desktop:attach-pty-session">>
  detachPtySession(input: DesktopIpcInput<"desktop:detach-pty-session">): Promise<DesktopIpcOutput<"desktop:detach-pty-session">>
  writePtyInput(input: DesktopIpcInput<"desktop:write-pty-input">): Promise<DesktopIpcOutput<"desktop:write-pty-input">>
  pickProjectDirectory(): Promise<DesktopIpcOutput<"desktop:pick-project-directory">>
  pickComposerAttachments(input?: DesktopIpcInput<"desktop:pick-composer-attachments">): Promise<DesktopIpcOutput<"desktop:pick-composer-attachments">>
  saveComposerPastedImages(input: DesktopIpcInput<"desktop:save-composer-pasted-images">): Promise<DesktopIpcOutput<"desktop:save-composer-pasted-images">>
  capturePreviewScreenshot(input: DesktopIpcInput<"desktop:capture-preview-screenshot">): Promise<DesktopIpcOutput<"desktop:capture-preview-screenshot">>
  detectLocalPreviewServices(): Promise<DesktopIpcOutput<"desktop:detect-local-preview-services">>
  resolvePreviewTarget(input: DesktopIpcInput<"desktop:resolve-preview-target">): Promise<DesktopIpcOutput<"desktop:resolve-preview-target">>
  readPreviewText(input: DesktopIpcInput<"desktop:read-preview-text">): Promise<DesktopIpcOutput<"desktop:read-preview-text">>
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
  updateSessionWorkflow(input: DesktopIpcInput<"desktop:update-session-workflow">): Promise<DesktopIpcOutput<"desktop:update-session-workflow">>
  updateSessionActiveMessage(input: DesktopIpcInput<"desktop:update-session-active-message">): Promise<DesktopIpcOutput<"desktop:update-session-active-message">>
  listSideChats(input: DesktopIpcInput<"desktop:list-side-chats">): Promise<DesktopIpcOutput<"desktop:list-side-chats">>
  getSideChatLink(input: DesktopIpcInput<"desktop:get-side-chat-link">): Promise<DesktopIpcOutput<"desktop:get-side-chat-link">>
  deleteProjectWorkspace(input: DesktopIpcInput<"desktop:delete-project-workspace">): Promise<DesktopIpcOutput<"desktop:delete-project-workspace">>
  deleteAgentSession(input: DesktopIpcInput<"desktop:delete-agent-session">): Promise<DesktopIpcOutput<"desktop:delete-agent-session">>
  archiveAgentSession(input: DesktopIpcInput<"desktop:archive-agent-session">): Promise<DesktopIpcOutput<"desktop:archive-agent-session">>
  listArchivedSessions(): Promise<DesktopIpcOutput<"desktop:list-archived-sessions">>
  restoreArchivedSession(input: DesktopIpcInput<"desktop:restore-archived-session">): Promise<DesktopIpcOutput<"desktop:restore-archived-session">>
  deleteArchivedSession(input: DesktopIpcInput<"desktop:delete-archived-session">): Promise<DesktopIpcOutput<"desktop:delete-archived-session">>
  getSessionDiff(input: DesktopIpcInput<"desktop:get-session-diff">): Promise<DesktopIpcOutput<"desktop:get-session-diff">>
  getSessionTasks(input: DesktopIpcInput<"desktop:get-session-tasks">): Promise<DesktopIpcOutput<"desktop:get-session-tasks">>
  restoreWorkspaceDiffFile(input: DesktopIpcInput<"desktop:restore-workspace-diff-file">): Promise<DesktopIpcOutput<"desktop:restore-workspace-diff-file">>
  stageWorkspaceDiffFile(input: DesktopIpcInput<"desktop:stage-workspace-diff-file">): Promise<DesktopIpcOutput<"desktop:stage-workspace-diff-file">>
  unstageWorkspaceDiffFile(input: DesktopIpcInput<"desktop:unstage-workspace-diff-file">): Promise<DesktopIpcOutput<"desktop:unstage-workspace-diff-file">>
  reverseApplyWorkspaceDiffPatches(input: DesktopIpcInput<"desktop:reverse-apply-workspace-diff-patches">): Promise<DesktopIpcOutput<"desktop:reverse-apply-workspace-diff-patches">>
  getSessionRuntimeDebug(input: DesktopIpcInput<"desktop:get-session-runtime-debug">): Promise<DesktopIpcOutput<"desktop:get-session-runtime-debug">>
  getSessionTraceExport(input: DesktopIpcInput<"desktop:get-session-trace-export">): Promise<DesktopIpcOutput<"desktop:get-session-trace-export">>
  saveSessionTraceExport(input: DesktopIpcInput<"desktop:save-session-trace-export">): Promise<DesktopIpcOutput<"desktop:save-session-trace-export">>
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
  getPluginCatalog(input?: DesktopIpcInput<"desktop:get-plugin-catalog">): Promise<DesktopIpcOutput<"desktop:get-plugin-catalog">>
  getInstalledPlugins(): Promise<DesktopIpcOutput<"desktop:get-installed-plugins">>
  installPlugin(input: DesktopIpcInput<"desktop:install-plugin">): Promise<DesktopIpcOutput<"desktop:install-plugin">>
  updateInstalledPlugin(input: DesktopIpcInput<"desktop:update-installed-plugin">): Promise<DesktopIpcOutput<"desktop:update-installed-plugin">>
  deleteInstalledPlugin(input: DesktopIpcInput<"desktop:delete-installed-plugin">): Promise<DesktopIpcOutput<"desktop:delete-installed-plugin">>
  getInstalledPluginDiagnostic(input: DesktopIpcInput<"desktop:get-installed-plugin-diagnostic">): Promise<DesktopIpcOutput<"desktop:get-installed-plugin-diagnostic">>
  getConnectorCatalog(): Promise<DesktopIpcOutput<"desktop:get-connector-catalog">>
  getConnectors(): Promise<DesktopIpcOutput<"desktop:get-connectors">>
  getConnector(input: DesktopIpcInput<"desktop:get-connector">): Promise<DesktopIpcOutput<"desktop:get-connector">>
  saveConnectorApiKey(input: DesktopIpcInput<"desktop:save-connector-api-key">): Promise<DesktopIpcOutput<"desktop:save-connector-api-key">>
  deleteConnectorApiKey(input: DesktopIpcInput<"desktop:delete-connector-api-key">): Promise<DesktopIpcOutput<"desktop:delete-connector-api-key">>
  saveConnectorConfig(input: DesktopIpcInput<"desktop:save-connector-config">): Promise<DesktopIpcOutput<"desktop:save-connector-config">>
  deleteConnectorConfig(input: DesktopIpcInput<"desktop:delete-connector-config">): Promise<DesktopIpcOutput<"desktop:delete-connector-config">>
  startConnectorAuthFlow(input: DesktopIpcInput<"desktop:start-connector-auth-flow">): Promise<DesktopIpcOutput<"desktop:start-connector-auth-flow">>
  getConnectorAuthFlow(input: DesktopIpcInput<"desktop:get-connector-auth-flow">): Promise<DesktopIpcOutput<"desktop:get-connector-auth-flow">>
  cancelConnectorAuthFlow(input: DesktopIpcInput<"desktop:cancel-connector-auth-flow">): Promise<DesktopIpcOutput<"desktop:cancel-connector-auth-flow">>
  deleteConnectorAuthSession(input: DesktopIpcInput<"desktop:delete-connector-auth-session">): Promise<DesktopIpcOutput<"desktop:delete-connector-auth-session">>
  getConnectorDiagnostic(input: DesktopIpcInput<"desktop:get-connector-diagnostic">): Promise<DesktopIpcOutput<"desktop:get-connector-diagnostic">>
  getInstalledPluginConnectors(input: DesktopIpcInput<"desktop:get-installed-plugin-connectors">): Promise<DesktopIpcOutput<"desktop:get-installed-plugin-connectors">>
  saveInstalledPluginConnectorApiKey(input: DesktopIpcInput<"desktop:save-installed-plugin-connector-api-key">): Promise<DesktopIpcOutput<"desktop:save-installed-plugin-connector-api-key">>
  deleteInstalledPluginConnectorApiKey(input: DesktopIpcInput<"desktop:delete-installed-plugin-connector-api-key">): Promise<DesktopIpcOutput<"desktop:delete-installed-plugin-connector-api-key">>
  startInstalledPluginConnectorAuthFlow(input: DesktopIpcInput<"desktop:start-installed-plugin-connector-auth-flow">): Promise<DesktopIpcOutput<"desktop:start-installed-plugin-connector-auth-flow">>
  getInstalledPluginConnectorAuthFlow(input: DesktopIpcInput<"desktop:get-installed-plugin-connector-auth-flow">): Promise<DesktopIpcOutput<"desktop:get-installed-plugin-connector-auth-flow">>
  cancelInstalledPluginConnectorAuthFlow(input: DesktopIpcInput<"desktop:cancel-installed-plugin-connector-auth-flow">): Promise<DesktopIpcOutput<"desktop:cancel-installed-plugin-connector-auth-flow">>
  deleteInstalledPluginConnectorAuthSession(input: DesktopIpcInput<"desktop:delete-installed-plugin-connector-auth-session">): Promise<DesktopIpcOutput<"desktop:delete-installed-plugin-connector-auth-session">>
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
  previewPromptUrlInstall(input: DesktopIpcInput<"desktop:preview-prompt-url-install">): Promise<DesktopIpcOutput<"desktop:preview-prompt-url-install">>
  installPromptsFromUrl(input: DesktopIpcInput<"desktop:install-prompts-from-url">): Promise<DesktopIpcOutput<"desktop:install-prompts-from-url">>
  getGlobalSkillsTree(): Promise<DesktopIpcOutput<"desktop:get-global-skills-tree">>
  readGlobalSkillFile(input: DesktopIpcInput<"desktop:read-global-skill-file">): Promise<DesktopIpcOutput<"desktop:read-global-skill-file">>
  searchWorkspaceFiles(input: DesktopIpcInput<"desktop:search-workspace-files">): Promise<DesktopIpcOutput<"desktop:search-workspace-files">>
  listWorkspaceDirectory(input: DesktopIpcInput<"desktop:list-workspace-directory">): Promise<DesktopIpcOutput<"desktop:list-workspace-directory">>
  readWorkspaceFile(input: DesktopIpcInput<"desktop:read-workspace-file">): Promise<DesktopIpcOutput<"desktop:read-workspace-file">>
  updateGlobalSkillFile(input: DesktopIpcInput<"desktop:update-global-skill-file">): Promise<DesktopIpcOutput<"desktop:update-global-skill-file">>
  updatePromptPreset(input: DesktopIpcInput<"desktop:update-prompt-preset">): Promise<DesktopIpcOutput<"desktop:update-prompt-preset">>
  updatePromptPresetSelection(input: DesktopIpcInput<"desktop:update-prompt-preset-selection">): Promise<DesktopIpcOutput<"desktop:update-prompt-preset-selection">>
  resetPromptPreset(input: DesktopIpcInput<"desktop:reset-prompt-preset">): Promise<DesktopIpcOutput<"desktop:reset-prompt-preset">>
  deletePromptPreset(input: DesktopIpcInput<"desktop:delete-prompt-preset">): Promise<DesktopIpcOutput<"desktop:delete-prompt-preset">>
  createGlobalSkill(input: DesktopIpcInput<"desktop:create-global-skill">): Promise<DesktopIpcOutput<"desktop:create-global-skill">>
  previewGlobalSkillGitInstall(input: DesktopIpcInput<"desktop:preview-global-skill-git-install">): Promise<DesktopIpcOutput<"desktop:preview-global-skill-git-install">>
  installGlobalSkillsFromGit(input: DesktopIpcInput<"desktop:install-global-skills-from-git">): Promise<DesktopIpcOutput<"desktop:install-global-skills-from-git">>
  installGlobalSkillFromLocalFile(input?: DesktopIpcInput<"desktop:install-global-skill-from-local-file">): Promise<DesktopIpcOutput<"desktop:install-global-skill-from-local-file">>
  renameGlobalSkill(input: DesktopIpcInput<"desktop:rename-global-skill">): Promise<DesktopIpcOutput<"desktop:rename-global-skill">>
  deleteGlobalSkill(input: DesktopIpcInput<"desktop:delete-global-skill">): Promise<DesktopIpcOutput<"desktop:delete-global-skill">>
  createGlobalSkillFolder(input: DesktopIpcInput<"desktop:create-global-skill-folder">): Promise<DesktopIpcOutput<"desktop:create-global-skill-folder">>
  renameGlobalSkillFolder(input: DesktopIpcInput<"desktop:rename-global-skill-folder">): Promise<DesktopIpcOutput<"desktop:rename-global-skill-folder">>
  deleteGlobalSkillFolder(input: DesktopIpcInput<"desktop:delete-global-skill-folder">): Promise<DesktopIpcOutput<"desktop:delete-global-skill-folder">>
  moveGlobalSkillDirectory(input: DesktopIpcInput<"desktop:move-global-skill-directory">): Promise<DesktopIpcOutput<"desktop:move-global-skill-directory">>
  getProjectProviderCatalog(input: DesktopIpcInput<"desktop:get-project-provider-catalog">): Promise<DesktopIpcOutput<"desktop:get-project-provider-catalog">>
  refreshProjectProviderCatalog(input: DesktopIpcInput<"desktop:refresh-project-provider-catalog">): Promise<DesktopIpcOutput<"desktop:refresh-project-provider-catalog">>
  getProjectModels(input: DesktopIpcInput<"desktop:get-project-models">): Promise<DesktopIpcOutput<"desktop:get-project-models">>
  getSessionModels(input: DesktopIpcInput<"desktop:get-session-models">): Promise<DesktopIpcOutput<"desktop:get-session-models">>
  getProjectSkills(input: DesktopIpcInput<"desktop:get-project-skills">): Promise<DesktopIpcOutput<"desktop:get-project-skills">>
  getProjectSkillSelection(input: DesktopIpcInput<"desktop:get-project-skill-selection">): Promise<DesktopIpcOutput<"desktop:get-project-skill-selection">>
  updateProjectSkillSelection(input: DesktopIpcInput<"desktop:update-project-skill-selection">): Promise<DesktopIpcOutput<"desktop:update-project-skill-selection">>
  getProjectPlugins(input: DesktopIpcInput<"desktop:get-project-plugins">): Promise<DesktopIpcOutput<"desktop:get-project-plugins">>
  getProjectPluginSelection(input: DesktopIpcInput<"desktop:get-project-plugin-selection">): Promise<DesktopIpcOutput<"desktop:get-project-plugin-selection">>
  updateProjectPluginSelection(input: DesktopIpcInput<"desktop:update-project-plugin-selection">): Promise<DesktopIpcOutput<"desktop:update-project-plugin-selection">>
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
  onWorkbenchStateChange(listener: (event: DesktopIpcEventPayload<typeof DESKTOP_WORKBENCH_STATE_EVENT_CHANNEL>) => void): () => void
}

export type DesktopPreloadApi = DesktopApiBase & DesktopApiMethods
export type DesktopApi = DesktopApiBase & Pick<DesktopApiMethods, "getInfo"> & Partial<DesktopApiMethods>
