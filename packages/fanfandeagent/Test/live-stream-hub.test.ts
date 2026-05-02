import { describe, expect, it } from "bun:test"
import * as Identifier from "#id/id.ts"
import * as LiveStreamHub from "#session/runtime/live-stream-hub.ts"
import * as RuntimeEvent from "#session/runtime/runtime-event.ts"

function createFactory() {
  return RuntimeEvent.createRuntimeEventFactory({
    sessionID: Identifier.ascending("session"),
    turnID: Identifier.ascending("turn"),
  })
}

describe("live stream hub", () => {
  it("coalesces queued text deltas for slow subscribers", async () => {
    const factory = createFactory()
    const first = factory.next("text.part.delta", {
      messageID: "assistant-1",
      partID: "part-1",
      kind: "text",
      delta: "hel",
    })
    const second = factory.next("text.part.delta", {
      messageID: "assistant-1",
      partID: "part-1",
      kind: "text",
      delta: "lo",
    })
    const subscription = LiveStreamHub.subscribe({
      sessionID: first.sessionID,
      turnID: first.turnID,
      closeOnTerminalTurn: false,
    })

    try {
      LiveStreamHub.publish(first)
      LiveStreamHub.publish(second)

      const next = await subscription.next()
      expect(next?.type).toBe("text.part.delta")
      expect(next?.seq).toBe(second.seq)
      expect(next?.payload.delta).toBe("hello")
    } finally {
      subscription.close()
    }
  })

  it("coalesces queued tool input deltas for slow subscribers", async () => {
    const factory = createFactory()
    const first = factory.next("tool.input.delta", {
      messageID: "assistant-1",
      partID: "tool-part-1",
      toolCallID: "call-1",
      toolName: "write",
      delta: "{\"p",
      rawLength: 3,
    })
    const second = factory.next("tool.input.delta", {
      messageID: "assistant-1",
      partID: "tool-part-1",
      toolCallID: "call-1",
      toolName: "write",
      delta: "\":1}",
      rawLength: 7,
    })
    const subscription = LiveStreamHub.subscribe({
      sessionID: first.sessionID,
      turnID: first.turnID,
      closeOnTerminalTurn: false,
    })

    try {
      LiveStreamHub.publish(first)
      LiveStreamHub.publish(second)

      const next = await subscription.next()
      expect(next?.type).toBe("tool.input.delta")
      expect(next?.seq).toBe(second.seq)
      expect(next?.payload.delta).toBe("{\"p\":1}")
      expect(next?.payload.rawLength).toBe(7)
    } finally {
      subscription.close()
    }
  })

  it("drops transient deltas before closing slow subscribers with non-transient queues", () => {
    const sessionID = Identifier.ascending("session")
    const turnID = Identifier.ascending("turn")
    const eventFactory = RuntimeEvent.createRuntimeEventFactory({
      sessionID,
      turnID,
    })
    const subscription = LiveStreamHub.subscribe({
      sessionID,
      closeOnTerminalTurn: false,
    })
    const before = LiveStreamHub.snapshot().totals.closedSlowClients

    try {
      LiveStreamHub.publish(eventFactory.next("text.part.delta", {
        messageID: "assistant-1",
        partID: "part-1",
        kind: "text",
        delta: "drop-me",
      }))

      for (let index = 0; index < 1000; index += 1) {
        LiveStreamHub.publish(eventFactory.next("turn.started", {}))
      }

      expect(LiveStreamHub.snapshot().totals.droppedEvents).toBeGreaterThan(0)

      LiveStreamHub.publish(eventFactory.next("turn.started", {}))

      expect(LiveStreamHub.snapshot().totals.closedSlowClients).toBeGreaterThan(before)
    } finally {
      subscription.close()
    }
  })
})
