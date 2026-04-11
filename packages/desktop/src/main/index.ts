import { app, BrowserWindow, Menu } from "electron"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { registerIpcHandlers } from "./ipc"
import { ensureManagedAgentRunning, stopManagedAgent } from "./managed-agent"
import { createApplicationMenus } from "./menu"
import { createWindow } from "./window"

const mainDir = path.dirname(fileURLToPath(import.meta.url))

void app.whenReady().then(async () => {
  try {
    await ensureManagedAgentRunning()
  } catch (error) {
    console.error("[desktop] failed to start managed agent", error)
  }

  const menus = createApplicationMenus()
  Menu.setApplicationMenu(menus.applicationMenu)
  registerIpcHandlers(menus)

  createWindow(mainDir)

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(mainDir)
  })
})

app.on("before-quit", () => {
  void stopManagedAgent()
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
