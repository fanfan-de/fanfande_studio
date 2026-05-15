import { describe, expect, it, vi } from "vitest"
import {
  clearSessionDataLoadCacheForSession,
  createSessionDataLoadCache,
  ensureSessionDataLoad,
} from "./session-data-load-cache"

describe("session data load cache", () => {
  it("deduplicates concurrent loads for the same session data", async () => {
    const cache = createSessionDataLoadCache()
    const load = vi.fn(async () => undefined)

    const first = ensureSessionDataLoad(cache, "history", "session-1", "backend-1", undefined, load)
    const second = ensureSessionDataLoad(cache, "history", "session-1", "backend-1", undefined, load)

    expect(second).toBe(first)
    await Promise.all([first, second])
    expect(load).toHaveBeenCalledTimes(1)
    expect(cache.history["session-1"]).toMatchObject({
      backendSessionID: "backend-1",
      status: "ready",
    })
  })

  it("reuses ready cache entries until a force load is requested", async () => {
    const cache = createSessionDataLoadCache()
    const load = vi.fn(async () => undefined)

    await ensureSessionDataLoad(cache, "diff", "session-1", "backend-1", undefined, load)
    await ensureSessionDataLoad(cache, "diff", "session-1", "backend-1", undefined, load)
    await ensureSessionDataLoad(cache, "diff", "session-1", "backend-1", { force: true }, load)

    expect(load).toHaveBeenCalledTimes(2)
  })

  it("keeps sessions isolated and clears every data kind for a removed session", async () => {
    const cache = createSessionDataLoadCache()
    const load = vi.fn(async () => undefined)

    await Promise.all([
      ensureSessionDataLoad(cache, "history", "session-1", "backend-1", undefined, load),
      ensureSessionDataLoad(cache, "history", "session-2", "backend-2", undefined, load),
      ensureSessionDataLoad(cache, "permissions", "session-1", "backend-1", undefined, load),
    ])

    clearSessionDataLoadCacheForSession(cache, "session-1")

    expect(cache.history["session-1"]).toBeUndefined()
    expect(cache.permissions["session-1"]).toBeUndefined()
    expect(cache.history["session-2"]).toMatchObject({
      backendSessionID: "backend-2",
      status: "ready",
    })
  })
})
