import { contextBridge, ipcRenderer } from "electron"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import type {
  AgentArchivedSessionSummary,
  AgentFolderWorkspace,
  AgentProjectModelSelection,
  AgentProjectWorkspace,
  AgentProviderAuthFlow,
  AgentProviderAuthState,
  AgentProviderCatalogItem,
  AgentProviderModel,
  AgentSessionBridgeIPCEvent,
  AgentSessionHistoryMessage,
  AgentSessionRuntimeDebugSnapshot,
  AgentSessionSummary,
  AgentSessionTurnRequestInput,
  AgentSideChatLink,
  AppearanceConfigDocument,
  AppearanceConfigSnapshot,
  DesktopIpcChannel,
  DesktopIpcInput,
  DesktopIpcOutput,
  DesktopPreloadApi,
  ExternalEditorSummary,
  GitActionResult,
  GitBranchSummary,
  GitCapabilities,
  GlobalSkillFileDocument,
  GlobalSkillTree,
  McpServerDiagnostic,
  McpServerInput,
  McpServerSummary,
  MenuAnchor,
  MenuKey,
  PermissionRequestPrompt,
  PermissionResolveInput,
  PermissionResolveResult,
  ProjectMcpSelection,
  ProjectSkillSelection,
  PromptPresetDocument,
  PromptPresetSelection,
  PromptPresetSummary,
  PtyIPCEvent,
  PtySessionInfo,
  SkillInfo,
  WindowAction,
  WorkspaceFileChangeIPCEvent,
  WorkspaceFileDocument,
  WorkspaceFileSearchResult,
} from "../shared/desktop-ipc-contract"
import {
  DESKTOP_AGENT_SESSION_EVENT_CHANNEL,
  DESKTOP_PTY_EVENT_CHANNEL,
  DESKTOP_WINDOW_STATE_EVENT_CHANNEL,
  DESKTOP_WORKSPACE_FILE_CHANGE_EVENT_CHANNEL,
} from "../shared/desktop-ipc-contract"

const safeProcess = typeof process !== "undefined" ? process : undefined
const preloadDirPath = path.dirname(fileURLToPath(import.meta.url))

function resolvePreviewGuestPreloadPath() {
  const candidatePaths = [
    path.join(preloadDirPath, "preview-webview.mjs"),
    path.join(preloadDirPath, "preview-webview.js"),
  ]

  const resolved = candidatePaths.find((candidate) => fs.existsSync(candidate))
  if (!resolved) {
    console.error("[desktop] preview webview preload not found, candidates:", candidatePaths)
    return undefined
  }

  return pathToFileURL(resolved).toString()
}

function invokeDesktop<Channel extends DesktopIpcChannel>(
  channel: Channel,
  ...args: undefined extends DesktopIpcInput<Channel>
    ? [input?: DesktopIpcInput<Channel>]
    : [input: DesktopIpcInput<Channel>]
) {
  return ipcRenderer.invoke(channel, ...args) as Promise<DesktopIpcOutput<Channel>>
}

