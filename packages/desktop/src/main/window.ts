import { BrowserWindow, app } from "electron"
import fs from "node:fs"
import path from "node:path"
import { clearManualMaximize, sendWindowState } from "./window-state"

function resolvePreloadPath(mainDir: string) {
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
  console.error("[desktop] preload not found, fallback:", candidatePaths[0], "candidates:", candidatePaths)
  return candidatePaths[0]
}

export function createWindow(mainDir: string) {
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1120,
    minHeight: 760,
    frame: false,
    roundedCorners: false,
    autoHideMenuBar: true,
    backgroundColor: "#eff3f7",
    show: false,
    webPreferences: {
      preload: resolvePreloadPath(mainDir),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

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

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(path.join(mainDir, "../renderer/index.html"))
  }

  return win
}
