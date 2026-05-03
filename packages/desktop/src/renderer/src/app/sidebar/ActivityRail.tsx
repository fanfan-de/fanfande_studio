import { FileTextIcon, FolderIcon, LayoutSidebarLeftIcon, PluginIcon, SideChatIcon } from "../icons"
import { SidebarToggleButton, type SidebarSide } from "../shared-ui"
import type { LeftSidebarView } from "../types"

interface ActivityRailProps {
  activeView: LeftSidebarView
  bottomSlotRef?: (node: HTMLDivElement | null) => void
  isSidebarCollapsed: boolean
  onViewChange: (view: LeftSidebarView) => void
  onToggleSidebar: () => void
  side: SidebarSide
}

const leftRailViews = [
  { view: "workspace" as const, label: "Open workspace", Icon: LayoutSidebarLeftIcon },
  { view: "skills" as const, label: "Open skills", Icon: FileTextIcon },
  { view: "prompts" as const, label: "Open prompts", Icon: SideChatIcon },
  { view: "mcp" as const, label: "Open MCP", Icon: FolderIcon },
  { view: "plugins" as const, label: "Open plugins", Icon: PluginIcon },
]

export function ActivityRail({
  activeView,
  bottomSlotRef,
  isSidebarCollapsed,
  onViewChange,
  onToggleSidebar,
  side,
}: ActivityRailProps) {
  const railClassName = side === "right" ? "activity-rail is-right" : "activity-rail"

  return (
    <aside className={railClassName} aria-label={side === "left" ? "Primary navigation rail" : "Inspector rail"}>
      <div className="activity-rail-top-menu">
        <SidebarToggleButton
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={onToggleSidebar}
          side={side}
          variant="rail"
        />
      </div>
      <div className="activity-rail-primary">
        {side === "left" ? (
          <div className="activity-rail-view-stack" aria-label="Primary views">
            {leftRailViews.map(({ view, label, Icon }) => {
              const isActive = activeView === view

              return (
                <button
                  key={view}
                  className={isActive ? "activity-rail-view-button is-active" : "activity-rail-view-button"}
                  aria-label={label}
                  aria-pressed={isActive}
                  title={label}
                  type="button"
                  onClick={() => onViewChange(view)}
                >
                  <Icon />
                </button>
              )
            })}
          </div>
        ) : null}
      </div>
      {bottomSlotRef ? <div ref={bottomSlotRef} className="activity-rail-bottom" /> : null}
    </aside>
  )
}
