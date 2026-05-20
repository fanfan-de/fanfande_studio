import { MockGateway } from "../mock"

describe("MockGateway", () => {
  it("streams delta then done", async () => {
    const gateway = new MockGateway({ chunkDelayMs: 1 })
    const deltas: string[] = []
    let done = false

    const handle = gateway.streamSessionMessage(
      {
        sessionID: "session_mock_test",
        text: "hello",
      },
      {
        onDelta: (delta) => deltas.push(delta),
        onDone: () => {
          done = true
        },
      },
    )

    await handle.done
    expect(deltas.length).toBeGreaterThan(0)
    expect(done).toBe(true)
  })
})
