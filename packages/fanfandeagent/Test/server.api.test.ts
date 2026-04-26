import { describe, expect, test } from "bun:test"
import "./sqlite.cleanup.ts"
import { $ } from "bun"
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createServerApp } from "#server/server.ts"
import { createSessionExecutionStream } from "#server/routes/session.ts"
import * as Identifier from "#id/id.ts"
import * as EventStore from "#session/event-store.ts"
import * as Message from "#session/message.ts"
import * as Orchestrator from "#session/orchestrator.ts"
import * as RunningState from "#session/running-state.ts"
import * as Session from "#session/session.ts"
import * as LiveStreamHub from "#session/live-stream-hub.ts"
import * as RuntimeEvent from "#session/runtime-event.ts"
import * as Env from "#env/env.ts"
import * as Config from "#config/config.ts"
import * as SystemPrompt from "#session/system.ts"
import * as Log from "#util/log.ts"

interface JsonEnvelope<T = Record<string, unknown>> {
  success: boolean
  requestId?: string
  data?: T
  error?: {
    code: string
    message: string
  }
}

type SessionResponseEnvelope = JsonEnvelope<{
  id: string
  projectID: string
  directory: string
  title: string
}>

interface ProjectRecord {
  id: string
  worktree: string
  name?: string
  created: number
  updated: number
  sandboxes: string[]
}

type ProjectsResponseEnvelope = JsonEnvelope<ProjectRecord[]>

type ProjectSessionsResponseEnvelope = JsonEnvelope<
  Array<{
    id: string
    projectID: string
    directory: string
    title: string
    time: {
      created: number
      updated: number
    }
  }>
>

type ProjectResponseEnvelope = JsonEnvelope<ProjectRecord>

type DeleteSessionResponseEnvelope = JsonEnvelope<{
  sessionID: string
  projectID: string
}>

type DeleteProjectResponseEnvelope = JsonEnvelope<{
  projectID: string
  deletedSessionIDs: string[]
}>

type GitCapabilitiesEnvelope = JsonEnvelope<{
  directory: string
  root: string | null
  branch: string | null
  defaultBranch: string | null
  isGitRepo: boolean
  canCommit: {
    enabled: boolean
    reason?: string
  }
  canStageAllCommit: {
    enabled: boolean
    reason?: string
  }
  canPush: {
    enabled: boolean
    reason?: string
  }
  canCreatePullRequest: {
    enabled: boolean
    reason?: string
  }
  canCreateBranch: {
    enabled: boolean
    reason?: string
  }
}>

type GitActionEnvelope = JsonEnvelope<{
  directory: string
  root: string
  branch: string | null
  stdout: string
  stderr: string
  summary: string
  url?: string
}>

type GitBranchesEnvelope = JsonEnvelope<
  Array<{
    name: string
    kind: "local" | "remote"
    current: boolean
  }>
>

type SessionMessagesResponseEnvelope = JsonEnvelope<
  Array<{
    info: {
      id: string
      sessionID: string
      role: "user" | "assistant"
    }
    parts: Array<{
      id: string
      type: string
      text?: string
    }>
  }>
>

type ProviderCatalogEnvelope = JsonEnvelope<
  Array<{
    id: string
    name: string
    configured: boolean
    available: boolean
    apiKeyConfigured: boolean
    modelCount: number
    authScope?: "global"
    activeAuthMethod?: string
    authState?: {
      activeMethod?: string
      status: string
      connectionLabel?: string
    }
  }>
>

type ProviderAuthStateEnvelope = JsonEnvelope<{
  providerID: string
  scope: "global"
  activeMethod?: string
  status: string
  connectionLabel?: string
  account?: {
    email?: string
    planType?: string
    workspaceName?: string
  }
  credentials: Array<{
    method: string
    kind: "api_key" | "oauth_session"
    source: "credential_store" | "legacy_config" | "environment" | "external_cache"
    configured: boolean
  }>
}>

type ProviderAuthFlowEnvelope = JsonEnvelope<{
  id: string
  providerID: string
  method: string
  kind: "browser_oauth" | "device_code" | "api_key"
  status: string
  authorizationURL?: string
  verificationURI?: string
  userCode?: string
  errorMessage?: string
  account?: {
    email?: string
    planType?: string
    workspaceName?: string
  }
}>

type ProviderListEnvelope = JsonEnvelope<{
  items: Array<{
    id: string
    name: string
    configured: boolean
    available: boolean
    apiKeyConfigured: boolean
    modelCount: number
    models: Array<{
      id: string
      providerID: string
      available: boolean
    }>
  }>
  selection: {
    model?: string
    small_model?: string
  }
}>

type ProviderUpdateEnvelope = JsonEnvelope<{
  provider: {
    id: string
    name: string
    available: boolean
    apiKeyConfigured: boolean
    models: Array<{
      id: string
      providerID: string
    }>
  }
  selection: {
    model?: string
    small_model?: string
  }
}>

type ProjectModelsEnvelope = JsonEnvelope<{
  items: Array<{
    id: string
    providerID: string
    available: boolean
  }>
  selection: {
    model?: string
    small_model?: string
  }
}>

type SkillListEnvelope = JsonEnvelope<
  Array<{
    id: string
    name: string
    description: string
    path: string
    scope: "project" | "user"
  }>
>

type ProjectSkillSelectionEnvelope = JsonEnvelope<{
  skillIDs: string[]
}>

type McpAllowedTools =
  | string[]
  | {
      readOnly?: boolean
      toolNames?: string[]
    }

type McpRequireApproval =
  | "always"
  | "never"
  | {
      never?: {
        toolNames?: string[]
      }
    }

type StdioMcpServerSummary = {
  id: string
  name?: string
  transport: "stdio"
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  enabled: boolean
  timeoutMs?: number
}

type RemoteMcpServerSummary = {
  id: string
  name?: string
  transport: "remote"
  provider?: "openai"
  serverUrl: string
  connectorId?: string
  authorization?: string
  headers?: Record<string, string>
  serverDescription?: string
  allowedTools?: McpAllowedTools
  requireApproval?: McpRequireApproval
  enabled: boolean
  timeoutMs?: number
}

type McpServerListEnvelope = JsonEnvelope<
  Array<StdioMcpServerSummary | RemoteMcpServerSummary>
>

type McpServerEnvelope = JsonEnvelope<StdioMcpServerSummary | RemoteMcpServerSummary>

type McpDeleteEnvelope = JsonEnvelope<{
  serverID: string
  removed: boolean
}>

type PromptPresetSummaryEnvelope = JsonEnvelope<
  Array<{
    id: string
    label: string
    description: string
    source: "bundled" | "custom"
    hasOverride: boolean
    editable: boolean
    sourcePath?: string
  }>
>

type PromptPresetDocumentEnvelope = JsonEnvelope<{
  id: string
  label: string
  description: string
  source: "bundled" | "custom"
  hasOverride: boolean
  editable: boolean
  sourcePath?: string
  content: string
}>

type PromptPresetSelectionEnvelope = JsonEnvelope<{
  systemPromptPresetID: string
  planModePromptPresetID: string
}>

const modelsDevFixture = {
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    env: ["DEEPSEEK_API_KEY"],
    api: "https://api.deepseek.com",
    npm: "@ai-sdk/deepseek",
    models: {
      "deepseek-reasoner": {
        id: "deepseek-reasoner",
        name: "DeepSeek Reasoner",
        family: "deepseek",
        release_date: "2024-01-01",
        attachment: false,
        reasoning: true,
        temperature: true,
        tool_call: true,
        limit: {
          context: 128000,
          output: 8192,
        },
        modalities: {
          input: ["text"],
          output: ["text"],
        },
        options: {},
        headers: {},
      },
    },
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    env: ["OPENAI_API_KEY"],
    api: "https://api.openai.com/v1",
    npm: "@ai-sdk/openai",
    models: {
      "gpt-4o-mini": {
        id: "gpt-4o-mini",
        name: "GPT-4o mini",
        family: "gpt-4o",
        release_date: "2024-07-18",
        attachment: true,
        reasoning: false,
        temperature: true,
        tool_call: true,
        limit: {
          context: 128000,
          output: 8192,
        },
        modalities: {
          input: ["text", "image"],
          output: ["text"],
        },
        options: {},
        headers: {},
      },
    },
  },
}

async function createGitRepo(root: string, seed: string) {
  await mkdir(root, { recursive: true })
  await writeFile(join(root, "README.md"), `# ${seed}\n`)
  await $`git init`.cwd(root).quiet()
  await $`git config user.email test@example.com`.cwd(root).quiet()
  await $`git config user.name fanfande-test`.cwd(root).quiet()
  await $`git add README.md`.cwd(root).quiet()
  await $`git commit -m init`.cwd(root).quiet()
}

async function createBareGitRemote(root: string) {
  await mkdir(root, { recursive: true })
  await $`git init --bare`.cwd(root).quiet()
}

async function attachTrackedRemote(root: string, branch: string, remoteRoot: string) {
  await $`git branch -M ${branch}`.cwd(root).quiet()
  await $`git remote add origin ${remoteRoot}`.cwd(root).quiet()
  await $`git push -u origin ${branch}`.cwd(root).quiet()
}

async function createDirectoryLink(linkPath: string, target: string) {
  await symlink(target, linkPath, process.platform === "win32" ? "junction" : "dir")
}

async function removeDirectoryLink(linkPath: string) {
  try {
    await rm(linkPath, { force: true })
  } catch (error) {
    if (process.platform !== "win32") {
      throw error
    }

    await $`cmd /c rmdir ${linkPath}`.quiet()
  }
}

function mockModelsDevFetch(
  validationHandler?: (input: { url: string; headers: Headers }) => Response | Promise<Response> | undefined,
) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = new Proxy(originalFetch, {
    apply(target, thisArg, args: Parameters<typeof fetch>) {
      const [input, init] = args
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
      if (url === "https://models.dev/api.json") {
        return Promise.resolve(Response.json(modelsDevFixture))
      }

      const customResponse = validationHandler?.({ url, headers })
      if (customResponse) {
        return Promise.resolve(customResponse)
      }

      if (url === "https://api.deepseek.com/models" || url === "https://proxy.deepseek.test/v1/models") {
        return Promise.resolve(
          Response.json({
            object: "list",
            data: [{ id: "deepseek-reasoner" }],
          }),
        )
      }

      if (url === "https://api.openai.com/v1/models") {
        return Promise.resolve(
          Response.json({
            object: "list",
            data: [{ id: "gpt-4o-mini" }],
          }),
        )
      }

      return Reflect.apply(target, thisArg, [input, init])
    },
  }) as typeof fetch

  return () => {
    globalThis.fetch = originalFetch
  }
}

async function resetGlobalProviderState(app: ReturnType<typeof createServerApp>) {
  await app.request("http://localhost/api/providers/deepseek", {
    method: "DELETE",
  })
  await app.request("http://localhost/api/providers/openai", {
    method: "DELETE",
  })
  await app.request("http://localhost/api/model-selection", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: null,
      small_model: null,
    }),
  })
  await app.request("http://localhost/api/providers/deepseek/auth/api-key", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      apiKey: null,
    }),
  })
  await app.request("http://localhost/api/providers/openai/auth/api-key", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      apiKey: null,
    }),
  })
  await app.request("http://localhost/api/providers/deepseek/auth/session", {
    method: "DELETE",
  })
  await app.request("http://localhost/api/providers/openai/auth/session", {
    method: "DELETE",
  })
}

async function withTemporaryEnv<T>(
  overrides: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  const backup = new Map<string, string | undefined>()

  for (const [key, value] of Object.entries(overrides)) {
    backup.set(key, process.env[key])
    if (value === undefined) {
      delete process.env[key]
      Env.remove(key)
    } else {
      process.env[key] = value
      Env.set(key, value)
    }
  }

  try {
    return await fn()
  } finally {
    for (const [key, value] of backup.entries()) {
      if (value === undefined) {
        delete process.env[key]
        Env.remove(key)
      } else {
        process.env[key] = value
        Env.set(key, value)
      }
    }
  }
}

function encodeJwt(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
  return `${header}.${body}.signature`
}

async function readStreamUntil(
  response: Response,
  contains: string[],
  maxReads = 12,
) {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error("Expected streaming response body")
  }

  const decoder = new TextDecoder()
  let raw = ""

  try {
    for (let index = 0; index < maxReads; index += 1) {
      const next = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Timed out while reading stream")), 2000)
        }),
      ])

      if (next.done) {
        break
      }

      raw += decoder.decode(next.value, { stream: true })
      if (contains.every((pattern) => raw.includes(pattern))) {
        break
      }
    }

    raw += decoder.decode()
    return raw
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

async function readStreamUntilOccurrences(
  response: Response,
  pattern: string,
  count: number,
  maxReads = 12,
) {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error("Expected streaming response body")
  }

  const decoder = new TextDecoder()
  let raw = ""

  try {
    for (let index = 0; index < maxReads; index += 1) {
      const next = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Timed out while reading stream")), 2000)
        }),
      ])

      if (next.done) {
        break
      }

      raw += decoder.decode(next.value, { stream: true })
      if (raw.split(pattern).length - 1 >= count) {
        break
      }
    }

    raw += decoder.decode()
    return raw
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

