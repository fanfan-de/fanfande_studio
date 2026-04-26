import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { contextBridge, ipcRenderer } from "electron"
import type {
  PermissionRequestPrompt,
  PermissionResolveInput,
  PermissionResolveResult,
} from "../shared/permission"
import type { AppearanceConfigDocument, AppearanceConfigSnapshot } from "../shared/appearance"
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
  AgentSessionTurnRequestInput,
  AgentSideChatLink,
  AgentWorkspaceSession,
} from "../main/types"

type MenuKey = "file" | "edit" | "view" | "window" | "help"
type WindowAction = "minimize" | "toggle-maximize" | "close"
type MenuAnchor = {
  x: number
  y: number
}
type ExternalEditorSummary = {
  id: string
  label: string
  executablePath: string
  iconPath?: string
  iconDataUrl?: string
}
type AgentSSEEvent = {
  id?: string
  event: string
  data: unknown
}
type AgentStreamIPCEvent = AgentSSEEvent & {
  streamID: string
}
type AgentSessionStreamIPCEvent = AgentSSEEvent & {
  sessionID: string
}
type WorkspaceFileChangeIPCEvent = {
  directory: string
  paths: string[]
}
type PtySessionInfo = {
  id: string
  title: string
  cwd: string
  shell: string
  rows: number
  cols: number
  status: "running" | "exited" | "deleted"
  exitCode: number | null
  createdAt: number
  updatedAt: number
  cursor: number
}
type PtyReplayPayload = {
  mode: "delta" | "reset"
  buffer: string
  cursor: number
  startCursor: number
}
type PtyIPCEvent =
  | {
      ptyID: string
      type: "transport"
      state: "connecting" | "connected" | "disconnected" | "error"
      code?: number
      reason?: string
      userInitiated?: boolean
      message?: string
    }
  | {
      ptyID: string
      type: "ready"
      session: PtySessionInfo
      replay: PtyReplayPayload
    }
  | {
      ptyID: string
      type: "output"
      id: string
      data: string
      cursor: number
    }
  | {
      ptyID: string
      type: "state" | "exited" | "deleted"
      session: PtySessionInfo
    }
  | {
      ptyID: string
      type: "error"
      code: string
      message: string
    }
