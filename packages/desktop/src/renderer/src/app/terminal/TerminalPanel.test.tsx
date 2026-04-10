import { act, fireEvent, render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { TerminalPanel } from "./TerminalPanel"

async function flushFrame() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve())
    })
  })
}

describe("TerminalPanel", () => {
  it("keeps resize preview local until pointerup commits the height", async () => {
    const onPanelHeightChange = vi.fn()
    const { container } = render(
      <TerminalPanel
        activeSession={null}
        isOpen={true}
        panelHeight={280}
        sessions={[]}
        onCloseTerminal={vi.fn()}
        onCreateTerminal={vi.fn()}
        onPanelHeightChange={onPanelHeightChange}
        onSelectTerminal={vi.fn()}
        onTerminalInput={vi.fn()}
        onTerminalResize={vi.fn()}
        onTerminalSnapshotChange={vi.fn()}
        onTogglePanel={vi.fn()}
        subscribeToTerminalStream={() => () => {}}
      />,
    )

    const panel = container.querySelector(".terminal-panel")
    const resizer = container.querySelector(".terminal-panel-resizer")

    expect(panel).not.toBeNull()
    expect(resizer).not.toBeNull()
    expect(panel).toHaveStyle({ height: "280px" })

    fireEvent.pointerDown(resizer!, {
      button: 0,
      clientY: 500,
    })
    fireEvent.pointerMove(window, {
      clientY: 420,
    })

    await flushFrame()

    expect(onPanelHeightChange).not.toHaveBeenCalled()
    expect(panel).toHaveStyle({ height: "360px" })

    fireEvent.pointerUp(window)

    expect(onPanelHeightChange).toHaveBeenCalledTimes(1)
    expect(onPanelHeightChange).toHaveBeenCalledWith(360)
    expect(document.body.classList.contains("is-resizing-terminal-panel")).toBe(false)
  })
})
