import { createRef, type ComponentProps } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { DEFAULT_ASSISTANT_TRACE_VISIBILITY, type AssistantTraceItem, type AssistantTraceItemKind, type AssistantTurn, type SessionSummary, type Turn, type UserTurn } from "../types"
import { ThreadView } from "./ThreadView"

const session: SessionSummary = {
  id: "session-1",
  title: "Session",
  branch: "main",
  status: "Live",
  updated: 1,
  focus: "",
  summary: "",
}

function assistantTurn(id: string, text: string): AssistantTurn {
  return {
    id,
    kind: "assistant",
    timestamp: 1,
    runtime: {
      phase: "responding",
      startedAt: 1,
      updatedAt: 1,
    },
    state: "responding",
    items: [
      {
        id: `${id}-text`,
        kind: "text",
        timestamp: 1,
        label: "Assistant",
        text,
        status: "running",
      },
    ],
    isStreaming: true,
  }
}

function assistantTraceTurn(id: string, items: AssistantTraceItem[], isStreaming: boolean): AssistantTurn {
  return {
    id,
    kind: "assistant",
    timestamp: 1,
    runtime: {
      phase: isStreaming ? "responding" : "completed",
      startedAt: 1,
      updatedAt: 1,
    },
    state: isStreaming ? "responding" : "completed",
    items,
    isStreaming,
  }
}

function userTurn(id: string, text: string): UserTurn {
  return {
    id,
    kind: "user",
    text,
    timestamp: 1,
  }
}

function renderThread(activeTurns: Turn[], overrides: Partial<ComponentProps<typeof ThreadView>> = {}) {
  const threadColumnRef = createRef<HTMLDivElement | null>()
  const props: ComponentProps<typeof ThreadView> = {
    activeSession: session,
    activeTurns,
    assistantTraceVisibility: DEFAULT_ASSISTANT_TRACE_VISIBILITY,
    isAgentDebugTraceEnabled: false,
    isResolvingPermissionRequest: false,
    pendingPermissionRequests: [],
    permissionRequestActionError: null,
    permissionRequestActionRequestID: null,
    sideChatCountsByAnchorMessageID: {},
    threadColumnRef,
    onAskUserQuestionAnswer: vi.fn(),
    onPermissionRequestResponse: vi.fn(),
    ...overrides,
  }
  const view = render(<ThreadView {...props} />)

  return {
    ...view,
    props,
    threadColumn: threadColumnRef.current!,
  }
}

function setScrollMetrics(element: HTMLElement, input: { clientHeight: number; scrollHeight: number; scrollTop: number }) {
  Object.defineProperty(element, "clientHeight", {
    configurable: true,
    value: input.clientHeight,
  })
  Object.defineProperty(element, "scrollHeight", {
    configurable: true,
    value: input.scrollHeight,
  })
  element.scrollTop = input.scrollTop
}

const traceItemKinds: AssistantTraceItemKind[] = [
  "system",
  "reasoning",
  "text",
  "question",
  "tool",
  "source",
  "file",
  "image",
  "patch",
  "subtask",
  "compaction",
  "step",
  "retry",
  "snapshot",
  "task-state",
  "error",
]

function traceSmokeItem(kind: AssistantTraceItemKind): AssistantTraceItem {
  const base: AssistantTraceItem = {
    id: `trace-smoke-${kind}`,
    kind,
    timestamp: 1,
    label: kind,
    title: `Smoke ${kind}`,
    text: `Rendered ${kind}`,
    status: "completed",
  }

  if (kind === "question") {
    return {
      ...base,
      questionPrompt: {
        questionID: "smoke-question",
        question: "Choose a smoke answer",
        options: [
          {
            label: "Continue",
            value: "continue",
          },
        ],
        allowFreeform: false,
        multiple: false,
        required: true,
      },
    }
  }

  if (kind === "tool") {
    return {
      ...base,
      title: "Smoke tool",
      toolOutputText: "tool output",
    }
  }

  if (kind === "image") {
    return {
      ...base,
      alt: "Smoke image",
      src: "https://example.com/smoke.png",
    }
  }

  if (kind === "patch") {
    return {
      ...base,
      filePaths: ["src/smoke.ts"],
    }
  }

  if (kind === "task-state") {
    return {
      ...base,
      progressItems: [
        {
          id: "task-1",
          status: "completed",
          step: "Render smoke task",
        },
      ],
    }
  }

  return base
}

function toolStatusTraceItem(status: NonNullable<AssistantTraceItem["status"]>): AssistantTraceItem {
  const showsInput = status === "pending" || status === "running" || status === "waiting-approval"

  return {
    id: `tool-${status}`,
    kind: "tool",
    timestamp: 1,
    label: "Tool",
    title: `Tool ${status}`,
    detail: "Tool detail",
    status,
    toolInputText: showsInput ? "tool input" : undefined,
    toolOutputText: showsInput ? undefined : "tool output",
  }
}

