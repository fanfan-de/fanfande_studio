import fs from "node:fs/promises"
import http from "node:http"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const electronState = vi.hoisted(() => ({
  userDataPath: "",
}))

const requestAgentJSONMock = vi.hoisted(() => vi.fn())
const agentClientState = vi.hoisted(() => ({
  baseUrl: "http://127.0.0.1:4096",
}))

vi.mock("electron", () => ({
  app: {
    getName: vi.fn(() => "Anybox"),
    getPath: vi.fn(() => electronState.userDataPath),
    getVersion: vi.fn(() => "0.1.13"),
  },
}))

vi.mock("./agent-client", () => ({
  requestAgentJSON: requestAgentJSONMock,
  resolveAgentURL: vi.fn((agentPath: string) => `${agentClientState.baseUrl}${agentPath}`),
}))

vi.mock("./safe-console", () => ({
  safeError: vi.fn(),
  safeLog: vi.fn(),
  safeWarn: vi.fn(),
}))

import { ensureMobileBridgeServerRunning, getMobileBridgeStatus, refreshMobilePairingCode, stopMobileBridgeServer } from "./mobile-bridge-server"

function listenOnFreePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      const port = typeof address === "object" && address ? address.port : 0
      server.close((error) => {
        if (error) reject(error)
        else resolve(port)
      })
    })
  })
}

async function readMobileJSON(baseUrl: string, route: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  })
  const body = (await response.json()) as unknown
  return { body, response }
}

function successData<T>(body: unknown) {
  expect(body).toMatchObject({ success: true })
  return (body as { data: T }).data
}

async function readMobileText(baseUrl: string, route: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...init,
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  })
  const body = await response.text()
  return { body, response }
}

async function readNodeRequestBody(request: http.IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString("utf8")
}

function jsonAgentResponse(response: http.ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
  })
  response.end(`${JSON.stringify(body)}\n`)
}

function agentOk(data: unknown) {
  return { success: true, data }
}

function createMockProject(workspaceDir: string, now = Date.now()) {
  return {
    id: "project-smoke",
    kind: "git",
    name: "Smoke Project",
    repositoryRoot: workspaceDir,
    worktree: workspaceDir,
    vcs: "git",
    created: now - 20_000,
    updated: now,
    sandboxes: [],
  }
}

function createMockSession(workspaceDir: string, now = Date.now()) {
  return {
    id: "session-smoke",
    projectID: "project-smoke",
    directory: workspaceDir,
    title: "Smoke Chat",
    kind: "main",
    workflow: {
      active: false,
      status: "completed",
      updatedAt: now,
    },
    time: {
      created: now - 10_000,
      updated: now,
    },
  }
}

function createMockApproval(now = Date.now()) {
  return {
    id: "approval-smoke",
    approvalID: "approval-smoke",
    sessionID: "session-smoke",
    status: "pending",
    createdAt: now - 5_000,
    prompt: {
      title: "Allow smoke command",
      summary: "Allow the mobile bridge smoke command.",
      risk: "low",
      details: {
        command: "echo smoke",
        paths: ["README.md"],
        workdir: "C:\\Projects\\Smoke Workspace",
      },
    },
  }
}

