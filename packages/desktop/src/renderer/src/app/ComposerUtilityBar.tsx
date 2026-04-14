import { GitBranchSwitcher } from "./GitBranchSwitcher"
import type { SessionContextUsage } from "./types"

interface ComposerUtilityBarProps {
  contextWindow: number | null
  gitDirectory: string | null
  gitProjectID: string | null
  usage: SessionContextUsage | null
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

export function ComposerUtilityBar({ contextWindow, gitDirectory, gitProjectID, usage }: ComposerUtilityBarProps) {
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
      <GitBranchSwitcher projectID={gitProjectID} directory={gitDirectory} />
    </div>
  )
}
