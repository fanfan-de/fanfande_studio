import { GitBranchSwitcher } from "./GitBranchSwitcher"
import type { ComposerPermissionMode, SessionContextUsage } from "./types"

interface ComposerUtilityBarProps {
  contextWindow: number | null
  gitDirectory: string | null
  gitProjectID: string | null
  permissionMode: ComposerPermissionMode
  onPermissionModeToggle: () => void
  usage: SessionContextUsage | null
}

function PermissionModeIcon({ mode }: { mode: ComposerPermissionMode }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d={mode === "full-access" ? "M9.5 10V8a3.5 3.5 0 0 1 6.8-1.3" : "M8.5 10V7.75a3.5 3.5 0 0 1 7 0V10"} />
      <rect x="6" y="10" width="12" height="8" rx="2" />
    </svg>
  )
}

function clampRatio(value: number) {
  return Math.max(0, Math.min(1, value))
}

function formatContextValue(value: number) {
  if (value >= 1000) {
    const formatted = value >= 100000 ? Math.round(value / 1000) : Number((value / 1000).toFixed(1))
    return `${String(formatted).replace(/\.0$/, "")}k`
  }

  return String(value)
}

function resolvePressureState(ratio: number | null) {
  if (ratio === null) return "unknown"
  if (ratio >= 0.8) return "high"
  if (ratio >= 0.6) return "medium"
  return "low"
}

export function ComposerUtilityBar({
  contextWindow,
  gitDirectory,
  gitProjectID,
  permissionMode,
  onPermissionModeToggle,
  usage,
}: ComposerUtilityBarProps) {
  const rawRatio = contextWindow && usage ? usage.inputTokens / contextWindow : null
  const clampedRatio = rawRatio === null ? 0 : clampRatio(rawRatio)
  const pressureState = resolvePressureState(rawRatio)
  const percent = rawRatio === null ? null : Math.round(rawRatio * 100)
  const size = 28
  const strokeWidth = 2.5
  const radius = 10
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - clampedRatio)

  const label =
    contextWindow && usage
      ? `Context pressure ${String(percent)}% (${formatContextValue(usage.inputTokens)} / ${formatContextValue(contextWindow)} input tokens)`
      : contextWindow
        ? `Context pressure unavailable until a response records usage (${formatContextValue(contextWindow)} context window)`
        : "Context pressure unavailable until a model is available"
  const permissionLabel = permissionMode === "full-access" ? "Permissions · Full access" : "Permissions · Default"
  const permissionTitle =
    permissionMode === "full-access"
      ? "Full access allows tool calls by default for this composer. Click to switch back to built-in approval defaults."
      : "Default permissions use the built-in tool approval policy. Click to switch to full access."

  return (
    <div className="composer-utility-bar" aria-label="Composer utility bar">
      <div
        className={`composer-utility-chip context-pressure-indicator is-${pressureState}`}
        aria-label={label}
        role="img"
        title={label}
      >
        <svg aria-hidden="true" className="context-pressure-ring" viewBox={`0 0 ${String(size)} ${String(size)}`}>
          <circle className="context-pressure-ring-track" cx="14" cy="14" r={String(radius)} />
          <circle
            className="context-pressure-ring-progress"
            cx="14"
            cy="14"
            r={String(radius)}
            strokeDasharray={String(circumference)}
            strokeDashoffset={String(dashOffset)}
          />
          <circle className="context-pressure-ring-core" cx="14" cy="14" r="2.6" />
        </svg>
      </div>
      <button
        type="button"
        className={`composer-utility-chip composer-utility-permission-toggle${permissionMode === "full-access" ? " is-active is-full-access" : ""}`}
        aria-label={permissionLabel}
        aria-pressed={permissionMode === "full-access"}
        title={permissionTitle}
        onClick={onPermissionModeToggle}
      >
        <PermissionModeIcon mode={permissionMode} />
        <span className="composer-utility-permission-toggle-label">{permissionLabel}</span>
      </button>
      <GitBranchSwitcher projectID={gitProjectID} directory={gitDirectory} />
    </div>
  )
}
