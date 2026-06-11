import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ComposerConcurrentInputDrawer } from "./ComposerConcurrentInputDrawer"
import type { UserTurn } from "../types"

describe("ComposerConcurrentInputDrawer", () => {
  it("stays hidden until a submitted turn is pending", () => {
    render(
      <ComposerConcurrentInputDrawer
        canSteer
        hasPendingPermissionRequests={false}
        isCancelling={false}
        pendingTurns={[]}
      />,
    )

    expect(screen.queryByRole("button", { name: "引导当前 turn" })).toBeNull()
  })

  it("renders queued pending submissions with the steer action", () => {
    const onSteerQueuedTurn = vi.fn()
    const queuedTurn: UserTurn = {
      id: "user-queued",
      kind: "user",
      text: "Queued request",
      submissionMode: "queued",
      timestamp: 1,
    }

    render(
      <ComposerConcurrentInputDrawer
        canSteer
        hasPendingPermissionRequests={false}
        isCancelling={false}
        pendingTurns={[queuedTurn]}
        onSteerQueuedTurn={onSteerQueuedTurn}
      />,
    )

    expect(screen.getByText("Queued request")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "引导当前 turn" }))

    expect(onSteerQueuedTurn).toHaveBeenCalledWith(queuedTurn)
  })

  it("renders pending steer submissions with a waiting note", () => {
    const steerTurn: UserTurn = {
      id: "user-steer",
      kind: "user",
      text: "Adjust current turn",
      submissionMode: "steer",
      streamInsertion: {
        assistantTurnID: "assistant-active",
        afterItemCount: 1,
        status: "pending",
      },
      timestamp: 2,
    }

    render(
      <ComposerConcurrentInputDrawer
        canSteer
        hasPendingPermissionRequests={false}
        isCancelling={false}
        pendingTurns={[steerTurn]}
      />,
    )

    expect(screen.getByText("Adjust current turn")).toBeInTheDocument()
    expect(screen.getByText("等待当前模型/工具步骤结束后生效")).toBeInTheDocument()
  })

  it("renders steer submissions without insertion metadata with a waiting note", () => {
    const steerTurn: UserTurn = {
      id: "user-steer",
      kind: "user",
      text: "Adjust during tool input",
      submissionMode: "steer",
      timestamp: 2,
    }

    render(
      <ComposerConcurrentInputDrawer
        canSteer
        hasPendingPermissionRequests={false}
        isCancelling={false}
        pendingTurns={[steerTurn]}
      />,
    )

    expect(screen.getByText("Adjust during tool input")).toBeInTheDocument()
    expect(screen.getByText("等待当前模型/工具步骤结束后生效")).toBeInTheDocument()
  })
})
