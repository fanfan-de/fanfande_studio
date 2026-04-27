import { memo } from "react"
import { createPortal } from "react-dom"
import { TerminalPanel } from "./TerminalPanel"
import { TerminalPanelToggleButton } from "./TerminalPanelToggleButton"
import { useTerminalWorkspace } from "./use-terminal-workspace"

interface TerminalAreaHostProps {
  brandTheme: "terra" | "sage"
  collapsedTogglePortalTarget?: Element | null
  colorMode: "system" | "light" | "dark"
  currentWorkspaceDirectory: string | null
  defaultCwd: string
  storageKey?: string
}

export const TerminalAreaHost = memo(function TerminalAreaHost({
  brandTheme,
  collapsedTogglePortalTarget,
  colorMode,
  currentWorkspaceDirectory,
  defaultCwd,
  storageKey,
}: TerminalAreaHostProps) {
  const {
    activeSession,
    handleCloseTerminal,
    handleCreateTerminal,
    handlePanelHeightChange,
    handleSelectTerminal,
    handleTerminalInput,
    handleTerminalResize,
    handleTerminalSnapshotChange,
    handleTogglePanel,
    isOpen,
    panelHeight,
    sessions,
    subscribeToTerminalStream,
  } = useTerminalWorkspace({
    defaultCwd,
    currentWorkspaceDirectory,
    storageKey,
  })

  const collapsedToggleButton = <TerminalPanelToggleButton isOpen={false} onToggle={() => void handleTogglePanel()} />

  return (
    <>
      {!isOpen
        ? collapsedTogglePortalTarget
          ? createPortal(collapsedToggleButton, collapsedTogglePortalTarget)
          : (
            <div className="canvas-terminal-toggle-anchor">
              {collapsedToggleButton}
            </div>
          )
        : null}
      <TerminalPanel
        activeSession={activeSession}
        brandTheme={brandTheme}
        colorMode={colorMode}
        isOpen={isOpen}
        panelHeight={panelHeight}
        sessions={sessions}
        onCloseTerminal={handleCloseTerminal}
        onCreateTerminal={handleCreateTerminal}
        onPanelHeightChange={handlePanelHeightChange}
        onSelectTerminal={handleSelectTerminal}
        onTerminalInput={handleTerminalInput}
        onTerminalResize={handleTerminalResize}
        onTerminalSnapshotChange={handleTerminalSnapshotChange}
        onTogglePanel={() => void handleTogglePanel()}
        subscribeToTerminalStream={subscribeToTerminalStream}
      />
    </>
  )
})
