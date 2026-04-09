import { afterEach, describe, expect, test } from "bun:test"
import { createServerRuntime } from "#server/server.ts"
import { createPtyRegistry } from "#pty/registry.ts"
import type { PtyRuntimeAdapter, PtyRuntimeHandle } from "#pty/runtime.ts"
import type { PtyServerMessage, PtySessionInfo } from "#pty/types.ts"

interface JsonEnvelope<T = Record<string, unknown>> {
  success: boolean
  requestId?: string
  data?: T
  error?: {
    code: string
    message: string
  }
}

class FakePtyHandle implements PtyRuntimeHandle {
  readonly pid = Math.floor(Math.random() * 10_000)
  readonly writes: string[] = []
  private readonly dataListeners = new Set<(data: string) => void>()
  private readonly exitListeners = new Set<(event: { exitCode: number | null; signal?: number }) => void>()

  constructor(
    public cols: number,
    public rows: number,
  ) {}

  write(data: string) {
    this.writes.push(data)
  }

  resize(cols: number, rows: number) {
    this.cols = cols
    this.rows = rows
  }

  kill() {
    this.emitExit(0)
  }

  onData(listener: (data: string) => void) {
    this.dataListeners.add(listener)
    return () => {
      this.dataListeners.delete(listener)
    }
  }

  onExit(listener: (event: { exitCode: number | null; signal?: number }) => void) {
    this.exitListeners.add(listener)
    return () => {
      this.exitListeners.delete(listener)
    }
  }

  emitData(data: string) {
    for (const listener of [...this.dataListeners]) {
      listener(data)
    }
  }

  emitExit(exitCode: number | null) {
    for (const listener of [...this.exitListeners]) {
      listener({ exitCode })
    }
  }
}

class FakePtyRuntime implements PtyRuntimeAdapter {
  readonly handles: FakePtyHandle[] = []

  spawn(input: { shell: string; cwd: string; rows: number; cols: number; env: Record<string, string> }) {
    void input.shell
    void input.cwd
    void input.env
    const handle = new FakePtyHandle(input.cols, input.rows)
    this.handles.push(handle)
    return handle
  }
}

class SocketHarness {
  readonly socket: WebSocket
  private readonly queue: PtyServerMessage[] = []
  private readonly waiters: Array<(message: PtyServerMessage) => void> = []

  private constructor(socket: WebSocket) {
    this.socket = socket
  }

  static async connect(url: string) {
    return new Promise<SocketHarness>((resolve, reject) => {
      const socket = new WebSocket(url)
      const harness = new SocketHarness(socket)

      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data)) as PtyServerMessage
        const waiter = harness.waiters.shift()
        if (waiter) {
          waiter(message)
          return
        }
        harness.queue.push(message)
      })

      socket.addEventListener(
        "open",
        () => {
          resolve(harness)
        },
        { once: true },
      )

      socket.addEventListener(
        "error",
        () => {
          reject(new Error("WebSocket connection failed"))
        },
        { once: true },
      )
    })
  }

  async nextMessage(timeoutMs = 2_000) {
    if (this.queue.length > 0) {
      return this.queue.shift()!
    }

    return new Promise<PtyServerMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waiters.indexOf(onMessage)
        if (index >= 0) {
          this.waiters.splice(index, 1)
        }
        reject(new Error("Timed out waiting for PTY socket message"))
      }, timeoutMs)

      const onMessage = (message: PtyServerMessage) => {
        clearTimeout(timer)
        resolve(message)
      }

      this.waiters.push(onMessage)
    })
  }

  close() {
    this.socket.close()
  }
}

const activeServers: Bun.Server[] = []

afterEach(() => {
  for (const server of activeServers.splice(0, activeServers.length)) {
    server.stop(true)
  }
})

async function waitForWrites(read: () => string[] | undefined, expected: string[]) {
  const started = Date.now()

  while (Date.now() - started < 2_000) {
    const value = read()
    if (JSON.stringify(value) === JSON.stringify(expected)) return
    await Bun.sleep(20)
  }

  expect(read()).toEqual(expected)
}

async function startPtyTestServer() {
  const runtime = new FakePtyRuntime()
  const registry = createPtyRegistry({
    runtime,
    exitRetentionMs: 30_000,
    deleteRetentionMs: 30_000,
  })
  const serverRuntime = createServerRuntime({ ptyRegistry: registry })
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request, bunServer) {
      return serverRuntime.app.fetch(request, bunServer)
    },
    websocket: serverRuntime.websocket,
  })
  activeServers.push(server)

  const baseURL = `http://127.0.0.1:${String(server.port)}`
  return {
    baseURL,
    registry,
    runtime,
  }
}

async function createPty(baseURL: string) {
  const response = await fetch(`${baseURL}/api/pty`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      cwd: process.cwd(),
      rows: 24,
      cols: 80,
    }),
  })
  const body = (await response.json()) as JsonEnvelope<PtySessionInfo>
  return {
    response,
    body,
  }
}

