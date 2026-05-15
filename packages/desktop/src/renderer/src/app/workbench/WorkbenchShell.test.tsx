import { describe, expect, it } from "vitest"
import { findPaneStateForDockviewPanel } from "./WorkbenchShell"

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
