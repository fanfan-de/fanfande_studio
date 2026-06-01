import { type ReactNode } from "react"
import { CloseIcon, SearchIcon } from "../icons"
import { ShellTopMenu } from "../shared-ui"
import type { ConnectionsTab } from "../types"

interface ConnectionsPageProps {
  activeTab: ConnectionsTab
  children: ReactNode
  connectorCount: number
  mobileCount?: number
  mcpCount: number
  pluginCount: number
  sshCount?: number
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
  { key: "ssh", label: "SSH" },
  { key: "mobile", label: "手机" },
]

function getSearchPlaceholder(tab: ConnectionsTab) {
  if (tab === "connectors") return "搜索连接器"
  if (tab === "mcp") return "搜索 MCP"
  if (tab === "ssh") return "搜索 SSH"
  if (tab === "mobile") return "搜索手机"
  return "搜索插件"
}

export function ConnectionsPage({
  activeTab,
  children,
  connectorCount,
  mobileCount = 1,
  mcpCount,
  pluginCount,
  sshCount = 0,
  searchQuery,
  windowControls,
  onSearchQueryChange,
  onTabChange,
}: ConnectionsPageProps) {
  const tabCounts: Record<ConnectionsTab, number> = {
    plugins: pluginCount,
    connectors: connectorCount,
    mcp: mcpCount,
    ssh: sshCount,
    mobile: mobileCount,
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
          </div>
        )}
        dragRegion
        layout="three-column"
        trailing={windowControls}
        trailingClassName="prompt-presets-top-menu-window-controls"
      />

      <div id="connections-tab-panel" className="connections-page-main" role="tabpanel">
        <div className="connections-page-search-row">
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
        <div className="connections-page-content">
          {children}
        </div>
      </div>
    </section>
  )
}
