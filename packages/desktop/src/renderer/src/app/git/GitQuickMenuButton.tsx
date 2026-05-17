import { useEffect, useEffectEvent, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react"
import { isMatchingGitStateChangedDetail, notifyGitStateChanged, subscribeToGitStateChanged } from "../git-events"
import { ChevronDownIcon } from "../icons"
import { commitGit, createGitBranch, createGitPullRequest, getGitCapabilities, hasGitQuickMenuClient, pushGit, type GitCapabilitiesState } from "./client"

const GIT_STATE_CHANGED_REFRESH_DEBOUNCE_MS = 300

export function GitQuickMenuButton({ projectID, directory }: { projectID: string | null; directory: string | null }) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const commitInputRef = useRef<HTMLInputElement | null>(null)
  const branchInputRef = useRef<HTMLInputElement | null>(null)
  const loadRequestRef = useRef(0)
  const visibleLoadRequestRef = useRef(0)
  const gitStateRefreshTimerRef = useRef<number | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [activeForm, setActiveForm] = useState<"commit" | "branch" | null>(null)
  const [commitMessage, setCommitMessage] = useState("")
  const [branchName, setBranchName] = useState("")
  const [capabilities, setCapabilities] = useState<GitCapabilitiesState | null>(null)
  const [isLoadingCapabilities, setIsLoadingCapabilities] = useState(false)
  const [pendingAction, setPendingAction] = useState<"commit" | "stage-all-commit" | "push" | "pull-request" | "branch" | null>(null)
  const [status, setStatus] = useState<{
    tone: "neutral" | "success" | "error"
    text: string
  }>({
    tone: "neutral",
    text: "",
  })

  const hasGitClient = hasGitQuickMenuClient()

  const handleGitStateChanged = useEffectEvent((detail: { directory: string }) => {
    if (!isMatchingGitStateChangedDetail(detail, directory)) return
    scheduleGitStateRefresh()
  })

  async function refreshCapabilities({
    bypassCache = false,
    includePullRequestRemoteCheck = false,
    reportError = false,
    silent = false,
  }: {
    bypassCache?: boolean
    includePullRequestRemoteCheck?: boolean
    reportError?: boolean
    silent?: boolean
  } = {}) {
    if (!projectID || !directory || !hasGitClient) {
      setCapabilities(null)
      setIsLoadingCapabilities(false)
      return null
    }

    const requestID = loadRequestRef.current + 1
    loadRequestRef.current = requestID
    const visibleRequestID = silent ? null : visibleLoadRequestRef.current + 1
    if (visibleRequestID !== null) {
      visibleLoadRequestRef.current = visibleRequestID
      setIsLoadingCapabilities(true)
    }

    try {
      const nextCapabilities = await getGitCapabilities({
        projectID,
        directory,
        ...(includePullRequestRemoteCheck ? { includePullRequestRemoteCheck: true } : {}),
      }, {
        bypassCache,
      })

      if (loadRequestRef.current !== requestID) {
        return null
      }

      setCapabilities(nextCapabilities)
      return nextCapabilities
    } catch (error) {
      if (loadRequestRef.current !== requestID) {
        return null
      }

      setCapabilities(null)
      if (reportError) {
        setStatus({
          tone: "error",
          text: error instanceof Error ? error.message : String(error),
        })
      }
      return null
    } finally {
      if (visibleRequestID !== null && visibleLoadRequestRef.current === visibleRequestID) {
        setIsLoadingCapabilities(false)
      }
    }
  }

  const refreshCapabilitiesSilently = useEffectEvent((reportError = false) => {
    void refreshCapabilities({
      bypassCache: true,
      reportError,
      silent: true,
    })
  })

  const scheduleGitStateRefresh = useEffectEvent(() => {
    if (gitStateRefreshTimerRef.current !== null) {
      window.clearTimeout(gitStateRefreshTimerRef.current)
    }

    gitStateRefreshTimerRef.current = window.setTimeout(() => {
      gitStateRefreshTimerRef.current = null
      void refreshCapabilities({
        bypassCache: true,
        silent: true,
      })
    }, GIT_STATE_CHANGED_REFRESH_DEBOUNCE_MS)
  })

  useEffect(() => {
    setIsMenuOpen(false)
    setActiveForm(null)
    setCommitMessage("")
    setBranchName("")
    setStatus({
      tone: "neutral",
      text: "",
    })
    void refreshCapabilities()
  }, [projectID, directory])

  useEffect(() => subscribeToGitStateChanged(handleGitStateChanged), [handleGitStateChanged])

  useEffect(() => () => {
    if (gitStateRefreshTimerRef.current !== null) {
      window.clearTimeout(gitStateRefreshTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!isMenuOpen) return

    refreshCapabilitiesSilently(true)

    const refreshVisibleCapabilities = () => {
      refreshCapabilitiesSilently()
    }

    const handleWindowFocus = () => {
      refreshVisibleCapabilities()
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return
      refreshVisibleCapabilities()
    }

    window.addEventListener("focus", handleWindowFocus)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.removeEventListener("focus", handleWindowFocus)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [isMenuOpen])

  useEffect(() => {
    if (!isMenuOpen) return

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setIsMenuOpen(false)
      setActiveForm(null)
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false)
        setActiveForm(null)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isMenuOpen])

  useEffect(() => {
    if (!isMenuOpen) return

    if (activeForm === "commit") {
      commitInputRef.current?.focus()
      return
    }

    if (activeForm === "branch") {
      branchInputRef.current?.focus()
    }
  }, [activeForm, isMenuOpen])

  async function handleCommit(options?: { stageAll?: boolean }) {
    const message = commitMessage.trim()
    const stageAll = options?.stageAll === true

    if (!message) {
      setStatus({
        tone: "error",
        text: "Enter a commit message.",
      })
      return
    }

    if (!projectID || !directory) {
      setStatus({
        tone: "error",
        text: "The current workspace is unavailable.",
      })
      return
    }

    setPendingAction(stageAll ? "stage-all-commit" : "commit")
    setStatus({
      tone: "neutral",
      text: stageAll ? "Staging all changes and committing..." : "Committing staged changes...",
    })

    try {
      const result = await commitGit({
        projectID,
        directory,
        message,
        ...(stageAll ? { stageAll: true } : {}),
      })
      setCommitMessage("")
      setStatus({
        tone: "success",
        text: result.summary,
      })
      notifyGitStateChanged({
        directory,
      })
    } catch (error) {
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setPendingAction(null)
    }
  }

  async function handlePush() {
    if (!projectID || !directory) {
      setStatus({
        tone: "error",
        text: "The current workspace is unavailable.",
      })
      return
    }

    setPendingAction("push")
    setActiveForm(null)
    setStatus({
      tone: "neutral",
      text: "Pushing branch...",
    })

    try {
      const result = await pushGit({
        projectID,
        directory,
      })
      setStatus({
        tone: "success",
        text: result.summary,
      })
      notifyGitStateChanged({
        directory,
      })
    } catch (error) {
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setPendingAction(null)
    }
  }

  async function handleCreateBranch() {
    const name = branchName.trim()

    if (!capabilities?.canCreateBranch.enabled) {
      setStatus({
        tone: "error",
        text: capabilities?.canCreateBranch.reason ?? "A branch cannot be created right now.",
      })
      return
    }

    if (!name) {
      setStatus({
        tone: "error",
        text: "Enter a branch name.",
      })
      return
    }

    if (!projectID || !directory) {
      setStatus({
        tone: "error",
        text: "The current workspace is unavailable.",
      })
      return
    }

    setPendingAction("branch")
    setStatus({
      tone: "neutral",
      text: "Creating branch...",
    })

    try {
      const result = await createGitBranch({
        projectID,
        directory,
        name,
      })
      setBranchName("")
      setActiveForm(null)
      setStatus({
        tone: "success",
        text: result.summary,
      })
      notifyGitStateChanged({
        directory,
        branchesChanged: true,
      })
    } catch (error) {
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setPendingAction(null)
    }
  }

  async function handleCreatePullRequest() {
    if (!projectID || !directory) {
      setStatus({
        tone: "error",
        text: "The current workspace is unavailable.",
      })
      return
    }

    setPendingAction("pull-request")
    setActiveForm(null)
    setStatus({
      tone: "neutral",
      text: "Checking pull request status...",
    })

    try {
      const nextCapabilities = await refreshCapabilities({
        bypassCache: true,
        includePullRequestRemoteCheck: true,
        silent: true,
      })
      if (!nextCapabilities?.canCreatePullRequest.enabled) {
        setStatus({
          tone: "error",
          text: nextCapabilities?.canCreatePullRequest.reason ?? "A pull request cannot be created right now.",
        })
        return
      }

      setStatus({
        tone: "neutral",
        text: "Creating pull request...",
      })
      const result = await createGitPullRequest({
        projectID,
        directory,
      })
      setStatus({
        tone: "success",
        text: result.summary,
      })
      notifyGitStateChanged({
        directory,
      })
    } catch (error) {
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setPendingAction(null)
    }
  }

  if (!projectID || !directory || !hasGitClient || !capabilities?.isGitRepo) {
    return null
  }

  const isBusy = pendingAction !== null || isLoadingCapabilities
  const defaultStatusText = capabilities.branch
    ? `Current branch: ${capabilities.branch}`
    : "The current worktree is on a detached HEAD."

  const canOpenCommitForm = capabilities.canCommit.enabled || capabilities.canStageAllCommit.enabled
  const commitRowTitle = capabilities.canCommit.enabled
    ? "Commit the staged changes."
    : capabilities.canStageAllCommit.enabled
      ? "Stage all local changes and commit them."
      : capabilities.canStageAllCommit.reason ?? capabilities.canCommit.reason
  const commitRowDescription = capabilities.canCommit.enabled
    ? "Create a commit from the staged changes, or stage everything first."
    : capabilities.canStageAllCommit.enabled
      ? "No staged changes yet. Stage all local changes and commit them."
      : capabilities.canStageAllCommit.reason ?? capabilities.canCommit.reason

  return (
    <div className="canvas-top-menu-quick-anchor">
      <button
        ref={buttonRef}
        type="button"
        className={isMenuOpen ? "canvas-top-menu-button canvas-top-menu-git-trigger is-active" : "canvas-top-menu-button canvas-top-menu-git-trigger"}
        aria-controls="canvas-top-menu-git-menu"
        aria-expanded={isMenuOpen}
        aria-haspopup="dialog"
        title="Git actions"
        onClick={() => setIsMenuOpen((current) => !current)}
      >
        Git
        <ChevronDownIcon />
      </button>

      {isMenuOpen ? (
        <div ref={menuRef} id="canvas-top-menu-git-menu" className="canvas-top-menu-quick-panel git-quick-menu-panel" role="dialog" aria-label="Git quick menu">
          <div className="git-quick-menu-options" role="group" aria-label="Git actions">
            <button
              type="button"
              className={activeForm === "commit" ? "composer-menu-option git-quick-menu-option canvas-top-menu-segmented-option is-selected" : "composer-menu-option git-quick-menu-option canvas-top-menu-segmented-option"}
              disabled={!canOpenCommitForm || isBusy}
              title={commitRowTitle}
              onClick={() => {
                setActiveForm((current) => current === "commit" ? null : "commit")
              }}
            >
              <span className="composer-menu-option-copy">
                <strong>Commit changes</strong>
                <small>{commitRowDescription}</small>
              </span>
              <span className="composer-menu-option-check">
                {pendingAction === "commit" || pendingAction === "stage-all-commit" ? "Working..." : "Open"}
              </span>
            </button>

            <button
              type="button"
              className="composer-menu-option git-quick-menu-option canvas-top-menu-segmented-option"
              disabled={!capabilities.canPush.enabled || isBusy}
              title={capabilities.canPush.enabled ? "Push the current branch." : capabilities.canPush.reason}
              onClick={() => {
                void handlePush()
              }}
            >
              <span className="composer-menu-option-copy">
                <strong>Push branch</strong>
                <small>{capabilities.canPush.enabled ? "Push the current branch to its tracked remote." : capabilities.canPush.reason}</small>
              </span>
              <span className="composer-menu-option-check">{pendingAction === "push" ? "Working..." : "Run"}</span>
            </button>

            <button
              type="button"
              className="composer-menu-option git-quick-menu-option canvas-top-menu-segmented-option"
              disabled={!capabilities.canCreatePullRequest.enabled || isBusy}
              title={capabilities.canCreatePullRequest.enabled ? "Create a pull request for the current branch." : capabilities.canCreatePullRequest.reason}
              onClick={() => {
                void handleCreatePullRequest()
              }}
            >
              <span className="composer-menu-option-copy">
                <strong>Create pull request</strong>
                <small>
                  {capabilities.canCreatePullRequest.enabled
                    ? "Create a pull request from the current branch."
                    : capabilities.canCreatePullRequest.reason}
                </small>
              </span>
              <span className="composer-menu-option-check">{pendingAction === "pull-request" ? "Working..." : "Run"}</span>
            </button>

            <button
              type="button"
              className={activeForm === "branch" ? "composer-menu-option git-quick-menu-option canvas-top-menu-segmented-option is-selected" : "composer-menu-option git-quick-menu-option canvas-top-menu-segmented-option"}
              disabled={!capabilities.canCreateBranch.enabled || isBusy}
              title={capabilities.canCreateBranch.enabled ? "Create and switch to a new branch." : capabilities.canCreateBranch.reason}
              onClick={() => {
                setActiveForm((current) => current === "branch" ? null : "branch")
              }}
            >
              <span className="composer-menu-option-copy">
                <strong>Create branch</strong>
                <small>{capabilities.canCreateBranch.enabled ? "Create and switch to a new branch." : capabilities.canCreateBranch.reason}</small>
              </span>
              <span className="composer-menu-option-check">{pendingAction === "branch" ? "Working..." : "Open"}</span>
            </button>
          </div>

          {activeForm === "commit" ? (
            <div className="git-quick-menu-form">
              <label className="canvas-top-menu-quick-field">
                <span>Commit message</span>
                <input
                  ref={commitInputRef}
                  type="text"
                  value={commitMessage}
                  placeholder="Enter commit message"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setCommitMessage(event.target.value)}
                  onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      void handleCommit()
                    }
                  }}
                />
              </label>

              <div className="canvas-top-menu-quick-actions">
                <button className="secondary-button" type="button" onClick={() => setActiveForm(null)} disabled={isBusy}>
                  Cancel
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void handleCommit({ stageAll: true })}
                  disabled={!capabilities.canStageAllCommit.enabled || isBusy}
                  title={capabilities.canStageAllCommit.enabled ? "Stage all local changes and commit them." : capabilities.canStageAllCommit.reason}
                >
                  {pendingAction === "stage-all-commit" ? "Staging + committing..." : "Stage all + commit"}
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void handleCommit()}
                  disabled={!capabilities.canCommit.enabled || isBusy}
                  title={capabilities.canCommit.enabled ? "Commit only the staged changes." : capabilities.canCommit.reason}
                >
                  {pendingAction === "commit" ? "Committing..." : "Run commit"}
                </button>
              </div>
            </div>
          ) : null}

          {activeForm === "branch" ? (
            <div className="git-quick-menu-form">
              <label className="canvas-top-menu-quick-field">
                <span>Branch name</span>
                <input
                  ref={branchInputRef}
                  type="text"
                  value={branchName}
                  placeholder="feature/new-branch"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setBranchName(event.target.value)}
                  onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      void handleCreateBranch()
                    }
                  }}
                />
              </label>

              <div className="canvas-top-menu-quick-actions">
                <button className="secondary-button" type="button" onClick={() => setActiveForm(null)} disabled={isBusy}>
                  Cancel
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void handleCreateBranch()}
                  disabled={!capabilities.canCreateBranch.enabled || isBusy}
                  title={capabilities.canCreateBranch.enabled ? "Create and switch to a new branch." : capabilities.canCreateBranch.reason}
                >
                  {pendingAction === "branch" ? "Creating..." : "Create branch"}
                </button>
              </div>
            </div>
          ) : null}

          <p
            className={[
              "canvas-top-menu-quick-status",
              status.tone === "success" ? "is-success" : "",
              status.tone === "error" ? "is-error" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-live="polite"
          >
            {status.text || (isLoadingCapabilities ? "Checking Git status..." : defaultStatusText)}
          </p>
        </div>
      ) : null}
    </div>
  )
}
