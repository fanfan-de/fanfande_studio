import { describe, expect, test } from "bun:test"
import { $ } from "bun"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createServerApp } from "#server/server.ts"
import { emitUpdatedAssistantSessionParts, seedSeenSessionParts } from "#server/routes/session.ts"
import * as Identifier from "#id/id.ts"
import * as Message from "#session/message.ts"
import * as Session from "#session/session.ts"

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
  }>
>

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

  test("global provider routes should expose catalog, configured providers and model selection", async () => {
    const restoreFetch = mockModelsDevFetch()
    const app = createServerApp()
    const repositoryRoot = await mkdtemp(join(tmpdir(), "fanfande-provider-project-"))

    try {
      await createGitRepo(repositoryRoot, "provider-project")
      await resetGlobalProviderState(app)

      const catalogResponse = await app.request("http://localhost/api/providers/catalog")
      const catalogBody = (await catalogResponse.json()) as ProviderCatalogEnvelope

      expect(catalogResponse.status).toBe(200)
      expect(catalogBody.success).toBe(true)
      expect(catalogBody.data?.some((provider) => provider.id === "deepseek" && provider.modelCount > 0)).toBe(true)
      expect(catalogBody.data?.some((provider) => provider.id === "openai" && provider.configured === false)).toBe(true)

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

      const compatibilityResponse = await app.request(`http://localhost/api/projects/${projectID}/models`)
      const compatibilityBody = (await compatibilityResponse.json()) as ProjectModelsEnvelope

      expect(compatibilityResponse.status).toBe(200)
      expect(compatibilityBody.data?.selection.model).toBe("deepseek/deepseek-reasoner")
      expect(compatibilityBody.data?.items).toHaveLength(1)

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
    } finally {
      await resetGlobalProviderState(app)
      restoreFetch()
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
    } finally {
      await resetGlobalProviderState(app)
      restoreFetch()
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

  test("stream diff only emits assistant parts created after the stream snapshot", async () => {
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

    const historicalUserMessage: Message.User = {
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
    const historicalUserTextPart: Message.TextPart = {
      id: Identifier.ascending("part"),
      sessionID: sessionID!,
      messageID: historicalUserMessage.id,
      type: "text",
      text: "old prompt",
    }
    const historicalAssistantMessage: Message.Assistant = {
      id: Identifier.ascending("message"),
      sessionID: sessionID!,
      role: "assistant",
      created: Date.now() + 1,
      completed: Date.now() + 2,
      parentID: historicalUserMessage.id,
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
    const historicalAssistantTextPart: Message.TextPart = {
      id: Identifier.ascending("part"),
      sessionID: sessionID!,
      messageID: historicalAssistantMessage.id,
      type: "text",
      text: "old answer",
    }

    Session.DataBaseCreate("messages", historicalUserMessage)
    Session.DataBaseCreate("parts", historicalUserTextPart)
    Session.DataBaseCreate("messages", historicalAssistantMessage)
    Session.DataBaseCreate("parts", historicalAssistantTextPart)

    const seenParts = new Map<string, Message.Part>()
    seedSeenSessionParts(sessionID!, seenParts)

    const nextAssistantMessage: Message.Assistant = {
      id: Identifier.ascending("message"),
      sessionID: sessionID!,
      role: "assistant",
      created: Date.now() + 3,
      completed: Date.now() + 4,
      parentID: historicalUserMessage.id,
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
    const nextAssistantTextPart: Message.TextPart = {
      id: Identifier.ascending("part"),
      sessionID: sessionID!,
      messageID: nextAssistantMessage.id,
      type: "text",
      text: "new answer",
    }

    Session.DataBaseCreate("messages", nextAssistantMessage)
    Session.DataBaseCreate("parts", nextAssistantTextPart)

    const streamedEvents: Array<{ event: string; data: unknown }> = []
    emitUpdatedAssistantSessionParts(sessionID!, seenParts, (event, data) => {
      streamedEvents.push({ event, data })
    })

    expect(streamedEvents).toHaveLength(1)
    expect(streamedEvents[0]?.event).toBe("delta")
    expect(streamedEvents[0]?.data).toMatchObject({
      sessionID,
      messageID: nextAssistantMessage.id,
      partID: nextAssistantTextPart.id,
      kind: "text",
      delta: "new answer",
      text: "new answer",
    })
    expect(streamedEvents.some((item) => {
      const data = item.data as { partID?: string; text?: string }
      return data.partID === historicalAssistantTextPart.id || data.text === "old answer"
    })).toBe(false)
  })

  test("GET /api/projects/:id/sessions should return 404 for missing project", async () => {
    const app = createServerApp()
    const response = await app.request("http://localhost/api/projects/project_missing/sessions")
    const body = (await response.json()) as JsonEnvelope

    expect(response.status).toBe(404)
    expect(body.success).toBe(false)
    expect(body.error?.code).toBe("PROJECT_NOT_FOUND")
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
