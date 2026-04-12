import { BrowserWindow, dialog, ipcMain } from "electron"
import { getAgentConfig, parseSSE, readAgentSSEStream, requestAgentJSON, resolveAgentURL } from "./agent-client"
import { buildFolderWorkspaceForDirectory, buildFolderWorkspaces } from "./folder-workspaces"
import { commitGitChanges, pushGitChanges } from "./git"
import type { ApplicationMenus } from "./menu"
import { PtyProxyManager, PTY_EVENT_CHANNEL } from "./pty-proxy"
import type {
  AgentEnvelope,
  AgentProjectModelSelection,
  AgentPtySessionInfo,
  AgentProviderCatalogItem,
  AgentProviderModel,
  AgentProjectDeleteResult,
  AgentProjectInfo,
  AgentPermissionResolveResult,
  AgentPermissionRequest,
  AgentSkillInfo,
  AgentMcpServerSummary,
  AgentProjectWorkspace,
  AgentSessionDiffSummary,
  AgentSessionHistoryMessage,
  AgentStreamIPCEvent,
  AgentSessionInfo,
  AgentSessionDeleteResult,
  MenuAnchor,
  MenuKey,
  WindowAction,
} from "./types"
import { isWindowMaximized, maximizeFramelessWindow, restoreFramelessWindow, sendWindowState } from "./window-state"

const AGENT_STREAM_EVENT_CHANNEL = "desktop:agent-stream-event"

function normalizeShowMenuInput(input: MenuKey | { menuKey: MenuKey; anchor?: MenuAnchor }) {
  if (typeof input === "string") {
    return { menuKey: input, anchor: undefined }
  }

  return input
}

function mapSessionInfo(session: AgentSessionInfo) {
  return {
    id: session.id,
    projectID: session.projectID,
    directory: session.directory,
    title: session.title,
    created: session.time.created,
    updated: session.time.updated,
  }
}

async function loadProjectWorkspace(project: AgentProjectInfo): Promise<AgentProjectWorkspace> {
  const sessionsResult = await requestAgentJSON<AgentSessionInfo[]>(`/api/projects/${encodeURIComponent(project.id)}/sessions`)

  return {
    ...project,
    sessions: sessionsResult.data.map(mapSessionInfo).sort((left, right) => right.updated - left.updated),
  }
}

async function listProjectWorkspaces() {
  const result = await requestAgentJSON<AgentProjectInfo[]>("/api/projects")
  const workspaces = await Promise.all(result.data.map((project) => loadProjectWorkspace(project)))

  return workspaces.sort((left, right) => {
    const leftUpdated = left.sessions[0]?.updated ?? left.updated
    const rightUpdated = right.sessions[0]?.updated ?? right.updated
    return rightUpdated - leftUpdated
  })
}

async function listFolderWorkspaces() {
  const result = await requestAgentJSON<AgentProjectInfo[]>("/api/projects")
  const projectWorkspaces = await Promise.all(result.data.map((project) => loadProjectWorkspace(project)))
  return buildFolderWorkspaces(result.data, projectWorkspaces)
}

