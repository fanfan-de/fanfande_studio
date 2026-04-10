import { memo } from "react"
import { CloseIcon, PlusIcon } from "../icons"
import { TerminalPanelToggleButton } from "./TerminalPanelToggleButton"
import type { TerminalSessionRecord } from "./types"

interface TerminalTabsProps {
  activePtyID: string | null
  sessions: TerminalSessionRecord[]
  onCloseTerminal: (ptyID: string) => void | Promise<void>
  onCreateTerminal: () => void | Promise<void>
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
  sessions,
  onCloseTerminal,
  onCreateTerminal,
  onSelectTerminal,
  onTogglePanel,
}: TerminalTabsProps) {
  return (
    <div className="terminal-tabs">
      <TerminalPanelToggleButton isOpen={true} onToggle={onTogglePanel} />

      <div className="terminal-tabs-list" role="tablist" aria-label="Terminal tabs">
        {sessions.map((session) => {
          const isActive = session.ptyID === activePtyID
          return (
            <div key={session.ptyID} className={isActive ? "terminal-tab is-active" : "terminal-tab"}>
              <button
                className="terminal-tab-trigger"
                role="tab"
                aria-label={`${session.title}, ${formatTerminalStatus(session)}`}
                aria-selected={isActive}
                aria-controls={`terminal-panel-${session.ptyID}`}
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

      <button className="terminal-panel-create" aria-label="New terminal" onClick={() => void onCreateTerminal()} type="button">
        <PlusIcon />
      </button>
    </div>
  )
})
