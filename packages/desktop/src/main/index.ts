import { app, BrowserWindow, ipcMain, Menu, screen, type MenuItemConstructorOptions, type Rectangle } from "electron"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WINDOW_STATE_CHANNEL = "desktop:window-state-changed"

type MenuKey = "file" | "edit" | "view" | "window" | "help"
type WindowAction = "minimize" | "toggle-maximize" | "close"

const manualMaximizedBounds = new WeakMap<BrowserWindow, Rectangle>()
const manualMaximizedWindows = new WeakSet<BrowserWindow>()

function clearManualMaximize(win: BrowserWindow) {
  manualMaximizedBounds.delete(win)
  manualMaximizedWindows.delete(win)
}

function isWindowMaximized(win: BrowserWindow) {
  return win.isMaximized() || manualMaximizedWindows.has(win)
}

function sendWindowState(win: BrowserWindow) {
  win.webContents.send(WINDOW_STATE_CHANNEL, {
    isMaximized: isWindowMaximized(win),
  })
}

function maximizeFramelessWindow(win: BrowserWindow) {
  const currentBounds = win.getBounds()
  const workArea = screen.getDisplayMatching(currentBounds).workArea

  manualMaximizedBounds.set(win, currentBounds)
  manualMaximizedWindows.add(win)
  win.setBounds(workArea)
}

function restoreFramelessWindow(win: BrowserWindow) {
  const restoreBounds = manualMaximizedBounds.get(win)

  clearManualMaximize(win)

  if (restoreBounds) {
    win.setBounds(restoreBounds)
    return
  }

  win.unmaximize()
}

function createApplicationMenus() {
  const isMac = process.platform === "darwin"
  const appMenu: MenuItemConstructorOptions[] = [
    { role: "about" },
    { type: "separator" },
    { role: "services" },
    { type: "separator" },
    { role: "hide" },
    { role: "hideOthers" },
    { role: "unhide" },
    { type: "separator" },
    { role: "quit" },
  ]
  const fileMenu: MenuItemConstructorOptions[] = [isMac ? { role: "close" } : { role: "quit" }]
  const editMenu: MenuItemConstructorOptions[] = [
    { role: "undo" },
    { role: "redo" },
    { type: "separator" },
    { role: "cut" },
    { role: "copy" },
    { role: "paste" },
    ...(isMac ? ([{ role: "pasteAndMatchStyle" }, { role: "delete" }, { role: "selectAll" }] as const) : []),
  ]
  const viewMenu: MenuItemConstructorOptions[] = [
    { role: "reload" },
    { role: "forceReload" },
    { role: "toggleDevTools" },
    { type: "separator" },
    { role: "resetZoom" },
    { role: "zoomIn" },
    { role: "zoomOut" },
    { type: "separator" },
    { role: "togglefullscreen" },
  ]
  const windowMenu: MenuItemConstructorOptions[] = isMac
    ? [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }]
    : [{ role: "minimize" }, { role: "close" }]
  const helpMenu: MenuItemConstructorOptions[] = [
    {
      label: "About Fanfande Desktop",
      click: () => {
        void app.showAboutPanel()
      },
    },
  ]

  const applicationTemplate: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: appMenu,
          } satisfies MenuItemConstructorOptions,
        ]
      : []),
    { label: "File", submenu: fileMenu },
    { label: "Edit", submenu: editMenu },
    { label: "View", submenu: viewMenu },
    { label: "Window", submenu: windowMenu },
    { label: "Help", submenu: helpMenu },
  ]

  return {
    applicationMenu: Menu.buildFromTemplate(applicationTemplate),
    popupMenus: {
      file: Menu.buildFromTemplate(fileMenu),
      edit: Menu.buildFromTemplate(editMenu),
      view: Menu.buildFromTemplate(viewMenu),
      window: Menu.buildFromTemplate(windowMenu),
      help: Menu.buildFromTemplate(helpMenu),
    } satisfies Record<MenuKey, Menu>,
  }
}

function createWindow() {
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
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
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
    void win.loadFile(path.join(__dirname, "../renderer/index.html"))
  }

  return win
}

app.whenReady().then(() => {
  const menus = createApplicationMenus()
  Menu.setApplicationMenu(menus.applicationMenu)

  ipcMain.handle("desktop:get-info", () => ({
    platform: process.platform,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  }))
  ipcMain.handle("desktop:get-window-state", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)

    return {
      isMaximized: win ? isWindowMaximized(win) : false,
    }
  })
  ipcMain.handle("desktop:window-action", (event, action: WindowAction) => {
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
  ipcMain.handle("desktop:show-menu", (event, menuKey: MenuKey) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return

    menus.popupMenus[menuKey]?.popup({ window: win })
  })

  createWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