function startAgentStub() {
  const requests: string[] = []
  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1")
    requests.push(`${request.method ?? "GET"} ${requestUrl.pathname}`)

    if (requestUrl.pathname === "/api/sessions/session-smoke/messages" && request.method === "GET") {
      jsonAgentResponse(response, 200, agentOk([
        {
          info: {
            id: "message-user-smoke",
            role: "user",
            created: Date.now() - 1000,
            updated: Date.now() - 1000,
          },
          parts: [{ type: "text", text: "Hello from bridge test." }],
        },
      ]))
      return
    }

    if (requestUrl.pathname === "/api/sessions/session-smoke/messages/stream" && request.method === "POST") {
      await readNodeRequestBody(request)
      response.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
      })
      response.write(`event: delta\ndata: ${JSON.stringify({ kind: "text", delta: "streamed smoke reply" })}\n\n`)
      response.write(`event: done\ndata: ${JSON.stringify({ generatedAt: Date.now() })}\n\n`)
      response.end()
      return
    }

    if (requestUrl.pathname === "/api/sessions/session-smoke/tasks" && request.method === "GET") {
      jsonAgentResponse(response, 200, agentOk({
        sessionID: "session-smoke",
        generatedAt: Date.now(),
        tasks: [],
        current: [],
        next: [],
        blocked: [],
        summary: {
          total: 0,
          completed: 0,
          pending: 0,
          inProgress: 0,
          blocked: 0,
        },
      }))
      return
    }

    if (requestUrl.pathname === "/api/sessions/session-smoke/cancel" && request.method === "POST") {
      jsonAgentResponse(response, 200, agentOk({ sessionID: "session-smoke", cancelled: true }))
      return
    }

    if (requestUrl.pathname === "/api/workspace-files/directory" && request.method === "GET") {
      jsonAgentResponse(response, 200, agentOk([
        {
          path: "README.md",
          name: "README.md",
          kind: "file",
          extension: ".md",
          hasChildren: false,
        },
      ]))
      return
    }

    if (requestUrl.pathname === "/api/workspace-files/file" && request.method === "GET") {
      jsonAgentResponse(response, 200, agentOk({
        path: requestUrl.searchParams.get("path") ?? "",
        content: "# Smoke\n",
      }))
      return
    }

    if (requestUrl.pathname === "/api/workspace-files/search" && request.method === "GET") {
      jsonAgentResponse(response, 200, agentOk([
        {
          path: "README.md",
          name: "README.md",
          kind: "file",
        },
      ]))
      return
    }

    jsonAgentResponse(response, 404, {
      success: false,
      error: {
        code: "NOT_FOUND",
        message: `Unhandled stub route: ${requestUrl.pathname}`,
      },
    })
  })

  return new Promise<{ baseUrl: string; close: () => Promise<void>; requests: string[] }>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      const port = typeof address === "object" && address ? address.port : 0
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((closeResolve) => server.close(() => closeResolve())),
        requests,
      })
    })
  })
}

async function pairMobileDevice(baseUrl: string, name = "Android emulator") {
  const status = await getMobileBridgeStatus()
  const pairingCode = new URL(status.pairingLocalUrl ?? "").searchParams.get("code")
  expect(pairingCode).toBeTruthy()

  const paired = await readMobileJSON(baseUrl, `/api/mobile/pair?code=${encodeURIComponent(pairingCode ?? "")}`, {
    body: JSON.stringify({ name }),
    method: "POST",
  })
  expect(paired.response.status).toBe(200)
  return successData<{ device: { id: string; name: string; revokedAt?: number }; token: string }>(paired.body)
}

