import { act, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { TerminalView } from "./TerminalView"
import type { TerminalSessionRecord, TerminalStreamEvent } from "./types"

const baseSession: TerminalSessionRecord = {
  ptyID: "pty-1",
  title: "Terminal 1",
  cwd: "C:\\Projects\\fanfande_studio",
  shell: "powershell.exe",
  rows: 24,
  cols: 80,
  status: "running",
  exitCode: null,
  createdAt: 1,
  updatedAt: 1,
  cursor: 0,
  buffer: "",
  scrollTop: 0,
  transportState: "connected",
}

function renderTerminalView() {
  return (
    <TerminalView
      panelHeight={280}
      session={baseSession}
      onInput={vi.fn()}
      onResize={vi.fn()}
      onSnapshotChange={vi.fn()}
      subscribeToTerminalStream={(_ptyID: string, _listener: (event: TerminalStreamEvent) => void) => () => {}}
    />
  )
}

async function flushTimer() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0))
  })
}

describe("TerminalView", () => {
  it("does not steal focus from an active composer textarea while mounting", async () => {
    const { rerender } = render(<textarea aria-label="Task draft" />)

    const composer = screen.getByRole("textbox", { name: "Task draft" })
    act(() => {
      composer.focus()
    })
    expect(document.activeElement).toBe(composer)

    rerender(
      <>
        <textarea aria-label="Task draft" />
        <div className="terminal-panel">{renderTerminalView()}</div>
      </>,
    )

    await flushTimer()

    expect(screen.getByRole("textbox", { name: "Task draft" })).toHaveFocus()
  })

  it("autofocuses the terminal when it opens from a terminal control", async () => {
    const { container, rerender } = render(
      <div className="canvas-terminal-toggle-anchor">
        <button type="button">Toggle terminal panel</button>
      </div>,
    )

    const toggle = screen.getByRole("button", { name: "Toggle terminal panel" })
    act(() => {
      toggle.focus()
    })
    expect(toggle).toHaveFocus()

    rerender(
      <>
        <div className="canvas-terminal-toggle-anchor">
          <button type="button">Toggle terminal panel</button>
        </div>
        <div className="terminal-panel">{renderTerminalView()}</div>
      </>,
    )

    await flushTimer()

    expect(container.querySelector(".terminal-xterm")).toHaveFocus()
  })
})