describe("ThreadView trace item renderers", () => {
  it("renders every assistant trace item kind through the registry", () => {
    const activeTurns = traceItemKinds.flatMap<Turn>((kind, index) => [
      userTurn(`user-${kind}`, `Trigger ${kind}`),
      assistantTraceTurn(`assistant-${kind}`, [traceSmokeItem(kind)], false),
      ...(index === traceItemKinds.length - 1 ? [] : [userTurn(`separator-${kind}`, `Next ${kind}`)]),
    ])
    const { container } = renderThread(activeTurns, {
      assistantTraceVisibility: {
        ...DEFAULT_ASSISTANT_TRACE_VISIBILITY,
        debugMetadata: true,
        workflow: true,
      },
    })

    for (const kind of traceItemKinds) {
      expect(container.querySelector(`.trace-kind-${kind}`)).not.toBeNull()
    }
  })

  it("renders compact one-line tool status labels and indicators", () => {
    const items = [
      toolStatusTraceItem("pending"),
      toolStatusTraceItem("running"),
      toolStatusTraceItem("waiting-approval"),
      toolStatusTraceItem("completed"),
      toolStatusTraceItem("error"),
      toolStatusTraceItem("denied"),
    ]
    const { container } = renderThread([
      assistantTraceTurn("assistant-tools", items, true),
    ])

    expect(screen.getByRole("button", { name: /Tool pending.*准备中/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Tool running.*执行中/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Tool waiting-approval.*等待确认/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Tool completed$/ })).toBeInTheDocument()
    expect(screen.queryByText("完成")).toBeNull()
    expect(screen.getByRole("button", { name: /Tool error.*失败/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Tool denied.*已拒绝/ })).toBeInTheDocument()

    for (const status of ["pending", "running", "waiting-approval"] as const) {
      const indicator = container.querySelector(`.trace-kind-tool.is-${status} .trace-tool-status-indicator`)
      expect(indicator).not.toBeNull()
      expect(indicator).toHaveClass("is-icon-dot")
      expect(indicator).toHaveClass("is-breathing")
    }

    const completedIndicator = container.querySelector(".trace-kind-tool.is-completed .trace-tool-status-indicator")
    expect(completedIndicator).not.toBeNull()
    expect(completedIndicator).toHaveClass("is-icon-success")
    expect(completedIndicator).not.toHaveClass("is-breathing")

    const errorIndicator = container.querySelector(".trace-kind-tool.is-error .trace-tool-status-indicator")
    expect(errorIndicator).not.toBeNull()
    expect(errorIndicator).toHaveClass("is-icon-error")
    expect(errorIndicator).not.toHaveClass("is-breathing")

    const deniedIndicator = container.querySelector(".trace-kind-tool.is-denied .trace-tool-status-indicator")
    expect(deniedIndicator).not.toBeNull()
    expect(deniedIndicator).toHaveClass("is-icon-error")
    expect(deniedIndicator).not.toHaveClass("is-breathing")
  })

  it("keeps tool details available after expanding compact summaries", () => {
    renderThread(
      [
        assistantTraceTurn("assistant-tools", [toolStatusTraceItem("running")], true),
      ],
      {
        assistantTraceVisibility: {
          ...DEFAULT_ASSISTANT_TRACE_VISIBILITY,
          toolInputs: true,
        },
      },
    )

    fireEvent.click(screen.getByRole("button", { name: /Tool running.*执行中/ }))
    fireEvent.click(screen.getByRole("button", { name: /Tool running input/ }))

    expect(screen.getByText("tool input")).toBeInTheDocument()
    expect(screen.getByText("Tool detail")).toBeInTheDocument()
  })

  it("renders workflow step trace items as a single compact row", () => {
    const { container } = renderThread(
      [
        assistantTraceTurn(
          "assistant-step",
          [
            {
              id: "step-1",
              kind: "step",
              timestamp: 1,
              label: "Step",
              title: "Model step finished",
              detail: "The model completed one generation step.",
              status: "completed",
              section: "workflow",
              visibilityKey: "workflow",
            },
          ],
          false,
        ),
      ],
      {
        assistantTraceVisibility: {
          ...DEFAULT_ASSISTANT_TRACE_VISIBILITY,
          workflow: true,
        },
      },
    )

    const row = container.querySelector(".trace-kind-step .trace-item-step-row")

    expect(row).not.toBeNull()
    expect(row?.textContent).toContain("Model step finished")
    expect(row?.textContent).toContain("The model completed one generation step.")
    expect(row?.querySelector(".trace-item-detail")?.tagName).toBe("SPAN")
  })
})

describe("ThreadView side chat banner", () => {
  it("does not render the anchored response preview as banner copy", () => {
    const { getByText, queryByText } = renderThread([], {
      activeSession: {
        ...session,
        title: "Side chat: Raw markdown response",
        kind: "side-chat",
        origin: {
          parentSessionID: "session-parent",
          anchorMessageID: "assistant-message-1",
          anchorPreview: "Raw markdown response",
        },
      },
      showSessionBanner: true,
    })

    expect(getByText("Linked reply thread")).toBeInTheDocument()
    expect(queryByText("Raw markdown response")).not.toBeInTheDocument()
  })
})

describe("ThreadView question prompts", () => {
  it("keeps option buttons clickable while the assistant turn is waiting for an answer", () => {
    const onAskUserQuestionAnswer = vi.fn().mockResolvedValue(undefined)
    const questionItem: AssistantTraceItem = {
      id: "question-1",
      kind: "question",
      timestamp: 1,
      label: "Question",
      status: "running",
      section: "response",
      visibilityKey: "response",
      isStreaming: true,
      questionPrompt: {
        questionID: "que_target",
        question: "Where should I deploy?",
        options: [{ label: "Vercel", value: "vercel", description: "Recommended" }],
        allowFreeform: false,
        multiple: false,
        required: true,
      },
    }
    const { getByRole } = renderThread(
      [assistantTraceTurn("assistant-1", [questionItem], true)],
      { onAskUserQuestionAnswer },
    )

    const optionButton = getByRole("button", { name: "Vercel" }) as HTMLButtonElement
    expect(optionButton.disabled).toBe(false)

    fireEvent.click(optionButton)

    expect(onAskUserQuestionAnswer).toHaveBeenCalledWith({
      questionID: "que_target",
      selectedOptions: ["vercel"],
      text: "vercel",
    })
  })

  it("uses the full response width for freeform-only questions", () => {
    const questionItem: AssistantTraceItem = {
      id: "question-freeform",
      kind: "question",
      timestamp: 1,
      label: "Question",
      status: "completed",
      section: "response",
      visibilityKey: "response",
      questionPrompt: {
        questionID: "que_skill_type",
        question: "What kind of skill do you want to create?",
        options: [],
        allowFreeform: true,
        multiple: false,
        required: true,
      },
    }
    const { getByLabelText, queryByRole } = renderThread(
      [assistantTraceTurn("assistant-1", [questionItem], false)],
      { onAskUserQuestionAnswer: vi.fn().mockResolvedValue(undefined) },
    )

    expect(getByLabelText("Custom answer").closest(".ask-user-question-freeform-row")).toHaveClass("is-standalone")
    expect(queryByRole("button", { name: "Copy assistant response" })).not.toBeInTheDocument()
  })
})

