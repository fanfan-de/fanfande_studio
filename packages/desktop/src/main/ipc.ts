import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type IpcMainInvokeEvent, type MenuItemConstructorOptions, type NativeImage, type OpenDialogOptions, type OpenDialogReturnValue, type SaveDialogOptions, type SaveDialogReturnValue, type WebContents } from "electron"
import { createPlatformAdapter } from "@anybox/platform"
import { DesktopIpcSchemas } from "@anybox/shared"
import { appendFile, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import type { AppearanceConfigDocument } from "../shared/appearance"
import type { AppLocale, LocaleConfigDocument } from "../shared/locale"
import type {
  DesktopIpcChannel,
  DesktopIpcEventChannel,
  DesktopIpcEventPayload,
  DesktopIpcInput,
  DesktopIpcOutput,
  DesktopRendererErrorReport,
  DesktopRendererMemoryDiagnosticsRecord,
  DesktopRendererMemoryDiagnosticsSnapshot,
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
import { resolveManagedAgentDataDir } from "./managed-agent"
import { openMonitorWindow } from "./monitor-window"
import { readPreviewText, resolvePreviewTarget } from "./preview-targets"
import { PtyProxyManager } from "./pty-proxy"
import { safeError, safeWarn } from "./safe-console"
import { sendWebContentsSafely } from "./safe-web-contents-send"
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
  AgentConnectorDefinition,
  AgentConnectorStatus,
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
  AgentProjectPluginSelection,
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
  AgentSessionDiffScope,
  AgentSessionDiffSummary,
  AgentSessionHistoryMessage,
  AgentSessionInfo,
  AgentSessionRuntimeDebugSnapshot,
  AgentSessionTraceExport,
  AgentSessionTaskListView,
  AgentSessionTurnRequestInput,
  AgentSessionWorkflowUpdateInput,
  AgentSideChatLink,
  AgentSkillInfo,
  AgentToolPermissionModePayload,
  AgentWorkspaceSession,
  AgentWorkspaceFileDocument,
  AgentWorkspaceDirectoryEntry,
  AgentWorkspaceFileSearchResult,
  MenuAnchor,
  MenuKey,
  WindowAction,
} from "./types"
import { isWindowMaximized, maximizeFramelessWindow, restoreFramelessWindow, sendWindowState } from "./window-state"
import {
  getWorkspaceGitFileStates,
  getWorkspaceGitDiff,
  restoreWorkspaceDiffFile,
  reverseApplyWorkspaceDiffPatches,
  stageWorkspaceDiffFile,
  unstageWorkspaceDiffFile,
} from "./workspace-diff"
import { listWorkspaceDirectory, readWorkspaceFile, searchWorkspaceFiles } from "./workspace-files"
import { WorkspaceWatchManager } from "./workspace-watch"
import type { WorkbenchWindowManager } from "./workbench-window-manager"

const AGENT_SESSION_EVENT_CHANNEL = DESKTOP_AGENT_SESSION_EVENT_CHANNEL

const GIT_DIFF_SCOPES = new Set<AgentSessionDiffScope>([
  "git:unstaged",
  "git:staged",
  "git:commit",
  "git:branch",
])

const GIT_DISABLED_DIFF_SCOPES = [
  "git:unstaged",
  "git:staged",
  "git:commit",
  "git:branch",
] satisfies AgentSessionDiffScope[]

function createNonGitScopeOptions(diff: AgentSessionDiffSummary): AgentSessionDiffSummary["availableScopes"] {
  return [
    ...GIT_DISABLED_DIFF_SCOPES.map((scope) => ({
      scope,
      label: scope === "git:unstaged"
        ? "未暂存"
        : scope === "git:staged"
          ? "已暂存"
          : scope === "git:commit"
            ? "提交"
            : "分支",
      enabled: false,
      reason: "Current project is not managed by Git.",
      ...(scope === "git:commit" ? { hasChildren: true } : {}),
    })),
    {
      scope: "session:last-turn",
      label: "上轮对话",
      enabled: true,
      count: diff.stats?.files ?? diff.diffs.length,
    },
  ]
}

function appendLastTurnScopeOption(
  gitDiff: AgentSessionDiffSummary,
  diff?: AgentSessionDiffSummary,
): AgentSessionDiffSummary["availableScopes"] {
  const options = (gitDiff.availableScopes ?? []).filter((option) => option.scope !== "session:last-turn")
  return [
    ...options,
    {
      scope: "session:last-turn",
      label: "上轮对话",
      enabled: true,
      ...(diff ? { count: diff.stats?.files ?? diff.diffs.length } : {}),
    },
  ]
}

function withLastTurnScope(
  diff: AgentSessionDiffSummary,
  availableScopes: AgentSessionDiffSummary["availableScopes"],
  restoreMode: AgentSessionDiffSummary["restoreMode"] = "none",
): AgentSessionDiffSummary {
  return {
    ...diff,
    scope: "session:last-turn",
    restoreMode,
    availableScopes,
  }
}

async function withWorkspaceGitFileStates(directory: string, diff: AgentSessionDiffSummary) {
  const states = await getWorkspaceGitFileStates(
    directory,
    diff.diffs.map((item) => item.file),
  ).catch((error) => {
    safeWarn("[desktop] getWorkspaceGitFileStates failed:", error)
    return null
  })
  if (!states) return diff

  return {
    ...diff,
    diffs: diff.diffs.map((item) => ({
      ...item,
      gitState: states[item.file] ?? "unknown",
    })),
  } satisfies AgentSessionDiffSummary
}

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
  return sendWebContentsSafely(target, channel, payload)
}

function normalizeShowMenuInput(input: MenuKey | { menuKey: MenuKey; anchor?: MenuAnchor }) {
  if (typeof input === "string") {
    return { menuKey: input, anchor: undefined }
  }

  return input
}

