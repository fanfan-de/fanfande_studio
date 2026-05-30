import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type {
  AgentAutomationCreateInput,
  AgentAutomationDefinition,
  AgentAutomationRun,
} from "../../../../shared/desktop-ipc-contract"
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
    setDesktopMock(undefined)
  })

  it("loads existing automations and creates a project automation", async () => {
    const createAutomationMock = vi.fn(async (input: AgentAutomationCreateInput) => createAutomation({
      id: "aut_created",
      name: input.name,
      prompt: input.prompt,
    }))
    setDesktopMock({
      cancelAutomationRun: vi.fn(),
      createAutomation: createAutomationMock,
      deleteAutomation: vi.fn(),
      listAutomationRuns: vi.fn(async () => [] satisfies AgentAutomationRun[]),
      listAutomations: vi.fn(async () => [createAutomation()]),
      runAutomation: vi.fn(),
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
})
