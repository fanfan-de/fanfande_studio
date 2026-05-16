import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ComponentProps } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_WORKSPACE_PREVIEW_STATE } from "../agent-workspace/review-preview-state"
import type { WorkspacePreviewState } from "../types"
import { UnifiedPreviewPanel } from "./UnifiedPreviewPanel"

const workspaceRoot = "C:\\Projects\\Project 2"

function createPreviewState(overrides: Partial<WorkspacePreviewState> = {}): WorkspacePreviewState {
  return {
    ...DEFAULT_WORKSPACE_PREVIEW_STATE,
    ...overrides,
  }
}

function renderUnifiedPreviewPanel(overrides: Partial<ComponentProps<typeof UnifiedPreviewPanel>> = {}) {
  return render(
    <UnifiedPreviewPanel
      state={createPreviewState()}
      workspaceRoot={workspaceRoot}
      onDraftUrlChange={vi.fn()}
      onOpen={vi.fn()}
      onOpenExternal={vi.fn()}
      onOpenUrl={vi.fn()}
      onReload={vi.fn()}
      {...overrides}
    />,
  )
}

describe("UnifiedPreviewPanel", () => {
  beforeEach(() => {
    window.desktop = {
      detectLocalPreviewServices: vi.fn().mockResolvedValue([]),
      readPreviewText: vi.fn().mockResolvedValue({
        content: "",
        path: `${workspaceRoot}\\README.md`,
      }),
    } as unknown as Window["desktop"]
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("renders the empty state and opens quick localhost targets", () => {
    const onOpenUrl = vi.fn()
    renderUnifiedPreviewPanel({ onOpenUrl })

    expect(screen.getByRole("heading", { name: "Open a preview target" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "http://localhost:5173" }))

    expect(onOpenUrl).toHaveBeenCalledWith("http://localhost:5173")
  })

  it("reads and renders markdown artifact previews", async () => {
    window.desktop!.readPreviewText = vi.fn().mockResolvedValue({
      content: "# Report\n\nArtifact body.",
      path: `${workspaceRoot}\\artifacts\\report-1\\report.md`,
    })

    renderUnifiedPreviewPanel({
      state: createPreviewState({
        activeTargetInput: "agent://artifact/report-1",
        draftTarget: "agent://artifact/report-1",
        resolvedTarget: {
          artifactID: "report-1",
          artifactType: "markdown",
          entry: `${workspaceRoot}\\artifacts\\report-1\\report.md`,
          externalOpenTarget: {
            kind: "path",
            value: `${workspaceRoot}\\artifacts\\report-1\\report.md`,
          },
          input: "agent://artifact/report-1",
          kind: "artifact",
          mime: "text/markdown; charset=utf-8",
          normalizedInput: "agent://artifact/report-1",
          path: `${workspaceRoot}\\artifacts\\report-1\\report.md`,
          renderer: "markdown-preview",
          textReadable: true,
          title: "Report",
          workspaceRoot,
        },
        status: "ready",
      }),
    })

    await waitFor(() => {
      expect(window.desktop!.readPreviewText).toHaveBeenCalledWith({
        path: `${workspaceRoot}\\artifacts\\report-1\\report.md`,
        workspaceRoot,
      })
    })
    expect(await screen.findByRole("heading", { name: "Report" })).toBeInTheDocument()
    expect(screen.getByText("Artifact body.")).toBeInTheDocument()
  })

  it("renders HTML targets in a sandboxed frame", async () => {
    renderUnifiedPreviewPanel({
      state: createPreviewState({
        activeTargetInput: "agent://artifact/html-1",
        draftTarget: "agent://artifact/html-1",
        resolvedTarget: {
          artifactID: "html-1",
          entry: `${workspaceRoot}\\artifacts\\html-1\\index.html`,
          externalOpenTarget: {
            kind: "path",
            value: `${workspaceRoot}\\artifacts\\html-1\\index.html`,
          },
          input: "agent://artifact/html-1",
          kind: "artifact",
          mime: "text/html; charset=utf-8",
          normalizedInput: "agent://artifact/html-1",
          path: `${workspaceRoot}\\artifacts\\html-1\\index.html`,
          renderer: "html-preview",
          safePreviewUrl: "fanfande-preview://preview/token/index.html",
          textReadable: false,
          title: "index.html",
          workspaceRoot,
        },
        status: "ready",
      }),
    })

    const frame = await screen.findByTitle("Preview of index.html")
    expect(frame).toHaveAttribute("sandbox", "allow-forms allow-popups allow-same-origin allow-scripts")
    expect(frame).toHaveAttribute("src", "fanfande-preview://preview/token/index.html")
  })

  it("keeps file preview identity on one non-duplicated header line", () => {
    const { container } = renderUnifiedPreviewPanel({
      state: createPreviewState({
        activeTargetInput: "heroes.csv",
        draftTarget: "heroes.csv",
        resolvedTarget: {
          entry: `${workspaceRoot}\\heroes.csv`,
          externalOpenTarget: {
            kind: "path",
            value: `${workspaceRoot}\\heroes.csv`,
          },
          input: "heroes.csv",
          kind: "file",
          mime: "text/csv",
          normalizedInput: "heroes.csv",
          path: `${workspaceRoot}\\heroes.csv`,
          renderer: "table-preview",
          textReadable: true,
          title: "heroes.csv",
          workspaceRoot,
        },
        status: "ready",
      }),
    })

    const toolbar = screen.getByRole("textbox", { name: "Preview target" }).closest(".unified-preview-toolbar")
    expect(toolbar).not.toBeNull()
    expect(container.querySelector(".unified-preview-title-row")).toBeNull()
    expect(screen.getAllByDisplayValue("heroes.csv")).toHaveLength(1)
    expect(within(toolbar as HTMLElement).getByText("CSV")).toBeInTheDocument()
    expect(within(toolbar as HTMLElement).getByText("file")).toBeInTheDocument()
    expect(within(toolbar as HTMLElement).getByText("text/csv")).toBeInTheDocument()
  })

  it("shows the system-open fallback and delegates external opening", () => {
    const onOpenExternal = vi.fn()
    renderUnifiedPreviewPanel({
      onOpenExternal,
      state: createPreviewState({
        activeTargetInput: "archive.zip",
        draftTarget: "archive.zip",
        resolvedTarget: {
          entry: `${workspaceRoot}\\archive.zip`,
          externalOpenTarget: {
            kind: "path",
            value: `${workspaceRoot}\\archive.zip`,
          },
          input: "archive.zip",
          kind: "file",
          mime: "application/octet-stream",
          normalizedInput: "archive.zip",
          path: `${workspaceRoot}\\archive.zip`,
          renderer: "system-open",
          textReadable: false,
          title: "archive.zip",
          workspaceRoot,
        },
        status: "ready",
      }),
    })

    const fallback = screen.getByText("No inline renderer").closest(".unified-preview-message")
    expect(fallback).not.toBeNull()
    fireEvent.click(within(fallback as HTMLElement).getByRole("button", { name: "Open externally" }))

    expect(onOpenExternal).toHaveBeenCalledTimes(1)
  })
})
