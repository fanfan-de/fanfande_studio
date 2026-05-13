import { beforeEach, describe, expect, it, vi } from "vitest"

const requestAgentJSONMock = vi.hoisted(() => vi.fn())

vi.mock("electron-updater", () => {
  const autoUpdater = {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    forceDevUpdateConfig: false,
    checkForUpdates: vi.fn(),
    on: vi.fn(),
    quitAndInstall: vi.fn(),
  }

  return {
    autoUpdater,
    default: {
      autoUpdater,
    },
  }
})

vi.mock("./agent-client", () => ({
  getAgentConfig: vi.fn(() => ({
    baseURL: "http://localhost:4096",
    defaultDirectory: "C:\\Projects",
  })),
  readAgentSSEStream: vi.fn(),
  requestAgentJSON: requestAgentJSONMock,
  resolveAgentURL: vi.fn((path: string) => `http://localhost:4096${path}`),
}))

import { internal } from "./ipc"

beforeEach(() => {
  requestAgentJSONMock.mockReset()
})

describe("ipc session stream cleanup helpers", () => {
  it("matches subscription keys by exact webContents id prefix", () => {
    expect(internal.isSessionStreamSubscriptionKeyForWebContents("12:session-a", 12)).toBe(true)
    expect(internal.isSessionStreamSubscriptionKeyForWebContents("112:session-a", 12)).toBe(false)
    expect(internal.isSessionStreamSubscriptionKeyForWebContents("1:12:session-a", 12)).toBe(false)
  })

  it("disposes only subscriptions owned by the destroyed webContents", () => {
    const owned = { dispose: vi.fn() }
    const otherSender = { dispose: vi.fn() }
    const otherPrefix = { dispose: vi.fn() }
    const subscriptions = new Map([
      ["12:session-a", owned],
      ["112:session-b", otherSender],
      ["1:12:session-c", otherPrefix],
    ])

    const disposedCount = internal.disposeSessionStreamSubscriptionsForWebContents(subscriptions, 12)

    expect(disposedCount).toBe(1)
    expect(owned.dispose).toHaveBeenCalledTimes(1)
    expect(otherSender.dispose).not.toHaveBeenCalled()
    expect(otherPrefix.dispose).not.toHaveBeenCalled()
    expect([...subscriptions.keys()]).toEqual(["112:session-b", "1:12:session-c"])
  })

  it("aborts only the matching client turn when provided", () => {
    const matching = new AbortController()
    const sameSessionOtherTurn = new AbortController()
    const requests = new Map([
      ["12:turn-a", {
        backendSessionID: "session-a",
        cancelRequested: false,
        clientTurnID: "turn-a",
        controller: matching,
      }],
      ["12:turn-b", {
        backendSessionID: "session-a",
        cancelRequested: false,
        clientTurnID: "turn-b",
        controller: sameSessionOtherTurn,
      }],
    ])

    const aborted = internal.abortActiveAgentSessionRequestsInMap(requests, {
      backendSessionID: "session-a",
      clientTurnID: "turn-a",
      webContentsID: 12,
    })

    expect(aborted).toBe(1)
    expect(requests.get("12:turn-a")?.cancelRequested).toBe(true)
    expect(matching.signal.aborted).toBe(true)
    expect(requests.get("12:turn-b")?.cancelRequested).toBe(false)
    expect(sameSessionOtherTurn.signal.aborted).toBe(false)
  })

  it("aborts all active requests for the same backend session in one webContents when no turn is provided", () => {
    const first = new AbortController()
    const second = new AbortController()
    const otherSession = new AbortController()
    const otherWebContents = new AbortController()
    const requests = new Map([
      ["12:turn-a", {
        backendSessionID: "session-a",
        cancelRequested: false,
        clientTurnID: "turn-a",
        controller: first,
      }],
      ["12:turn-b", {
        backendSessionID: "session-a",
        cancelRequested: false,
        clientTurnID: "turn-b",
        controller: second,
      }],
      ["12:turn-c", {
        backendSessionID: "session-b",
        cancelRequested: false,
        clientTurnID: "turn-c",
        controller: otherSession,
      }],
      ["13:turn-d", {
        backendSessionID: "session-a",
        cancelRequested: false,
        clientTurnID: "turn-d",
        controller: otherWebContents,
      }],
    ])

    const aborted = internal.abortActiveAgentSessionRequestsInMap(requests, {
      backendSessionID: "session-a",
      webContentsID: 12,
    })

    expect(aborted).toBe(2)
    expect(first.signal.aborted).toBe(true)
    expect(second.signal.aborted).toBe(true)
    expect(otherSession.signal.aborted).toBe(false)
    expect(otherWebContents.signal.aborted).toBe(false)
  })
})

