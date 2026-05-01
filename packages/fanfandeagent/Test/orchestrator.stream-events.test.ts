import { describe, expect, it } from "bun:test"
import "./sqlite.cleanup.ts"
import * as Identifier from "#id/id.ts"
import * as EventStore from "#session/runtime/event-store.ts"
import * as Orchestrator from "#session/runtime/orchestrator.ts"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe("turn stream events", () => {
  it("queues transient stream events off the emit call stack", async () => {
    const turn = Orchestrator.startTurn({
      sessionID: Identifier.ascending("session"),
    })
    const observed: string[] = []
    const unsubscribe = EventStore.subscribe((event) => {
      if (event.type === "text.part.delta") {
        observed.push(event.type)
      }
    })

    try {
      turn.emitStream("text.part.delta", {
        messageID: "assistant-1",
        partID: "part-1",
        kind: "text",
        delta: "hello",
      })

      expect(observed).toEqual([])

      await sleep(1)

      expect(observed).toEqual(["text.part.delta"])
    } finally {
      unsubscribe()
      Orchestrator.finishTurn(turn)
    }
  })

  it("flushes queued stream events before synchronous terminal events", () => {
    const turn = Orchestrator.startTurn({
      sessionID: Identifier.ascending("session"),
    })
    const observed: string[] = []
    const unsubscribe = EventStore.subscribe((event) => {
      if (event.turnID === turn.turnID) {
        observed.push(event.type)
      }
    })

    try {
      turn.emitStream("text.part.delta", {
        messageID: "assistant-1",
        partID: "part-1",
        kind: "text",
        delta: "hello",
      })
      turn.emit("turn.completed", {
        status: "completed",
      })

      expect(observed).toEqual(["text.part.delta", "turn.completed"])
    } finally {
      unsubscribe()
      Orchestrator.finishTurn(turn)
    }
  })
})
