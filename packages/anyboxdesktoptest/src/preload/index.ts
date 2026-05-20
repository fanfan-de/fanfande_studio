import { contextBridge, ipcRenderer } from "electron"

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
})
