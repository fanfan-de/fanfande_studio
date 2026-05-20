/// <reference types="vite/client" />

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
    }
  }
}

export {}
