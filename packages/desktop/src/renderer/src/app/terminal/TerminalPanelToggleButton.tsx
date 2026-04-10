import { TerminalIcon } from "../icons"

interface TerminalPanelToggleButtonProps {
  isOpen: boolean
  onToggle: () => void | Promise<void>
}

export function TerminalPanelToggleButton({ isOpen, onToggle }: TerminalPanelToggleButtonProps) {
  return (
    <button
      className={isOpen ? "canvas-top-menu-button terminal-panel-toggle-button is-active" : "canvas-top-menu-button terminal-panel-toggle-button"}
      aria-label="Toggle terminal panel"
      aria-pressed={isOpen}
      type="button"
      onClick={() => void onToggle()}
    >
      <TerminalIcon />
    </button>
  )
}
