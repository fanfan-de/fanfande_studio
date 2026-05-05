import { beforeEach, describe, expect, it, vi } from "vitest"

const electronMock = vi.hoisted(() => ({
  exposedDesktopApi: null as null | { detectLocalPreviewServices: () => Promise<unknown> },
  exposeInMainWorld: vi.fn((key: string, value: unknown) => {
    if (key === "desktop") {
      electronMock.exposedDesktopApi = value as { detectLocalPreviewServices: () => Promise<unknown> }
    }
  }),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}))

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: electronMock.exposeInMainWorld,
  },
  ipcRenderer: {
    invoke: electronMock.invoke,
    on: electronMock.on,
    removeListener: electronMock.removeListener,
  },
}))

await import("./index")

describe("desktop preload bridge", () => {
  beforeEach(() => {
    electronMock.invoke.mockReset()
  })

  it("exposes local preview service detection", async () => {
    const services = [{ port: 5173, statusCode: 200, url: "http://localhost:5173/" }]
    electronMock.invoke.mockResolvedValueOnce(services)

    await expect(electronMock.exposedDesktopApi?.detectLocalPreviewServices()).resolves.toEqual(services)
    expect(electronMock.invoke).toHaveBeenCalledWith("desktop:detect-local-preview-services")
  })
})
