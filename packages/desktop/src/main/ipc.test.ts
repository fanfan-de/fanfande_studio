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

describe("ipc side chat cleanup helpers", () => {
  function createSideChatLink(input: {
    sessionID: string
    assistantText?: string
    archived?: boolean
  }) {
    return {
      sessionID: input.sessionID,
      parentSessionID: "parent-1",
      anchorMessageID: "assistant-1",
      createdAt: 1,
      anchorPreview: "Parent response",
      snapshotVersion: 1 as const,
      snapshot: {
        assistantText: input.assistantText ?? "",
      },
      archived: input.archived,
    }
  }

  it("deletes live side chat links that do not have an assistant response", async () => {
    const deleteSession = vi.fn().mockResolvedValue(undefined)
    const links = [
      createSideChatLink({ sessionID: "empty-1" }),
      createSideChatLink({ sessionID: "response-1", assistantText: "A real answer." }),
      createSideChatLink({ sessionID: "empty-archived", archived: true }),
      createSideChatLink({ sessionID: "empty-2", assistantText: "   " }),
    ]

    await expect(internal.cleanupSideChatLinksWithoutResponses(links, deleteSession)).resolves.toEqual([
      links[1],
      links[2],
    ])
    expect(deleteSession).toHaveBeenCalledTimes(2)
    expect(deleteSession).toHaveBeenNthCalledWith(1, "empty-1")
    expect(deleteSession).toHaveBeenNthCalledWith(2, "empty-2")
  })

  it("keeps an empty side chat link when deletion fails so the cleanup can be retried", async () => {
    const deleteSession = vi.fn().mockRejectedValue(new Error("network failed"))
    const link = createSideChatLink({ sessionID: "empty-1" })
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true)

    try {
      await expect(internal.cleanupSideChatLinksWithoutResponses([link], deleteSession)).resolves.toEqual([link])
    } finally {
      stderrWrite.mockRestore()
    }
  })
})

