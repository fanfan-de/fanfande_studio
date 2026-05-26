import { app, BrowserWindow, dialog } from "electron"
import * as electronUpdater from "electron-updater"
import type { AppUpdater } from "electron-updater"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { readTrimmedDesktopEnv } from "./env-compat"
import { safeError, safeLog, safeWarn } from "./safe-console"
import type {
  DesktopAppUpdatePhase,
  DesktopAppUpdateState,
  DesktopAppUpdateInstallResult,
} from "../shared/desktop-ipc-contract"

type CheckOptions = {
  manual?: boolean
}

type AppUpdateSettingsDocument = {
  automaticUpdates: boolean
}

export interface AppUpdateSettingsSnapshot {
  version: string
  automaticUpdates: boolean
  updateChecksSupported: boolean
}

export interface AppUpdateCheckResult {
  ok: boolean
  skipped?: boolean
  reason?: string
  error?: string
  state?: DesktopAppUpdateState
}

type AppUpdateRuntimeState = {
  phase: DesktopAppUpdatePhase
  latestVersion: string | null
  downloadPercent: number | null
  error: string | null
  lastCheckedAt: number | null
  releaseNotes: string | null
}

type AppUpdateInfo = {
  version?: string
  releaseNotes?: unknown
}

const APP_UPDATE_SETTINGS_FILE_NAME = "app-update-settings.json"
const DEFAULT_APP_UPDATE_SETTINGS: AppUpdateSettingsDocument = {
  automaticUpdates: true,
}

const electronUpdaterModule = electronUpdater as unknown as {
  autoUpdater?: AppUpdater
  default?: {
    autoUpdater?: AppUpdater
  }
}

function resolveAutoUpdater(): AppUpdater {
  const updater = electronUpdaterModule.autoUpdater ?? electronUpdaterModule.default?.autoUpdater
  if (!updater) {
    throw new Error("electron-updater did not expose autoUpdater")
  }
  return updater
}

const autoUpdater = resolveAutoUpdater()

let initialized = false
let checking = false
let manualCheckActive = false
let lastLoggedProgressBucket = -1
let appUpdateRuntimeState: AppUpdateRuntimeState = createInitialAppUpdateRuntimeState()
const appUpdateStateListeners = new Set<(state: DesktopAppUpdateState) => void>()

function createInitialAppUpdateRuntimeState(): AppUpdateRuntimeState {
  return {
    phase: "idle",
    latestVersion: null,
    downloadPercent: null,
    error: null,
    lastCheckedAt: null,
    releaseNotes: null,
  }
}

function isUpdateCheckEnabled() {
  return app.isPackaged || isForcedDevUpdateCheck()
}

function isForcedDevUpdateCheck() {
  return readTrimmedDesktopEnv("ANYBOX_FORCE_UPDATE_CHECK") === "1"
}

function getAppUpdateSettingsPath() {
  return path.join(app.getPath("userData"), APP_UPDATE_SETTINGS_FILE_NAME)
}

function normalizeAppUpdateSettings(document: Partial<AppUpdateSettingsDocument> | null | undefined) {
  return {
    automaticUpdates:
      typeof document?.automaticUpdates === "boolean"
        ? document.automaticUpdates
        : DEFAULT_APP_UPDATE_SETTINGS.automaticUpdates,
  }
}

async function readAppUpdateSettingsDocument(): Promise<AppUpdateSettingsDocument> {
  try {
    const raw = await readFile(getAppUpdateSettingsPath(), "utf8")
    return normalizeAppUpdateSettings(JSON.parse(raw) as Partial<AppUpdateSettingsDocument>)
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError.code !== "ENOENT") {
      safeWarn("[desktop][updater] failed to read update settings", nodeError.message)
    }
    return DEFAULT_APP_UPDATE_SETTINGS
  }
}

