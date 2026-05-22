import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
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
    pluginOptions: [],
    pendingPermissionRequests: [],
    selectedMcpServerIDs: [],
    selectedMcpServerLabel: "MCP",
    onMcpServerToggle: vi.fn(),
    selectedPluginIDs: [],
    selectedPluginLabel: "Plugins",
    onPluginToggle: vi.fn(),
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

function setDesktopApi(api: Partial<NonNullable<typeof window.desktop>>) {
  Object.defineProperty(window, "desktop", {
    configurable: true,
    value: api,
  })
}

beforeEach(() => {
  setDesktopApi({})
})

describe("SessionCanvasTopMenu project skills", () => {
  const skillOptions = [
    {
      value: "skill-layout-review",
      label: "layout-review",
      description: "Review the current layout against the desktop shell spec.",
    },
    {
      value: "skill-code-review",
      label: "code-review",
      description: "Review code changes before sending them.",
    },
    {
      value: "skill-browser-use",
      label: "browser-use",
      description: "Automate browser checks for local targets.",
    },
  ]

  it("renders skill names only and keeps selected skills first", () => {
    const onSkillToggle = vi.fn()
    renderTopMenu({
      onSkillToggle,
      selectedSkillIDs: ["skill-code-review"],
      selectedSkillLabel: "code-review",
      skillOptions,
    })

    fireEvent.click(screen.getByRole("button", { name: "Select project skills: code-review" }))

    const menu = screen.getByRole("dialog", { name: "Project skill selection" })
    expect(within(menu).getByRole("searchbox", { name: "Search skills" })).toHaveFocus()

    const options = within(menu).getAllByRole("option")
    expect(options.map((option) => option.textContent)).toEqual(["code-review", "layout-review", "browser-use"])
    expect(options[0]).toHaveAttribute("aria-selected", "true")
    expect(within(menu).queryByText("Review code changes before sending them.")).not.toBeInTheDocument()
    expect(within(menu).queryByText("Selected")).not.toBeInTheDocument()
    expect(within(menu).queryByText("Add")).not.toBeInTheDocument()

    fireEvent.click(options[1]!)
    expect(onSkillToggle).toHaveBeenCalledWith("skill-layout-review")
  })

  it("filters skills by name while keeping selected matches first", () => {
    renderTopMenu({
      selectedSkillIDs: ["skill-code-review"],
      selectedSkillLabel: "code-review",
      skillOptions,
    })

    fireEvent.click(screen.getByRole("button", { name: "Select project skills: code-review" }))
    const menu = screen.getByRole("dialog", { name: "Project skill selection" })
    fireEvent.change(within(menu).getByRole("searchbox", { name: "Search skills" }), {
      target: { value: "review" },
    })

    expect(within(menu).getAllByRole("option").map((option) => option.textContent)).toEqual(["code-review", "layout-review"])
    expect(within(menu).queryByRole("option", { name: "browser-use" })).not.toBeInTheDocument()
  })
})

describe("SessionCanvasTopMenu project MCP servers", () => {
  const mcpOptions = [
    {
      value: "filesystem",
      label: "Filesystem",
      description: "Access project files.",
    },
    {
      value: "browser",
      label: "Browser",
      description: "Inspect local browser targets.",
    },
  ]

  it("renders compact MCP rows with descriptions exposed as titles", () => {
    const onMcpServerToggle = vi.fn()
    renderTopMenu({
      mcpOptions,
      onMcpServerToggle,
      selectedMcpServerIDs: ["filesystem"],
      selectedMcpServerLabel: "Filesystem",
    })

    fireEvent.click(screen.getByRole("button", { name: "Select project MCP servers: Filesystem" }))

    const menu = screen.getByRole("menu", { name: "Project MCP server selection" })
    const filesystemOption = within(menu).getByRole("menuitemcheckbox", { name: /Filesystem/ })
    expect(filesystemOption).toHaveAttribute("aria-checked", "true")
    expect(filesystemOption).toHaveAttribute("title", "Access project files.")
    expect(within(menu).queryByText("Access project files.")).not.toBeInTheDocument()

    fireEvent.click(within(menu).getByRole("menuitemcheckbox", { name: /Browser/ }))

    expect(onMcpServerToggle).toHaveBeenCalledWith("browser")
  })
})

