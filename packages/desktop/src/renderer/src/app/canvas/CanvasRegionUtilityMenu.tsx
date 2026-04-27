import { type ReactNode } from "react"
import { joinClassNames, ShellTopMenu, SidebarToggleButton } from "../shared-ui"

export function CanvasRegionUtilityMenu({
  isRightSidebarCollapsed,
  label,
  onToggleLeftSidebar,
  onToggleRightSidebar,
  showLeftSidebarToggleButton,
  windowControls,
}: {
  isRightSidebarCollapsed: boolean
  label: string
  onToggleLeftSidebar: () => void
  onToggleRightSidebar: () => void
  showLeftSidebarToggleButton: boolean
  windowControls?: ReactNode
}) {
  return (
    <ShellTopMenu
      as="nav"
      ariaLabel={`${label} top menu`}
      className="canvas-region-top-menu"
      contentClassName="canvas-region-top-menu-tabs-shell"
      content={<div className="canvas-region-top-menu-empty">{label}</div>}
      controlsSpacerVariant="canvas"
      dragRegion
      layout="three-column"
      leading={showLeftSidebarToggleButton ? (
        <SidebarToggleButton isSidebarCollapsed={true} onToggleSidebar={onToggleLeftSidebar} side="left" variant="top-menu" />
      ) : null}
      leadingClassName="canvas-region-top-menu-leading"
      trailing={(
        <>
          <SidebarToggleButton isSidebarCollapsed={isRightSidebarCollapsed} onToggleSidebar={onToggleRightSidebar} side="right" variant="top-menu" />
          {isRightSidebarCollapsed ? windowControls : null}
        </>
      )}
      trailingClassName={joinClassNames(
        "canvas-region-top-menu-trailing",
        isRightSidebarCollapsed ? "is-right-sidebar-collapsed" : "is-right-sidebar-expanded",
      )}
    />
  )
}
