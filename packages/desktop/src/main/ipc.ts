import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type IpcMainInvokeEvent, type MenuItemConstructorOptions, type NativeImage, type WebContents } from "electron"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import type { AppearanceConfigDocument } from "../shared/appearance"
import type { AppLocale, LocaleConfigDocument } from "../shared/locale"
import type {
  DesktopIpcChannel,
  DesktopIpcEventChannel,
  DesktopIpcEventPayload,
  DesktopIpcInput,
  DesktopIpcOutput,
  McpServerInput,
} from "../shared/desktop-ipc-contract"
import {
  DESKTOP_AGENT_SESSION_EVENT_CHANNEL,
} from "../shared/desktop-ipc-contract"
import { getAgentConfig, readAgentSSEStream, requestAgentJSON, resolveAgentURL } from "./agent-client"
import { readAppearanceConfigSnapshot, writeAppearanceConfigSnapshot } from "./appearance-config"
import { filterAvailableExternalEditorsForTarget, listAvailableExternalEditors, openInExternalEditor } from "./external-editors"
import { buildFolderWorkspaceForDirectory, buildFolderWorkspaces } from "./folder-workspaces"
import {
  checkoutGitBranch,
  commitGitChanges,
  createGitBranch,
  createGitPullRequest,
  getGitCapabilities,
  listGitBranches,
  pushGitChanges,
} from "./git"
import type { ApplicationMenus } from "./menu"
import { readLocaleConfigSnapshot, writeLocaleConfigSnapshot } from "./locale-config"
import { detectLocalPreviewServices } from "./local-preview-services"
import { openMonitorWindow } from "./monitor-window"
import { PtyProxyManager } from "./pty-proxy"
import { safeWarn } from "./safe-console"
import {
  checkForAppUpdates,
  getAppUpdateSettingsSnapshot,
  setAutomaticAppUpdatesEnabled,
} from "./updater"
import type {
  AgentArchivedSessionDeleteResult,
  AgentArchivedSessionSummary,
  AgentBuiltinToolSelection,
  AgentBuiltinToolsPayload,
  AgentEnvelope,
  AgentGlobalSkillFileDocument,
  AgentGlobalSkillFolderRenameResult,
  AgentGlobalSkillFolderResult,
  AgentGlobalSkillMoveResult,
  AgentGlobalSkillRenameResult,
  AgentGlobalSkillTree,
  AgentSkillGitInstallPreview,
  AgentSkillGitInstallResult,
  AgentMcpServerDiagnostic,
  AgentMcpServerSummary,
  AgentInstalledPlugin,
  AgentPluginCatalogItem,
  AgentPluginConnectorStatus,
  AgentPluginDeleteResult,
  AgentPermissionRequest,
  AgentPermissionResolveResult,
  AgentProjectDeleteResult,
  AgentProjectInfo,
  AgentProjectMcpSelection,
  AgentProjectModelSelection,
  AgentProjectModelsResult,
  AgentProjectSkillSelection,
  AgentProjectWorkspace,
  AgentPromptPresetDocument,
  AgentPromptPresetSelection,
  AgentPromptPresetSummary,
  AgentPromptUrlInstallPreview,
  AgentPromptUrlInstallResult,
  AgentProviderAuthFlow,
  AgentProviderAuthState,
  AgentProviderCatalogItem,
  AgentProviderConnectionTestResult,
  AgentProviderModel,
  AgentPtySessionInfo,
  AgentSessionArchiveResult,
  AgentSessionBridgeIPCEvent,
  AgentSessionDeleteResult,
  AgentSessionDiffSummary,
  AgentSessionHistoryMessage,
  AgentSessionInfo,
  AgentSessionRuntimeDebugSnapshot,
  AgentSessionTurnRequestInput,
  AgentSideChatLink,
  AgentSkillInfo,
  AgentToolPermissionModePayload,
  AgentWorkspaceFileDocument,
  AgentWorkspaceFileSearchResult,
  MenuAnchor,
  MenuKey,
  WindowAction,
} from "./types"
import { isWindowMaximized, maximizeFramelessWindow, restoreFramelessWindow, sendWindowState } from "./window-state"
import { getWorkspaceGitDiff, restoreWorkspaceDiffFile } from "./workspace-diff"
import { readWorkspaceFile, searchWorkspaceFiles } from "./workspace-files"
import { WorkspaceWatchManager } from "./workspace-watch"

const AGENT_SESSION_EVENT_CHANNEL = DESKTOP_AGENT_SESSION_EVENT_CHANNEL

type Awaitable<T> = T | Promise<T>
type DesktopIpcHandler<Channel extends DesktopIpcChannel> =
  undefined extends DesktopIpcInput<Channel>
    ? (event: IpcMainInvokeEvent, input?: DesktopIpcInput<Channel>) => Awaitable<DesktopIpcOutput<Channel>>
    : (event: IpcMainInvokeEvent, input: DesktopIpcInput<Channel>) => Awaitable<DesktopIpcOutput<Channel>>

function handleDesktopIpc<Channel extends DesktopIpcChannel>(
  channel: Channel,
  handler: DesktopIpcHandler<Channel>,
) {
  ipcMain.handle(channel, (event, input) =>
    (handler as (event: IpcMainInvokeEvent, input?: unknown) => Awaitable<DesktopIpcOutput<Channel>>)(event, input),
  )
}

function sendDesktopIpcEvent<Channel extends DesktopIpcEventChannel>(
  target: WebContents,
  channel: Channel,
  payload: DesktopIpcEventPayload<Channel>,
) {
  target.send(channel, payload)
}

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
    kind: session.kind,
    policy: session.policy,
    origin: session.origin,
    modelSelection: session.modelSelection,
    created: session.time.created,
    updated: session.time.updated,
    workflow: session.workflow,
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

function sanitizeScreenshotFileSegment(value: string) {
  return value
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "preview"
}

type PreviewScreenshotCaptureInput = DesktopIpcInput<"desktop:capture-preview-screenshot">

interface PreviewScreenshotCaptureOptions {
  makeDirectory?: (directory: string, options: { recursive: true }) => Promise<unknown>
  now?: Date
  userDataPath?: string
  writeImageFile?: (filePath: string, data: Buffer) => Promise<unknown>
}

async function capturePreviewScreenshotFromWindow(
  win: Pick<BrowserWindow, "capturePage">,
  input: PreviewScreenshotCaptureInput,
  options: PreviewScreenshotCaptureOptions = {},
) {
  const bounds = input.bounds
  const rect = {
    height: Math.max(1, Math.round(bounds.height)),
    width: Math.max(1, Math.round(bounds.width)),
    x: Math.max(0, Math.round(bounds.x)),
    y: Math.max(0, Math.round(bounds.y)),
  }
  const image = await win.capturePage(rect)
  const screenshotDirectory = path.join(
    options.userDataPath ?? app.getPath("userData"),
    "preview-comment-screenshots",
  )
  const timestamp = (options.now ?? new Date()).toISOString().replace(/[:.]/g, "-")
  const urlSegment = sanitizeScreenshotFileSegment(input.url ?? "preview")
  const screenshotPath = path.join(screenshotDirectory, `${timestamp}-${urlSegment}.png`)

  await (options.makeDirectory ?? mkdir)(screenshotDirectory, { recursive: true })
  await (options.writeImageFile ?? writeFile)(screenshotPath, image.toPNG())

  return { path: screenshotPath }
}

async function getToolPermissionMode() {
  const result = await requestAgentJSON<AgentToolPermissionModePayload>("/api/tools/permission-mode")
  return result.data
}

async function updateToolPermissionMode(input: AgentToolPermissionModePayload) {
  const result = await requestAgentJSON<AgentToolPermissionModePayload>("/api/tools/permission-mode", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      mode: input.mode,
    }),
  })

  return result.data
}

type SessionStreamSubscription = {
  lastEventID?: string
  disposed: boolean
  abortController: AbortController | null
  restartTimer: ReturnType<typeof setTimeout> | null
  start(): Promise<void>
  dispose(): void
}

