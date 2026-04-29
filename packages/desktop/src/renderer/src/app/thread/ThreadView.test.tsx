import { createRef } from "react"
import { fireEvent, render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { DEFAULT_ASSISTANT_TRACE_VISIBILITY, type AssistantTurn, type SessionSummary, type Turn } from "../types"
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

function renderThread(activeTurns: Turn[]) {
  const threadColumnRef = createRef<HTMLDivElement | null>()
  const props = {
    activeSession: session,
    activeTurns,
    assistantTraceVisibility: DEFAULT_ASSISTANT_TRACE_VISIBILITY,
    isAgentDebugTraceEnabled: false,
    isResolvingPermissionRequest: false,
    isSendingQuestionAnswer: false,
    pendingPermissionRequests: [],
    permissionRequestActionError: null,
    permissionRequestActionRequestID: null,
    sideChatCountsByAnchorMessageID: {},
    threadColumnRef,
    onAskUserQuestionAnswer: vi.fn(),
    onPermissionRequestResponse: vi.fn(),
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
