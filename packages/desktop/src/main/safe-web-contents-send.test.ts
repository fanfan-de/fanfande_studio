import { describe, expect, it, vi } from "vitest"
import {
  getWebContentsForWindowSafely,
  isDisposedElectronTargetError,
  sendWebContentsSafely,
} from "./safe-web-contents-send"

describe("safe webContents send helpers", () => {
  it("sends to live web contents", () => {
    const send = vi.fn()
    const target = {
      isDestroyed: () => false,
      send,
    }

    expect(sendWebContentsSafely(target, "desktop:event", { ok: true })).toBe(true)
    expect(send).toHaveBeenCalledWith("desktop:event", { ok: true })
  })

  it("skips destroyed web contents", () => {
    const send = vi.fn()
    const target = {
      isDestroyed: () => true,
      send,
    }

    expect(sendWebContentsSafely(target, "desktop:event", { ok: true })).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })

  it("suppresses disposed render frame send races", () => {
    const target = {
      isDestroyed: () => false,
      send: (_channel: string, _payload: unknown) => {
        throw new Error("Render frame was disposed before WebFrameMain could be accessed")
      },
    }

    expect(sendWebContentsSafely(target, "desktop:event", { ok: true })).toBe(false)
  })

  it("rethrows unexpected send failures", () => {
    const target = {
      isDestroyed: () => false,
      send: (_channel: string, _payload: unknown) => {
        throw new Error("unexpected")
      },
    }

    expect(() => sendWebContentsSafely(target, "desktop:event", { ok: true })).toThrow("unexpected")
  })

  it("recognizes destroyed Electron target errors", () => {
    expect(isDisposedElectronTargetError(new Error("Object has been destroyed"))).toBe(true)
    expect(isDisposedElectronTargetError(new Error("unexpected"))).toBe(false)
  })

  it("returns null when a window webContents getter races with destruction", () => {
    const win = {
      isDestroyed: () => false,
      get webContents(): never {
        throw new Error("Object has been destroyed")
      },
    }

    expect(getWebContentsForWindowSafely(win)).toBeNull()
  })
})
