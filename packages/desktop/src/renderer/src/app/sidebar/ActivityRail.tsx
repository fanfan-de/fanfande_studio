import { SidebarToggleButton, type SidebarSide } from "../shared-ui"

interface ActivityRailProps {
  bottomSlotRef?: (node: HTMLDivElement | null) => void
  isSidebarCollapsed: boolean
  onToggleSidebar: () => void
  side: SidebarSide
}

export function ActivityRail({ bottomSlotRef, isSidebarCollapsed, onToggleSidebar, side }: ActivityRailProps) {
  const railClassName = side === "right" ? "activity-rail is-right" : "activity-rail"

  return (
    <aside className={railClassName} aria-label={side === "left" ? "Primary navigation rail" : "Inspector rail"}>
      <div className="activity-rail-primary">
        <SidebarToggleButton
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={onToggleSidebar}
          side={side}
          variant="rail"
        />
      </div>
      {bottomSlotRef ? <div ref={bottomSlotRef} className="activity-rail-bottom" /> : null}
    </aside>
  )
}
