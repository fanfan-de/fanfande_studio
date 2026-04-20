import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react"
import type { PreviewComment, PreviewMode, WorkspacePreviewState } from "../types"
import { clamp, formatTime } from "../utils"

interface PendingPreviewComment {
  x: number
  y: number
  anchor?: PreviewComment["anchor"]
}

interface PreviewPanelProps {
  canInsertCommentsIntoDraft: boolean
  state: WorkspacePreviewState
  workspaceDirectory: string | null
  workspaceName: string | null
  onAddComment: (input: { x: number; y: number; text: string; anchor?: PreviewComment["anchor"] }) => void
  onDeleteComment: (commentID: string) => void
  onDraftUrlChange: (value: string) => void
  onInsertCommentsIntoDraft: () => void
  onModeChange: (mode: PreviewMode) => void
  onOpen: () => void
  onOpenExternal: () => void | Promise<void>
  onReload: () => void
}

interface WebviewElement extends HTMLElement {
  reload?: () => void
  send?: (channel: string, payload?: unknown) => void
}

type WebviewIpcMessageEvent = Event & {
  args: unknown[]
  channel: string
}

type WebviewNavigationEvent = Event & {
  url?: string
}

type WebviewFailLoadEvent = Event & {
  errorCode?: number
  errorDescription?: string
  isMainFrame?: boolean
}

type WebviewPageTitleUpdatedEvent = Event & {
  title?: string
}

function PreviewModeButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={active ? "preview-mode-button is-active" : "preview-mode-button"}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function formatAnchorLabel(comment: PreviewComment) {
  if (comment.anchor?.label) return comment.anchor.label
  return `${Math.round(comment.x)}%, ${Math.round(comment.y)}%`
}

function getPreviewFailureMessage(errorDescription?: string) {
  const message = (errorDescription ?? "").trim()
  if (/ERR_BLOCKED_BY_RESPONSE/i.test(message)) {
    return "This page does not allow being shown inside the preview window."
  }
  if (/ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET/i.test(message)) {
    return "The preview URL could not be reached."
  }
  return "This page could not be opened inside the preview window."
}

