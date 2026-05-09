import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { TerminalPanel } from "./TerminalPanel"
import type { TerminalSessionRecord } from "./types"

const baseSession: TerminalSessionRecord = {
  ptyID: "pty-1",
  sessionID: "session-1",
  title: "Terminal",
  cwd: "/tmp/project",
  shell: "/bin/zsh",
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

async function flushFrame() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve())
    })
  })
}

describe("TerminalPanel", () => {
  it("shows terminal creation errors and lets the user retry", () => {
    const onCreateTerminal = vi.fn()
    render(
      <TerminalPanel
        activeSession={null}
        brandTheme="terra"
        colorMode="light"
        creationError="node-pty spawn helper is not executable"
        isOpen={true}
        panelHeight={280}
        sessions={[]}
        onCloseTerminal={vi.fn()}
        onCreateTerminal={onCreateTerminal}
        onCreateTerminalForShellProfile={vi.fn()}
        onTerminalInitialDimensions={vi.fn()}
        onTerminalInitialDimensionsError={vi.fn()}
        onPanelHeightChange={vi.fn()}
        onShellProfileChange={vi.fn()}
        onSelectTerminal={vi.fn()}
        selectedShellProfileID="default"
        shellProfiles={[
          {
            id: "default",
            label: "Default",
            shell: null,
          },
        ]}
        onTerminalInput={vi.fn()}
        onTerminalResize={vi.fn()}
        onTerminalSnapshotChange={vi.fn()}
        onTogglePanel={vi.fn()}
        subscribeToTerminalStream={() => () => {}}
      />,
    )

    expect(screen.getByRole("alert")).toHaveTextContent("node-pty spawn helper is not executable")

    fireEvent.click(screen.getByRole("button", { name: "Retry" }))

    expect(onCreateTerminal).toHaveBeenCalledTimes(1)
  })

  it("renders the initial dimension probe while creating the first terminal", async () => {
    const onTerminalInitialDimensions = vi.fn()

    render(
      <TerminalPanel
        activeSession={null}
        brandTheme="terra"
        colorMode="light"
        isCreatingTerminal={true}
        isOpen={true}
        panelHeight={280}
        pendingCreateRequestID={4}
        sessions={[]}
        onCloseTerminal={vi.fn()}
        onCreateTerminal={vi.fn()}
        onCreateTerminalForShellProfile={vi.fn()}
        onTerminalInitialDimensions={onTerminalInitialDimensions}
        onTerminalInitialDimensionsError={vi.fn()}
        onPanelHeightChange={vi.fn()}
        onShellProfileChange={vi.fn()}
        onSelectTerminal={vi.fn()}
        selectedShellProfileID="default"
        shellProfiles={[
          {
            id: "default",
            label: "Default",
            shell: null,
          },
        ]}
        onTerminalInput={vi.fn()}
        onTerminalResize={vi.fn()}
        onTerminalSnapshotChange={vi.fn()}
        onTogglePanel={vi.fn()}
        subscribeToTerminalStream={() => () => {}}
      />,
    )

    expect(screen.queryByText("No terminal session is open.")).toBeNull()
    await waitFor(() => {
      expect(onTerminalInitialDimensions).toHaveBeenCalledWith(4, {
        rows: 24,
        cols: 80,
      })
    })
  })

  it("hides the create-terminal control when a session already exists", () => {
    render(
      <TerminalPanel
        activeSession={baseSession}
        brandTheme="terra"
        colorMode="light"
        isOpen={true}
        panelHeight={280}
        sessions={[baseSession]}
        onCloseTerminal={vi.fn()}
        onCreateTerminal={vi.fn()}
        onCreateTerminalForShellProfile={vi.fn()}
        onTerminalInitialDimensions={vi.fn()}
        onTerminalInitialDimensionsError={vi.fn()}
        onPanelHeightChange={vi.fn()}
        onShellProfileChange={vi.fn()}
        onSelectTerminal={vi.fn()}
        selectedShellProfileID="default"
        shellProfiles={[
          {
            id: "default",
            label: "Default",
            shell: null,
          },
        ]}
        onTerminalInput={vi.fn()}
        onTerminalResize={vi.fn()}
        onTerminalSnapshotChange={vi.fn()}
        onTogglePanel={vi.fn()}
        subscribeToTerminalStream={() => () => {}}
      />,
    )

    expect(screen.queryByRole("button", { name: /Create terminal/i })).toBeNull()
    expect(screen.getByRole("combobox", { name: "Terminal shell profile" })).toBeDisabled()
  })

  it("keeps resize preview local until pointerup commits the height", async () => {
    const onPanelHeightChange = vi.fn()
    const { container } = render(
      <TerminalPanel
        activeSession={null}
        brandTheme="terra"
        colorMode="light"
        isOpen={true}
        panelHeight={280}
        sessions={[]}
        onCloseTerminal={vi.fn()}
        onCreateTerminal={vi.fn()}
        onCreateTerminalForShellProfile={vi.fn()}
        onTerminalInitialDimensions={vi.fn()}
        onTerminalInitialDimensionsError={vi.fn()}
        onPanelHeightChange={onPanelHeightChange}
        onShellProfileChange={vi.fn()}
        onSelectTerminal={vi.fn()}
        selectedShellProfileID="default"
        shellProfiles={[
          {
            id: "default",
            label: "Default",
            shell: null,
          },
        ]}
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
