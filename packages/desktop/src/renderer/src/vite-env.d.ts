/// <reference types="vite/client" />

export {}

declare global {
  interface Window {
    desktop?: {
      platform: string
      versions: NodeJS.ProcessVersions
      getInfo: () => Promise<{
        platform: string
        electron: string
        chrome: string
        node: string
      }>
      getWindowState?: () => Promise<{
        isMaximized: boolean
      }>
      showMenu?: (menuKey: "file" | "edit" | "view" | "window" | "help") => Promise<void>
      windowAction?: (action: "minimize" | "toggle-maximize" | "close") => Promise<void>
      onWindowStateChange?: (listener: (state: { isMaximized: boolean }) => void) => () => void
    }
  }
}
