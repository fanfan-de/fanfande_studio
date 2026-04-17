/// <reference types="vite/client" />

import type { PermissionRequestPrompt, PermissionResolveInput, PermissionResolveResult } from "../../shared/permission"
import type { SessionRuntimeDebugSnapshot } from "./app/types"

export {}

interface DesktopGlobalSkillTreeNode {
  name: string
  path: string
  kind: "directory" | "file"
  children?: DesktopGlobalSkillTreeNode[]
}

interface DesktopComposerAttachmentInput {
  path: string
  name?: string
}

type DesktopComposerPermissionMode = "default" | "full-access"

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
      showExternalEditorMenu?: (input: {
        targetPath: string
        anchor?: {
          x: number
          y: number
        }
      }) => Promise<void>
      openInExternalEditor?: (input: { targetPath: string; editorID?: string }) => Promise<{
        ok: true
        editor: {
          id: string
          label: string
          executablePath: string
        }
        targetPath: string
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
      listFolderWorkspaces?: () => Promise<
        Array<{
          id: string
          directory: string
          name: string
          exists?: boolean
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
        exists?: boolean
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
      archiveAgentSession?: (input: { sessionID: string }) => Promise<{
        sessionID: string
        projectID: string
        directory: string
        archivedAt: number
        requestId?: string
      }>
      listArchivedSessions?: () => Promise<
        Array<{
          id: string
          projectID: string
          projectName: string | null
          projectMissing: boolean
          directory: string
          title: string
          created: number
          updated: number
          archivedAt: number
          messageCount: number
          eventCount: number
        }>
      >
      restoreArchivedSession?: (input: { sessionID: string }) => Promise<{
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
      deleteArchivedSession?: (input: { sessionID: string }) => Promise<{
        sessionID: string
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
      getSessionRuntimeDebug?: (input: { sessionID: string; limit?: number; turns?: number }) => Promise<SessionRuntimeDebugSnapshot>
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
      getGlobalSkillsTree?: () => Promise<{
        root: string
        items: DesktopGlobalSkillTreeNode[]
      }>
      readGlobalSkillFile?: (input: { path: string }) => Promise<{
        path: string
        content: string
      }>
      updateGlobalSkillFile?: (input: { path: string; content: string }) => Promise<{
        path: string
        content: string
      }>
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
      streamAgentMessage?: (input: {
        streamID: string
        sessionID: string
        text?: string
        attachments?: DesktopComposerAttachmentInput[]
        permissionMode?: DesktopComposerPermissionMode
        system?: string
        agent?: string
        skills?: string[]
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
      subscribeAgentSessionStream?: (input: { sessionID: string }) => Promise<{
        sessionID: string
        lastEventID?: string
      }>
      unsubscribeAgentSessionStream?: (input: { sessionID: string }) => Promise<{
        sessionID: string
        removed: boolean
      }>
      sendAgentMessage?: (input: {
        sessionID: string
        text?: string
        attachments?: DesktopComposerAttachmentInput[]
        permissionMode?: DesktopComposerPermissionMode
        system?: string
        agent?: string
        skills?: string[]
      }) => Promise<{
        events: Array<{
          id?: string
          event: string
          data: unknown
        }>
        requestId?: string
      }>
      onAgentStreamEvent?: (
        listener: (event: {
          streamID: string
          id?: string
          event: string
          data: unknown
        }) => void,
      ) => () => void
      onAgentSessionStreamEvent?: (
        listener: (event: {
          sessionID: string
          id?: string
          event: string
          data: unknown
        }) => void,
      ) => () => void
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
