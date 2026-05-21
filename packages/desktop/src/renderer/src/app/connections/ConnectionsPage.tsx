import { type ReactNode } from "react"
import { CloseIcon, SearchIcon } from "../icons"
import { ShellTopMenu } from "../shared-ui"
import type { ConnectionsTab } from "../types"

interface ConnectionsPageProps {
  activeTab: ConnectionsTab
  children: ReactNode
  connectorCount: number
  mcpCount: number
  pluginCount: number
  searchQuery: string
  windowControls?: ReactNode
  onSearchQueryChange: (value: string) => void
  onTabChange: (tab: ConnectionsTab) => void
}

const CONNECTION_TABS: Array<{
  key: ConnectionsTab
  label: string
}> = [
  { key: "plugins", label: "插件" },
  { key: "connectors", label: "连接器" },
  { key: "mcp", label: "MCP" },
]

function getSearchPlaceholder(tab: ConnectionsTab) {
  if (tab === "connectors") return "搜索连接器"
  if (tab === "mcp") return "搜索 MCP"
  return "搜索插件"
}

export function ConnectionsPage({
  activeTab,
  children,
  connectorCount,
  mcpCount,
  pluginCount,
  searchQuery,
  windowControls,
  onSearchQueryChange,
  onTabChange,
}: ConnectionsPageProps) {
  const tabCounts: Record<ConnectionsTab, number> = {
    plugins: pluginCount,
    connectors: connectorCount,
    mcp: mcpCount,
  }

  return (
    <section className="connections-page" aria-label="连接与扩展">
      <ShellTopMenu
        as="header"
        ariaLabel="连接与扩展顶部菜单"
        className="canvas-region-top-menu connections-top-menu"
        contentClassName="connections-top-menu-content"
        content={(
          <div className="connections-top-menu-inner">
            <nav className="connections-tab-list" role="tablist" aria-label="连接与扩展分类">
              {CONNECTION_TABS.map((tab) => {
                const isActive = activeTab === tab.key

                return (
                  <button
                    key={tab.key}
                    className={isActive ? "connections-tab is-active" : "connections-tab"}
                    type="button"
                    role="tab"
                    aria-label={`${tab.label} ${tabCounts[tab.key]}`}
                    aria-selected={isActive}
                    aria-controls="connections-tab-panel"
                    onClick={() => onTabChange(tab.key)}
                  >
                    <span>{tab.label}</span>
                    <small>{tabCounts[tab.key]}</small>
                  </button>
                )
              })}
            </nav>

            <label className="connections-search-control">
              <SearchIcon />
              <input
                aria-label={getSearchPlaceholder(activeTab)}
                type="search"
                value={searchQuery}
                placeholder={getSearchPlaceholder(activeTab)}
                onChange={(event) => onSearchQueryChange(event.target.value)}
              />
              {searchQuery ? (
                <button
                  type="button"
                  aria-label="清除搜索"
                  title="清除搜索"
                  onClick={() => onSearchQueryChange("")}
                >
                  <CloseIcon />
                </button>
              ) : null}
            </label>
          </div>
        )}
        dragRegion
        layout="three-column"
        trailing={windowControls}
        trailingClassName="prompt-presets-top-menu-window-controls"
      />

      <div id="connections-tab-panel" className="connections-page-main" role="tabpanel">
        {children}
      </div>
    </section>
  )
}
