import { type RefObject } from "react"
import { CloseIcon, MaximizeIcon, MinimizeIcon, RestoreIcon } from "../icons"
import type { WindowAction } from "../types"

interface WindowChromeProps {
  controlsRef: RefObject<HTMLDivElement | null>
  isWindowMaximized: boolean
  onWindowAction: (action: WindowAction) => void
}

export function WindowChrome({ controlsRef, isWindowMaximized, onWindowAction }: WindowChromeProps) {
  return (
    <div ref={controlsRef} className="window-controls-floating" role="group" aria-label="Window controls">
      <button className="window-control" aria-label="Minimize window" type="button" onClick={() => onWindowAction("minimize")}>
        <MinimizeIcon />
      </button>
      <button
        className="window-control"
        aria-label={isWindowMaximized ? "Restore window" : "Maximize window"}
        type="button"
        onClick={() => onWindowAction("toggle-maximize")}
      >
        {isWindowMaximized ? <RestoreIcon /> : <MaximizeIcon />}
      </button>
      <button className="window-control is-close" aria-label="Close window" type="button" onClick={() => onWindowAction("close")}>
        <CloseIcon />
      </button>
    </div>
  )
}
