import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { SessionSummary } from "../types"
import { CanvasRegionTopMenu } from "./CanvasRegionTopMenu"

function createSession(id: string, title: string): SessionSummary {
  return {
    id,
    title,
    branch: "main",
    status: "Live",
    updated: 1,
    focus: "",
    summary: "",
  }
}

function renderTopMenu(overrides: Partial<Parameters<typeof CanvasRegionTopMenu>[0]> = {}) {
  const props = {
    activeSessionID: "session-alpha",
    activeCreateSessionTabID: null,
    createSessionTabs: [],
    sessions: [
      createSession("session-alpha", "Alpha"),
      createSession("session-beta", "Beta"),
      createSession("session-gamma", "Gamma"),
    ],
    workspaces: [],
    showLeftSidebarToggleButton: true,
    isRightSidebarCollapsed: false,
    onAddCreateSessionTab: vi.fn(),
    onCloseCreateSessionTab: vi.fn(),
    onSelectCreateSessionTab: vi.fn(),
    onSessionClose: vi.fn(),
    onSessionSelect: vi.fn(),
    onToggleLeftSidebar: vi.fn(),
    onToggleRightSidebar: vi.fn(),
    ...overrides,
  } satisfies Parameters<typeof CanvasRegionTopMenu>[0]

  return {
    props,
    ...render(<CanvasRegionTopMenu {...props} />),
  }
}

describe("CanvasRegionTopMenu tab separators", () => {
  it("renders aria-hidden separators as inline slots between adjacent tabs without blocking tab clicks", () => {
    const onSessionSelect = vi.fn()
    const { container } = renderTopMenu({ onSessionSelect })

    const separators = Array.from(container.querySelectorAll<HTMLElement>(".canvas-region-top-menu-tab-separator"))
    expect(separators).toHaveLength(2)
    expect(separators.every((separator) => separator.getAttribute("aria-hidden") === "true")).toBe(true)
    expect(separators.every((separator) => separator.style.left === "")).toBe(true)

    fireEvent.click(screen.getByRole("button", { name: "Switch to session Beta" }))
    expect(onSessionSelect).toHaveBeenCalledWith("session-beta")
  })

  it("does not render a trailing separator after the last tab", () => {
    const { container } = renderTopMenu({
      createSessionTabs: [
        {
          id: "create-one",
          title: "",
          workspaceID: null,
        },
      ],
    })

    const tabs = container.querySelectorAll(".session-tab")
    const separators = container.querySelectorAll(".canvas-region-top-menu-tab-separator")
    expect(tabs).toHaveLength(4)
    expect(separators).toHaveLength(3)
  })
})
