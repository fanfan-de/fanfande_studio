import { expect, test } from "bun:test"
import { cancel, state } from "#session/prompt.ts"

test("cancel can run without a project async context", () => {
  const sessionID = `session_cancel_${Date.now()}`
  const controller = new AbortController()

  state()[sessionID] = { abort: controller }

  expect(() => cancel(sessionID)).not.toThrow()
  expect(controller.signal.aborted).toBe(true)
  expect(state()[sessionID]).toBeUndefined()
})
