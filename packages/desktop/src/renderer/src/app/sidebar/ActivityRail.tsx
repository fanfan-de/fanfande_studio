import { useEffect, useId, useState } from "react"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  AutomationIcon,
  CalendarIcon,
  ConnectedStatusIcon,
  FileTextIcon,
  LayoutSidebarLeftIcon,
  SettingsIcon,
  SideChatIcon,
  ToolsIcon,
} from "../icons"
import { joinClassNames, SidebarToggleButton, type SidebarSide } from "../shared-ui"
import type { LeftSidebarView } from "../types"

interface ActivityRailProps {
  activeView: LeftSidebarView
  bottomSlotRef?: (node: HTMLDivElement | null) => void
  isSettingsOpen?: boolean
  isSidebarCollapsed: boolean
  onOpenSettings?: () => void
  onViewChange: (view: LeftSidebarView) => void
  onToggleSidebar: () => void
  side: SidebarSide
}

const primaryLeftRailViews = [
  { view: "workspace" as const, label: "Open workspace", Icon: LayoutSidebarLeftIcon },
  { view: "calendar" as const, label: "Open calendar", Icon: CalendarIcon },
  { view: "automations" as const, label: "Open automations", Icon: AutomationIcon },
]

const configurationLeftRailViews = [
  { view: "skills" as const, label: "Open skills", Icon: FileTextIcon },
  { view: "prompts" as const, label: "Open prompts", Icon: SideChatIcon },
  { view: "connections" as const, label: "Open connections and extensions", Icon: ConnectedStatusIcon },
  { view: "tools" as const, label: "Open tools", Icon: ToolsIcon },
]

function isConfigurationLeftRailView(view: LeftSidebarView) {
  return configurationLeftRailViews.some((item) => item.view === view)
}

interface ActivityRailViewButtonProps {
  className?: string
  Icon: typeof LayoutSidebarLeftIcon
  isActive: boolean
  label: string
  onClick: () => void
}

function ActivityRailViewButton({ className, Icon, isActive, label, onClick }: ActivityRailViewButtonProps) {
  return (
    <button
      className={joinClassNames("activity-rail-view-button", className, isActive && "is-active")}
      aria-label={label}
      aria-pressed={isActive}
      title={label}
      type="button"
      onClick={onClick}
    >
      <Icon />
    </button>
  )
}

export function ActivityRail({
  activeView,
  bottomSlotRef,
  isSettingsOpen = false,
  isSidebarCollapsed,
  onOpenSettings,
  onViewChange,
  onToggleSidebar,
  side,
}: ActivityRailProps) {
  const railClassName = side === "right" ? "activity-rail is-right" : "activity-rail"
  const configurationMenuID = useId()
  const isConfigurationViewActive = isConfigurationLeftRailView(activeView)
  const [isConfigurationMenuOpen, setIsConfigurationMenuOpen] = useState(isConfigurationViewActive)
  const ConfigurationToggleIcon = isConfigurationMenuOpen ? ChevronDownIcon : ChevronRightIcon

  useEffect(() => {
    if (isConfigurationViewActive) {
      setIsConfigurationMenuOpen(true)
    }
  }, [isConfigurationViewActive])

  function handleConfigurationViewChange(view: LeftSidebarView) {
    setIsConfigurationMenuOpen(true)
    onViewChange(view)
  }

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
            {primaryLeftRailViews.map(({ view, label, Icon }) => {
              const isActive = activeView === view

              return (
                <ActivityRailViewButton
                  key={view}
                  Icon={Icon}
                  isActive={isActive}
                  label={label}
                  onClick={() => onViewChange(view)}
                />
              )
            })}
          </div>
        ) : null}
      </div>
      {side === "left" ? (
        <div className="activity-rail-footer">
          <div className="activity-rail-config" aria-label="Configuration views">
            <div id={configurationMenuID} className="activity-rail-config-stack" hidden={!isConfigurationMenuOpen}>
              {configurationLeftRailViews.map(({ view, label, Icon }) => {
                const isActive = activeView === view

                return (
                  <ActivityRailViewButton
                    key={view}
                    className="activity-rail-config-button"
                    Icon={Icon}
                    isActive={isActive}
                    label={label}
                    onClick={() => handleConfigurationViewChange(view)}
                  />
                )
              })}
            </div>
            <button
              className={[
                "activity-rail-view-button",
                "activity-rail-config-toggle",
                isConfigurationMenuOpen ? "is-expanded" : "is-collapsed",
                isConfigurationViewActive ? "is-active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-controls={configurationMenuID}
              aria-expanded={isConfigurationMenuOpen}
              aria-label={isConfigurationMenuOpen ? "Hide configuration shortcuts" : "Show configuration shortcuts"}
              title={isConfigurationMenuOpen ? "Hide configuration shortcuts" : "Show configuration shortcuts"}
              type="button"
              onClick={() => setIsConfigurationMenuOpen((nextValue) => !nextValue)}
            >
              <ConfigurationToggleIcon />
            </button>
          </div>
          {bottomSlotRef ? <div ref={bottomSlotRef} className="activity-rail-bottom" /> : null}
          {onOpenSettings ? (
            <button
              className={joinClassNames("activity-rail-view-button", "activity-rail-settings", isSettingsOpen && "is-active")}
              aria-label="Open settings"
              aria-pressed={isSettingsOpen}
              title="Open settings"
              type="button"
              onClick={onOpenSettings}
            >
              <SettingsIcon />
            </button>
          ) : null}
        </div>
      ) : bottomSlotRef ? (
        <div ref={bottomSlotRef} className="activity-rail-bottom" />
      ) : null}
    </aside>
  )
}
