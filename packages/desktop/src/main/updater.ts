import { app, BrowserWindow, dialog } from "electron"
import * as electronUpdater from "electron-updater"
import type { AppUpdater } from "electron-updater"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { readTrimmedDesktopEnv } from "./env-compat"
import { safeError, safeLog, safeWarn } from "./safe-console"

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

export async function setAutomaticAppUpdatesEnabled(enabled: boolean): Promise<AppUpdateSettingsSnapshot> {
  await writeAppUpdateSettingsDocument({
    automaticUpdates: enabled,
  })
  return getAppUpdateSettingsSnapshot()
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

function consumeManualCheck() {
  const wasManual = manualCheckActive
  manualCheckActive = false
  return wasManual
}

function handleUpdaterError(error: Error) {
  checking = false
  lastLoggedProgressBucket = -1
  safeError("[desktop][updater] update check failed", error)

  if (consumeManualCheck()) {
    void showMessageBox({
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
    safeLog("[desktop][updater] checking for updates")
  })

  autoUpdater.on("update-available", (info) => {
    safeLog("[desktop][updater] update available", describeVersion(info))
  })

  autoUpdater.on("update-not-available", (info) => {
    checking = false
    lastLoggedProgressBucket = -1
    safeLog("[desktop][updater] no update available", describeVersion(info))

    if (consumeManualCheck()) {
      void showMessageBox({
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
    safeLog("[desktop][updater] download progress", `${Math.round(percent)}%`)
  })

  autoUpdater.on("update-downloaded", (info) => {
    checking = false
    lastLoggedProgressBucket = -1
    consumeManualCheck()
    safeLog("[desktop][updater] update downloaded", describeVersion(info))

    void showMessageBox({
      type: "info",
      title: "Update Ready",
      message: `Anybox ${describeVersion(info)} is ready to install.`,
      detail: "Restart the app now to apply the update.",
      buttons: ["Restart Now", "Later"],
      defaultId: 0,
      cancelId: 1,
    }).then((result) => {
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
      } satisfies AppUpdateCheckResult
    }
  }

  if (!isUpdateCheckEnabled()) {
    safeWarn("[desktop][updater] skipped update check because app is not packaged")
    if (options.manual) {
      await showMessageBox({
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
    } satisfies AppUpdateCheckResult
  }

  if (checking) {
    if (options.manual) {
      await showMessageBox({
        type: "info",
        title: "Update Check In Progress",
        message: "Anybox is already checking for updates.",
      })
    }
    return {
      ok: true,
      skipped: true,
      reason: "already-checking",
    } satisfies AppUpdateCheckResult
  }

  manualCheckActive = options.manual === true

  try {
    await autoUpdater.checkForUpdates()
    return {
      ok: true,
    } satisfies AppUpdateCheckResult
  } catch (error) {
    const updateError = error instanceof Error ? error : new Error(String(error))
    handleUpdaterError(updateError)
    return {
      ok: false,
      error: updateError.message,
    } satisfies AppUpdateCheckResult
  }
}
