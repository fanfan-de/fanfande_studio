import { BrowserWindow, dialog, ipcMain } from "electron"
import path from "node:path"
import { getAgentConfig, parseSSE, readAgentSSEStream, requestAgentJSON, resolveAgentURL } from "./agent-client"
import type { ApplicationMenus } from "./menu"
import type {
  AgentEnvelope,
  AgentFolderWorkspace,
  AgentProjectDeleteResult,
  AgentProjectInfo,
  AgentProjectWorkspace,
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

function normalizePath(input: string) {
  const resolved = path.resolve(input)
  const normalized = path.normalize(resolved)
  return process.platform === "win32" ? normalized.toLowerCase() : normalized
}

function getProjectName(project: { name?: string; worktree: string }) {
  const trimmed = project.name?.trim()
  if (trimmed) return trimmed

  const fallback = project.worktree.split(/[\\/]/).filter(Boolean).pop()
  return fallback || "Global"
}

function getFolderName(directory: string) {
  const normalized = directory.replace(/[\\/]+$/, "")
  const fallback = normalized.split(/[\\/]/).filter(Boolean).pop()
  return fallback || directory
}

function samePath(left: string, right: string) {
  return normalizePath(left) === normalizePath(right)
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
  const folderWorkspaces: AgentFolderWorkspace[] = []

  for (const [index, workspace] of projectWorkspaces.entries()) {
    const project = result.data[index]
    if (!project) continue
    const directories = new Map<string, string>()

    for (const directory of project.sandboxes ?? []) {
      directories.set(normalizePath(directory), directory)
    }

    for (const session of workspace.sessions) {
      directories.set(normalizePath(session.directory), session.directory)
    }

    if (directories.size === 0 && workspace.worktree && workspace.worktree !== "/") {
      directories.set(normalizePath(workspace.worktree), workspace.worktree)
    }

    for (const directory of directories.values()) {
      const sessions = workspace.sessions
        .filter((session) => samePath(session.directory, directory))
        .sort((left, right) => right.updated - left.updated)

      folderWorkspaces.push({
        id: directory,
        directory,
        name: getFolderName(directory),
        created: sessions[0]?.created ?? workspace.created,
        updated: sessions[0]?.updated ?? workspace.updated,
        project: {
          id: project.id,
          name: getProjectName(project),
          worktree: project.worktree,
        },
        sessions,
      })
    }
  }

  return folderWorkspaces.sort((left, right) => right.updated - left.updated)
}

export function registerIpcHandlers(menus: ApplicationMenus) {
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

  ipcMain.handle("desktop:pick-project-directory", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: "Select folder",
      properties: ["openDirectory"] as Array<"openDirectory">,
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)

    return result.canceled ? null : result.filePaths[0] ?? null
  })

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
    await requestAgentJSON<AgentProjectInfo>("/api/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ directory }),
    })

    const workspaces = await listFolderWorkspaces()
    const folderWorkspace = workspaces.find((workspace) => samePath(workspace.directory, directory))

    if (!folderWorkspace) {
      throw new Error(`Folder workspace '${directory}' was not found after creation`)
    }

    return folderWorkspace
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
    "desktop:agent-send-message",
    async (
      _event,
      input: {
        sessionID: string
        text: string
        system?: string
        agent?: string
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
