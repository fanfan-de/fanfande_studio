import { contextBridge, ipcRenderer } from "electron"

type MenuKey = "file" | "edit" | "view" | "window" | "help"
type WindowAction = "minimize" | "toggle-maximize" | "close"

contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  versions: process.versions,
  getInfo: () =>
    ipcRenderer.invoke("desktop:get-info") as Promise<{
      platform: string
      electron: string
      chrome: string
      node: string
    }>,
  getWindowState: () =>
    ipcRenderer.invoke("desktop:get-window-state") as Promise<{
      isMaximized: boolean
    }>,
  showMenu: (menuKey: MenuKey) => ipcRenderer.invoke("desktop:show-menu", menuKey),
  windowAction: (action: WindowAction) => ipcRenderer.invoke("desktop:window-action", action),
  onWindowStateChange: (listener: (state: { isMaximized: boolean }) => void) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, state: { isMaximized: boolean }) => {
      listener(state)
    }

    ipcRenderer.on("desktop:window-state-changed", wrappedListener)

    return () => {
      ipcRenderer.removeListener("desktop:window-state-changed", wrappedListener)
    }
  },
})
