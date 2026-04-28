import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { SessionTaskListView, SessionTaskSummary } from "../types"
import { ComposerTaskProgress } from "./ComposerTaskProgress"

function createTask(input: Partial<SessionTaskSummary> & Pick<SessionTaskSummary, "id" | "subject" | "status">): SessionTaskSummary {
  return {
    id: input.id,
    sessionID: "session-1",
    subject: input.subject,
    description: input.description ?? input.subject,
    activeForm: input.activeForm ?? input.subject,
    owner: input.owner ?? "default",
    status: input.status,
    blocks: input.blocks ?? [],
    blockedBy: input.blockedBy ?? [],
    metadata: input.metadata ?? {},
    createdAt: input.createdAt ?? 1,
    updatedAt: input.updatedAt ?? 1,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    sourceAssistantMessageID: input.sourceAssistantMessageID,
    sourceUserMessageID: input.sourceUserMessageID,
    toolCallID: input.toolCallID,
    isBlocked: input.isBlocked ?? false,
    blockingTasks: input.blockingTasks ?? [],
    blockedTasks: input.blockedTasks ?? [],
  }
}

function createTaskListView(tasks: SessionTaskSummary[]): SessionTaskListView {
  const current = tasks.filter((task) => task.status === "in_progress")
  const next = tasks.filter((task) => task.status === "pending" && !task.isBlocked).slice(0, 1)
  const blocked = tasks.filter((task) => task.isBlocked)

  return {
    sessionID: "session-1",
    generatedAt: 1,
    tasks,
    current,
    next,
    blocked,
    owners: [
      {
        owner: "default",
        current: current[0],
        next: next[0],
      },
    ],
    teammateActivity: [],
    summary: {
      total: tasks.length,
      completed: tasks.filter((task) => task.status === "completed").length,
      pending: tasks.filter((task) => task.status === "pending").length,
      inProgress: current.length,
      blocked: blocked.length,
    },
  }
}

describe("ComposerTaskProgress", () => {
  it("renders compact task progress above the composer", () => {
    render(
      <ComposerTaskProgress
        tasks={createTaskListView([
          createTask({ id: "1", subject: "确认演示目标", status: "completed" }),
          createTask({ id: "2", subject: "创建示例计划", activeForm: "展示当前进度", status: "in_progress" }),
          createTask({ id: "3", subject: "收尾说明", status: "pending", isBlocked: true, blockedBy: ["2"] }),
        ])}
      />,
    )

    expect(screen.getByLabelText("任务进度")).toBeInTheDocument()
    expect(screen.getByText("共 3 个任务，已经完成 1 个")).toBeInTheDocument()
    expect(screen.getByText("确认演示目标")).toBeInTheDocument()
    expect(screen.getByText("展示当前进度")).toBeInTheDocument()
    expect(screen.getByText("收尾说明")).toBeInTheDocument()
    expect(screen.getByText("进行中")).toBeInTheDocument()
    expect(screen.getByText("阻塞")).toBeInTheDocument()
  })

  it("does not render when the task snapshot is missing or empty", () => {
    const { container, rerender } = render(<ComposerTaskProgress tasks={null} />)

    expect(container).toBeEmptyDOMElement()

    rerender(<ComposerTaskProgress tasks={createTaskListView([])} />)

    expect(container).toBeEmptyDOMElement()
  })
})
