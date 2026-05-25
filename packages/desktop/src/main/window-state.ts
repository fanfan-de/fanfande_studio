import { BrowserWindow, screen, type Rectangle } from "electron"
import { DESKTOP_WINDOW_STATE_EVENT_CHANNEL } from "../shared/desktop-ipc-contract"
import {
  getWebContentsForWindowSafely,
  isDisposedElectronTargetError,
  sendWebContentsSafely,
} from "./safe-web-contents-send"

export const WINDOW_STATE_CHANNEL = DESKTOP_WINDOW_STATE_EVENT_CHANNEL

const manualMaximizedBounds = new WeakMap<BrowserWindow, Rectangle>()
const manualMaximizedWindows = new WeakSet<BrowserWindow>()

export function clearManualMaximize(win: BrowserWindow) {
  manualMaximizedBounds.delete(win)
  manualMaximizedWindows.delete(win)
}

export function isWindowMaximized(win: BrowserWindow) {
  return win.isMaximized() || manualMaximizedWindows.has(win)
}

export function sendWindowState(win: BrowserWindow) {
  try {
    const webContents = getWebContentsForWindowSafely(win)
    if (!webContents) return false

    return sendWebContentsSafely(webContents, WINDOW_STATE_CHANNEL, {
      isMaximized: isWindowMaximized(win),
    })
  } catch (error) {
    if (isDisposedElectronTargetError(error)) return false
    throw error
  }
}

export function maximizeFramelessWindow(win: BrowserWindow) {
  const currentBounds = win.getBounds()
  const workArea = screen.getDisplayMatching(currentBounds).workArea

  manualMaximizedBounds.set(win, currentBounds)
  manualMaximizedWindows.add(win)
  win.setBounds(workArea)
}

export function restoreFramelessWindow(win: BrowserWindow) {
  const restoreBounds = manualMaximizedBounds.get(win)

  clearManualMaximize(win)

  if (restoreBounds) {
    win.setBounds(restoreBounds)
    return
  }

  win.unmaximize()
}
