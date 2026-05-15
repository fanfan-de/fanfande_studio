import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ComponentProps } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { WorkspacePreviewState } from "../types"
import { DEFAULT_WORKSPACE_PREVIEW_STATE } from "../agent-workspace/review-preview-state"
import { getPreviewFailure, PreviewPanel } from "./PreviewPanel"

const originalUserAgent = window.navigator.userAgent

const emptyPreviewState: WorkspacePreviewState = {
  ...DEFAULT_WORKSPACE_PREVIEW_STATE,
  comments: [],
  committedUrl: null,
  draftUrl: "http://localhost:3000",
  draftTarget: "http://localhost:3000",
  errorKind: null,
  errorMessage: null,
  mode: "browse",
  navigationHistory: [],
  navigationIndex: -1,
  reloadToken: 0,
}

function renderPreviewPanel(overrides: Partial<ComponentProps<typeof PreviewPanel>> = {}) {
  return render(
    <PreviewPanel
      state={emptyPreviewState}
      onAddComment={vi.fn()}
      onBack={vi.fn()}
      onDraftUrlChange={vi.fn()}
      onForward={vi.fn()}
      onModeChange={vi.fn()}
      onOpen={vi.fn()}
      onOpenExternal={vi.fn()}
      onOpenUrl={vi.fn()}
      onReload={vi.fn()}
      {...overrides}
    />,
  )
}

describe("PreviewPanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value: originalUserAgent,
    })
  })

  it("shows centered empty-state quick links and detected local services", async () => {
    const onOpenUrl = vi.fn()
    const detectLocalPreviewServices = vi.fn().mockResolvedValue([
      {
        port: 5173,
        statusCode: 200,
        url: "http://localhost:5173/",
      },
    ])
    vi.stubGlobal("desktop", { detectLocalPreviewServices })

    renderPreviewPanel({ onOpenUrl })

    expect(screen.getByRole("heading", { name: "No preview loaded" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "localhost:8080" }))
    expect(onOpenUrl).toHaveBeenCalledWith("http://localhost:8080")

    await waitFor(() => expect(detectLocalPreviewServices).toHaveBeenCalledTimes(1))
    const detectedServiceButton = screen.getByText("localhost:5173/").closest("button")
    expect(detectedServiceButton).not.toBeNull()
    fireEvent.click(detectedServiceButton!)
    expect(onOpenUrl).toHaveBeenCalledWith("http://localhost:5173/")
  })

  it("maps Electron preview load failures to specific error kinds", () => {
    expect(getPreviewFailure("ERR_CONNECTION_REFUSED", -102)).toMatchObject({
      kind: "connection-refused",
    })
    expect(getPreviewFailure("ERR_EMPTY_RESPONSE", -324)).toMatchObject({
      kind: "connection-reset",
    })
    expect(getPreviewFailure("ERR_NAME_NOT_RESOLVED", -105)).toMatchObject({
      kind: "dns",
    })
    expect(getPreviewFailure("ERR_BLOCKED_BY_RESPONSE", -27)).toMatchObject({
      kind: "embedded-blocked",
    })
    expect(getPreviewFailure("ERR_CERT_AUTHORITY_INVALID")).toMatchObject({
      kind: "certificate",
    })
  })

  it("shows a visible error state instead of the failed webview surface", async () => {
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value: "Electron",
    })
    vi.stubGlobal("desktop", {
      detectLocalPreviewServices: vi.fn(),
      previewGuestPreloadPath: "file:///C:/preview-webview.js",
    })

    const { container } = renderPreviewPanel({
      state: {
        ...emptyPreviewState,
        committedUrl: "http://localhost:3000/",
        draftUrl: "http://localhost:3000/",
        navigationHistory: ["http://localhost:3000/"],
        navigationIndex: 0,
      },
    })
    const webview = container.querySelector("webview")
    expect(webview).not.toBeNull()

    const failedLoad = new Event("did-fail-load") as Event & {
      errorCode: number
      errorDescription: string
      isMainFrame: boolean
    }
    Object.defineProperties(failedLoad, {
      errorCode: { value: -102 },
      errorDescription: { value: "ERR_CONNECTION_REFUSED" },
      isMainFrame: { value: true },
    })

    fireEvent(webview!, failedLoad)
    fireEvent(webview!, new Event("dom-ready"))

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to access this preview")
    expect(screen.getByText("ERR_CONNECTION_REFUSED")).toBeInTheDocument()
    expect(container.querySelector("webview")).toBeNull()
  })

  it("does not draw saved comment number markers over the preview page", () => {
    const { container } = renderPreviewPanel({
      state: {
        ...emptyPreviewState,
        comments: [
          {
            createdAt: 1,
            frame: "iframe",
            id: "preview-comment-1",
            nodePosition: "50%, 50%",
            pageUrl: "http://localhost:3000/",
            text: "Adjust this spacing",
            url: "http://localhost:3000/",
            x: 50,
            y: 50,
          },
        ],
        committedUrl: "http://localhost:3000/",
      },
    })

    expect(container.querySelector(".preview-markers-layer")).toBeNull()
    expect(container.querySelector(".preview-comment-marker")).toBeNull()
  })
})