describe("ipc tool permission mode helpers", () => {
  it("loads the global tool permission mode from the agent API", async () => {
    requestAgentJSONMock.mockResolvedValueOnce({
      data: {
        mode: "default",
      },
    })

    await expect(internal.getToolPermissionMode()).resolves.toEqual({
      mode: "default",
    })
    expect(requestAgentJSONMock).toHaveBeenCalledWith("/api/tools/permission-mode")
  })

  it("updates the global tool permission mode through the agent API", async () => {
    requestAgentJSONMock.mockResolvedValueOnce({
      data: {
        mode: "full_access",
      },
    })

    await expect(internal.updateToolPermissionMode({ mode: "full_access" })).resolves.toEqual({
      mode: "full_access",
    })

    expect(requestAgentJSONMock).toHaveBeenCalledWith("/api/tools/permission-mode", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        mode: "full_access",
      }),
    })
  })
})

describe("ipc preview screenshot helpers", () => {
  it("captures the requested bounds and writes a marker screenshot under user data", async () => {
    const pngBuffer = Buffer.from("preview-marker")
    const capturePage = vi.fn().mockResolvedValue({
      toPNG: () => pngBuffer,
    })
    const makeDirectory = vi.fn().mockResolvedValue(undefined)
    const writeImageFile = vi.fn().mockResolvedValue(undefined)

    const result = await internal.capturePreviewScreenshotFromWindow(
      { capturePage },
      {
        bounds: {
          height: 0,
          width: 320.4,
          x: -8.2,
          y: 12.6,
        },
        url: "http://localhost:5174/page?a=1",
      },
      {
        makeDirectory,
        now: new Date("2026-05-03T01:02:03.004Z"),
        userDataPath: "C:\\Users\\codex\\AppData\\Roaming\\Desktop",
        writeImageFile,
      },
    )

    expect(capturePage).toHaveBeenCalledWith({
      height: 1,
      width: 320,
      x: 0,
      y: 13,
    })
    expect(result.path).toContain("preview-comment-screenshots")
    expect(result.path).toContain("2026-05-03T01-02-03-004Z-localhost-5174-page-a-1.png")
    expect(makeDirectory).toHaveBeenCalledWith(expect.stringContaining("preview-comment-screenshots"), {
      recursive: true,
    })
    expect(writeImageFile).toHaveBeenCalledWith(result.path, pngBuffer)
  })
})

describe("ipc composer pasted image helpers", () => {
  it("decodes and writes pasted composer images under user data", async () => {
    const imageBuffer = Buffer.from("clipboard-image")
    const makeDirectory = vi.fn().mockResolvedValue(undefined)
    const writeImageFile = vi.fn().mockResolvedValue(undefined)

    const result = await internal.saveComposerPastedImages(
      {
        images: [
          {
            dataUrl: `data:image/png;base64,${imageBuffer.toString("base64")}`,
            mimeType: "image/png",
            name: "screen shot.png",
          },
        ],
      },
      {
        makeDirectory,
        now: new Date("2026-05-03T01:02:03.004Z"),
        userDataPath: "C:\\Users\\codex\\AppData\\Roaming\\Desktop",
        writeImageFile,
      },
    )

    expect(result).toHaveLength(1)
    expect(result[0]).toContain("composer-pasted-images")
    expect(result[0]).toContain("2026-05-03T01-02-03-004Z-01-screen-shot.png")
    expect(makeDirectory).toHaveBeenCalledWith(expect.stringContaining("composer-pasted-images"), {
      recursive: true,
    })
    expect(writeImageFile).toHaveBeenCalledWith(result[0], imageBuffer)
  })
})