describe("server api", () => {
  test("GET /healthz should return request id header", async () => {
    const app = createServerApp()
    const response = await app.request("http://localhost/healthz")
    const body = (await response.json()) as JsonEnvelope

    expect(response.status).toBe(200)
    expect(response.headers.get("x-request-id")).toBeString()
    expect(body.success).toBe(true)
    expect(body.data?.ok).toBe(true)
    expect(body.requestId).toBeString()
  })

  test("GET /api/debug/status should expose process health and recent errors", async () => {
    const app = createServerApp()
    const message = `monitor status error ${Date.now()}`
    Log.create({ service: "monitor-test-status" }).error(message, {
      requestId: "req_monitor_status",
      token: "secret-token",
    })

    const response = await app.request("http://localhost/api/debug/status")
    const body = (await response.json()) as JsonEnvelope<{
      ok: boolean
      generatedAt: number
      process: {
        pid: number
        uptimeMs: number
        memory: {
          heapUsed: number
        }
      }
      logging: {
        level: string
        print: boolean
        file: boolean
      }
      runningSessions: {
        count: number
      }
      recentErrors: Log.LogEntry[]
    }>

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data?.ok).toBe(true)
    expect(body.data?.generatedAt).toBeNumber()
    expect(body.data?.process.pid).toBeNumber()
    expect(body.data?.process.uptimeMs).toBeNumber()
    expect(body.data?.process.memory.heapUsed).toBeNumber()
    expect(body.data?.logging.level).toBeString()
    expect(body.data?.runningSessions.count).toBeNumber()
    const statusLog = body.data?.recentErrors.find((entry) => entry.message === message)
    expect(statusLog?.requestId).toBe("req_monitor_status")
    expect(statusLog?.extra?.token).toBe("[REDACTED]")
  })

  test("GET /api/debug/logs should filter in-memory log entries", async () => {
    const app = createServerApp()
    const message = `monitor log query ${Date.now()}`
    Log.create({ service: "monitor-test-logs" }).warn(message, {
      sessionID: "ses_monitor_logs",
      password: "secret-password",
    })

    const response = await app.request(
      `http://localhost/api/debug/logs?service=monitor-test-logs&q=${encodeURIComponent(message)}&limit=5`,
    )
    const body = (await response.json()) as JsonEnvelope<{
      logs: Log.LogEntry[]
    }>

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data?.logs.length).toBeGreaterThanOrEqual(1)
    const entry = body.data?.logs.find((item) => item.message === message)
    expect(entry?.level).toBe("WARN")
    expect(entry?.service).toBe("monitor-test-logs")
    expect(entry?.sessionID).toBe("ses_monitor_logs")
    expect(entry?.extra?.password).toBe("[REDACTED]")
  })

  test("GET /api/debug/logs/stream should emit matching log events", async () => {
    const app = createServerApp()
    const message = `monitor stream log ${Date.now()}`
    const response = await app.request("http://localhost/api/debug/logs/stream?service=monitor-test-stream")
    const rawPromise = readStreamUntil(response, ["event: log", message])

    Log.create({ service: "monitor-test-stream" }).info(message, {
      projectID: "project_monitor_stream",
    })

    const raw = await rawPromise

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/event-stream")
    expect(raw).toContain("event: log")
    expect(raw).toContain(message)
    expect(raw).toContain(`"projectID":"project_monitor_stream"`)
  })

  test("GET /api/debug/status/stream should push status snapshots", async () => {
    const app = createServerApp()
    const message = `monitor status stream ${Date.now()}`
    const response = await app.request("http://localhost/api/debug/status/stream")
    const rawPromise = readStreamUntil(response, ["event: status", "\"runtime\"", message])

    Log.create({ service: "monitor-test-status-stream" }).error(message)

    const raw = await rawPromise

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/event-stream")
    expect(raw).toContain("event: status")
    expect(raw).toContain("\"status\"")
    expect(raw).toContain("\"runtime\"")
    expect(raw).toContain(message)
  })

  test("GET /api/debug/status/stream should keep pushing snapshots while idle", async () => {
    const app = createServerApp()
    const response = await app.request("http://localhost/api/debug/status/stream")
    const raw = await readStreamUntilOccurrences(response, "event: status", 2)

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/event-stream")
    expect(raw.split("event: status").length - 1).toBeGreaterThanOrEqual(2)
  })

  test("GET /api/debug runtime routes should expose running session state and recent events", async () => {
    const app = createServerApp()
    const session = await Session.createSession({
      directory: process.cwd(),
      projectID: "project_debug_runtime",
      title: "Debug runtime",
    })
    const controller = new AbortController()
    const assistantMessageID = Identifier.ascending("message")
    const toolPart: Message.ToolPart = {
      id: Identifier.ascending("part"),
      sessionID: session.id,
      messageID: assistantMessageID,
      type: "tool",
      callID: "toolcall_debug_runtime",
      tool: "read-file",
      state: {
        status: "waiting-approval",
        approvalID: "approval_debug_runtime",
        input: {
          path: "README.md",
        },
        title: "Read File",
        time: {
          start: Date.now(),
        },
      },
    }

    RunningState.register(session.id, controller, {
      startedAt: 123,
      reason: "prompt",
    })

    const turn = Orchestrator.startTurn({
      sessionID: session.id,
      userMessageID: Identifier.ascending("message"),
      agent: "default",
      model: {
        providerID: "test-provider",
        modelID: "test-model",
      },
    })

    try {
      turn.emit("tool.call.waiting_approval", {
        part: toolPart,
      })

      const globalResponse = await app.request("http://localhost/api/debug/runtime?limit=3")
      const globalBody = (await globalResponse.json()) as JsonEnvelope<{
        logging: {
          print: boolean
          file: boolean
          path: string | null
        }
        runningSessions: Array<{
          session: {
            id: string
            title: string
          }
          running: {
            sessionID: string
            activeForMs: number
            reason?: string
          }
          turn: {
            id: string
          } | null
          recentEvents: Array<{
            type: string
          }>
        }>
      }>

      expect(globalResponse.status).toBe(200)
      expect(globalBody.success).toBe(true)
      expect(typeof globalBody.data?.logging.print).toBe("boolean")
      expect(globalBody.data?.runningSessions).toHaveLength(1)
      expect(globalBody.data?.runningSessions[0]?.session.id).toBe(session.id)
      expect(globalBody.data?.runningSessions[0]?.session.title).toBe("Debug runtime")
      expect(globalBody.data?.runningSessions[0]?.running.sessionID).toBe(session.id)
      expect(globalBody.data?.runningSessions[0]?.running.reason).toBe("prompt")
      expect(globalBody.data?.runningSessions[0]?.turn?.id).toBe(turn.turnID)
      expect(globalBody.data?.runningSessions[0]?.recentEvents.some((event) => event.type === "turn.started")).toBe(true)
      expect(
        globalBody.data?.runningSessions[0]?.recentEvents.some((event) => event.type === "tool.call.waiting_approval"),
      ).toBe(true)

      const detailResponse = await app.request(`http://localhost/api/debug/sessions/${session.id}/runtime?limit=5`)
      const detailBody = (await detailResponse.json()) as JsonEnvelope<{
        session: {
          id: string
          directory: string
        }
        running: {
          sessionID: string
          activeForMs: number
          reason?: string
        }
        turn: {
          id: string
        } | null
        recentEvents: Array<{
          type: string
          summary?: Record<string, unknown>
        }>
      }>

      expect(detailResponse.status).toBe(200)
      expect(detailBody.success).toBe(true)
      expect(detailBody.data?.session.id).toBe(session.id)
      expect(detailBody.data?.session.directory).toBe(process.cwd())
      expect(detailBody.data?.running.sessionID).toBe(session.id)
      expect(detailBody.data?.turn?.id).toBe(turn.turnID)
      const detailEvents = detailBody.data?.recentEvents ?? []
      const latestEvent = detailEvents[detailEvents.length - 1]
      expect(latestEvent?.type).toBe("tool.call.waiting_approval")
      expect(latestEvent?.summary?.["tool"]).toBe("read-file")
      expect(latestEvent?.summary?.["status"]).toBe("waiting-approval")
    } finally {
      Orchestrator.finishTurn(turn)
      RunningState.finish(session.id, controller)
      Session.removeSession(session.id)
    }
  })

  test("POST /api/sessions should validate payload", async () => {
    const app = createServerApp()
    const response = await app.request("http://localhost/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })
    const body = (await response.json()) as JsonEnvelope

    expect(response.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error?.code).toBe("INVALID_PAYLOAD")
  })

  test("POST /api/projects should validate payload", async () => {
    const app = createServerApp()
    const response = await app.request("http://localhost/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })
    const body = (await response.json()) as JsonEnvelope

    expect(response.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error?.code).toBe("INVALID_PAYLOAD")
  })

  test("GET unknown route should return 404 json envelope", async () => {
    const app = createServerApp()
    const response = await app.request("http://localhost/unknown-route")
    const body = (await response.json()) as JsonEnvelope

    expect(response.status).toBe(404)
    expect(body.success).toBe(false)
    expect(body.error?.code).toBe("NOT_FOUND")
  })

  test("POST /api/sessions/:id/messages/stream should validate payload", async () => {
    const app = createServerApp()
    const response = await app.request("http://localhost/api/sessions/session_1/messages/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })
    const body = (await response.json()) as JsonEnvelope

    expect(response.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error?.code).toBe("INVALID_PAYLOAD")
  })

  test("POST /api/sessions/:id/messages/stream should return 404 for missing session", async () => {
    const app = createServerApp()
    const response = await app.request("http://localhost/api/sessions/session_missing/messages/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hello" }),
    })
    const body = (await response.json()) as JsonEnvelope

    expect(response.status).toBe(404)
    expect(body.success).toBe(false)
    expect(body.error?.code).toBe("SESSION_NOT_FOUND")
  })

  test("GET /api/sessions/:id/messages should return 404 for missing session", async () => {
    const app = createServerApp()
    const response = await app.request("http://localhost/api/sessions/session_missing/messages")
    const body = (await response.json()) as JsonEnvelope

    expect(response.status).toBe(404)
    expect(body.success).toBe(false)
    expect(body.error?.code).toBe("SESSION_NOT_FOUND")
  })

  test("GET /api/projects should include the project after creating a session", async () => {
    const app = createServerApp()
    const directory = process.cwd()

    const createResponse = await app.request("http://localhost/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ directory }),
    })
    const createBody = (await createResponse.json()) as SessionResponseEnvelope

    expect(createResponse.status).toBe(201)
    expect(createBody.success).toBe(true)
    expect(createBody.data?.projectID).toBeString()

    const response = await app.request("http://localhost/api/projects")
    const body = (await response.json()) as ProjectsResponseEnvelope

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data?.some((project) => project.id === createBody.data?.projectID)).toBe(true)
  })

  test("GET /api/projects should keep the same project id when a directory becomes a git repo", async () => {
    const app = createServerApp()
    const directory = await mkdtemp(join(tmpdir(), "fanfande-directory-to-git-"))

    try {
      const createResponse = await app.request("http://localhost/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory }),
      })
      const createBody = (await createResponse.json()) as SessionResponseEnvelope

      expect(createResponse.status).toBe(201)
      expect(createBody.success).toBe(true)
      expect(createBody.data?.projectID).toMatch(/^prj_/)

      await createGitRepo(directory, "migrated-repo")

      const response = await app.request("http://localhost/api/projects")
      const body = (await response.json()) as ProjectsResponseEnvelope

      expect(response.status).toBe(200)
      expect(body.success).toBe(true)

      const migratedProject = body.data?.find((project) => project.id === createBody.data?.projectID)
      expect(migratedProject).toBeDefined()
      expect(migratedProject?.worktree).toBe(directory)

      const sessionsResponse = await app.request(`http://localhost/api/projects/${migratedProject!.id}/sessions`)
      const sessionsBody = (await sessionsResponse.json()) as ProjectSessionsResponseEnvelope

      expect(sessionsResponse.status).toBe(200)
      expect(sessionsBody.success).toBe(true)
      expect(
        sessionsBody.data?.some(
          (session) => session.id === createBody.data?.id && session.projectID === migratedProject!.id,
        ),
      ).toBe(true)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("project git routes should keep working with the original project id after git init", async () => {
    const app = createServerApp()
    const directory = await mkdtemp(join(tmpdir(), "fanfande-stable-project-git-"))
    let sessionID: string | undefined

    try {
      const createResponse = await app.request("http://localhost/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory }),
      })
      const createBody = (await createResponse.json()) as SessionResponseEnvelope

      expect(createResponse.status).toBe(201)
      expect(createBody.success).toBe(true)
      expect(createBody.data?.projectID).toMatch(/^prj_/)
      sessionID = createBody.data?.id

      await createGitRepo(directory, "stable-project")

      const capabilitiesResponse = await app.request(
        `http://localhost/api/projects/${createBody.data!.projectID}/git/capabilities?directory=${encodeURIComponent(directory)}`,
      )
      const capabilitiesBody = (await capabilitiesResponse.json()) as GitCapabilitiesEnvelope

      expect(capabilitiesResponse.status).toBe(200)
      expect(capabilitiesBody.success).toBe(true)
      expect(capabilitiesBody.data?.isGitRepo).toBe(true)

      const branchResponse = await app.request(
        `http://localhost/api/projects/${createBody.data!.projectID}/git/branches`,
        {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          directory,
          name: "feature/stable-project-id",
        }),
      },
      )
      const branchBody = (await branchResponse.json()) as GitActionEnvelope

      expect(branchResponse.status).toBe(200)
      expect(branchBody.success).toBe(true)
      expect(branchBody.data?.branch).toBe("feature/stable-project-id")
    } finally {
      if (sessionID) {
        await app.request(`http://localhost/api/sessions/${sessionID}`, {
          method: "DELETE",
        })
      }
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("POST /api/projects should create a project and expose its session list", async () => {
    const app = createServerApp()
    const directory = process.cwd()

    const createResponse = await app.request("http://localhost/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ directory }),
    })
    const createBody = (await createResponse.json()) as ProjectResponseEnvelope

    expect(createResponse.status).toBe(201)
    expect(createBody.success).toBe(true)
    expect(createBody.data?.id).toBeString()
    expect(createBody.data?.worktree).toBeString()

    const sessionsResponse = await app.request(`http://localhost/api/projects/${createBody.data!.id}/sessions`)
    const sessionsBody = (await sessionsResponse.json()) as ProjectSessionsResponseEnvelope

    expect(sessionsResponse.status).toBe(200)
    expect(sessionsBody.success).toBe(true)
    expect(Array.isArray(sessionsBody.data)).toBe(true)
    expect(sessionsBody.data?.every((session) => session.projectID === createBody.data?.id)).toBe(true)
  })

  test("global and project provider routes should stay isolated", async () => {
    const restoreFetch = mockModelsDevFetch()
    const app = createServerApp()
    const repositoryRoot = await mkdtemp(join(tmpdir(), "fanfande-provider-project-"))

    try {
      await withTemporaryEnv(
        {
          OPENAI_API_KEY: undefined,
          DEEPSEEK_API_KEY: undefined,
        },
        async () => {
          await createGitRepo(repositoryRoot, "provider-project")
          await resetGlobalProviderState(app)

          const catalogResponse = await app.request("http://localhost/api/providers/catalog")
          const catalogBody = (await catalogResponse.json()) as ProviderCatalogEnvelope

          expect(catalogResponse.status).toBe(200)
          expect(catalogBody.success).toBe(true)
          expect(catalogBody.data?.some((provider) => provider.id === "deepseek" && provider.modelCount > 0)).toBe(true)
          expect(catalogBody.data?.some((provider) => provider.id === "openai" && provider.configured === false)).toBe(true)

          const refreshedCatalogResponse = await app.request("http://localhost/api/providers/catalog/refresh", {
            method: "POST",
          })
          const refreshedCatalogBody = (await refreshedCatalogResponse.json()) as ProviderCatalogEnvelope

          expect(refreshedCatalogResponse.status).toBe(200)
          expect(refreshedCatalogBody.success).toBe(true)
          expect(refreshedCatalogBody.data?.some((provider) => provider.id === "deepseek" && provider.modelCount > 0)).toBe(
            true,
          )

          const configureResponse = await app.request("http://localhost/api/providers/deepseek", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: "DeepSeek",
              whitelist: ["deepseek-reasoner"],
              options: {
                apiKey: "test-deepseek-key",
                baseURL: "https://api.deepseek.com",
              },
            }),
          })
          const configureBody = (await configureResponse.json()) as ProviderUpdateEnvelope

          expect(configureResponse.status).toBe(200)
          expect(configureBody.success).toBe(true)
          expect(configureBody.data?.provider.id).toBe("deepseek")
          expect(configureBody.data?.provider.apiKeyConfigured).toBe(true)
          expect(configureBody.data?.provider.available).toBe(true)
          expect(configureBody.data?.provider.models).toHaveLength(1)
          expect((configureBody.data?.provider as Record<string, unknown> | undefined)?.key).toBeUndefined()

          const reconfigureResponse = await app.request("http://localhost/api/providers/deepseek", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              options: {
                baseURL: "https://proxy.deepseek.test/v1",
              },
            }),
          })
          const reconfigureBody = (await reconfigureResponse.json()) as ProviderUpdateEnvelope

          expect(reconfigureResponse.status).toBe(200)
          expect(reconfigureBody.success).toBe(true)
          expect(reconfigureBody.data?.provider.apiKeyConfigured).toBe(true)
          expect((reconfigureBody.data?.provider as Record<string, unknown> | undefined)?.baseURL).toBe("https://proxy.deepseek.test/v1")

          const providersResponse = await app.request("http://localhost/api/providers")
          const providersBody = (await providersResponse.json()) as ProviderListEnvelope

          expect(providersResponse.status).toBe(200)
          expect(providersBody.data?.items).toHaveLength(1)
          expect(providersBody.data?.items[0]?.id).toBe("deepseek")
          expect(providersBody.data?.items[0]?.models[0]?.id).toBe("deepseek-reasoner")

          const modelsResponse = await app.request("http://localhost/api/models")
          const modelsBody = (await modelsResponse.json()) as ProjectModelsEnvelope

          expect(modelsResponse.status).toBe(200)
          expect(modelsBody.data?.items).toHaveLength(1)
          expect(modelsBody.data?.items[0]).toMatchObject({
            providerID: "deepseek",
            id: "deepseek-reasoner",
            available: true,
          })

          const selectionResponse = await app.request("http://localhost/api/model-selection", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              model: "deepseek/deepseek-reasoner",
            }),
          })
          const selectionBody = (await selectionResponse.json()) as JsonEnvelope<{
            model?: string
            small_model?: string
          }>

          expect(selectionResponse.status).toBe(200)
          expect(selectionBody.data?.model).toBe("deepseek/deepseek-reasoner")

          const projectResponse = await app.request("http://localhost/api/projects", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ directory: repositoryRoot }),
          })
          const projectBody = (await projectResponse.json()) as ProjectResponseEnvelope
          const projectID = projectBody.data?.id

          expect(projectResponse.status).toBe(201)
          expect(projectID).toBeString()

          const projectCatalogRefreshResponse = await app.request(
            `http://localhost/api/projects/${projectID}/providers/catalog/refresh`,
            {
              method: "POST",
            },
          )
          const projectCatalogRefreshBody = (await projectCatalogRefreshResponse.json()) as ProviderCatalogEnvelope

          expect(projectCatalogRefreshResponse.status).toBe(200)
          expect(projectCatalogRefreshBody.success).toBe(true)
          expect(projectCatalogRefreshBody.data?.some((provider) => provider.id === "openai")).toBe(true)

          const compatibilityResponse = await app.request(`http://localhost/api/projects/${projectID}/models`)
          const compatibilityBody = (await compatibilityResponse.json()) as ProjectModelsEnvelope

          expect(compatibilityResponse.status).toBe(200)
          expect(compatibilityBody.data?.selection.model).toBeUndefined()
          expect(compatibilityBody.data?.items).toHaveLength(0)

          const projectConfigureResponse = await app.request(`http://localhost/api/projects/${projectID}/providers/openai`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: "OpenAI",
              whitelist: ["gpt-4o-mini"],
              options: {
                apiKey: "test-openai-key",
                baseURL: "https://api.openai.com/v1",
              },
            }),
          })
          const projectConfigureBody = (await projectConfigureResponse.json()) as ProviderUpdateEnvelope

          expect(projectConfigureResponse.status).toBe(200)
          expect(projectConfigureBody.data?.provider.id).toBe("openai")
          expect(projectConfigureBody.data?.provider.apiKeyConfigured).toBe(true)

          const projectModelsResponse = await app.request(`http://localhost/api/projects/${projectID}/models`)
          const projectModelsBody = (await projectModelsResponse.json()) as ProjectModelsEnvelope

          expect(projectModelsResponse.status).toBe(200)
          expect(projectModelsBody.data?.items).toHaveLength(1)
          expect(projectModelsBody.data?.items[0]).toMatchObject({
            providerID: "openai",
            id: "gpt-4o-mini",
            available: true,
          })
          expect(projectModelsBody.data?.selection.model).toBeUndefined()

          const globalModelsAfterProjectResponse = await app.request("http://localhost/api/models")
          const globalModelsAfterProjectBody = (await globalModelsAfterProjectResponse.json()) as ProjectModelsEnvelope

          expect(globalModelsAfterProjectResponse.status).toBe(200)
          expect(globalModelsAfterProjectBody.data?.items).toHaveLength(1)
          expect(globalModelsAfterProjectBody.data?.items[0]).toMatchObject({
            providerID: "deepseek",
            id: "deepseek-reasoner",
          })

          const removeResponse = await app.request("http://localhost/api/providers/deepseek", {
            method: "DELETE",
          })
          const removeBody = (await removeResponse.json()) as JsonEnvelope<{
            providerID: string
            selection: {
              model?: string
              small_model?: string
            }
          }>

          expect(removeResponse.status).toBe(200)
          expect(removeBody.data?.providerID).toBe("deepseek")
          expect(removeBody.data?.selection.model).toBeUndefined()
        },
      )
    } finally {
      await resetGlobalProviderState(app)
      restoreFetch()
      await rm(repositoryRoot, { recursive: true, force: true })
    }
  })

  test("GET /api/projects/:id/skills should list project skills with metadata fallback", async () => {
    const app = createServerApp()
    const repositoryRoot = await mkdtemp(join(tmpdir(), "fanfande-skills-project-"))

    try {
      await createGitRepo(repositoryRoot, "skills-project")
      await mkdir(join(repositoryRoot, ".anybox", "skills", "reviewer"), { recursive: true })
      await writeFile(
        join(repositoryRoot, ".anybox", "skills", "reviewer", "SKILL.md"),
        [
          "---",
          "name: Reviewer",
          "description: Review code changes before merge",
          "---",
          "",
          "# Reviewer",
          "",
          "Always review carefully.",
          "",
        ].join("\n"),
      )

      await mkdir(join(repositoryRoot, ".anybox", "skills", "writer"), { recursive: true })
      await writeFile(
        join(repositoryRoot, ".anybox", "skills", "writer", "SKILL.md"),
        [
          "# Writer",
          "",
          "Draft concise release notes from the latest change set.",
          "",
          "Include user-facing impact first.",
          "",
        ].join("\n"),
      )

      const projectResponse = await app.request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory: repositoryRoot }),
      })
      const projectBody = (await projectResponse.json()) as ProjectResponseEnvelope
      const projectID = projectBody.data?.id

      expect(projectResponse.status).toBe(201)
      expect(projectID).toBeString()

      const response = await app.request(`http://localhost/api/projects/${projectID}/skills`)
      const body = (await response.json()) as SkillListEnvelope

      expect(response.status).toBe(200)
      expect(body.success).toBe(true)
      const projectSkills = body.data?.filter((skill) => skill.scope === "project") ?? []
      expect(projectSkills).toHaveLength(2)
      expect(projectSkills.find((skill) => skill.id === "project:reviewer")).toMatchObject({
        name: "Reviewer",
        description: "Review code changes before merge",
        scope: "project",
      })
      expect(projectSkills.find((skill) => skill.id === "project:writer")).toMatchObject({
        name: "writer",
        description: "Writer",
        scope: "project",
      })
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true })
    }
  })

  test("project skill selection routes should persist project-scoped skill ids", async () => {
    const app = createServerApp()
    const repositoryRoot = await mkdtemp(join(tmpdir(), "fanfande-skill-selection-project-"))

    try {
      await createGitRepo(repositoryRoot, "skill-selection-project")
      await mkdir(join(repositoryRoot, ".anybox", "skills", "reviewer"), { recursive: true })
      await writeFile(
        join(repositoryRoot, ".anybox", "skills", "reviewer", "SKILL.md"),
        [
          "---",
          "name: Reviewer",
          "description: Review code changes before merge",
          "---",
          "",
          "# Reviewer",
          "",
          "Always review carefully.",
          "",
        ].join("\n"),
      )

      const projectResponse = await app.request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory: repositoryRoot }),
      })
      const projectBody = (await projectResponse.json()) as ProjectResponseEnvelope
      const projectID = projectBody.data?.id

      expect(projectResponse.status).toBe(201)
      expect(projectID).toBeString()

      const updateResponse = await app.request(`http://localhost/api/projects/${projectID}/skills/selection`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          skillIDs: ["project:reviewer", "project:missing", "project:reviewer"],
        }),
      })
      const updateBody = (await updateResponse.json()) as ProjectSkillSelectionEnvelope

      expect(updateResponse.status).toBe(200)
      expect(updateBody.data).toEqual({
        skillIDs: ["project:reviewer"],
      })

      const readResponse = await app.request(`http://localhost/api/projects/${projectID}/skills/selection`)
      const readBody = (await readResponse.json()) as ProjectSkillSelectionEnvelope

      expect(readResponse.status).toBe(200)
      expect(readBody.data).toEqual({
        skillIDs: ["project:reviewer"],
      })
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true })
    }
  })

  test("project MCP routes should persist project-scoped server configs", async () => {
    const app = createServerApp()
    const repositoryRoot = await mkdtemp(join(tmpdir(), "fanfande-mcp-project-"))

    try {
      await createGitRepo(repositoryRoot, "mcp-project")

      const projectResponse = await app.request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory: repositoryRoot }),
      })
      const projectBody = (await projectResponse.json()) as ProjectResponseEnvelope
      const projectID = projectBody.data?.id

      expect(projectResponse.status).toBe(201)
      expect(projectID).toBeString()

      const createResponse = await app.request(`http://localhost/api/projects/${projectID}/mcp/servers/filesystem`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Filesystem",
          command: "node",
          args: ["server.js"],
          env: {
            MCP_MODE: "test",
          },
          cwd: ".",
          enabled: true,
          timeoutMs: 45000,
        }),
      })
      const createBody = (await createResponse.json()) as McpServerEnvelope

      expect(createResponse.status).toBe(200)
      expect(createBody.data).toMatchObject({
        id: "filesystem",
        name: "Filesystem",
        transport: "stdio",
        command: "node",
        args: ["server.js"],
        cwd: ".",
        enabled: true,
        timeoutMs: 45000,
      })

      const listResponse = await app.request(`http://localhost/api/projects/${projectID}/mcp/servers`)
      const listBody = (await listResponse.json()) as McpServerListEnvelope

      expect(listResponse.status).toBe(200)
      expect(listBody.data).toHaveLength(1)
      expect(listBody.data?.[0]).toMatchObject({
        id: "filesystem",
        env: {
          MCP_MODE: "test",
        },
      })

      const deleteResponse = await app.request(`http://localhost/api/projects/${projectID}/mcp/servers/filesystem`, {
        method: "DELETE",
      })
      const deleteBody = (await deleteResponse.json()) as McpDeleteEnvelope

      expect(deleteResponse.status).toBe(200)
      expect(deleteBody.data).toEqual({
        serverID: "filesystem",
        removed: true,
      })

      const emptyResponse = await app.request(`http://localhost/api/projects/${projectID}/mcp/servers`)
      const emptyBody = (await emptyResponse.json()) as McpServerListEnvelope

      expect(emptyResponse.status).toBe(200)
      expect(emptyBody.data).toHaveLength(0)
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true })
    }
  })

  test("project MCP routes should persist remote MCP server configs", async () => {
    const app = createServerApp()
    const repositoryRoot = await mkdtemp(join(tmpdir(), "fanfande-remote-mcp-project-"))

    try {
      await createGitRepo(repositoryRoot, "remote-mcp-project")

      const projectResponse = await app.request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory: repositoryRoot }),
      })
      const projectBody = (await projectResponse.json()) as ProjectResponseEnvelope
      const projectID = projectBody.data?.id

      expect(projectResponse.status).toBe(201)
      expect(projectID).toBeString()

      const createResponse = await app.request(`http://localhost/api/projects/${projectID}/mcp/servers/remote-search`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Remote Search",
          transport: "remote",
          serverUrl: "https://mcp.example.test/server",
          headers: {
            "x-api-key": "secret",
          },
          allowedTools: {
            readOnly: true,
            toolNames: ["search"],
          },
          enabled: true,
          timeoutMs: 30000,
        }),
      })
      const createBody = (await createResponse.json()) as McpServerEnvelope

      expect(createResponse.status).toBe(200)
      expect(createBody.data).toMatchObject({
        id: "remote-search",
        name: "Remote Search",
        transport: "remote",
        serverUrl: "https://mcp.example.test/server",
        headers: {
          "x-api-key": "secret",
        },
        allowedTools: {
          readOnly: true,
          toolNames: ["search"],
        },
        enabled: true,
        timeoutMs: 30000,
      })

      const listResponse = await app.request(`http://localhost/api/projects/${projectID}/mcp/servers`)
      const listBody = (await listResponse.json()) as McpServerListEnvelope

      expect(listResponse.status).toBe(200)
      expect(listBody.data).toHaveLength(1)
      expect(listBody.data?.[0]).toMatchObject({
        id: "remote-search",
        transport: "remote",
        serverUrl: "https://mcp.example.test/server",
      })
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true })
    }
  })

  test("PUT /api/providers/:providerID should reject invalid API keys before saving", async () => {
    const restoreFetch = mockModelsDevFetch(({ url, headers }) => {
      if (url !== "https://api.deepseek.com/models") return undefined

      if (headers.get("authorization") === "Bearer invalid-deepseek-key") {
        return new Response(JSON.stringify({ error: { message: "Invalid API key" } }), {
          status: 401,
          headers: {
            "content-type": "application/json",
          },
        })
      }

      return Response.json({
        object: "list",
        data: [{ id: "deepseek-reasoner" }],
      })
    })
    const app = createServerApp()

    try {
      await withTemporaryEnv(
        {
          OPENAI_API_KEY: undefined,
          DEEPSEEK_API_KEY: undefined,
        },
        async () => {
          await resetGlobalProviderState(app)

          const response = await app.request("http://localhost/api/providers/deepseek", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: "DeepSeek",
              options: {
                apiKey: "invalid-deepseek-key",
                baseURL: "https://api.deepseek.com",
              },
            }),
          })
          const body = (await response.json()) as JsonEnvelope

          expect(response.status).toBe(400)
          expect(body.success).toBe(false)
          expect(body.error?.code).toBe("PROVIDER_VALIDATION_FAILED")
          expect(body.error?.message).toContain("Invalid API key")

          const providersResponse = await app.request("http://localhost/api/providers")
          const providersBody = (await providersResponse.json()) as ProviderListEnvelope

          expect(providersResponse.status).toBe(200)
          expect(providersBody.data?.items).toHaveLength(0)
        },
      )
    } finally {
      await resetGlobalProviderState(app)
      restoreFetch()
    }
  })

  test("provider auth API key routes should persist shared credentials without writing provider config", async () => {
    const app = createServerApp()

    try {
      await withTemporaryEnv(
        {
          OPENAI_API_KEY: undefined,
          DEEPSEEK_API_KEY: undefined,
        },
        async () => {
          await resetGlobalProviderState(app)

          const saveResponse = await app.request("http://localhost/api/providers/openai/auth/api-key", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              apiKey: "sk-openai-auth-test",
            }),
          })
          const saveBody = (await saveResponse.json()) as ProviderAuthStateEnvelope

          expect(saveResponse.status).toBe(200)
          expect(saveBody.success).toBe(true)
          expect(saveBody.data).toMatchObject({
            providerID: "openai",
            scope: "global",
            activeMethod: "api-key",
            status: "connected",
            connectionLabel: "Connected via API key",
          })
          expect(saveBody.data?.credentials).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                method: "api-key",
                kind: "api_key",
                source: "credential_store",
                configured: true,
              }),
            ]),
          )

          const authResponse = await app.request("http://localhost/api/providers/openai/auth")
          const authBody = (await authResponse.json()) as ProviderAuthStateEnvelope

          expect(authResponse.status).toBe(200)
          expect(authBody.success).toBe(true)
          expect(authBody.data).toMatchObject({
            providerID: "openai",
            activeMethod: "api-key",
            status: "connected",
          })

          const catalogResponse = await app.request("http://localhost/api/providers/catalog")
          const catalogBody = (await catalogResponse.json()) as ProviderCatalogEnvelope
          const openAIProvider = catalogBody.data?.find((provider) => provider.id === "openai")

          expect(catalogResponse.status).toBe(200)
          expect(openAIProvider).toMatchObject({
            id: "openai",
            authScope: "global",
            activeAuthMethod: "api-key",
            authState: {
              activeMethod: "api-key",
              status: "connected",
              connectionLabel: "Connected via API key",
            },
          })

          const globalConfig = await Config.get(Config.GLOBAL_CONFIG_ID)
          expect(globalConfig.provider?.openai?.options?.apiKey).toBeUndefined()
        },
      )
    } finally {
      await resetGlobalProviderState(app)
    }
  })

  test("GET /api/providers/:providerID/auth should surface shared Codex ChatGPT cache for OpenAI", async () => {
    const app = createServerApp()
    const codexHome = await mkdtemp(join(tmpdir(), "fanfande-codex-home-"))
    const idToken = encodeJwt({
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
      email: "codex-cache@example.test",
      "https://api.openai.com/auth": {
        chatgpt_account_id: "acct_codex_cache",
        chatgpt_user_id: "user_codex_cache",
        chatgpt_plan_type: "pro",
        chatgpt_workspace_id: "ws_codex_cache",
        chatgpt_workspace_name: "Codex Workspace",
      },
    })

    try {
      await writeFile(
        join(codexHome, "auth.json"),
        JSON.stringify({
          auth_mode: "chatgpt",
          OPENAI_API_KEY: null,
          tokens: {
            access_token: "codex-cache-access-token",
            refresh_token: "codex-cache-refresh-token",
            id_token: idToken,
            account_id: "acct_codex_cache",
          },
          last_refresh: Date.now(),
        }),
      )

      await withTemporaryEnv(
        {
          CODEX_HOME: codexHome,
          OPENAI_API_KEY: undefined,
        },
        async () => {
          await resetGlobalProviderState(app)

          const response = await app.request("http://localhost/api/providers/openai/auth")
          const body = (await response.json()) as ProviderAuthStateEnvelope

          expect(response.status).toBe(200)
          expect(body.success).toBe(true)
          expect(body.data).toMatchObject({
            providerID: "openai",
            scope: "global",
            activeMethod: "chatgpt-browser",
            status: "connected",
            account: {
              email: "codex-cache@example.test",
              planType: "pro",
              workspaceName: "Codex Workspace",
            },
          })
          expect(body.data?.connectionLabel).toContain("Codex cache")
          expect(body.data?.credentials).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                method: "chatgpt-browser",
                kind: "oauth_session",
                source: "external_cache",
                configured: true,
                email: "codex-cache@example.test",
              }),
            ]),
          )
        },
      )
    } finally {
      await rm(codexHome, { recursive: true, force: true })
      await resetGlobalProviderState(app)
    }
  })

  test("POST /api/providers/:providerID/auth/flows should complete OpenAI browser auth through a localhost callback", async () => {
    const app = createServerApp()
    const restoreFetch = mockModelsDevFetch(({ url }) => {
      if (url === "https://auth.openai.com/oauth/token") {
        return Response.json({
          access_token: "browser-access-token",
          refresh_token: "browser-refresh-token",
          id_token: encodeJwt({
            exp: Math.floor(Date.now() / 1000) + 60 * 60,
            email: "browser-auth@example.test",
            "https://api.openai.com/auth": {
              chatgpt_account_id: "acct_browser_auth",
              chatgpt_user_id: "user_browser_auth",
              chatgpt_plan_type: "plus",
              chatgpt_workspace_id: "ws_browser_auth",
              chatgpt_workspace_name: "Browser Workspace",
            },
          }),
          expires_in: 3600,
          token_type: "Bearer",
          scope: "openid profile email offline_access",
        })
      }
    })

    try {
      await withTemporaryEnv(
        {
          FanFande_OPENAI_CODEX_CALLBACK_PORT: "0",
          OPENAI_API_KEY: undefined,
        },
        async () => {
          await resetGlobalProviderState(app)

          const startResponse = await app.request("http://localhost/api/providers/openai/auth/flows", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              method: "chatgpt-browser",
            }),
          })
          const startBody = (await startResponse.json()) as ProviderAuthFlowEnvelope

          expect(startResponse.status).toBe(200)
          expect(startBody.success).toBe(true)
          expect(startBody.data).toMatchObject({
            providerID: "openai",
            method: "chatgpt-browser",
            kind: "browser_oauth",
            status: "waiting_user",
          })

          const authorizationURL = new URL(startBody.data?.authorizationURL ?? "")
          expect(authorizationURL.origin).toBe("https://auth.openai.com")
          expect(authorizationURL.searchParams.get("scope")).toBe("openid profile email offline_access")

          const redirectURI = authorizationURL.searchParams.get("redirect_uri")
          expect(redirectURI).toBeString()

          const redirectURL = new URL(redirectURI ?? "")
          expect(redirectURL.hostname).toBe("localhost")
          expect(redirectURL.pathname).toBe("/auth/callback")
          expect(redirectURL.port).not.toBe("")

          const state = authorizationURL.searchParams.get("state")
          expect(state).toBeString()

          const callbackResponse = await fetch(
            `${redirectURI}?code=browser-auth-code&state=${encodeURIComponent(state ?? "")}`,
          )
          const callbackHtml = await callbackResponse.text()

          expect(callbackResponse.status).toBe(200)
          expect(callbackHtml).toContain("Sign-in complete")

          const flowResponse = await app.request(
            `http://localhost/api/providers/openai/auth/flows/${encodeURIComponent(startBody.data?.id ?? "")}`,
          )
          const flowBody = (await flowResponse.json()) as ProviderAuthFlowEnvelope

          expect(flowResponse.status).toBe(200)
          expect(flowBody.data).toMatchObject({
            id: startBody.data?.id,
            providerID: "openai",
            method: "chatgpt-browser",
            status: "connected",
            account: {
              email: "browser-auth@example.test",
              planType: "plus",
              workspaceName: "Browser Workspace",
            },
          })

          const authResponse = await app.request("http://localhost/api/providers/openai/auth")
          const authBody = (await authResponse.json()) as ProviderAuthStateEnvelope

          expect(authResponse.status).toBe(200)
          expect(authBody.data).toMatchObject({
            providerID: "openai",
            scope: "global",
            activeMethod: "chatgpt-browser",
            status: "connected",
            account: {
              email: "browser-auth@example.test",
              planType: "plus",
              workspaceName: "Browser Workspace",
            },
          })
          expect(authBody.data?.credentials).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                method: "chatgpt-browser",
                kind: "oauth_session",
                source: "credential_store",
                configured: true,
              }),
            ]),
          )
        },
      )
    } finally {
      restoreFetch()
      await resetGlobalProviderState(app)
    }
  })

  test("POST /api/projects should keep folders in the same git repo under one project", async () => {
    const app = createServerApp()
    const repositoryRoot = await mkdtemp(join(tmpdir(), "fanfande-repo-"))
    const firstDirectory = join(repositoryRoot, "client")
    const secondDirectory = join(repositoryRoot, "server")

    try {
      await createGitRepo(repositoryRoot, "shared-repo")
      await mkdir(firstDirectory, { recursive: true })
      await mkdir(secondDirectory, { recursive: true })

      const firstResponse = await app.request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory: firstDirectory }),
      })
      const firstBody = (await firstResponse.json()) as ProjectResponseEnvelope

      const secondResponse = await app.request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory: secondDirectory }),
      })
      const secondBody = (await secondResponse.json()) as ProjectResponseEnvelope

      expect(firstResponse.status).toBe(201)
      expect(secondResponse.status).toBe(201)
      expect(firstBody.data?.id).toBeString()
      expect(secondBody.data?.id).toBeString()
      expect(firstBody.data?.id).toBe(secondBody.data?.id)
      expect(firstBody.data?.worktree).toBe(repositoryRoot)
      expect(secondBody.data?.worktree).toBe(repositoryRoot)
      expect(secondBody.data?.name).toBe(repositoryRoot.split(/[\\/]/).filter(Boolean).pop())

      const listResponse = await app.request("http://localhost/api/projects")
      const listBody = (await listResponse.json()) as ProjectsResponseEnvelope

      expect(listResponse.status).toBe(200)
      expect(
        listBody.data?.some(
          (project) =>
            project.id === firstBody.data?.id &&
            project.worktree === repositoryRoot &&
            project.sandboxes.length === 0,
        ),
      ).toBe(true)
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true })
    }
  })

  test("prompt preset routes should manage assignments, custom presets, resets, and runtime overrides", async () => {
    const app = createServerApp()
    const customPlanPrompt = "Custom plan-mode prompt for runtime verification."
    const customSystemPrompt = "Custom system prompt selected from the preset library."
    let customPresetID: string | null = null

    try {
      await Config.clearPromptOverride(Config.GLOBAL_CONFIG_ID, "plan-mode")
      await Config.clearPromptOverride(Config.GLOBAL_CONFIG_ID, "provider-gpt")
      await Config.setSelectedPromptPresetIDs(Config.GLOBAL_CONFIG_ID, {
        systemPromptPresetID: "system-default",
        planModePromptPresetID: "plan-mode",
      })

      const listResponse = await app.request("http://localhost/api/prompts")
      const listBody = (await listResponse.json()) as PromptPresetSummaryEnvelope

      expect(listResponse.status).toBe(200)
      expect(listBody.success).toBe(true)
      expect(listBody.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "system-default",
            source: "bundled",
            hasOverride: false,
          }),
          expect.objectContaining({
            id: "plan-mode",
            source: "bundled",
            hasOverride: false,
          }),
          expect.objectContaining({
            id: "provider-gpt",
            source: "bundled",
            hasOverride: false,
          }),
        ]),
      )

      const selectionResponse = await app.request("http://localhost/api/prompts/selection")
      const selectionBody = (await selectionResponse.json()) as PromptPresetSelectionEnvelope

      expect(selectionResponse.status).toBe(200)
      expect(selectionBody.success).toBe(true)
      expect(selectionBody.data).toEqual({
        systemPromptPresetID: "system-default",
        planModePromptPresetID: "plan-mode",
      })

      const createResponse = await app.request("http://localhost/api/prompts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label: "Focus preset",
          content: customSystemPrompt,
        }),
      })
      const createBody = (await createResponse.json()) as PromptPresetDocumentEnvelope

      expect(createResponse.status).toBe(200)
      expect(createBody.success).toBe(true)
      expect(createBody.data).toMatchObject({
        label: "Focus preset",
        source: "custom",
        content: customSystemPrompt,
      })
      customPresetID = createBody.data?.id ?? null
      expect(customPresetID).toBeTruthy()
      const customPresetIDValue = customPresetID!

      const updateSelectionResponse = await app.request("http://localhost/api/prompts/selection", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemPromptPresetID: customPresetIDValue,
          planModePromptPresetID: "plan-mode",
        }),
      })
      const updateSelectionBody = (await updateSelectionResponse.json()) as PromptPresetSelectionEnvelope

      expect(updateSelectionResponse.status).toBe(200)
      expect(updateSelectionBody.success).toBe(true)
      expect(updateSelectionBody.data).toEqual({
        systemPromptPresetID: customPresetIDValue,
        planModePromptPresetID: "plan-mode",
      })

      const runtimeWithCustomSystemPrompt = await SystemPrompt.defaultPrompt()
      expect(runtimeWithCustomSystemPrompt.some((section) => section?.includes(customSystemPrompt) === true)).toBe(true)

      const readResponse = await app.request(`http://localhost/api/prompts/${encodeURIComponent(customPresetIDValue)}`)
      const readBody = (await readResponse.json()) as PromptPresetDocumentEnvelope

      expect(readResponse.status).toBe(200)
      expect(readBody.success).toBe(true)
      expect(readBody.data?.content).toBe(customSystemPrompt)

      const updateResponse = await app.request("http://localhost/api/prompts/plan-mode", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: customPlanPrompt,
        }),
      })
      const updateBody = (await updateResponse.json()) as PromptPresetDocumentEnvelope

      expect(updateResponse.status).toBe(200)
      expect(updateBody.success).toBe(true)
      expect(updateBody.data).toMatchObject({
        id: "plan-mode",
        hasOverride: true,
        content: customPlanPrompt,
      })

      const updateCustomPresetResponse = await app.request(
        `http://localhost/api/prompts/${encodeURIComponent(customPresetIDValue)}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            label: "Focus preset v2",
            content: `${customSystemPrompt}\nupdated`,
          }),
        },
      )
      const updateCustomPresetBody = (await updateCustomPresetResponse.json()) as PromptPresetDocumentEnvelope

      expect(updateCustomPresetResponse.status).toBe(200)
      expect(updateCustomPresetBody.success).toBe(true)
      expect(updateCustomPresetBody.data).toMatchObject({
        id: customPresetIDValue,
        label: "Focus preset v2",
        source: "custom",
        content: `${customSystemPrompt}\nupdated`,
      })

      const runtimePrompt = await SystemPrompt.defaultPrompt({
        agent: {
          name: "plan",
        },
      })
      expect(runtimePrompt.some((section) => section?.includes(customPlanPrompt) === true)).toBe(true)
      expect(runtimePrompt.some((section) => section?.includes(`${customSystemPrompt}\nupdated`) === true)).toBe(true)

      const blankOverrideResponse = await app.request("http://localhost/api/prompts/provider-gpt", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: "",
        }),
      })
      const blankOverrideBody = (await blankOverrideResponse.json()) as PromptPresetDocumentEnvelope

      expect(blankOverrideResponse.status).toBe(200)
      expect(blankOverrideBody.success).toBe(true)
      expect(blankOverrideBody.data).toMatchObject({
        id: "provider-gpt",
        hasOverride: true,
        content: "",
      })

      const resetResponse = await app.request("http://localhost/api/prompts/plan-mode", {
        method: "DELETE",
      })
      const resetBody = (await resetResponse.json()) as PromptPresetDocumentEnvelope

      expect(resetResponse.status).toBe(200)
      expect(resetBody.success).toBe(true)
      expect(resetBody.data?.hasOverride).toBe(false)
      expect(resetBody.data?.content).toContain("# Plan Mode - System Reminder")

      const runtimeAfterReset = await SystemPrompt.defaultPrompt({
        agent: {
          name: "plan",
        },
      })
      expect(runtimeAfterReset.some((section) => section?.includes(customPlanPrompt) === true)).toBe(false)

      const deleteCustomResponse = await app.request(
        `http://localhost/api/prompts/${encodeURIComponent(customPresetIDValue)}/custom`,
        {
          method: "DELETE",
        },
      )
      const deleteCustomBody = (await deleteCustomResponse.json()) as PromptPresetSelectionEnvelope

      expect(deleteCustomResponse.status).toBe(200)
      expect(deleteCustomBody.success).toBe(true)
      expect(deleteCustomBody.data).toEqual({
        systemPromptPresetID: "system-default",
        planModePromptPresetID: "plan-mode",
      })

      const runtimeAfterDelete = await SystemPrompt.defaultPrompt()
      expect(runtimeAfterDelete.some((section) => section?.includes(customSystemPrompt) === true)).toBe(false)

      const missingResponse = await app.request("http://localhost/api/prompts/not-a-preset")
      const missingBody = (await missingResponse.json()) as JsonEnvelope

      expect(missingResponse.status).toBe(404)
      expect(missingBody.success).toBe(false)
      expect(missingBody.error?.code).toBe("PROMPT_PRESET_NOT_FOUND")
    } finally {
      await Config.clearPromptOverride(Config.GLOBAL_CONFIG_ID, "plan-mode")
      await Config.clearPromptOverride(Config.GLOBAL_CONFIG_ID, "provider-gpt")
      if (customPresetID) {
        await Config.removeCustomPromptPreset(Config.GLOBAL_CONFIG_ID, customPresetID)
      }
      await Config.setSelectedPromptPresetIDs(Config.GLOBAL_CONFIG_ID, {
        systemPromptPresetID: "system-default",
        planModePromptPresetID: "plan-mode",
      })
    }
  })

  test("POST /api/projects should track extra git worktrees in sandboxes", async () => {
    const app = createServerApp()
    const repositoryRoot = await mkdtemp(join(tmpdir(), "fanfande-worktree-root-"))
    const extraWorktree = join(tmpdir(), `fanfande-worktree-${Date.now()}-${Math.random().toString(16).slice(2)}`)

    try {
      await createGitRepo(repositoryRoot, "shared-repo")
      await $`git worktree add ${extraWorktree} -b test-worktree`.cwd(repositoryRoot).quiet()

      const rootResponse = await app.request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory: repositoryRoot }),
      })
      const rootBody = (await rootResponse.json()) as ProjectResponseEnvelope

      const extraResponse = await app.request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory: extraWorktree }),
      })
      const extraBody = (await extraResponse.json()) as ProjectResponseEnvelope

      expect(rootResponse.status).toBe(201)
      expect(extraResponse.status).toBe(201)
      expect(rootBody.data?.id).toBeString()
      expect(extraBody.data?.id).toBe(rootBody.data?.id)
      expect(rootBody.data?.worktree).toBe(repositoryRoot)
      expect(extraBody.data?.worktree).toBe(repositoryRoot)
      expect(extraBody.data?.sandboxes).toContain(extraWorktree)
      expect(extraBody.data?.sandboxes).not.toContain(repositoryRoot)

      const listResponse = await app.request("http://localhost/api/projects")
      const listBody = (await listResponse.json()) as ProjectsResponseEnvelope

      expect(listResponse.status).toBe(200)
      expect(
        listBody.data?.some(
          (project) =>
            project.id === rootBody.data?.id &&
            project.worktree === repositoryRoot &&
            project.sandboxes.includes(extraWorktree),
        ),
      ).toBe(true)
    } finally {
      await rm(extraWorktree, { recursive: true, force: true })
      await rm(repositoryRoot, { recursive: true, force: true })
    }
  })

  test("POST /api/projects should keep different git repos as different projects", async () => {
    const app = createServerApp()
    const firstDirectory = await mkdtemp(join(tmpdir(), "fanfande-project-a-"))
    const secondDirectory = await mkdtemp(join(tmpdir(), "fanfande-project-b-"))

    try {
      await createGitRepo(firstDirectory, "repo-a")
      await createGitRepo(secondDirectory, "repo-b")

      const firstResponse = await app.request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory: firstDirectory }),
      })
      const firstBody = (await firstResponse.json()) as ProjectResponseEnvelope

      const secondResponse = await app.request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory: secondDirectory }),
      })
      const secondBody = (await secondResponse.json()) as ProjectResponseEnvelope

      expect(firstResponse.status).toBe(201)
      expect(secondResponse.status).toBe(201)
      expect(firstBody.data?.id).toBeString()
      expect(secondBody.data?.id).toBeString()
      expect(firstBody.data?.id).not.toBe(secondBody.data?.id)
      expect(firstBody.data?.worktree).toBe(firstDirectory)
      expect(secondBody.data?.worktree).toBe(secondDirectory)
    } finally {
      await rm(firstDirectory, { recursive: true, force: true })
      await rm(secondDirectory, { recursive: true, force: true })
    }
  })

  test("project git routes should report capabilities, commit staged changes, and create branches", async () => {
    const app = createServerApp()
    const repositoryRoot = await mkdtemp(join(tmpdir(), "fanfande-git-project-"))

    try {
      await createGitRepo(repositoryRoot, "git-project")
      await writeFile(join(repositoryRoot, "README.md"), "# git-project\nupdated\n")
      await $`git add README.md`.cwd(repositoryRoot).quiet()

      const projectResponse = await app.request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory: repositoryRoot }),
      })
      const projectBody = (await projectResponse.json()) as ProjectResponseEnvelope
      const projectID = projectBody.data?.id

      expect(projectResponse.status).toBe(201)
      expect(projectID).toBeString()

      const capabilitiesResponse = await app.request(
        `http://localhost/api/projects/${projectID}/git/capabilities?directory=${encodeURIComponent(repositoryRoot)}`,
      )
      const capabilitiesBody = (await capabilitiesResponse.json()) as GitCapabilitiesEnvelope

      expect(capabilitiesResponse.status).toBe(200)
      expect(capabilitiesBody.data).toMatchObject({
        directory: repositoryRoot,
        root: repositoryRoot,
        isGitRepo: true,
        canCommit: {
          enabled: true,
        },
        canStageAllCommit: {
          enabled: true,
        },
        canPush: {
          enabled: false,
        },
        canCreateBranch: {
          enabled: true,
        },
        canCreatePullRequest: {
          enabled: false,
        },
      })

      const commitResponse = await app.request(`http://localhost/api/projects/${projectID}/git/commit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          directory: repositoryRoot,
          message: "chore: update readme",
        }),
      })
      const commitBody = (await commitResponse.json()) as GitActionEnvelope

      expect(commitResponse.status).toBe(200)
      expect(commitBody.data?.root).toBe(repositoryRoot)
      expect(commitBody.data?.summary).toContain("Committed")

      const postCommitCapabilitiesResponse = await app.request(
        `http://localhost/api/projects/${projectID}/git/capabilities?directory=${encodeURIComponent(repositoryRoot)}`,
      )
      const postCommitCapabilitiesBody = (await postCommitCapabilitiesResponse.json()) as GitCapabilitiesEnvelope

      expect(postCommitCapabilitiesResponse.status).toBe(200)
      expect(postCommitCapabilitiesBody.data?.canCommit.enabled).toBe(false)

      const branchResponse = await app.request(`http://localhost/api/projects/${projectID}/git/branches`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          directory: repositoryRoot,
          name: "feature/git-menu",
        }),
      })
      const branchBody = (await branchResponse.json()) as GitActionEnvelope

      expect(branchResponse.status).toBe(200)
      expect(branchBody.data?.branch).toBe("feature/git-menu")
      expect(branchBody.data?.summary).toContain("feature/git-menu")

      const branchCapabilitiesResponse = await app.request(
        `http://localhost/api/projects/${projectID}/git/capabilities?directory=${encodeURIComponent(repositoryRoot)}`,
      )
      const branchCapabilitiesBody = (await branchCapabilitiesResponse.json()) as GitCapabilitiesEnvelope

      expect(branchCapabilitiesResponse.status).toBe(200)
      expect(branchCapabilitiesBody.data?.branch).toBe("feature/git-menu")
      expect(branchCapabilitiesBody.data?.canPush.enabled).toBe(false)
      expect(branchCapabilitiesBody.data?.canCreatePullRequest.enabled).toBe(false)
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true })
    }
  })

  test("project git routes should list branches and checkout an existing branch", async () => {
    const app = createServerApp()
    const repositoryRoot = await mkdtemp(join(tmpdir(), "fanfande-git-branch-list-project-"))

    try {
      await createGitRepo(repositoryRoot, "git-branch-list-project")

      const projectResponse = await app.request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory: repositoryRoot }),
      })
      const projectBody = (await projectResponse.json()) as ProjectResponseEnvelope
      const projectID = projectBody.data?.id

      expect(projectResponse.status).toBe(201)
      expect(projectID).toBeString()

      const capabilitiesResponse = await app.request(
        `http://localhost/api/projects/${projectID}/git/capabilities?directory=${encodeURIComponent(repositoryRoot)}`,
      )
      const capabilitiesBody = (await capabilitiesResponse.json()) as GitCapabilitiesEnvelope
      const baseBranch = capabilitiesBody.data?.branch

      expect(capabilitiesResponse.status).toBe(200)
      expect(baseBranch).toBeString()

      await $`git checkout -b feature/branch-switcher`.cwd(repositoryRoot).quiet()
      await $`git checkout ${baseBranch!}`.cwd(repositoryRoot).quiet()

      const branchesResponse = await app.request(
        `http://localhost/api/projects/${projectID}/git/branches?directory=${encodeURIComponent(repositoryRoot)}`,
      )
      const branchesBody = (await branchesResponse.json()) as GitBranchesEnvelope

      expect(branchesResponse.status).toBe(200)
      expect(branchesBody.data).toEqual(
        expect.arrayContaining([
          {
            name: baseBranch!,
            kind: "local",
            current: true,
          },
          {
            name: "feature/branch-switcher",
            kind: "local",
            current: false,
          },
        ]),
      )

      const checkoutResponse = await app.request(`http://localhost/api/projects/${projectID}/git/checkout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          directory: repositoryRoot,
          name: "feature/branch-switcher",
        }),
      })
      const checkoutBody = (await checkoutResponse.json()) as GitActionEnvelope

      expect(checkoutResponse.status).toBe(200)
      expect(checkoutBody.data?.branch).toBe("feature/branch-switcher")
      expect(checkoutBody.data?.summary).toContain("feature/branch-switcher")

      const postCheckoutBranchesResponse = await app.request(
        `http://localhost/api/projects/${projectID}/git/branches?directory=${encodeURIComponent(repositoryRoot)}`,
      )
      const postCheckoutBranchesBody = (await postCheckoutBranchesResponse.json()) as GitBranchesEnvelope

      expect(postCheckoutBranchesResponse.status).toBe(200)
      expect(postCheckoutBranchesBody.data).toEqual(
        expect.arrayContaining([
          {
            name: baseBranch!,
            kind: "local",
            current: false,
          },
          {
            name: "feature/branch-switcher",
            kind: "local",
            current: true,
          },
        ]),
      )
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true })
    }
  })

  test("project git branch list should return a client error outside git repositories", async () => {
    const app = createServerApp()
    const directory = await mkdtemp(join(tmpdir(), "fanfande-non-git-branch-list-project-"))

    try {
      await writeFile(join(directory, "README.md"), "# plain project\n")

      const projectResponse = await app.request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory }),
      })
      const projectBody = (await projectResponse.json()) as ProjectResponseEnvelope
      const projectID = projectBody.data?.id

      expect(projectResponse.status).toBe(201)
      expect(projectID).toBeString()

      const branchesResponse = await app.request(
        `http://localhost/api/projects/${projectID}/git/branches?directory=${encodeURIComponent(directory)}`,
      )
      const branchesBody = (await branchesResponse.json()) as GitBranchesEnvelope

      expect(branchesResponse.status).toBe(400)
      expect(branchesBody.success).toBe(false)
      expect(branchesBody.error?.code).toBe("GIT_OPERATION_FAILED")
      expect(branchesBody.error?.message).toBe("The current workspace is not a Git repository.")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("project git capabilities should disable branch creation before the first commit", async () => {
    const app = createServerApp()
    const repositoryRoot = await mkdtemp(join(tmpdir(), "fanfande-git-unborn-project-"))

    try {
      await mkdir(repositoryRoot, { recursive: true })
      await writeFile(join(repositoryRoot, "README.md"), "# unborn\n")
      await $`git init`.cwd(repositoryRoot).quiet()
      await $`git config user.email test@example.com`.cwd(repositoryRoot).quiet()
      await $`git config user.name fanfande-test`.cwd(repositoryRoot).quiet()

      const initialBranch = (await $`git symbolic-ref --quiet --short HEAD`.cwd(repositoryRoot).text()).trim()

      const projectResponse = await app.request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory: repositoryRoot }),
      })
      const projectBody = (await projectResponse.json()) as ProjectResponseEnvelope
      const projectID = projectBody.data?.id

      expect(projectResponse.status).toBe(201)
      expect(projectID).toBeString()

      const capabilitiesResponse = await app.request(
        `http://localhost/api/projects/${projectID}/git/capabilities?directory=${encodeURIComponent(repositoryRoot)}`,
      )
      const capabilitiesBody = (await capabilitiesResponse.json()) as GitCapabilitiesEnvelope

      expect(capabilitiesResponse.status).toBe(200)
      expect(capabilitiesBody.data?.branch).toBe(initialBranch)
      expect(capabilitiesBody.data?.canCreateBranch).toEqual({
        enabled: false,
        reason: "Create the first commit before creating a branch.",
      })
      expect(capabilitiesBody.data?.canPush).toEqual({
        enabled: false,
        reason: "Create the first commit before pushing this branch.",
      })
      expect(capabilitiesBody.data?.canCreatePullRequest).toEqual({
        enabled: false,
        reason: "Create the first commit before opening a pull request.",
      })
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true })
    }
  })

  test("project git routes should reject directories outside the requested project", async () => {
    const app = createServerApp()
    const repositoryRootA = await mkdtemp(join(tmpdir(), "fanfande-git-project-boundary-a-"))
    const repositoryRootB = await mkdtemp(join(tmpdir(), "fanfande-git-project-boundary-b-"))

    try {
      await createGitRepo(repositoryRootA, "git-project-boundary-a")
      await createGitRepo(repositoryRootB, "git-project-boundary-b")

      const projectResponseA = await app.request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory: repositoryRootA }),
      })
      const projectBodyA = (await projectResponseA.json()) as ProjectResponseEnvelope
      const projectIDA = projectBodyA.data?.id

      const projectResponseB = await app.request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory: repositoryRootB }),
      })
      const projectBodyB = (await projectResponseB.json()) as ProjectResponseEnvelope
      const projectIDB = projectBodyB.data?.id

      expect(projectResponseA.status).toBe(201)
      expect(projectResponseB.status).toBe(201)
      expect(projectIDA).toBeString()
      expect(projectIDB).toBeString()
      expect(projectIDA).not.toBe(projectIDB)

      const capabilitiesResponse = await app.request(
        `http://localhost/api/projects/${projectIDA}/git/capabilities?directory=${encodeURIComponent(repositoryRootB)}`,
      )
      const capabilitiesBody = (await capabilitiesResponse.json()) as GitCapabilitiesEnvelope

      expect(capabilitiesResponse.status).toBe(400)
      expect(capabilitiesBody.success).toBe(false)
      expect(capabilitiesBody.error?.code).toBe("DIRECTORY_NOT_IN_PROJECT")
    } finally {
      await rm(repositoryRootA, { recursive: true, force: true })
      await rm(repositoryRootB, { recursive: true, force: true })
    }
  })

  test("project git routes should reject project-local links that resolve to an external repo", async () => {
    const app = createServerApp()
    const repositoryRoot = await mkdtemp(join(tmpdir(), "fanfande-git-project-link-root-"))
    const externalRepositoryRoot = await mkdtemp(join(tmpdir(), "fanfande-git-project-link-external-"))
    const linkedDirectory = join(repositoryRoot, "external-link")

    try {
      await createGitRepo(repositoryRoot, "git-project-link-root")
      await createGitRepo(externalRepositoryRoot, "git-project-link-external")
      await createDirectoryLink(linkedDirectory, externalRepositoryRoot)

      const projectResponse = await app.request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory: repositoryRoot }),
      })
      const projectBody = (await projectResponse.json()) as ProjectResponseEnvelope
      const projectID = projectBody.data?.id

      expect(projectResponse.status).toBe(201)
      expect(projectID).toBeString()

      const capabilitiesResponse = await app.request(
        `http://localhost/api/projects/${projectID}/git/capabilities?directory=${encodeURIComponent(linkedDirectory)}`,
      )
      const capabilitiesBody = (await capabilitiesResponse.json()) as GitCapabilitiesEnvelope

      expect(capabilitiesResponse.status).toBe(400)
      expect(capabilitiesBody.success).toBe(false)
      expect(capabilitiesBody.error?.code).toBe("DIRECTORY_NOT_IN_PROJECT")

      const branchResponse = await app.request(`http://localhost/api/projects/${projectID}/git/branches`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          directory: linkedDirectory,
          name: "feature/should-not-create",
        }),
      })
      const branchBody = (await branchResponse.json()) as GitActionEnvelope

      expect(branchResponse.status).toBe(400)
      expect(branchBody.success).toBe(false)
      expect(branchBody.error?.code).toBe("DIRECTORY_NOT_IN_PROJECT")
    } finally {
      await removeDirectoryLink(linkedDirectory)
      await rm(repositoryRoot, { recursive: true, force: true })
      await rm(externalRepositoryRoot, { recursive: true, force: true })
    }
  })

  test("project git routes should only commit staged changes", async () => {
    const app = createServerApp()
    const repositoryRoot = await mkdtemp(join(tmpdir(), "fanfande-git-staged-commit-project-"))

    try {
      await createGitRepo(repositoryRoot, "git-staged-commit-project")
      await writeFile(join(repositoryRoot, "staged.txt"), "staged\n")
      await writeFile(join(repositoryRoot, "unstaged.txt"), "unstaged\n")
      await $`git add staged.txt`.cwd(repositoryRoot).quiet()

      const projectResponse = await app.request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory: repositoryRoot }),
      })
      const projectBody = (await projectResponse.json()) as ProjectResponseEnvelope
      const projectID = projectBody.data?.id

      expect(projectResponse.status).toBe(201)
      expect(projectID).toBeString()

      const capabilitiesResponse = await app.request(
        `http://localhost/api/projects/${projectID}/git/capabilities?directory=${encodeURIComponent(repositoryRoot)}`,
      )
      const capabilitiesBody = (await capabilitiesResponse.json()) as GitCapabilitiesEnvelope

      expect(capabilitiesResponse.status).toBe(200)
      expect(capabilitiesBody.data?.canCommit).toEqual({
        enabled: true,
      })
      expect(capabilitiesBody.data?.canStageAllCommit).toEqual({
        enabled: true,
      })

      const commitResponse = await app.request(`http://localhost/api/projects/${projectID}/git/commit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          directory: repositoryRoot,
          message: "chore: commit staged only",
        }),
      })
      const commitBody = (await commitResponse.json()) as GitActionEnvelope

      expect(commitResponse.status).toBe(200)
      expect(commitBody.data?.summary).toContain("Committed")

      const committedFiles = await $`git show --name-only --format= HEAD`.cwd(repositoryRoot).text()
      expect(committedFiles).toContain("staged.txt")
      expect(committedFiles).not.toContain("unstaged.txt")

      const statusOutput = await $`git status --porcelain`.cwd(repositoryRoot).text()
      expect(statusOutput).toContain("?? unstaged.txt")

      const postCommitCapabilitiesResponse = await app.request(
        `http://localhost/api/projects/${projectID}/git/capabilities?directory=${encodeURIComponent(repositoryRoot)}`,
      )
      const postCommitCapabilitiesBody = (await postCommitCapabilitiesResponse.json()) as GitCapabilitiesEnvelope

      expect(postCommitCapabilitiesResponse.status).toBe(200)
      expect(postCommitCapabilitiesBody.data?.canCommit).toEqual({
        enabled: false,
        reason: "Stage changes before committing.",
      })
      expect(postCommitCapabilitiesBody.data?.canStageAllCommit).toEqual({
        enabled: true,
      })
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true })
    }
  })

  test("project git routes should stage all changes before committing when requested", async () => {
    const app = createServerApp()
    const repositoryRoot = await mkdtemp(join(tmpdir(), "fanfande-git-stage-all-project-"))

    try {
      await createGitRepo(repositoryRoot, "git-stage-all-project")
      await writeFile(join(repositoryRoot, "stage-all.txt"), "stage-all\n")

      const projectResponse = await app.request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory: repositoryRoot }),
      })
      const projectBody = (await projectResponse.json()) as ProjectResponseEnvelope
      const projectID = projectBody.data?.id

      expect(projectResponse.status).toBe(201)
      expect(projectID).toBeString()

      const capabilitiesResponse = await app.request(
        `http://localhost/api/projects/${projectID}/git/capabilities?directory=${encodeURIComponent(repositoryRoot)}`,
      )
      const capabilitiesBody = (await capabilitiesResponse.json()) as GitCapabilitiesEnvelope

      expect(capabilitiesResponse.status).toBe(200)
      expect(capabilitiesBody.data?.canCommit).toEqual({
        enabled: false,
        reason: "Stage changes before committing.",
      })
      expect(capabilitiesBody.data?.canStageAllCommit).toEqual({
        enabled: true,
      })

      const commitResponse = await app.request(`http://localhost/api/projects/${projectID}/git/commit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          directory: repositoryRoot,
          message: "chore: stage all and commit",
          stageAll: true,
        }),
      })
      const commitBody = (await commitResponse.json()) as GitActionEnvelope

      expect(commitResponse.status).toBe(200)
      expect(commitBody.data?.summary).toContain("Committed")

      const committedFiles = await $`git show --name-only --format= HEAD`.cwd(repositoryRoot).text()
      expect(committedFiles).toContain("stage-all.txt")
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true })
    }
  })

  test("project git capabilities should enable push for a tracked branch with outgoing commits", async () => {
    const app = createServerApp()
    const repositoryRoot = await mkdtemp(join(tmpdir(), "fanfande-git-push-project-"))
    const remoteRoot = await mkdtemp(join(tmpdir(), "fanfande-git-push-remote-"))

    try {
      await createGitRepo(repositoryRoot, "git-push-project")
      await createBareGitRemote(remoteRoot)
      await attachTrackedRemote(repositoryRoot, "main", remoteRoot)
      await writeFile(join(repositoryRoot, "README.md"), "# git-push-project\nnext\n")
      await $`git add README.md`.cwd(repositoryRoot).quiet()

      const projectResponse = await app.request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory: repositoryRoot }),
      })
      const projectBody = (await projectResponse.json()) as ProjectResponseEnvelope
      const projectID = projectBody.data?.id

      expect(projectResponse.status).toBe(201)
      expect(projectID).toBeString()

      const commitResponse = await app.request(`http://localhost/api/projects/${projectID}/git/commit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          directory: repositoryRoot,
          message: "chore: prepare push",
        }),
      })

      expect(commitResponse.status).toBe(200)

      const capabilitiesResponse = await app.request(
        `http://localhost/api/projects/${projectID}/git/capabilities?directory=${encodeURIComponent(repositoryRoot)}`,
      )
      const capabilitiesBody = (await capabilitiesResponse.json()) as GitCapabilitiesEnvelope

      expect(capabilitiesResponse.status).toBe(200)
      expect(capabilitiesBody.data?.branch).toBe("main")
      expect(capabilitiesBody.data?.canPush.enabled).toBe(true)

      const pushResponse = await app.request(`http://localhost/api/projects/${projectID}/git/push`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          directory: repositoryRoot,
        }),
      })
      const pushBody = (await pushResponse.json()) as GitActionEnvelope

      expect(pushResponse.status).toBe(200)
      expect(pushBody.data?.summary).toContain("Pushed")

      const postPushCapabilitiesResponse = await app.request(
        `http://localhost/api/projects/${projectID}/git/capabilities?directory=${encodeURIComponent(repositoryRoot)}`,
      )
      const postPushCapabilitiesBody = (await postPushCapabilitiesResponse.json()) as GitCapabilitiesEnvelope

      expect(postPushCapabilitiesResponse.status).toBe(200)
      expect(postPushCapabilitiesBody.data?.canPush.enabled).toBe(false)
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true })
      await rm(remoteRoot, { recursive: true, force: true })
    }
  })

  test("GET /api/projects/:id/sessions should return sessions for the project", async () => {
    const app = createServerApp()
    const directory = process.cwd()

    const createResponse = await app.request("http://localhost/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ directory }),
    })
    const createBody = (await createResponse.json()) as SessionResponseEnvelope

    expect(createResponse.status).toBe(201)
    expect(createBody.success).toBe(true)
    expect(createBody.data?.id).toBeString()
    expect(createBody.data?.projectID).toBeString()

    const response = await app.request(`http://localhost/api/projects/${createBody.data!.projectID}/sessions`)
    const body = (await response.json()) as ProjectSessionsResponseEnvelope

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data?.some((session) => session.id === createBody.data?.id && session.directory === directory)).toBe(true)
  })

  test("GET /api/sessions/:id/messages should return stored message history", async () => {
    const app = createServerApp()
    const directory = process.cwd()

    const createResponse = await app.request("http://localhost/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ directory }),
    })
    const createBody = (await createResponse.json()) as SessionResponseEnvelope
    const sessionID = createBody.data?.id

    expect(createResponse.status).toBe(201)
    expect(sessionID).toBeString()

    const userMessage: Message.User = {
      id: Identifier.ascending("message"),
      sessionID: sessionID!,
      role: "user",
      created: Date.now(),
      agent: "plan",
      model: {
        providerID: "test-provider",
        modelID: "test-model",
      },
    }
    const userTextPart: Message.TextPart = {
      id: Identifier.ascending("part"),
      sessionID: sessionID!,
      messageID: userMessage.id,
      type: "text",
      text: "restore this history",
    }
    const assistantMessage: Message.Assistant = {
      id: Identifier.ascending("message"),
      sessionID: sessionID!,
      role: "assistant",
      created: Date.now() + 1,
      completed: Date.now() + 2,
      parentID: userMessage.id,
      modelID: "test-model",
      providerID: "test-provider",
      agent: "plan",
      path: {
        cwd: directory,
        root: directory,
      },
      cost: 0,
      tokens: {
        input: 0,
        output: 0,
        reasoning: 0,
        cache: {
          read: 0,
          write: 0,
        },
      },
    }
    const assistantTextPart: Message.TextPart = {
      id: Identifier.ascending("part"),
      sessionID: sessionID!,
      messageID: assistantMessage.id,
      type: "text",
      text: "history restored",
    }

    Session.DataBaseCreate("messages", userMessage)
    Session.DataBaseCreate("parts", userTextPart)
    Session.DataBaseCreate("messages", assistantMessage)
    Session.DataBaseCreate("parts", assistantTextPart)

    const response = await app.request(`http://localhost/api/sessions/${sessionID}/messages`)
    const body = (await response.json()) as SessionMessagesResponseEnvelope

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(2)
    expect(body.data?.[0]?.info.role).toBe("user")
    expect(body.data?.[0]?.parts[0]?.text).toBe("restore this history")
    expect(body.data?.[1]?.info.role).toBe("assistant")
    expect(body.data?.[1]?.parts[0]?.text).toBe("history restored")
  })

  test("session execution stream maps runtime events to SSE", async () => {
    const sessionID = "ses_stream_runtime"
    const turnID = Identifier.ascending("turn")
    const messageID = Identifier.ascending("message")
    const partID = Identifier.ascending("part")
    const timestamps = [101, 102, 103]
    const factory = RuntimeEvent.createRuntimeEventFactory({
      sessionID,
      turnID,
      timestamp: () => timestamps.shift() ?? 103,
    })

    const assistantMessage: Message.Assistant = {
      id: messageID,
      sessionID,
      role: "assistant",
      created: Date.now(),
      completed: Date.now() + 1,
      parentID: Identifier.ascending("message"),
      modelID: "test-model",
      providerID: "test-provider",
      agent: "plan",
      path: {
        cwd: process.cwd(),
        root: process.cwd(),
      },
      cost: 0,
      tokens: {
        input: 0,
        output: 0,
        reasoning: 0,
        cache: {
          read: 0,
          write: 0,
        },
      },
      finishReason: "stop",
    }
    const textPart: Message.TextPart = {
      id: partID,
      sessionID,
      messageID,
      type: "text",
      text: "new answer",
      time: {
        start: Date.now(),
        end: Date.now() + 1,
      },
    }
    const startedEvent = factory.next("turn.started", {})
    const deltaEvent = factory.next("text.part.delta", {
      messageID,
      partID,
      kind: "text",
      delta: "new answer",
      text: "new answer",
    })
    const completedEvent = factory.next("turn.completed", {
      status: "completed",
      finishReason: "stop",
      message: assistantMessage,
      parts: [textPart],
    })

    const response = createSessionExecutionStream({
      sessionID,
      heartbeatIntervalMs: 50,
      execute: async () => {
        LiveStreamHub.publish(startedEvent)
        await new Promise((resolve) => setTimeout(resolve, 5))
        LiveStreamHub.publish(deltaEvent)
        await new Promise((resolve) => setTimeout(resolve, 5))
        LiveStreamHub.publish(completedEvent)

        return {
          info: assistantMessage,
          parts: [textPart],
        }
      },
      cancel: () => {},
    })

    const raw = await response.text()
    const completedCursor = RuntimeEvent.serializeCursor(RuntimeEvent.cursorOf(completedEvent))

    expect(raw).toContain("event: runtime")
    expect(raw).toContain(`"type":"turn.started"`)
    expect(raw).toContain(`"type":"text.part.delta"`)
    expect(raw).toContain(`"type":"turn.completed"`)
    expect(raw).toContain(`"eventID":"`)
    expect(raw).toContain(`id: ${completedCursor}`)
    expect(raw).toContain(`"turnID":"${turnID}"`)
    expect(raw).toContain(`"partID":"${partID}"`)
  })

  test("session execution stream fallback terminal event keeps the observed turn id", async () => {
    const sessionID = "ses_stream_runtime_fallback"
    const turnID = Identifier.ascending("turn")
    const messageID = Identifier.ascending("message")
    const factory = RuntimeEvent.createRuntimeEventFactory({
      sessionID,
      turnID,
    })
    const assistantMessage: Message.Assistant = {
      id: messageID,
      sessionID,
      role: "assistant",
      created: Date.now(),
      completed: Date.now() + 1,
      parentID: Identifier.ascending("message"),
      modelID: "test-model",
      providerID: "test-provider",
      agent: "plan",
      path: {
        cwd: process.cwd(),
        root: process.cwd(),
      },
      cost: 0,
      tokens: {
        input: 0,
        output: 0,
        reasoning: 0,
        cache: {
          read: 0,
          write: 0,
        },
      },
      finishReason: "stop",
    }
    const startedEvent = factory.next("turn.started", {})
    const completedStateEvent = factory.next("turn.state.changed", {
      phase: "completed",
      reason: "stop",
      messageID,
    })

    const response = createSessionExecutionStream({
      sessionID,
      heartbeatIntervalMs: 10,
      execute: async () => {
        LiveStreamHub.publish(startedEvent)
        LiveStreamHub.publish(completedStateEvent)

        return {
          info: assistantMessage,
          parts: [],
        }
      },
      cancel: () => {},
    })

    const raw = await response.text()

    expect(raw).toContain(`"type":"turn.started"`)
    expect(raw).toContain(`"type":"turn.state.changed"`)
    expect(raw).toContain(`"type":"turn.completed"`)
    expect(raw).toContain(`"turnID":"${turnID}"`)
    expect(raw).toContain(`"seq":3`)
    expect(raw).toContain(`:${turnID}:3`)
  })

  test("runtime event schema treats cancelled turns as terminal events", () => {
    const factory = RuntimeEvent.createRuntimeEventFactory({
      sessionID: Identifier.ascending("session"),
      turnID: Identifier.ascending("turn"),
      timestamp: () => 123,
    })

    const started = factory.next("turn.started", {})
    const cancelled = factory.next("turn.cancelled", {
      reason: "client-disconnect",
      detail: "client closed the stream",
    })

    expect(started.seq).toBe(1)
    expect(cancelled.seq).toBe(2)
    expect(RuntimeEvent.isTerminalRuntimeEvent(started)).toBe(false)
    expect(RuntimeEvent.isTerminalRuntimeEvent(cancelled)).toBe(true)
    expect(RuntimeEvent.isTerminalRuntimeEventType("turn.cancelled")).toBe(true)
  })

  test("session execution stream emits keepalive comments while waiting for runtime events", async () => {
    const sessionID = "ses_keepalive_runtime"
    const turnID = Identifier.ascending("turn")
    const messageID = Identifier.ascending("message")
    const factory = RuntimeEvent.createRuntimeEventFactory({ sessionID, turnID })
    const assistantMessage: Message.Assistant = {
      id: messageID,
      sessionID,
      role: "assistant",
      created: Date.now(),
      completed: Date.now() + 1,
      parentID: Identifier.ascending("message"),
      modelID: "test-model",
      providerID: "test-provider",
      agent: "plan",
      path: {
        cwd: process.cwd(),
        root: process.cwd(),
      },
      cost: 0,
      tokens: {
        input: 0,
        output: 0,
        reasoning: 0,
        cache: {
          read: 0,
          write: 0,
        },
      },
    }

    const response = createSessionExecutionStream({
      sessionID,
      heartbeatIntervalMs: 20,
      execute: async () => {
        LiveStreamHub.publish(factory.next("turn.started", {}))
        await new Promise((resolve) => setTimeout(resolve, 60))
        LiveStreamHub.publish(factory.next("turn.completed", {
          status: "completed",
          message: assistantMessage,
          parts: [],
        }))
        return {
          info: assistantMessage,
          parts: [],
        }
      },
      cancel: () => {},
    })

    const raw = await response.text()

    expect(raw).toContain("event: runtime")
    expect(raw).toContain(`"type":"turn.started"`)
    expect(raw).toContain(": keepalive")
    expect(raw).toContain(`"type":"turn.completed"`)
  })

  test("GET /api/sessions/:id/events/stream replays missed session events across detached turns", async () => {
    const app = createServerApp()
    const session = await Session.createSession({
      directory: process.cwd(),
      projectID: "project_stream_replay",
      title: "Replay stream",
    })

    const turn1ID = Identifier.ascending("turn")
    const turn2ID = Identifier.ascending("turn")
    const assistantMessageID = Identifier.ascending("message")
    const toolPartID = Identifier.ascending("part")

    const assistantMessage: Message.Assistant = {
      id: assistantMessageID,
      sessionID: session.id,
      role: "assistant",
      created: Date.now(),
      completed: Date.now() + 1,
      parentID: Identifier.ascending("message"),
      modelID: "test-model",
      providerID: "test-provider",
      agent: "plan",
      path: {
        cwd: process.cwd(),
        root: process.cwd(),
      },
      cost: 0,
      tokens: {
        input: 0,
        output: 0,
        reasoning: 0,
        cache: {
          read: 0,
          write: 0,
        },
      },
      finishReason: "tool-approval",
    }

    const waitingToolPart: Message.ToolPart = {
      id: toolPartID,
      sessionID: session.id,
      messageID: assistantMessageID,
      type: "tool",
      callID: "toolcall_stream_replay",
      tool: "read-file",
      state: {
        status: "waiting-approval",
        approvalID: "approval_stream_replay",
        input: {
          path: "README.md",
        },
        title: "Read File",
        time: {
          start: 301,
        },
      },
    }

    const turn1Factory = RuntimeEvent.createRuntimeEventFactory({
      sessionID: session.id,
      turnID: turn1ID,
      timestamp: () => 200,
    })
    const turn2Timestamps = [300, 301, 302]
    const turn2Factory = RuntimeEvent.createRuntimeEventFactory({
      sessionID: session.id,
      turnID: turn2ID,
      timestamp: () => turn2Timestamps.shift() ?? 302,
    })

    const turn1Started = turn1Factory.next("turn.started", {})
    const turn1Completed = turn1Factory.next("turn.completed", {
      status: "completed",
      finishReason: "stop",
      message: assistantMessage,
      parts: [],
    })
    const turn2Started = turn2Factory.next("turn.started", {
      userMessageID: assistantMessage.parentID,
      agent: assistantMessage.agent,
      model: {
        providerID: assistantMessage.providerID,
        modelID: assistantMessage.modelID,
      },
    })
    const turn2WaitingApproval = turn2Factory.next("tool.call.waiting_approval", {
      part: waitingToolPart,
    })
    const turn2Completed = turn2Factory.next("turn.completed", {
      status: "blocked",
      finishReason: "approval-resolved",
      message: assistantMessage,
      parts: [waitingToolPart],
    })

    EventStore.append(turn1Started)
    EventStore.append(turn1Completed)
    EventStore.append(turn2Started)
    EventStore.append(turn2WaitingApproval)
    EventStore.append(turn2Completed)

    const since = RuntimeEvent.serializeCursor(RuntimeEvent.cursorOf(turn1Completed))
    const response = await app.request(
      `http://localhost/api/sessions/${session.id}/events/stream?since=${encodeURIComponent(since)}`,
    )
    const raw = await readStreamUntil(response, [
      `"type":"turn.completed"`,
      `"turnID":"${turn2ID}"`,
      `"status":"blocked"`,
    ])

    expect(response.status).toBe(200)
    expect(raw).toContain("event: runtime")
    expect(raw).toContain(`"type":"turn.started"`)
    expect(raw).toContain(`"type":"tool.call.waiting_approval"`)
    expect(raw).toContain(`"type":"turn.completed"`)
    expect(raw).toContain(`id: ${RuntimeEvent.serializeCursor(RuntimeEvent.cursorOf(turn2Started))}`)
    expect(raw).toContain(`"tool":"read-file"`)
    expect(raw).toContain(`"turnID":"${turn2ID}"`)
    expect(raw).not.toContain(`"turnID":"${turn1ID}"`)
  })

  test("GET /api/projects/:id/sessions should return 404 for missing project", async () => {
    const app = createServerApp()
    const response = await app.request("http://localhost/api/projects/project_missing/sessions")
    const body = (await response.json()) as JsonEnvelope

    expect(response.status).toBe(404)
    expect(body.success).toBe(false)
    expect(body.error?.code).toBe("PROJECT_NOT_FOUND")
  })

  test("GET /api/projects/:id/sessions should return an empty list for a new project with no sessions", async () => {
    const app = createServerApp()
    const directory = await mkdtemp(join(tmpdir(), "fanfande-project-empty-"))

    try {
      const projectResponse = await app.request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory }),
      })
      const projectBody = (await projectResponse.json()) as ProjectResponseEnvelope

      expect(projectResponse.status).toBe(201)
      expect(projectBody.success).toBe(true)
      expect(projectBody.data?.id).toBeString()

      const response = await app.request(`http://localhost/api/projects/${projectBody.data!.id}/sessions`)
      const body = (await response.json()) as ProjectSessionsResponseEnvelope

      expect(response.status).toBe(200)
      expect(body.success).toBe(true)
      expect(body.data).toEqual([])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("POST /api/projects/:id/sessions should create a session for the project", async () => {
    const app = createServerApp()
    const directory = process.cwd()

    const projectResponse = await app.request("http://localhost/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ directory }),
    })
    const projectBody = (await projectResponse.json()) as ProjectResponseEnvelope

    expect(projectResponse.status).toBe(201)
    expect(projectBody.data?.id).toBeString()

    const createSessionResponse = await app.request(`http://localhost/api/projects/${projectBody.data!.id}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Backend chat", directory }),
    })
    const createSessionBody = (await createSessionResponse.json()) as SessionResponseEnvelope

    expect(createSessionResponse.status).toBe(201)
    expect(createSessionBody.success).toBe(true)
    expect(createSessionBody.data?.projectID).toBe(projectBody.data?.id)
    expect(createSessionBody.data?.title).toBe("Backend chat")

    const sessionsResponse = await app.request(`http://localhost/api/projects/${projectBody.data!.id}/sessions`)
    const sessionsBody = (await sessionsResponse.json()) as ProjectSessionsResponseEnvelope

    expect(sessionsResponse.status).toBe(200)
    expect(sessionsBody.data?.some((session) => session.id === createSessionBody.data?.id)).toBe(true)
  })

  test("DELETE /api/sessions/:id should remove the session", async () => {
    const app = createServerApp()
    const directory = process.cwd()

    const createResponse = await app.request("http://localhost/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ directory }),
    })
    const createBody = (await createResponse.json()) as SessionResponseEnvelope

    expect(createResponse.status).toBe(201)
    expect(createBody.data?.id).toBeString()

    const deleteResponse = await app.request(`http://localhost/api/sessions/${createBody.data!.id}`, {
      method: "DELETE",
    })
    const deleteBody = (await deleteResponse.json()) as DeleteSessionResponseEnvelope

    expect(deleteResponse.status).toBe(200)
    expect(deleteBody.success).toBe(true)
    expect(deleteBody.data?.sessionID).toBe(createBody.data?.id)
    expect(deleteBody.data?.projectID).toBe(createBody.data?.projectID)

    const readResponse = await app.request(`http://localhost/api/sessions/${createBody.data!.id}`)
    const readBody = (await readResponse.json()) as JsonEnvelope

    expect(readResponse.status).toBe(404)
    expect(readBody.error?.code).toBe("SESSION_NOT_FOUND")
  })

  test("DELETE /api/projects/:id should remove the project and its sessions", async () => {
    const app = createServerApp()
    const directory = process.cwd()

    const projectResponse = await app.request("http://localhost/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ directory }),
    })
    const projectBody = (await projectResponse.json()) as ProjectResponseEnvelope

    expect(projectResponse.status).toBe(201)
    expect(projectBody.data?.id).toBeString()

    const sessionResponse = await app.request(`http://localhost/api/projects/${projectBody.data!.id}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Disposable chat", directory }),
    })
    const sessionBody = (await sessionResponse.json()) as SessionResponseEnvelope

    expect(sessionResponse.status).toBe(201)
    expect(sessionBody.data?.id).toBeString()

    const deleteResponse = await app.request(`http://localhost/api/projects/${projectBody.data!.id}`, {
      method: "DELETE",
    })
    const deleteBody = (await deleteResponse.json()) as DeleteProjectResponseEnvelope

    expect(deleteResponse.status).toBe(200)
    expect(deleteBody.success).toBe(true)
    expect(deleteBody.data?.projectID).toBe(projectBody.data?.id)
    expect(deleteBody.data?.deletedSessionIDs).toContain(sessionBody.data?.id)

    const projectReadResponse = await app.request(`http://localhost/api/projects/${projectBody.data!.id}`)
    const projectReadBody = (await projectReadResponse.json()) as JsonEnvelope
    expect(projectReadResponse.status).toBe(404)
    expect(projectReadBody.error?.code).toBe("PROJECT_NOT_FOUND")

    const sessionReadResponse = await app.request(`http://localhost/api/sessions/${sessionBody.data!.id}`)
    const sessionReadBody = (await sessionReadResponse.json()) as JsonEnvelope
    expect(sessionReadResponse.status).toBe(404)
    expect(sessionReadBody.error?.code).toBe("SESSION_NOT_FOUND")
  })
})