describe("ipc session trace export helpers", () => {
  const traceExport = {
    schemaVersion: 1 as const,
    generatedAt: 1,
    mode: "safe" as const,
    session: {
      id: "session-1",
      missing: false,
    },
    stats: {
      messageCount: 1,
      eventCount: 1,
      turnCount: 1,
      toolCallCount: 1,
      redactedCount: 0,
      truncatedCount: 0,
    },
    redaction: {
      enabled: true as const,
      maxStringLength: 20000,
      redactedKeyPattern: "token",
    },
    messages: [],
    events: [],
    runtime: {
      generatedAt: 1,
      logging: {},
      session: {
        id: "session-1",
        missing: false,
      },
      status: {
        type: "idle" as const,
      },
      running: {
        sessionID: "session-1",
        startedAt: null,
        activeForMs: 0,
      },
      activeTurnID: null,
      latestTurn: null,
      turns: [],
      recentEvents: [],
      diagnostics: {
        blockedOnApproval: false,
        activeToolCount: 0,
        failedToolCount: 0,
        llmFailureCount: 0,
      },
    },
    toolCalls: [],
  }

  it("loads a safe session trace export from the agent API", async () => {
    requestAgentJSONMock.mockResolvedValueOnce({
      data: traceExport,
    })

    await expect(internal.getSessionTraceExport({ sessionID: " session-1 " })).resolves.toEqual(traceExport)
    expect(requestAgentJSONMock).toHaveBeenCalledWith("/api/debug/sessions/session-1/trace-export")
  })

  it("saves formatted session trace JSON through an injected save dialog", async () => {
    const showSaveDialog = vi.fn().mockResolvedValue({
      canceled: false,
      filePath: "C:\\Temp\\trace.json",
    })
    const writeTraceFile = vi.fn().mockResolvedValue(undefined)
    requestAgentJSONMock.mockResolvedValueOnce({
      data: traceExport,
    })

    const result = await internal.saveSessionTraceExport(
      { sessionID: "session-1" },
      {
        downloadsPath: "C:\\Downloads",
        now: new Date(2026, 4, 22, 9, 8, 7),
        showSaveDialog,
        writeTraceFile,
      },
    )

    expect(result).toEqual({
      canceled: false,
      path: "C:\\Temp\\trace.json",
    })
    expect(showSaveDialog).toHaveBeenCalledWith(expect.objectContaining({
      defaultPath: expect.stringContaining("anybox-trace-session-1-20260522-090807.json"),
      filters: [{ name: "JSON", extensions: ["json"] }],
      title: "Save session trace JSON",
    }))
    expect(writeTraceFile).toHaveBeenCalledWith(
      "C:\\Temp\\trace.json",
      `${JSON.stringify(traceExport, null, 2)}\n`,
      "utf8",
    )
  })

  it("saves a split session trace directory with per-record files", async () => {
    const turn = {
      turnID: "turn-1",
      status: "completed" as const,
      resume: false,
      llmCalls: [],
      tools: [
        {
          callID: "toolcall-1",
          tool: "grep",
          status: "completed",
        },
      ],
      recentEvents: [],
    }
    const traceWithRecords = {
      ...traceExport,
      stats: {
        ...traceExport.stats,
        messageCount: 1,
        eventCount: 1,
        turnCount: 1,
        toolCallCount: 1,
      },
      messages: [
        {
          id: "message-1",
          role: "assistant",
          turnID: "turn-1",
          created: 1,
        },
      ],
      events: [
        {
          eventID: "event-1",
          sessionID: "session-1",
          turnID: "turn-1",
          seq: 1,
          timestamp: 2,
          type: "tool.call.completed",
          payload: {
            part: {
              callID: "toolcall-1",
            },
          },
        },
      ],
      runtime: {
        ...traceExport.runtime,
        latestTurn: turn,
        turns: [turn],
        recentEvents: [
          {
            eventID: "event-1",
            type: "tool.call.completed",
            sessionID: "session-1",
            turnID: "turn-1",
            seq: 1,
            timestamp: 2,
          },
        ],
      },
      toolCalls: [
        {
          callID: "toolcall-1",
          tool: "grep",
          status: "completed",
          turnID: "turn-1",
          messageID: "message-1",
          eventIDs: ["event-1"],
        },
      ],
    }
    const showOpenDialog = vi.fn().mockResolvedValue({
      canceled: false,
      filePaths: ["C:\\Exports"],
    })
    const makeDirectory = vi.fn().mockResolvedValue(undefined)
    const writeTraceFile = vi.fn().mockResolvedValue(undefined)
    requestAgentJSONMock.mockResolvedValueOnce({
      data: traceWithRecords,
    })

    const result = await internal.saveSessionTraceExportDirectory(
      { sessionID: "session-1" },
      {
        downloadsPath: "C:\\Downloads",
        now: new Date(2026, 4, 22, 9, 8, 7),
        showOpenDialog,
        makeDirectory,
        writeTraceFile,
      },
    )

    expect(result).toEqual({
      canceled: false,
      path: "C:\\Exports\\anybox-trace-session-1-20260522-090807",
      fileCount: 11,
      recordCount: 1,
    })
    expect(showOpenDialog).toHaveBeenCalledWith(expect.objectContaining({
      buttonLabel: "Export Here",
      defaultPath: "C:\\Downloads",
      properties: ["openDirectory", "createDirectory"],
      title: "Select folder for split session trace",
    }))
    expect(makeDirectory).toHaveBeenCalledWith(
      "C:\\Exports\\anybox-trace-session-1-20260522-090807",
      { recursive: true },
    )

    const writtenPaths = writeTraceFile.mock.calls.map((call) => call[0])
    expect(writtenPaths.some((filePath) => String(filePath).endsWith("\\manifest.json"))).toBe(true)
    expect(writtenPaths.some((filePath) => String(filePath).endsWith("\\records\\index.json"))).toBe(true)
    expect(writtenPaths.some((filePath) => String(filePath).includes("\\records\\000001-tool.call.completed-1-event-1.json"))).toBe(true)
    expect(writtenPaths.some((filePath) => String(filePath).endsWith("\\runtime\\status.json"))).toBe(true)

    const manifestCall = writeTraceFile.mock.calls.find((call) => String(call[0]).endsWith("\\manifest.json"))
    expect(manifestCall?.[1]).toContain('"exportFormat": "anybox-session-trace-directory"')
    const recordCall = writeTraceFile.mock.calls.find((call) =>
      String(call[0]).includes("\\records\\000001-tool.call.completed-1-event-1.json"))
    expect(recordCall?.[1]).toContain('"relatedToolCallFiles"')
    expect(recordCall?.[1]).toContain('"tool-calls/000001-grep-toolcall-1.json"')
  })

  it("saves a split session trace directory under the project default location", async () => {
    const makeDirectory = vi.fn().mockResolvedValue(undefined)
    const writeTraceFile = vi.fn().mockResolvedValue(undefined)
    requestAgentJSONMock.mockResolvedValueOnce({
      data: traceExport,
    })

    const result = await internal.saveSessionTraceExportToProject(
      {
        sessionID: "session-1",
        directory: "C:\\Projects\\Demo",
        projectID: "project-1",
      },
      {
        makeDirectory,
        now: new Date(2026, 4, 22, 9, 8, 7),
        userDataPath: "C:\\Users\\Demo\\AppData\\Roaming\\Anybox",
        writeTraceFile,
      },
    )

    expect(result).toEqual(expect.objectContaining({
      canceled: false,
      path: "C:\\Users\\Demo\\AppData\\Roaming\\Anybox\\session-traces\\project-1\\anybox-trace-session-1-20260522-090807",
      recordCount: 0,
    }))
    expect(makeDirectory).toHaveBeenCalledWith(
      "C:\\Users\\Demo\\AppData\\Roaming\\Anybox\\session-traces\\project-1\\anybox-trace-session-1-20260522-090807",
      { recursive: true },
    )
    expect(writeTraceFile.mock.calls.some((call) => String(call[0]).endsWith("\\manifest.json"))).toBe(true)
  })

  it("saves a split session trace directory when runtime arrays are missing", async () => {
    const traceWithSparseRuntime = {
      ...traceExport,
      events: [
        {
          eventID: "event-1",
          sessionID: "session-1",
          turnID: "turn-1",
          seq: 1,
          timestamp: 2,
          type: "turn.started",
          payload: {},
        },
      ],
      runtime: {
        ...traceExport.runtime,
        latestTurn: {
          turnID: "turn-1",
          status: "completed",
        },
        turns: [
          {
            turnID: "turn-1",
            status: "completed",
          },
        ],
        recentEvents: undefined,
      },
      toolCalls: [
        {
          callID: "toolcall-1",
          tool: "grep",
          status: "completed",
        },
      ],
    }
    const showOpenDialog = vi.fn().mockResolvedValue({
      canceled: false,
      filePaths: ["C:\\Exports"],
    })
    const makeDirectory = vi.fn().mockResolvedValue(undefined)
    const writeTraceFile = vi.fn().mockResolvedValue(undefined)
    requestAgentJSONMock.mockResolvedValueOnce({
      data: traceWithSparseRuntime,
    })

    await expect(internal.saveSessionTraceExportDirectory(
      { sessionID: "session-1" },
      {
        downloadsPath: "C:\\Downloads",
        showOpenDialog,
        makeDirectory,
        writeTraceFile,
      },
    )).resolves.toEqual(expect.objectContaining({
      canceled: false,
      recordCount: 1,
    }))

    const turnIndexCall = writeTraceFile.mock.calls.find((call) => String(call[0]).endsWith("\\runtime\\turns\\index.json"))
    expect(turnIndexCall?.[1]).toContain('"toolCount": 0')
    expect(turnIndexCall?.[1]).toContain('"llmCallCount": 0')
    expect(turnIndexCall?.[1]).toContain('"recentEventCount": 0')
  })

  it("does not write a trace file when the save dialog is canceled", async () => {
    const showSaveDialog = vi.fn().mockResolvedValue({
      canceled: true,
    })
    const writeTraceFile = vi.fn().mockResolvedValue(undefined)
    requestAgentJSONMock.mockResolvedValueOnce({
      data: traceExport,
    })

    await expect(internal.saveSessionTraceExport(
      { sessionID: "session-1" },
      {
        downloadsPath: "C:\\Downloads",
        showSaveDialog,
        writeTraceFile,
      },
    )).resolves.toEqual({ canceled: true })

    expect(writeTraceFile).not.toHaveBeenCalled()
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
