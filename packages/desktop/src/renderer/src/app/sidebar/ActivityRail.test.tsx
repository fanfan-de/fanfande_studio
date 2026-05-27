import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ActivityRail } from "./ActivityRail"

function renderActivityRail() {
  const props = {
    activeView: "workspace" as const,
    isSettingsOpen: false,
    isSidebarCollapsed: false,
    onOpenSettings: vi.fn(),
    onToggleSidebar: vi.fn(),
    onViewChange: vi.fn(),
    side: "left" as const,
  }

  return {
    ...render(<ActivityRail {...props} />),
    props,
  }
}

describe("ActivityRail", () => {
  it("keeps settings as the last control in the left rail footer", () => {
    const { props } = renderActivityRail()
    const rail = screen.getByLabelText("Primary navigation rail")
    const footer = rail.querySelector(".activity-rail-footer") as HTMLElement | null

    expect(footer).not.toBeNull()
    const settingsButton = within(footer!).getByRole("button", { name: "Open settings" })
    expect(footer!.lastElementChild).toBe(settingsButton)

    fireEvent.click(settingsButton)

    expect(props.onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it("uses disclosure icons for configuration shortcuts", () => {
    renderActivityRail()

    const collapsedToggle = screen.getByRole("button", { name: "Show configuration shortcuts" })
    expect(collapsedToggle.querySelector(".lucide-settings")).toBeNull()
    expect(collapsedToggle.querySelector(".lucide-chevron-right")).not.toBeNull()

    fireEvent.click(collapsedToggle)

    const expandedToggle = screen.getByRole("button", { name: "Hide configuration shortcuts" })
    expect(expandedToggle.querySelector(".lucide-settings")).toBeNull()
    expect(expandedToggle.querySelector(".lucide-chevron-down")).not.toBeNull()
  })

  it("collapses external capability shortcuts into one connections entry", () => {
    const { props } = renderActivityRail()

    fireEvent.click(screen.getByRole("button", { name: "Show configuration shortcuts" }))

    expect(screen.queryByRole("button", { name: "Open SSH" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Open MCP" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Open plugins" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Open connectors" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Open connections and extensions" }))

    expect(props.onViewChange).toHaveBeenCalledWith("connections")
  })
})
