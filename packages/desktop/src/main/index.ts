import { app, BrowserWindow, Menu, protocol, session } from "electron"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { registerIpcHandlers } from "./ipc"
import { registerBrowserNativeMessagingHost } from "./browser-native-messaging"
import { registerLocalImageProtocolHandler, registerLocalImageProtocolScheme } from "./local-image-protocol"
import { registerLocalPreviewProtocolHandler, registerLocalPreviewProtocolScheme } from "./preview-targets"
import { readLocaleConfigSnapshot } from "./locale-config"
import { ensureManagedAgentRunning, stopManagedAgent } from "./managed-agent"
import { createApplicationMenus, type ApplicationMenuOptions } from "./menu"
import { ensureMobileBridgeServerRunning, stopMobileBridgeServer } from "./mobile-bridge-server"
import { stopRendererHttpServer } from "./renderer-http-server"
import { safeError } from "./safe-console"
import { checkForAppUpdates, initializeAutoUpdater } from "./updater"
import {
  createWindow,
  installDockIcon,
  installNativeMacWindowControls,
  resolvePopoutWindowOptions,
  resolveRendererEntryUrl,
} from "./window"
import { WorkbenchWindowManager } from "./workbench-window-manager"

const mainDir = path.dirname(fileURLToPath(import.meta.url))
const PREVIEW_WEBVIEW_PARTITION = "persist:preview"

registerLocalImageProtocolScheme(protocol)
registerLocalPreviewProtocolScheme(protocol)

void app.whenReady().then(async () => {
  installDockIcon(mainDir)

  try {
    await ensureManagedAgentRunning()
  } catch (error) {
    safeError("[desktop] failed to start managed agent", error)
  }
  await registerBrowserNativeMessagingHost().catch((error) => {
    safeError("[desktop] failed to register browser native messaging host", error)
  })
  await ensureMobileBridgeServerRunning().catch((error) => {
    safeError("[desktop] failed to start mobile bridge", error)
  })

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
    configureWindow: installNativeMacWindowControls,
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
  registerLocalPreviewProtocolHandler(protocol)
  registerLocalPreviewProtocolHandler(session.fromPartition(PREVIEW_WEBVIEW_PARTITION).protocol)

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
  void stopMobileBridgeServer()
  void stopRendererHttpServer()
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
