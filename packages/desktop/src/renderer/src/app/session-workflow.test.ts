import { describe, expect, it } from "vitest"
import { getSessionWorkflowBadge } from "./session-workflow"

describe("session workflow badges", () => {
  it("only surfaces the active planning mode", () => {
    const badge = getSessionWorkflowBadge({
      mode: "planning",
      plan: {
        status: "draft",
        updatedAt: 1,
      },
    })

    expect(badge?.tone).toBe("planning")
    expect(badge?.shortLabel).toBe("Planning")
  })

  it("does not show execution-only plan state as a separate mode", () => {
    const badge = getSessionWorkflowBadge({
      mode: "execution",
      plan: {
        status: "approved",
        updatedAt: 1,
      },
    })

    expect(badge).toBeNull()
  })
})
