import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { App } from "./App"

describe("App", () => {
  beforeEach(() => {
    window.desktop = {
      platform: "win32",
      versions: {
        node: "22.0.0",
        chrome: "130.0.0",
        electron: "39.0.0",
      } as NodeJS.ProcessVersions,
      getInfo: vi.fn().mockResolvedValue({
        platform: "win32",
        node: "22.0.0",
        chrome: "130.0.0",
        electron: "39.0.0",
      }),
      getWindowState: vi.fn().mockResolvedValue({
        isMaximized: false,
      }),
      showMenu: vi.fn().mockResolvedValue(undefined),
      windowAction: vi.fn().mockResolvedValue(undefined),
      onWindowStateChange: vi.fn(() => vi.fn()),
    }
  })

  it("renders the custom desktop titlebar and workspace", async () => {
    render(<App />)

    expect(screen.getByRole("heading", { name: "AI Agent Workspace" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "File" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Minimize window" })).toBeInTheDocument()
    expect(await screen.findByText("win32")).toBeInTheDocument()
  })

  it("applies maximized window styling when the window starts maximized", async () => {
    window.desktop!.getWindowState = vi.fn().mockResolvedValue({
      isMaximized: true,
    })

    const { container } = render(<App />)

    await waitFor(() => {
      expect(container.firstChild).toHaveClass("window-shell", "is-maximized")
    })
  })

  it("appends a prompt and clears the draft input", async () => {
    render(<App />)

    fireEvent.change(screen.getByRole("textbox", { name: "Task draft" }), {
      target: {
        value: "Ship custom titlebar",
      },
    })
    fireEvent.click(screen.getByRole("button", { name: "Send task" }))

    await waitFor(() => {
      expect(screen.getAllByText("Ship custom titlebar").length).toBeGreaterThan(0)
      expect(screen.getByRole("textbox", { name: "Task draft" })).toHaveValue("")
    })
  })
})