export function PreviewPanel({
  canInsertCommentsIntoDraft,
  state,
  workspaceDirectory,
  workspaceName,
  onAddComment,
  onDeleteComment,
  onDraftUrlChange,
  onInsertCommentsIntoDraft,
  onModeChange,
  onOpen,
  onOpenExternal,
  onReload,
}: PreviewPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const webviewRef = useRef<WebviewElement | null>(null)
  const previewGuestPreloadPath = window.desktop?.previewGuestPreloadPath
  const canUseWebview = useMemo(
    () =>
      /Electron/i.test(globalThis.navigator?.userAgent ?? "") &&
      typeof previewGuestPreloadPath === "string" &&
      previewGuestPreloadPath.startsWith("file:"),
    [previewGuestPreloadPath],
  )
  const [isLoading, setIsLoading] = useState(false)
  const [isWebviewReady, setIsWebviewReady] = useState(false)
  const [forceIframeFallback, setForceIframeFallback] = useState(false)
  const [pendingComment, setPendingComment] = useState<PendingPreviewComment | null>(null)
  const [pendingText, setPendingText] = useState("")
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [pageTitle, setPageTitle] = useState<string | null>(null)
  const shouldUseWebview = canUseWebview && !forceIframeFallback
  const currentComments = state.committedUrl
    ? state.comments.filter((comment) => comment.url === state.committedUrl)
    : []
  const helperCopy = state.mode === "comment"
    ? "Click an element to capture a targeted comment. The page auto-fits to stay fully visible and links remain disabled."
    : "This preview auto-fits to keep the full page visible. Links stay disabled so the page context remains stable."

  useEffect(() => {
    if (!state.committedUrl) {
      setIsLoading(false)
      setIsWebviewReady(false)
      setForceIframeFallback(false)
      setPendingComment(null)
      setPendingText("")
      setStatusMessage(null)
      setPageTitle(null)
      return
    }

    setIsLoading(true)
    setIsWebviewReady(false)
    setForceIframeFallback(false)
    setStatusMessage(null)
    setPendingComment(null)
    setPendingText("")
  }, [state.committedUrl, state.reloadToken])

  useEffect(() => {
    if (!shouldUseWebview || !state.committedUrl) return

    const activeWebview = webviewRef.current
    if (!activeWebview) return
    const readyWebview: WebviewElement = activeWebview

    function handleDomReady() {
      setIsWebviewReady(true)
      setStatusMessage(null)
      setIsLoading(false)
      try {
        readyWebview.send?.("preview:set-mode", { mode: state.mode })
      } catch (error) {
        console.error("[preview] failed to sync mode after webview dom-ready", error)
      }
    }

    function handleDidStartLoading() {
      setIsLoading(true)
    }

    function handleDidStopLoading() {
      setIsLoading(false)
    }

    function handleWillNavigate(rawEvent: Event) {
      const event = rawEvent as WebviewNavigationEvent
      event.preventDefault?.()
      setStatusMessage("Links are disabled in preview mode.")
    }

    function handlePageTitleUpdated(rawEvent: Event) {
      const event = rawEvent as WebviewPageTitleUpdatedEvent
      setPageTitle(event.title ?? null)
    }

    function handleDidFailLoad(rawEvent: Event) {
      const event = rawEvent as WebviewFailLoadEvent
      if (event.isMainFrame === false) return
      setIsLoading(false)
      setStatusMessage(getPreviewFailureMessage(event.errorDescription))
    }

    function handleIpcMessage(rawEvent: Event) {
      const event = rawEvent as WebviewIpcMessageEvent
      const payload = event.args[0] as Record<string, unknown> | undefined

      switch (event.channel) {
        case "preview:page-meta":
          setPageTitle(typeof payload?.title === "string" ? payload.title : null)
          return
        case "preview:ready":
          setIsWebviewReady(true)
          try {
            readyWebview.send?.("preview:set-mode", { mode: state.mode })
          } catch (error) {
            console.error("[preview] failed to sync mode after preview ready", error)
          }
          return
        case "preview:navigation-blocked":
          setStatusMessage("Links are disabled in preview mode.")
          return
        case "preview:error":
          if (typeof payload?.message === "string" && payload.message.trim()) {
            setStatusMessage(`Preview script error: ${payload.message}`)
          }
          return
        case "preview:comment-target":
          setPendingComment({
            x: typeof payload?.x === "number" ? payload.x : 50,
            y: typeof payload?.y === "number" ? payload.y : 50,
            anchor: payload?.anchor as PreviewComment["anchor"] | undefined,
          })
          setPendingText("")
          return
      }
    }

    readyWebview.addEventListener("dom-ready", handleDomReady as EventListener)
    readyWebview.addEventListener("did-start-loading", handleDidStartLoading as EventListener)
    readyWebview.addEventListener("did-stop-loading", handleDidStopLoading as EventListener)
    readyWebview.addEventListener("did-fail-load", handleDidFailLoad as EventListener)
    readyWebview.addEventListener("page-title-updated", handlePageTitleUpdated as EventListener)
    readyWebview.addEventListener("will-navigate", handleWillNavigate as EventListener)
    readyWebview.addEventListener("new-window", handleWillNavigate as EventListener)
    readyWebview.addEventListener("ipc-message", handleIpcMessage as EventListener)

    return () => {
      readyWebview.removeEventListener("dom-ready", handleDomReady as EventListener)
      readyWebview.removeEventListener("did-start-loading", handleDidStartLoading as EventListener)
      readyWebview.removeEventListener("did-stop-loading", handleDidStopLoading as EventListener)
      readyWebview.removeEventListener("did-fail-load", handleDidFailLoad as EventListener)
      readyWebview.removeEventListener("page-title-updated", handlePageTitleUpdated as EventListener)
      readyWebview.removeEventListener("will-navigate", handleWillNavigate as EventListener)
      readyWebview.removeEventListener("new-window", handleWillNavigate as EventListener)
      readyWebview.removeEventListener("ipc-message", handleIpcMessage as EventListener)
    }
  }, [shouldUseWebview, state.committedUrl, state.mode, state.reloadToken])

  useEffect(() => {
    if (!shouldUseWebview || !state.committedUrl || !isWebviewReady) return

    try {
      webviewRef.current?.send?.("preview:set-mode", { mode: state.mode })
    } catch (error) {
      console.error("[preview] failed to sync mode", error)
    }
  }, [shouldUseWebview, isWebviewReady, state.committedUrl, state.mode])

  useEffect(() => {
    if (!canUseWebview || forceIframeFallback || !state.committedUrl || isWebviewReady) return

    const timer = globalThis.setTimeout(() => {
      setForceIframeFallback(true)
      setIsLoading(false)
      setStatusMessage("The embedded webview did not initialize. Falling back to iframe mode.")
    }, 2500)

    return () => {
      globalThis.clearTimeout(timer)
    }
  }, [canUseWebview, forceIframeFallback, isWebviewReady, state.committedUrl, state.reloadToken])

  function handleOverlayClick(event: MouseEvent<HTMLDivElement>) {
    if (shouldUseWebview || state.mode !== "comment" || !state.committedUrl) return

    const bounds = event.currentTarget.getBoundingClientRect()
    const x = clamp(((event.clientX - bounds.left) / Math.max(bounds.width, 1)) * 100, 0, 100)
    const y = clamp(((event.clientY - bounds.top) / Math.max(bounds.height, 1)) * 100, 0, 100)

    setPendingComment({
      x,
      y,
      anchor: {
        type: "coordinate",
      },
    })
    setPendingText("")
  }

  function handlePendingCommentSave() {
    if (!pendingComment) return
    const text = pendingText.trim()
    if (!text) return
    onAddComment({
      ...pendingComment,
      text,
    })
    setPendingComment(null)
    setPendingText("")
  }

  function handlePendingCommentCancel() {
    setPendingComment(null)
    setPendingText("")
  }

  return (
    <section className="right-sidebar-section preview-panel-section">
      <div className="preview-panel-main">
        <div className="preview-panel-controls">
          <div className="right-sidebar-panel-header">
            <div className="right-sidebar-panel-copy">
              <span className="label">Preview</span>
              <h3>In-app browser</h3>
              {workspaceDirectory ? (
                <p className="right-sidebar-scope">
                  Scope:
                  {" "}
                  <code>{workspaceDirectory}</code>
                </p>
              ) : workspaceName ? (
                <p className="right-sidebar-scope">{workspaceName}</p>
              ) : null}
            </div>
          </div>

          <form
            className="preview-toolbar"
            onSubmit={(event) => {
              event.preventDefault()
              onOpen()
            }}
          >
            <label className="preview-toolbar-label">
              <span className="label">Preview URL</span>
              <input
                aria-label="Preview URL"
                className="preview-toolbar-input"
                placeholder="http://localhost:3000 or https://example.com"
                type="url"
                value={state.draftUrl}
                onChange={(event) => onDraftUrlChange(event.target.value)}
              />
            </label>
            <div className="right-sidebar-toolbar">
              <button type="submit" className="secondary-button">
                Open
              </button>
              <button type="button" className="secondary-button" disabled={!state.committedUrl} onClick={() => onReload()}>
                Refresh
              </button>
              <button type="button" className="secondary-button" disabled={!state.committedUrl} onClick={() => void onOpenExternal()}>
                Open External
              </button>
            </div>
          </form>

          <div className="preview-mode-toggle" role="group" aria-label="Preview interaction mode">
            <PreviewModeButton active={state.mode === "browse"} label="Browse" onClick={() => onModeChange("browse")} />
            <PreviewModeButton active={state.mode === "comment"} label="Comment" onClick={() => onModeChange("comment")} />
          </div>

          {state.errorMessage ? (
            <p className="right-sidebar-status-error" role="alert">{state.errorMessage}</p>
          ) : (
            <p className="preview-helper-copy">{helperCopy}</p>
          )}

          {pageTitle ? <p className="preview-page-meta">{pageTitle}</p> : null}
          {statusMessage ? <p className="right-sidebar-status-error" role="alert">{statusMessage}</p> : null}
        </div>

        {state.committedUrl ? (
          <div className="preview-panel-preview-stack">
            <div className="preview-canvas">
              {shouldUseWebview ? (
                <webview
                  key={`${state.committedUrl}:${state.reloadToken}`}
                  ref={(node) => {
                    webviewRef.current = node as WebviewElement | null
                  }}
                  aria-label={`Preview of ${state.committedUrl}`}
                  className="preview-frame preview-webview"
                  preload={previewGuestPreloadPath}
                  src={state.committedUrl}
                />
              ) : (
                <>
                  <iframe
                    key={`${state.committedUrl}:${state.reloadToken}`}
                    ref={iframeRef}
                    title={`Preview of ${state.committedUrl}`}
                    className="preview-frame"
                    sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
                    src={state.committedUrl}
                    onError={() => setIsLoading(false)}
                    onLoad={() => setIsLoading(false)}
                  />
                  <div
                    className={state.mode === "comment" ? "preview-comment-overlay is-active" : "preview-comment-overlay"}
                    data-testid="preview-comment-overlay"
                    onClick={handleOverlayClick}
                  >
                    <div className="preview-markers-layer" aria-hidden="true">
                      {currentComments.map((comment, index) => (
                        <span
                          key={comment.id}
                          className="preview-comment-marker"
                          style={{
                            left: `${comment.x}%`,
                            top: `${comment.y}%`,
                          }}
                        >
                          {index + 1}
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {isLoading ? (
                <div className="preview-loading-scrim" aria-live="polite">
                  Loading preview...
                </div>
              ) : null}
            </div>

            {pendingComment ? (
              <div className="preview-comment-composer">
                <div className="preview-comment-selection">
                  <strong>{pendingComment.anchor?.label ?? `${Math.round(pendingComment.x)}%, ${Math.round(pendingComment.y)}%`}</strong>
                  {pendingComment.anchor?.selector ? <span>{pendingComment.anchor.selector}</span> : null}
                </div>
                <label className="preview-comment-label">
                  <span className="label">Comment</span>
                  <textarea
                    aria-label="Preview comment"
                    rows={3}
                    value={pendingText}
                    onChange={(event) => setPendingText(event.target.value)}
                  />
                </label>
                <div className="right-sidebar-toolbar">
                  <button type="button" className="secondary-button" disabled={!pendingText.trim()} onClick={handlePendingCommentSave}>
                    Save
                  </button>
                  <button type="button" className="secondary-button" onClick={handlePendingCommentCancel}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="preview-empty-state">
            <h3>No preview loaded</h3>
            <p>Open your local dev server here or load a reference site such as a product homepage.</p>
          </div>
        )}
      </div>

      <div className="preview-panel-notes">
        <div className="right-sidebar-panel-header">
          <div className="right-sidebar-panel-copy">
            <span className="label">Comments</span>
            <h3>Review notes</h3>
          </div>
          <div className="right-sidebar-panel-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={!canInsertCommentsIntoDraft || currentComments.length === 0}
              onClick={() => onInsertCommentsIntoDraft()}
            >
              Use in chat
            </button>
          </div>
        </div>

        {currentComments.length === 0 ? (
          <div className="preview-comments-empty">
            <p>Switch to Comment mode and click the page to leave structured feedback.</p>
          </div>
        ) : (
          <div className="preview-comment-list">
            {currentComments.map((comment, index) => (
              <article key={comment.id} className="preview-comment-list-item">
                <div className="preview-comment-list-copy">
                  <strong>
                    Comment {index + 1}
                  </strong>
                  <span>
                    {formatAnchorLabel(comment)}
                    {" - "}
                    {formatTime(comment.createdAt)}
                  </span>
                </div>
                {comment.anchor?.selector ? <code className="preview-comment-selector">{comment.anchor.selector}</code> : null}
                <p>{comment.text}</p>
                <div className="right-sidebar-toolbar">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => onDeleteComment(comment.id)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
