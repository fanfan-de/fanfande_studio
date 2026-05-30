import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type {
  AgentAutomationCreateInput,
  AgentAutomationDefinition,
  AgentAutomationRun,
} from "../../../../shared/desktop-ipc-contract"
import { I18nProvider } from "../i18n/I18nProvider"
import { AutomationsPage } from "./AutomationsPage"

function setDesktopMock(value: unknown) {
  Object.defineProperty(window, "desktop", {
    configurable: true,
    writable: true,
    value,
  })
}

function createAutomation(overrides: Partial<AgentAutomationDefinition> = {}): AgentAutomationDefinition {
  return {
    id: "aut_existing",
    name: "Existing automation",
    kind: "project",
    status: "active",
    schedule: {
      type: "rrule",
      expression: "FREQ=DAILY;INTERVAL=1",
      timezone: "UTC",
    },
    scope: {
      projectIDs: ["proj_1"],
    },
    execution: {
      environment: "local",
      permissionMode: "default",
    },
    prompt: "Review the project.",
    promptVersion: 1,
    outputPolicy: {
      triage: "findings-only",
      autoArchiveNoFindings: true,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    nextRunAt: Date.now() + 60_000,
    ...overrides,
  }
}

describe("AutomationsPage", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
    setDesktopMock(undefined)
  })

  it("loads existing automations and creates a project automation", async () => {
    const createAutomationMock = vi.fn(async (input: AgentAutomationCreateInput) => createAutomation({
      id: "aut_created",
      name: input.name,
      prompt: input.prompt,
    }))
    const runAutomationMock = vi.fn(async () => ({ runs: [] }))
    setDesktopMock({
      cancelAutomationRun: vi.fn(),
      createAutomation: createAutomationMock,
      deleteAutomation: vi.fn(),
      listAutomationRuns: vi.fn(async () => [] satisfies AgentAutomationRun[]),
      listAutomations: vi.fn(async () => [createAutomation()]),
      runAutomation: runAutomationMock,
      updateAutomation: vi.fn(),
      updateAutomationRunTriage: vi.fn(),
    })

    render(
      <AutomationsPage
        projects={[{
          directory: "C:/Projects/example",
          id: "proj_1",
          name: "Example",
        }]}
      />,
    )

    expect(await screen.findByText("Existing automation")).toBeInTheDocument()
    expect(screen.queryByText("Review the project.")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Run Existing automation" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Pause Existing automation" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Delete Existing automation" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Run Existing automation" }))

    await waitFor(() => expect(runAutomationMock).toHaveBeenCalledWith({ automationID: "aut_existing" }))
    expect(screen.queryByRole("heading", { name: "Instructions" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Open Existing automation" }))

    expect(await screen.findByRole("heading", { name: "Instructions" })).toBeInTheDocument()
    expect(screen.getByText("Review the project.")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Back to automations" }))
    fireEvent.click(screen.getByRole("button", { name: "New automation" }))

    fireEvent.click(screen.getByRole("button", { name: "Create automation" }))

    await waitFor(() => expect(createAutomationMock).toHaveBeenCalledTimes(1))
    expect(createAutomationMock).toHaveBeenCalledWith(expect.objectContaining({
      kind: "project",
      scope: {
        projectIDs: ["proj_1"],
      },
      schedule: expect.objectContaining({
        type: "rrule",
      }),
    }))
  })

  it("renders automation chrome in the configured Chinese locale", async () => {
    window.localStorage.setItem("desktop.locale", "zh-CN")
    setDesktopMock({
      cancelAutomationRun: vi.fn(),
      createAutomation: vi.fn(),
      deleteAutomation: vi.fn(),
      getLocaleConfig: undefined,
      listAutomationRuns: vi.fn(async () => [] satisfies AgentAutomationRun[]),
      listAutomations: vi.fn(async () => [createAutomation()]),
      runAutomation: vi.fn(),
      updateAutomation: vi.fn(),
      updateAutomationRunTriage: vi.fn(),
    })

    render(
      <I18nProvider>
        <AutomationsPage
          projects={[{
            directory: "C:/Projects/example",
            id: "proj_1",
            name: "Example",
          }]}
        />
      </I18nProvider>,
    )

    expect(await screen.findByRole("heading", { name: "自动化" })).toBeInTheDocument()
    expect(screen.getByText("1 个启用，共 1 个")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "运行 Existing automation" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "暂停 Existing automation" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "删除 Existing automation" })).toBeInTheDocument()
  })
})
