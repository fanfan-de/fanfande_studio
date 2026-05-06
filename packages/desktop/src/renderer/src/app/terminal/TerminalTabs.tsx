import { memo } from "react"
import { CloseIcon } from "../icons"
import { TerminalPanelToggleButton } from "./TerminalPanelToggleButton"
import type { TerminalSessionRecord } from "./types"

interface TerminalTabsProps {
  activePtyID: string | null
  showToggleButton?: boolean
  sessions: TerminalSessionRecord[]
  onCloseTerminal: (ptyID: string) => void | Promise<void>
  onSelectTerminal: (ptyID: string) => void
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
  showToggleButton = true,
  sessions,
  onCloseTerminal,
  onSelectTerminal,
  onTogglePanel,
}: TerminalTabsProps) {
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
    </div>
  )
})
