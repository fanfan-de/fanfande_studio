import { memo } from "react"
import { createPortal } from "react-dom"
import { TerminalPanel } from "./TerminalPanel"
import { TerminalPanelToggleButton } from "./TerminalPanelToggleButton"
import { useTerminalWorkspace } from "./use-terminal-workspace"

interface TerminalAreaHostProps {
  brandTheme: "terra" | "sage"
  collapsedTogglePortalTarget?: Element | null
  colorMode: "system" | "light" | "dark"
  currentSessionID: string | null
  storageKey?: string
  togglePortalTarget?: Element | null
}

export const TerminalAreaHost = memo(function TerminalAreaHost(props: TerminalAreaHostProps) {
  const {
    brandTheme,
    collapsedTogglePortalTarget,
    colorMode,
    currentSessionID,
    storageKey,
    togglePortalTarget,
  } = props
  const {
    activeSession,
    handleCloseTerminal,
    handleCreateTerminal,
    handleCreateTerminalForShellProfile,
    handlePanelHeightChange,
    handleShellProfileChange,
    handleSelectTerminal,
    handleTerminalInput,
    handleTerminalResize,
    handleTerminalSnapshotChange,
    handleTogglePanel,
    isOpen,
    panelHeight,
    selectedShellProfileID,
    shellProfiles,
    sessions,
    subscribeToTerminalStream,
  } = useTerminalWorkspace({
    currentSessionID,
    storageKey,
  })

  if (!currentSessionID) return null

  const hasPersistentTogglePortal = Object.prototype.hasOwnProperty.call(props, "togglePortalTarget")
  const toggleButton = <TerminalPanelToggleButton isOpen={isOpen} onToggle={() => void handleTogglePanel()} />

  return (
    <>
      {hasPersistentTogglePortal
        ? togglePortalTarget
          ? createPortal(toggleButton, togglePortalTarget)
          : null
        : !isOpen
        ? collapsedTogglePortalTarget
          ? createPortal(toggleButton, collapsedTogglePortalTarget)
          : (
            <div className="canvas-terminal-toggle-anchor">
              {toggleButton}
            </div>
          )
        : null}
      <TerminalPanel
        activeSession={activeSession}
        brandTheme={brandTheme}
        colorMode={colorMode}
        isOpen={isOpen}
        panelHeight={panelHeight}
        showToggleButton={!hasPersistentTogglePortal}
        sessions={sessions}
        onCloseTerminal={handleCloseTerminal}
        onCreateTerminal={handleCreateTerminal}
        onCreateTerminalForShellProfile={handleCreateTerminalForShellProfile}
        onPanelHeightChange={handlePanelHeightChange}
        onShellProfileChange={handleShellProfileChange}
        onSelectTerminal={handleSelectTerminal}
        selectedShellProfileID={selectedShellProfileID}
        shellProfiles={shellProfiles}
        onTerminalInput={handleTerminalInput}
        onTerminalResize={handleTerminalResize}
        onTerminalSnapshotChange={handleTerminalSnapshotChange}
        onTogglePanel={() => void handleTogglePanel()}
        subscribeToTerminalStream={subscribeToTerminalStream}
      />
    </>
  )
})
