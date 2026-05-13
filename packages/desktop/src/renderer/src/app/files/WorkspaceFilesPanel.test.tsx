import { render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it, vi } from "vitest"
import type { WorkspaceFileReviewState } from "../types"
import { WorkspaceFilesPanel } from "./WorkspaceFilesPanel"

function createFileReviewState(overrides: Partial<WorkspaceFileReviewState> = {}): WorkspaceFileReviewState {
  return {
    comments: [],
    errorMessage: null,
    linkedLineRange: null,
    pendingComment: null,
    query: "",
    results: [],
    scopeDirectory: "C:/workspace",
    selectedFileContent: null,
    selectedFileExtension: null,
    selectedFileKind: null,
    selectedFilePath: null,
    status: "idle",
    ...overrides,
  }
}

function renderWorkspaceFilesPanel(state: WorkspaceFileReviewState) {
  return render(
    <WorkspaceFilesPanel
      canInsertCommentsIntoDraft={true}
      scopeDirectory="C:/workspace"
      scopeName="Workspace"
      state={state}
      onPendingCommentCancel={vi.fn()}
      onPendingCommentChange={vi.fn()}
      onPendingCommentConfirm={vi.fn()}
      onPendingCommentStart={vi.fn()}
      onQueryChange={vi.fn()}
      onSelectFile={vi.fn()}
    />,
  )
}

function readRightSidebarStyles() {
  return readFileSync(resolve(process.cwd(), "src/renderer/src/styles/right-sidebar.css"), "utf8")
}

describe("WorkspaceFilesPanel", () => {
  it("renders selected text file lines in the reader", () => {
    renderWorkspaceFilesPanel(
      createFileReviewState({
        selectedFileContent: "const camera = { x: 0, y: 0 };\n\nfunction updateCamera() {\n  return camera.x;\n}",
        selectedFileExtension: ".js",
        selectedFileKind: "text",
        selectedFilePath: "src/camera.js",
        status: "ready",
      }),
    )

    expect(screen.getByText("src/camera.js")).toBeVisible()
    expect(screen.getByTestId("workspace-file-line-1")).toHaveTextContent("const camera = { x: 0, y: 0 };")
    expect(screen.getByTestId("workspace-file-line-4")).toHaveTextContent("return camera.x;")
  })

  it("highlights and scrolls to linked line ranges without opening a comment draft", () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    })

    renderWorkspaceFilesPanel(
      createFileReviewState({
        linkedLineRange: {
          startLineNumber: 2,
          endLineNumber: 3,
        },
        selectedFileContent: "const a = 1\nconst b = 2\nconst c = 3",
        selectedFileExtension: ".ts",
        selectedFileKind: "text",
        selectedFilePath: "src/linked.ts",
        status: "ready",
      }),
    )

    expect(screen.getByTestId("workspace-file-line-2")).toHaveClass("is-linked", "is-selected")
    expect(screen.getByTestId("workspace-file-line-3")).toHaveClass("is-linked", "is-selected")
    expect(screen.queryByRole("textbox", { name: "File comment on lines 2-3" })).not.toBeInTheDocument()
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "center",
      inline: "nearest",
    })
  })

  it("keeps file reader text on readable panel colors", () => {
    const styles = readRightSidebarStyles()

    expect(styles).toMatch(
      /\.workspace-files-panel\s*\{[^}]*height:\s*100%;[^}]*flex:\s*1 1 auto;[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\);[^}]*align-content:\s*stretch;/s,
    )
    expect(styles).toMatch(
      /\.right-sidebar-view-host\.is-preview,\s*\.right-sidebar-view-host\.is-files,\s*\.right-sidebar-view-host\.is-changes\s*\{[^}]*scrollbar-gutter:\s*auto;[^}]*padding-right:\s*0;/s,
    )
    expect(styles).toMatch(
      /\.workspace-files-reader\s*\{[^}]*height:\s*100%;[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\);/s,
    )
    expect(styles).toMatch(
      /\.workspace-files-search-shell\s*\{[^}]*padding:\s*0;[^}]*background:\s*var\(--seg-panel\);/s,
    )
    expect(styles).toMatch(
      /\.workspace-files-search-field input\s*\{[^}]*width:\s*100%;[^}]*border-right:\s*0;[^}]*border-left:\s*0;[^}]*border-radius:\s*0;/s,
    )
    expect(styles).toMatch(
      /\.workspace-files-results-dropdown\s*\{[^}]*top:\s*100%;[^}]*padding:\s*0;[^}]*border-radius:\s*0;[^}]*box-shadow:\s*none;/s,
    )
    expect(styles).toMatch(
      /\.workspace-files-results-dropdown \.workspace-files-result-row\s*\{[^}]*border:\s*0;[^}]*border-bottom:\s*1px solid var\(--seg-border\);[^}]*border-radius:\s*0;/s,
    )
    expect(styles).toMatch(
      /\.workspace-files-code\s*\{[^}]*background:\s*var\(--seg-panel\);[^}]*color:\s*var\(--seg-text-1\);/s,
    )
    expect(styles).toMatch(
      /\.workspace-files-line-content,\s*\.workspace-files-line-content code\s*\{[^}]*color:\s*var\(--seg-text-1\);/s,
    )
    expect(styles).not.toMatch(
      /\.workspace-files-line-content,\s*\.workspace-files-line-content code\s*\{[^}]*color:\s*var\(--text-on-dark\);/s,
    )
  })
})