describe("mobile bridge server", () => {
  let userDataPath = ""

  beforeEach(async () => {
    userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "anybox-mobile-bridge-"))
    electronState.userDataPath = userDataPath
    process.env.ANYBOX_MOBILE_BRIDGE_HOST = "127.0.0.1"
    process.env.ANYBOX_MOBILE_BRIDGE_PORT = String(await listenOnFreePort())
    agentClientState.baseUrl = "http://127.0.0.1:4096"

    requestAgentJSONMock.mockReset()
    requestAgentJSONMock.mockImplementation(async (agentPath: string) => {
      if (agentPath === "/api/projects") return { data: [] }
      if (agentPath.startsWith("/api/permissions/requests?")) return { data: [] }
      throw new Error(`Unexpected agent request: ${agentPath}`)
    })
  })

  afterEach(async () => {
    await stopMobileBridgeServer()
    delete process.env.ANYBOX_MOBILE_BRIDGE_HOST
    delete process.env.ANYBOX_MOBILE_BRIDGE_PORT
    if (userDataPath) {
      await fs.rm(userDataPath, { force: true, recursive: true })
    }
  })

  it("pairs a mobile device with a one-time code and revokes its device token", async () => {
    const status = await ensureMobileBridgeServerRunning()
    expect(status.running).toBe(true)
    expect(status.pairingLocalUrl).toBeTruthy()

    const baseUrl = `http://127.0.0.1:${status.port}`
    const pairingCode = new URL(status.pairingLocalUrl ?? "").searchParams.get("code")
    expect(pairingCode).toBeTruthy()

    const publicStatus = await readMobileJSON(baseUrl, "/api/mobile/status")
    expect(publicStatus.response.status).toBe(200)
    expect(successData<{ online: boolean }>(publicStatus.body).online).toBe(true)

    const deniedPair = await readMobileJSON(baseUrl, "/api/mobile/pair?code=wrong", {
      body: JSON.stringify({ name: "Android emulator" }),
      method: "POST",
    })
    expect(deniedPair.response.status).toBe(401)

    const paired = await readMobileJSON(baseUrl, `/api/mobile/pair?code=${encodeURIComponent(pairingCode ?? "")}`, {
      body: JSON.stringify({ name: "Android emulator" }),
      method: "POST",
    })
    expect(paired.response.status).toBe(200)
    const pairData = successData<{ device: { id: string; name: string; revokedAt?: number }; token: string }>(paired.body)
    expect(pairData.device.name).toBe("Android emulator")
    expect(pairData.token).toMatch(/^mobile_/)

    const authHeaders = { authorization: `Bearer ${pairData.token}` }
    const workspaces = await readMobileJSON(baseUrl, "/api/mobile/workspaces", { headers: authHeaders })
    expect(workspaces.response.status).toBe(200)
    expect(successData<unknown[]>(workspaces.body)).toEqual([])

    const approvals = await readMobileJSON(baseUrl, "/api/mobile/approvals", { headers: authHeaders })
    expect(approvals.response.status).toBe(200)
    expect(successData<unknown[]>(approvals.body)).toEqual([])

    const revoked = await readMobileJSON(baseUrl, "/api/mobile/devices/me/revoke", {
      headers: authHeaders,
      method: "POST",
    })
    expect(revoked.response.status).toBe(200)
    expect(successData<{ revoked: boolean }>(revoked.body).revoked).toBe(true)

    const deniedAfterRevoke = await readMobileJSON(baseUrl, "/api/mobile/workspaces", { headers: authHeaders })
    expect(deniedAfterRevoke.response.status).toBe(401)

    const finalStatus = await getMobileBridgeStatus()
    expect(finalStatus.devices).toEqual([
      expect.objectContaining({
        id: pairData.device.id,
        name: "Android emulator",
        revokedAt: expect.any(Number),
      }),
    ])
  })

  it("previews a pairing code without consuming it and marks it invalid after pairing", async () => {
    const status = await ensureMobileBridgeServerRunning()
    const baseUrl = `http://127.0.0.1:${status.port}`
    const pairingCode = new URL(status.pairingLocalUrl ?? "").searchParams.get("code")
    expect(pairingCode).toBeTruthy()

    const preview = await readMobileJSON(baseUrl, `/api/mobile/pair/preview?code=${encodeURIComponent(pairingCode ?? "")}`)
    expect(preview.response.status).toBe(200)
    const previewData = successData<{
      appVersion: string
      capabilities: string[]
      desktopName: string
      online: boolean
      pairing: { expiresAt: number | null; serverTime: number; valid: boolean }
      running: boolean
      service: string
    }>(preview.body)
    expect(previewData).toMatchObject({
      appVersion: "0.1.13",
      desktopName: "Anybox",
      online: true,
      pairing: {
        expiresAt: status.pairingExpiresAt,
        valid: true,
      },
      running: true,
      service: "anybox-mobile-bridge",
    })
    expect(previewData.pairing.serverTime).toEqual(expect.any(Number))
    expect(previewData.capabilities).toContain("workspace:read")

    const paired = await readMobileJSON(baseUrl, `/api/mobile/pair?code=${encodeURIComponent(pairingCode ?? "")}`, {
      body: JSON.stringify({ name: "Android emulator" }),
      method: "POST",
    })
    expect(paired.response.status).toBe(200)

    const consumedPreview = await readMobileJSON(baseUrl, `/api/mobile/pair/preview?code=${encodeURIComponent(pairingCode ?? "")}`)
    expect(consumedPreview.response.status).toBe(200)
    expect(successData<{ pairing: { expiresAt: number | null; valid: boolean } }>(consumedPreview.body).pairing).toMatchObject({
      expiresAt: null,
      valid: false,
    })
  })

  it("proxies scoped mobile API routes through the real bridge server", async () => {
    const agent = await startAgentStub()
    agentClientState.baseUrl = agent.baseUrl

    try {
      const workspaceDir = path.join(userDataPath, "workspace")
      await fs.mkdir(workspaceDir, { recursive: true })
      const project = createMockProject(workspaceDir)
      const session = createMockSession(workspaceDir)
      const approval = createMockApproval()

      requestAgentJSONMock.mockImplementation(async (agentPath: string, init?: RequestInit) => {
        if (agentPath === "/api/projects") return { data: [project] }
        if (agentPath === "/api/projects/project-smoke/sessions" && init?.method === "POST") {
          return {
            data: {
              ...session,
              id: "session-created",
              title: "Created Chat",
              time: {
                created: Date.now(),
                updated: Date.now(),
              },
            },
          }
        }
        if (agentPath === "/api/projects/project-smoke/sessions") return { data: [session] }
        if (agentPath.startsWith("/api/permissions/requests?")) return { data: [approval] }
        if (agentPath === "/api/permissions/requests/approval-smoke/resolve") {
          return { data: { approvalID: "approval-smoke", decision: "allow", approved: true } }
        }
        throw new Error(`Unexpected agent request: ${agentPath}`)
      })

      const status = await ensureMobileBridgeServerRunning()
      const baseUrl = `http://127.0.0.1:${status.port}`
      const pairData = await pairMobileDevice(baseUrl)
      const authHeaders = { authorization: `Bearer ${pairData.token}` }
      const workspaceRoute = `/api/mobile/workspaces/${encodeURIComponent(workspaceDir)}`

      const workspaces = await readMobileJSON(baseUrl, "/api/mobile/workspaces", { headers: authHeaders })
      expect(workspaces.response.status).toBe(200)
      expect(successData<Array<{ id: string; sessions: Array<{ id: string }> }>>(workspaces.body)).toEqual([
        expect.objectContaining({
          id: workspaceDir,
          sessions: [expect.objectContaining({ id: "session-smoke" })],
        }),
      ])

      const sessions = await readMobileJSON(baseUrl, `${workspaceRoute}/sessions`, { headers: authHeaders })
      expect(sessions.response.status).toBe(200)
      expect(successData<Array<{ id: string }>>(sessions.body)).toEqual([expect.objectContaining({ id: "session-smoke" })])

      const createdSession = await readMobileJSON(baseUrl, `${workspaceRoute}/sessions`, {
        body: JSON.stringify({ title: "Created Chat" }),
        headers: authHeaders,
        method: "POST",
      })
      expect(createdSession.response.status).toBe(200)
      expect(successData<{ id: string; title: string }>(createdSession.body)).toMatchObject({
        id: "session-created",
        title: "Created Chat",
      })

      const messages = await readMobileJSON(baseUrl, "/api/mobile/sessions/session-smoke/messages", { headers: authHeaders })
      expect(messages.response.status).toBe(200)
      expect(successData<Array<{ parts: Array<{ text: string }> }>>(messages.body)[0]?.parts[0]?.text).toBe("Hello from bridge test.")

      const stream = await readMobileText(baseUrl, "/api/mobile/sessions/session-smoke/messages/stream", {
        body: JSON.stringify({ text: "run smoke" }),
        headers: authHeaders,
        method: "POST",
      })
      expect(stream.response.status).toBe(200)
      expect(stream.body).toContain("streamed smoke reply")

      const tasks = await readMobileJSON(baseUrl, "/api/mobile/sessions/session-smoke/tasks", { headers: authHeaders })
      expect(tasks.response.status).toBe(200)
      expect(successData<{ sessionID: string; summary: { total: number } }>(tasks.body)).toMatchObject({
        sessionID: "session-smoke",
        summary: { total: 0 },
      })

      const cancelled = await readMobileJSON(baseUrl, "/api/mobile/sessions/session-smoke/cancel", {
        headers: authHeaders,
        method: "POST",
      })
      expect(cancelled.response.status).toBe(200)
      expect(successData<{ cancelled: boolean }>(cancelled.body).cancelled).toBe(true)

      const files = await readMobileJSON(baseUrl, `${workspaceRoute}/files`, { headers: authHeaders })
      expect(files.response.status).toBe(200)
      expect(successData<Array<{ path: string }>>(files.body)).toEqual([expect.objectContaining({ path: "README.md" })])

      const fileContent = await readMobileJSON(baseUrl, `${workspaceRoute}/files/content?path=README.md`, { headers: authHeaders })
      expect(fileContent.response.status).toBe(200)
      expect(successData<{ content: string; path: string }>(fileContent.body)).toMatchObject({
        content: "# Smoke\n",
        path: "README.md",
      })

      const fileSearch = await readMobileJSON(baseUrl, `${workspaceRoute}/files/search?q=readme`, { headers: authHeaders })
      expect(fileSearch.response.status).toBe(200)
      expect(successData<Array<{ path: string }>>(fileSearch.body)).toEqual([expect.objectContaining({ path: "README.md" })])

      const approvals = await readMobileJSON(baseUrl, "/api/mobile/approvals", { headers: authHeaders })
      expect(approvals.response.status).toBe(200)
      expect(successData<Array<{ id: string }>>(approvals.body)).toEqual([expect.objectContaining({ id: "approval-smoke" })])

      const approved = await readMobileJSON(baseUrl, "/api/mobile/approvals/approval-smoke/approve", {
        body: JSON.stringify({ resume: true }),
        headers: authHeaders,
        method: "POST",
      })
      expect(approved.response.status).toBe(200)
      expect(successData<{ approved: boolean }>(approved.body).approved).toBe(true)

      const eventController = new AbortController()
      const eventResponse = await fetch(`${baseUrl}/api/mobile/events/stream`, {
        headers: authHeaders,
        signal: eventController.signal,
      })
      expect(eventResponse.status).toBe(200)
      const eventReader = eventResponse.body?.getReader()
      expect(eventReader).toBeTruthy()
      const eventChunk = await Promise.race([
        eventReader?.read(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for mobile event stream.")), 2000)),
      ])
      eventController.abort()
      await eventReader?.cancel().catch(() => undefined)
      const eventText = new TextDecoder().decode(eventChunk?.value)
      expect(eventText).toContain("event: sync.ready")

      expect(agent.requests).toEqual(expect.arrayContaining([
        "GET /api/sessions/session-smoke/messages",
        "POST /api/sessions/session-smoke/messages/stream",
        "GET /api/sessions/session-smoke/tasks",
        "POST /api/sessions/session-smoke/cancel",
        "GET /api/workspace-files/directory",
        "GET /api/workspace-files/file",
        "GET /api/workspace-files/search",
      ]))
    } finally {
      await agent.close()
    }
  })

  it("refreshes the one-time pairing code without rotating the legacy bridge token", async () => {
    const status = await ensureMobileBridgeServerRunning()
    const originalToken = status.token
    const originalPairingCode = new URL(status.pairingLocalUrl ?? "").searchParams.get("code")
    expect(originalPairingCode).toBeTruthy()

    const refreshed = await refreshMobilePairingCode()
    const refreshedPairingCode = new URL(refreshed.pairingLocalUrl ?? "").searchParams.get("code")

    expect(refreshed.token).toBe(originalToken)
    expect(refreshedPairingCode).toBeTruthy()
    expect(refreshedPairingCode).not.toBe(originalPairingCode)
  })

  it("writes a local Android handoff file without exposing the legacy bridge token", async () => {
    const status = await ensureMobileBridgeServerRunning()
    const handoffPath = path.join(userDataPath, "mobile-bridge-handoff.json")
    const handoff = JSON.parse(await fs.readFile(handoffPath, "utf8")) as {
      android?: {
        deepLink?: string
        handoffCommand?: string
        pairingUrl?: string
        smokeCommand?: string
      }
      bridge?: {
        port?: number
      }
      pairingExpiresAt?: string
      schemaVersion?: number
    }

    expect(handoff.schemaVersion).toBe(1)
    expect(handoff.bridge?.port).toBe(status.port)
    expect(handoff.android?.pairingUrl).toBe(status.pairingLocalUrl)
    expect(handoff.android?.deepLink).toBe(`anybox-mobile://connect?url=${encodeURIComponent(handoff.android?.pairingUrl ?? "")}`)
    expect(handoff.android?.smokeCommand).toContain("corepack pnpm mobile:android:smoke:bridge")
    expect(handoff.android?.handoffCommand).toContain("corepack pnpm mobile:android:handoff-check")
    expect(handoff.pairingExpiresAt).toBe(new Date(status.pairingExpiresAt ?? 0).toISOString())
    expect(JSON.stringify(handoff)).not.toContain(status.token)
  })
})
