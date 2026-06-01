import type { MouseEvent } from "react"
import type { DesktopAppUpdateState } from "../../../../shared/desktop-ipc-contract"

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

function getUpdateVersionLabel(state: DesktopAppUpdateState | null) {
  return state?.latestVersion ? `Anybox ${state.latestVersion}` : "The update"
}

export function getAppUpdateSummary(state: DesktopAppUpdateState | null) {
  if (!state) return "Loading update status..."

  switch (state.phase) {
    case "checking":
      return "Checking for the latest Anybox desktop release."
    case "available":
      return state.latestVersion
        ? `Anybox ${state.latestVersion} is available and will download automatically.`
        : "A new Anybox desktop update is available and will download automatically."
    case "downloading":
      return state.latestVersion
        ? `Downloading Anybox ${state.latestVersion}.`
        : "Downloading the latest Anybox update."
    case "downloaded":
      return state.latestVersion
        ? `Anybox ${state.latestVersion} has downloaded. Restart the app to finish updating.`
        : "An update has downloaded. Restart the app to finish updating."
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
      return "Preparing update download"
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

function formatByteCount(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null

  const units = ["B", "KB", "MB", "GB"] as const
  let unitIndex = 0
  let nextValue = value
  while (nextValue >= 1024 && unitIndex < units.length - 1) {
    nextValue /= 1024
    unitIndex += 1
  }

  if (unitIndex === 0) return `${Math.round(nextValue)} ${units[unitIndex]}`
  return `${nextValue.toFixed(1)} ${units[unitIndex]}`
}

function getUpdateProgressPercent(state: DesktopAppUpdateState | null) {
  if (state?.phase === "downloaded") return 100
  if (typeof state?.downloadPercent !== "number") return 0
  return Math.max(0, Math.min(100, state.downloadPercent))
}

function getProgressTransferLabel(state: DesktopAppUpdateState | null, progressPercent: number) {
  const transferred = formatByteCount(state?.downloadTransferredBytes)
  const total = formatByteCount(state?.downloadTotalBytes)
  if (transferred && total) return `${transferred} / ${total}`
  if (transferred) return transferred
  return `${Math.round(progressPercent)}%`
}

function getProgressSpeedLabel(state: DesktopAppUpdateState | null) {
  const speed = formatByteCount(state?.downloadBytesPerSecond)
  return speed ? `${speed}/s` : null
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
  const progressSpeed = getProgressSpeedLabel(state)
  const showProgress = phase === "available" || phase === "downloading"
  const showCheckAction = phase !== "available" && phase !== "downloading" && phase !== "downloaded"
  const canCheck = phase !== "checking" && !isChecking
  const canInstall = phase === "downloaded"
  const secondaryActionLabel = phase === "available" || phase === "downloading" || phase === "checking"
    ? "Download in background"
    : "Later"

  function handleOverlayClick(event: MouseEvent<HTMLElement>) {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  return (
    <section className="update-center-overlay" role="presentation" onClick={handleOverlayClick}>
      <article
        className={`update-center-dialog is-${phase}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-center-title"
      >
        <header className="update-center-titlebar">
          <h2 id="update-center-title">{getUpdateDialogTitle(state)}</h2>
          <p>{getAppUpdateSummary(state)}</p>
        </header>

        {showProgress ? (
          <div className="update-center-progress-panel">
            <div className="update-center-progress" aria-label={`Download progress ${Math.round(progressPercent)}%`}>
              <span className="update-center-progress-track">
                <span className="update-center-progress-fill" style={{ width: `${progressPercent}%` }} />
              </span>
            </div>
            <div className="update-center-progress-details">
              <span>{getProgressTransferLabel(state, progressPercent)}</span>
              {progressSpeed ? <span>{progressSpeed}</span> : null}
            </div>
          </div>
        ) : null}

        {phase === "downloaded" && state?.releaseNotes ? (
          <section className="update-center-release-notes" aria-label="Release notes">
            <h3>{getUpdateVersionLabel(state)}</h3>
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
            {secondaryActionLabel}
          </button>
          {canInstall ? (
            <button className="primary-button" type="button" disabled={isInstalling} onClick={onInstall}>
              {isInstalling ? "Restarting..." : "Restart to install"}
            </button>
          ) : showCheckAction ? (
            <button className="primary-button" type="button" disabled={!canCheck} onClick={onCheck}>
              {isChecking || phase === "checking" ? "Checking..." : "Check for updates"}
            </button>
          ) : null}
        </footer>
      </article>
    </section>
  )
}
