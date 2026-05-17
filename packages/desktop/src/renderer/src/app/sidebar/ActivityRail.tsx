import { useEffect, useId, useState } from "react"
import { FileTextIcon, FolderIcon, LayoutSidebarLeftIcon, PluginIcon, SettingsIcon, SideChatIcon, ToolsIcon } from "../icons"
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

const primaryLeftRailViews = [
  { view: "workspace" as const, label: "Open workspace", Icon: LayoutSidebarLeftIcon },
]

const configurationLeftRailViews = [
  { view: "skills" as const, label: "Open skills", Icon: FileTextIcon },
  { view: "prompts" as const, label: "Open prompts", Icon: SideChatIcon },
  { view: "mcp" as const, label: "Open MCP", Icon: FolderIcon },
  { view: "plugins" as const, label: "Open plugins", Icon: PluginIcon },
  { view: "tools" as const, label: "Open tools", Icon: ToolsIcon },
]

function isConfigurationLeftRailView(view: LeftSidebarView) {
  return configurationLeftRailViews.some((item) => item.view === view)
}

export function ActivityRail({
  activeView,
  bottomSlotRef,
  isSidebarCollapsed,
  onViewChange,
  onToggleSidebar,
  side,
}: ActivityRailProps) {
  const railClassName = side === "right" ? "activity-rail is-right" : "activity-rail"
  const configurationMenuID = useId()
  const isConfigurationViewActive = isConfigurationLeftRailView(activeView)
  const [isConfigurationMenuOpen, setIsConfigurationMenuOpen] = useState(isConfigurationViewActive)

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
      {side === "left" ? (
        <div className="activity-rail-footer">
          <div className="activity-rail-config" aria-label="Configuration views">
            <div id={configurationMenuID} className="activity-rail-config-stack" hidden={!isConfigurationMenuOpen}>
              {configurationLeftRailViews.map(({ view, label, Icon }) => {
                const isActive = activeView === view

                return (
                  <button
                    key={view}
                    className={isActive ? "activity-rail-view-button is-active" : "activity-rail-view-button"}
                    aria-label={label}
                    aria-pressed={isActive}
                    title={label}
                    type="button"
                    onClick={() => handleConfigurationViewChange(view)}
                  >
                    <Icon />
                  </button>
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
              <SettingsIcon />
            </button>
          </div>
          {bottomSlotRef ? <div ref={bottomSlotRef} className="activity-rail-bottom" /> : null}
        </div>
      ) : bottomSlotRef ? (
        <div ref={bottomSlotRef} className="activity-rail-bottom" />
      ) : null}
    </aside>
  )
}
