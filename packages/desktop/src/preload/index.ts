import { contextBridge, ipcRenderer } from "electron"

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
    streamAgentMessage: (input: { streamID: string; sessionID: string; text: string; system?: string; agent?: string }) =>
      ipcRenderer.invoke("desktop:agent-stream-message", input) as Promise<{
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