describe("server pty api", () => {
  test("creates a PTY session and returns the JSON envelope", async () => {
    const { baseURL, runtime } = await startPtyTestServer()
    const { response, body } = await createPty(baseURL)

    expect(response.status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.requestId).toBeString()
    expect(body.data?.id).toStartWith("pty_")
    expect(body.data?.status).toBe("running")
    expect(runtime.handles).toHaveLength(1)
    expect(runtime.handles[0]?.cols).toBe(80)
    expect(runtime.handles[0]?.rows).toBe(24)
  })

  test("updates rows and cols through PUT /api/pty/:id", async () => {
    const { baseURL, runtime } = await startPtyTestServer()
    const created = await createPty(baseURL)
    const ptyID = created.body.data?.id

    expect(ptyID).toBeString()

    const response = await fetch(`${baseURL}/api/pty/${ptyID}`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        rows: 40,
        cols: 120,
      }),
    })
    const body = (await response.json()) as JsonEnvelope<PtySessionInfo>

    expect(response.status).toBe(200)
    expect(body.data?.rows).toBe(40)
    expect(body.data?.cols).toBe(120)
    expect(runtime.handles[0]?.rows).toBe(40)
    expect(runtime.handles[0]?.cols).toBe(120)
  })

  test("replays only missing output when reconnecting with a cursor", async () => {
    const { baseURL, runtime } = await startPtyTestServer()
    const created = await createPty(baseURL)
    const ptyID = created.body.data?.id

    expect(ptyID).toBeString()

    runtime.handles[0]?.emitData("hello")

    const firstSocket = await SocketHarness.connect(`${baseURL.replace("http", "ws")}/api/pty/${ptyID}/connect`)
    const firstReady = await firstSocket.nextMessage()

    expect(firstReady).toMatchObject({
      type: "ready",
      replay: {
        mode: "reset",
        buffer: "hello",
        cursor: 5,
      },
    })

    firstSocket.close()

    runtime.handles[0]?.emitData(" world")

    const secondSocket = await SocketHarness.connect(
      `${baseURL.replace("http", "ws")}/api/pty/${ptyID}/connect?cursor=5`,
    )
    const secondReady = await secondSocket.nextMessage()

    expect(secondReady).toMatchObject({
      type: "ready",
      replay: {
        mode: "delta",
        buffer: " world",
        cursor: 11,
      },
    })

    secondSocket.close()
  })

  test("forwards exit events over the PTY websocket", async () => {
    const { baseURL, runtime } = await startPtyTestServer()
    const created = await createPty(baseURL)
    const ptyID = created.body.data?.id

    expect(ptyID).toBeString()

    const socket = await SocketHarness.connect(`${baseURL.replace("http", "ws")}/api/pty/${ptyID}/connect`)
    const ready = await socket.nextMessage()
    expect(ready.type).toBe("ready")

    runtime.handles[0]?.emitExit(17)

    const exited = await socket.nextMessage()
    expect(exited).toMatchObject({
      type: "exited",
      session: {
        id: ptyID,
        status: "exited",
        exitCode: 17,
      },
    })

    socket.close()
  })

  test("forwards websocket input to the PTY runtime", async () => {
    const { baseURL, runtime } = await startPtyTestServer()
    const created = await createPty(baseURL)
    const ptyID = created.body.data?.id

    expect(ptyID).toBeString()

    const socket = await SocketHarness.connect(`${baseURL.replace("http", "ws")}/api/pty/${ptyID}/connect`)
    const ready = await socket.nextMessage()
    expect(ready.type).toBe("ready")

    socket.socket.send(
      JSON.stringify({
        type: "input",
        data: "echo 123\r",
      }),
    )

    await waitForWrites(() => runtime.handles[0]?.writes, ["echo 123\r"])

    socket.close()
  })

  test("deletes a PTY session and pushes the deleted event to the socket", async () => {
    const { baseURL } = await startPtyTestServer()
    const created = await createPty(baseURL)
    const ptyID = created.body.data?.id

    expect(ptyID).toBeString()

    const socket = await SocketHarness.connect(`${baseURL.replace("http", "ws")}/api/pty/${ptyID}/connect`)
    const ready = await socket.nextMessage()
    expect(ready.type).toBe("ready")

    const response = await fetch(`${baseURL}/api/pty/${ptyID}`, {
      method: "DELETE",
    })
    const body = (await response.json()) as JsonEnvelope<PtySessionInfo>

    expect(response.status).toBe(200)
    expect(body.data?.status).toBe("deleted")

    const deleted = await socket.nextMessage()
    expect(deleted).toMatchObject({
      type: "deleted",
      session: {
        id: ptyID,
        status: "deleted",
      },
    })

    socket.close()
  })
})