try {
  contextBridge.exposeInMainWorld("desktop", {
    platform: safeProcess?.platform ?? "unknown",
    previewGuestPreloadPath: resolvePreviewGuestPreloadPath(),
    versions: safeProcess?.versions ?? {},
    getInfo: () =>
      invokeDesktop("desktop:get-info") as Promise<{
        platform: string
        electron: string
        chrome: string
        node: string
      }>,
    getWindowState: () =>
      invokeDesktop("desktop:get-window-state") as Promise<{
        isMaximized: boolean
      }>,
    getAppearanceConfig: () =>
      invokeDesktop("desktop:get-appearance-config") as Promise<AppearanceConfigSnapshot>,
    saveAppearanceConfig: (input: { document: AppearanceConfigDocument }) =>
      invokeDesktop("desktop:save-appearance-config", input) as Promise<AppearanceConfigSnapshot>,
    showMenu: (menuKey: MenuKey, anchor?: MenuAnchor) => invokeDesktop("desktop:show-menu", { menuKey, anchor }),
    showExternalEditorMenu: (input: { targetPath: string; anchor?: MenuAnchor }) =>
      invokeDesktop("desktop:show-external-editor-menu", input) as Promise<void>,
    listExternalEditorsForTarget: (input: { targetPath: string }) =>
      invokeDesktop("desktop:list-external-editors-for-target", input) as Promise<ExternalEditorSummary[]>,
    openInExternalEditor: (input: { targetPath: string; editorID?: string }) =>
      invokeDesktop("desktop:open-in-external-editor", input) as Promise<{
        ok: true
        editor: ExternalEditorSummary
        targetPath: string
      }>,
    openExternalUrl: (input: { url: string }) =>
      invokeDesktop("desktop:open-external-url", input) as Promise<{
        ok: true
        url: string
      }>,
    windowAction: (action: WindowAction) => invokeDesktop("desktop:window-action", action),
    getAgentConfig: () =>
      invokeDesktop("desktop:get-agent-config") as Promise<{
        baseURL: string
        defaultDirectory: string
      }>,
    getAgentHealth: () =>
      invokeDesktop("desktop:agent-health") as Promise<{
        ok: boolean
        baseURL: string
        requestId?: string
        error?: string
      }>,
    createPtySession: (input?: { title?: string; cwd?: string; shell?: string; rows?: number; cols?: number }) =>
      invokeDesktop("desktop:create-pty-session", input) as Promise<PtySessionInfo>,
    getPtySession: (input: { id: string }) =>
      invokeDesktop("desktop:get-pty-session", input) as Promise<PtySessionInfo>,
    updatePtySession: (input: { id: string; title?: string; rows?: number; cols?: number }) =>
      invokeDesktop("desktop:update-pty-session", input) as Promise<PtySessionInfo>,
    deletePtySession: (input: { id: string }) =>
      invokeDesktop("desktop:delete-pty-session", input) as Promise<PtySessionInfo>,
    attachPtySession: (input: { id: string; cursor?: number }) =>
      invokeDesktop("desktop:attach-pty-session", input) as Promise<PtySessionInfo>,
    detachPtySession: (input: { id: string }) =>
      invokeDesktop("desktop:detach-pty-session", input) as Promise<boolean>,
    writePtyInput: (input: { id: string; data: string }) =>
      invokeDesktop("desktop:write-pty-input", input) as Promise<void>,
    pickProjectDirectory: () => invokeDesktop("desktop:pick-project-directory") as Promise<string | null>,
    pickComposerAttachments: (input?: { allowImage?: boolean; allowPdf?: boolean }) =>
      invokeDesktop("desktop:pick-composer-attachments", input) as Promise<string[]>,
    gitGetCapabilities: (input: { projectID: string; directory: string }) =>
      invokeDesktop("desktop:git-get-capabilities", input) as Promise<GitCapabilities>,
    gitCommit: (input: { projectID: string; directory: string; message: string; stageAll?: boolean }) =>
      invokeDesktop("desktop:git-commit", input) as Promise<GitActionResult>,
    gitPush: (input: { projectID: string; directory: string }) =>
      invokeDesktop("desktop:git-push", input) as Promise<GitActionResult>,
    gitCreateBranch: (input: { projectID: string; directory: string; name: string }) =>
      invokeDesktop("desktop:git-create-branch", input) as Promise<GitActionResult>,
    gitListBranches: (input: { projectID: string; directory: string }) =>
      invokeDesktop("desktop:git-list-branches", input) as Promise<GitBranchSummary[]>,
    gitCheckoutBranch: (input: { projectID: string; directory: string; name: string }) =>
      invokeDesktop("desktop:git-checkout-branch", input) as Promise<GitActionResult>,
    gitCreatePullRequest: (input: { projectID: string; directory: string }) =>
      invokeDesktop("desktop:git-create-pull-request", input) as Promise<GitActionResult>,
    updateWorkspaceWatchDirectories: (input: { directories: string[] }) =>
      invokeDesktop("desktop:update-workspace-watch-directories", input) as Promise<{
        directories: string[]
      }>,
    listFolderWorkspaces: () =>
      invokeDesktop("desktop:list-folder-workspaces") as Promise<AgentFolderWorkspace[]>,
    listProjectWorkspaces: () =>
      invokeDesktop("desktop:list-project-workspaces") as Promise<AgentProjectWorkspace[]>,
    openFolderWorkspace: (input: { directory: string }) =>
      invokeDesktop("desktop:open-folder-workspace", input) as Promise<AgentFolderWorkspace>,
    createProjectWorkspace: (input: { directory: string }) =>
      invokeDesktop("desktop:create-project-workspace", input) as Promise<AgentProjectWorkspace>,
    createAgentSession: (input?: { directory?: string }) =>
      invokeDesktop("desktop:agent-create-session", input) as Promise<{
        session: AgentSessionSummary
        requestId?: string
      }>,
    createFolderSession: (input: { projectID: string; directory: string; title?: string }) =>
      invokeDesktop("desktop:create-folder-session", input) as Promise<{
        session: AgentSessionSummary
        requestId?: string
      }>,
    createProjectSession: (input: { projectID: string; title?: string; directory?: string }) =>
      invokeDesktop("desktop:create-project-session", input) as Promise<{
        session: AgentSessionSummary
        requestId?: string
      }>,
    createSideChat: (input: { parentSessionID: string; anchorMessageID: string }) =>
      invokeDesktop("desktop:create-side-chat", input) as Promise<{
        session: AgentSessionSummary
        requestId?: string
      }>,
    listSideChats: (input: { parentSessionID: string; anchorMessageID?: string }) =>
      invokeDesktop("desktop:list-side-chats", input) as Promise<AgentSideChatLink[]>,
    getSideChatLink: (input: { sessionID: string }) =>
      invokeDesktop("desktop:get-side-chat-link", input) as Promise<AgentSideChatLink>,
    deleteProjectWorkspace: (input: { projectID: string }) =>
      invokeDesktop("desktop:delete-project-workspace", input) as Promise<{
        projectID: string
        deletedSessionIDs: string[]
        requestId?: string
      }>,
    deleteAgentSession: (input: { sessionID: string }) =>
      invokeDesktop("desktop:delete-agent-session", input) as Promise<{
        sessionID: string
        projectID: string
        requestId?: string
      }>,
    archiveAgentSession: (input: { sessionID: string }) =>
      invokeDesktop("desktop:archive-agent-session", input) as Promise<{
        sessionID: string
        projectID: string
        directory: string
        archivedAt: number
        requestId?: string
      }>,
    listArchivedSessions: () =>
      invokeDesktop("desktop:list-archived-sessions") as Promise<AgentArchivedSessionSummary[]>,
    restoreArchivedSession: (input: { sessionID: string }) =>
      invokeDesktop("desktop:restore-archived-session", input) as Promise<{
        session: AgentSessionSummary
        requestId?: string
      }>,
    deleteArchivedSession: (input: { sessionID: string }) =>
      invokeDesktop("desktop:delete-archived-session", input) as Promise<{
        sessionID: string
        requestId?: string
      }>,
    getSessionDiff: (input: { sessionID: string }) =>
      invokeDesktop("desktop:get-session-diff", input) as Promise<{
        title?: string
        body?: string
        stats?: {
          additions: number
          deletions: number
          files: number
        }
        diffs: Array<{
          file: string
          additions: number
          deletions: number
          patch?: string
        }>
      }>,
    getSessionRuntimeDebug: (input: { sessionID: string; limit?: number; turns?: number }) =>
      invokeDesktop("desktop:get-session-runtime-debug", input) as Promise<AgentSessionRuntimeDebugSnapshot>,
    agentSession: {
      loadHistory: (input: { backendSessionID: string }) =>
        invokeDesktop("desktop:agent-session-load-history", input) as Promise<AgentSessionHistoryMessage[]>,
      sendTurn: (input: AgentSessionTurnRequestInput) =>
        invokeDesktop("desktop:agent-session-send-turn", input) as Promise<{
          clientTurnID: string
          requestId?: string
        }>,
      resumeTurn: (input: { clientTurnID: string; backendSessionID: string }) =>
        invokeDesktop("desktop:agent-session-resume-turn", input) as Promise<{
          clientTurnID: string
          requestId?: string
        }>,
      cancelTurn: (input: { clientTurnID: string; backendSessionID: string }) =>
        invokeDesktop("desktop:agent-session-cancel-turn", input) as Promise<{
          clientTurnID: string
          backendSessionID: string
          localRequestAborted: boolean
          backendCancelled: boolean
          backendCancelError?: string
        }>,
      subscribe: (input: { uiSessionID?: string; backendSessionID: string }) =>
        invokeDesktop("desktop:agent-session-subscribe", input) as Promise<{
          backendSessionID: string
          lastEventID?: string
        }>,
      unsubscribe: (input: { backendSessionID: string }) =>
        invokeDesktop("desktop:agent-session-unsubscribe", input) as Promise<{
          backendSessionID: string
          removed: boolean
        }>,
      loadPermissionRequests: (input: { backendSessionID: string }) =>
        invokeDesktop("desktop:agent-session-load-permission-requests", input) as Promise<PermissionRequestPrompt[]>,
      respondPermissionRequest: (input: PermissionResolveInput) =>
        invokeDesktop("desktop:agent-session-respond-permission-request", input) as Promise<PermissionResolveResult>,
      onEvent: (listener: (event: AgentSessionBridgeIPCEvent) => void) => {
        const wrappedListener = (_event: Electron.IpcRendererEvent, sessionEvent: AgentSessionBridgeIPCEvent) => {
          listener(sessionEvent)
        }

        ipcRenderer.on(DESKTOP_AGENT_SESSION_EVENT_CHANNEL, wrappedListener)

        return () => {
          ipcRenderer.removeListener(DESKTOP_AGENT_SESSION_EVENT_CHANNEL, wrappedListener)
        }
      },
    },
    getGlobalProviderCatalog: () =>
      invokeDesktop("desktop:get-global-provider-catalog") as Promise<AgentProviderCatalogItem[]>,
    refreshGlobalProviderCatalog: () =>
      invokeDesktop("desktop:refresh-global-provider-catalog") as Promise<AgentProviderCatalogItem[]>,
    getGlobalProviderAuth: (input: { providerID: string }) =>
      invokeDesktop("desktop:get-global-provider-auth", input) as Promise<AgentProviderAuthState>,
    startGlobalProviderAuthFlow: (input: { providerID: string; method: string }) =>
      invokeDesktop("desktop:start-global-provider-auth-flow", input) as Promise<AgentProviderAuthFlow>,
    getGlobalProviderAuthFlow: (input: { providerID: string; flowID: string }) =>
      invokeDesktop("desktop:get-global-provider-auth-flow", input) as Promise<AgentProviderAuthFlow>,
    cancelGlobalProviderAuthFlow: (input: { providerID: string; flowID: string }) =>
      invokeDesktop("desktop:cancel-global-provider-auth-flow", input) as Promise<AgentProviderAuthFlow>,
    saveGlobalProviderApiKey: (input: { providerID: string; apiKey?: string | null }) =>
      invokeDesktop("desktop:save-global-provider-api-key", input) as Promise<AgentProviderAuthState>,
    deleteGlobalProviderAuthSession: (input: { providerID: string }) =>
      invokeDesktop("desktop:delete-global-provider-auth-session", input) as Promise<AgentProviderAuthState>,
    getGlobalModels: () =>
      invokeDesktop("desktop:get-global-models") as Promise<{
        items: AgentProviderModel[]
        selection: AgentProjectModelSelection
      }>,
    updateGlobalProvider: (input: {
      providerID: string
      provider: {
        name?: string
        env?: string[]
        options?: {
          apiKey?: string
          baseURL?: string
        }
      }
    }) =>
      invokeDesktop("desktop:update-global-provider", input) as Promise<{
        provider: {
          id: string
          name: string
          available: boolean
          apiKeyConfigured: boolean
          baseURL?: string
        }
        selection: {
          model?: string
          small_model?: string
        }
      }>,
    deleteGlobalProvider: (input: { providerID: string }) =>
      invokeDesktop("desktop:delete-global-provider", input) as Promise<{
        providerID: string
        selection: {
          model?: string
          small_model?: string
        }
      }>,
    updateGlobalModelSelection: (input: {
      model?: string | null
      small_model?: string | null
    }) =>
      invokeDesktop("desktop:update-global-model-selection", input) as Promise<{
        model?: string
        small_model?: string
      }>,
    getGlobalMcpServers: () =>
      invokeDesktop("desktop:get-global-mcp-servers") as Promise<McpServerSummary[]>,
    updateGlobalMcpServer: (input: {
      serverID: string
      server: McpServerInput
    }) =>
      invokeDesktop("desktop:update-global-mcp-server", input) as Promise<McpServerSummary>,
    deleteGlobalMcpServer: (input: { serverID: string }) =>
      invokeDesktop("desktop:delete-global-mcp-server", input) as Promise<{
        serverID: string
        removed: boolean
      }>,
    getGlobalSkills: () =>
      invokeDesktop("desktop:get-global-skills") as Promise<SkillInfo[]>,
    getPromptPresets: () =>
      invokeDesktop("desktop:get-prompt-presets") as Promise<PromptPresetSummary[]>,
    getPromptPresetSelection: () =>
      invokeDesktop("desktop:get-prompt-preset-selection") as Promise<PromptPresetSelection>,
    readPromptPreset: (input: { presetID: string }) =>
      invokeDesktop("desktop:read-prompt-preset", input) as Promise<PromptPresetDocument>,
    createPromptPreset: (input: { label?: string; content?: string; description?: string }) =>
      invokeDesktop("desktop:create-prompt-preset", input) as Promise<PromptPresetDocument>,
    getGlobalSkillsTree: () =>
      invokeDesktop("desktop:get-global-skills-tree") as Promise<GlobalSkillTree>,
    readGlobalSkillFile: (input: { path: string }) =>
      invokeDesktop("desktop:read-global-skill-file", input) as Promise<GlobalSkillFileDocument>,
    searchWorkspaceFiles: (input: { directory: string; query: string }) =>
      invokeDesktop("desktop:search-workspace-files", input) as Promise<WorkspaceFileSearchResult[]>,
    readWorkspaceFile: (input: { directory: string; path: string }) =>
      invokeDesktop("desktop:read-workspace-file", input) as Promise<WorkspaceFileDocument>,
    updateGlobalSkillFile: (input: { path: string; content: string }) =>
      invokeDesktop("desktop:update-global-skill-file", input) as Promise<GlobalSkillFileDocument>,
    updatePromptPreset: (input: { presetID: string; label?: string; content: string; description?: string }) =>
      invokeDesktop("desktop:update-prompt-preset", input) as Promise<PromptPresetDocument>,
    updatePromptPresetSelection: (input: PromptPresetSelection) =>
      invokeDesktop("desktop:update-prompt-preset-selection", input) as Promise<PromptPresetSelection>,
    resetPromptPreset: (input: { presetID: string }) =>
      invokeDesktop("desktop:reset-prompt-preset", input) as Promise<PromptPresetDocument>,
    deletePromptPreset: (input: { presetID: string }) =>
      invokeDesktop("desktop:delete-prompt-preset", input) as Promise<PromptPresetSelection>,
    createGlobalSkill: (input: { name: string }) =>
      invokeDesktop("desktop:create-global-skill", input) as Promise<{
        directory: string
        file: GlobalSkillFileDocument
      }>,
    renameGlobalSkill: (input: { directory: string; name: string }) =>
      invokeDesktop("desktop:rename-global-skill", input) as Promise<{
        previousDirectory: string
        directory: string
        filePath: string | null
      }>,
    deleteGlobalSkill: (input: { directory: string }) =>
      invokeDesktop("desktop:delete-global-skill", input) as Promise<{
        directory: string
        removed: boolean
      }>,
    getProjectProviderCatalog: (input: { projectID: string }) =>
      invokeDesktop("desktop:get-project-provider-catalog", input) as Promise<AgentProviderCatalogItem[]>,
    refreshProjectProviderCatalog: (input: { projectID: string }) =>
      invokeDesktop("desktop:refresh-project-provider-catalog", input) as Promise<AgentProviderCatalogItem[]>,
    getProjectModels: (input: { projectID: string }) =>
      invokeDesktop("desktop:get-project-models", input) as Promise<{
        items: Array<{
          id: string
          providerID: string
          name: string
          family?: string
          status: "alpha" | "beta" | "deprecated" | "active"
          available: boolean
          capabilities: {
            temperature: boolean
            reasoning: boolean
            attachment: boolean
            toolcall: boolean
            input: {
              text: boolean
              audio: boolean
              image: boolean
              video: boolean
              pdf: boolean
            }
            output: {
              text: boolean
              audio: boolean
              image: boolean
              video: boolean
              pdf: boolean
            }
          }
          limit: {
            context: number
            input?: number
            output: number
          }
        }>
        selection: {
          model?: string
          small_model?: string
        }
        effectiveModel?: {
          id: string
          providerID: string
          name: string
          family?: string
          status: "alpha" | "beta" | "deprecated" | "active"
          available: boolean
          capabilities: {
            temperature: boolean
            reasoning: boolean
            attachment: boolean
            toolcall: boolean
            input: {
              text: boolean
              audio: boolean
              image: boolean
              video: boolean
              pdf: boolean
            }
            output: {
              text: boolean
              audio: boolean
              image: boolean
              video: boolean
              pdf: boolean
            }
          }
          limit: {
            context: number
            input?: number
            output: number
          }
        } | null
      }>,
    getProjectSkills: (input: { projectID: string }) =>
      invokeDesktop("desktop:get-project-skills", input) as Promise<SkillInfo[]>,
    getProjectSkillSelection: (input: { projectID: string }) =>
      invokeDesktop("desktop:get-project-skill-selection", input) as Promise<ProjectSkillSelection>,
    updateProjectSkillSelection: (input: { projectID: string; skillIDs: string[] }) =>
      invokeDesktop("desktop:update-project-skill-selection", input) as Promise<ProjectSkillSelection>,
    getProjectMcpSelection: (input: { projectID: string }) =>
      invokeDesktop("desktop:get-project-mcp-selection", input) as Promise<ProjectMcpSelection>,
    updateProjectMcpSelection: (input: { projectID: string; serverIDs: string[] }) =>
      invokeDesktop("desktop:update-project-mcp-selection", input) as Promise<ProjectMcpSelection>,
    getProjectMcpServers: (input: { projectID: string }) =>
      invokeDesktop("desktop:get-project-mcp-servers", input) as Promise<McpServerSummary[]>,
    getProjectMcpServerDiagnostic: (input: { projectID: string; serverID: string }) =>
      invokeDesktop("desktop:get-project-mcp-server-diagnostic", input) as Promise<McpServerDiagnostic>,
    updateProjectMcpServer: (input: {
      projectID: string
      serverID: string
      server: McpServerInput
    }) =>
      invokeDesktop("desktop:update-project-mcp-server", input) as Promise<McpServerSummary>,
    deleteProjectMcpServer: (input: { projectID: string; serverID: string }) =>
      invokeDesktop("desktop:delete-project-mcp-server", input) as Promise<{
        serverID: string
        removed: boolean
      }>,
    updateProjectProvider: (input: {
      projectID: string
      providerID: string
      provider: {
        name?: string
        env?: string[]
        options?: {
          apiKey?: string
          baseURL?: string
        }
      }
    }) =>
      invokeDesktop("desktop:update-project-provider", input) as Promise<{
        provider: {
          id: string
          name: string
          available: boolean
          apiKeyConfigured: boolean
          baseURL?: string
        }
        selection: {
          model?: string
          small_model?: string
        }
      }>,
    deleteProjectProvider: (input: { projectID: string; providerID: string }) =>
      invokeDesktop("desktop:delete-project-provider", input) as Promise<{
        providerID: string
        selection: {
          model?: string
          small_model?: string
        }
      }>,
    updateProjectModelSelection: (input: {
      projectID: string
      model?: string | null
      small_model?: string | null
    }) =>
      invokeDesktop("desktop:update-project-model-selection", input) as Promise<{
        model?: string
        small_model?: string
      }>,
    onWorkspaceFileChange: (listener: (event: WorkspaceFileChangeIPCEvent) => void) => {
      const wrappedListener = (_event: Electron.IpcRendererEvent, workspaceEvent: WorkspaceFileChangeIPCEvent) => {
        listener(workspaceEvent)
      }

      ipcRenderer.on(DESKTOP_WORKSPACE_FILE_CHANGE_EVENT_CHANNEL, wrappedListener)

      return () => {
        ipcRenderer.removeListener(DESKTOP_WORKSPACE_FILE_CHANGE_EVENT_CHANNEL, wrappedListener)
      }
    },
    onPtyEvent: (listener: (event: PtyIPCEvent) => void) => {
      const wrappedListener = (_event: Electron.IpcRendererEvent, ptyEvent: PtyIPCEvent) => {
        listener(ptyEvent)
      }

      ipcRenderer.on(DESKTOP_PTY_EVENT_CHANNEL, wrappedListener)

      return () => {
        ipcRenderer.removeListener(DESKTOP_PTY_EVENT_CHANNEL, wrappedListener)
      }
    },
    onWindowStateChange: (listener: (state: { isMaximized: boolean }) => void) => {
      const wrappedListener = (_event: Electron.IpcRendererEvent, state: { isMaximized: boolean }) => {
        listener(state)
      }

      ipcRenderer.on(DESKTOP_WINDOW_STATE_EVENT_CHANNEL, wrappedListener)

      return () => {
        ipcRenderer.removeListener(DESKTOP_WINDOW_STATE_EVENT_CHANNEL, wrappedListener)
      }
    },
  } satisfies DesktopPreloadApi)
} catch (error) {
  console.error("[desktop] preload expose failed:", error)
}
