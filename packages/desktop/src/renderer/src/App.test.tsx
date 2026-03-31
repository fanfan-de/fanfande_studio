import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { App } from "./App"

describe("App", () => {
  beforeEach(() => {
    window.desktop = {
      platform: "win32",
      versions: {
        node: "22.0.0",
        chrome: "130.0.0",
        electron: "39.0.0",
      } as NodeJS.ProcessVersions,
      getInfo: vi.fn().mockResolvedValue({
        platform: "win32",
        node: "22.0.0",
        chrome: "130.0.0",
        electron: "39.0.0",
      }),
    }
  })

  it("renders the Anybox-inspired AI agent workspace", async () => {
    render(<App />)

    expect(screen.getByRole("heading", { name: "AI Agent Workspace" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "发送任务" })).toBeInTheDocument()
    expect(await screen.findByText("win32")).toBeInTheDocument()
  })

  it("appends a user prompt and a generated agent turn", async () => {
    render(<App />)

    fireEvent.change(screen.getByPlaceholderText("描述你希望 Agent 处理的任务、目标或界面方向。"), {
      target: {
        value: "请给这版桌面端补一个真实接口接入计划。",
      },
    })
    fireEvent.click(screen.getByRole("button", { name: "发送任务" }))

    await waitFor(() => {
      expect(screen.getAllByText("请给这版桌面端补一个真实接口接入计划。").length).toBeGreaterThan(0)
      expect(screen.getByText("执行草案已生成")).toBeInTheDocument()
      expect(screen.getByText("真实接口接入位")).toBeInTheDocument()
    })
  })
})
