import { BrowserWindow, screen, type Rectangle } from "electron"

export const WINDOW_STATE_CHANNEL = "desktop:window-state-changed"

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
  win.webContents.send(WINDOW_STATE_CHANNEL, {
    isMaximized: isWindowMaximized(win),
  })
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
