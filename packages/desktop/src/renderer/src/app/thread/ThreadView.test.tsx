import { createRef, type ComponentProps } from "react"
import { fireEvent, render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { DEFAULT_ASSISTANT_TRACE_VISIBILITY, type AssistantTraceItem, type AssistantTurn, type SessionSummary, type Turn, type UserTurn } from "../types"
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
