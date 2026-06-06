import { describe, expect, it, vi } from "vitest"

vi.mock("electron", () => ({
  app: {
    getAppPath: vi.fn(() => ""),
  },
  BrowserWindow: vi.fn(),
}))

import { resolveNativeMacWindowButtonPosition, resolvePopoutWindowOptions } from "./window"

describe("session popout window options", () => {
  it("creates a frameless first-class Windows Electron window with the desktop preload", () => {
    const options = resolvePopoutWindowOptions("C:\\desktop\\out\\main", { platform: "win32" })

    expect(options.frame).toBe(false)
    expect(options.roundedCorners).toBe(false)
    expect(options.titleBarStyle).toBeUndefined()
    expect("trafficLightPosition" in options).toBe(false)
    expect(options.webPreferences?.contextIsolation).toBe(true)
    expect(options.webPreferences?.nodeIntegration).toBe(false)
    expect(options.webPreferences?.preload).toContain("preload")
  })

  it("creates a frameless macOS Electron window with native traffic lights", () => {
    const options = resolvePopoutWindowOptions("/desktop/out/main", { platform: "darwin" })

    expect(options.frame).toBe(false)
    expect(options.roundedCorners).toBe(true)
    expect(options.titleBarStyle).toBe("hidden")
    expect("trafficLightPosition" in options).toBe(false)
    expect(options.webPreferences?.contextIsolation).toBe(true)
    expect(options.webPreferences?.nodeIntegration).toBe(false)
    expect(options.webPreferences?.preload).toContain("preload")
  })

  it("positions native macOS traffic lights inside the right window controls slot", () => {
    expect(resolveNativeMacWindowButtonPosition(1440)).toEqual({ x: 1364, y: 14 })
    expect(resolveNativeMacWindowButtonPosition(72)).toEqual({ x: 12, y: 14 })
  })
})
