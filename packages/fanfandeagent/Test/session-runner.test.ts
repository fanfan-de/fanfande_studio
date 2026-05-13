import { describe, expect, it } from "bun:test"
import * as Identifier from "#id/id.ts"
import * as Orchestrator from "#session/runtime/orchestrator.ts"
import { SessionLimitError } from "#session/runtime/session-limits.ts"
import * as SessionRunner from "#session/runtime/session-runner.ts"

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (error: unknown) => void
}

function deferred<T = void>(): Deferred<T> {
  let resolve!: Deferred<T>["resolve"]
  let reject!: Deferred<T>["reject"]
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })
  return { promise, resolve, reject }
}

function testSessionID() {
  return Identifier.ascending("session")
}

function testDirectory() {
  return `C:\\tmp\\${Identifier.ascending("project")}`
}

async function withEnv(name: string, value: string, fn: () => Promise<void>) {
  const previous = process.env[name]
  process.env[name] = value
  try {
    await fn()
  } finally {
    if (previous === undefined) {
      delete process.env[name]
    } else {
      process.env[name] = previous
    }
  }
}

describe("session runner", () => {
  it("serializes operations for the same session", async () => {
    const sessionID = testSessionID()
    const directory = testDirectory()
    const firstStarted = deferred()
    const firstDone = deferred()
    const order: string[] = []

    const first = SessionRunner.enqueuePrompt({
      sessionID,
      directory,
      type: "prompt",
      execute: async () => {
        order.push("first:start")
        firstStarted.resolve()
        await firstDone.promise
        order.push("first:end")
        return "first"
      },
    })
    expect(first.mode).toBe("new-turn")

    await firstStarted.promise

    const second = SessionRunner.enqueueResume({
      sessionID,
      directory,
      type: "resume",
      execute: async () => {
        order.push("second:start")
        return "second"
      },
    })

    expect(second.mode).toBe("queued")
    expect(SessionRunner.info(sessionID)?.queueLength).toBe(1)
    expect(order).toEqual(["first:start"])

    firstDone.resolve()

    await expect(first.promise).resolves.toBe("first")
    await expect(second.promise).resolves.toBe("second")
    await SessionRunner.waitForIdle(sessionID)

    expect(order).toEqual(["first:start", "first:end", "second:start"])
    expect(SessionRunner.info(sessionID)?.status).toBe("idle")
  })

  it("runs different sessions concurrently", async () => {
    const firstSessionID = testSessionID()
    const secondSessionID = testSessionID()
    const directory = testDirectory()
    const firstStarted = deferred()
    const secondStarted = deferred()
    const releaseBoth = deferred()
    const order: string[] = []

    const first = SessionRunner.enqueuePrompt({
      sessionID: firstSessionID,
      directory,
      type: "prompt",
      execute: async () => {
        order.push("first:start")
        firstStarted.resolve()
        await releaseBoth.promise
        return "first"
      },
    })
    const second = SessionRunner.enqueuePrompt({
      sessionID: secondSessionID,
      directory: `${directory}-other`,
      type: "prompt",
      execute: async () => {
        order.push("second:start")
        secondStarted.resolve()
        await releaseBoth.promise
        return "second"
      },
    })

    await Promise.all([firstStarted.promise, secondStarted.promise])

    expect(first.mode).toBe("new-turn")
    expect(second.mode).toBe("new-turn")
    expect(order).toEqual(["first:start", "second:start"])

    releaseBoth.resolve()

    await expect(first.promise).resolves.toBe("first")
    await expect(second.promise).resolves.toBe("second")
    await Promise.all([
      SessionRunner.waitForIdle(firstSessionID),
      SessionRunner.waitForIdle(secondSessionID),
    ])
  })

  it("waits for idle with a promise instead of polling callers", async () => {
    const sessionID = testSessionID()
    const directory = testDirectory()
    const started = deferred()
    const finish = deferred()
    let idleResolved = false

    SessionRunner.enqueuePrompt({
      sessionID,
      directory,
      type: "prompt",
      execute: async () => {
        started.resolve()
        await finish.promise
        return "done"
      },
    })

    await started.promise
    const wait = SessionRunner.waitForIdle(sessionID).then(() => {
      idleResolved = true
    })

    await Promise.resolve()
    expect(idleResolved).toBe(false)

    finish.resolve()
    await wait

    expect(idleResolved).toBe(true)
  })

  it("keeps queued operations after cancel and runs them after the active operation finishes", async () => {
    const sessionID = testSessionID()
    const directory = testDirectory()
    const started = deferred<SessionRunner.PromptRuntime>()
    const sawAbort = deferred()
    const finishFirst = deferred()
    const secondStarted = deferred()

    const first = SessionRunner.enqueuePrompt({
      sessionID,
      directory,
      type: "prompt",
      execute: async (runtime) => {
        started.resolve(runtime)
        runtime.abort.addEventListener("abort", () => {
          sawAbort.resolve()
        }, { once: true })
        await finishFirst.promise
        return "first"
      },
    })

    await started.promise

    const second = SessionRunner.enqueuePrompt({
      sessionID,
      directory,
      type: "prompt",
      execute: async () => {
        secondStarted.resolve()
        return "second"
      },
    })

    expect(second.mode).toBe("queued")
    expect(SessionRunner.cancel(sessionID)).toBe(true)
    expect(SessionRunner.info(sessionID)?.status).toBe("cancelling")

    await sawAbort.promise
    expect(SessionRunner.info(sessionID)?.queueLength).toBe(1)

    finishFirst.resolve()

    await expect(first.promise).resolves.toBe("first")
    await secondStarted.promise
    await expect(second.promise).resolves.toBe("second")
    await SessionRunner.waitForIdle(sessionID)

    expect(SessionRunner.info(sessionID)?.status).toBe("idle")
  })

  it("cancels queued operations when session cancel requests queued work", async () => {
    const sessionID = testSessionID()
    const directory = testDirectory()
    const started = deferred()
    const finish = deferred()

    const first = SessionRunner.enqueuePrompt({
      sessionID,
      directory,
      type: "prompt",
      execute: async () => {
        started.resolve()
        await finish.promise
        return "first"
      },
    })

    await started.promise

    const second = SessionRunner.enqueuePrompt({
      sessionID,
      directory,
      type: "prompt",
      execute: async () => "second",
    })

    expect(second.mode).toBe("queued")
    const result = SessionRunner.cancelSession(sessionID, { cancelQueued: true })
    expect(result).toMatchObject({
      sessionID,
      activeCancelled: true,
      queuedCancelled: 1,
      cancelled: true,
    })
    expect(SessionRunner.info(sessionID)?.queueLength).toBe(0)
    await expect(second.promise).rejects.toThrow("cancelled before it started")

    finish.resolve()
    await expect(first.promise).resolves.toBe("first")
    await SessionRunner.waitForIdle(sessionID)
  })

  it("removes a queued operation when its handle is cancelled", async () => {
    const sessionID = testSessionID()
    const directory = testDirectory()
    const started = deferred()
    const finish = deferred()

    const first = SessionRunner.enqueuePrompt({
      sessionID,
      directory,
      type: "prompt",
      execute: async () => {
        started.resolve()
        await finish.promise
        return "first"
      },
    })

    await started.promise

    const second = SessionRunner.enqueueResume({
      sessionID,
      directory,
      type: "resume",
      execute: async () => "second",
    })

    expect(second.mode).toBe("queued")
    expect(SessionRunner.info(sessionID)?.queueLength).toBe(1)

    second.cancel()

    await expect(second.promise).rejects.toThrow("cancelled before it started")
    expect(SessionRunner.info(sessionID)?.queueLength).toBe(0)

    finish.resolve()
    await expect(first.promise).resolves.toBe("first")
    await SessionRunner.waitForIdle(sessionID)
  })

  it("steers active steerable prompt turns instead of creating a queued operation", async () => {
    const sessionID = testSessionID()
    const directory = testDirectory()
    const activeStarted = deferred<Orchestrator.TurnContext>()
    const steerRecorded = deferred()
    const finish = deferred()

    const first = SessionRunner.enqueuePrompt({
      sessionID,
      directory,
      type: "prompt",
      execute: async (runtime) => {
        const turn = Orchestrator.startTurn({
          sessionID,
          turnID: runtime.turnID,
          steerable: true,
        })
        activeStarted.resolve(turn)
        try {
          await finish.promise
          return "first"
        } finally {
          Orchestrator.finishTurn(turn)
        }
      },
    })

    const turn = await activeStarted.promise

    const steer = SessionRunner.enqueuePrompt({
      sessionID,
      directory,
      type: "prompt",
      execute: async () => "second",
      steer: async ({ turn: activeTurn }) => {
        expect(activeTurn.turnID).toBe(turn.turnID)
        steerRecorded.resolve()
      },
    })

    expect(steer.mode).toBe("steer")
    expect(steer.turnID).toBe(first.turnID)

    await steerRecorded.promise
    await expect(SessionRunner.consumePendingSteer(sessionID, first.turnID)).resolves.toBe(1)
    expect(SessionRunner.info(sessionID)?.queueLength).toBe(0)

    finish.resolve()

    await expect(first.promise).resolves.toBe("first")
    await expect(steer.promise).resolves.toBe("first")
    await SessionRunner.waitForIdle(sessionID)
  })

  it("waits for accepted steer writes before consuming the pending steer marker", async () => {
    const sessionID = testSessionID()
    const directory = testDirectory()
    const activeStarted = deferred()
    const finish = deferred()
    const allowSteerWrite = deferred()
    let consumed = false

    const first = SessionRunner.enqueuePrompt({
      sessionID,
      directory,
      type: "prompt",
      execute: async (runtime) => {
        const turn = Orchestrator.startTurn({
          sessionID,
          turnID: runtime.turnID,
        })
        activeStarted.resolve()
        try {
          await finish.promise
          return "first"
        } finally {
          Orchestrator.finishTurn(turn)
        }
      },
    })

    await activeStarted.promise

    const steer = SessionRunner.enqueuePrompt({
      sessionID,
      directory,
      type: "prompt",
      execute: async () => "second",
      steer: async () => {
        await allowSteerWrite.promise
      },
    })

    const pending = SessionRunner.consumePendingSteer(sessionID, first.turnID).then((count) => {
      consumed = true
      return count
    })

    await Promise.resolve()
    expect(consumed).toBe(false)

    allowSteerWrite.resolve()

    await expect(pending).resolves.toBe(1)

    finish.resolve()
    await expect(first.promise).resolves.toBe("first")
    await expect(steer.promise).resolves.toBe("first")
    await SessionRunner.waitForIdle(sessionID)
  })

  it("queues prompt input when the active turn is not steerable", async () => {
    const sessionID = testSessionID()
    const directory = testDirectory()
    const activeStarted = deferred()
    const finishFirst = deferred()
    const secondStarted = deferred()

    const first = SessionRunner.enqueuePrompt({
      sessionID,
      directory,
      type: "prompt",
      execute: async (runtime) => {
        const turn = Orchestrator.startTurn({
          sessionID,
          turnID: runtime.turnID,
          steerable: false,
        })
        activeStarted.resolve()
        try {
          await finishFirst.promise
          return "first"
        } finally {
          Orchestrator.finishTurn(turn)
        }
      },
    })

    await activeStarted.promise

    const second = SessionRunner.enqueuePrompt({
      sessionID,
      directory,
      type: "prompt",
      execute: async () => {
        secondStarted.resolve()
        return "second"
      },
      steer: async () => {
        throw new Error("must not steer a non-steerable turn")
      },
    })

    expect(second.mode).toBe("queued")
    expect(SessionRunner.info(sessionID)?.queueLength).toBe(1)

    finishFirst.resolve()

    await expect(first.promise).resolves.toBe("first")
    await secondStarted.promise
    await expect(second.promise).resolves.toBe("second")
    await SessionRunner.waitForIdle(sessionID)
  })

  it("rejects enqueues that exceed the per-session queue limit", async () => {
    await withEnv("FanFande_SESSION_MAX_QUEUE_OPS", "1", async () => {
      const sessionID = testSessionID()
      const directory = testDirectory()
      const started = deferred()
      const finish = deferred()

      const first = SessionRunner.enqueuePrompt({
        sessionID,
        directory,
        type: "prompt",
        execute: async () => {
          started.resolve()
          await finish.promise
          return "first"
        },
      })

      await started.promise

      const second = SessionRunner.enqueueResume({
        sessionID,
        directory,
        type: "resume",
        execute: async () => "second",
      })

      expect(second.mode).toBe("queued")
      expect(() => SessionRunner.enqueueResume({
        sessionID,
        directory,
        type: "resume",
        execute: async () => "third",
      })).toThrow(SessionLimitError)

      second.cancel()
      await expect(second.promise).rejects.toThrow("cancelled before it started")

      finish.resolve()
      await expect(first.promise).resolves.toBe("first")
      await SessionRunner.waitForIdle(sessionID)
    })
  })

  it("rejects a new running session when the global concurrency limit is reached", async () => {
    await withEnv("FanFande_SESSION_MAX_RUNNING", "1", async () => {
      const directory = testDirectory()
      const firstSessionID = testSessionID()
      const secondSessionID = testSessionID()
      const started = deferred()
      const finish = deferred()

      const first = SessionRunner.enqueuePrompt({
        sessionID: firstSessionID,
        directory,
        type: "prompt",
        execute: async () => {
          started.resolve()
          await finish.promise
          return "first"
        },
      })

      await started.promise

      const second = SessionRunner.enqueuePrompt({
        sessionID: secondSessionID,
        directory: `${directory}-other`,
        type: "prompt",
        execute: async () => "second",
      })

      await expect(second.promise).rejects.toMatchObject({
        code: "SESSION_GLOBAL_CONCURRENCY_LIMIT",
      })

      finish.resolve()
      await expect(first.promise).resolves.toBe("first")
      await Promise.all([
        SessionRunner.waitForIdle(firstSessionID),
        SessionRunner.waitForIdle(secondSessionID),
      ])
    })
  })

  it("rejects a new running session when the per-directory concurrency limit is reached", async () => {
    await withEnv("FanFande_SESSION_MAX_RUNNING", "10", async () => {
      await withEnv("FanFande_SESSION_MAX_RUNNING_PER_DIRECTORY", "1", async () => {
        const directory = testDirectory()
        const firstSessionID = testSessionID()
        const secondSessionID = testSessionID()
        const started = deferred()
        const finish = deferred()

        const first = SessionRunner.enqueuePrompt({
          sessionID: firstSessionID,
          directory,
          type: "prompt",
          execute: async () => {
            started.resolve()
            await finish.promise
            return "first"
          },
        })

        await started.promise

        const second = SessionRunner.enqueuePrompt({
          sessionID: secondSessionID,
          directory,
          type: "prompt",
          execute: async () => "second",
        })

        await expect(second.promise).rejects.toMatchObject({
          code: "SESSION_DIRECTORY_CONCURRENCY_LIMIT",
        })

        finish.resolve()
        await expect(first.promise).resolves.toBe("first")
        await Promise.all([
          SessionRunner.waitForIdle(firstSessionID),
          SessionRunner.waitForIdle(secondSessionID),
        ])
      })
    })
  })
})
