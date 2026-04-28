import { describe, expect, it } from "vitest"
import { getSessionWorkflowBadge } from "./session-workflow"

describe("session workflow badges", () => {
  it("summarizes pending plan approval without legacy progress details", () => {
    const badge = getSessionWorkflowBadge({
      mode: "planning",
      plan: {
        status: "pending-approval",
        updatedAt: 1,
      },
    })

    expect(badge?.tone).toBe("pending")
    expect(badge?.shortLabel).toBe("Pending")
  })

  it("keeps approved plan badges", () => {
    const badge = getSessionWorkflowBadge({
      mode: "execution",
      plan: {
        status: "approved",
        updatedAt: 1,
      },
    })

    expect(badge?.tone).toBe("approved")
    expect(badge?.shortLabel).toBe("Approved plan")
  })
})
