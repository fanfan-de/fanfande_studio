import { BrowserWindow, app } from "electron"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const DEFAULT_MONITOR_DEV_URL = "http://127.0.0.1:4174/"
const MONITOR_DEV_SERVER_TIMEOUT_MS = 500

type MonitorWindowTarget =
  | {
      source: "dev-server"
      url: string
    }
  | {
      filePath: string
      source: "file"
    }

let monitorWindow: BrowserWindow | null = null

function normalizeMonitorURL(value: string) {
  const trimmed = value.trim()
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`
}

async function isMonitorDevServerAvailable(url: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), MONITOR_DEV_SERVER_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

function resolveMonitorIndexPath() {
  const mainDir = path.dirname(fileURLToPath(import.meta.url))
  const appPath = app.getAppPath()
  const resourcePath = process.resourcesPath
  const candidates = [
    path.join(resourcePath, "monitor", "index.html"),
    path.join(process.cwd(), "../monitor/dist/index.html"),
    path.join(process.cwd(), "packages/monitor/dist/index.html"),
    path.join(appPath, "../monitor/dist/index.html"),
    path.join(appPath, "packages/monitor/dist/index.html"),
    path.join(mainDir, "../../../monitor/dist/index.html"),
    path.join(mainDir, "../../../../monitor/dist/index.html"),
  ]

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null
}

async function resolveMonitorWindowTarget(): Promise<MonitorWindowTarget> {
  const devServerURL = normalizeMonitorURL(process.env.FANFANDE_MONITOR_URL ?? DEFAULT_MONITOR_DEV_URL)

  if (!app.isPackaged && await isMonitorDevServerAvailable(devServerURL)) {
    return {
      source: "dev-server",
      url: devServerURL,
    }
  }

  const filePath = resolveMonitorIndexPath()
  if (filePath) {
    return {
      filePath,
      source: "file",
    }
  }

  if (await isMonitorDevServerAvailable(devServerURL)) {
    return {
      source: "dev-server",
      url: devServerURL,
    }
  }

  throw new Error("Monitor UI was not found. Build packages/monitor or start the monitor dev server.")
}

export async function openMonitorWindow() {
  if (monitorWindow && !monitorWindow.isDestroyed()) {
    if (monitorWindow.isMinimized()) monitorWindow.restore()
    monitorWindow.show()
    monitorWindow.focus()

    return {
      ok: true as const,
      reused: true,
      source: "existing" as const,
    }
  }

  const target = await resolveMonitorWindowTarget()
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "Fanfande Monitor",
    autoHideMenuBar: true,
    backgroundColor: "#f8fafc",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  monitorWindow = win
  win.on("closed", () => {
    if (monitorWindow === win) {
      monitorWindow = null
    }
  })
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  win.once("ready-to-show", () => {
    if (!win.isDestroyed()) {
      win.show()
    }
  })

  try {
    if (target.source === "dev-server") {
      await win.loadURL(target.url)
      return {
        ok: true as const,
        reused: false,
        source: target.source,
        url: target.url,
      }
    }

    await win.loadFile(target.filePath)
    return {
      filePath: target.filePath,
      ok: true as const,
      reused: false,
      source: target.source,
    }
  } catch (error) {
    if (monitorWindow === win) {
      monitorWindow = null
    }
    if (!win.isDestroyed()) {
      win.destroy()
    }
    throw error
  }
}
