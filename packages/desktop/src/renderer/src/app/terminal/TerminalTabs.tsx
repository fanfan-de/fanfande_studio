import { memo } from "react"
import { CloseIcon, PlusIcon } from "../icons"
import { TerminalPanelToggleButton } from "./TerminalPanelToggleButton"
import type { TerminalSessionRecord, TerminalShellProfile } from "./types"

interface TerminalTabsProps {
  activePtyID: string | null
  canCreateTerminal?: boolean
  isCreatingTerminal?: boolean
  showToggleButton?: boolean
  sessions: TerminalSessionRecord[]
  onCloseTerminal: (ptyID: string) => void | Promise<void>
  onCreateTerminal: (profileID: string) => void | Promise<void>
  onShellProfileChange: (profileID: string) => void
  onSelectTerminal: (ptyID: string) => void
  selectedShellProfileID: string
  shellProfiles: TerminalShellProfile[]
  onTogglePanel: () => void | Promise<void>
}

function formatTerminalStatus(session: TerminalSessionRecord) {
  if (session.status === "invalid") return "Unavailable"
  if (session.status === "deleted") return "Deleted"
  if (session.status === "exited") {
    return session.exitCode === null ? "Exited" : `Exited (${String(session.exitCode)})`
  }

  if (session.transportState === "connecting") return "Connecting"
  if (session.transportState === "error") return "Reconnect failed"
  if (session.transportState === "disconnected") return "Reconnect pending"
  return "Running"
}

export const TerminalTabs = memo(function TerminalTabs({
  activePtyID,
  canCreateTerminal = true,
  isCreatingTerminal = false,
  showToggleButton = true,
  sessions,
  onCloseTerminal,
  onCreateTerminal,
  onShellProfileChange,
  onSelectTerminal,
  selectedShellProfileID,
  shellProfiles,
  onTogglePanel,
}: TerminalTabsProps) {
  const selectedShellLabel = shellProfiles.find((profile) => profile.id === selectedShellProfileID)?.label ?? "Default"

  return (
    <div className="terminal-tabs">
      {showToggleButton ? <TerminalPanelToggleButton isOpen={true} onToggle={onTogglePanel} /> : null}

      <div className="terminal-tabs-list" aria-label="Session terminal">
        {sessions.map((session) => {
          const isActive = session.ptyID === activePtyID
          return (
            <div key={session.ptyID} className={isActive ? "terminal-tab is-active" : "terminal-tab"}>
              <button
                className="terminal-tab-trigger"
                aria-label={`${session.title}, ${formatTerminalStatus(session)}`}
                id={`terminal-tab-${session.ptyID}`}
                onClick={() => onSelectTerminal(session.ptyID)}
                type="button"
              >
                <span className="terminal-tab-title">{session.title}</span>
              </button>

              <button
                className="terminal-tab-close"
                aria-label={`Close terminal ${session.title}`}
                onClick={() => void onCloseTerminal(session.ptyID)}
                type="button"
              >
                <CloseIcon />
              </button>
            </div>
          )
        })}
      </div>

      <div className="terminal-tabs-actions">
        <label className="terminal-shell-picker">
          <span className="terminal-shell-picker-label">Shell</span>
          <select
            aria-label="Terminal shell profile"
            className="terminal-shell-picker-select"
            disabled={!canCreateTerminal || isCreatingTerminal}
            value={selectedShellProfileID}
            onChange={(event) => onShellProfileChange(event.currentTarget.value)}
          >
            {shellProfiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.label}
              </option>
            ))}
          </select>
        </label>

        {canCreateTerminal ? (
          <button
            className="terminal-panel-create"
            aria-label={`Create terminal (${selectedShellLabel})`}
            disabled={isCreatingTerminal}
            title={`New terminal (${selectedShellLabel})`}
            onClick={() => void onCreateTerminal(selectedShellProfileID)}
            type="button"
          >
            <PlusIcon />
          </button>
        ) : null}
      </div>
    </div>
  )
})