export function registerIpcHandlers(menus: ApplicationMenus) {
  const ptyProxyManager = new PtyProxyManager()

  ipcMain.handle("desktop:get-info", () => ({
    platform: process.platform,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  }))

  ipcMain.handle("desktop:get-window-state", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)

    return {
      isMaximized: win ? isWindowMaximized(win) : false,
    }
  })

  ipcMain.handle("desktop:window-action", (event, action: WindowAction) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return

    if (action === "minimize") win.minimize()
    if (action === "toggle-maximize") {
      if (process.platform === "win32") {
        if (isWindowMaximized(win)) restoreFramelessWindow(win)
        else maximizeFramelessWindow(win)
      } else if (win.isMaximized()) {
        win.unmaximize()
      } else {
        win.maximize()
      }

      sendWindowState(win)
    }
    if (action === "close") win.close()
  })

  ipcMain.handle("desktop:show-menu", (event, input: MenuKey | { menuKey: MenuKey; anchor?: MenuAnchor }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return

    const { menuKey, anchor } = normalizeShowMenuInput(input)

    menus.popupMenus[menuKey]?.popup({
      window: win,
      ...(anchor
        ? {
            x: Math.round(anchor.x),
            y: Math.round(anchor.y),
          }
        : {}),
    })
  })

  ipcMain.handle("desktop:get-agent-config", () => getAgentConfig())

  ipcMain.handle("desktop:agent-health", async () => {
    const config = getAgentConfig()

    try {
      const result = await requestAgentJSON<{ ok: boolean }>("/healthz")
      return {
        ok: result.data.ok === true,
        baseURL: config.baseURL,
        requestId: result.requestId,
      }
    } catch (error) {
      return {
        ok: false,
        baseURL: config.baseURL,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })

  ipcMain.handle("desktop:list-folder-workspaces", async () => listFolderWorkspaces())
  ipcMain.handle("desktop:list-project-workspaces", async () => listProjectWorkspaces())

  ipcMain.handle(
    "desktop:create-pty-session",
    async (
      _event,
      input?: {
        title?: string
        cwd?: string
        shell?: string
        rows?: number
        cols?: number
      },
    ) => {
      const result = await requestAgentJSON<AgentPtySessionInfo>("/api/pty", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(input ?? {}),
      })

      return result.data
    },
  )

  ipcMain.handle("desktop:get-pty-session", async (_event, input: { id: string }) => {
    const id = input.id.trim()
    const result = await requestAgentJSON<AgentPtySessionInfo>(`/api/pty/${encodeURIComponent(id)}`)
    return result.data
  })

  ipcMain.handle(
    "desktop:update-pty-session",
    async (
      _event,
      input: {
        id: string
        title?: string
        rows?: number
        cols?: number
      },
    ) => {
      const id = input.id.trim()
      const result = await requestAgentJSON<AgentPtySessionInfo>(`/api/pty/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: input.title,
          rows: input.rows,
          cols: input.cols,
        }),
      })

      return result.data
    },
  )

  ipcMain.handle("desktop:delete-pty-session", async (event, input: { id: string }) => {
    const id = input.id.trim()
    ptyProxyManager.detach(event.sender, id)
    const result = await requestAgentJSON<AgentPtySessionInfo>(`/api/pty/${encodeURIComponent(id)}`, {
      method: "DELETE",
    })

    return result.data
  })

  ipcMain.handle("desktop:attach-pty-session", async (event, input: { id: string; cursor?: number }) =>
    ptyProxyManager.attach(event.sender, input),
  )

  ipcMain.handle("desktop:detach-pty-session", async (event, input: { id: string }) =>
    ptyProxyManager.detach(event.sender, input.id),
  )

  ipcMain.handle("desktop:write-pty-input", async (event, input: { id: string; data: string }) =>
    ptyProxyManager.write(event.sender, input),
  )

  ipcMain.handle("desktop:pick-project-directory", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: "Select folder",
      properties: ["openDirectory"] as Array<"openDirectory">,
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)

    return result.canceled ? null : result.filePaths[0] ?? null
  })

  ipcMain.handle("desktop:pick-composer-attachments", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: "Select image or file",
      properties: ["openFile", "multiSelections"] as Array<"openFile" | "multiSelections">,
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)

    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle("desktop:git-commit", async (_event, input: { directory: string; message: string }) =>
    commitGitChanges(input.directory, input.message),
  )

  ipcMain.handle("desktop:git-push", async (_event, input: { directory: string }) => pushGitChanges(input.directory))

  ipcMain.handle("desktop:create-project-workspace", async (_event, input: { directory: string }) => {
    const directory = input.directory.trim()
    const result = await requestAgentJSON<AgentProjectInfo>("/api/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ directory }),
    })

    return loadProjectWorkspace(result.data)
  })

  ipcMain.handle("desktop:open-folder-workspace", async (_event, input: { directory: string }) => {
    const directory = input.directory.trim()
    const result = await requestAgentJSON<AgentProjectInfo>("/api/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ directory }),
    })
    const projectWorkspace = await loadProjectWorkspace(result.data)
    return buildFolderWorkspaceForDirectory(result.data, projectWorkspace, directory)
  })

  ipcMain.handle("desktop:agent-create-session", async (_event, input?: { directory?: string }) => {
    const config = getAgentConfig()
    const directory = input?.directory?.trim() || config.defaultDirectory
    const result = await requestAgentJSON<{
      id: string
      projectID: string
      directory: string
      title: string
    }>("/api/sessions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ directory }),
    })

    return {
      session: result.data,
      requestId: result.requestId,
    }
  })

  ipcMain.handle(
    "desktop:create-project-session",
    async (_event, input: { projectID: string; title?: string; directory?: string }) => {
      const projectID = input.projectID.trim()
      const result = await requestAgentJSON<AgentSessionInfo>(`/api/projects/${encodeURIComponent(projectID)}/sessions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: input.title?.trim() || undefined,
          directory: input.directory?.trim() || undefined,
        }),
      })

      return {
        session: mapSessionInfo(result.data),
        requestId: result.requestId,
      }
    },
  )

  ipcMain.handle(
    "desktop:create-folder-session",
    async (_event, input: { projectID: string; directory: string; title?: string }) => {
      const projectID = input.projectID.trim()
      const directory = input.directory.trim()
      const result = await requestAgentJSON<AgentSessionInfo>(`/api/projects/${encodeURIComponent(projectID)}/sessions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: input.title?.trim() || undefined,
          directory,
        }),
      })

      return {
        session: mapSessionInfo(result.data),
        requestId: result.requestId,
      }
    },
  )

  ipcMain.handle("desktop:delete-project-workspace", async (_event, input: { projectID: string }) => {
    const projectID = input.projectID.trim()
    const result = await requestAgentJSON<AgentProjectDeleteResult>(`/api/projects/${encodeURIComponent(projectID)}`, {
      method: "DELETE",
    })

    return {
      ...result.data,
      requestId: result.requestId,
    }
  })

  ipcMain.handle("desktop:delete-agent-session", async (_event, input: { sessionID: string }) => {
    const sessionID = input.sessionID.trim()
    const result = await requestAgentJSON<AgentSessionDeleteResult>(`/api/sessions/${encodeURIComponent(sessionID)}`, {
      method: "DELETE",
    })

    return {
      ...result.data,
      requestId: result.requestId,
    }
  })

  ipcMain.handle("desktop:get-session-history", async (_event, input: { sessionID: string }) => {
    const sessionID = input.sessionID.trim()
    const result = await requestAgentJSON<AgentSessionHistoryMessage[]>(
      `/api/sessions/${encodeURIComponent(sessionID)}/messages`,
    )

    return result.data
  })

  ipcMain.handle("desktop:get-session-diff", async (_event, input: { sessionID: string }) => {
    const sessionID = input.sessionID.trim()
    const result = await requestAgentJSON<AgentSessionDiffSummary>(
      `/api/sessions/${encodeURIComponent(sessionID)}/diff`,
    )

    return result.data
  })

  ipcMain.handle("desktop:get-session-permission-requests", async (_event, input: { sessionID: string }) => {
    const sessionID = input.sessionID.trim()
    const result = await requestAgentJSON<AgentPermissionRequest[]>(
      `/api/permissions/requests?status=pending&view=prompt&sessionID=${encodeURIComponent(sessionID)}`,
    )

    return result.data
  })

  ipcMain.handle(
    "desktop:respond-permission-request",
    async (
      _event,
      input: {
        requestID: string
        decision: "allow-once" | "allow-session" | "allow-project" | "allow-forever" | "deny"
        note?: string
        resume?: boolean
      },
    ) => {
      const requestID = input.requestID.trim()
      const result = await requestAgentJSON<AgentPermissionResolveResult>(
        `/api/permissions/requests/${encodeURIComponent(requestID)}/resolve`,
        {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          decision: input.decision,
          note: input.note?.trim() || undefined,
          resume: input.resume ?? true,
        }),
      },
      )

      return result.data
    },
  )

  ipcMain.handle("desktop:get-global-provider-catalog", async () => {
    const result = await requestAgentJSON<AgentProviderCatalogItem[]>("/api/providers/catalog")

    return result.data
  })

  ipcMain.handle("desktop:get-global-models", async () => {
    const result = await requestAgentJSON<{
      items: AgentProviderModel[]
      selection: AgentProjectModelSelection
    }>("/api/models")

    return result.data
  })

  ipcMain.handle(
    "desktop:update-global-provider",
    async (
      _event,
      input: {
        providerID: string
        provider: {
          name?: string
          env?: string[]
          options?: {
            apiKey?: string
            baseURL?: string
          }
        }
      },
    ) => {
      const providerID = input.providerID.trim()
      const result = await requestAgentJSON<{
        provider: {
          id: string
          name: string
          available: boolean
          apiKeyConfigured: boolean
          baseURL?: string
        }
        selection: AgentProjectModelSelection
      }>(`/api/providers/${encodeURIComponent(providerID)}`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(input.provider),
      })

      return result.data
    },
  )

  ipcMain.handle("desktop:delete-global-provider", async (_event, input: { providerID: string }) => {
    const providerID = input.providerID.trim()
    const result = await requestAgentJSON<{
      providerID: string
      selection: AgentProjectModelSelection
    }>(`/api/providers/${encodeURIComponent(providerID)}`, {
      method: "DELETE",
    })

    return result.data
  })

  ipcMain.handle(
    "desktop:update-global-model-selection",
    async (
      _event,
      input: {
        model?: string | null
        small_model?: string | null
      },
    ) => {
      const result = await requestAgentJSON<AgentProjectModelSelection>("/api/model-selection", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: input.model,
          small_model: input.small_model,
        }),
      })

      return result.data
    },
  )

  ipcMain.handle("desktop:get-project-provider-catalog", async (_event, input: { projectID: string }) => {
    const projectID = input.projectID.trim()
    const result = await requestAgentJSON<AgentProviderCatalogItem[]>(
      `/api/projects/${encodeURIComponent(projectID)}/providers/catalog`,
    )

    return result.data
  })

  ipcMain.handle("desktop:get-project-models", async (_event, input: { projectID: string }) => {
    const projectID = input.projectID.trim()
    const result = await requestAgentJSON<{
      items: AgentProviderModel[]
      selection: AgentProjectModelSelection
    }>(`/api/projects/${encodeURIComponent(projectID)}/models`)

    return result.data
  })

  ipcMain.handle(
    "desktop:update-project-provider",
    async (
      _event,
      input: {
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
      },
    ) => {
      const projectID = input.projectID.trim()
      const providerID = input.providerID.trim()
      const result = await requestAgentJSON<{
        provider: {
          id: string
          name: string
          available: boolean
          apiKeyConfigured: boolean
          baseURL?: string
        }
        selection: AgentProjectModelSelection
      }>(`/api/projects/${encodeURIComponent(projectID)}/providers/${encodeURIComponent(providerID)}`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(input.provider),
      })

      return result.data
    },
  )

  ipcMain.handle(
    "desktop:delete-project-provider",
    async (_event, input: { projectID: string; providerID: string }) => {
      const projectID = input.projectID.trim()
      const providerID = input.providerID.trim()
      const result = await requestAgentJSON<{
        providerID: string
        selection: AgentProjectModelSelection
      }>(`/api/projects/${encodeURIComponent(projectID)}/providers/${encodeURIComponent(providerID)}`, {
        method: "DELETE",
      })

      return result.data
    },
  )

  ipcMain.handle(
    "desktop:update-project-model-selection",
    async (
      _event,
      input: {
        projectID: string
        model?: string | null
        small_model?: string | null
      },
    ) => {
      const projectID = input.projectID.trim()
      const result = await requestAgentJSON<AgentProjectModelSelection>(
        `/api/projects/${encodeURIComponent(projectID)}/model-selection`,
        {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: input.model,
          small_model: input.small_model,
        }),
      },
      )

      return result.data
    },
  )

  ipcMain.handle("desktop:get-project-skills", async (_event, input: { projectID: string }) => {
    const projectID = input.projectID.trim()
    const result = await requestAgentJSON<AgentSkillInfo[]>(
      `/api/projects/${encodeURIComponent(projectID)}/skills`,
    )

    return result.data
  })

  ipcMain.handle("desktop:get-project-mcp-servers", async (_event, input: { projectID: string }) => {
    const projectID = input.projectID.trim()
    const result = await requestAgentJSON<AgentMcpServerSummary[]>(
      `/api/projects/${encodeURIComponent(projectID)}/mcp/servers`,
    )

    return result.data
  })

  ipcMain.handle(
    "desktop:update-project-mcp-server",
    async (
      _event,
      input: {
        projectID: string
        serverID: string
        server: Omit<AgentMcpServerSummary, "id">
      },
    ) => {
      const projectID = input.projectID.trim()
      const serverID = input.serverID.trim()
      const result = await requestAgentJSON<AgentMcpServerSummary>(
        `/api/projects/${encodeURIComponent(projectID)}/mcp/servers/${encodeURIComponent(serverID)}`,
        {
          method: "PUT",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(input.server),
        },
      )

      return result.data
    },
  )

  ipcMain.handle(
    "desktop:delete-project-mcp-server",
    async (_event, input: { projectID: string; serverID: string }) => {
      const projectID = input.projectID.trim()
      const serverID = input.serverID.trim()
      const result = await requestAgentJSON<{ serverID: string; removed: boolean }>(
        `/api/projects/${encodeURIComponent(projectID)}/mcp/servers/${encodeURIComponent(serverID)}`,
        {
          method: "DELETE",
        },
      )

      return result.data
    },
  )

  ipcMain.handle(
    "desktop:agent-stream-message",
    async (
      event,
      input: {
        streamID: string
        sessionID: string
        text: string
        system?: string
        agent?: string
        skills?: string[]
      },
    ) => {
      const streamID = input.streamID.trim()
      const sessionID = input.sessionID.trim()
      const response = await fetch(resolveAgentURL(`/api/sessions/${encodeURIComponent(sessionID)}/messages/stream`), {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          text: input.text,
          system: input.system,
          agent: input.agent,
          skills: input.skills,
        }),
      })

      if (!response.ok) {
        const envelope = (await response.json().catch(() => null)) as AgentEnvelope<unknown> | null
        throw new Error(envelope?.error?.message || `Agent stream failed (${response.status})`)
      }

      const requestId = response.headers.get("x-request-id") ?? undefined

      try {
        await readAgentSSEStream(response, (item) => {
          event.sender.send(AGENT_STREAM_EVENT_CHANNEL, {
            streamID,
            event: item.event,
            data: item.data,
          } satisfies AgentStreamIPCEvent)
        })
      } catch (error) {
        event.sender.send(AGENT_STREAM_EVENT_CHANNEL, {
          streamID,
          event: "error",
          data: {
            sessionID,
            message: error instanceof Error ? error.message : String(error),
          },
        } satisfies AgentStreamIPCEvent)
      }

      return {
        streamID,
        requestId,
      }
    },
  )

  ipcMain.handle(
    "desktop:agent-resume-stream",
    async (
      event,
      input: {
        streamID: string
        sessionID: string
      },
    ) => {
      const streamID = input.streamID.trim()
      const sessionID = input.sessionID.trim()
      const response = await fetch(resolveAgentURL(`/api/sessions/${encodeURIComponent(sessionID)}/resume/stream`), {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
      })

      if (!response.ok) {
        const envelope = (await response.json().catch(() => null)) as AgentEnvelope<unknown> | null
        throw new Error(envelope?.error?.message || `Agent resume stream failed (${response.status})`)
      }

      const requestId = response.headers.get("x-request-id") ?? undefined

      try {
        await readAgentSSEStream(response, (item) => {
          event.sender.send(AGENT_STREAM_EVENT_CHANNEL, {
            streamID,
            event: item.event,
            data: item.data,
          } satisfies AgentStreamIPCEvent)
        })
      } catch (error) {
          event.sender.send(AGENT_STREAM_EVENT_CHANNEL, {
          streamID,
          event: "error",
          data: {
            sessionID,
            message: error instanceof Error ? error.message : String(error),
          },
        } satisfies AgentStreamIPCEvent)
      }

      return {
        streamID,
        requestId,
      }
    },
  )

  ipcMain.handle(
    "desktop:agent-send-message",
    async (
      _event,
      input: {
        sessionID: string
        text: string
        system?: string
        agent?: string
        skills?: string[]
      },
    ) => {
      const sessionID = input.sessionID.trim()
      const response = await fetch(resolveAgentURL(`/api/sessions/${encodeURIComponent(sessionID)}/messages/stream`), {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          text: input.text,
          system: input.system,
          agent: input.agent,
          skills: input.skills,
        }),
      })

      if (!response.ok) {
        const envelope = (await response.json().catch(() => null)) as AgentEnvelope<unknown> | null
        throw new Error(envelope?.error?.message || `Agent stream failed (${response.status})`)
      }

      const raw = await response.text()
      return {
        events: parseSSE(raw),
        requestId: response.headers.get("x-request-id") ?? undefined,
      }
    },
  )
}
