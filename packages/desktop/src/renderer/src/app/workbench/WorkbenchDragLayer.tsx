import type { DragEvent } from "react"
import type { PaneDropPosition } from "./WorkbenchPaneSurface"

interface WorkbenchDragLayerProps {
  dropTargetPosition: PaneDropPosition | null
  isTopRow: boolean
  paneID: string
  onPaneDropTargetChange: (paneID: string, position: PaneDropPosition | null) => void
  onPaneTabDrop: (paneID: string, position: PaneDropPosition) => void
}

const PANE_DROP_TARGETS: Array<[PaneDropPosition, string]> = [
  ["top", "Drop tab to split above"],
  ["left", "Drop tab to split left"],
  ["center", "Drop tab into pane"],
  ["right", "Drop tab to split right"],
  ["bottom", "Drop tab to split below"],
]

export function WorkbenchDragLayer({
  dropTargetPosition,
  isTopRow,
  paneID,
  onPaneDropTargetChange,
  onPaneTabDrop,
}: WorkbenchDragLayerProps) {
  function handleDrag(event: DragEvent<HTMLDivElement>, position: PaneDropPosition) {
    event.preventDefault()
    event.stopPropagation()
    onPaneDropTargetChange(paneID, position)
  }

  return (
    <div className={isTopRow ? "pane-drop-targets is-top-row" : "pane-drop-targets"} aria-hidden="true">
      {PANE_DROP_TARGETS.map(([position, label]) => (
        <div
          key={position}
          className={dropTargetPosition === position ? `pane-drop-target is-active is-${position}` : `pane-drop-target is-${position}`}
          data-pane-drop-position={position}
          data-pane-id={paneID}
          data-testid={`pane-drop-${position}`}
          aria-label={label}
          onDragEnter={(event) => handleDrag(event, position)}
          onDragOver={(event) => handleDrag(event, position)}
          onDrop={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onPaneTabDrop(paneID, position)
          }}
        />
      ))}
    </div>
  )
}
