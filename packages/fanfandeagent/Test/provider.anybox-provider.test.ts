import { afterAll, beforeEach, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const testRoot = mkdtempSync(path.join(tmpdir(), "fanfande-anybox-provider-"))
process.env.FANFANDE_AGENT_DATA_DIR = testRoot
process.env.FANFANDE_ANYBOX_BASE_URL = "https://anybox.test"
process.env.FanFande_OPENAI_CODEX_CALLBACK_PORT = "0"

const Auth = await import("#auth/auth.ts")
const ProviderAuth = await import("#auth/provider-auth.ts")
const Provider = await import("#provider/provider.ts")
const { Instance } = await import("#project/instance.ts")

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]

afterAll(() => {
  rmSync(testRoot, { recursive: true, force: true })
})

beforeEach(async () => {
  await Auth.clearProvider("anybox")
})

test("anybox is visible in catalog without API key capability before login", async () => {
  const restoreProvider = Provider.setProviderRuntimeDependenciesForTesting({
    getModelsDev: async () => ({}) as never,
    getConfig: async () => ({}) as never,
    getEnvAll: () => ({}),
    importPackage: async () => {
      throw new Error("Anybox catalog visibility should not import SDK packages")
    },
  })

  try {
    const catalog = await Provider.catalog()
    const anybox = catalog.find((provider) => provider.id === "anybox")

    expect(anybox).toBeDefined()
    expect(anybox?.configured).toBe(false)
    expect(anybox?.available).toBe(false)
    expect(anybox?.baseURL).toBe("https://anybox.test/v1")
    expect(anybox?.authCapabilities.map((capability) => capability.kind)).toEqual(["browser_oauth"])
    expect(anybox?.authCapabilities.some((capability) => capability.kind === "api_key")).toBe(false)
    expect(anybox?.authState.status).toBe("not_connected")
  } finally {
    restoreProvider()
  }
})

