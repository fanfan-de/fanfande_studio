/// <reference types="vite/client" />

import type { AppearanceConfigDocument, AppearanceConfigSnapshot } from "../../shared/appearance"
import type { PermissionRequestPrompt, PermissionResolveInput, PermissionResolveResult } from "../../shared/permission"
import type {
  ArchivedSessionSummary,
  LoadedFolderWorkspace,
  LoadedSessionHistoryMessage,
  LoadedSessionSnapshot,
  ProviderAuthFlow,
  ProviderAuthState,
  ProviderCatalogItem,
  ProviderModel,
  SessionRuntimeDebugSnapshot,
  SideChatLink,
} from "./app/types"
import type { DetailedHTMLProps, HTMLAttributes } from "react"

export {}

interface DesktopGlobalSkillTreeNode {
  name: string
  path: string
  kind: "directory" | "file"
  children?: DesktopGlobalSkillTreeNode[]
}

interface DesktopPromptPresetSummary {
  id: string
  label: string
  description: string
  source: "bundled" | "custom"
  hasOverride: boolean
  editable: boolean
  sourcePath?: string
}

interface DesktopPromptPresetDocument extends DesktopPromptPresetSummary {
  content: string
}

interface DesktopPromptPresetSelection {
  systemPromptPresetID: string
  planModePromptPresetID: string
}

interface DesktopComposerAttachmentInput {
  path: string
  name?: string
}

type DesktopComposerPermissionMode = "default" | "full-access"
type DesktopOpenAIReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh"
type DesktopSessionSummary = LoadedSessionSnapshot
type DesktopAgentSessionEvent =
  | {
      kind: "stream"
      source: "request" | "subscription"
      backendSessionID: string
      uiSessionID?: string
      clientTurnID?: string
      id?: string
      event: string
      data: unknown
      receivedAt: number
    }
  | {
      kind: "subscription-state"
      backendSessionID: string
      uiSessionID?: string
      state: "connecting" | "connected" | "reconnecting" | "closed" | "error"
      message?: string
      lastEventID?: string
      receivedAt: number
    }

