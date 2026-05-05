import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { BuiltinToolSummary } from "../types"
import { BuiltinToolsPage } from "./BuiltinToolsPage"

const builtinTools: BuiltinToolSummary[] = [
  {
    id: "git_bash_command",
    title: "Git Bash",
    description: "Run a Git Bash/MSYS Bash command inside the current project boundary.",
    aliases: [],
    capabilities: {
      kind: "exec",
      readOnly: false,
      destructive: true,
      concurrency: "exclusive",
      needsShell: true,
    },
    enabled: true,
  },
  {
    id: "read-file",
    title: "Read File",
    description: "Read a text file or a line range from the current project.",
    aliases: ["read_file"],
    capabilities: {
      kind: "read",
      readOnly: true,
      destructive: false,
      concurrency: "safe",
    },
    enabled: false,
  },
  {
    id: "apply_patch",
    title: "Apply Patch",
    description: "Use for structured Git-style unified diffs.",
    aliases: ["apply-patch"],
    capabilities: {
      kind: "write",
      readOnly: false,
      destructive: true,
      concurrency: "exclusive",
    },
    enabled: false,
  },
]

function renderBuiltinToolsPage(overrides: Partial<Parameters<typeof BuiltinToolsPage>[0]> = {}) {
  const props: Parameters<typeof BuiltinToolsPage>[0] = {
    builtinTools,
    builtinToolsError: null,
    isBuiltinToolSelectionDirty: true,
    isLoadingBuiltinTools: false,
    isSavingBuiltinTools: false,
    message: null,
    onBuiltinToolToggle: vi.fn(),
    onDismissMessage: vi.fn(),
    onResetBuiltinTools: vi.fn(),
    onSaveBuiltinTools: vi.fn(),
    ...overrides,
  }

  render(<BuiltinToolsPage {...props} />)
  return props
}

describe("BuiltinToolsPage", () => {
  it("renders built-in tools, toggles selection, saves, and resets", () => {
    const props = renderBuiltinToolsPage()

    expect(screen.getByLabelText("Tools top menu")).toBeInTheDocument()
    expect(screen.getByText("Global tool availability")).toBeInTheDocument()
    expect(screen.getByText("1 of 3 built-in tools enabled.")).toBeInTheDocument()
    expect(screen.getByRole("list", { name: "Tool categories" })).toBeInTheDocument()

    const shellCategory = screen.getByRole("button", { name: "Shell tools, 1 of 1 enabled" })
    expect(shellCategory).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Write tools, 0 of 1 enabled" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Read tools, 0 of 1 enabled" })).toBeInTheDocument()
    expect(screen.getByText("Git Bash")).toBeInTheDocument()
    expect(screen.getByText("Shell access")).toBeInTheDocument()
    expect(screen.queryByText("Run a Git Bash/MSYS Bash command inside the current project boundary.")).not.toBeInTheDocument()
    expect(screen.queryByText("Read File")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Show details for Git Bash" }))
    expect(screen.getByText("Run a Git Bash/MSYS Bash command inside the current project boundary.")).toBeInTheDocument()
    expect(screen.getByText("Concurrency")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Hide details for Git Bash" })).toHaveAttribute("aria-expanded", "true")

    fireEvent.click(screen.getByRole("button", { name: "Write tools, 0 of 1 enabled" }))
    expect(screen.getByText("Apply Patch")).toBeInTheDocument()
    expect(screen.getByText("High risk")).toBeInTheDocument()
    expect(screen.getByText("1 aliases")).toBeInTheDocument()
    expect(screen.queryByText("Git Bash")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Enable Apply Patch" }))
    expect(props.onBuiltinToolToggle).toHaveBeenCalledWith("apply_patch", true)

    fireEvent.click(screen.getByRole("button", { name: "Read tools, 0 of 1 enabled" }))
    expect(screen.getByText("Read File")).toBeInTheDocument()
    expect(screen.getByText("Read-only")).toBeInTheDocument()

    fireEvent.click(shellCategory)
    fireEvent.click(screen.getByRole("button", { name: "Disable Git Bash" }))
    expect(props.onBuiltinToolToggle).toHaveBeenCalledWith("git_bash_command", false)

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))
    expect(props.onSaveBuiltinTools).toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Reset to default" }))
    expect(props.onResetBuiltinTools).toHaveBeenCalled()
  })

  it("renders message, load error, loading, and empty states", () => {
    const onDismissMessage = vi.fn()
    const { rerender } = render(
      <BuiltinToolsPage
        builtinTools={[]}
        builtinToolsError="Unable to read tools."
        isBuiltinToolSelectionDirty={false}
        isLoadingBuiltinTools={false}
        isSavingBuiltinTools={false}
        message={{ tone: "success", text: "Built-in tool settings saved." }}
        onBuiltinToolToggle={vi.fn()}
        onDismissMessage={onDismissMessage}
        onResetBuiltinTools={vi.fn()}
        onSaveBuiltinTools={vi.fn()}
      />,
    )

    expect(screen.getByText("Built-in tool settings saved.")).toBeInTheDocument()
    expect(screen.getByText("Unable to read tools.")).toBeInTheDocument()
    expect(screen.getByText("No built-in tools")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Dismiss settings message" }))
    expect(onDismissMessage).toHaveBeenCalledTimes(1)

    rerender(
      <BuiltinToolsPage
        builtinTools={[]}
        builtinToolsError={null}
        isBuiltinToolSelectionDirty={false}
        isLoadingBuiltinTools
        isSavingBuiltinTools={false}
        message={null}
        onBuiltinToolToggle={vi.fn()}
        onDismissMessage={vi.fn()}
        onResetBuiltinTools={vi.fn()}
        onSaveBuiltinTools={vi.fn()}
      />,
    )

    expect(screen.getByText("Fetching built-in tools")).toBeInTheDocument()
  })
})