describe("ThreadView image trace items", () => {
  it("renders generated images as inline previews and keeps multiple images visible", () => {
    const items: AssistantTraceItem[] = [
      {
        id: "image-1",
        kind: "image",
        timestamp: 1,
        label: "Image",
        title: "first.png",
        src: "https://example.com/first.png",
        mimeType: "image/png",
        width: 512,
        height: 512,
        alt: "First preview",
        status: "completed",
      },
      {
        id: "image-2",
        kind: "image",
        timestamp: 2,
        label: "Image",
        title: "second.png",
        src: "https://example.com/second.png",
        mimeType: "image/png",
        width: 256,
        height: 128,
        alt: "Second preview",
        status: "completed",
      },
      {
        id: "patch-1",
        kind: "patch",
        timestamp: 3,
        label: "Patch",
        title: "Updated files",
        filePaths: ["src/app.tsx"],
        status: "completed",
      },
    ]

    const { container, getByAltText, getByRole } = renderThread([
      assistantTraceTurn("assistant-images", items, false),
    ])

    expect(getByAltText("First preview")).toHaveAttribute("src", "https://example.com/first.png")
    expect(getByAltText("Second preview")).toHaveAttribute("src", "https://example.com/second.png")
    expect(getByRole("button", { name: "已编辑 1 个文件" })).toBeInTheDocument()

    fireEvent.click(getByRole("button", { name: "Preview First preview" }))

    const dialog = getByRole("dialog", { name: "First preview" })
    expect(dialog).toBeInTheDocument()
    expect(document.body.contains(dialog)).toBe(true)
    expect(container.contains(dialog)).toBe(false)
  })

  it("keeps patch file rows scoped to inline diff expansion", () => {
    const onFileChangeSelect = vi.fn()
    const patchItem: AssistantTraceItem = {
      id: "patch-action",
      kind: "patch",
      timestamp: 1,
      label: "Patch",
      title: "1 file change (+1 -1)",
      fileChanges: [
        {
          file: "src/app.tsx",
          additions: 1,
          deletions: 1,
          patch: [
            "diff --git a/src/app.tsx b/src/app.tsx",
            "--- a/src/app.tsx",
            "+++ b/src/app.tsx",
            "@@ -1 +1 @@",
            "-old",
            "+new",
          ].join("\n"),
        },
      ],
      status: "completed",
    }
    const { getByRole, queryByRole } = renderThread([
      assistantTraceTurn("assistant-patch", [patchItem], false),
    ], {
      onFileChangeSelect,
    })

    fireEvent.click(getByRole("button", { name: "已编辑 1 个文件" }))
    fireEvent.click(getByRole("button", { name: /已编辑\s*src\/app\.tsx/ }))

    expect(onFileChangeSelect).not.toHaveBeenCalled()
    expect(queryByRole("region", { name: "Diff preview for src/app.tsx" })).toBeInTheDocument()
  })

  it("renders historical patch text inline after expanding the file change summary", () => {
    const patchItem: AssistantTraceItem = {
      id: "patch-static",
      kind: "patch",
      timestamp: 1,
      label: "Model call",
      title: "1 file change (+1 -1)",
      fileChanges: [
        {
          file: "src/app.tsx",
          additions: 1,
          deletions: 1,
          patch: [
            "diff --git a/src/app.tsx b/src/app.tsx",
            "--- a/src/app.tsx",
            "+++ b/src/app.tsx",
            "@@ -10 +10 @@",
            "-const label = \"old\"",
            "+const label = \"new\"",
          ].join("\n"),
        },
      ],
      filePaths: ["src/app.tsx"],
      status: "completed",
    }

    const { container, getByRole, getByText } = renderThread([
      assistantTraceTurn("assistant-patch-static", [patchItem], false),
    ])

    expect(getByRole("button", { name: "已编辑 1 个文件" })).toHaveAttribute("aria-expanded", "false")
    expect(getByRole("button", { name: "已编辑 1 个文件" })).toBeInTheDocument()
    expect(screen.queryByText("src/app.tsx")).not.toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Diff preview for src/app.tsx" })).not.toBeInTheDocument()

    fireEvent.click(getByRole("button", { name: "已编辑 1 个文件" }))
    expect(getByRole("button", { name: "已编辑 1 个文件" })).toHaveAttribute("aria-expanded", "true")
    expect(getByText("src/app.tsx")).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Diff preview for src/app.tsx" })).not.toBeInTheDocument()

    fireEvent.click(getByRole("button", { name: /已编辑\s*src\/app\.tsx/ }))
    expect(getByRole("region", { name: "Diff preview for src/app.tsx" })).toBeInTheDocument()
    expect(getByText('const label = "old"')).toBeInTheDocument()
    expect(getByText('const label = "new"')).toBeInTheDocument()
    expect(container.querySelectorAll(".right-sidebar-diff-row.is-remove")).toHaveLength(1)
    expect(container.querySelectorAll(".right-sidebar-diff-row.is-add")).toHaveLength(1)

    fireEvent.click(getByRole("button", { name: /已编辑\s*src\/app\.tsx/ }))
    expect(screen.queryByRole("region", { name: "Diff preview for src/app.tsx" })).not.toBeInTheDocument()
  })

  it("uses the folded file change renderer for ordinary patch items", () => {
    const patchItem: AssistantTraceItem = {
      id: "patch-ordinary",
      kind: "patch",
      timestamp: 1,
      label: "Patch",
      title: "1 file change (+2 -0)",
      fileChanges: [
        {
          file: "src/ordinary.ts",
          additions: 2,
          deletions: 0,
        },
      ],
      status: "completed",
    }

    const { getByRole, getByText, queryByText } = renderThread([
      assistantTraceTurn("assistant-patch-ordinary", [patchItem], false),
    ])

    expect(getByRole("button", { name: "已编辑 1 个文件" })).toBeInTheDocument()
    expect(queryByText("src/ordinary.ts")).not.toBeInTheDocument()

    fireEvent.click(getByRole("button", { name: "已编辑 1 个文件" }))

    expect(getByText("src/ordinary.ts")).toBeInTheDocument()
    expect(getByText("仅摘要")).toBeInTheDocument()
  })

  it("closes the lightbox with Escape and restores focus to the thumbnail trigger", () => {
    const items: AssistantTraceItem[] = [
      {
        id: "image-1",
        kind: "image",
        timestamp: 1,
        label: "Image",
        title: "first.png",
        src: "https://example.com/first.png",
        mimeType: "image/png",
        width: 512,
        height: 512,
        alt: "First preview",
        status: "completed",
      },
    ]
    const { getByRole, queryByRole } = renderThread([
      assistantTraceTurn("assistant-images", items, false),
    ])

    const previewButton = getByRole("button", { name: "Preview First preview" })
    previewButton.focus()

    fireEvent.click(previewButton)
    expect(getByRole("dialog", { name: "First preview" })).toBeInTheDocument()
    expect(document.body.classList.contains("is-image-lightbox-open")).toBe(true)

    fireEvent.keyDown(window, { key: "Escape" })

    expect(queryByRole("dialog", { name: "First preview" })).toBeNull()
    expect(document.body.classList.contains("is-image-lightbox-open")).toBe(false)
    expect(document.activeElement).toBe(previewButton)
  })

  it("uses fit-width by default for tall images and fit-contain for regular images", () => {
    const items: AssistantTraceItem[] = [
      {
        id: "image-1",
        kind: "image",
        timestamp: 1,
        label: "Image",
        title: "tall.png",
        src: "https://example.com/tall.png",
        mimeType: "image/png",
        width: 1440,
        height: 3557,
        alt: "Tall preview",
        status: "completed",
      },
      {
        id: "image-2",
        kind: "image",
        timestamp: 2,
        label: "Image",
        title: "wide.png",
        src: "https://example.com/wide.png",
        mimeType: "image/png",
        width: 1920,
        height: 1080,
        alt: "Wide preview",
        status: "completed",
      },
    ]
    const { getByRole, queryByRole } = renderThread([
      assistantTraceTurn("assistant-images", items, false),
    ])

    fireEvent.click(getByRole("button", { name: "Preview Tall preview" }))
    expect(document.querySelector(".trace-image-lightbox-canvas.is-fit-width")).not.toBeNull()
    fireEvent.keyDown(window, { key: "Escape" })
    expect(queryByRole("dialog", { name: "Tall preview" })).toBeNull()

    fireEvent.click(getByRole("button", { name: "Preview Wide preview" }))
    expect(document.querySelector(".trace-image-lightbox-canvas.is-fit-contain")).not.toBeNull()
  })

  it("supports keyboard zoom shortcuts and reset", () => {
    const items: AssistantTraceItem[] = [
      {
        id: "image-1",
        kind: "image",
        timestamp: 1,
        label: "Image",
        title: "first.png",
        src: "https://example.com/first.png",
        mimeType: "image/png",
        width: 512,
        height: 512,
        alt: "First preview",
        status: "completed",
      },
    ]
    const { getByRole } = renderThread([
      assistantTraceTurn("assistant-images", items, false),
    ])

    fireEvent.click(getByRole("button", { name: "Preview First preview" }))
    const resetZoomButton = getByRole("button", { name: "Reset zoom" })
    expect(resetZoomButton.textContent).toContain("100%")

    fireEvent.keyDown(window, { key: "+" })
    expect(resetZoomButton.textContent).toContain("110%")

    fireEvent.keyDown(window, { key: "-" })
    expect(resetZoomButton.textContent).toContain("100%")

    fireEvent.keyDown(window, { key: "=" })
    expect(resetZoomButton.textContent).toContain("110%")

    fireEvent.keyDown(window, { key: "0" })
    expect(resetZoomButton.textContent).toContain("100%")
  })

  it("closes on backdrop click and stays open when clicking inside the panel", () => {
    const items: AssistantTraceItem[] = [
      {
        id: "image-1",
        kind: "image",
        timestamp: 1,
        label: "Image",
        title: "first.png",
        src: "https://example.com/first.png",
        mimeType: "image/png",
        width: 512,
        height: 512,
        alt: "First preview",
        status: "completed",
      },
    ]
    const { getByRole, queryByRole } = renderThread([
      assistantTraceTurn("assistant-images", items, false),
    ])

    fireEvent.click(getByRole("button", { name: "Preview First preview" }))

    const panel = document.querySelector(".trace-image-lightbox-panel") as HTMLElement
    fireEvent.click(panel)
    expect(getByRole("dialog", { name: "First preview" })).toBeInTheDocument()

    const backdrop = document.querySelector(".trace-image-lightbox-backdrop") as HTMLElement
    fireEvent.click(backdrop)
    expect(queryByRole("dialog", { name: "First preview" })).toBeNull()
  })

  it("does not open the preview when image loading fails", () => {
    const items: AssistantTraceItem[] = [
      {
        id: "image-1",
        kind: "image",
        timestamp: 1,
        label: "Image",
        title: "broken.png",
        src: "https://example.com/broken.png",
        mimeType: "image/png",
        width: 512,
        height: 512,
        alt: "Broken preview",
        status: "completed",
      },
    ]
    const { getByAltText, getByRole, queryByRole } = renderThread([
      assistantTraceTurn("assistant-images", items, false),
    ])

    const thumbnail = getByAltText("Broken preview")
    fireEvent.error(thumbnail)

    const previewButton = getByRole("button", { name: "Preview Broken preview" }) as HTMLButtonElement
    expect(previewButton.disabled).toBe(true)

    fireEvent.click(previewButton)
    expect(queryByRole("dialog", { name: "Broken preview" })).toBeNull()
  })
})

