/// <reference types="vite/client" />

import type { PermissionRequestPrompt, PermissionResolveInput, PermissionResolveResult } from "../../shared/permission"

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
      pickComposerAttachments?: () => Promise<string[]>
      gitCommit?: (input: { directory: string; message: string }) => Promise<{
        directory: string
        root: string
        branch: string | null
        stdout: string
        stderr: string
        summary: string
      }>
      gitPush?: (input: { directory: string }) => Promise<{
        directory: string
        root: string
        branch: string | null
        stdout: string
        stderr: string
        summary: string
      }>
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
      getSessionHistory?: (input: { sessionID: string }) => Promise<
        Array<{
          info: {
            id: string
            sessionID: string
            role: "user" | "assistant"
            created: number
            completed?: number
            error?: {
              message?: string
              [key: string]: unknown
            }
            [key: string]: unknown
          }
          parts: unknown[]
        }>
      >
      getSessionDiff?: (input: { sessionID: string }) => Promise<{
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
      }>
      getSessionPermissionRequests?: (input: { sessionID: string }) => Promise<
        PermissionRequestPrompt[]
      >
      respondPermissionRequest?: (input: PermissionResolveInput) => Promise<PermissionResolveResult>
      getGlobalProviderCatalog?: () => Promise<
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
      >
      getGlobalModels?: () => Promise<{
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
      }>
      updateGlobalProvider?: (input: {
        providerID: string
        provider: {
          name?: string
          env?: string[]
          options?: {
            apiKey?: string
            baseURL?: string
          }
        }
      }) => Promise<{
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
      }>
      deleteGlobalProvider?: (input: { providerID: string }) => Promise<{
        providerID: string
        selection: {
          model?: string
          small_model?: string
        }
      }>
      updateGlobalModelSelection?: (input: {
        model?: string | null
        small_model?: string | null
      }) => Promise<{
        model?: string
        small_model?: string
      }>
      getProjectProviderCatalog?: (input: { projectID: string }) => Promise<
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
      >
      getProjectModels?: (input: { projectID: string }) => Promise<{
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
      }>
      updateProjectProvider?: (input: {
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
      }) => Promise<{
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
      }>
      deleteProjectProvider?: (input: { projectID: string; providerID: string }) => Promise<{
        providerID: string
        selection: {
          model?: string
          small_model?: string
        }
      }>
      updateProjectModelSelection?: (input: {
        projectID: string
        model?: string | null
        small_model?: string | null
      }) => Promise<{
        model?: string
        small_model?: string
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
      resumeAgentMessageStream?: (input: {
        streamID: string
        sessionID: string
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