describe("SessionCanvasTopMenu project plugins", () => {
  const pluginOptions = [
    {
      value: "build-web-apps",
      label: "Build Web Apps",
      description: "Frontend workflows - 1 MCP, 3 skills",
    },
    {
      value: "browser",
      label: "Browser",
      description: "Browser automation - 1 MCP",
    },
  ]

  it("renders installed plugin rows and toggles project plugin selection", () => {
    const onPluginToggle = vi.fn()
    renderTopMenu({
      onPluginToggle,
      pluginOptions,
      selectedPluginIDs: ["build-web-apps"],
      selectedPluginLabel: "Build Web Apps",
    })

    fireEvent.click(screen.getByRole("button", { name: "Select project plugins: Build Web Apps" }))

    const menu = screen.getByRole("menu", { name: "Project plugin selection" })
    const selectedOption = within(menu).getByRole("menuitemcheckbox", { name: /Build Web Apps/ })
    expect(selectedOption).toHaveAttribute("aria-checked", "true")
    expect(selectedOption).toHaveAttribute("title", "Frontend workflows - 1 MCP, 3 skills")

    fireEvent.click(within(menu).getByRole("menuitemcheckbox", { name: /Browser/ }))

    expect(onPluginToggle).toHaveBeenCalledWith("browser")
  })
})

describe("SessionCanvasTopMenu trace export", () => {
  it("copies safe trace JSON for the active session", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const getSessionTraceExport = vi.fn().mockResolvedValue({
      schemaVersion: 1,
      mode: "safe",
      session: {
        id: "session-1",
        missing: false,
      },
      messages: [],
      events: [],
      runtime: {},
      toolCalls: [],
      stats: {
        messageCount: 0,
        eventCount: 0,
        turnCount: 0,
        toolCallCount: 0,
        redactedCount: 0,
        truncatedCount: 0,
      },
      redaction: {
        enabled: true,
        maxStringLength: 20000,
        redactedKeyPattern: "token",
      },
    })
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText,
      },
    })
    setDesktopApi({ getSessionTraceExport })

    renderTopMenu()

    fireEvent.click(screen.getByRole("button", { name: "Export session trace" }))
    fireEvent.click(screen.getByRole("menuitem", { name: /Copy trace JSON/ }))

    await waitFor(() => {
      expect(getSessionTraceExport).toHaveBeenCalledWith({ sessionID: "session-1" })
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"schemaVersion": 1'))
    })
  })

  it("saves safe trace JSON and displays save status", async () => {
    const saveSessionTraceExport = vi.fn().mockResolvedValue({
      canceled: false,
      path: "C:\\Temp\\trace.json",
    })
    setDesktopApi({ saveSessionTraceExport })

    renderTopMenu()

    fireEvent.click(screen.getByRole("button", { name: "Export session trace" }))
    fireEvent.click(screen.getByRole("menuitem", { name: /Save trace JSON/ }))

    await waitFor(() => {
      expect(saveSessionTraceExport).toHaveBeenCalledWith({ sessionID: "session-1" })
      expect(screen.getByText("Trace JSON saved.")).toBeInTheDocument()
    })
  })

  it("does not show trace export actions without an active session", () => {
    renderTopMenu({ activeSession: null })

    expect(screen.queryByRole("button", { name: "Export session trace" })).not.toBeInTheDocument()
  })
})

describe("SessionCanvasTopMenu tool permission mode", () => {
  it("renders both permission modes and emits mode changes", () => {
    const onToolPermissionModeChange = vi.fn()
    renderTopMenu({ onToolPermissionModeChange })

    fireEvent.click(screen.getByRole("button", { name: "工具权限：默认权限" }))

    const menu = screen.getByRole("menu", { name: "工具权限模式选择" })
    expect(within(menu).getByText("默认权限")).toBeInTheDocument()
    expect(within(menu).getByText("完全访问权限")).toBeInTheDocument()
    expect(within(menu).queryByText("ask 进入审批，allow 直接执行，deny 拒绝。")).not.toBeInTheDocument()
    expect(within(menu).getByRole("menuitem", { name: /默认权限/ })).toHaveAttribute(
      "title",
      "ask 进入审批，allow 直接执行，deny 拒绝。",
    )

    fireEvent.click(within(menu).getByRole("menuitem", { name: /完全访问权限/ }))

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
    fireEvent.click(screen.getByRole("menuitem", { name: /完全访问权限/ }))

    expect(screen.getAllByRole("button", { name: "工具权限：完全访问权限" })).toHaveLength(2)
  })
})
