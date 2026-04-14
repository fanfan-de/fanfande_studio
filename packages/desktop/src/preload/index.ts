import { contextBridge, ipcRenderer } from "electron"
import type {
  PermissionRequestPrompt,
  PermissionResolveInput,
  PermissionResolveResult,
} from "../shared/permission"

type MenuKey = "file" | "edit" | "view" | "window" | "help"
type WindowAction = "minimize" | "toggle-maximize" | "close"
type MenuAnchor = {
  x: number
  y: number
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
  projectID?: string
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
  projectID?: string
  directory: string
  root: string | null
  branch: string | null
  defaultBranch: string | null
  isGitRepo: boolean
  canCommit: GitCapabilityState
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
type ComposerAttachmentInput = {
  path: string
  name?: string
}
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

const safeProcess = typeof process !== "undefined" ? process : undefined

try {
  contextBridge.exposeInMainWorld("desktop", {
    platform: safeProcess?.platform ?? "unknown",
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
    showMenu: (menuKey: MenuKey, anchor?: MenuAnchor) => ipcRenderer.invoke("desktop:show-menu", { menuKey, anchor }),
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
    gitCommit: (input: { projectID: string; directory: string; message: string }) =>
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
    listFolderWorkspaces: () =>
      ipcRenderer.invoke("desktop:list-folder-workspaces") as Promise<
        Array<{
          id: string
          directory: string
          name: string
          created: number
          updated: number
          project: {
            id: string
            name: string
            worktree: string
          }
          sessions: Array<{
            id: string
            projectID: string
            directory: string
            title: string
            created: number
            updated: number
          }>
        }>
      >,
    listProjectWorkspaces: () =>
      ipcRenderer.invoke("desktop:list-project-workspaces") as Promise<
        Array<{
          id: string
          worktree: string
          name?: string
          created: number
          updated: number
          sessions: Array<{
            id: string
            projectID: string
            directory: string
            title: string
            created: number
            updated: number
          }>
        }>
      >,
    openFolderWorkspace: (input: { directory: string }) =>
      ipcRenderer.invoke("desktop:open-folder-workspace", input) as Promise<{
        id: string
        directory: string
        name: string
        created: number
        updated: number
        project: {
          id: string
          name: string
          worktree: string
        }
        sessions: Array<{
          id: string
          projectID: string
          directory: string
          title: string
          created: number
          updated: number
        }>
      }>,
    createProjectWorkspace: (input: { directory: string }) =>
      ipcRenderer.invoke("desktop:create-project-workspace", input) as Promise<{
        id: string
        worktree: string
        name?: string
        created: number
        updated: number
        sessions: Array<{
          id: string
          projectID: string
          directory: string
          title: string
          created: number
          updated: number
        }>
      }>,
    createAgentSession: (input?: { directory?: string }) =>
      ipcRenderer.invoke("desktop:agent-create-session", input) as Promise<{
        session: {
          id: string
          projectID: string
          directory: string
          title: string
        }
        requestId?: string
      }>,
    createFolderSession: (input: { projectID: string; directory: string; title?: string }) =>
      ipcRenderer.invoke("desktop:create-folder-session", input) as Promise<{
        session: {
          id: string
          projectID: string
          directory: string
          title: string
          created: number
          updated: number
        }
        requestId?: string
      }>,
    createProjectSession: (input: { projectID: string; title?: string; directory?: string }) =>
      ipcRenderer.invoke("desktop:create-project-session", input) as Promise<{
        session: {
          id: string
          projectID: string
          directory: string
          title: string
          created: number
          updated: number
        }
        requestId?: string
      }>,
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
    getSessionPermissionRequests: (input: { sessionID: string }) =>
      ipcRenderer.invoke("desktop:get-session-permission-requests", input) as Promise<PermissionRequestPrompt[]>,
    respondPermissionRequest: (input: PermissionResolveInput) =>
      ipcRenderer.invoke("desktop:respond-permission-request", input) as Promise<PermissionResolveResult>,
    getGlobalProviderCatalog: () =>
      ipcRenderer.invoke("desktop:get-global-provider-catalog") as Promise<
        Array<{
          id: string
          name: string
          source: "env" | "config" | "custom" | "api"
          env: string[]
          configured: boolean
          available: boolean
          apiKeyConfigured: boolean
          baseURL?: string
          modelCount: number
        }>
      >,
    getGlobalModels: () =>
      ipcRenderer.invoke("desktop:get-global-models") as Promise<{
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
    getGlobalSkillsTree: () =>
      ipcRenderer.invoke("desktop:get-global-skills-tree") as Promise<GlobalSkillTree>,
    readGlobalSkillFile: (input: { path: string }) =>
      ipcRenderer.invoke("desktop:read-global-skill-file", input) as Promise<GlobalSkillFileDocument>,
    updateGlobalSkillFile: (input: { path: string; content: string }) =>
      ipcRenderer.invoke("desktop:update-global-skill-file", input) as Promise<GlobalSkillFileDocument>,
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
      ipcRenderer.invoke("desktop:get-project-provider-catalog", input) as Promise<
        Array<{
          id: string
          name: string
          source: "env" | "config" | "custom" | "api"
          env: string[]
          configured: boolean
          available: boolean
          apiKeyConfigured: boolean
          baseURL?: string
          modelCount: number
        }>
      >,
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