describe("ThreadView trace collapse", () => {
  it("collapses completed reasoning to the first line and expands from the section", () => {
    const { container, getByText } = renderThread([
      assistantTraceTurn(
        "assistant-1",
        [
          {
            id: "reasoning-1",
            kind: "reasoning",
            timestamp: 1,
            label: "Reasoning",
            text: "Inspect files first\nThen compare the rendering states",
            status: "completed",
          },
        ],
        false,
      ),
    ])

    expect(container.textContent).toContain("Inspect files first")
    expect(container.textContent).not.toContain("Then compare the rendering states")

    const reasoningToggle = getByText("Inspect files first").closest('[role="button"]')
    expect(reasoningToggle).not.toBeNull()

    fireEvent.click(reasoningToggle!)

    expect(container.textContent).toContain("Then compare the rendering states")
  })

  it("keeps streaming reasoning open, then collapses reasoning and tool content when the turn completes", () => {
    const streamingItems: AssistantTraceItem[] = [
      {
        id: "reasoning-1",
        kind: "reasoning",
        timestamp: 1,
        label: "Reasoning",
        text: "Inspect files first\nThen compare the rendering states",
        status: "running",
        isStreaming: true,
      },
      {
        id: "tool-1",
        kind: "tool",
        timestamp: 1,
        label: "Tool",
        title: "Shell",
        detail: "Get-Content ThreadView.tsx",
        status: "running",
        isStreaming: true,
      },
    ]
    const completedItems: AssistantTraceItem[] = [
      {
        ...streamingItems[0],
        status: "completed",
        isStreaming: false,
      },
      {
        ...streamingItems[1],
        detail: "Read ThreadView.tsx",
        status: "completed",
        isStreaming: false,
      },
    ]
    const { container, getByRole, props, rerender } = renderThread([
      assistantTraceTurn("assistant-1", streamingItems, true),
    ])

    expect(container.textContent).toContain("Then compare the rendering states")

    fireEvent.click(getByRole("button", { name: /Shell/ }))
    expect(container.textContent).toContain("Input")

    rerender(<ThreadView {...props} activeTurns={[assistantTraceTurn("assistant-1", completedItems, false)]} />)

    expect(container.textContent).toContain("Inspect files first")
    expect(container.textContent).not.toContain("Then compare the rendering states")
    expect(container.textContent).not.toContain("Input")
  })
})