test("anybox browser login stores oauth session and runtime uses openai-compatible with access token", async () => {
  const anyboxLanguageModel = {
    doGenerate() {},
    doStream() {},
  }
  const capturedFactoryInputs: Array<Record<string, unknown>> = []
  const originalFetch = globalThis.fetch
  const seenRequests: Array<{ url: string; authorization?: string; body?: Record<string, unknown> }> = []

  globalThis.fetch = (async (input: FetchInput, init?: FetchInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    const headers = new Headers(init?.headers)

    if (url === "https://anybox.test/api/agent/oauth/token") {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
      seenRequests.push({ url, body })
      expect(body).toMatchObject({
        grant_type: "authorization_code",
        client_id: "fanfande-agent",
        code: "anybox-auth-code",
        redirect_uri: expect.stringContaining("/auth/callback"),
      })
      expect(body.code_verifier).toBeString()
      return Response.json({
        access_token: "anybox-access-1",
        refresh_token: "anybox-refresh-1",
        expires_in: 3600,
        token_type: "Bearer",
      })
    }

    if (url === "https://anybox.test/api/agent/me") {
      seenRequests.push({ url, authorization: headers.get("authorization") ?? undefined })
      expect(headers.get("authorization")).toBe("Bearer anybox-access-1")
      return Response.json({
        account: {
          id: "user_anybox",
          email: "agent-user@anybox.test",
          plan_type: "pro",
          workspace: {
            id: "ws_anybox",
            name: "Anybox Workspace",
          },
          billing: {
            balance_microcents: 123_000_000,
            currency: "CNY",
            recharge_url: "https://anybox.test/billing/recharge",
          },
        },
      })
    }

    if (url === "https://anybox.test/v1/models") {
      seenRequests.push({ url, authorization: headers.get("authorization") ?? undefined })
      expect(headers.get("authorization")).toBe("Bearer anybox-access-1")
      return Response.json({
        object: "list",
        data: [
          {
            id: "claude-opus",
            name: "Claude Opus",
            context_window: 200_000,
            max_output_tokens: 32_000,
          },
          {
            id: "vision-model",
            capabilities: {
              vision: true,
              pdf: true,
              reasoning: true,
            },
          },
        ],
      })
    }

    return originalFetch(input, init)
  }) as typeof fetch

  const restoreProvider = Provider.setProviderRuntimeDependenciesForTesting({
    getModelsDev: async () => ({}) as never,
    getConfig: async () =>
      ({
        provider: {
          anybox: {
            name: "Anybox",
            options: {
              baseURL: "https://anybox.test",
            },
          },
        },
      }) as never,
    getEnvAll: () => ({}),
    importPackage: async (pkg: string, version?: string) => {
      expect(pkg).toBe("@ai-sdk/openai-compatible")
      expect(version).toBe("2.0.38")

      return {
        name: pkg,
        version: version ?? "test-version",
        entry: `${pkg}/index.js`,
        root: pkg,
        module: {
          createOpenAICompatible(options: Record<string, unknown>) {
            capturedFactoryInputs.push(options)
            return {
              languageModel() {
                return anyboxLanguageModel
              },
            }
          },
        },
      }
    },
  })

  try {
    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        const flow = await ProviderAuth.startProviderAuthFlow({
          providerID: "anybox",
          method: "anybox-browser",
          serverBaseURL: "http://localhost",
          providerBaseURL: "https://anybox.test/v1",
        })

        const authorizationURL = new URL(flow.authorizationURL ?? "")
        expect(authorizationURL.origin).toBe("https://anybox.test")
        expect(authorizationURL.pathname).toBe("/api/agent/oauth/authorize")
        expect(authorizationURL.searchParams.get("client_id")).toBe("fanfande-agent")
        expect(authorizationURL.searchParams.get("code_challenge_method")).toBe("S256")
        expect(authorizationURL.searchParams.get("code_challenge")).toBeString()
        expect(authorizationURL.searchParams.get("redirect_uri")).toBeString()

        const state = authorizationURL.searchParams.get("state")
        const redirectURI = authorizationURL.searchParams.get("redirect_uri")
        const callbackResponse = await fetch(
          `${redirectURI}?code=anybox-auth-code&state=${encodeURIComponent(state ?? "")}`,
        )
        const callbackHtml = await callbackResponse.text()
        expect(callbackResponse.status).toBe(200)
        expect(callbackHtml).toContain("Sign-in complete")
        await Bun.sleep(20)

        const authState = await ProviderAuth.getProviderAuthState("anybox")
        expect(authState).toMatchObject({
          providerID: "anybox",
          activeMethod: "anybox-browser",
          status: "connected",
          account: {
            email: "agent-user@anybox.test",
            planType: "pro",
            workspaceName: "Anybox Workspace",
            balanceMicrocents: 123_000_000,
            currency: "CNY",
            rechargeUrl: "https://anybox.test/billing/recharge",
          },
        })

        const catalog = await Provider.catalog()
        const anybox = catalog.find((provider) => provider.id === "anybox")
        expect(anybox?.available).toBe(true)
        expect(anybox?.modelCount).toBe(2)
        expect(anybox?.apiKeyConfigured).toBe(false)

        const model = await Provider.getModel("anybox", "claude-opus")
        expect(model.api.npm).toBe("@ai-sdk/openai-compatible")
        expect(model.api.url).toBe("https://anybox.test/v1")
        expect(model.capabilities.input.text).toBe(true)
        expect(model.capabilities.input.image).toBe(false)
        expect(model.capabilities.toolcall).toBe(true)

        const visionModel = await Provider.getModel("anybox", "vision-model")
        expect(visionModel.capabilities.input.image).toBe(true)
        expect(visionModel.capabilities.input.pdf).toBe(true)
        expect(visionModel.capabilities.reasoning).toBe(true)

        const language = await Provider.getLanguage(model)
        expect(language as unknown).toBe(anyboxLanguageModel)
        expect(capturedFactoryInputs).toEqual([
          {
            name: "anybox",
            apiKey: "anybox-access-1",
            baseURL: "https://anybox.test/v1",
            headers: undefined,
            fetch: expect.any(Function),
          },
        ])
      },
    })

    expect(seenRequests.some((request) => request.url === "https://anybox.test/api/agent/oauth/token")).toBe(true)
    expect(seenRequests.some((request) => request.url === "https://anybox.test/v1/models")).toBe(true)
  } finally {
    restoreProvider()
    globalThis.fetch = originalFetch
  }
})

