import { BrowserWindow, app } from "electron"
import fs from "node:fs"
import path from "node:path"
import { ensureRendererHttpServer } from "./renderer-http-server"
import { safeError } from "./safe-console"
import { clearManualMaximize, sendWindowState } from "./window-state"
import type { WorkbenchWindowManager } from "./workbench-window-manager"

export function resolvePreloadPath(mainDir: string) {
  const rootDir = app.getAppPath()
  const candidatePaths = [
    path.join(mainDir, "../preload/index.mjs"),
    path.join(mainDir, "../preload/index.js"),
    path.join(rootDir, "out/preload/index.mjs"),
    path.join(rootDir, "out/preload/index.js"),
    path.join(rootDir, "dist-electron/preload/index.mjs"),
    path.join(rootDir, "dist-electron/preload/index.js"),
    path.join(rootDir, ".electron-vite/preload/index.mjs"),
    path.join(rootDir, ".electron-vite/preload/index.js"),
    path.join(process.cwd(), "out/preload/index.mjs"),
    path.join(process.cwd(), "out/preload/index.js"),
  ]

  const resolved = candidatePaths.find((candidate) => fs.existsSync(candidate))
  if (resolved) return resolved

  // Keep Electron startup resilient and surface enough detail for diagnosis.
  safeError("[desktop] preload not found, fallback:", candidatePaths[0], "candidates:", candidatePaths)
  return candidatePaths[0]
}

export function resolveWindowIconPath(mainDir: string) {
  const rootDir = app.getAppPath()
  const iconFileName = process.platform === "win32" ? "icon.ico" : "icon.png"
  const candidatePaths = [
    path.join(process.cwd(), "build", iconFileName),
    path.join(rootDir, "build", iconFileName),
    path.join(mainDir, "../../build", iconFileName),
    path.join(mainDir, "../build", iconFileName),
  ]

  return candidatePaths.find((candidate) => fs.existsSync(candidate))
}

export function resolvePopoutWindowOptions(mainDir: string) {
  return {
    width: 1120,
    height: 760,
    minWidth: 720,
    minHeight: 520,
    frame: false,
    roundedCorners: false,
    autoHideMenuBar: true,
    backgroundColor: "#eff3f7",
    icon: resolveWindowIconPath(mainDir),
    webPreferences: {
      preload: resolvePreloadPath(mainDir),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
    },
  }
}

export async function resolveRendererEntryUrl(mainDir: string) {
  if (process.env.ELECTRON_RENDERER_URL) {
    return process.env.ELECTRON_RENDERER_URL
  }

  const rendererBaseUrl = await ensureRendererHttpServer(mainDir)
  return `${rendererBaseUrl}/index.html`
}

export async function createWindow(mainDir: string, options: { workbenchWindowManager?: WorkbenchWindowManager } = {}) {
  const rendererEntryUrl = await resolveRendererEntryUrl(mainDir)
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1120,
    minHeight: 760,
    frame: false,
    roundedCorners: false,
    autoHideMenuBar: true,
    backgroundColor: "#eff3f7",
    icon: resolveWindowIconPath(mainDir),
    show: false,
    webPreferences: {
      preload: resolvePreloadPath(mainDir),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
    },
  })
  options.workbenchWindowManager?.registerMainWindow(win)

  win.once("ready-to-show", () => {
    sendWindowState(win)
    win.show()
  })

  win.on("maximize", () => {
    clearManualMaximize(win)
    sendWindowState(win)
  })
  win.on("unmaximize", () => {
    clearManualMaximize(win)
    sendWindowState(win)
  })
  win.on("enter-full-screen", () => {
    clearManualMaximize(win)
    sendWindowState(win)
  })
  win.on("leave-full-screen", () => {
    sendWindowState(win)
  })

  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }))

  void win.loadURL(rendererEntryUrl)

  return win
}
