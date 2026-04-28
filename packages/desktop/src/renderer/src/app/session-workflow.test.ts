import { describe, expect, it } from "vitest"
import { getSessionWorkflowBadge } from "./session-workflow"

describe("session workflow badges", () => {
  it("summarizes active progress in workflow badges", () => {
    const badge = getSessionWorkflowBadge({
      mode: "execution",
      plan: {
        status: "idle",
        updatedAt: 1,
      },
      progress: {
        updatedAt: 2,
        items: [
          { id: "task-1", step: "Inspect code", status: "completed" },
          { id: "task-2", step: "Run tests", status: "in_progress" },
          { id: "task-3", step: "Summarize", status: "pending" },
        ],
      },
    })

    expect(badge?.shortLabel).toBe("1/3 · Run tests")
    expect(badge?.tone).toBe("progress")
  })

  it("keeps plan approval badges but includes progress detail", () => {
    const badge = getSessionWorkflowBadge({
      mode: "planning",
      plan: {
        status: "pending-approval",
        updatedAt: 1,
      },
      progress: {
        updatedAt: 2,
        items: [
          { id: "task-1", step: "Draft plan", status: "completed" },
          { id: "task-2", step: "Wait for approval", status: "pending" },
        ],
      },
    })

    expect(badge?.tone).toBe("pending")
    expect(badge?.shortLabel).toBe("1/2 · Wait for approval")
  })
})