type ActiveAgentSessionRequest = {
  backendSessionID: string
  cancelRequested: boolean
  clientTurnID: string
  controller: AbortController
}

type DisposableSessionStreamSubscription = {
  dispose(): void
}

function sessionStreamSubscriptionKey(webContentsID: number, sessionID: string) {
  return `${webContentsID}:${sessionID}`
}

function isSessionStreamSubscriptionKeyForWebContents(key: string, webContentsID: number) {
  return key.startsWith(`${webContentsID}:`)
}

function disposeSessionStreamSubscriptionsForWebContents<TSubscription extends DisposableSessionStreamSubscription>(
  subscriptions: Map<string, TSubscription>,
  webContentsID: number,
) {
  let disposedCount = 0
  for (const [key, streamSubscription] of [...subscriptions.entries()]) {
    if (!isSessionStreamSubscriptionKeyForWebContents(key, webContentsID)) continue
    streamSubscription.dispose()
    subscriptions.delete(key)
    disposedCount += 1
  }
  return disposedCount
}

function agentSessionRequestKey(webContentsID: number, clientTurnID: string) {
  return `${webContentsID}:${clientTurnID}`
}

function isAbortError(error: unknown) {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError"
}

export interface IpcHandlerOptions {
  onLocaleChanged?: (locale: AppLocale) => void
}

