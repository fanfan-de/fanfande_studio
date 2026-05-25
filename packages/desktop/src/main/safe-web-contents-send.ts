import type { BrowserWindow, WebContents } from "electron"

export type WebContentsSendTarget<Args extends unknown[] = unknown[]> = {
  isDestroyed: () => boolean
  send: (channel: string, ...args: Args) => void
}

export function isDisposedElectronTargetError(error: unknown) {
  if (!(error instanceof Error)) return false

  const message = error.message.toLowerCase()
  return (
    message.includes("render frame was disposed") ||
    message.includes("webframemain could be accessed") ||
    message.includes("object has been destroyed") ||
    message.includes("webcontents has been destroyed") ||
    message.includes("webcontents was destroyed")
  )
}

export function getWebContentsForWindowSafely(win: Pick<BrowserWindow, "isDestroyed" | "webContents">) {
  if (win.isDestroyed()) return null

  try {
    return win.webContents
  } catch (error) {
    if (isDisposedElectronTargetError(error)) return null
    throw error
  }
}

export function sendWebContentsSafely<Args extends unknown[]>(
  target: WebContentsSendTarget<Args> | WebContents,
  channel: string,
  ...args: Args
) {
  if (target.isDestroyed()) return false

  try {
    target.send(channel, ...args)
    return true
  } catch (error) {
    if (isDisposedElectronTargetError(error)) return false
    throw error
  }
}