test("anybox runtime fetch refreshes and retries chat completion after 401", async () => {
  const capturedFactoryInputs: Array<Record<string, unknown>> = []
  const chatAuthorizations: string[] = []
  const originalFetch = globalThis.fetch

  await Auth.setProviderCredential(
    "anybox",
    "anybox-browser",
    {
      kind: "oauth_session",
      accessToken: "old-anybox-access",
      refreshToken: "old-anybox-refresh",
      expiresAt: Date.now() + 60 * 60 * 1000,
      email: "agent-user@anybox.test",
      originator: "https://anybox.test",
    },
    {
      activate: true,
      lastError: null,
    },
  )

  globalThis.fetch = (async (input: FetchInput, init?: FetchInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    const headers = new Headers(init?.headers)
    const authorization = headers.get("authorization") ?? ""

    if (url === "https://anybox.test/api/agent/me") {
      return Response.json({
        account: {
          email: authorization.includes("new-anybox-access") ? "fresh@anybox.test" : "agent-user@anybox.test",
          workspace_name: "Anybox Workspace",
        },
      })
    }

    if (url === "https://anybox.test/v1/models") {
      expect(authorization).toBe("Bearer old-anybox-access")
      return Response.json({
        data: [
          {
            id: "retry-model",
            name: "Retry Model",
          },
        ],
      })
    }

    if (url === "https://anybox.test/api/agent/oauth/refresh") {
      return Response.json({
        access_token: "new-anybox-access",
        refresh_token: "new-anybox-refresh",
        expires_in: 3600,
      })
    }

    if (url === "https://anybox.test/v1/chat/completions") {
      chatAuthorizations.push(authorization)
      if (authorization === "Bearer old-anybox-access") {
        return Response.json({ error: { message: "expired" } }, { status: 401 })
      }

      return Response.json({ id: "chatcmpl_retry", choices: [] })
    }

    return originalFetch(input, init)
  }) as typeof fetch

  const restoreProvider = Provider.setProviderRuntimeDependenciesForTesting({
    getModelsDev: async () => ({}) as never,
    getConfig: async () =>
      ({
        provider: {
          anybox: {
            name: "Anybox",
            options: {
              baseURL: "https://anybox.test",
            },
          },
        },
      }) as never,
    getEnvAll: () => ({}),
    importPackage: async (pkg: string, version?: string) => ({
      name: pkg,
      version: version ?? "test-version",
      entry: `${pkg}/index.js`,
      root: pkg,
      module: {
        createOpenAICompatible(options: Record<string, unknown>) {
          capturedFactoryInputs.push(options)
          return {
            languageModel() {
              return {
                doGenerate() {},
                doStream() {},
              }
            },
          }
        },
      },
    }),
  })

  try {
    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        const model = await Provider.getModel("anybox", "retry-model")
        await Provider.getLanguage(model)

        const runtimeFetch = capturedFactoryInputs[0]?.fetch
        expect(typeof runtimeFetch).toBe("function")

        const response = await (runtimeFetch as typeof fetch)("https://anybox.test/v1/chat/completions", {
          method: "POST",
          headers: {
            authorization: "Bearer old-anybox-access",
            "content-type": "application/json",
          },
          body: "{}",
        })

        expect(response.status).toBe(200)
        expect(chatAuthorizations).toEqual(["Bearer old-anybox-access", "Bearer new-anybox-access"])

        const active = await Auth.getActiveProviderCredential("anybox")
        expect(active?.credential).toMatchObject({
          kind: "oauth_session",
          accessToken: "new-anybox-access",
          refreshToken: "new-anybox-refresh",
          email: "fresh@anybox.test",
        })
      },
    })
  } finally {
    restoreProvider()
    globalThis.fetch = originalFetch
  }
})

test("anybox runtime auth refreshes near-expired access tokens", async () => {
  const originalFetch = globalThis.fetch
  const seenRefreshBodies: Record<string, unknown>[] = []

  await Auth.setProviderCredential(
    "anybox",
    "anybox-browser",
    {
      kind: "oauth_session",
      accessToken: "old-anybox-access",
      refreshToken: "old-anybox-refresh",
      expiresAt: Date.now() + 1000,
      email: "old@anybox.test",
      originator: "https://anybox.test",
    },
    {
      activate: true,
      lastError: null,
    },
  )

  globalThis.fetch = (async (input: FetchInput, init?: FetchInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    const headers = new Headers(init?.headers)

    if (url === "https://anybox.test/api/agent/oauth/refresh") {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
      seenRefreshBodies.push(body)
      return Response.json({
        access_token: "new-anybox-access",
        refresh_token: "new-anybox-refresh",
        expires_in: 3600,
      })
    }

    if (url === "https://anybox.test/api/agent/me") {
      expect(headers.get("authorization")).toBe("Bearer new-anybox-access")
      return Response.json({
        account: {
          email: "fresh@anybox.test",
          workspace_name: "Fresh Workspace",
        },
      })
    }

    return originalFetch(input, init)
  }) as typeof fetch

  try {
    const runtimeAuth = await ProviderAuth.resolveProviderRuntimeAuth("anybox", {
      providerBaseURL: "https://anybox.test",
    })

    expect(runtimeAuth.apiKey).toBe("new-anybox-access")
    expect(runtimeAuth.runtimeBaseURL).toBe("https://anybox.test/v1")
    expect(runtimeAuth.authMode).toBe("api")
    expect(runtimeAuth.authState.status).toBe("connected")
    expect(runtimeAuth.authState.account?.email).toBe("fresh@anybox.test")
    expect(seenRefreshBodies).toEqual([
      {
        grant_type: "refresh_token",
        client_id: "fanfande-agent",
        refresh_token: "old-anybox-refresh",
      },
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})