describe("ThreadView assistant response markdown", () => {
  it("opens external links from reasoning trace text", () => {
    window.desktop = {
      openExternalUrl: vi.fn().mockResolvedValue({
        ok: true,
        url: "https://www.baidu.com/",
      }),
    } as unknown as Window["desktop"]

    const { getByRole } = renderThread([
      assistantTraceTurn(
        "assistant-1",
        [
          {
            id: "reasoning-1",
            kind: "reasoning",
            timestamp: 1,
            label: "Reasoning",
            text: "The user asked for https://www.baidu.com",
            status: "running",
          },
        ],
        true,
      ),
    ])

    fireEvent.click(getByRole("link", { name: "https://www.baidu.com" }))

    expect(window.desktop?.openExternalUrl).toHaveBeenCalledWith({
      url: "https://www.baidu.com/",
    })
  })

  it("opens external links on pointer release and suppresses the following click", () => {
    window.desktop = {
      openExternalUrl: vi.fn().mockResolvedValue({
        ok: true,
        url: "https://www.baidu.com/",
      }),
    } as unknown as Window["desktop"]

    const { getByRole } = renderThread([
      assistantTraceTurn(
        "assistant-1",
        [
          {
            id: "response-1",
            kind: "text",
            timestamp: 1,
            label: "Assistant",
            text: "https://www.baidu.com",
            status: "running",
            isStreaming: true,
          },
        ],
        true,
      ),
    ])
    const link = getByRole("link", { name: "https://www.baidu.com" })

    fireEvent.pointerUp(link, { button: 0, clientX: 120, clientY: 80 })
    fireEvent.click(link, { button: 0, clientX: 120, clientY: 80 })

    expect(window.desktop?.openExternalUrl).toHaveBeenCalledTimes(1)
    expect(window.desktop?.openExternalUrl).toHaveBeenCalledWith({
      url: "https://www.baidu.com/",
    })
  })

  it("opens external links when an overlay receives the click above a thread link", () => {
    window.desktop = {
      openExternalUrl: vi.fn().mockResolvedValue({
        ok: true,
        url: "https://www.baidu.com/",
      }),
    } as unknown as Window["desktop"]
    const originalElementsFromPoint = document.elementsFromPoint

    const { getByRole } = renderThread([
      assistantTraceTurn(
        "assistant-1",
        [
          {
            id: "response-1",
            kind: "text",
            timestamp: 1,
            label: "Assistant",
            text: "https://www.baidu.com",
            status: "running",
            isStreaming: true,
          },
        ],
        true,
      ),
    ])
    const link = getByRole("link", { name: "https://www.baidu.com" })
    const overlay = document.createElement("div")
    document.body.appendChild(overlay)

    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: vi.fn(() => [overlay, link]),
    })

    try {
      fireEvent.click(overlay, { clientX: 12, clientY: 24 })
    } finally {
      if (originalElementsFromPoint) {
        Object.defineProperty(document, "elementsFromPoint", {
          configurable: true,
          value: originalElementsFromPoint,
        })
      } else {
        Reflect.deleteProperty(document, "elementsFromPoint")
      }
      overlay.remove()
    }

    expect(window.desktop?.openExternalUrl).toHaveBeenCalledWith({
      url: "https://www.baidu.com/",
    })
  })

  it("renders assistant response markdown as semantic elements", () => {
    const { container, getByRole } = renderThread([
      assistantTraceTurn(
        "assistant-1",
        [
          {
            id: "response-1",
            kind: "text",
            timestamp: 1,
            label: "Assistant",
            text: [
              "## Release notes",
              "",
              "**Ready** to ship.",
              "",
              "| File | Status |",
              "| --- | --- |",
              "| `ThreadView.tsx` | done |",
            ].join("\n"),
            status: "completed",
          },
        ],
        false,
      ),
    ])

    expect(getByRole("heading", { name: "Release notes" })).toBeInTheDocument()
    expect(container.querySelector("strong")?.textContent).toBe("Ready")
    expect(getByRole("table")).toBeInTheDocument()
    expect(container.querySelector(".assistant-section.is-response .thread-markdown")).not.toBeNull()
  })

  it("opens local file links from completed assistant response markdown", () => {
    const onLocalFileLinkOpen = vi.fn()
    const { getByRole } = renderThread([
      assistantTraceTurn(
        "assistant-1",
        [
          {
            id: "response-1",
            kind: "text",
            timestamp: 1,
            label: "Assistant",
            text: "[ThreadView.tsx](C:/Projects/fanfande_studio/packages/desktop/src/renderer/src/app/thread/ThreadView.tsx:42)",
            status: "completed",
          },
        ],
        false,
      ),
    ], {
      onLocalFileLinkOpen,
    })

    fireEvent.click(getByRole("link", { name: "ThreadView.tsx" }))

    expect(onLocalFileLinkOpen).toHaveBeenCalledWith({
      lineRange: {
        startLineNumber: 42,
        endLineNumber: 42,
      },
      path: "C:/Projects/fanfande_studio/packages/desktop/src/renderer/src/app/thread/ThreadView.tsx",
    })
  })

  it("opens local file links from streaming assistant response rich text", () => {
    const onLocalFileLinkOpen = vi.fn()
    const { getByRole } = renderThread([
      assistantTraceTurn(
        "assistant-1",
        [
          {
            id: "response-1",
            kind: "text",
            timestamp: 1,
            label: "Assistant",
            text: String.raw`[index.html](C:\新建文件夹 (4)\index.html)`,
            status: "running",
            isStreaming: true,
          },
        ],
        true,
      ),
    ], {
      onLocalFileLinkOpen,
    })

    fireEvent.click(getByRole("link", { name: "index.html" }))

    expect(onLocalFileLinkOpen).toHaveBeenCalledWith({
      lineRange: null,
      path: String.raw`C:\新建文件夹 (4)\index.html`,
    })
  })

  function createProposedPlan(title = "Plan Title") {
    return [
      "<proposed_plan>",
      `# ${title}`,
      "",
      "## Summary",
      "Do the work.",
      "",
      "## Implementation",
      "Change the files.",
      "",
      "## Tests",
      "Run checks.",
      "</proposed_plan>",
    ].join("\n")
  }

  it("renders the latest complete proposed plan as actionable", () => {
    const onProposedPlanConfirm = vi.fn()
    const proposedPlan = createProposedPlan()

    const { getByRole, queryByText } = renderThread([
      assistantTraceTurn("assistant-1", [
        {
          id: "response-1",
          kind: "text",
          timestamp: 1,
          label: "Assistant",
          text: proposedPlan,
          status: "completed",
        },
      ], false),
    ], {
      onProposedPlanConfirm,
    })

    expect(getByRole("article", { name: "Proposed plan" })).toBeInTheDocument()
    expect(getByRole("heading", { name: "Plan Title" })).toBeInTheDocument()
    expect(queryByText("<proposed_plan>")).not.toBeInTheDocument()
    expect(getByRole("button", { name: "取消" })).toBeEnabled()
    expect(getByRole("button", { name: "确认实施" })).toBeEnabled()
  })

  it("removes proposed plan actions and shows cancelled state after cancel", () => {
    const onProposedPlanConfirm = vi.fn()
    const proposedPlan = createProposedPlan()

    const { getByRole, queryByRole, getByText } = renderThread([
      assistantTraceTurn("assistant-1", [
        {
          id: "response-1",
          kind: "text",
          timestamp: 1,
          label: "Assistant",
          text: proposedPlan,
          status: "completed",
        },
      ], false),
    ], {
      onProposedPlanConfirm,
    })

    fireEvent.click(getByRole("button", { name: "取消" }))

    expect(getByText("已取消")).toBeInTheDocument()
    expect(queryByRole("button", { name: "取消" })).not.toBeInTheDocument()
    expect(queryByRole("button", { name: "确认实施" })).not.toBeInTheDocument()
    expect(onProposedPlanConfirm).not.toHaveBeenCalled()
  })

  it("removes proposed plan actions and shows confirmed state after confirm", async () => {
    const onProposedPlanConfirm = vi.fn().mockResolvedValue(undefined)
    const proposedPlan = createProposedPlan()

    const { getByRole, queryByRole, getByText } = renderThread([
      assistantTraceTurn("assistant-1", [
        {
          id: "response-1",
          kind: "text",
          timestamp: 1,
          label: "Assistant",
          text: proposedPlan,
          status: "completed",
        },
      ], false),
    ], {
      onProposedPlanConfirm,
    })

    fireEvent.click(getByRole("button", { name: "确认实施" }))

    expect(onProposedPlanConfirm).toHaveBeenCalledWith({ planMarkdown: proposedPlan })
    await waitFor(() => expect(getByText("已确认")).toBeInTheDocument())
    expect(queryByRole("button", { name: "取消" })).not.toBeInTheDocument()
    expect(queryByRole("button", { name: "确认实施" })).not.toBeInTheDocument()
  })

  it("keeps proposed plan actions available and shows an error when confirm fails", async () => {
    const onProposedPlanConfirm = vi.fn().mockRejectedValue(new Error("Approval failed"))
    const proposedPlan = createProposedPlan()

    const { getByRole, getByText } = renderThread([
      assistantTraceTurn("assistant-1", [
        {
          id: "response-1",
          kind: "text",
          timestamp: 1,
          label: "Assistant",
          text: proposedPlan,
          status: "completed",
        },
      ], false),
    ], {
      onProposedPlanConfirm,
    })

    fireEvent.click(getByRole("button", { name: "确认实施" }))

    await waitFor(() => expect(getByText("Approval failed")).toBeInTheDocument())
    expect(getByRole("button", { name: "取消" })).toBeEnabled()
    expect(getByRole("button", { name: "确认实施" })).toBeEnabled()
  })

  it("renders historical complete proposed plans without actions", () => {
    const proposedPlan = createProposedPlan("Historical Plan")

    const { getByRole, queryByRole, queryByText } = renderThread([
      assistantTraceTurn("assistant-1", [
        {
          id: "response-1",
          kind: "text",
          timestamp: 1,
          label: "Assistant",
          text: proposedPlan,
          status: "completed",
        },
      ], false),
      userTurn("user-1", "Thanks"),
    ])

    expect(getByRole("heading", { name: "Historical Plan" })).toBeInTheDocument()
    expect(queryByText("已过期")).not.toBeInTheDocument()
    expect(queryByRole("button", { name: "取消" })).not.toBeInTheDocument()
    expect(queryByRole("button", { name: "确认实施" })).not.toBeInTheDocument()
  })

  it("hides proposed plan actions once a newer turn appears", () => {
    const onProposedPlanConfirm = vi.fn()
    const proposedPlan = createProposedPlan("Fresh Plan")
    const planTurn = assistantTraceTurn("assistant-1", [
      {
        id: "response-1",
        kind: "text",
        timestamp: 1,
        label: "Assistant",
        text: proposedPlan,
        status: "completed",
      },
    ], false)

    const { getByRole, props, queryByRole, queryByText, rerender } = renderThread([planTurn], {
      onProposedPlanConfirm,
    })

    expect(getByRole("button", { name: "取消" })).toBeEnabled()
    expect(getByRole("button", { name: "确认实施" })).toBeEnabled()

    rerender(<ThreadView {...props} activeTurns={[planTurn, userTurn("user-1", "Continue")]} />)

    expect(getByRole("heading", { name: "Fresh Plan" })).toBeInTheDocument()
    expect(queryByText("已过期")).not.toBeInTheDocument()
    expect(queryByRole("button", { name: "取消" })).not.toBeInTheDocument()
    expect(queryByRole("button", { name: "确认实施" })).not.toBeInTheDocument()
  })

  it("renders streaming proposed plan responses immediately with disabled actions", () => {
    const onProposedPlanConfirm = vi.fn()
    const proposedPlan = [
      "<proposed_plan>",
      "# Streaming Plan",
      "",
      "## Summary",
      "Still drafting.",
    ].join("\n")

    const { getByRole, queryByText } = renderThread([
      assistantTraceTurn(
        "assistant-1",
        [
          {
            id: "response-1",
            kind: "text",
            timestamp: 1,
            label: "Assistant",
            text: proposedPlan,
            status: "running",
            isStreaming: true,
          },
        ],
        true,
      ),
    ], {
      onProposedPlanConfirm,
    })

    expect(getByRole("article", { name: "Proposed plan" })).toBeInTheDocument()
    expect(getByRole("heading", { name: "Streaming Plan" })).toBeInTheDocument()
    expect(queryByText("<proposed_plan>")).not.toBeInTheDocument()
    expect(getByRole("button", { name: "取消" })).toBeDisabled()
    expect(getByRole("button", { name: "确认实施" })).toBeDisabled()

    fireEvent.click(getByRole("button", { name: "确认实施" }))
    expect(onProposedPlanConfirm).not.toHaveBeenCalled()
  })

  it("enables proposed plan actions when the close tag arrives during streaming", () => {
    const onProposedPlanConfirm = vi.fn()
    const partialPlan = [
      "<proposed_plan>",
      "# Streaming Plan",
      "",
      "## Summary",
      "Still drafting.",
    ].join("\n")
    const completePlan = [
      partialPlan,
      "",
      "## Tests",
      "Run checks.",
      "</proposed_plan>",
    ].join("\n")
    const buildResponseItem = (text: string): AssistantTraceItem => ({
      id: "response-1",
      kind: "text",
      timestamp: 1,
      label: "Assistant",
      text,
      status: "running",
      isStreaming: true,
    })

    const { getByRole, props, rerender } = renderThread([
      assistantTraceTurn("assistant-1", [buildResponseItem(partialPlan)], true),
    ], {
      onProposedPlanConfirm,
    })

    expect(getByRole("button", { name: "确认实施" })).toBeDisabled()

    rerender(<ThreadView {...props} activeTurns={[assistantTraceTurn("assistant-1", [buildResponseItem(completePlan)], true)]} />)

    expect(getByRole("button", { name: "取消" })).toBeEnabled()
    expect(getByRole("button", { name: "确认实施" })).toBeEnabled()

    fireEvent.click(getByRole("button", { name: "确认实施" }))
    expect(onProposedPlanConfirm).toHaveBeenCalledWith({ planMarkdown: completePlan })
  })

  it("keeps reasoning and tool markdown-like content as plain rich text", () => {
    const { container, getByRole, queryByRole } = renderThread([
      assistantTraceTurn(
        "assistant-1",
        [
          {
            id: "reasoning-1",
            kind: "reasoning",
            timestamp: 1,
            label: "Reasoning",
            text: "## Thinking\n\n**Plain reasoning**",
            status: "running",
            isStreaming: true,
          },
          {
            id: "tool-1",
            kind: "tool",
            timestamp: 1,
            label: "Tool",
            title: "Shell",
            detail: "## Tool output\n\n**Plain tool output**",
            status: "completed",
          },
        ],
        true,
      ),
    ])

    expect(queryByRole("heading", { name: "Thinking" })).toBeNull()
    expect(container.textContent).toContain("## Thinking")

    fireEvent.click(getByRole("button", { name: /Shell/ }))
    fireEvent.click(getByRole("button", { name: /Shell output/ }))

    expect(queryByRole("heading", { name: "Tool output" })).toBeNull()
    expect(container.textContent).toContain("## Tool output")
  })

  it("keeps streaming responses on the lightweight rich text path", () => {
    const { container } = renderThread([
      assistantTraceTurn(
        "assistant-1",
        [
          {
            id: "response-1",
            kind: "text",
            timestamp: 1,
            label: "Assistant",
            text: "**Streaming**",
            status: "running",
            isStreaming: true,
          },
        ],
        true,
      ),
    ])
    const streamingResponse = container.querySelector(
      ".assistant-section.is-response .trace-item.is-streaming .trace-item-text",
    )

    expect(streamingResponse).not.toBeNull()
    expect(streamingResponse).not.toHaveClass("thread-markdown")
    expect(streamingResponse?.textContent).toContain("**Streaming**")
  })
})

