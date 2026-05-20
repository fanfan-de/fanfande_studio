import { render, screen } from "@testing-library/react"
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

  it("renders the first desktop agent layout and bootstraps projects", async () => {
    render(<App />)

    expect(screen.getByText("AI Agent Console")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Send Prompt" })).toBeTruthy()
    expect(await screen.findByText("Mock Workspace")).toBeTruthy()
  })
})