export function registerIpcHandlers(menus: ApplicationMenus, options: IpcHandlerOptions = {}) {
  const ptyProxyManager = new PtyProxyManager()
  const workspaceWatchManager = new WorkspaceWatchManager()
  const externalEditorMenuResolvedIconCache = new Map<string, NativeImage | undefined>()
  const externalEditorMenuIconLoadCache = new Map<string, Promise<NativeImage | undefined>>()
  let cachedAvailableExternalEditors: ReturnType<typeof listAvailableExternalEditors> | null = null

  function getCachedAvailableExternalEditors() {
    if (!cachedAvailableExternalEditors) {
      cachedAvailableExternalEditors = listAvailableExternalEditors()
    }

    return cachedAvailableExternalEditors
  }

  function normalizeExternalEditorIconCacheKey(iconPath: string) {
    const cacheKey = iconPath.trim().toLowerCase()
    return cacheKey || null
  }

  function loadExternalEditorMenuIcon(iconPath: string) {
    const cacheKey = normalizeExternalEditorIconCacheKey(iconPath)
    if (!cacheKey) return Promise.resolve(undefined)

    if (externalEditorMenuResolvedIconCache.has(cacheKey)) {
      return Promise.resolve(externalEditorMenuResolvedIconCache.get(cacheKey))
    }

    const cached = externalEditorMenuIconLoadCache.get(cacheKey)
    if (cached) return cached

    const nextIconLoad = app
      .getFileIcon(iconPath)
      .then((icon) => {
        const resolvedIcon = icon.isEmpty() ? undefined : icon
        externalEditorMenuResolvedIconCache.set(cacheKey, resolvedIcon)
        return resolvedIcon
      })
      .catch(() => {
        externalEditorMenuResolvedIconCache.set(cacheKey, undefined)
        return undefined
      })
      .finally(() => {
        externalEditorMenuIconLoadCache.delete(cacheKey)
      })
    externalEditorMenuIconLoadCache.set(cacheKey, nextIconLoad)
    return nextIconLoad
  }

  function primeExternalEditorMenuIcon(iconPath: string) {
    void loadExternalEditorMenuIcon(iconPath)
  }

  function peekExternalEditorMenuIcon(iconPath: string) {
    const cacheKey = normalizeExternalEditorIconCacheKey(iconPath)
    if (!cacheKey) return undefined

    return externalEditorMenuResolvedIconCache.get(cacheKey)
  }

  function peekExternalEditorMenuIconDataUrl(iconPath: string) {
    const icon = peekExternalEditorMenuIcon(iconPath)
    return icon ? icon.toDataURL() : undefined
  }
  const sessionStreamSubscriptions = new Map<string, SessionStreamSubscription>()
  const sessionStreamCleanupTargets = new Set<number>()
  const activeAgentSessionRequests = new Map<string, ActiveAgentSessionRequest>()

  function getSessionStreamSubscription(
    webContentsID: number,
    sessionID: string,
  ) {
    return sessionStreamSubscriptions.get(sessionStreamSubscriptionKey(webContentsID, sessionID))
  }

  function removeSessionStreamSubscription(
    webContentsID: number,
    sessionID: string,
  ) {
    const key = sessionStreamSubscriptionKey(webContentsID, sessionID)
    const subscription = sessionStreamSubscriptions.get(key)
    if (!subscription) return false
    subscription.dispose()
    sessionStreamSubscriptions.delete(key)
    return true
  }

  function getActiveAgentSessionRequest(webContentsID: number, clientTurnID: string) {
    return activeAgentSessionRequests.get(agentSessionRequestKey(webContentsID, clientTurnID))
  }

  function removeActiveAgentSessionRequest(webContentsID: number, clientTurnID: string, request: ActiveAgentSessionRequest) {
    const key = agentSessionRequestKey(webContentsID, clientTurnID)
    if (activeAgentSessionRequests.get(key) === request) {
      activeAgentSessionRequests.delete(key)
    }
  }

  function createSessionStreamSubscription(
    target: Electron.WebContents,
    sessionID: string,
    options: {
      uiSessionID?: string
    },
  ): SessionStreamSubscription {
    let lastEventID: string | undefined
    let disposed = false
    let abortController: AbortController | null = null
    let restartTimer: ReturnType<typeof setTimeout> | null = null

    const sendUnifiedSubscriptionState = (
      state: Extract<AgentSessionBridgeIPCEvent, { kind: "subscription-state" }>["state"],
      message?: string,
    ) => {
      if (target.isDestroyed()) return
      sendDesktopIpcEvent(target, AGENT_SESSION_EVENT_CHANNEL, {
        kind: "subscription-state",
        backendSessionID: sessionID,
        uiSessionID: options.uiSessionID,
        state,
        message,
        lastEventID,
        receivedAt: Date.now(),
      } satisfies AgentSessionBridgeIPCEvent)
    }

    const scheduleRestart = () => {
      if (disposed || restartTimer || target.isDestroyed()) return
      sendUnifiedSubscriptionState("reconnecting")
      restartTimer = setTimeout(() => {
        restartTimer = null
        void start()
      }, 500)
    }

    const dispose = () => {
      disposed = true
      sendUnifiedSubscriptionState("closed")
      if (restartTimer) {
        clearTimeout(restartTimer)
        restartTimer = null
      }
      abortController?.abort()
      abortController = null
    }

    const start = async () => {
      if (disposed || target.isDestroyed()) return

      abortController?.abort()
      abortController = new AbortController()
      sendUnifiedSubscriptionState("connecting")

      try {
        const response = await fetch(resolveAgentURL(`/api/sessions/${encodeURIComponent(sessionID)}/events/stream`), {
          headers: lastEventID
            ? {
                "Last-Event-ID": lastEventID,
              }
            : undefined,
          signal: abortController.signal,
        })

        if (!response.ok) {
          const envelope = (await response.json().catch(() => null)) as AgentEnvelope<unknown> | null
          throw new Error(envelope?.error?.message || `Session stream failed (${response.status})`)
        }

        sendUnifiedSubscriptionState("connected")

        await readAgentSSEStream(response, (item) => {
          if (disposed || target.isDestroyed()) return
          if (item.id) {
            lastEventID = item.id
          }

          sendDesktopIpcEvent(target, AGENT_SESSION_EVENT_CHANNEL, {
            kind: "stream",
            source: "subscription",
            backendSessionID: sessionID,
            uiSessionID: options.uiSessionID,
            id: item.id,
            event: item.event,
            data: item.data,
            receivedAt: Date.now(),
          } satisfies AgentSessionBridgeIPCEvent)
        })

        if (!disposed) {
          scheduleRestart()
        }
      } catch (error) {
        const aborted = error instanceof Error && error.name === "AbortError"
        if (disposed || aborted) return

        const message = error instanceof Error ? error.message : String(error)
        sendUnifiedSubscriptionState("error", message)
        sendDesktopIpcEvent(target, AGENT_SESSION_EVENT_CHANNEL, {
          kind: "stream",
          source: "subscription",
          backendSessionID: sessionID,
          uiSessionID: options.uiSessionID,
          event: "error",
          data: {
            sessionID,
            message,
          },
          receivedAt: Date.now(),
        } satisfies AgentSessionBridgeIPCEvent)
        scheduleRestart()
      }
    }

    return {
      get lastEventID() {
        return lastEventID
      },
      get disposed() {
        return disposed
      },
      get abortController() {
        return abortController
      },
      get restartTimer() {
        return restartTimer
      },
      start,
      dispose,
    }
  }

  handleDesktopIpc("desktop:get-info", () => ({
    platform: process.platform,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  }))

  handleDesktopIpc("desktop:get-app-update-settings", async () => getAppUpdateSettingsSnapshot())

  handleDesktopIpc("desktop:set-automatic-updates-enabled", async (_event, input: { enabled: boolean }) =>
    setAutomaticAppUpdatesEnabled(input.enabled),
  )

  handleDesktopIpc("desktop:check-for-app-updates", async () => checkForAppUpdates({ manual: true }))

  handleDesktopIpc("desktop:get-window-state", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)

    return {
      isMaximized: win ? isWindowMaximized(win) : false,
    }
  })

  handleDesktopIpc("desktop:get-appearance-config", async () => readAppearanceConfigSnapshot())

  handleDesktopIpc("desktop:save-appearance-config", async (_event, input: { document: AppearanceConfigDocument }) =>
    writeAppearanceConfigSnapshot(input.document),
  )

  handleDesktopIpc("desktop:get-locale-config", async () => readLocaleConfigSnapshot())

  handleDesktopIpc("desktop:save-locale-config", async (_event, input: { document: LocaleConfigDocument }) => {
    const snapshot = await writeLocaleConfigSnapshot(input.document)
    options.onLocaleChanged?.(snapshot.document.locale)
    return snapshot
  })

  handleDesktopIpc("desktop:window-action", (event, action: WindowAction) => {
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

  handleDesktopIpc("desktop:open-external-url", async (_event, input: { url: string }) => {
    const url = input.url.trim()
    if (!url) {
      throw new Error("A URL is required.")
    }

    await shell.openExternal(url)

    return {
      ok: true as const,
      url,
    }
  })

  handleDesktopIpc("desktop:open-monitor-window", async () => openMonitorWindow())

  handleDesktopIpc("desktop:show-menu", (event, input: MenuKey | { menuKey: MenuKey; anchor?: MenuAnchor }) => {
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

  handleDesktopIpc("desktop:show-external-editor-menu", async (event, input: { targetPath: string; anchor?: MenuAnchor }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return

    const targetPath = input.targetPath.trim()
    if (!targetPath) {
      throw new Error("A workspace directory is required.")
    }

    const availableEditors = filterAvailableExternalEditorsForTarget(getCachedAvailableExternalEditors(), targetPath)
    const menuItems: MenuItemConstructorOptions[] =
      availableEditors.length > 0
        ? availableEditors.map((editor) => {
            const iconPath = editor.iconPath ?? editor.executablePath
            primeExternalEditorMenuIcon(iconPath)

            return {
              id: editor.id,
              label: editor.label,
              icon: peekExternalEditorMenuIcon(iconPath),
              click: () => {
                void Promise.resolve(openInExternalEditor({ editorID: editor.id, targetPath }, { openPath: shell.openPath })).catch((error) => {
                  void dialog.showMessageBox(win, {
                    type: "error",
                    title: "Unable to Open Editor",
                    message: error instanceof Error ? error.message : String(error),
                  })
                })
              },
            }
          })
        : [
            {
              label: "No supported editors found",
              enabled: false,
            },
          ]

    Menu.buildFromTemplate(menuItems).popup({
      window: win,
      ...(input.anchor
        ? {
            x: Math.round(input.anchor.x),
            y: Math.round(input.anchor.y),
          }
        : {}),
    })
  })

  handleDesktopIpc("desktop:list-external-editors-for-target", (_event, input: { targetPath: string }) => {
    const targetPath = input.targetPath.trim()
    if (!targetPath) {
      throw new Error("A workspace directory is required.")
    }

    return filterAvailableExternalEditorsForTarget(getCachedAvailableExternalEditors(), targetPath).map((editor) => {
      const iconPath = editor.iconPath ?? editor.executablePath
      primeExternalEditorMenuIcon(iconPath)

      const iconDataUrl = peekExternalEditorMenuIconDataUrl(iconPath)
      return iconDataUrl
        ? {
            ...editor,
            iconDataUrl,
          }
        : editor
    })
  })

  handleDesktopIpc("desktop:open-in-external-editor", async (_event, input: { editorID?: string; targetPath: string }) =>
    openInExternalEditor(input, { openPath: shell.openPath }),
  )

  handleDesktopIpc("desktop:get-agent-config", () => getAgentConfig())

  handleDesktopIpc("desktop:agent-health", async () => {
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

  handleDesktopIpc("desktop:list-folder-workspaces", async () => listFolderWorkspaces())
  handleDesktopIpc("desktop:list-project-workspaces", async () => listProjectWorkspaces())
  handleDesktopIpc("desktop:update-workspace-watch-directories", async (event, input: { directories: string[] }) => ({
    directories: workspaceWatchManager.updateDirectories(event.sender, input.directories),
  }))

  handleDesktopIpc(
    "desktop:create-pty-session",
    async (
      _event,
      input?: {
        sessionID?: string
        title?: string
        shell?: string
        rows?: number
        cols?: number
      },
    ) => {
      if (!input?.sessionID?.trim()) {
        throw new Error("PTY session creation requires a sessionID")
      }
      const result = await requestAgentJSON<AgentPtySessionInfo>("/api/pty", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sessionID: input.sessionID,
          title: input.title,
          shell: input.shell,
          rows: input.rows,
          cols: input.cols,
        }),
      })

      return result.data
    },
  )

  handleDesktopIpc("desktop:get-pty-session", async (_event, input: { id: string }) => {
    const id = input.id.trim()
    const result = await requestAgentJSON<AgentPtySessionInfo>(`/api/pty/${encodeURIComponent(id)}`)
    return result.data
  })

  handleDesktopIpc(
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

  handleDesktopIpc("desktop:delete-pty-session", async (event, input: { id: string }) => {
    const id = input.id.trim()
    ptyProxyManager.detach(event.sender, id)
    const result = await requestAgentJSON<AgentPtySessionInfo>(`/api/pty/${encodeURIComponent(id)}`, {
      method: "DELETE",
    })

    return result.data
  })

  handleDesktopIpc("desktop:attach-pty-session", async (event, input: { id: string; cursor?: number }) =>
    ptyProxyManager.attach(event.sender, input),
  )

  handleDesktopIpc("desktop:detach-pty-session", async (event, input: { id: string }) =>
    ptyProxyManager.detach(event.sender, input.id),
  )

  handleDesktopIpc("desktop:write-pty-input", async (event, input: { id: string; data: string }) =>
    ptyProxyManager.write(event.sender, input),
  )

  handleDesktopIpc("desktop:pick-project-directory", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: "Select folder",
      properties: ["openDirectory"] as Array<"openDirectory">,
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)

    return result.canceled ? null : result.filePaths[0] ?? null
  })

  handleDesktopIpc(
    "desktop:pick-composer-attachments",
    async (event, input?: { allowImage?: boolean; allowPdf?: boolean }) => {
      const allowImage = input?.allowImage ?? true
      const allowPdf = input?.allowPdf ?? true
      const filters = [
        ...(allowImage
          ? [
              {
                name: "Images",
                extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"],
              },
            ]
          : []),
        ...(allowPdf
          ? [
              {
                name: "PDFs",
                extensions: ["pdf"],
              },
            ]
          : []),
      ]

      const title = allowImage && allowPdf ? "Select image or PDF" : allowImage ? "Select image" : "Select PDF"
      const win = BrowserWindow.fromWebContents(event.sender)
      const options = {
        title,
        properties: ["openFile", "multiSelections"] as Array<"openFile" | "multiSelections">,
        ...(filters.length > 0 ? { filters } : {}),
      }
      const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)

      return result.canceled ? [] : result.filePaths
    },
  )

  handleDesktopIpc("desktop:capture-preview-screenshot", async (event, input) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) {
      throw new Error("Preview screenshot capture requires an active window.")
    }

    return capturePreviewScreenshotFromWindow(win, input)
  })

  handleDesktopIpc("desktop:detect-local-preview-services", async () => detectLocalPreviewServices())

  handleDesktopIpc("desktop:git-get-capabilities", async (_event, input: { projectID: string; directory: string }) =>
    getGitCapabilities(input),
  )

  handleDesktopIpc(
    "desktop:git-commit",
    async (_event, input: { projectID: string; directory: string; message: string; stageAll?: boolean }) =>
    commitGitChanges(input),
  )

  handleDesktopIpc("desktop:git-push", async (_event, input: { projectID: string; directory: string }) => pushGitChanges(input))

  handleDesktopIpc("desktop:git-create-branch", async (_event, input: { projectID: string; directory: string; name: string }) =>
    createGitBranch(input),
  )

  handleDesktopIpc("desktop:git-list-branches", async (_event, input: { projectID: string; directory: string }) =>
    listGitBranches(input),
  )

  handleDesktopIpc(
    "desktop:git-checkout-branch",
    async (_event, input: { projectID: string; directory: string; name: string }) => checkoutGitBranch(input),
  )

  handleDesktopIpc("desktop:git-create-pull-request", async (_event, input: { projectID: string; directory: string }) =>
    createGitPullRequest(input),
  )

  handleDesktopIpc("desktop:create-project-workspace", async (_event, input: { directory: string }) => {
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

  handleDesktopIpc("desktop:open-folder-workspace", async (_event, input: { directory: string }) => {
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

  handleDesktopIpc("desktop:agent-create-session", async (_event, input?: { directory?: string }) => {
    const config = getAgentConfig()
    const directory = input?.directory?.trim() || config.defaultDirectory
    const result = await requestAgentJSON<AgentSessionInfo>("/api/sessions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ directory }),
    })

    return {
      session: mapSessionInfo(result.data),
      requestId: result.requestId,
    }
  })

  handleDesktopIpc(
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

  handleDesktopIpc(
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

  handleDesktopIpc(
    "desktop:create-side-chat",
    async (_event, input: { parentSessionID: string; anchorMessageID: string }) => {
      const parentSessionID = input.parentSessionID.trim()
      const anchorMessageID = input.anchorMessageID.trim()
      const result = await requestAgentJSON<AgentSessionInfo>(
        `/api/sessions/${encodeURIComponent(parentSessionID)}/side-chats`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            anchorMessageID,
          }),
        },
      )

      return {
        session: mapSessionInfo(result.data),
        requestId: result.requestId,
      }
    },
  )

  handleDesktopIpc(
    "desktop:list-side-chats",
    async (_event, input: { parentSessionID: string; anchorMessageID?: string }) => {
      const parentSessionID = input.parentSessionID.trim()
      const anchorMessageID = input.anchorMessageID?.trim()
      const search = anchorMessageID ? `?anchorMessageID=${encodeURIComponent(anchorMessageID)}` : ""
      const result = await requestAgentJSON<AgentSideChatLink[]>(
        `/api/sessions/${encodeURIComponent(parentSessionID)}/side-chats${search}`,
      )

      return result.data
    },
  )

  handleDesktopIpc("desktop:get-side-chat-link", async (_event, input: { sessionID: string }) => {
    const sessionID = input.sessionID.trim()
    const result = await requestAgentJSON<AgentSideChatLink>(
      `/api/sessions/${encodeURIComponent(sessionID)}/side-chat-link`,
    )

    return result.data
  })

  handleDesktopIpc("desktop:delete-project-workspace", async (_event, input: { projectID: string }) => {
    const projectID = input.projectID.trim()
    const result = await requestAgentJSON<AgentProjectDeleteResult>(`/api/projects/${encodeURIComponent(projectID)}`, {
      method: "DELETE",
    })

    return {
      ...result.data,
      requestId: result.requestId,
    }
  })

  handleDesktopIpc("desktop:delete-agent-session", async (_event, input: { sessionID: string }) => {
    const sessionID = input.sessionID.trim()
    const result = await requestAgentJSON<AgentSessionDeleteResult>(`/api/sessions/${encodeURIComponent(sessionID)}`, {
      method: "DELETE",
    })

    return {
      ...result.data,
      requestId: result.requestId,
    }
  })

  handleDesktopIpc("desktop:archive-agent-session", async (_event, input: { sessionID: string }) => {
    const sessionID = input.sessionID.trim()
    const result = await requestAgentJSON<AgentSessionArchiveResult>(
      `/api/sessions/${encodeURIComponent(sessionID)}/archive`,
      {
        method: "POST",
      },
    )

    return {
      ...result.data,
      requestId: result.requestId,
    }
  })

  handleDesktopIpc("desktop:list-archived-sessions", async () => {
    const result = await requestAgentJSON<AgentArchivedSessionSummary[]>("/api/sessions/archived")
    return result.data
  })

  handleDesktopIpc("desktop:restore-archived-session", async (_event, input: { sessionID: string }) => {
    const sessionID = input.sessionID.trim()
    const result = await requestAgentJSON<AgentSessionInfo>(`/api/sessions/archived/${encodeURIComponent(sessionID)}/restore`, {
      method: "POST",
    })

    return {
      session: mapSessionInfo(result.data),
      requestId: result.requestId,
    }
  })

  handleDesktopIpc("desktop:delete-archived-session", async (_event, input: { sessionID: string }) => {
    const sessionID = input.sessionID.trim()
    const result = await requestAgentJSON<AgentArchivedSessionDeleteResult>(
      `/api/sessions/archived/${encodeURIComponent(sessionID)}`,
      {
        method: "DELETE",
      },
    )

    return {
      ...result.data,
      requestId: result.requestId,
    }
  })

  handleDesktopIpc("desktop:get-session-diff", async (_event, input: { sessionID: string }) => {
    const sessionID = input.sessionID.trim()
    const sessionResult = await requestAgentJSON<AgentSessionInfo>(`/api/sessions/${encodeURIComponent(sessionID)}`)
    const workspaceDiff = await getWorkspaceGitDiff(sessionResult.data.directory).catch((error) => {
      safeWarn("[desktop] getWorkspaceGitDiff failed:", error)
      return null
    })
    if (workspaceDiff) return workspaceDiff

    const result = await requestAgentJSON<AgentSessionDiffSummary>(`/api/sessions/${encodeURIComponent(sessionID)}/diff`)
    return result.data
  })

  handleDesktopIpc(
    "desktop:restore-workspace-diff-file",
    async (_event, input: { directory: string; file: string }) => restoreWorkspaceDiffFile(input),
  )

  handleDesktopIpc(
    "desktop:get-session-runtime-debug",
    async (_event, input: { sessionID: string; limit?: number; turns?: number }) => {
      const sessionID = input.sessionID.trim()
      const search = new URLSearchParams()
      if (typeof input.limit === "number" && Number.isFinite(input.limit) && input.limit > 0) {
        search.set("limit", String(Math.floor(input.limit)))
      }
      if (typeof input.turns === "number" && Number.isFinite(input.turns) && input.turns > 0) {
        search.set("turns", String(Math.floor(input.turns)))
      }

      const suffix = search.size > 0 ? `?${search.toString()}` : ""
      const result = await requestAgentJSON<AgentSessionRuntimeDebugSnapshot>(
        `/api/debug/sessions/${encodeURIComponent(sessionID)}/runtime${suffix}`,
      )

      return result.data
    },
  )

  handleDesktopIpc("desktop:get-global-provider-catalog", async () => {
    const result = await requestAgentJSON<AgentProviderCatalogItem[]>("/api/providers/catalog")

    return result.data
  })

  handleDesktopIpc("desktop:refresh-global-provider-catalog", async () => {
    const result = await requestAgentJSON<AgentProviderCatalogItem[]>("/api/providers/catalog/refresh", {
      method: "POST",
    })

    return result.data
  })

  handleDesktopIpc("desktop:get-global-provider-auth", async (_event, input: { providerID: string }) => {
    const providerID = input.providerID.trim()
    const result = await requestAgentJSON<AgentProviderAuthState>(`/api/providers/${encodeURIComponent(providerID)}/auth`)
    return result.data
  })

  handleDesktopIpc(
    "desktop:start-global-provider-auth-flow",
    async (_event, input: { providerID: string; method: string }) => {
      const providerID = input.providerID.trim()
      const result = await requestAgentJSON<AgentProviderAuthFlow>(
        `/api/providers/${encodeURIComponent(providerID)}/auth/flows`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            method: input.method,
          }),
        },
      )
      return result.data
    },
  )

  handleDesktopIpc(
    "desktop:get-global-provider-auth-flow",
    async (_event, input: { providerID: string; flowID: string }) => {
      const providerID = input.providerID.trim()
      const flowID = input.flowID.trim()
      const result = await requestAgentJSON<AgentProviderAuthFlow>(
        `/api/providers/${encodeURIComponent(providerID)}/auth/flows/${encodeURIComponent(flowID)}`,
      )
      return result.data
    },
  )

  handleDesktopIpc(
    "desktop:cancel-global-provider-auth-flow",
    async (_event, input: { providerID: string; flowID: string }) => {
      const providerID = input.providerID.trim()
      const flowID = input.flowID.trim()
      const result = await requestAgentJSON<AgentProviderAuthFlow>(
        `/api/providers/${encodeURIComponent(providerID)}/auth/flows/${encodeURIComponent(flowID)}`,
        {
          method: "DELETE",
        },
      )
      return result.data
    },
  )

  handleDesktopIpc(
    "desktop:save-global-provider-api-key",
    async (_event, input: { providerID: string; apiKey?: string | null }) => {
      const providerID = input.providerID.trim()
      const result = await requestAgentJSON<AgentProviderAuthState>(
        `/api/providers/${encodeURIComponent(providerID)}/auth/api-key`,
        {
          method: "PUT",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            apiKey: input.apiKey ?? null,
          }),
        },
      )
      return result.data
    },
  )

  handleDesktopIpc("desktop:delete-global-provider-auth-session", async (_event, input: { providerID: string }) => {
    const providerID = input.providerID.trim()
    const result = await requestAgentJSON<AgentProviderAuthState>(
      `/api/providers/${encodeURIComponent(providerID)}/auth/session`,
      {
        method: "DELETE",
      },
    )
    return result.data
  })

  handleDesktopIpc(
    "desktop:test-global-provider-connection",
    async (
      _event,
      input: {
        providerID: string
        method?: string
        credentialMode?: "active" | "manual" | "environment"
        apiKey?: string | null
        baseURL?: string | null
      },
    ) => {
      const providerID = input.providerID.trim()
      const result = await requestAgentJSON<AgentProviderConnectionTestResult>(
        `/api/providers/${encodeURIComponent(providerID)}/auth/test`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            method: input.method,
            credentialMode: input.credentialMode,
            apiKey: input.apiKey ?? undefined,
            baseURL: input.baseURL ?? undefined,
          }),
        },
      )
      return result.data
    },
  )

  handleDesktopIpc("desktop:get-global-models", async () => {
    const result = await requestAgentJSON<{
      items: AgentProviderModel[]
      selection: AgentProjectModelSelection
    }>("/api/models")

    return result.data
  })

  handleDesktopIpc(
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

  handleDesktopIpc("desktop:delete-global-provider", async (_event, input: { providerID: string }) => {
    const providerID = input.providerID.trim()
    const result = await requestAgentJSON<{
      providerID: string
      selection: AgentProjectModelSelection
    }>(`/api/providers/${encodeURIComponent(providerID)}`, {
      method: "DELETE",
    })

    return result.data
  })

  handleDesktopIpc(
    "desktop:update-global-model-selection",
    async (
      _event,
      input: {
        model?: string | null
        small_model?: string | null
        image_model?: string | null
        image_generation?: {
          default_size?: string
          default_count?: number
        } | null
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
          ...(input.image_model !== undefined ? { image_model: input.image_model } : {}),
          ...(input.image_generation !== undefined ? { image_generation: input.image_generation } : {}),
        }),
      })

      return result.data
    },
  )

  handleDesktopIpc("desktop:get-global-mcp-servers", async () => {
    const result = await requestAgentJSON<AgentMcpServerSummary[]>("/api/mcp/servers")

    return result.data
  })

  handleDesktopIpc("desktop:get-global-mcp-server-diagnostic", async (_event, input: { serverID: string }) => {
    const serverID = input.serverID.trim()
    const result = await requestAgentJSON<AgentMcpServerDiagnostic>(
      `/api/mcp/servers/${encodeURIComponent(serverID)}/diagnostic`,
    )

    return result.data
  })

  handleDesktopIpc(
    "desktop:update-global-mcp-server",
    async (
      _event,
      input: {
        serverID: string
        server: McpServerInput
      },
    ) => {
      const serverID = input.serverID.trim()
      const result = await requestAgentJSON<AgentMcpServerSummary>(`/api/mcp/servers/${encodeURIComponent(serverID)}`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(input.server),
      })

      return result.data
    },
  )

  handleDesktopIpc("desktop:delete-global-mcp-server", async (_event, input: { serverID: string }) => {
    const serverID = input.serverID.trim()
    const result = await requestAgentJSON<{ serverID: string; removed: boolean }>(
      `/api/mcp/servers/${encodeURIComponent(serverID)}`,
      {
        method: "DELETE",
      },
    )

    return result.data
  })

  handleDesktopIpc("desktop:get-plugin-catalog", async () => {
    const result = await requestAgentJSON<AgentPluginCatalogItem[]>("/api/plugins/catalog")

    return result.data
  })

  handleDesktopIpc("desktop:get-installed-plugins", async () => {
    const result = await requestAgentJSON<AgentInstalledPlugin[]>("/api/plugins/installed")

    return result.data
  })

  handleDesktopIpc(
    "desktop:install-plugin",
    async (_event, input: { pluginID: string; config?: Record<string, string>; enabled?: boolean }) => {
      const pluginID = input.pluginID.trim()
      const result = await requestAgentJSON<AgentInstalledPlugin>(
        `/api/plugins/installed/${encodeURIComponent(pluginID)}`,
        {
          method: "PUT",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            config: input.config,
            enabled: input.enabled,
          }),
        },
      )

      return result.data
    },
  )

  handleDesktopIpc(
    "desktop:update-installed-plugin",
    async (_event, input: { pluginID: string; config?: Record<string, string>; enabled?: boolean }) => {
      const pluginID = input.pluginID.trim()
      const result = await requestAgentJSON<AgentInstalledPlugin>(
        `/api/plugins/installed/${encodeURIComponent(pluginID)}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            config: input.config,
            enabled: input.enabled,
          }),
        },
      )

      return result.data
    },
  )

  handleDesktopIpc("desktop:delete-installed-plugin", async (_event, input: { pluginID: string }) => {
    const pluginID = input.pluginID.trim()
    const result = await requestAgentJSON<AgentPluginDeleteResult>(
      `/api/plugins/installed/${encodeURIComponent(pluginID)}`,
      {
        method: "DELETE",
      },
    )

    return result.data
  })

  handleDesktopIpc("desktop:get-installed-plugin-diagnostic", async (_event, input: { pluginID: string }) => {
    const pluginID = input.pluginID.trim()
    const result = await requestAgentJSON<AgentMcpServerDiagnostic>(
      `/api/plugins/installed/${encodeURIComponent(pluginID)}/diagnostic`,
    )

    return result.data
  })

  handleDesktopIpc("desktop:get-installed-plugin-connectors", async (_event, input: { pluginID: string }) => {
    const pluginID = input.pluginID.trim()
    const result = await requestAgentJSON<AgentPluginConnectorStatus[]>(
      `/api/plugins/installed/${encodeURIComponent(pluginID)}/connectors`,
    )

    return result.data
  })

  handleDesktopIpc(
    "desktop:save-installed-plugin-connector-api-key",
    async (_event, input: { pluginID: string; appID: string; apiKey?: string | null }) => {
      const pluginID = input.pluginID.trim()
      const appID = input.appID.trim()
      const result = await requestAgentJSON<AgentPluginConnectorStatus>(
        `/api/plugins/installed/${encodeURIComponent(pluginID)}/connectors/${encodeURIComponent(appID)}/api-key`,
        {
          method: "PUT",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            apiKey: input.apiKey ?? null,
          }),
        },
      )

      return result.data
    },
  )

  handleDesktopIpc(
    "desktop:delete-installed-plugin-connector-api-key",
    async (_event, input: { pluginID: string; appID: string }) => {
      const pluginID = input.pluginID.trim()
      const appID = input.appID.trim()
      const result = await requestAgentJSON<AgentPluginConnectorStatus>(
        `/api/plugins/installed/${encodeURIComponent(pluginID)}/connectors/${encodeURIComponent(appID)}/api-key`,
        {
          method: "DELETE",
        },
      )

      return result.data
    },
  )

  handleDesktopIpc(
    "desktop:get-installed-plugin-connector-diagnostic",
    async (_event, input: { pluginID: string; appID: string }) => {
      const pluginID = input.pluginID.trim()
      const appID = input.appID.trim()
      const result = await requestAgentJSON<AgentMcpServerDiagnostic>(
        `/api/plugins/installed/${encodeURIComponent(pluginID)}/connectors/${encodeURIComponent(appID)}/diagnostic`,
      )

      return result.data
    },
  )

  handleDesktopIpc("desktop:get-builtin-tools", async () => {
    const result = await requestAgentJSON<AgentBuiltinToolsPayload>("/api/tools/builtins")

    return result.data
  })

  handleDesktopIpc("desktop:update-builtin-tool-selection", async (_event, input: AgentBuiltinToolSelection) => {
    const result = await requestAgentJSON<AgentBuiltinToolSelection>("/api/tools/builtins/selection", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        tools: input.tools,
      }),
    })

    return result.data
  })

  handleDesktopIpc("desktop:get-tool-permission-mode", async () => getToolPermissionMode())

  handleDesktopIpc("desktop:update-tool-permission-mode", async (_event, input: AgentToolPermissionModePayload) =>
    updateToolPermissionMode(input),
  )

  handleDesktopIpc("desktop:get-global-skills", async () => {
    const result = await requestAgentJSON<AgentSkillInfo[]>("/api/skills")

    return result.data
  })

  handleDesktopIpc("desktop:get-prompt-presets", async () => {
    const result = await requestAgentJSON<AgentPromptPresetSummary[]>("/api/prompts")

    return result.data
  })

  handleDesktopIpc("desktop:get-prompt-preset-selection", async () => {
    const result = await requestAgentJSON<AgentPromptPresetSelection>("/api/prompts/selection")

    return result.data
  })

  handleDesktopIpc("desktop:read-prompt-preset", async (_event, input: { presetID: string }) => {
    const result = await requestAgentJSON<AgentPromptPresetDocument>(
      `/api/prompts/${encodeURIComponent(input.presetID.trim())}`,
    )

    return result.data
  })

  handleDesktopIpc(
    "desktop:update-prompt-preset",
    async (_event, input: { presetID: string; label?: string; content: string; description?: string }) => {
    const result = await requestAgentJSON<AgentPromptPresetDocument>(
      `/api/prompts/${encodeURIComponent(input.presetID.trim())}`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          label: input.label,
          content: input.content,
          description: input.description,
        }),
      },
    )

    return result.data
    },
  )

  handleDesktopIpc(
    "desktop:update-prompt-preset-selection",
    async (_event, input: AgentPromptPresetSelection) => {
      const result = await requestAgentJSON<AgentPromptPresetSelection>("/api/prompts/selection", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(input),
      })

      return result.data
    },
  )

  handleDesktopIpc(
    "desktop:create-prompt-preset",
    async (_event, input: { label?: string; content?: string; description?: string }) => {
      const result = await requestAgentJSON<AgentPromptPresetDocument>("/api/prompts", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(input),
      })

      return result.data
    },
  )

  handleDesktopIpc("desktop:preview-prompt-url-install", async (_event, input: { source: string }) => {
    const result = await requestAgentJSON<AgentPromptUrlInstallPreview>("/api/prompts/url/preview", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        source: input.source,
      }),
    })

    return result.data
  })

  handleDesktopIpc("desktop:install-prompts-from-url", async (_event, input: { previewID: string; promptIDs: string[] }) => {
    const result = await requestAgentJSON<AgentPromptUrlInstallResult>("/api/prompts/url/install", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        previewID: input.previewID,
        promptIDs: input.promptIDs,
      }),
    })

    return result.data
  })

  handleDesktopIpc("desktop:reset-prompt-preset", async (_event, input: { presetID: string }) => {
    const result = await requestAgentJSON<AgentPromptPresetDocument>(
      `/api/prompts/${encodeURIComponent(input.presetID.trim())}`,
      {
        method: "DELETE",
      },
    )

    return result.data
  })

  handleDesktopIpc("desktop:delete-prompt-preset", async (_event, input: { presetID: string }) => {
    const result = await requestAgentJSON<AgentPromptPresetSelection>(
      `/api/prompts/${encodeURIComponent(input.presetID.trim())}/custom`,
      {
        method: "DELETE",
      },
    )

    return result.data
  })

  handleDesktopIpc("desktop:get-global-skills-tree", async () => {
    const result = await requestAgentJSON<AgentGlobalSkillTree>("/api/skills/tree")

    return result.data
  })

  handleDesktopIpc("desktop:read-global-skill-file", async (_event, input: { path: string }) => {
    const result = await requestAgentJSON<AgentGlobalSkillFileDocument>(
      `/api/skills/file?path=${encodeURIComponent(input.path.trim())}`,
    )

    return result.data
  })

  handleDesktopIpc(
    "desktop:search-workspace-files",
    async (_event, input: { directory: string; query: string }): Promise<AgentWorkspaceFileSearchResult[]> =>
      searchWorkspaceFiles(input.directory, input.query),
  )

  handleDesktopIpc(
    "desktop:read-workspace-file",
    async (_event, input: { directory: string; path: string }): Promise<AgentWorkspaceFileDocument> =>
      readWorkspaceFile(input.directory, input.path),
  )

  handleDesktopIpc("desktop:update-global-skill-file", async (_event, input: { path: string; content: string }) => {
    const result = await requestAgentJSON<AgentGlobalSkillFileDocument>("/api/skills/file", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: input.path,
        content: input.content,
      }),
    })

    return result.data
  })

  handleDesktopIpc("desktop:create-global-skill", async (_event, input: { name: string; parentDirectory?: string | null }) => {
    const result = await requestAgentJSON<{
      directory: string
      file: AgentGlobalSkillFileDocument
    }>("/api/skills", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: input.name,
        parentDirectory: input.parentDirectory,
      }),
    })

    return result.data
  })

  handleDesktopIpc("desktop:preview-global-skill-git-install", async (_event, input: { source: string; parentDirectory?: string | null }) => {
    const result = await requestAgentJSON<AgentSkillGitInstallPreview>("/api/skills/git/preview", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        source: input.source,
        parentDirectory: input.parentDirectory,
      }),
    })

    return result.data
  })

  handleDesktopIpc("desktop:install-global-skills-from-git", async (_event, input: { previewID: string; skillIDs: string[]; parentDirectory?: string | null }) => {
    const result = await requestAgentJSON<AgentSkillGitInstallResult>("/api/skills/git/install", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        previewID: input.previewID,
        skillIDs: input.skillIDs,
        parentDirectory: input.parentDirectory,
      }),
    })

    return result.data
  })

  handleDesktopIpc("desktop:install-global-skill-from-local-file", async (event, input?: { parentDirectory?: string | null }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: "Select SKILL.md",
      filters: [
        {
          name: "Skill Markdown",
          extensions: ["md"],
        },
      ],
      properties: ["openFile"] as Array<"openFile">,
    }
    const selection = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (selection.canceled) return null

    const sourcePath = selection.filePaths[0]
    if (!sourcePath) return null

    const result = await requestAgentJSON<AgentSkillGitInstallResult>("/api/skills/local/install", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sourcePath,
        parentDirectory: input?.parentDirectory,
      }),
    })

    return result.data
  })

  handleDesktopIpc("desktop:rename-global-skill", async (_event, input: { directory: string; name: string }) => {
    const result = await requestAgentJSON<AgentGlobalSkillRenameResult>("/api/skills", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        directory: input.directory,
        name: input.name,
      }),
    })

    return result.data
  })

  handleDesktopIpc("desktop:delete-global-skill", async (_event, input: { directory: string }) => {
    const result = await requestAgentJSON<{ directory: string; removed: boolean }>(
      `/api/skills?directory=${encodeURIComponent(input.directory.trim())}`,
      {
        method: "DELETE",
      },
    )

    return result.data
  })

  handleDesktopIpc("desktop:create-global-skill-folder", async (_event, input: { name: string; parentDirectory?: string | null }) => {
    const result = await requestAgentJSON<AgentGlobalSkillFolderResult>("/api/skills/folders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: input.name,
        parentDirectory: input.parentDirectory,
      }),
    })

    return result.data
  })

  handleDesktopIpc("desktop:rename-global-skill-folder", async (_event, input: { directory: string; name: string }) => {
    const result = await requestAgentJSON<AgentGlobalSkillFolderRenameResult>("/api/skills/folders", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        directory: input.directory,
        name: input.name,
      }),
    })

    return result.data
  })

  handleDesktopIpc("desktop:delete-global-skill-folder", async (_event, input: { directory: string }) => {
    const result = await requestAgentJSON<{ directory: string; removed: boolean }>(
      `/api/skills/folders?directory=${encodeURIComponent(input.directory.trim())}`,
      {
        method: "DELETE",
      },
    )

    return result.data
  })

  handleDesktopIpc("desktop:move-global-skill-directory", async (_event, input: { directory: string; parentDirectory?: string | null }) => {
    const result = await requestAgentJSON<AgentGlobalSkillMoveResult>("/api/skills/move", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        directory: input.directory,
        parentDirectory: input.parentDirectory,
      }),
    })

    return result.data
  })

  handleDesktopIpc("desktop:get-project-provider-catalog", async (_event, input: { projectID: string }) => {
    const projectID = input.projectID.trim()
    const result = await requestAgentJSON<AgentProviderCatalogItem[]>(
      `/api/projects/${encodeURIComponent(projectID)}/providers/catalog`,
    )

    return result.data
  })

  handleDesktopIpc("desktop:refresh-project-provider-catalog", async (_event, input: { projectID: string }) => {
    const projectID = input.projectID.trim()
    const result = await requestAgentJSON<AgentProviderCatalogItem[]>(
      `/api/projects/${encodeURIComponent(projectID)}/providers/catalog/refresh`,
      {
        method: "POST",
      },
    )

    return result.data
  })

  handleDesktopIpc("desktop:get-project-models", async (_event, input: { projectID: string }) => {
    const projectID = input.projectID.trim()
    const result = await requestAgentJSON<AgentProjectModelsResult>(`/api/projects/${encodeURIComponent(projectID)}/models`)

    return result.data
  })

  handleDesktopIpc("desktop:get-session-models", async (_event, input: { sessionID: string }) => {
    const sessionID = input.sessionID.trim()
    const result = await requestAgentJSON<AgentProjectModelsResult>(`/api/sessions/${encodeURIComponent(sessionID)}/models`)

    return result.data
  })

  handleDesktopIpc(
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

  handleDesktopIpc(
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

  handleDesktopIpc(
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

  handleDesktopIpc(
    "desktop:update-session-model-selection",
    async (
      _event,
      input: {
        sessionID: string
        model?: string | null
        small_model?: string | null
      },
    ) => {
      const sessionID = input.sessionID.trim()
      const result = await requestAgentJSON<AgentProjectModelSelection>(
        `/api/sessions/${encodeURIComponent(sessionID)}/model-selection`,
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

  handleDesktopIpc("desktop:get-project-skills", async (_event, input: { projectID: string }) => {
    const projectID = input.projectID.trim()
    const result = await requestAgentJSON<AgentSkillInfo[]>(
      `/api/projects/${encodeURIComponent(projectID)}/skills`,
    )

    return result.data
  })

  handleDesktopIpc("desktop:get-project-skill-selection", async (_event, input: { projectID: string }) => {
    const projectID = input.projectID.trim()
    const result = await requestAgentJSON<AgentProjectSkillSelection>(
      `/api/projects/${encodeURIComponent(projectID)}/skills/selection`,
    )

    return result.data
  })

  handleDesktopIpc(
    "desktop:update-project-skill-selection",
    async (_event, input: { projectID: string; skillIDs: string[] }) => {
      const projectID = input.projectID.trim()
      const result = await requestAgentJSON<AgentProjectSkillSelection>(
        `/api/projects/${encodeURIComponent(projectID)}/skills/selection`,
        {
          method: "PUT",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            skillIDs: input.skillIDs,
          }),
        },
      )

      return result.data
    },
  )

  handleDesktopIpc("desktop:get-project-mcp-selection", async (_event, input: { projectID: string }) => {
    const projectID = input.projectID.trim()
    const result = await requestAgentJSON<AgentProjectMcpSelection>(
      `/api/projects/${encodeURIComponent(projectID)}/mcp/selection`,
    )

    return result.data
  })

  handleDesktopIpc(
    "desktop:update-project-mcp-selection",
    async (_event, input: { projectID: string; serverIDs: string[] }) => {
      const projectID = input.projectID.trim()
      const result = await requestAgentJSON<AgentProjectMcpSelection>(
        `/api/projects/${encodeURIComponent(projectID)}/mcp/selection`,
        {
          method: "PUT",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            serverIDs: input.serverIDs,
          }),
        },
      )

      return result.data
    },
  )

  handleDesktopIpc("desktop:get-project-mcp-servers", async (_event, input: { projectID: string }) => {
    const projectID = input.projectID.trim()
    const result = await requestAgentJSON<AgentMcpServerSummary[]>(
      `/api/projects/${encodeURIComponent(projectID)}/mcp/servers`,
    )

    return result.data
  })

  handleDesktopIpc(
    "desktop:get-project-mcp-server-diagnostic",
    async (_event, input: { projectID: string; serverID: string }) => {
      const projectID = input.projectID.trim()
      const serverID = input.serverID.trim()
      const result = await requestAgentJSON<AgentMcpServerDiagnostic>(
        `/api/projects/${encodeURIComponent(projectID)}/mcp/servers/${encodeURIComponent(serverID)}/diagnostic`,
      )

      return result.data
    },
  )

  handleDesktopIpc(
    "desktop:update-project-mcp-server",
    async (
      _event,
      input: {
        projectID: string
        serverID: string
        server: McpServerInput
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

  handleDesktopIpc(
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

  handleDesktopIpc(
    "desktop:agent-session-load-history",
    async (_event, input: { backendSessionID: string }) => {
      const sessionID = input.backendSessionID.trim()
      const result = await requestAgentJSON<AgentSessionHistoryMessage[]>(
        `/api/sessions/${encodeURIComponent(sessionID)}/messages`,
      )

      return result.data
    },
  )

  handleDesktopIpc(
    "desktop:agent-session-load-permission-requests",
    async (_event, input: { backendSessionID: string }) => {
      const sessionID = input.backendSessionID.trim()
      const result = await requestAgentJSON<AgentPermissionRequest[]>(
        `/api/permissions/requests?status=pending&view=prompt&sessionID=${encodeURIComponent(sessionID)}`,
      )

      return result.data
    },
  )

  handleDesktopIpc(
    "desktop:agent-session-respond-permission-request",
    async (
      _event,
      input: {
        requestID: string
        decision: "allow" | "deny"
        note?: string
        resume?: boolean
      },
    ) => {
      const requestID = input.requestID.trim()
      const result = await requestAgentJSON<AgentPermissionResolveResult>(
        `/api/permissions/requests/${encodeURIComponent(requestID)}/resolve`,
        {
          method: "POST",
          body: JSON.stringify({
            decision: input.decision,
            note: input.note,
            resume: input.resume,
          }),
        },
      )

      return result.data
    },
  )

  function buildAgentSessionTurnRequestBody(input: AgentSessionTurnRequestInput) {
    return {
      text: input.text,
      attachments: input.attachments,
      questionAnswer: input.questionAnswer,
      reasoningEffort: input.reasoningEffort,
      model: input.model,
      system: input.system,
      agent: input.agent,
      skills: input.skills,
    }
  }

  async function streamAgentSessionTurnToRenderer(
    target: Electron.WebContents,
    input: Pick<AgentSessionTurnRequestInput, "backendSessionID" | "clientTurnID"> & Partial<AgentSessionTurnRequestInput>,
    routePath: string,
  ) {
    const clientTurnID = input.clientTurnID.trim()
    const backendSessionID = input.backendSessionID.trim()
    const request: ActiveAgentSessionRequest = {
      backendSessionID,
      cancelRequested: false,
      clientTurnID,
      controller: new AbortController(),
    }
    activeAgentSessionRequests.set(agentSessionRequestKey(target.id, clientTurnID), request)

    let requestId: string | undefined

    try {
      const response = await fetch(resolveAgentURL(routePath), {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(buildAgentSessionTurnRequestBody({
          ...input,
          clientTurnID,
          backendSessionID,
        })),
        signal: request.controller.signal,
      })

      if (!response.ok) {
        const envelope = (await response.json().catch(() => null)) as AgentEnvelope<unknown> | null
        throw new Error(envelope?.error?.message || `Agent session stream failed (${response.status})`)
      }

      requestId = response.headers.get("x-request-id") ?? undefined

      await readAgentSSEStream(response, (item) => {
        sendDesktopIpcEvent(target, AGENT_SESSION_EVENT_CHANNEL, {
          kind: "stream",
          source: "request",
          backendSessionID,
          clientTurnID,
          id: item.id,
          event: item.event,
          data: item.data,
          receivedAt: Date.now(),
        } satisfies AgentSessionBridgeIPCEvent)
      })
    } catch (error) {
      if (request.cancelRequested && isAbortError(error)) {
        return {
          clientTurnID,
          requestId,
        }
      }

      sendDesktopIpcEvent(target, AGENT_SESSION_EVENT_CHANNEL, {
        kind: "stream",
        source: "request",
        backendSessionID,
        clientTurnID,
        event: "error",
        data: {
          sessionID: backendSessionID,
          message: error instanceof Error ? error.message : String(error),
        },
          receivedAt: Date.now(),
        } satisfies AgentSessionBridgeIPCEvent)
    } finally {
      removeActiveAgentSessionRequest(target.id, clientTurnID, request)
    }

    return {
      clientTurnID,
      requestId,
    }
  }

  handleDesktopIpc(
    "desktop:agent-session-send-turn",
    async (_event, input: AgentSessionTurnRequestInput) =>
      streamAgentSessionTurnToRenderer(
        _event.sender,
        input,
        `/api/sessions/${encodeURIComponent(input.backendSessionID.trim())}/messages/stream`,
      ),
  )

  handleDesktopIpc(
    "desktop:agent-session-resume-turn",
    async (_event, input: { clientTurnID: string; backendSessionID: string }) =>
      streamAgentSessionTurnToRenderer(
        _event.sender,
        {
          clientTurnID: input.clientTurnID,
          backendSessionID: input.backendSessionID,
        },
        `/api/sessions/${encodeURIComponent(input.backendSessionID.trim())}/resume/stream`,
      ),
  )

  handleDesktopIpc(
    "desktop:agent-session-cancel-turn",
    async (event, input: { clientTurnID: string; backendSessionID: string }) => {
      const clientTurnID = input.clientTurnID.trim()
      const backendSessionID = input.backendSessionID.trim()
      const request = getActiveAgentSessionRequest(event.sender.id, clientTurnID)
      const localRequestAborted = Boolean(request)

      if (request) {
        request.cancelRequested = true
        request.controller.abort()
      }

      try {
        const result = await requestAgentJSON<{ sessionID: string; cancelled: boolean }>(
          `/api/sessions/${encodeURIComponent(backendSessionID)}/cancel`,
          {
            method: "POST",
          },
        )

        return {
          clientTurnID,
          backendSessionID,
          localRequestAborted,
          backendCancelled: result.data.cancelled,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (localRequestAborted) {
          safeWarn("[desktop] agent session cancel endpoint failed after local abort:", message)
          return {
            clientTurnID,
            backendSessionID,
            localRequestAborted,
            backendCancelled: false,
            backendCancelError: message,
          }
        }

        throw error
      }
    },
  )

  handleDesktopIpc(
    "desktop:agent-session-answer-question",
    async (_event, input: {
      backendSessionID: string
      questionID: string
      selectedOptions?: string[]
      freeformText?: string
    }) => {
      const backendSessionID = input.backendSessionID.trim()
      const result = await requestAgentJSON<{
        sessionID: string
        questionID: string
        selectedOptions?: string[]
        freeformText?: string
        answerText: string
        answeredAt: number
      }>(
        `/api/sessions/${encodeURIComponent(backendSessionID)}/questions/answer`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            questionID: input.questionID,
            selectedOptions: input.selectedOptions,
            freeformText: input.freeformText,
          }),
        },
      )

      return result.data
    },
  )

  handleDesktopIpc(
    "desktop:agent-session-subscribe",
    async (event, input: { uiSessionID?: string; backendSessionID: string }) => {
      const backendSessionID = input.backendSessionID.trim()
      const target = event.sender
      const existing = getSessionStreamSubscription(target.id, backendSessionID)
      if (existing) {
        return {
          backendSessionID,
          lastEventID: existing.lastEventID,
        }
      }

      const subscription = createSessionStreamSubscription(target, backendSessionID, {
        uiSessionID: input.uiSessionID,
      })
      sessionStreamSubscriptions.set(
        sessionStreamSubscriptionKey(target.id, backendSessionID),
        subscription,
      )

      if (!sessionStreamCleanupTargets.has(target.id)) {
        sessionStreamCleanupTargets.add(target.id)
        target.once("destroyed", () => {
          disposeSessionStreamSubscriptionsForWebContents(sessionStreamSubscriptions, target.id)
          sessionStreamCleanupTargets.delete(target.id)
        })
      }

      void subscription.start()

      return {
        backendSessionID,
        lastEventID: subscription.lastEventID,
      }
    },
  )

  handleDesktopIpc(
    "desktop:agent-session-unsubscribe",
    async (event, input: { backendSessionID: string }) => ({
      backendSessionID: input.backendSessionID.trim(),
      removed: removeSessionStreamSubscription(event.sender.id, input.backendSessionID.trim()),
    }),
  )

}

export const internal = {
  capturePreviewScreenshotFromWindow,
  disposeSessionStreamSubscriptionsForWebContents,
  getToolPermissionMode,
  isSessionStreamSubscriptionKeyForWebContents,
  updateToolPermissionMode,
}
