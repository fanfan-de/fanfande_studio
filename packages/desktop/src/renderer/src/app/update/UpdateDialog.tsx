import type { MouseEvent } from "react"
import type { DesktopAppUpdateState } from "../../../../shared/desktop-ipc-contract"
import { CheckIcon, CloseIcon, DownloadIcon, FileTextIcon } from "../icons"

export type AppUpdateStatus = {
  tone: "success" | "error" | "muted"
  text: string
}

export function getAppUpdatePhaseLabel(state: DesktopAppUpdateState | null) {
  switch (state?.phase) {
    case "checking":
      return "Checking"
    case "available":
      return "Update available"
    case "downloading":
      return "Downloading"
    case "downloaded":
      return "Ready to install"
    case "up-to-date":
      return "Up to date"
    case "error":
      return "Needs attention"
    case "unsupported":
      return "Unavailable"
    default:
      return "Ready"
  }
}

export function getAppUpdateSummary(state: DesktopAppUpdateState | null) {
  if (!state) return "Loading update status..."

  switch (state.phase) {
    case "checking":
      return "Checking for the latest Anybox desktop release."
    case "available":
      return state.latestVersion
        ? `Anybox ${state.latestVersion} is available and will download automatically.`
        : "A new Anybox desktop update is available."
    case "downloading": {
      const percent = typeof state.downloadPercent === "number" ? ` ${Math.round(state.downloadPercent)}%` : ""
      return `Downloading the update.${percent}`
    }
    case "downloaded":
      return state.latestVersion
        ? `Anybox ${state.latestVersion} is ready. Restart to finish installing.`
        : "An update is ready. Restart to finish installing."
    case "up-to-date":
      return "Anybox is running the latest available version."
    case "error":
      return state.error ? `Update check failed. ${state.error}` : "Update check failed."
    case "unsupported":
      return "Update checks run in packaged builds."
    default:
      return "Open Update Center to check for a new version."
  }
}

export function shouldOpenUpdateCenterOnly(state: DesktopAppUpdateState | null) {
  return state?.phase === "checking" || state?.phase === "available" || state?.phase === "downloading" || state?.phase === "downloaded"
}

function getUpdateDialogTitle(state: DesktopAppUpdateState | null) {
  switch (state?.phase) {
    case "checking":
      return "Checking for updates"
    case "available":
      return "A new version is available"
    case "downloading":
      return "Downloading update"
    case "downloaded":
      return "Update ready to install"
    case "up-to-date":
      return "Anybox is up to date"
    case "error":
      return "Unable to check for updates"
    case "unsupported":
      return "Updates unavailable"
    default:
      return "Update Center"
  }
}

function formatUpdateCheckTime(value: number | null | undefined) {
  if (!value) return "Not checked yet"
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function getUpdateProgressPercent(state: DesktopAppUpdateState | null) {
  if (state?.phase === "downloaded") return 100
  if (typeof state?.downloadPercent !== "number") return 0
  return Math.max(0, Math.min(100, state.downloadPercent))
}

interface UpdateDialogProps {
  state: DesktopAppUpdateState | null
  status: AppUpdateStatus | null
  isChecking: boolean
  isInstalling: boolean
  onCheck: () => void
  onClose: () => void
  onInstall: () => void
}

export function UpdateDialog({
  state,
  status,
  isChecking,
  isInstalling,
  onCheck,
  onClose,
  onInstall,
}: UpdateDialogProps) {
  const phase = state?.phase ?? "idle"
  const progressPercent = getUpdateProgressPercent(state)
  const showProgress = phase === "downloading" || phase === "downloaded"
  const canCheck = phase !== "checking" && phase !== "downloading" && !isChecking
  const canInstall = phase === "downloaded"

  function handleOverlayClick(event: MouseEvent<HTMLElement>) {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  return (
    <section className="update-center-overlay" role="presentation" onClick={handleOverlayClick}>
      <article className="update-center-dialog" role="dialog" aria-modal="true" aria-labelledby="update-center-title">
        <header className="update-center-header">
          <div className="update-center-brand">
            <span className="update-center-app-icon" aria-hidden="true">
              A
            </span>
            <div>
              <span className="label">Anybox Desktop</span>
              <h2 id="update-center-title">{getUpdateDialogTitle(state)}</h2>
            </div>
          </div>
          <button className="settings-page-close-button" type="button" aria-label="Close update center" onClick={onClose}>
            <CloseIcon size={18} />
          </button>
        </header>

        <div className="update-center-status-card">
          <div className={`update-center-status-badge is-${phase}`}>
            <span className="update-center-status-dot" aria-hidden="true" />
            {getAppUpdatePhaseLabel(state)}
          </div>
          <p>{getAppUpdateSummary(state)}</p>

          {showProgress ? (
            <div className="update-center-progress" aria-label={`Download progress ${Math.round(progressPercent)}%`}>
              <span className="update-center-progress-track">
                <span className="update-center-progress-fill" style={{ width: `${progressPercent}%` }} />
              </span>
              <strong>{Math.round(progressPercent)}%</strong>
            </div>
          ) : null}
        </div>

        <dl className="update-center-meta">
          <div>
            <dt>Current version</dt>
            <dd>{state?.version ?? "Unknown"}</dd>
          </div>
          <div>
            <dt>Latest version</dt>
            <dd>{state?.latestVersion ?? (phase === "up-to-date" ? state?.version ?? "Unknown" : "Not checked")}</dd>
          </div>
          <div>
            <dt>Last checked</dt>
            <dd>{formatUpdateCheckTime(state?.lastCheckedAt)}</dd>
          </div>
          <div>
            <dt>Automatic updates</dt>
            <dd>{state?.automaticUpdates === false ? "Off" : "On"}</dd>
          </div>
        </dl>

        {state?.releaseNotes ? (
          <section className="update-center-release-notes" aria-label="Release notes">
            <div>
              <FileTextIcon size={16} />
              <h3>Release notes</h3>
            </div>
            <p>{state.releaseNotes}</p>
          </section>
        ) : null}

        {phase === "unsupported" ? (
          <p className="update-center-helper">
            Build and install the app, or use the configured development update feed, to test updates locally.
          </p>
        ) : null}

        {status ? <p className={`update-center-message is-${status.tone}`}>{status.text}</p> : null}

        <footer className="update-center-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Later
          </button>
          {canInstall ? (
            <button className="primary-button" type="button" disabled={isInstalling} onClick={onInstall}>
              <CheckIcon size={16} />
              {isInstalling ? "Restarting..." : "Restart to install"}
            </button>
          ) : (
            <button className="primary-button" type="button" disabled={!canCheck} onClick={onCheck}>
              <DownloadIcon size={16} />
              {isChecking || phase === "checking" ? "Checking..." : "Check for updates"}
            </button>
          )}
        </footer>
      </article>
    </section>
  )
}
