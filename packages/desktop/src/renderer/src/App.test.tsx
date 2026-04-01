import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { App } from "./App"

const styles = readFileSync(resolve(process.cwd(), "src/renderer/src/styles.css"), "utf8")

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
    const { container } = render(<App />)

    expect(screen.getByRole("button", { name: "File" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Minimize window" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Create session" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Project 2" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Chat 1" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Overview" })).toBeInTheDocument()
    await waitFor(() => {
      expect(container.querySelector(".canvas-header")).not.toBeInTheDocument()
      expect(container.querySelector(".signal-row")).not.toBeInTheDocument()
    })
    expect(screen.getByRole("textbox", { name: "Task draft" }).closest("footer")).toHaveClass("prompt-input-shell")
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

  it("toggles project tree expansion when clicking the same project", () => {
    render(<App />)

    const projectTwo = screen.getByRole("button", { name: "Project 2" })
    expect(projectTwo).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("button", { name: "Chat 1" })).toBeInTheDocument()

    fireEvent.click(projectTwo)

    expect(projectTwo).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("button", { name: "Chat 1" })).not.toBeInTheDocument()

    fireEvent.click(projectTwo)

    expect(projectTwo).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("button", { name: "Chat 1" })).toBeInTheDocument()
  })

  it("shows expand/collapse icon only while hovering a project row", () => {
    render(<App />)

    const projectTwo = screen.getByRole("button", { name: "Project 2" })
    const projectTwoLeading = screen.getByTestId("project-leading-project-2")
    const projectOne = screen.getByRole("button", { name: "Project 1" })
    const projectOneLeading = screen.getByTestId("project-leading-project-1")

    expect(projectTwoLeading).toHaveAttribute("data-icon", "folder")
    expect(projectOneLeading).toHaveAttribute("data-icon", "folder")

    fireEvent.mouseEnter(projectTwo)
    expect(projectTwoLeading).toHaveAttribute("data-icon", "expanded")

    fireEvent.mouseLeave(projectTwo)
    expect(projectTwoLeading).toHaveAttribute("data-icon", "folder")

    fireEvent.mouseEnter(projectOne)
    expect(projectOneLeading).toHaveAttribute("data-icon", "collapsed")

    fireEvent.mouseLeave(projectOne)
    expect(projectOneLeading).toHaveAttribute("data-icon", "folder")
  })

  it("keeps rounded corners only on the prompt input shell", () => {
    const nonZeroBorderRadii = Array.from(styles.matchAll(/border-radius:\s*([^;]+);/g))
      .map(([, value]) => value.trim())
      .filter((value) => !/^0(?:\s|$)/.test(value))

    expect(nonZeroBorderRadii).toEqual(["28px"])
    expect(styles).toMatch(/\.prompt-input-shell\s*\{[^}]*border-radius:\s*28px;/s)
  })
})
