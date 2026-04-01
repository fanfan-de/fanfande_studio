import { app, Menu, type MenuItemConstructorOptions } from "electron"
import type { MenuKey } from "./types"

export interface ApplicationMenus {
  applicationMenu: Menu
  popupMenus: Record<MenuKey, Menu>
}

export function createApplicationMenus(): ApplicationMenus {
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
