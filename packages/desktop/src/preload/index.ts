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
  event: string
  data: unknown
}
type AgentStreamIPCEvent = AgentSSEEvent & {
  streamID: string
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
    pickProjectDirectory: () => ipcRenderer.invoke("desktop:pick-project-directory") as Promise<string | null>,
    pickComposerAttachments: () => ipcRenderer.invoke("desktop:pick-composer-attachments") as Promise<string[]>,
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
    streamAgentMessage: (input: { streamID: string; sessionID: string; text: string; system?: string; agent?: string }) =>
      ipcRenderer.invoke("desktop:agent-stream-message", input) as Promise<{
        streamID: string
        requestId?: string
      }>,
    resumeAgentMessageStream: (input: { streamID: string; sessionID: string }) =>
      ipcRenderer.invoke("desktop:agent-resume-stream", input) as Promise<{
        streamID: string
        requestId?: string
      }>,
    sendAgentMessage: (input: { sessionID: string; text: string; system?: string; agent?: string }) =>
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