function truncateLogString(value: string | undefined, maxLength = 8_000) {
  if (!value) return value
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength)}\n[truncated ${value.length - maxLength} chars]`
}

function normalizeRendererErrorReport(input: DesktopRendererErrorReport): DesktopRendererErrorReport {
  return {
    ...input,
    componentStack: truncateLogString(input.componentStack),
    message: truncateLogString(input.message, 2_000) ?? "Unknown renderer error",
    name: truncateLogString(input.name, 500),
    stack: truncateLogString(input.stack),
    url: truncateLogString(input.url, 2_000),
    userAgent: truncateLogString(input.userAgent, 1_000),
  }
}

async function appendRendererErrorLog(report: DesktopRendererErrorReport & { senderURL?: string; webContentsID?: number }) {
  const logPath = path.join(app.getPath("userData"), "renderer-errors.log")
  const line = `${JSON.stringify(report)}\n`
  await appendFile(logPath, line, "utf8")
}

const rendererMemoryDiagnosticsByWebContentsID = new Map<number, DesktopRendererMemoryDiagnosticsRecord>()
const rendererMemoryDiagnosticsCleanupTargets = new Set<number>()

function normalizeRendererMemoryDiagnostics(
  input: DesktopRendererMemoryDiagnosticsSnapshot,
  event: IpcMainInvokeEvent,
): DesktopRendererMemoryDiagnosticsRecord {
  return {
    ...input,
    senderURL: event.sender.getURL(),
    webContentsID: event.sender.id,
  }
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
    subagent: session.subagent,
    modelSelection: session.modelSelection,
    created: session.time.created,
    updated: session.time.updated,
    workflow: session.workflow,
  }
}

function sideChatLinkHasRealAssistantResponse(link: AgentSideChatLink) {
  return Boolean(link.snapshot?.assistantText?.trim())
}

async function deleteAgentSessionRecord(sessionID: string) {
  const result = await requestAgentJSON<AgentSessionDeleteResult>(`/api/sessions/${encodeURIComponent(sessionID)}`, {
    method: "DELETE",
  })
  return {
    ...result.data,
    requestId: result.requestId,
  }
}

async function cleanupSideChatLinksWithoutResponses(
  links: AgentSideChatLink[],
  deleteSession: (sessionID: string) => Promise<unknown> = deleteAgentSessionRecord,
) {
  const retainedLinks: AgentSideChatLink[] = []
  const deletedSessionIDs = new Set<string>()

  for (const link of links) {
    const sessionID = link.sessionID.trim()
    if (deletedSessionIDs.has(sessionID)) {
      continue
    }

    if (!sessionID || link.archived || sideChatLinkHasRealAssistantResponse(link)) {
      retainedLinks.push(link)
      continue
    }

    try {
      await deleteSession(sessionID)
      deletedSessionIDs.add(sessionID)
    } catch (error) {
      safeWarn("[desktop] empty side chat cleanup failed:", error)
      retainedLinks.push(link)
    }
  }

  return retainedLinks
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
type SaveComposerPastedImagesInput = DesktopIpcInput<"desktop:save-composer-pasted-images">

interface PreviewScreenshotCaptureOptions {
  makeDirectory?: (directory: string, options: { recursive: true }) => Promise<unknown>
  now?: Date
  userDataPath?: string
  writeImageFile?: (filePath: string, data: Buffer) => Promise<unknown>
}

interface SaveComposerPastedImagesOptions {
  makeDirectory?: (directory: string, options: { recursive: true }) => Promise<unknown>
  now?: Date
  userDataPath?: string
  writeImageFile?: (filePath: string, data: Buffer) => Promise<unknown>
}

const COMPOSER_PASTED_IMAGE_EXTENSIONS = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
  ["image/bmp", "bmp"],
  ["image/svg+xml", "svg"],
])

function sanitizeComposerPastedImageName(value: string | undefined, fallback: string) {
  const basename = path.basename(value?.trim() || fallback)
  const withoutExtension = basename.replace(/\.[^.]+$/, "")
  return (
    withoutExtension
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || fallback
  )
}

function parseComposerPastedImageDataUrl(dataUrl: string, fallbackMimeType: string) {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(dataUrl.trim())
  if (!match) {
    throw new Error("Pasted image data must be a base64 data URL.")
  }

  const mimeType = (match[1] || fallbackMimeType).trim().toLowerCase()
  const extension = COMPOSER_PASTED_IMAGE_EXTENSIONS.get(mimeType)
  if (!extension) {
    throw new Error(`Unsupported pasted image type: ${mimeType || "unknown"}.`)
  }

  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64")
  if (buffer.length === 0) {
    throw new Error("Pasted image data is empty.")
  }

  return {
    buffer,
    extension,
  }
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

async function saveComposerPastedImages(
  input: SaveComposerPastedImagesInput,
  options: SaveComposerPastedImagesOptions = {},
) {
  const imageDirectory = path.join(
    options.userDataPath ?? app.getPath("userData"),
    "composer-pasted-images",
  )
  const timestamp = (options.now ?? new Date()).toISOString().replace(/[:.]/g, "-")
  const savedPaths: string[] = []

  await (options.makeDirectory ?? mkdir)(imageDirectory, { recursive: true })

  for (const [index, image] of input.images.entries()) {
    const parsedImage = parseComposerPastedImageDataUrl(image.dataUrl, image.mimeType)
    const safeName = sanitizeComposerPastedImageName(image.name, "pasted-image")
    const filePath = path.join(
      imageDirectory,
      `${timestamp}-${String(index + 1).padStart(2, "0")}-${safeName}.${parsedImage.extension}`,
    )

    await (options.writeImageFile ?? writeFile)(filePath, parsedImage.buffer)
    savedPaths.push(filePath)
  }

  return savedPaths
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

type SessionTraceExportInput = DesktopIpcInput<"desktop:get-session-trace-export">
type SaveSessionTraceExportInput = DesktopIpcInput<"desktop:save-session-trace-export">
type SaveSessionTraceExportDirectoryInput = DesktopIpcInput<"desktop:save-session-trace-export-directory">

interface SaveSessionTraceExportOptions {
  downloadsPath?: string
  now?: Date
  showSaveDialog?: (options: SaveDialogOptions) => Promise<SaveDialogReturnValue>
  writeTraceFile?: (filePath: string, data: string, encoding: BufferEncoding) => Promise<unknown>
}

interface SaveSessionTraceExportDirectoryOptions {
  downloadsPath?: string
  makeDirectory?: (directory: string, options: { recursive: true }) => Promise<unknown>
  now?: Date
  showOpenDialog?: (options: OpenDialogOptions) => Promise<OpenDialogReturnValue>
  writeTraceFile?: (filePath: string, data: string, encoding: BufferEncoding) => Promise<unknown>
}

function sanitizeSessionTraceFileSegment(value: string) {
  return (
    value
      .trim()
      .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "session"
  )
}

function formatSessionTraceTimestamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0")
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("")
}

function sanitizeSessionTraceFileNamePart(value: string | undefined) {
  return (value ?? "")
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56)
}

function readTraceExportRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readTraceExportString(value: unknown) {
  return typeof value === "string" ? value : undefined
}

function readTraceExportNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function readTraceExportArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function readTraceExportStringArray(value: unknown) {
  return readTraceExportArray(value).filter((item): item is string => typeof item === "string")
}

function traceExportRelativePath(...parts: string[]) {
  return parts.join("/")
}

function traceExportDiskPath(directory: string, relativePath: string) {
  return path.join(directory, ...relativePath.split("/"))
}

function formatTraceExportRecordFileName(index: number, fallback: string, ...parts: Array<string | undefined>) {
  const ordinal = String(index + 1).padStart(6, "0")
  const slug = parts
    .map((part) => sanitizeSessionTraceFileNamePart(part))
    .filter(Boolean)
    .join("-")
    .slice(0, 96)

  return `${ordinal}-${slug || fallback}.json`
}

function summarizeTraceExportMessage(message: unknown, index: number, file: string) {
  const record = readTraceExportRecord(message)
  const info = readTraceExportRecord(record?.info)
  const pathInfo = readTraceExportRecord(record?.path)

  return {
    index: index + 1,
    file,
    messageID: readTraceExportString(record?.id) ?? readTraceExportString(record?.messageID),
    role: readTraceExportString(record?.role),
    turnID: readTraceExportString(record?.turnID) ?? readTraceExportString(info?.turnID),
    parentMessageID: readTraceExportString(record?.parentMessageID) ?? readTraceExportString(record?.parentID),
    created: readTraceExportNumber(record?.created),
    completed: readTraceExportNumber(record?.completed),
    providerID: readTraceExportString(record?.providerID),
    modelID: readTraceExportString(record?.modelID),
    agent: readTraceExportString(record?.agent),
    cwd: readTraceExportString(pathInfo?.cwd),
  }
}

function summarizeTraceExportTurn(turn: unknown, index: number, file: string) {
  const record = readTraceExportRecord(turn)
  const tools = readTraceExportArray(record?.tools)
  const llmCalls = readTraceExportArray(record?.llmCalls)
  const recentEvents = readTraceExportArray(record?.recentEvents)

  return {
    index: index + 1,
    file,
    turnID: readTraceExportString(record?.turnID),
    status: readTraceExportString(record?.status),
    phase: readTraceExportString(record?.phase),
    startedAt: readTraceExportNumber(record?.startedAt),
    endedAt: readTraceExportNumber(record?.endedAt),
    durationMs: readTraceExportNumber(record?.durationMs),
    lastEventAt: readTraceExportNumber(record?.lastEventAt),
    userMessageID: readTraceExportString(record?.userMessageID),
    agent: readTraceExportString(record?.agent),
    model: readTraceExportString(record?.model),
    toolCount: tools.length,
    llmCallCount: llmCalls.length,
    recentEventCount: recentEvents.length,
  }
}

function summarizeTraceExportToolCall(
  toolCall: unknown,
  index: number,
  file: string,
) {
  const record = readTraceExportRecord(toolCall)

  return {
    index: index + 1,
    file,
    callID: readTraceExportString(record?.callID),
    tool: readTraceExportString(record?.tool),
    status: readTraceExportString(record?.status),
    turnID: readTraceExportString(record?.turnID),
    messageID: readTraceExportString(record?.messageID),
    title: readTraceExportString(record?.title),
    startedAt: readTraceExportNumber(record?.startedAt),
    endedAt: readTraceExportNumber(record?.endedAt),
    durationMs: readTraceExportNumber(record?.durationMs),
    eventIDs: readTraceExportStringArray(record?.eventIDs),
  }
}

async function writeSplitSessionTraceExportDirectory(
  trace: AgentSessionTraceExport,
  directory: string,
  options: SaveSessionTraceExportDirectoryOptions,
) {
  const makeDirectory = options.makeDirectory ?? ((target: string, mkdirOptions: { recursive: true }) =>
    mkdir(target, mkdirOptions))
  const writeTraceFile = options.writeTraceFile ?? ((filePath: string, data: string, encoding: BufferEncoding) =>
    writeFile(filePath, data, encoding))
  const directories = [
    directory,
    traceExportDiskPath(directory, "records"),
    traceExportDiskPath(directory, "messages"),
    traceExportDiskPath(directory, "tool-calls"),
    traceExportDiskPath(directory, "runtime"),
    traceExportDiskPath(directory, "runtime/turns"),
  ]
  let fileCount = 0

  for (const target of directories) {
    await makeDirectory(target, { recursive: true })
  }

  async function writeJSON(relativePath: string, value: unknown) {
    await writeTraceFile(traceExportDiskPath(directory, relativePath), `${JSON.stringify(value, null, 2)}\n`, "utf8")
    fileCount += 1
  }

  const messages = readTraceExportArray(trace.messages)
  const events = readTraceExportArray(trace.events)
  const toolCalls = readTraceExportArray(trace.toolCalls)
  const runtimeTurns = readTraceExportArray(trace.runtime?.turns)
  const runtimeRecentEvents = readTraceExportArray(trace.runtime?.recentEvents)
  const toolCallFilesByEventID = new Map<string, string[]>()
  const toolCallIndex = toolCalls.map((toolCall, index) => {
    const record = readTraceExportRecord(toolCall)
    const tool = readTraceExportString(record?.tool)
    const callID = readTraceExportString(record?.callID)
    const eventIDs = readTraceExportStringArray(record?.eventIDs)
    const file = traceExportRelativePath(
      "tool-calls",
      formatTraceExportRecordFileName(index, "tool-call", tool, callID),
    )
    for (const eventID of eventIDs) {
      const files = toolCallFilesByEventID.get(eventID) ?? []
      files.push(file)
      toolCallFilesByEventID.set(eventID, files)
    }

    return summarizeTraceExportToolCall(toolCall, index, file)
  })
  const messageIndex = messages.map((message, index) => {
    const summary = summarizeTraceExportMessage(message, index, "")
    const file = traceExportRelativePath(
      "messages",
      formatTraceExportRecordFileName(index, "message", summary.role, summary.messageID),
    )
    return summarizeTraceExportMessage(message, index, file)
  })
  const runtimeTurnIndex = runtimeTurns.map((turn, index) => {
    const turnRecord = readTraceExportRecord(turn)
    const turnID = readTraceExportString(turnRecord?.turnID)
    const file = traceExportRelativePath(
      "runtime",
      "turns",
      formatTraceExportRecordFileName(index, "turn", turnID),
    )
    return summarizeTraceExportTurn(turn, index, file)
  })
  const recordIndex = events.map((event, index) => {
    const record = readTraceExportRecord(event)
    const eventID = readTraceExportString(record?.eventID)
    const eventType = readTraceExportString(record?.type)
    const seq = readTraceExportNumber(record?.seq)
    const file = traceExportRelativePath(
      "records",
      formatTraceExportRecordFileName(index, "event", eventType, seq === undefined ? undefined : String(seq), eventID),
    )

    return {
      index: index + 1,
      file,
      eventID,
      sessionID: readTraceExportString(record?.sessionID),
      turnID: readTraceExportString(record?.turnID),
      seq,
      timestamp: readTraceExportNumber(record?.timestamp),
      type: eventType,
      relatedToolCallFiles: eventID ? toolCallFilesByEventID.get(eventID) ?? [] : [],
    }
  })
  const latestTurn = trace.runtime?.latestTurn ?? null
  const runtimeStatus: Partial<AgentSessionTraceExport["runtime"]> = trace.runtime ? { ...trace.runtime } : {}
  delete runtimeStatus.turns
  delete runtimeStatus.recentEvents
  delete runtimeStatus.latestTurn
  const latestTurnRecord = readTraceExportRecord(latestTurn)
  const latestTurnID = readTraceExportString(latestTurnRecord?.turnID)
  const latestTurnIndex = latestTurnID
    ? runtimeTurns.findIndex((turn) => readTraceExportString(readTraceExportRecord(turn)?.turnID) === latestTurnID)
    : -1

  await writeJSON("manifest.json", {
    schemaVersion: 1,
    exportFormat: "anybox-session-trace-directory",
    generatedAt: trace.generatedAt,
    mode: trace.mode,
    session: trace.session,
    stats: trace.stats,
    redaction: trace.redaction,
    layout: {
      records: "records/index.json",
      messages: "messages/index.json",
      toolCalls: "tool-calls/index.json",
      runtimeStatus: "runtime/status.json",
      runtimeRecentEvents: "runtime/recent-events.json",
      runtimeTurns: "runtime/turns/index.json",
    },
  })
  await writeJSON("records/index.json", recordIndex)
  for (const [index, event] of events.entries()) {
    await writeJSON(recordIndex[index].file, {
      schemaVersion: 1,
      recordType: "event",
      index: index + 1,
      event,
      relatedToolCallFiles: recordIndex[index].relatedToolCallFiles,
    })
  }

  await writeJSON("messages/index.json", messageIndex)
  for (const [index, message] of messages.entries()) {
    await writeJSON(messageIndex[index].file, {
      schemaVersion: 1,
      recordType: "message",
      index: index + 1,
      message,
    })
  }

  await writeJSON("tool-calls/index.json", toolCallIndex)
  for (const [index, toolCall] of toolCalls.entries()) {
    await writeJSON(toolCallIndex[index].file, {
      schemaVersion: 1,
      recordType: "tool-call",
      index: index + 1,
      toolCall,
    })
  }

  await writeJSON("runtime/status.json", {
    schemaVersion: 1,
    runtime: runtimeStatus,
    latestTurn: latestTurn && latestTurnIndex >= 0
      ? runtimeTurnIndex[latestTurnIndex]
      : latestTurn
        ? {
            turnID: latestTurnID,
            status: readTraceExportString(latestTurnRecord?.status),
            phase: readTraceExportString(latestTurnRecord?.phase),
            startedAt: readTraceExportNumber(latestTurnRecord?.startedAt),
            endedAt: readTraceExportNumber(latestTurnRecord?.endedAt),
            durationMs: readTraceExportNumber(latestTurnRecord?.durationMs),
            lastEventAt: readTraceExportNumber(latestTurnRecord?.lastEventAt),
          }
        : null,
    turns: {
      count: runtimeTurns.length,
      index: "runtime/turns/index.json",
    },
    recentEvents: {
      count: runtimeRecentEvents.length,
      file: "runtime/recent-events.json",
    },
  })
  await writeJSON("runtime/recent-events.json", runtimeRecentEvents)
  await writeJSON("runtime/turns/index.json", runtimeTurnIndex)
  for (const [index, turn] of runtimeTurns.entries()) {
    await writeJSON(runtimeTurnIndex[index].file, {
      schemaVersion: 1,
      recordType: "runtime-turn",
      index: index + 1,
      turn,
    })
  }

  return {
    fileCount,
    recordCount: events.length,
  }
}

async function getSessionTraceExport(input: SessionTraceExportInput) {
  const sessionID = input.sessionID.trim()
  const result = await requestAgentJSON<AgentSessionTraceExport>(
    `/api/debug/sessions/${encodeURIComponent(sessionID)}/trace-export`,
  )

  return result.data
}

async function saveSessionTraceExport(
  input: SaveSessionTraceExportInput,
  options: SaveSessionTraceExportOptions = {},
) {
  const trace = await getSessionTraceExport(input)
  const sessionID = input.sessionID.trim()
  const safeSessionID = sanitizeSessionTraceFileSegment(sessionID)
  const timestamp = formatSessionTraceTimestamp(options.now ?? new Date())
  const defaultPath = path.join(
    options.downloadsPath ?? app.getPath("downloads"),
    `anybox-trace-${safeSessionID}-${timestamp}.json`,
  )
  const showSaveDialog = options.showSaveDialog ?? ((dialogOptions: SaveDialogOptions) =>
    dialog.showSaveDialog(dialogOptions))
  const selection = await showSaveDialog({
    defaultPath,
    filters: [
      {
        name: "JSON",
        extensions: ["json"],
      },
    ],
    properties: ["createDirectory", "showOverwriteConfirmation"],
    title: "Save session trace JSON",
  })

  if (selection.canceled || !selection.filePath) {
    return { canceled: true }
  }

  const writeTraceFile = options.writeTraceFile ?? ((filePath: string, data: string, encoding: BufferEncoding) =>
    writeFile(filePath, data, encoding))
  await writeTraceFile(selection.filePath, `${JSON.stringify(trace, null, 2)}\n`, "utf8")

  return {
    canceled: false,
    path: selection.filePath,
  }
}

async function saveSessionTraceExportDirectory(
  input: SaveSessionTraceExportDirectoryInput,
  options: SaveSessionTraceExportDirectoryOptions = {},
) {
  const trace = await getSessionTraceExport(input)
  const sessionID = input.sessionID.trim()
  const safeSessionID = sanitizeSessionTraceFileSegment(sessionID)
  const timestamp = formatSessionTraceTimestamp(options.now ?? new Date())
  const folderName = `anybox-trace-${safeSessionID}-${timestamp}`
  const showOpenDialog = options.showOpenDialog ?? ((dialogOptions: OpenDialogOptions) =>
    dialog.showOpenDialog(dialogOptions))
  const selection = await showOpenDialog({
    buttonLabel: "Export Here",
    defaultPath: options.downloadsPath ?? app.getPath("downloads"),
    properties: ["openDirectory", "createDirectory"],
    title: "Select folder for split session trace",
  })

  const selectedDirectory = selection.filePaths?.[0]
  if (selection.canceled || !selectedDirectory) {
    return { canceled: true }
  }

  const targetDirectory = path.join(selectedDirectory, folderName)
  const result = await writeSplitSessionTraceExportDirectory(trace, targetDirectory, options)

  return {
    canceled: false,
    path: targetDirectory,
    fileCount: result.fileCount,
    recordCount: result.recordCount,
  }
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

function abortActiveAgentSessionRequestsInMap(
  activeAgentSessionRequests: Map<string, ActiveAgentSessionRequest>,
  input: {
    backendSessionID: string
    clientTurnID?: string
    webContentsID: number
  },
) {
  const requests: ActiveAgentSessionRequest[] = []
  const clientTurnID = input.clientTurnID?.trim()

  if (clientTurnID) {
    const request = activeAgentSessionRequests.get(agentSessionRequestKey(input.webContentsID, clientTurnID))
    if (request && request.backendSessionID === input.backendSessionID) {
      requests.push(request)
    }
  } else {
    const prefix = `${input.webContentsID}:`
    for (const [key, request] of activeAgentSessionRequests.entries()) {
      if (!key.startsWith(prefix)) continue
      if (request.backendSessionID !== input.backendSessionID) continue
      requests.push(request)
    }
  }

  for (const request of requests) {
    request.cancelRequested = true
    request.controller.abort()
  }

  return requests.length
}

function isAbortError(error: unknown) {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError"
}

export interface IpcHandlerOptions {
  onLocaleChanged?: (locale: AppLocale) => void
  workbenchWindowManager?: WorkbenchWindowManager
}

export function registerIpcHandlers(menus: ApplicationMenus, options: IpcHandlerOptions = {}) {
  const platformAdapter = createPlatformAdapter({
    platform: process.platform,
    openPath: shell.openPath,
  })
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

  function abortActiveAgentSessionRequests(input: {
    backendSessionID: string
    clientTurnID?: string
    webContentsID: number
  }) {
    return abortActiveAgentSessionRequestsInMap(activeAgentSessionRequests, input)
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

  handleDesktopIpc("desktop:get-storage-paths", async () => {
    const appData = app.getPath("userData")
    const agentRoot = resolveManagedAgentDataDir()
    const paths = {
      appData,
      agentRoot,
      agentData: path.join(agentRoot, "data"),
      agentCache: path.join(agentRoot, "cache"),
      installedPlugins: path.join(agentRoot, "data", "plugins", "installed"),
      pluginRegistryCache: path.join(agentRoot, "data", "plugins", "registry-cache"),
      pluginInstallTemp: path.join(agentRoot, "cache", "plugin-installs"),
    }

    await Promise.all(Object.values(paths).map((directory) => mkdir(directory, { recursive: true })))

    return DesktopIpcSchemas.getStoragePaths.output.parse(paths)
  })

  handleDesktopIpc("desktop:get-window-state", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)

    return {
      isMaximized: win ? isWindowMaximized(win) : false,
    }
  })

  handleDesktopIpc("desktop:report-renderer-error", (event, input) => {
    const report = normalizeRendererErrorReport(input)
    const reportWithSender = {
      ...report,
      senderURL: event.sender.getURL(),
      webContentsID: event.sender.id,
    }
    safeError("[desktop][renderer-error]", reportWithSender)
    void appendRendererErrorLog(reportWithSender).catch((error) => {
      safeWarn("[desktop][renderer-error] failed to write renderer error log", error)
    })

    return { ok: true }
  })

  handleDesktopIpc("desktop:report-renderer-memory-diagnostics", (event, input) => {
    const report = normalizeRendererMemoryDiagnostics(input, event)
    rendererMemoryDiagnosticsByWebContentsID.set(event.sender.id, report)
    if (!rendererMemoryDiagnosticsCleanupTargets.has(event.sender.id)) {
      rendererMemoryDiagnosticsCleanupTargets.add(event.sender.id)
      event.sender.once("destroyed", () => {
        rendererMemoryDiagnosticsCleanupTargets.delete(event.sender.id)
        rendererMemoryDiagnosticsByWebContentsID.delete(event.sender.id)
      })
    }

    return { ok: true }
  })

  handleDesktopIpc("desktop:get-renderer-memory-diagnostics", () => ({
    records: [...rendererMemoryDiagnosticsByWebContentsID.values()].sort(
      (left, right) => right.timestamp - left.timestamp,
    ),
  }))

  handleDesktopIpc("desktop:get-workbench-window-context", (event) => {
    if (!options.workbenchWindowManager) {
      throw new Error("Workbench window manager is unavailable.")
    }
    return options.workbenchWindowManager.getWindowContext(event.sender)
  })

  handleDesktopIpc("desktop:workbench-publish-state-snapshot", (_event, input) => {
    if (!options.workbenchWindowManager) {
      throw new Error("Workbench window manager is unavailable.")
    }
    return options.workbenchWindowManager.publishStateSnapshot(input)
  })

  handleDesktopIpc("desktop:workbench-detach-session-panel", (_event, input) => {
    if (!options.workbenchWindowManager) {
      throw new Error("Workbench window manager is unavailable.")
    }
    return options.workbenchWindowManager.detachSessionPanel(input)
  })

  handleDesktopIpc("desktop:workbench-window-ready", (_event, input) => {
    if (!options.workbenchWindowManager) {
      throw new Error("Workbench window manager is unavailable.")
    }
    return options.workbenchWindowManager.markWindowReady(input)
  })

  handleDesktopIpc("desktop:workbench-panel-mounted", (_event, input) => {
    if (!options.workbenchWindowManager) {
      throw new Error("Workbench window manager is unavailable.")
    }
    return options.workbenchWindowManager.markPanelMounted(input)
  })

  handleDesktopIpc("desktop:workbench-dock-session-panel", (_event, input) => {
    if (!options.workbenchWindowManager) {
      throw new Error("Workbench window manager is unavailable.")
    }
    return options.workbenchWindowManager.dockSessionPanel(input)
  })

  handleDesktopIpc("desktop:workbench-move-session-panel", (_event, input) => {
    if (!options.workbenchWindowManager) {
      throw new Error("Workbench window manager is unavailable.")
    }
    return options.workbenchWindowManager.moveSessionPanel(input)
  })

  handleDesktopIpc("desktop:workbench-focus-session-panel", (_event, input) => {
    if (!options.workbenchWindowManager) {
      throw new Error("Workbench window manager is unavailable.")
    }
    return options.workbenchWindowManager.focusSessionPanel(input)
  })

  handleDesktopIpc("desktop:workbench-begin-panel-drag", (_event, input) => {
    if (!options.workbenchWindowManager) {
      throw new Error("Workbench window manager is unavailable.")
    }
    return options.workbenchWindowManager.beginPanelDrag(input)
  })

  handleDesktopIpc("desktop:workbench-end-panel-drag", (_event, input) => {
    if (!options.workbenchWindowManager) {
      throw new Error("Workbench window manager is unavailable.")
    }
    return options.workbenchWindowManager.endPanelDrag(input)
  })

  handleDesktopIpc("desktop:workbench-get-panel-drag", (_event, input) => {
    if (!options.workbenchWindowManager) {
      throw new Error("Workbench window manager is unavailable.")
    }
    return options.workbenchWindowManager.getPanelDrag(input)
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

  handleDesktopIpc("desktop:open-path", async (_event, input: { targetPath: string }) => {
    const parsedInput = DesktopIpcSchemas.openPath.input.parse(input)
    const targetPath = parsedInput.targetPath.trim()
    if (!targetPath) {
      throw new Error("A path is required.")
    }

    await platformAdapter.openPath(targetPath)

    return DesktopIpcSchemas.openPath.output.parse({
      ok: true as const,
      targetPath,
    })
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

  handleDesktopIpc("desktop:save-composer-pasted-images", async (_event, input) => saveComposerPastedImages(input))

  handleDesktopIpc("desktop:capture-preview-screenshot", async (event, input) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) {
      throw new Error("Preview screenshot capture requires an active window.")
    }

    return capturePreviewScreenshotFromWindow(win, input)
  })

  handleDesktopIpc("desktop:detect-local-preview-services", async () => detectLocalPreviewServices())
  handleDesktopIpc("desktop:resolve-preview-target", async (_event, input) => resolvePreviewTarget(input))
  handleDesktopIpc("desktop:read-preview-text", async (_event, input) => readPreviewText(input))

  handleDesktopIpc("desktop:git-get-capabilities", async (_event, input) =>
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

      return cleanupSideChatLinksWithoutResponses(result.data)
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
    const result = await deleteAgentSessionRecord(sessionID)

    return result
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

  handleDesktopIpc("desktop:get-session-diff", async (_event, input: { sessionID: string; scope?: AgentSessionDiffScope }) => {
    const sessionID = input.sessionID.trim()
    const sessionResult = await requestAgentJSON<AgentSessionInfo>(`/api/sessions/${encodeURIComponent(sessionID)}`)
    const requestedScope = input.scope
    const gitScope = requestedScope && GIT_DIFF_SCOPES.has(requestedScope) ? requestedScope as Extract<AgentSessionDiffScope, `git:${string}`> : "git:unstaged"
    const workspaceDiff = await getWorkspaceGitDiff(sessionResult.data.directory, { scope: gitScope }).catch((error) => {
      safeWarn("[desktop] getWorkspaceGitDiff failed:", error)
      return null
    })
    if (workspaceDiff && requestedScope !== "session:last-turn") {
      return {
        ...workspaceDiff,
        availableScopes: appendLastTurnScopeOption(workspaceDiff),
      }
    }

    const result = await requestAgentJSON<AgentSessionDiffSummary>(
      `/api/sessions/${encodeURIComponent(sessionID)}/diff?scope=latest-turn`,
    )
    const lastTurnDiff = workspaceDiff
      ? await withWorkspaceGitFileStates(sessionResult.data.directory, result.data)
      : result.data
    return withLastTurnScope(
      lastTurnDiff,
      workspaceDiff ? appendLastTurnScopeOption(workspaceDiff, lastTurnDiff) : createNonGitScopeOptions(lastTurnDiff),
      workspaceDiff ? "patch" : "none",
    )
  })

  handleDesktopIpc(
    "desktop:restore-workspace-diff-file",
    async (_event, input: { directory: string; file: string }) => restoreWorkspaceDiffFile(input),
  )

  handleDesktopIpc(
    "desktop:stage-workspace-diff-file",
    async (_event, input: { directory: string; file: string }) => stageWorkspaceDiffFile(input),
  )

  handleDesktopIpc(
    "desktop:unstage-workspace-diff-file",
    async (_event, input: { directory: string; file: string }) => unstageWorkspaceDiffFile(input),
  )

  handleDesktopIpc(
    "desktop:reverse-apply-workspace-diff-patches",
    async (_event, input: { directory: string; diffs: Array<{ file: string; patch?: string }> }) =>
      reverseApplyWorkspaceDiffPatches(input),
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

  handleDesktopIpc(
    "desktop:get-session-trace-export",
    async (_event, input: SessionTraceExportInput) => getSessionTraceExport(input),
  )

  handleDesktopIpc(
    "desktop:save-session-trace-export",
    async (_event, input: SaveSessionTraceExportInput) => saveSessionTraceExport(input),
  )

  handleDesktopIpc(
    "desktop:save-session-trace-export-directory",
    async (_event, input: SaveSessionTraceExportDirectoryInput) => saveSessionTraceExportDirectory(input),
  )

  handleDesktopIpc(
    "desktop:update-session-workflow",
    async (_event, input: { sessionID: string } & AgentSessionWorkflowUpdateInput) => {
      const sessionID = input.sessionID.trim()
      const body =
        input.action === "approve-plan"
          ? {
              action: input.action,
              proposedPlanMarkdown: input.proposedPlanMarkdown,
            }
          : {
              action: input.action,
            }
      const result = await requestAgentJSON<AgentSessionInfo>(
        `/api/sessions/${encodeURIComponent(sessionID)}/workflow`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        },
      )

      return {
        session: mapSessionInfo(result.data),
        requestId: result.requestId,
      }
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
    async (
      _event,
      input: {
        providerID: string
        method: string
        baseURL?: string | null
      },
    ) => {
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
            baseURL: input.baseURL,
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

  handleDesktopIpc("desktop:get-plugin-catalog", async (
    _event,
    input?: DesktopIpcInput<"desktop:get-plugin-catalog">,
  ) => {
    const path = input?.freshness === "cached"
      ? "/api/plugins/catalog?freshness=cached"
      : "/api/plugins/catalog"
    const result = await requestAgentJSON<AgentPluginCatalogItem[]>(path)

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

  handleDesktopIpc("desktop:get-connector-catalog", async () => {
    const result = await requestAgentJSON<AgentConnectorDefinition[]>("/api/connectors/catalog")

    return result.data
  })

  handleDesktopIpc("desktop:get-connectors", async () => {
    const result = await requestAgentJSON<AgentConnectorStatus[]>("/api/connectors")

    return result.data
  })

  handleDesktopIpc("desktop:get-connector", async (_event, input: { connectorID: string }) => {
    const connectorID = input.connectorID.trim()
    const result = await requestAgentJSON<AgentConnectorStatus>(
      `/api/connectors/${encodeURIComponent(connectorID)}`,
    )

    return result.data
  })

  handleDesktopIpc(
    "desktop:save-connector-api-key",
    async (_event, input: { connectorID: string; apiKey?: string | null }) => {
      const connectorID = input.connectorID.trim()
      const result = await requestAgentJSON<AgentConnectorStatus>(
        `/api/connectors/${encodeURIComponent(connectorID)}/api-key`,
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

  handleDesktopIpc("desktop:delete-connector-api-key", async (_event, input: { connectorID: string }) => {
    const connectorID = input.connectorID.trim()
    const result = await requestAgentJSON<AgentConnectorStatus>(
      `/api/connectors/${encodeURIComponent(connectorID)}/api-key`,
      {
        method: "DELETE",
      },
    )

    return result.data
  })

  handleDesktopIpc("desktop:get-session-tasks", async (_event, input: { sessionID: string }) => {
    const sessionID = input.sessionID.trim()
    const result = await requestAgentJSON<AgentSessionTaskListView>(
      `/api/sessions/${encodeURIComponent(sessionID)}/tasks`,
    )

    return result.data
  })

  handleDesktopIpc(
    "desktop:save-connector-config",
    async (_event, input: { connectorID: string; config: Record<string, string | null | undefined> }) => {
      const connectorID = input.connectorID.trim()
      const result = await requestAgentJSON<AgentConnectorStatus>(
        `/api/connectors/${encodeURIComponent(connectorID)}/config`,
        {
          method: "PUT",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            config: input.config ?? {},
          }),
        },
      )

      return result.data
    },
  )

  handleDesktopIpc("desktop:delete-connector-config", async (_event, input: { connectorID: string }) => {
    const connectorID = input.connectorID.trim()
    const result = await requestAgentJSON<AgentConnectorStatus>(
      `/api/connectors/${encodeURIComponent(connectorID)}/config`,
      {
        method: "DELETE",
      },
    )

    return result.data
  })

  handleDesktopIpc("desktop:start-connector-auth-flow", async (_event, input: { connectorID: string }) => {
    const connectorID = input.connectorID.trim()
    const result = await requestAgentJSON<AgentProviderAuthFlow>(
      `/api/connectors/${encodeURIComponent(connectorID)}/auth/flows`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      },
    )

    return result.data
  })

  handleDesktopIpc(
    "desktop:get-connector-auth-flow",
    async (_event, input: { connectorID: string; flowID: string }) => {
      const connectorID = input.connectorID.trim()
      const flowID = input.flowID.trim()
      const result = await requestAgentJSON<AgentProviderAuthFlow | undefined>(
        `/api/connectors/${encodeURIComponent(connectorID)}/auth/flows/${encodeURIComponent(flowID)}`,
      )

      return result.data
    },
  )

  handleDesktopIpc(
    "desktop:cancel-connector-auth-flow",
    async (_event, input: { connectorID: string; flowID: string }) => {
      const connectorID = input.connectorID.trim()
      const flowID = input.flowID.trim()
      const result = await requestAgentJSON<AgentProviderAuthFlow | undefined>(
        `/api/connectors/${encodeURIComponent(connectorID)}/auth/flows/${encodeURIComponent(flowID)}`,
        {
          method: "DELETE",
        },
      )

      return result.data
    },
  )

  handleDesktopIpc("desktop:delete-connector-auth-session", async (_event, input: { connectorID: string }) => {
    const connectorID = input.connectorID.trim()
    const result = await requestAgentJSON<AgentConnectorStatus>(
      `/api/connectors/${encodeURIComponent(connectorID)}/auth/session`,
      {
        method: "DELETE",
      },
    )

    return result.data
  })

  handleDesktopIpc("desktop:get-connector-diagnostic", async (_event, input: { connectorID: string }) => {
    const connectorID = input.connectorID.trim()
    const result = await requestAgentJSON<AgentMcpServerDiagnostic>(
      `/api/connectors/${encodeURIComponent(connectorID)}/diagnostic`,
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
    "desktop:start-installed-plugin-connector-auth-flow",
    async (_event, input: { pluginID: string; appID: string }) => {
      const pluginID = input.pluginID.trim()
      const appID = input.appID.trim()
      const result = await requestAgentJSON<AgentProviderAuthFlow>(
        `/api/plugins/installed/${encodeURIComponent(pluginID)}/connectors/${encodeURIComponent(appID)}/auth/flows`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({}),
        },
      )

      return result.data
    },
  )

  handleDesktopIpc(
    "desktop:get-installed-plugin-connector-auth-flow",
    async (_event, input: { pluginID: string; appID: string; flowID: string }) => {
      const pluginID = input.pluginID.trim()
      const appID = input.appID.trim()
      const flowID = input.flowID.trim()
      const result = await requestAgentJSON<AgentProviderAuthFlow | undefined>(
        `/api/plugins/installed/${encodeURIComponent(pluginID)}/connectors/${encodeURIComponent(appID)}/auth/flows/${encodeURIComponent(flowID)}`,
      )

      return result.data
    },
  )

  handleDesktopIpc(
    "desktop:cancel-installed-plugin-connector-auth-flow",
    async (_event, input: { pluginID: string; appID: string; flowID: string }) => {
      const pluginID = input.pluginID.trim()
      const appID = input.appID.trim()
      const flowID = input.flowID.trim()
      const result = await requestAgentJSON<AgentProviderAuthFlow | undefined>(
        `/api/plugins/installed/${encodeURIComponent(pluginID)}/connectors/${encodeURIComponent(appID)}/auth/flows/${encodeURIComponent(flowID)}`,
        {
          method: "DELETE",
        },
      )

      return result.data
    },
  )

  handleDesktopIpc(
    "desktop:delete-installed-plugin-connector-auth-session",
    async (_event, input: { pluginID: string; appID: string }) => {
      const pluginID = input.pluginID.trim()
      const appID = input.appID.trim()
      const result = await requestAgentJSON<AgentPluginConnectorStatus>(
        `/api/plugins/installed/${encodeURIComponent(pluginID)}/connectors/${encodeURIComponent(appID)}/auth/session`,
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
    "desktop:list-workspace-directory",
    async (_event, input: { directory: string; path?: string | null }): Promise<AgentWorkspaceDirectoryEntry[]> =>
      listWorkspaceDirectory(input.directory, input.path),
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

  handleDesktopIpc("desktop:get-project-plugins", async (_event, input: { projectID: string }) => {
    const projectID = input.projectID.trim()
    const result = await requestAgentJSON<AgentInstalledPlugin[]>(
      `/api/projects/${encodeURIComponent(projectID)}/plugins`,
    )

    return result.data
  })

  handleDesktopIpc("desktop:get-project-plugin-selection", async (_event, input: { projectID: string }) => {
    const projectID = input.projectID.trim()
    const result = await requestAgentJSON<AgentProjectPluginSelection>(
      `/api/projects/${encodeURIComponent(projectID)}/plugins/selection`,
    )

    return result.data
  })

  handleDesktopIpc(
    "desktop:update-project-plugin-selection",
    async (_event, input: { projectID: string; pluginIDs: string[] }) => {
      const projectID = input.projectID.trim()
      const result = await requestAgentJSON<AgentProjectPluginSelection>(
        `/api/projects/${encodeURIComponent(projectID)}/plugins/selection`,
        {
          method: "PUT",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            pluginIDs: input.pluginIDs,
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
    async (_event, input: { backendSessionID: string; view?: "active" | "all" }) => {
      const sessionID = input.backendSessionID.trim()
      const search = input.view === "all" ? "?view=all" : ""
      const result = await requestAgentJSON<AgentSessionHistoryMessage[]>(
        `/api/sessions/${encodeURIComponent(sessionID)}/messages${search}`,
      )

      return result.data
    },
  )

  handleDesktopIpc(
    "desktop:update-session-active-message",
    async (_event, input: { sessionID: string; messageID: string }) => {
      const sessionID = input.sessionID.trim()
      const result = await requestAgentJSON<AgentWorkspaceSession>(
        `/api/sessions/${encodeURIComponent(sessionID)}/active-message`,
        {
          method: "PATCH",
          body: JSON.stringify({
            messageID: input.messageID.trim(),
          }),
        },
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
      displayText: input.displayText,
      parentMessageID: input.parentMessageID,
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
    const abortOnTargetDestroyed = () => {
      request.cancelRequested = true
      request.controller.abort()
    }
    target.once("destroyed", abortOnTargetDestroyed)

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
      target.off("destroyed", abortOnTargetDestroyed)
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

  async function interruptAgentSession(
    event: IpcMainInvokeEvent,
    input: { backendSessionID: string; clientTurnID?: string; reason?: "user-interrupt" },
  ): Promise<DesktopIpcOutput<"desktop:agent-session-interrupt">> {
    const backendSessionID = input.backendSessionID.trim()
    const clientTurnID = input.clientTurnID?.trim() || undefined
    const localRequestsAborted = abortActiveAgentSessionRequests({
      backendSessionID,
      clientTurnID,
      webContentsID: event.sender.id,
    })

    try {
      const result = await requestAgentJSON<{
        sessionID: string
        cancelled: boolean
        activeCancelled?: boolean
        queuedCancelled?: number
      }>(
        `/api/sessions/${encodeURIComponent(backendSessionID)}/cancel`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            cancelQueued: true,
            reason: "user",
          }),
        },
      )

      return {
        backendSessionID,
        ...(clientTurnID ? { clientTurnID } : {}),
        localRequestsAborted,
        backendCancelled: result.data.cancelled,
        activeCancelled: result.data.activeCancelled,
        queuedCancelled: result.data.queuedCancelled,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (localRequestsAborted > 0) {
        safeWarn("[desktop] agent session interrupt endpoint failed after local abort:", message)
      }
      return {
        backendSessionID,
        ...(clientTurnID ? { clientTurnID } : {}),
        localRequestsAborted,
        backendCancelled: false,
        backendCancelError: message,
      }
    }
  }

  handleDesktopIpc(
    "desktop:agent-session-interrupt",
    async (event, input: { backendSessionID: string; clientTurnID?: string; reason?: "user-interrupt" }) =>
      interruptAgentSession(event, input),
  )

  handleDesktopIpc(
    "desktop:agent-session-cancel-turn",
    async (event, input: { clientTurnID: string; backendSessionID: string }) => {
      const clientTurnID = input.clientTurnID.trim()
      const backendSessionID = input.backendSessionID.trim()
      const result = await interruptAgentSession(event, {
        backendSessionID,
        clientTurnID,
        reason: "user-interrupt",
      })

      return {
        clientTurnID,
        backendSessionID,
        localRequestAborted: result.localRequestsAborted > 0,
        backendCancelled: result.backendCancelled,
        ...(result.backendCancelError ? { backendCancelError: result.backendCancelError } : {}),
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
  abortActiveAgentSessionRequestsInMap,
  cleanupSideChatLinksWithoutResponses,
  capturePreviewScreenshotFromWindow,
  disposeSessionStreamSubscriptionsForWebContents,
  getSessionTraceExport,
  getToolPermissionMode,
  isSessionStreamSubscriptionKeyForWebContents,
  readPreviewText,
  resolvePreviewTarget,
  saveComposerPastedImages,
  saveSessionTraceExport,
  saveSessionTraceExportDirectory,
  updateToolPermissionMode,
}