describe("ThreadView message actions", () => {
  it("copies user message text from the user turn action", () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })

    const { getByRole } = renderThread([userTurn("user-1", "Hello from user")])

    fireEvent.click(getByRole("button", { name: "Copy user message" }))

    expect(writeText).toHaveBeenCalledWith("Hello from user")
  })

  it("renders steering submission status on user turns", () => {
    renderThread([
      {
        ...userTurn("user-steer", "Adjust the current task"),
        submissionMode: "steer",
      },
    ])

    expect(screen.getByText("提交，但不中断模型运行")).toBeInTheDocument()
    expect(screen.getByText("下次模型/工具调用后")).toBeInTheDocument()
  })

  it("renders stream-inserted steer turns between live assistant trace items", () => {
    const insertedTurn: UserTurn = {
      ...userTurn("user-steer", "Adjust the current task"),
      submissionMode: "steer",
      streamInsertion: {
        assistantTurnID: "assistant-live",
        afterItemCount: 1,
      },
    }
    const { container } = renderThread([
      assistantTraceTurn(
        "assistant-live",
        [
          {
            id: "assistant-before",
            kind: "text",
            timestamp: 1,
            label: "Assistant",
            text: "Before steer",
            status: "completed",
          },
          {
            id: "assistant-after",
            kind: "text",
            timestamp: 2,
            label: "Assistant",
            text: "After steer",
            status: "running",
          },
        ],
        true,
      ),
      insertedTurn,
    ])

    const text = container.textContent ?? ""
    expect(text.indexOf("Before steer")).toBeLessThan(text.indexOf("Adjust the current task"))
    expect(text.indexOf("Adjust the current task")).toBeLessThan(text.indexOf("After steer"))
    expect(container.querySelectorAll(".user-turn")).toHaveLength(1)
    expect(container.querySelector(".assistant-stream-insertion-user-turn")).not.toBeNull()
  })

  it("places stream-inserted steer turns after the following tool call", () => {
    const insertedTurn: UserTurn = {
      ...userTurn("user-steer", "Hello during tool step"),
      submissionMode: "steer",
      streamInsertion: {
        assistantTurnID: "assistant-live",
        afterItemCount: 1,
      },
    }
    const { container } = renderThread([
      assistantTraceTurn(
        "assistant-live",
        [
          {
            id: "assistant-before",
            kind: "text",
            timestamp: 1,
            label: "Assistant",
            text: "I will load a skill",
            status: "completed",
          },
          {
            id: "assistant-tool",
            kind: "tool",
            timestamp: 2,
            label: "Tool",
            title: "load-skill",
            status: "completed",
          },
          {
            id: "assistant-after",
            kind: "text",
            timestamp: 3,
            label: "Assistant",
            text: "After the steer",
            status: "running",
          },
        ],
        true,
      ),
      insertedTurn,
    ])

    const text = container.textContent ?? ""
    expect(text.indexOf("I will load a skill")).toBeLessThan(text.indexOf("load-skill"))
    expect(text.indexOf("load-skill")).toBeLessThan(text.indexOf("Hello during tool step"))
    expect(text.indexOf("Hello during tool step")).toBeLessThan(text.indexOf("After the steer"))
  })

  it("renders user turn file changes after the final assistant output and handles card actions", async () => {
    const onFileChangeSelect = vi.fn()
    const onTurnDiffReview = vi.fn().mockResolvedValue(undefined)
    const onTurnDiffRestore = vi.fn().mockResolvedValue(undefined)
    const confirmRestore = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true)
    const turn: UserTurn = {
      ...userTurn("user-with-diff", "Update the app"),
      diffSummary: {
        stats: {
          files: 2,
          additions: 5,
          deletions: 1,
        },
        diffs: [
          { file: "src/App.tsx", additions: 3, deletions: 1 },
          { file: "src/styles.css", additions: 2, deletions: 0 },
        ],
      },
    }

    const { getByRole, getByText, queryByRole } = renderThread(
      [
        turn,
        assistantTraceTurn(
          "assistant-first",
          [
            {
              id: "response-1",
              kind: "text",
              timestamp: 1,
              label: "Assistant",
              text: "First model call finished.",
              status: "completed",
            },
          ],
          false,
        ),
        assistantTraceTurn(
          "assistant-final",
          [
            {
              id: "response-2",
              kind: "text",
              timestamp: 2,
              label: "Assistant",
              text: "Final answer after file updates.",
              status: "completed",
            },
          ],
          false,
        ),
      ],
      { onFileChangeSelect, onTurnDiffRestore, onTurnDiffReview },
    )

    const summaryButton = getByRole("button", { name: /2 个文件已更改/i })
    const finalAssistantOutput = getByText("Final answer after file updates.")

    expect(summaryButton).toBeInTheDocument()
    expect(finalAssistantOutput.compareDocumentPosition(summaryButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(getByRole("button", { name: /审核/i })).toBeInTheDocument()
    expect(getByRole("button", { name: /撤销/i })).toBeInTheDocument()
    expect(queryByRole("button", { name: /审核\s+src\/App\.tsx/i })).toBeNull()

    fireEvent.click(getByRole("button", { name: "审核" }))
    fireEvent.click(getByRole("button", { name: "展开文件变更" }))
    fireEvent.click(getByRole("button", { name: /审核\s+src\/App\.tsx/i }))
    fireEvent.click(getByRole("button", { name: "收起文件变更" }))
    expect(queryByRole("button", { name: /审核\s+src\/App\.tsx/i })).toBeNull()
    fireEvent.click(getByRole("button", { name: "展开文件变更" }))
    fireEvent.click(getByRole("button", { name: /撤销/i }))

    expect(onFileChangeSelect).toHaveBeenCalledWith("src/App.tsx")
    expect(onTurnDiffReview).toHaveBeenCalledWith(["src/App.tsx", "src/styles.css"])
    expect(confirmRestore).toHaveBeenCalledTimes(1)
    expect(onTurnDiffRestore).not.toHaveBeenCalled()

    fireEvent.click(getByRole("button", { name: /撤销/i }))

    await waitFor(() => {
      expect(onTurnDiffRestore).toHaveBeenCalledWith(["src/App.tsx", "src/styles.css"])
    })
    confirmRestore.mockRestore()
  })

  it("shows user turn restore progress and errors", async () => {
    const confirmRestore = vi.spyOn(window, "confirm").mockReturnValue(true)
    let rejectRestore: (error: Error) => void = () => undefined
    const onTurnDiffRestore = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectRestore = reject
        }),
    )

    renderThread([
      {
        ...userTurn("user-restore-error", "Restore changes"),
        diffSummary: {
          stats: {
            files: 1,
            additions: 1,
            deletions: 0,
          },
          diffs: [{ file: "src/App.tsx", additions: 1, deletions: 0 }],
        },
      },
    ], { onTurnDiffRestore })

    const restoreButton = screen.getByRole("button", { name: /撤销/i })
    fireEvent.click(restoreButton)

    expect(restoreButton).toBeDisabled()

    rejectRestore(new Error("restore failed"))

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("restore failed")
    })
    expect(restoreButton).not.toBeDisabled()
    confirmRestore.mockRestore()
  })

  it("hides the user turn file change summary when the diff is empty", () => {
    renderThread([
      {
        ...userTurn("user-empty-diff", "No changes"),
        diffSummary: {
          diffs: [],
        },
      },
    ])

    expect(screen.queryByRole("button", { name: /个文件已更改/i })).toBeNull()
  })

  it("renders assistant copy and side chat actions as icon buttons", () => {
    const onOpenSideChat = vi.fn()
    const { getByRole, queryByText } = renderThread(
      [
        assistantTraceTurn(
          "assistant-1",
          [
            {
              id: "response-1",
              kind: "text",
              timestamp: 1,
              label: "Assistant",
              text: "Done",
              status: "completed",
            },
          ],
          false,
        ),
      ],
      { onOpenSideChat },
    )

    expect(getByRole("button", { name: "Copy assistant response" })).toBeInTheDocument()
    expect(queryByText("Sidechat")).toBeNull()

    fireEvent.click(getByRole("button", { name: "Open side chat" }))

    expect(onOpenSideChat).toHaveBeenCalledWith("assistant-1")
  })

  it("shows assistant response actions in the assistant message footer for the final response", () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })
    const onOpenSideChat = vi.fn()

    const { getAllByRole, getByRole, getByText } = renderThread(
      [
        assistantTraceTurn(
          "assistant-1",
          [
            {
              id: "response-1",
              kind: "text",
              timestamp: 1,
              label: "Assistant",
              text: "I will check the directory first.",
              status: "completed",
            },
            {
              id: "tool-1",
              kind: "tool",
              timestamp: 2,
              label: "Tool",
              title: "list-directory",
              text: "index.html",
              status: "completed",
            },
            {
              id: "response-2",
              kind: "text",
              timestamp: 3,
              label: "Assistant",
              text: "Deleted. The directory is empty now.",
              status: "completed",
            },
            {
              id: "patch-1",
              kind: "patch",
              timestamp: 4,
              label: "Patch",
              title: "1 file change (+1 -0)",
              fileChanges: [
                {
                  file: "src/index.ts",
                  additions: 1,
                  deletions: 0,
                },
              ],
              status: "completed",
            },
          ],
          false,
        ),
      ],
      { onOpenSideChat },
    )

    const copyButtons = getAllByRole("button", { name: "Copy assistant response" })
    const sideChatButtons = getAllByRole("button", { name: "Open side chat" })
    expect(copyButtons).toHaveLength(1)
    expect(sideChatButtons).toHaveLength(1)

    const actionRow = copyButtons[0]?.closest(".assistant-response-side-chat")
    const assistantShell = copyButtons[0]?.closest(".assistant-shell")
    const firstResponseSection = getByText("I will check the directory first.").closest(".assistant-section")
    const finalResponseSection = getByText("Deleted. The directory is empty now.").closest(".assistant-section")
    const fileChangeSection = getByRole("region", { name: "File Changes" })
    expect(actionRow).not.toBeNull()
    expect(assistantShell?.contains(actionRow)).toBe(true)
    expect(firstResponseSection?.contains(actionRow)).toBe(false)
    expect(finalResponseSection?.contains(actionRow)).toBe(false)
    expect(actionRow?.closest(".assistant-section")).toBeNull()
    expect(fileChangeSection.compareDocumentPosition(actionRow as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.click(copyButtons[0]!)
    expect(writeText).toHaveBeenCalledWith("Deleted. The directory is empty now.")

    fireEvent.click(sideChatButtons[0]!)
    expect(onOpenSideChat).toHaveBeenCalledWith("assistant-1")
  })
})