async function writeAppUpdateSettingsDocument(document: AppUpdateSettingsDocument) {
  const filePath = getAppUpdateSettingsPath()
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(normalizeAppUpdateSettings(document), null, 2)}\n`, "utf8")
}

export async function getAppUpdateSettingsSnapshot(): Promise<AppUpdateSettingsSnapshot> {
  const settings = await readAppUpdateSettingsDocument()
  return {
    version: app.getVersion(),
    automaticUpdates: settings.automaticUpdates,
    updateChecksSupported: isUpdateCheckEnabled(),
  }
}

export async function getAppUpdateStateSnapshot(): Promise<DesktopAppUpdateState> {
  const settings = await getAppUpdateSettingsSnapshot()
  return {
    ...settings,
    ...appUpdateRuntimeState,
  }
}

async function emitAppUpdateStateChanged() {
  const snapshot = await getAppUpdateStateSnapshot()
  for (const listener of appUpdateStateListeners) {
    listener(snapshot)
  }
}

function setAppUpdateRuntimeState(update: Partial<AppUpdateRuntimeState>) {
  appUpdateRuntimeState = {
    ...appUpdateRuntimeState,
    ...update,
  }
  void emitAppUpdateStateChanged()
}

export function onAppUpdateStateChanged(listener: (state: DesktopAppUpdateState) => void) {
  appUpdateStateListeners.add(listener)
  return () => {
    appUpdateStateListeners.delete(listener)
  }
}

export async function setAutomaticAppUpdatesEnabled(enabled: boolean): Promise<AppUpdateSettingsSnapshot> {
  await writeAppUpdateSettingsDocument({
    automaticUpdates: enabled,
  })
  const snapshot = await getAppUpdateSettingsSnapshot()
  await emitAppUpdateStateChanged()
  return snapshot
}

function getDialogWindow() {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

function showMessageBox(options: Electron.MessageBoxOptions) {
  const window = getDialogWindow()
  return window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options)
}

function describeVersion(info: { version?: string } | null | undefined) {
  return info?.version ? `v${info.version}` : "the latest version"
}

function normalizeReleaseNotes(releaseNotes: unknown) {
  if (typeof releaseNotes === "string") {
    const notes = releaseNotes.trim()
    return notes || null
  }

  if (!Array.isArray(releaseNotes)) return null

  const notes = releaseNotes
    .map((item) => {
      if (typeof item === "string") return item
      if (typeof item !== "object" || item === null) return null
      const partial = item as { note?: unknown; version?: unknown }
      const note = typeof partial.note === "string" ? partial.note.trim() : ""
      const version = typeof partial.version === "string" ? partial.version.trim() : ""
      if (version && note) return `${version}\n${note}`
      return note || version || null
    })
    .filter((item): item is string => Boolean(item))

  return notes.length > 0 ? notes.join("\n\n") : null
}

function hasRendererWindow() {
  return BrowserWindow.getAllWindows().some((window) => !window.isDestroyed())
}

function showFallbackMessageBox(options: Electron.MessageBoxOptions) {
  if (hasRendererWindow()) return null
  return showMessageBox(options)
}

function consumeManualCheck() {
  const wasManual = manualCheckActive
  manualCheckActive = false
  return wasManual
}

function handleUpdaterError(error: Error) {
  checking = false
  lastLoggedProgressBucket = -1
  setAppUpdateRuntimeState({
    phase: "error",
    downloadPercent: null,
    error: error.message,
    lastCheckedAt: Date.now(),
  })
  safeError("[desktop][updater] update check failed", error)

  if (consumeManualCheck()) {
    showFallbackMessageBox({
      type: "error",
      title: "Update Check Failed",
      message: "Unable to check for updates.",
      detail: error.message,
    })
  }
}

function registerUpdaterEvents() {
  autoUpdater.on("checking-for-update", () => {
    checking = true
    lastLoggedProgressBucket = -1
    setAppUpdateRuntimeState({
      phase: "checking",
      downloadPercent: null,
      error: null,
      lastCheckedAt: Date.now(),
    })
    safeLog("[desktop][updater] checking for updates")
  })

  autoUpdater.on("update-available", (info: AppUpdateInfo) => {
    setAppUpdateRuntimeState({
      phase: "available",
      latestVersion: info.version ?? null,
      downloadPercent: null,
      error: null,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes),
    })
    safeLog("[desktop][updater] update available", describeVersion(info))
  })

  autoUpdater.on("update-not-available", (info: AppUpdateInfo) => {
    checking = false
    lastLoggedProgressBucket = -1
    setAppUpdateRuntimeState({
      phase: "up-to-date",
      latestVersion: info.version ?? app.getVersion(),
      downloadPercent: null,
      error: null,
      lastCheckedAt: Date.now(),
      releaseNotes: normalizeReleaseNotes(info.releaseNotes),
    })
    safeLog("[desktop][updater] no update available", describeVersion(info))

    if (consumeManualCheck()) {
      showFallbackMessageBox({
        type: "info",
        title: "No Updates Available",
        message: "Anybox is up to date.",
      })
    }
  })

  autoUpdater.on("download-progress", (progress) => {
    const percent = Number.isFinite(progress.percent) ? progress.percent : 0
    const bucket = Math.floor(percent / 10) * 10
    if (bucket === lastLoggedProgressBucket) return

    lastLoggedProgressBucket = bucket
    setAppUpdateRuntimeState({
      phase: "downloading",
      downloadPercent: Math.max(0, Math.min(100, percent)),
      error: null,
    })
    safeLog("[desktop][updater] download progress", `${Math.round(percent)}%`)
  })

  autoUpdater.on("update-downloaded", (info: AppUpdateInfo) => {
    checking = false
    lastLoggedProgressBucket = -1
    consumeManualCheck()
    setAppUpdateRuntimeState({
      phase: "downloaded",
      latestVersion: info.version ?? appUpdateRuntimeState.latestVersion,
      downloadPercent: 100,
      error: null,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes) ?? appUpdateRuntimeState.releaseNotes,
    })
    safeLog("[desktop][updater] update downloaded", describeVersion(info))

    showFallbackMessageBox({
      type: "info",
      title: "Update Ready",
      message: `Anybox ${describeVersion(info)} is ready to install.`,
      detail: "Restart the app now to apply the update.",
      buttons: ["Restart Now", "Later"],
      defaultId: 0,
      cancelId: 1,
    })?.then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall(false, true)
      }
    })
  })

  autoUpdater.on("error", handleUpdaterError)
}

export function initializeAutoUpdater() {
  if (initialized) return
  initialized = true

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.forceDevUpdateConfig = !app.isPackaged && isForcedDevUpdateCheck()
  registerUpdaterEvents()
}

export async function checkForAppUpdates(options: CheckOptions = {}) {
  initializeAutoUpdater()

  if (!options.manual) {
    const settings = await readAppUpdateSettingsDocument()
    if (!settings.automaticUpdates) {
      safeLog("[desktop][updater] skipped automatic update check because automatic updates are disabled")
      return {
        ok: true,
        skipped: true,
        reason: "automatic-updates-disabled",
        state: await getAppUpdateStateSnapshot(),
      } satisfies AppUpdateCheckResult
    }
  }

  if (!isUpdateCheckEnabled()) {
    safeWarn("[desktop][updater] skipped update check because app is not packaged")
    setAppUpdateRuntimeState({
      phase: "unsupported",
      downloadPercent: null,
      error: "Update checks run in packaged builds.",
      lastCheckedAt: Date.now(),
    })
    if (options.manual) {
      showFallbackMessageBox({
        type: "info",
        title: "Updates Unavailable",
        message: "Update checks run in packaged builds.",
        detail: "Build and install the app, or set ANYBOX_FORCE_UPDATE_CHECK=1 with dev-app-update.yml for local updater testing.",
      })
    }
    return {
      ok: true,
      skipped: true,
      reason: "not-packaged",
      state: await getAppUpdateStateSnapshot(),
    } satisfies AppUpdateCheckResult
  }

  if (checking) {
    if (options.manual) {
      showFallbackMessageBox({
        type: "info",
        title: "Update Check In Progress",
        message: "Anybox is already checking for updates.",
      })
    }
    return {
      ok: true,
      skipped: true,
      reason: "already-checking",
      state: await getAppUpdateStateSnapshot(),
    } satisfies AppUpdateCheckResult
  }

  manualCheckActive = options.manual === true
  checking = true
  setAppUpdateRuntimeState({
    phase: "checking",
    downloadPercent: null,
    error: null,
    lastCheckedAt: Date.now(),
  })

  try {
    await autoUpdater.checkForUpdates()
    return {
      ok: true,
      state: await getAppUpdateStateSnapshot(),
    } satisfies AppUpdateCheckResult
  } catch (error) {
    const updateError = error instanceof Error ? error : new Error(String(error))
    handleUpdaterError(updateError)
    return {
      ok: false,
      error: updateError.message,
      state: await getAppUpdateStateSnapshot(),
    } satisfies AppUpdateCheckResult
  }
}

export function installDownloadedAppUpdate(): DesktopAppUpdateInstallResult {
  if (appUpdateRuntimeState.phase !== "downloaded") {
    return {
      ok: false,
      reason: "update-not-downloaded",
    }
  }

  autoUpdater.quitAndInstall(false, true)
  return { ok: true }
}

export const internal = {
  resetAppUpdateRuntimeStateForTests() {
    initialized = false
    checking = false
    manualCheckActive = false
    lastLoggedProgressBucket = -1
    appUpdateRuntimeState = createInitialAppUpdateRuntimeState()
    appUpdateStateListeners.clear()
  },
}
