import { describe, expect, it } from "vitest"
import { findPaneStateForDockviewPanel, resolvePanelStateForDockviewPanel } from "./WorkbenchShell"

describe("findPaneStateForDockviewPanel", () => {
  it("falls back to the pane containing the Dockview panel when group ids diverge", () => {
    const paneStateByID = {
      "legacy-pane-1": {
        id: "legacy-pane-1",
        tabs: [
          {
            key: "session:session-chat-1",
          },
        ],
      },
    } as any

    expect(
      findPaneStateForDockviewPanel(paneStateByID, "dockview-restored-group", "session:session-chat-1")?.id,
    ).toBe("legacy-pane-1")
  })
})

describe("resolvePanelStateForDockviewPanel", () => {
  it("uses the panel-bound state and overlays the live group identity", () => {
    const paneStateByID = {
      "group-1": {
        id: "group-1",
        isFocused: true,
        sessionID: "session-a",
        tabs: [
          {
            key: "session:session-a",
          },
          {
            key: "session:session-b",
          },
        ],
      },
    } as any
    const panelStateByID = {
      "session:session-b": {
        id: "stale-group",
        isFocused: false,
        sessionID: "session-b",
        tabs: [],
      },
    } as any

    const resolved = resolvePanelStateForDockviewPanel(
      panelStateByID,
      paneStateByID,
      "group-1",
      "session:session-b",
    )

    expect(resolved).toMatchObject({
      id: "group-1",
      isFocused: true,
      sessionID: "session-b",
    })
  })

  it("returns null when a Dockview panel has no panel-bound state", () => {
    expect(resolvePanelStateForDockviewPanel({} as any, {} as any, "group-1", "session:missing")).toBeNull()
  })
})
