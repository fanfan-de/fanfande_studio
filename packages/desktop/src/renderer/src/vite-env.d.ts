/// <reference types="vite/client" />

export {}

declare global {
  interface Window {
    desktop?: {
      platform: string
      versions: NodeJS.ProcessVersions
      getInfo: () => Promise<{
        platform: string
        electron: string
        chrome: string
        node: string
      }>
      getWindowState?: () => Promise<{
        isMaximized: boolean
      }>
      showMenu?: (
        menuKey: "file" | "edit" | "view" | "window" | "help",
        anchor?: { x: number; y: number },
      ) => Promise<void>
      windowAction?: (action: "minimize" | "toggle-maximize" | "close") => Promise<void>
      getAgentConfig?: () => Promise<{
        baseURL: string
        defaultDirectory: string
      }>
      getAgentHealth?: () => Promise<{
        ok: boolean
        baseURL: string
        requestId?: string
        error?: string
      }>
      pickProjectDirectory?: () => Promise<string | null>
      listFolderWorkspaces?: () => Promise<
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
      >
      listProjectWorkspaces?: () => Promise<
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
      >
      openFolderWorkspace?: (input: { directory: string }) => Promise<{
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
      createProjectWorkspace?: (input: { directory: string }) => Promise<{
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
      createAgentSession?: (input?: { directory?: string }) => Promise<{
        session: {
          id: string
          projectID: string
          directory: string
          title: string
        }
        requestId?: string
      }>
      createFolderSession?: (input: { projectID: string; directory: string; title?: string }) => Promise<{
        session: {
          id: string
          projectID: string
          directory: string
          title: string
          created: number
          updated: number
        }
        requestId?: string
      }>
      createProjectSession?: (input: { projectID: string; title?: string; directory?: string }) => Promise<{
        session: {
          id: string
          projectID: string
          directory: string
          title: string
          created: number
          updated: number
        }
        requestId?: string
      }>
      deleteProjectWorkspace?: (input: { projectID: string }) => Promise<{
        projectID: string
        deletedSessionIDs: string[]
        requestId?: string
      }>
      deleteAgentSession?: (input: { sessionID: string }) => Promise<{
        sessionID: string
        projectID: string
        requestId?: string
      }>
      streamAgentMessage?: (input: {
        streamID: string
        sessionID: string
        text: string
        system?: string
        agent?: string
      }) => Promise<{
        streamID: string
        requestId?: string
      }>
      sendAgentMessage?: (input: { sessionID: string; text: string; system?: string; agent?: string }) => Promise<{
        events: Array<{
          event: string
          data: unknown
        }>
        requestId?: string
      }>
      onAgentStreamEvent?: (
        listener: (event: {
          streamID: string
          event: string
          data: unknown
        }) => void,
      ) => () => void
      onWindowStateChange?: (listener: (state: { isMaximized: boolean }) => void) => () => void
    }
  }
}
