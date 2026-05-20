import { app, Menu, type MenuItemConstructorOptions } from "electron"
import type { AppLocale } from "../shared/locale"
import type { MenuKey } from "./types"

export interface ApplicationMenuOptions {
  onCheckForUpdates?: () => void
}

export interface ApplicationMenus {
  applicationMenu: Menu
  popupMenus: Record<MenuKey, Menu>
}

const menuLabels = {
  "zh-CN": {
    about: "关于 Anybox Desktop",
    checkForUpdates: "检查更新...",
    edit: "编辑",
    file: "文件",
    help: "帮助",
    view: "视图",
    window: "窗口",
  },
  "en-US": {
    about: "About Anybox Desktop",
    checkForUpdates: "Check for Updates...",
    edit: "Edit",
    file: "File",
    help: "Help",
    view: "View",
    window: "Window",
  },
} as const satisfies Record<AppLocale, Record<string, string>>

export function createApplicationMenus(locale: AppLocale, options: ApplicationMenuOptions = {}): ApplicationMenus {
  const isMac = process.platform === "darwin"
  const labels = menuLabels[locale]
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
      label: labels.checkForUpdates,
      click: () => {
        options.onCheckForUpdates?.()
      },
    },
    { type: "separator" },
    {
      label: labels.about,
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
    { label: labels.file, submenu: fileMenu },
    { label: labels.edit, submenu: editMenu },
    { label: labels.view, submenu: viewMenu },
    { label: labels.window, submenu: windowMenu },
    { label: labels.help, submenu: helpMenu },
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