interface DesktopAgentSessionTurnInput {
  clientTurnID: string
  backendSessionID: string
  text?: string
  attachments?: DesktopComposerAttachmentInput[]
  questionAnswer?: {
    questionID: string
    selectedOptions?: string[]
    freeformText?: string
  }
  permissionMode?: DesktopComposerPermissionMode
  reasoningEffort?: DesktopOpenAIReasoningEffort
  system?: string
  agent?: string
  skills?: string[]
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        allowpopups?: string
        partition?: string
        preload?: string
        src?: string
      }
    }
  }

  interface Window {
    desktop?: {
      platform: string
      previewGuestPreloadPath?: string
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
      getAppearanceConfig?: () => Promise<AppearanceConfigSnapshot>
      saveAppearanceConfig?: (input: { document: AppearanceConfigDocument }) => Promise<AppearanceConfigSnapshot>
      showMenu?: (
        menuKey: "file" | "edit" | "view" | "window" | "help",
        anchor?: { x: number; y: number },
      ) => Promise<void>
      showExternalEditorMenu?: (input: {
        targetPath: string
        anchor?: {
          x: number
          y: number
        }
      }) => Promise<void>
      listExternalEditorsForTarget?: (input: { targetPath: string }) => Promise<
        Array<{
          id: string
          label: string
          executablePath: string
          iconPath?: string
          iconDataUrl?: string
        }>
      >
      openInExternalEditor?: (input: { targetPath: string; editorID?: string }) => Promise<{
        ok: true
        editor: {
          id: string
          label: string
          executablePath: string
          iconPath?: string
          iconDataUrl?: string
        }
        targetPath: string
      }>
      openExternalUrl?: (input: { url: string }) => Promise<{
        ok: true
        url: string
      }>
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
      createPtySession?: (input?: {
        title?: string
        cwd?: string
        shell?: string
        rows?: number
        cols?: number
      }) => Promise<{
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
      }>
      getPtySession?: (input: { id: string }) => Promise<{
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
      }>
      updatePtySession?: (input: { id: string; title?: string; rows?: number; cols?: number }) => Promise<{
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
      }>
      deletePtySession?: (input: { id: string }) => Promise<{
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
      }>
      attachPtySession?: (input: { id: string; cursor?: number }) => Promise<{
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
      }>
      detachPtySession?: (input: { id: string }) => Promise<boolean>
      writePtyInput?: (input: { id: string; data: string }) => Promise<void>
      pickProjectDirectory?: () => Promise<string | null>
      pickComposerAttachments?: (input?: { allowImage?: boolean; allowPdf?: boolean }) => Promise<string[]>
      gitGetCapabilities?: (input: { projectID: string; directory: string }) => Promise<{
        directory: string
        root: string | null
        branch: string | null
        defaultBranch: string | null
        isGitRepo: boolean
        canCommit: {
          enabled: boolean
          reason?: string
        }
        canStageAllCommit: {
          enabled: boolean
          reason?: string
        }
        canPush: {
          enabled: boolean
          reason?: string
        }
        canCreatePullRequest: {
          enabled: boolean
          reason?: string
        }
        canCreateBranch: {
          enabled: boolean
          reason?: string
        }
      }>
      gitCommit?: (input: { projectID: string; directory: string; message: string; stageAll?: boolean }) => Promise<{
        directory: string
        root: string
        branch: string | null
        stdout: string
        stderr: string
        summary: string
        url?: string
      }>
      gitPush?: (input: { projectID: string; directory: string }) => Promise<{
        directory: string
        root: string
        branch: string | null
        stdout: string
        stderr: string
        summary: string
        url?: string
      }>
      gitCreateBranch?: (input: { projectID: string; directory: string; name: string }) => Promise<{
        directory: string
        root: string
        branch: string | null
        stdout: string
        stderr: string
        summary: string
        url?: string
      }>
      gitListBranches?: (input: { projectID: string; directory: string }) => Promise<
        Array<{
          name: string
          kind: "local" | "remote"
          current: boolean
        }>
      >
      gitCheckoutBranch?: (input: { projectID: string; directory: string; name: string }) => Promise<{
        directory: string
        root: string
        branch: string | null
        stdout: string
        stderr: string
        summary: string
        url?: string
      }>
      gitCreatePullRequest?: (input: { projectID: string; directory: string }) => Promise<{
        directory: string
        root: string
        branch: string | null
        stdout: string
        stderr: string
        summary: string
        url?: string
      }>
      updateWorkspaceWatchDirectories?: (input: { directories: string[] }) => Promise<{
        directories: string[]
      }>
      listFolderWorkspaces?: () => Promise<LoadedFolderWorkspace[]>
      listProjectWorkspaces?: () => Promise<
        Array<{
          id: string
          worktree: string
          name?: string
          created: number
          updated: number
          sessions: DesktopSessionSummary[]
        }>
      >
      openFolderWorkspace?: (input: { directory: string }) => Promise<LoadedFolderWorkspace>
      createProjectWorkspace?: (input: { directory: string }) => Promise<{
        id: string
        worktree: string
        name?: string
        created: number
        updated: number
        sessions: DesktopSessionSummary[]
      }>
      createAgentSession?: (input?: { directory?: string }) => Promise<{
        session: DesktopSessionSummary
        requestId?: string
      }>
      createFolderSession?: (input: { projectID: string; directory: string; title?: string }) => Promise<{
        session: DesktopSessionSummary
        requestId?: string
      }>
      createProjectSession?: (input: { projectID: string; title?: string; directory?: string }) => Promise<{
        session: DesktopSessionSummary
        requestId?: string
      }>
      createSideChat?: (input: { parentSessionID: string; anchorMessageID: string }) => Promise<{
        session: DesktopSessionSummary
        requestId?: string
      }>
      listSideChats?: (input: { parentSessionID: string; anchorMessageID?: string }) => Promise<SideChatLink[]>
      getSideChatLink?: (input: { sessionID: string }) => Promise<SideChatLink>
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
      archiveAgentSession?: (input: { sessionID: string }) => Promise<{
        sessionID: string
        projectID: string
        directory: string
        archivedAt: number
        archivedSessionIDs?: string[]
        requestId?: string
      }>
      listArchivedSessions?: () => Promise<ArchivedSessionSummary[]>
      restoreArchivedSession?: (input: { sessionID: string }) => Promise<{
        session: DesktopSessionSummary
        requestId?: string
      }>
      deleteArchivedSession?: (input: { sessionID: string }) => Promise<{
        sessionID: string
        requestId?: string
      }>
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
      getSessionRuntimeDebug?: (input: { sessionID: string; limit?: number; turns?: number }) => Promise<SessionRuntimeDebugSnapshot>
      agentSession?: {
        loadHistory: (input: { backendSessionID: string }) => Promise<LoadedSessionHistoryMessage[]>
        sendTurn: (input: DesktopAgentSessionTurnInput) => Promise<{
          clientTurnID: string
          requestId?: string
        }>
        resumeTurn: (input: { clientTurnID: string; backendSessionID: string }) => Promise<{
          clientTurnID: string
          requestId?: string
        }>
        subscribe: (input: { uiSessionID?: string; backendSessionID: string }) => Promise<{
          backendSessionID: string
          lastEventID?: string
        }>
        unsubscribe: (input: { backendSessionID: string }) => Promise<{
          backendSessionID: string
          removed: boolean
        }>
        loadPermissionRequests: (input: { backendSessionID: string }) => Promise<PermissionRequestPrompt[]>
        respondPermissionRequest: (input: PermissionResolveInput) => Promise<PermissionResolveResult>
        onEvent: (listener: (event: DesktopAgentSessionEvent) => void) => () => void
      }
      getGlobalProviderCatalog?: () => Promise<ProviderCatalogItem[]>
      refreshGlobalProviderCatalog?: () => Promise<ProviderCatalogItem[]>
      getGlobalProviderAuth?: (input: { providerID: string }) => Promise<ProviderAuthState>
      startGlobalProviderAuthFlow?: (input: { providerID: string; method: string }) => Promise<ProviderAuthFlow>
      getGlobalProviderAuthFlow?: (input: { providerID: string; flowID: string }) => Promise<ProviderAuthFlow>
      cancelGlobalProviderAuthFlow?: (input: { providerID: string; flowID: string }) => Promise<ProviderAuthFlow>
      saveGlobalProviderApiKey?: (input: { providerID: string; apiKey?: string | null }) => Promise<ProviderAuthState>
      deleteGlobalProviderAuthSession?: (input: { providerID: string }) => Promise<ProviderAuthState>
      getGlobalModels?: () => Promise<{
        items: ProviderModel[]
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
      getGlobalMcpServers?: () => Promise<
        Array<
          | {
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
          | {
              id: string
              name?: string
              transport: "remote"
              provider?: "openai"
              serverUrl?: string
              connectorId?: string
              authorization?: string
              headers?: Record<string, string>
              serverDescription?: string
              allowedTools?:
                | string[]
                | {
                    readOnly?: boolean
                    toolNames?: string[]
                  }
              requireApproval?:
                | "always"
                | "never"
                | {
                    never?: {
                      toolNames?: string[]
                    }
                  }
              enabled: boolean
              timeoutMs?: number
            }
        >
      >
      updateGlobalMcpServer?: (input: {
        serverID: string
        server:
          | {
              name?: string
              transport?: "stdio"
              command: string
              args?: string[]
              env?: Record<string, string>
              cwd?: string
              enabled: boolean
              timeoutMs?: number
            }
          | {
              name?: string
              transport: "remote"
              provider?: "openai"
              serverUrl?: string
              connectorId?: string
              authorization?: string
              headers?: Record<string, string>
              serverDescription?: string
              allowedTools?:
                | string[]
                | {
                    readOnly?: boolean
                    toolNames?: string[]
                  }
              requireApproval?:
                | "always"
                | "never"
                | {
                    never?: {
                      toolNames?: string[]
                    }
                  }
              enabled: boolean
              timeoutMs?: number
            }
      }) => Promise<
        | {
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
        | {
            id: string
            name?: string
            transport: "remote"
            provider?: "openai"
            serverUrl?: string
            connectorId?: string
            authorization?: string
            headers?: Record<string, string>
            serverDescription?: string
            allowedTools?:
              | string[]
              | {
                  readOnly?: boolean
                  toolNames?: string[]
                }
            requireApproval?:
              | "always"
              | "never"
              | {
                  never?: {
                    toolNames?: string[]
                  }
                }
            enabled: boolean
            timeoutMs?: number
          }
      >
      deleteGlobalMcpServer?: (input: { serverID: string }) => Promise<{
        serverID: string
        removed: boolean
      }>
      getGlobalSkills?: () => Promise<
        Array<{
          id: string
          name: string
          description: string
          path: string
          scope: "project" | "user"
        }>
      >
      getPromptPresets?: () => Promise<DesktopPromptPresetSummary[]>
      getPromptPresetSelection?: () => Promise<DesktopPromptPresetSelection>
      readPromptPreset?: (input: { presetID: string }) => Promise<DesktopPromptPresetDocument>
      createPromptPreset?: (input: {
        label?: string
        content?: string
        description?: string
      }) => Promise<DesktopPromptPresetDocument>
      getGlobalSkillsTree?: () => Promise<{
        root: string
        items: DesktopGlobalSkillTreeNode[]
      }>
      readGlobalSkillFile?: (input: { path: string }) => Promise<{
        path: string
        content: string
      }>
      searchWorkspaceFiles?: (input: { directory: string; query: string }) => Promise<
        Array<{
          path: string
          absolutePath?: string
          name: string
          extension: string | null
        }>
      >
      readWorkspaceFile?: (input: { directory: string; path: string }) => Promise<{
        path: string
        name: string
        extension: string | null
        kind: "text" | "unsupported"
        content?: string
        unsupportedReason?: string
      }>
      updateGlobalSkillFile?: (input: { path: string; content: string }) => Promise<{
        path: string
        content: string
      }>
      updatePromptPreset?: (input: {
        presetID: string
        label?: string
        content: string
        description?: string
      }) => Promise<DesktopPromptPresetDocument>
      updatePromptPresetSelection?: (
        input: DesktopPromptPresetSelection,
      ) => Promise<DesktopPromptPresetSelection>
      resetPromptPreset?: (input: { presetID: string }) => Promise<DesktopPromptPresetDocument>
      deletePromptPreset?: (input: { presetID: string }) => Promise<DesktopPromptPresetSelection>
      createGlobalSkill?: (input: { name: string }) => Promise<{
        directory: string
        file: {
          path: string
          content: string
        }
      }>
      renameGlobalSkill?: (input: { directory: string; name: string }) => Promise<{
        previousDirectory: string
        directory: string
        filePath: string | null
      }>
      deleteGlobalSkill?: (input: { directory: string }) => Promise<{
        directory: string
        removed: boolean
      }>
      getProjectProviderCatalog?: (input: { projectID: string }) => Promise<ProviderCatalogItem[]>
      refreshProjectProviderCatalog?: (input: { projectID: string }) => Promise<ProviderCatalogItem[]>
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
      }>
      getProjectSkills?: (input: { projectID: string }) => Promise<
        Array<{
          id: string
          name: string
          description: string
          path: string
          scope: "project" | "user"
        }>
      >
      getProjectSkillSelection?: (input: { projectID: string }) => Promise<{
        skillIDs: string[]
      }>
      updateProjectSkillSelection?: (input: {
        projectID: string
        skillIDs: string[]
      }) => Promise<{
        skillIDs: string[]
      }>
      getProjectMcpSelection?: (input: { projectID: string }) => Promise<{
        serverIDs: string[]
      }>
      updateProjectMcpSelection?: (input: {
        projectID: string
        serverIDs: string[]
      }) => Promise<{
        serverIDs: string[]
      }>
      getProjectMcpServers?: (input: { projectID: string }) => Promise<
        Array<
          | {
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
          | {
              id: string
              name?: string
              transport: "remote"
              provider?: "openai"
              serverUrl?: string
              connectorId?: string
              authorization?: string
              headers?: Record<string, string>
              serverDescription?: string
              allowedTools?:
                | string[]
                | {
                    readOnly?: boolean
                    toolNames?: string[]
                  }
              requireApproval?:
                | "always"
                | "never"
                | {
                    never?: {
                      toolNames?: string[]
                    }
                  }
              enabled: boolean
              timeoutMs?: number
            }
        >
      >
      getProjectMcpServerDiagnostic?: (input: { projectID: string; serverID: string }) => Promise<{
        serverID: string
        enabled: boolean
        ok: boolean
        toolCount: number
        toolNames: string[]
        error?: string
      }>
      updateProjectMcpServer?: (input: {
        projectID: string
        serverID: string
        server:
          | {
              name?: string
              transport?: "stdio"
              command: string
              args?: string[]
              env?: Record<string, string>
              cwd?: string
              enabled: boolean
              timeoutMs?: number
            }
          | {
              name?: string
              transport: "remote"
              provider?: "openai"
              serverUrl?: string
              connectorId?: string
              authorization?: string
              headers?: Record<string, string>
              serverDescription?: string
              allowedTools?:
                | string[]
                | {
                    readOnly?: boolean
                    toolNames?: string[]
                  }
              requireApproval?:
                | "always"
                | "never"
                | {
                    never?: {
                      toolNames?: string[]
                    }
                  }
              enabled: boolean
              timeoutMs?: number
            }
      }) => Promise<
        | {
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
        | {
            id: string
            name?: string
            transport: "remote"
            provider?: "openai"
            serverUrl?: string
            connectorId?: string
            authorization?: string
            headers?: Record<string, string>
            serverDescription?: string
            allowedTools?:
              | string[]
              | {
                  readOnly?: boolean
                  toolNames?: string[]
                }
            requireApproval?:
              | "always"
              | "never"
              | {
                  never?: {
                    toolNames?: string[]
                  }
                }
            enabled: boolean
            timeoutMs?: number
          }
      >
      deleteProjectMcpServer?: (input: { projectID: string; serverID: string }) => Promise<{
        serverID: string
        removed: boolean
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
      onWorkspaceFileChange?: (
        listener: (event: {
          directory: string
          paths: string[]
        }) => void,
      ) => () => void
      onPtyEvent?: (
        listener: (event:
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
              session: {
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
              replay: {
                mode: "delta" | "reset"
                buffer: string
                cursor: number
                startCursor: number
              }
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
              session: {
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
            }
          | {
              ptyID: string
              type: "error"
              code: string
              message: string
            },
        ) => void,
      ) => () => void
      onWindowStateChange?: (listener: (state: { isMaximized: boolean }) => void) => () => void
    }
  }
}
