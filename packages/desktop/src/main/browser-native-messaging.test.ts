import { describe, expect, it, vi } from "vitest"

vi.mock("electron", () => ({
  app: {
    get isPackaged() {
      return false
    },
    getAppPath: vi.fn(() => "C:\\Projects\\fanfande_studio\\packages\\desktop"),
    getPath: vi.fn(() => "C:\\Users\\tester\\AppData\\Roaming\\Anybox"),
  },
}))

import {
  BROWSER_NATIVE_HOST_NAME,
  browserNativeMessagingManifest,
  browserNativeMessagingRegistryKey,
  DEFAULT_BROWSER_EXTENSION_ID,
} from "./browser-native-messaging"

describe("browser native messaging registration helpers", () => {
  it("builds a Chrome native messaging manifest", () => {
    const manifest = browserNativeMessagingManifest({
      hostPath: "C:\\Anybox\\anybox-browser-native-host.exe",
    })

    expect(manifest).toEqual({
      name: BROWSER_NATIVE_HOST_NAME,
      description: "Anybox Browser Native Messaging Host",
      path: "C:\\Anybox\\anybox-browser-native-host.exe",
      type: "stdio",
      allowed_origins: [`chrome-extension://${DEFAULT_BROWSER_EXTENSION_ID}/`],
    })
  })

  it("uses the HKCU Chrome NativeMessagingHosts registry key", () => {
    expect(browserNativeMessagingRegistryKey()).toBe(
      `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${BROWSER_NATIVE_HOST_NAME}`,
    )
  })
})