describe("ThreadView auto-scroll", () => {
  it("follows new content while pinned to the bottom", () => {
    const { rerender, props, threadColumn } = renderThread([assistantTurn("assistant-1", "Working")])
    setScrollMetrics(threadColumn, {
      clientHeight: 400,
      scrollHeight: 1000,
      scrollTop: 600,
    })

    Object.defineProperty(threadColumn, "scrollHeight", {
      configurable: true,
      value: 1200,
    })

    rerender(<ThreadView {...props} activeTurns={[assistantTurn("assistant-1", "Working...")]} />)

    expect(threadColumn.scrollTop).toBe(1200)
  })

  it("does not force-scroll after the user scrolls away from the bottom", () => {
    const { rerender, props, threadColumn } = renderThread([assistantTurn("assistant-1", "Working")])
    setScrollMetrics(threadColumn, {
      clientHeight: 400,
      scrollHeight: 1000,
      scrollTop: 520,
    })
    fireEvent.scroll(threadColumn)

    Object.defineProperty(threadColumn, "scrollHeight", {
      configurable: true,
      value: 1200,
    })

    rerender(<ThreadView {...props} activeTurns={[assistantTurn("assistant-1", "Working...")]} />)

    expect(threadColumn.scrollTop).toBe(520)
  })
})