type GitActionResult = {
  directory: string
  root: string
  branch: string | null
  stdout: string
  stderr: string
  summary: string
  url?: string
}
type GitCapabilityState = {
  enabled: boolean
  reason?: string
}
type GitCapabilities = {
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
type GitBranchSummary = {
  name: string
  kind: "local" | "remote"
  current: boolean
}
type SkillInfo = {
  id: string
  name: string
  description: string
  path: string
  scope: "project" | "user"
}
type GlobalSkillTreeNode = {
  name: string
  path: string
  kind: "directory" | "file"
  children?: GlobalSkillTreeNode[]
}
type GlobalSkillTree = {
  root: string
  items: GlobalSkillTreeNode[]
}
type GlobalSkillFileDocument = {
  path: string
  content: string
}
type PromptPresetSummary = {
  id: string
  label: string
  description: string
  source: "bundled" | "custom"
  hasOverride: boolean
  editable: boolean
  sourcePath?: string
}
type PromptPresetDocument = PromptPresetSummary & {
  content: string
}
type PromptPresetSelection = {
  systemPromptPresetID: string
  planModePromptPresetID: string
}
type WorkspaceFileSearchResult = {
  path: string
  name: string
  extension: string | null
}
type WorkspaceFileDocument = {
  path: string
  name: string
  extension: string | null
  kind: "text" | "unsupported"
  content?: string
  unsupportedReason?: string
}
type ComposerAttachmentInput = {
  path: string
  name?: string
}
type ComposerPermissionMode = "default" | "full-access"
type OpenAIReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh"
type McpAllowedTools =
  | string[]
  | {
      readOnly?: boolean
      toolNames?: string[]
    }
type McpRequireApproval =
  | "always"
  | "never"
  | {
      never?: {
        toolNames?: string[]
      }
    }
type StdioMcpServerSummary = {
  id: string
  name?: string
  transport: "stdio"
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  enabled: boolean
  timeoutMs?: number
}
type RemoteMcpServerSummary = {
  id: string
  name?: string
  transport: "remote"
  provider?: "openai"
  serverUrl?: string
  connectorId?: string
  authorization?: string
  headers?: Record<string, string>
  serverDescription?: string
  allowedTools?: McpAllowedTools
  requireApproval?: McpRequireApproval
  enabled: boolean
  timeoutMs?: number
}
type McpServerSummary = StdioMcpServerSummary | RemoteMcpServerSummary
type McpServerDiagnostic = {
  serverID: string
  enabled: boolean
  ok: boolean
  toolCount: number
  toolNames: string[]
  error?: string
}
type ProjectSkillSelection = {
  skillIDs: string[]
}
type ProjectMcpSelection = {
  serverIDs: string[]
}
type AgentSessionSummary = AgentWorkspaceSession

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

try {
  contextBridge.exposeInMainWorld("desktop", {
    platform: safeProcess?.platform ?? "unknown",
    previewGuestPreloadPath: resolvePreviewGuestPreloadPath(),
    versions: safeProcess?.versions ?? {},
    getInfo: () =>
      ipcRenderer.invoke("desktop:get-info") as Promise<{
        platform: string
        electron: string
        chrome: string
        node: string
      }>,
    getWindowState: () =>
      ipcRenderer.invoke("desktop:get-window-state") as Promise<{
        isMaximized: boolean
      }>,
    getAppearanceConfig: () =>
      ipcRenderer.invoke("desktop:get-appearance-config") as Promise<AppearanceConfigSnapshot>,
    saveAppearanceConfig: (input: { document: AppearanceConfigDocument }) =>
      ipcRenderer.invoke("desktop:save-appearance-config", input) as Promise<AppearanceConfigSnapshot>,
    showMenu: (menuKey: MenuKey, anchor?: MenuAnchor) => ipcRenderer.invoke("desktop:show-menu", { menuKey, anchor }),
    showExternalEditorMenu: (input: { targetPath: string; anchor?: MenuAnchor }) =>
      ipcRenderer.invoke("desktop:show-external-editor-menu", input) as Promise<void>,
    listExternalEditorsForTarget: (input: { targetPath: string }) =>
      ipcRenderer.invoke("desktop:list-external-editors-for-target", input) as Promise<ExternalEditorSummary[]>,
    openInExternalEditor: (input: { targetPath: string; editorID?: string }) =>
      ipcRenderer.invoke("desktop:open-in-external-editor", input) as Promise<{
        ok: true
        editor: ExternalEditorSummary
        targetPath: string
      }>,
    openExternalUrl: (input: { url: string }) =>
      ipcRenderer.invoke("desktop:open-external-url", input) as Promise<{
        ok: true
        url: string
      }>,
    windowAction: (action: WindowAction) => ipcRenderer.invoke("desktop:window-action", action),
    getAgentConfig: () =>
      ipcRenderer.invoke("desktop:get-agent-config") as Promise<{
        baseURL: string
        defaultDirectory: string
      }>,
    getAgentHealth: () =>
      ipcRenderer.invoke("desktop:agent-health") as Promise<{
        ok: boolean
        baseURL: string
        requestId?: string
        error?: string
      }>,
    createPtySession: (input?: { title?: string; cwd?: string; shell?: string; rows?: number; cols?: number }) =>
      ipcRenderer.invoke("desktop:create-pty-session", input) as Promise<PtySessionInfo>,
    getPtySession: (input: { id: string }) =>
      ipcRenderer.invoke("desktop:get-pty-session", input) as Promise<PtySessionInfo>,
    updatePtySession: (input: { id: string; title?: string; rows?: number; cols?: number }) =>
      ipcRenderer.invoke("desktop:update-pty-session", input) as Promise<PtySessionInfo>,
    deletePtySession: (input: { id: string }) =>
      ipcRenderer.invoke("desktop:delete-pty-session", input) as Promise<PtySessionInfo>,
    attachPtySession: (input: { id: string; cursor?: number }) =>
      ipcRenderer.invoke("desktop:attach-pty-session", input) as Promise<PtySessionInfo>,
    detachPtySession: (input: { id: string }) =>
      ipcRenderer.invoke("desktop:detach-pty-session", input) as Promise<boolean>,
    writePtyInput: (input: { id: string; data: string }) =>
      ipcRenderer.invoke("desktop:write-pty-input", input) as Promise<void>,
    pickProjectDirectory: () => ipcRenderer.invoke("desktop:pick-project-directory") as Promise<string | null>,
    pickComposerAttachments: (input?: { allowImage?: boolean; allowPdf?: boolean }) =>
      ipcRenderer.invoke("desktop:pick-composer-attachments", input) as Promise<string[]>,
    gitGetCapabilities: (input: { projectID: string; directory: string }) =>
      ipcRenderer.invoke("desktop:git-get-capabilities", input) as Promise<GitCapabilities>,
    gitCommit: (input: { projectID: string; directory: string; message: string; stageAll?: boolean }) =>
      ipcRenderer.invoke("desktop:git-commit", input) as Promise<GitActionResult>,
    gitPush: (input: { projectID: string; directory: string }) =>
      ipcRenderer.invoke("desktop:git-push", input) as Promise<GitActionResult>,
    gitCreateBranch: (input: { projectID: string; directory: string; name: string }) =>
      ipcRenderer.invoke("desktop:git-create-branch", input) as Promise<GitActionResult>,
    gitListBranches: (input: { projectID: string; directory: string }) =>
      ipcRenderer.invoke("desktop:git-list-branches", input) as Promise<GitBranchSummary[]>,
    gitCheckoutBranch: (input: { projectID: string; directory: string; name: string }) =>
      ipcRenderer.invoke("desktop:git-checkout-branch", input) as Promise<GitActionResult>,
    gitCreatePullRequest: (input: { projectID: string; directory: string }) =>
      ipcRenderer.invoke("desktop:git-create-pull-request", input) as Promise<GitActionResult>,
    updateWorkspaceWatchDirectories: (input: { directories: string[] }) =>
      ipcRenderer.invoke("desktop:update-workspace-watch-directories", input) as Promise<{
        directories: string[]
      }>,
    listFolderWorkspaces: () =>
      ipcRenderer.invoke("desktop:list-folder-workspaces") as Promise<AgentFolderWorkspace[]>,
    listProjectWorkspaces: () =>
      ipcRenderer.invoke("desktop:list-project-workspaces") as Promise<AgentProjectWorkspace[]>,
    openFolderWorkspace: (input: { directory: string }) =>
      ipcRenderer.invoke("desktop:open-folder-workspace", input) as Promise<AgentFolderWorkspace>,
    createProjectWorkspace: (input: { directory: string }) =>
      ipcRenderer.invoke("desktop:create-project-workspace", input) as Promise<AgentProjectWorkspace>,
    createAgentSession: (input?: { directory?: string }) =>
      ipcRenderer.invoke("desktop:agent-create-session", input) as Promise<{
        session: AgentSessionSummary
        requestId?: string
      }>,
    createFolderSession: (input: { projectID: string; directory: string; title?: string }) =>
      ipcRenderer.invoke("desktop:create-folder-session", input) as Promise<{
        session: AgentSessionSummary
        requestId?: string
      }>,
    createProjectSession: (input: { projectID: string; title?: string; directory?: string }) =>
      ipcRenderer.invoke("desktop:create-project-session", input) as Promise<{
        session: AgentSessionSummary
        requestId?: string
      }>,
    createSideChat: (input: { parentSessionID: string; anchorMessageID: string }) =>
      ipcRenderer.invoke("desktop:create-side-chat", input) as Promise<{
        session: AgentSessionSummary
        requestId?: string
      }>,
    listSideChats: (input: { parentSessionID: string; anchorMessageID?: string }) =>
      ipcRenderer.invoke("desktop:list-side-chats", input) as Promise<AgentSideChatLink[]>,
    getSideChatLink: (input: { sessionID: string }) =>
      ipcRenderer.invoke("desktop:get-side-chat-link", input) as Promise<AgentSideChatLink>,
    deleteProjectWorkspace: (input: { projectID: string }) =>
      ipcRenderer.invoke("desktop:delete-project-workspace", input) as Promise<{
        projectID: string
        deletedSessionIDs: string[]
        requestId?: string
      }>,
    deleteAgentSession: (input: { sessionID: string }) =>
      ipcRenderer.invoke("desktop:delete-agent-session", input) as Promise<{
        sessionID: string
        projectID: string
        requestId?: string
      }>,
    archiveAgentSession: (input: { sessionID: string }) =>
      ipcRenderer.invoke("desktop:archive-agent-session", input) as Promise<{
        sessionID: string
        projectID: string
        directory: string
        archivedAt: number
        requestId?: string
      }>,
    listArchivedSessions: () =>
      ipcRenderer.invoke("desktop:list-archived-sessions") as Promise<AgentArchivedSessionSummary[]>,
    restoreArchivedSession: (input: { sessionID: string }) =>
      ipcRenderer.invoke("desktop:restore-archived-session", input) as Promise<{
        session: AgentSessionSummary
        requestId?: string
      }>,
    deleteArchivedSession: (input: { sessionID: string }) =>
      ipcRenderer.invoke("desktop:delete-archived-session", input) as Promise<{
        sessionID: string
        requestId?: string
      }>,
    getSessionHistory: (input: { sessionID: string }) =>
      ipcRenderer.invoke("desktop:get-session-history", input) as Promise<
        Array<{
          info: Record<string, unknown>
          parts: unknown[]
        }>
      >,
    getSessionDiff: (input: { sessionID: string }) =>
      ipcRenderer.invoke("desktop:get-session-diff", input) as Promise<{
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
      ipcRenderer.invoke("desktop:get-session-runtime-debug", input) as Promise<AgentSessionRuntimeDebugSnapshot>,
    getSessionPermissionRequests: (input: { sessionID: string }) =>
      ipcRenderer.invoke("desktop:get-session-permission-requests", input) as Promise<PermissionRequestPrompt[]>,
    respondPermissionRequest: (input: PermissionResolveInput) =>
      ipcRenderer.invoke("desktop:respond-permission-request", input) as Promise<PermissionResolveResult>,
    agentSession: {
      loadHistory: (input: { backendSessionID: string }) =>
        ipcRenderer.invoke("desktop:agent-session-load-history", input) as Promise<AgentSessionHistoryMessage[]>,
      sendTurn: (input: AgentSessionTurnRequestInput) =>
        ipcRenderer.invoke("desktop:agent-session-send-turn", input) as Promise<{
          clientTurnID: string
          requestId?: string
        }>,
      resumeTurn: (input: { clientTurnID: string; backendSessionID: string }) =>
        ipcRenderer.invoke("desktop:agent-session-resume-turn", input) as Promise<{
          clientTurnID: string
          requestId?: string
        }>,
      subscribe: (input: { uiSessionID?: string; backendSessionID: string }) =>
        ipcRenderer.invoke("desktop:agent-session-subscribe", input) as Promise<{
          backendSessionID: string
          lastEventID?: string
        }>,
      unsubscribe: (input: { backendSessionID: string }) =>
        ipcRenderer.invoke("desktop:agent-session-unsubscribe", input) as Promise<{
          backendSessionID: string
          removed: boolean
        }>,
      loadPermissionRequests: (input: { backendSessionID: string }) =>
        ipcRenderer.invoke("desktop:agent-session-load-permission-requests", input) as Promise<PermissionRequestPrompt[]>,
      respondPermissionRequest: (input: PermissionResolveInput) =>
        ipcRenderer.invoke("desktop:agent-session-respond-permission-request", input) as Promise<PermissionResolveResult>,
      onEvent: (listener: (event: AgentSessionBridgeIPCEvent) => void) => {
        const wrappedListener = (_event: Electron.IpcRendererEvent, sessionEvent: AgentSessionBridgeIPCEvent) => {
          listener(sessionEvent)
        }

        ipcRenderer.on("desktop:agent-session-event", wrappedListener)

        return () => {
          ipcRenderer.removeListener("desktop:agent-session-event", wrappedListener)
        }
      },
    },
    getGlobalProviderCatalog: () =>
      ipcRenderer.invoke("desktop:get-global-provider-catalog") as Promise<AgentProviderCatalogItem[]>,
    refreshGlobalProviderCatalog: () =>
      ipcRenderer.invoke("desktop:refresh-global-provider-catalog") as Promise<AgentProviderCatalogItem[]>,
    getGlobalProviderAuth: (input: { providerID: string }) =>
      ipcRenderer.invoke("desktop:get-global-provider-auth", input) as Promise<AgentProviderAuthState>,
    startGlobalProviderAuthFlow: (input: { providerID: string; method: string }) =>
      ipcRenderer.invoke("desktop:start-global-provider-auth-flow", input) as Promise<AgentProviderAuthFlow>,
    getGlobalProviderAuthFlow: (input: { providerID: string; flowID: string }) =>
      ipcRenderer.invoke("desktop:get-global-provider-auth-flow", input) as Promise<AgentProviderAuthFlow>,
    cancelGlobalProviderAuthFlow: (input: { providerID: string; flowID: string }) =>
      ipcRenderer.invoke("desktop:cancel-global-provider-auth-flow", input) as Promise<AgentProviderAuthFlow>,
    saveGlobalProviderApiKey: (input: { providerID: string; apiKey?: string | null }) =>
      ipcRenderer.invoke("desktop:save-global-provider-api-key", input) as Promise<AgentProviderAuthState>,
    deleteGlobalProviderAuthSession: (input: { providerID: string }) =>
      ipcRenderer.invoke("desktop:delete-global-provider-auth-session", input) as Promise<AgentProviderAuthState>,
    getGlobalModels: () =>
      ipcRenderer.invoke("desktop:get-global-models") as Promise<{
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
      ipcRenderer.invoke("desktop:update-global-provider", input) as Promise<{
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
      ipcRenderer.invoke("desktop:delete-global-provider", input) as Promise<{
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
      ipcRenderer.invoke("desktop:update-global-model-selection", input) as Promise<{
        model?: string
        small_model?: string
      }>,
    getGlobalMcpServers: () =>
      ipcRenderer.invoke("desktop:get-global-mcp-servers") as Promise<McpServerSummary[]>,
    updateGlobalMcpServer: (input: {
      serverID: string
      server: Omit<McpServerSummary, "id">
    }) =>
      ipcRenderer.invoke("desktop:update-global-mcp-server", input) as Promise<McpServerSummary>,
    deleteGlobalMcpServer: (input: { serverID: string }) =>
      ipcRenderer.invoke("desktop:delete-global-mcp-server", input) as Promise<{
        serverID: string
        removed: boolean
      }>,
    getGlobalSkills: () =>
      ipcRenderer.invoke("desktop:get-global-skills") as Promise<SkillInfo[]>,
    getPromptPresets: () =>
      ipcRenderer.invoke("desktop:get-prompt-presets") as Promise<PromptPresetSummary[]>,
    getPromptPresetSelection: () =>
      ipcRenderer.invoke("desktop:get-prompt-preset-selection") as Promise<PromptPresetSelection>,
    readPromptPreset: (input: { presetID: string }) =>
      ipcRenderer.invoke("desktop:read-prompt-preset", input) as Promise<PromptPresetDocument>,
    createPromptPreset: (input: { label?: string; content?: string; description?: string }) =>
      ipcRenderer.invoke("desktop:create-prompt-preset", input) as Promise<PromptPresetDocument>,
    getGlobalSkillsTree: () =>
      ipcRenderer.invoke("desktop:get-global-skills-tree") as Promise<GlobalSkillTree>,
    readGlobalSkillFile: (input: { path: string }) =>
      ipcRenderer.invoke("desktop:read-global-skill-file", input) as Promise<GlobalSkillFileDocument>,
    searchWorkspaceFiles: (input: { directory: string; query: string }) =>
      ipcRenderer.invoke("desktop:search-workspace-files", input) as Promise<WorkspaceFileSearchResult[]>,
    readWorkspaceFile: (input: { directory: string; path: string }) =>
      ipcRenderer.invoke("desktop:read-workspace-file", input) as Promise<WorkspaceFileDocument>,
    updateGlobalSkillFile: (input: { path: string; content: string }) =>
      ipcRenderer.invoke("desktop:update-global-skill-file", input) as Promise<GlobalSkillFileDocument>,
    updatePromptPreset: (input: { presetID: string; label?: string; content: string; description?: string }) =>
      ipcRenderer.invoke("desktop:update-prompt-preset", input) as Promise<PromptPresetDocument>,
    updatePromptPresetSelection: (input: PromptPresetSelection) =>
      ipcRenderer.invoke("desktop:update-prompt-preset-selection", input) as Promise<PromptPresetSelection>,
    resetPromptPreset: (input: { presetID: string }) =>
      ipcRenderer.invoke("desktop:reset-prompt-preset", input) as Promise<PromptPresetDocument>,
    deletePromptPreset: (input: { presetID: string }) =>
      ipcRenderer.invoke("desktop:delete-prompt-preset", input) as Promise<PromptPresetSelection>,
    createGlobalSkill: (input: { name: string }) =>
      ipcRenderer.invoke("desktop:create-global-skill", input) as Promise<{
        directory: string
        file: GlobalSkillFileDocument
      }>,
    renameGlobalSkill: (input: { directory: string; name: string }) =>
      ipcRenderer.invoke("desktop:rename-global-skill", input) as Promise<{
        previousDirectory: string
        directory: string
        filePath: string | null
      }>,
    deleteGlobalSkill: (input: { directory: string }) =>
      ipcRenderer.invoke("desktop:delete-global-skill", input) as Promise<{
        directory: string
        removed: boolean
      }>,
    getProjectProviderCatalog: (input: { projectID: string }) =>
      ipcRenderer.invoke("desktop:get-project-provider-catalog", input) as Promise<AgentProviderCatalogItem[]>,
    refreshProjectProviderCatalog: (input: { projectID: string }) =>
      ipcRenderer.invoke("desktop:refresh-project-provider-catalog", input) as Promise<AgentProviderCatalogItem[]>,
    getProjectModels: (input: { projectID: string }) =>
      ipcRenderer.invoke("desktop:get-project-models", input) as Promise<{
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
      ipcRenderer.invoke("desktop:get-project-skills", input) as Promise<SkillInfo[]>,
    getProjectSkillSelection: (input: { projectID: string }) =>
      ipcRenderer.invoke("desktop:get-project-skill-selection", input) as Promise<ProjectSkillSelection>,
    updateProjectSkillSelection: (input: { projectID: string; skillIDs: string[] }) =>
      ipcRenderer.invoke("desktop:update-project-skill-selection", input) as Promise<ProjectSkillSelection>,
    getProjectMcpSelection: (input: { projectID: string }) =>
      ipcRenderer.invoke("desktop:get-project-mcp-selection", input) as Promise<ProjectMcpSelection>,
    updateProjectMcpSelection: (input: { projectID: string; serverIDs: string[] }) =>
      ipcRenderer.invoke("desktop:update-project-mcp-selection", input) as Promise<ProjectMcpSelection>,
    getProjectMcpServers: (input: { projectID: string }) =>
      ipcRenderer.invoke("desktop:get-project-mcp-servers", input) as Promise<McpServerSummary[]>,
    getProjectMcpServerDiagnostic: (input: { projectID: string; serverID: string }) =>
      ipcRenderer.invoke("desktop:get-project-mcp-server-diagnostic", input) as Promise<McpServerDiagnostic>,
    updateProjectMcpServer: (input: {
      projectID: string
      serverID: string
      server: Omit<McpServerSummary, "id">
    }) =>
      ipcRenderer.invoke("desktop:update-project-mcp-server", input) as Promise<McpServerSummary>,
    deleteProjectMcpServer: (input: { projectID: string; serverID: string }) =>
      ipcRenderer.invoke("desktop:delete-project-mcp-server", input) as Promise<{
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
      ipcRenderer.invoke("desktop:update-project-provider", input) as Promise<{
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
      ipcRenderer.invoke("desktop:delete-project-provider", input) as Promise<{
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
      ipcRenderer.invoke("desktop:update-project-model-selection", input) as Promise<{
        model?: string
        small_model?: string
      }>,
    streamAgentMessage: (input: {
      streamID: string
      sessionID: string
      text?: string
      attachments?: ComposerAttachmentInput[]
      questionAnswer?: {
        questionID: string
        selectedOptions?: string[]
        freeformText?: string
      }
      permissionMode?: ComposerPermissionMode
      reasoningEffort?: OpenAIReasoningEffort
      system?: string
      agent?: string
      skills?: string[]
    }) =>
      ipcRenderer.invoke("desktop:agent-stream-message", input) as Promise<{
        streamID: string
        requestId?: string
      }>,
    resumeAgentMessageStream: (input: { streamID: string; sessionID: string }) =>
      ipcRenderer.invoke("desktop:agent-resume-stream", input) as Promise<{
        streamID: string
        requestId?: string
      }>,
    subscribeAgentSessionStream: (input: { sessionID: string }) =>
      ipcRenderer.invoke("desktop:subscribe-agent-session-stream", input) as Promise<{
        sessionID: string
        lastEventID?: string
      }>,
    unsubscribeAgentSessionStream: (input: { sessionID: string }) =>
      ipcRenderer.invoke("desktop:unsubscribe-agent-session-stream", input) as Promise<{
        sessionID: string
        removed: boolean
      }>,
    sendAgentMessage: (input: {
      sessionID: string
      text?: string
      attachments?: ComposerAttachmentInput[]
      questionAnswer?: {
        questionID: string
        selectedOptions?: string[]
        freeformText?: string
      }
      permissionMode?: ComposerPermissionMode
      reasoningEffort?: OpenAIReasoningEffort
      system?: string
      agent?: string
      skills?: string[]
    }) =>
      ipcRenderer.invoke("desktop:agent-send-message", input) as Promise<{
        events: AgentSSEEvent[]
        requestId?: string
      }>,
    onAgentStreamEvent: (listener: (event: AgentStreamIPCEvent) => void) => {
      const wrappedListener = (_event: Electron.IpcRendererEvent, streamEvent: AgentStreamIPCEvent) => {
        listener(streamEvent)
      }

      ipcRenderer.on("desktop:agent-stream-event", wrappedListener)

      return () => {
        ipcRenderer.removeListener("desktop:agent-stream-event", wrappedListener)
      }
    },
    onAgentSessionStreamEvent: (listener: (event: AgentSessionStreamIPCEvent) => void) => {
      const wrappedListener = (_event: Electron.IpcRendererEvent, streamEvent: AgentSessionStreamIPCEvent) => {
        listener(streamEvent)
      }

      ipcRenderer.on("desktop:agent-session-stream-event", wrappedListener)

      return () => {
        ipcRenderer.removeListener("desktop:agent-session-stream-event", wrappedListener)
      }
    },
    onWorkspaceFileChange: (listener: (event: WorkspaceFileChangeIPCEvent) => void) => {
      const wrappedListener = (_event: Electron.IpcRendererEvent, workspaceEvent: WorkspaceFileChangeIPCEvent) => {
        listener(workspaceEvent)
      }

      ipcRenderer.on("desktop:workspace-file-change", wrappedListener)

      return () => {
        ipcRenderer.removeListener("desktop:workspace-file-change", wrappedListener)
      }
    },
    onPtyEvent: (listener: (event: PtyIPCEvent) => void) => {
      const wrappedListener = (_event: Electron.IpcRendererEvent, ptyEvent: PtyIPCEvent) => {
        listener(ptyEvent)
      }

      ipcRenderer.on("desktop:pty-event", wrappedListener)

      return () => {
        ipcRenderer.removeListener("desktop:pty-event", wrappedListener)
      }
    },
    onWindowStateChange: (listener: (state: { isMaximized: boolean }) => void) => {
      const wrappedListener = (_event: Electron.IpcRendererEvent, state: { isMaximized: boolean }) => {
        listener(state)
      }

      ipcRenderer.on("desktop:window-state-changed", wrappedListener)

      return () => {
        ipcRenderer.removeListener("desktop:window-state-changed", wrappedListener)
      }
    },
  })
} catch (error) {
  console.error("[desktop] preload expose failed:", error)
}
