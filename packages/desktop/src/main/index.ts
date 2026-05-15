import { app, BrowserWindow, Menu, protocol } from "electron"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { registerIpcHandlers } from "./ipc"
import { registerLocalImageProtocolHandler, registerLocalImageProtocolScheme } from "./local-image-protocol"
import { readLocaleConfigSnapshot } from "./locale-config"
import { ensureManagedAgentRunning, stopManagedAgent } from "./managed-agent"
import { createApplicationMenus, type ApplicationMenuOptions } from "./menu"
import { stopRendererHttpServer } from "./renderer-http-server"
import { safeError } from "./safe-console"
import { checkForAppUpdates, initializeAutoUpdater } from "./updater"
import { createWindow, resolvePopoutWindowOptions, resolveRendererEntryUrl } from "./window"
import { WorkbenchWindowManager } from "./workbench-window-manager"

const mainDir = path.dirname(fileURLToPath(import.meta.url))

registerLocalImageProtocolScheme(protocol)

void app.whenReady().then(async () => {
  try {
    await ensureManagedAgentRunning()
  } catch (error) {
    safeError("[desktop] failed to start managed agent", error)
  }

  const menuOptions: ApplicationMenuOptions = {
    onCheckForUpdates: () => {
      void checkForAppUpdates({ manual: true })
    },
  }
  const localeSnapshot = await readLocaleConfigSnapshot().catch((error) => {
    safeError("[desktop] failed to read locale settings", error)
    return null
  })
  const menus = createApplicationMenus(localeSnapshot?.document.locale ?? "zh-CN", menuOptions)
  Menu.setApplicationMenu(menus.applicationMenu)
  const rendererEntryUrl = await resolveRendererEntryUrl(mainDir)
  const workbenchWindowManager = new WorkbenchWindowManager({
    rendererEntryUrl,
    createPopoutWindowOptions: () => resolvePopoutWindowOptions(mainDir),
  })
  registerIpcHandlers(menus, {
    onLocaleChanged: (locale) => {
      const nextMenus = createApplicationMenus(locale, menuOptions)
      menus.applicationMenu = nextMenus.applicationMenu
      menus.popupMenus = nextMenus.popupMenus
      Menu.setApplicationMenu(menus.applicationMenu)
    },
    workbenchWindowManager,
  })
  registerLocalImageProtocolHandler(protocol)

  try {
    await createWindow(mainDir, { workbenchWindowManager })
  } catch (error) {
    safeError("[desktop] failed to create window", error)
  }
  initializeAutoUpdater()
  setTimeout(() => {
    void checkForAppUpdates()
  }, 3000)

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow(mainDir, { workbenchWindowManager }).catch((error) => {
        safeError("[desktop] failed to create window", error)
      })
    }
  })
})

app.on("before-quit", () => {
  void stopManagedAgent()
  void stopRendererHttpServer()
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
