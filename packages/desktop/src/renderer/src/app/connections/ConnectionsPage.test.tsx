import { fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it } from "vitest"
import { ConnectionsPage } from "./ConnectionsPage"
import type { ConnectionsTab } from "../types"

function ConnectionsPageHarness() {
  const [activeTab, setActiveTab] = useState<ConnectionsTab>("plugins")
  const [searchQueries, setSearchQueries] = useState<Record<ConnectionsTab, string>>({
    plugins: "",
    connectors: "",
    mcp: "",
    ssh: "",
  })

  return (
    <ConnectionsPage
      activeTab={activeTab}
      connectorCount={2}
      mcpCount={1}
      pluginCount={14}
      searchQuery={searchQueries[activeTab]}
      onSearchQueryChange={(value) =>
        setSearchQueries((current) => ({
          ...current,
          [activeTab]: value,
        }))
      }
      onTabChange={setActiveTab}
    >
      <div>{activeTab} content</div>
    </ConnectionsPage>
  )
}

describe("ConnectionsPage", () => {
  it("renders counted tabs and switches the active panel", () => {
    render(<ConnectionsPageHarness />)

    expect(screen.getByRole("tab", { name: "插件 14" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tab", { name: "连接器 2" })).toHaveAttribute("aria-selected", "false")
    expect(screen.getByRole("tab", { name: "MCP 1" })).toHaveAttribute("aria-selected", "false")
    expect(screen.getByRole("tab", { name: "SSH 0" })).toHaveAttribute("aria-selected", "false")
    expect(screen.getByText("plugins content")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("tab", { name: "连接器 2" }))

    expect(screen.getByRole("tab", { name: "连接器 2" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByText("connectors content")).toBeInTheDocument()
  })

  it("keeps independent search text for each tab", () => {
    render(<ConnectionsPageHarness />)

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索插件" }), {
      target: {
        value: "browser",
      },
    })

    fireEvent.click(screen.getByRole("tab", { name: "连接器 2" }))
    expect(screen.getByRole("searchbox", { name: "搜索连接器" })).toHaveValue("")

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索连接器" }), {
      target: {
        value: "gmail",
      },
    })

    fireEvent.click(screen.getByRole("tab", { name: "插件 14" }))
    expect(screen.getByRole("searchbox", { name: "搜索插件" })).toHaveValue("browser")

    fireEvent.click(screen.getByRole("tab", { name: "连接器 2" }))
    expect(screen.getByRole("searchbox", { name: "搜索连接器" })).toHaveValue("gmail")
  })
})
