import { describe, expect, it, vi } from "vitest"

vi.mock("electron", () => ({
  BrowserWindow: vi.fn(),
  globalShortcut: {
    register: vi.fn(() => true),
    unregister: vi.fn(),
  },
  screen: {
    getAllDisplays: vi.fn(() => []),
    off: vi.fn(),
    on: vi.fn(),
  },
}))

import { readComputerUseRuntimeEvent } from "./computer-use-overlay"

describe("computer use overlay runtime event detection", () => {
  it("detects Computer Use Windows tool starts", () => {
    const event = readComputerUseRuntimeEvent({
      event: "runtime",
      data: {
        sessionID: "ses_1",
        turnID: "trn_1",
        type: "tool.call.started",
        payload: {
          part: {
            callID: "call_1",
            tool: "mcp_plugin_computer_use_windows_windows_click",
            state: {
              title: "Computer Use Windows/Click",
            },
          },
        },
      },
    })

    expect(event).toEqual({
      type: "tool-started",
      callKey: "ses_1:trn_1:call_1",
      callID: "call_1",
      title: "Computer Use Windows/Click",
      tool: "mcp_plugin_computer_use_windows_windows_click",
      turnID: "trn_1",
    })
  })

  it("detects Computer Use Windows tool completion", () => {
    const event = readComputerUseRuntimeEvent({
      event: "runtime",
      data: {
        sessionID: "ses_1",
        turnID: "trn_1",
        type: "tool.call.completed",
        payload: {
          part: {
            callID: "call_1",
            tool: "mcp_plugin_computer_use_windows_windows_type_text",
            state: {
              title: "Computer Use Windows/Type Text",
            },
          },
        },
      },
    })

    expect(event).toMatchObject({
      type: "tool-settled",
      callKey: "ses_1:trn_1:call_1",
      callID: "call_1",
      tool: "mcp_plugin_computer_use_windows_windows_type_text",
      turnID: "trn_1",
    })
  })

  it("ignores unrelated MCP tools", () => {
    const event = readComputerUseRuntimeEvent({
      event: "runtime",
      data: {
        sessionID: "ses_1",
        turnID: "trn_1",
        type: "tool.call.started",
        payload: {
          part: {
            callID: "call_1",
            tool: "mcp_connector_browser_default_browser_click",
            state: {
              title: "Browser/Click",
            },
          },
        },
      },
    })

    expect(event).toBeNull()
  })

  it("detects terminal turn events", () => {
    const event = readComputerUseRuntimeEvent({
      event: "runtime",
      data: {
        sessionID: "ses_1",
        turnID: "trn_1",
        type: "turn.cancelled",
        payload: {},
      },
    })

    expect(event).toEqual({
      type: "turn-settled",
      turnID: "trn_1",
    })
  })
})
