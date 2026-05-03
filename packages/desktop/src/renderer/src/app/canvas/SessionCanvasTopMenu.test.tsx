import { fireEvent, render, screen, within } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import type { SessionSummary, ToolPermissionMode } from "../types"
import { SessionCanvasTopMenu } from "./SessionCanvasTopMenu"

const session: SessionSummary = {
  id: "session-1",
  title: "Main session",
  branch: "main",
  status: "Live",
  updated: 1,
  focus: "",
  summary: "",
}

function createTopMenuProps(
  overrides: Partial<Parameters<typeof SessionCanvasTopMenu>[0]> = {},
) {
  return {
    activeSession: session,
    gitProjectID: "project-1",
    gitDirectory: null,
    isSavingToolPermissionMode: false,
    mcpOptions: [],
    pendingPermissionRequests: [],
    selectedMcpServerIDs: [],
    selectedMcpServerLabel: "MCP",
    onMcpServerToggle: vi.fn(),
    toolPermissionMode: "default",
    toolPermissionModeError: null,
    onToolPermissionModeChange: vi.fn(),
    skillOptions: [],
    selectedSkillIDs: [],
    selectedSkillLabel: "Skills",
    onSkillToggle: vi.fn(),
    ...overrides,
  } satisfies Parameters<typeof SessionCanvasTopMenu>[0]
}

function renderTopMenu(
  overrides: Partial<Parameters<typeof SessionCanvasTopMenu>[0]> = {},
) {
  const props = createTopMenuProps(overrides)

  return {
    props,
    ...render(<SessionCanvasTopMenu {...props} />),
  }
}

describe("SessionCanvasTopMenu tool permission mode", () => {
  it("renders both permission modes and emits mode changes", () => {
    const onToolPermissionModeChange = vi.fn()
    renderTopMenu({ onToolPermissionModeChange })

    fireEvent.click(screen.getByRole("button", { name: "工具权限：默认权限" }))

    const menu = screen.getByRole("dialog", { name: "工具权限模式选择" })
    expect(within(menu).getByText("默认权限")).toBeInTheDocument()
    expect(within(menu).getByText("完全访问权限")).toBeInTheDocument()

    fireEvent.click(within(menu).getByRole("button", { name: /完全访问权限/ }))

    expect(onToolPermissionModeChange).toHaveBeenCalledWith("full_access")
  })

  it("disables the permission mode control while saving and exposes save errors", () => {
    renderTopMenu({
      isSavingToolPermissionMode: true,
      toolPermissionModeError: "Could not save mode",
    })

    const trigger = screen.getByRole("button", { name: "工具权限：默认权限" })
    expect(trigger).toBeDisabled()
    expect(trigger).toHaveAttribute("title", expect.stringContaining("Could not save mode"))
  })

  it("uses shared mode state across multiple session top menus", () => {
    function Harness() {
      const [mode, setMode] = useState<ToolPermissionMode>("default")

      return (
        <>
          <SessionCanvasTopMenu
            {...createTopMenuProps()}
            activeSession={{ ...session, id: "session-1", title: "Session 1" }}
            toolPermissionMode={mode}
            onToolPermissionModeChange={setMode}
          />
          <SessionCanvasTopMenu
            {...createTopMenuProps()}
            activeSession={{ ...session, id: "session-2", title: "Session 2" }}
            toolPermissionMode={mode}
            onToolPermissionModeChange={setMode}
          />
        </>
      )
    }

    render(<Harness />)

    expect(screen.getAllByRole("button", { name: "工具权限：默认权限" })).toHaveLength(2)
    fireEvent.click(screen.getAllByRole("button", { name: "工具权限：默认权限" })[0]!)
    fireEvent.click(screen.getByRole("button", { name: /完全访问权限/ }))

    expect(screen.getAllByRole("button", { name: "工具权限：完全访问权限" })).toHaveLength(2)
  })
})
