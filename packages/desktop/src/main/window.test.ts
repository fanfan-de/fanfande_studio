import { describe, expect, it, vi } from "vitest"

vi.mock("electron", () => ({
  app: {
    getAppPath: vi.fn(() => ""),
  },
  BrowserWindow: vi.fn(),
}))

import { resolvePopoutWindowOptions } from "./window"

describe("session popout window options", () => {
  it("creates a frameless first-class Electron window with the desktop preload", () => {
    const options = resolvePopoutWindowOptions("C:\\desktop\\out\\main")

    expect(options.frame).toBe(false)
    expect(options.roundedCorners).toBe(false)
    expect(options.webPreferences?.contextIsolation).toBe(true)
    expect(options.webPreferences?.nodeIntegration).toBe(false)
    expect(options.webPreferences?.preload).toContain("preload")
  })
})
