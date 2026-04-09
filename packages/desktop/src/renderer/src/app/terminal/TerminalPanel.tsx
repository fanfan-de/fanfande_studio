import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { TerminalTabs } from "./TerminalTabs"
import { TerminalView } from "./TerminalView"
import type { TerminalSessionRecord } from "./types"

interface TerminalPanelProps {
  activeSession: TerminalSessionRecord | null
  isOpen: boolean
  panelHeight: number
  sessions: TerminalSessionRecord[]
  onCloseTerminal: (ptyID: string) => void | Promise<void>
  onCreateTerminal: () => void | Promise<void>
  onPanelHeightChange: (height: number) => void
  onSelectTerminal: (ptyID: string) => void
  onTerminalInput: (data: string) => void | Promise<void>
  onTerminalResize: (ptyID: string, rows: number, cols: number) => void
  onTerminalSnapshotChange: (ptyID: string, input: { scrollTop?: number }) => void
  onTogglePanel: () => void | Promise<void>
}

const MIN_PANEL_HEIGHT = 220
const MAX_PANEL_HEIGHT = 560

function clampHeight(value: number) {
  return Math.max(MIN_PANEL_HEIGHT, Math.min(MAX_PANEL_HEIGHT, value))
}

export function TerminalPanel({
  activeSession,
  isOpen,
  panelHeight,
  sessions,
  onCloseTerminal,
  onCreateTerminal,
  onPanelHeightChange,
  onSelectTerminal,
  onTerminalInput,
  onTerminalResize,
  onTerminalSnapshotChange,
  onTogglePanel,
}: TerminalPanelProps) {
  const [isResizing, setIsResizing] = useState(false)
  const startRef = useRef<{ pointerY: number; height: number } | null>(null)

  useEffect(() => {
    if (!isResizing) return

    const handlePointerMove = (event: globalThis.PointerEvent) => {
      if (!startRef.current) return
      const delta = startRef.current.pointerY - event.clientY
      onPanelHeightChange(clampHeight(startRef.current.height + delta))
    }

    const stopResize = () => {
      startRef.current = null
      setIsResizing(false)
    }

    document.body.classList.add("is-resizing-terminal-panel")
    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", stopResize)
    window.addEventListener("pointercancel", stopResize)

    return () => {
      document.body.classList.remove("is-resizing-terminal-panel")
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", stopResize)
      window.removeEventListener("pointercancel", stopResize)
    }
  }, [isResizing, onPanelHeightChange])

  if (!isOpen) return null

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    startRef.current = {
      pointerY: event.clientY,
      height: panelHeight,
    }
    setIsResizing(true)
  }

  return (
    <section className="terminal-panel" style={{ height: `${String(panelHeight)}px` }}>
      <div
        className={isResizing ? "terminal-panel-resizer is-active" : "terminal-panel-resizer"}
        onPointerDown={handlePointerDown}
        role="separator"
        aria-label="Resize terminal panel"
        aria-orientation="horizontal"
      />

      <TerminalTabs
        activePtyID={activeSession?.ptyID ?? null}
        sessions={sessions}
        onCloseTerminal={onCloseTerminal}
        onCreateTerminal={onCreateTerminal}
        onSelectTerminal={onSelectTerminal}
        onTogglePanel={onTogglePanel}
      />

      {activeSession ? (
        <TerminalView
          panelHeight={panelHeight}
          session={activeSession}
          onInput={onTerminalInput}
          onResize={onTerminalResize}
          onSnapshotChange={onTerminalSnapshotChange}
        />
      ) : (
        <div className="terminal-empty-state">
          <p>No terminal session is open.</p>
          <button className="secondary-button" onClick={() => void onCreateTerminal()} type="button">
            Create terminal
          </button>
        </div>
      )}
    </section>
  )
}
