import { expect, test } from "bun:test"
import "./sqlite.cleanup.ts"
import * as Identifier from "#id/id.ts"
import * as Message from "#session/core/message.ts"
import { cancel, cancelSession, state } from "#session/core/prompt.ts"
import * as Session from "#session/core/session.ts"
import * as EventStore from "#session/runtime/event-store.ts"
import * as Orchestrator from "#session/runtime/orchestrator.ts"

test("cancel can run without a project async context", () => {
  const sessionID = `session_cancel_${Date.now()}`
  const controller = new AbortController()

  state()[sessionID] = { abort: controller }

  expect(() => cancel(sessionID)).not.toThrow()
  expect(controller.signal.aborted).toBe(true)
  expect(state()[sessionID]).toBeUndefined()
})

test("active session cancel delays terminal turn cancellation until prompt cleanup", () => {
  const sessionID = Identifier.ascending("session")
  const turnID = Identifier.ascending("turn")
  Session.createTurn({
    id: turnID,
    sessionID,
    projectID: "project_prompt_cancel_test",
  })
  const turn = Orchestrator.startTurn({
    sessionID,
    turnID,
  })

  try {
    cancelSession(sessionID)

    const cancelEvents = EventStore.listTurnEvents({ sessionID, turnID })
      .filter((event) => event.type === "turn.state.changed" || event.type === "turn.cancelled")

    expect(cancelEvents.map((event) => event.type)).toEqual(["turn.state.changed"])
    expect(cancelEvents[0]?.payload).toMatchObject({
      phase: "cancelled",
      reason: "Prompt cancellation requested.",
    })

    const part = Message.TextPart.parse({
      id: Identifier.ascending("part"),
      sessionID,
      messageID: Identifier.ascending("message"),
      type: "text",
      text: "partial response",
    })

    turn.emit("part.recorded", { part })

    expect(Session.DataBaseRead("parts", part.id)).toMatchObject({
      id: part.id,
      text: "partial response",
    })
  } finally {
    Orchestrator.finishTurn(turn)
  }
})
