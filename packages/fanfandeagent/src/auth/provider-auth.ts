import fs from "fs/promises"
import os from "os"
import path from "path"
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http"
import z from "zod"
import * as Auth from "#auth/auth.ts"
import * as Log from "#util/log.ts"

const log = Log.create({ service: "provider-auth" })

const OPENAI_PROVIDER_ID = "openai"
const OPENAI_AUTH_ISSUER = "https://auth.openai.com"
const OPENAI_CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex"
const OPENAI_DEVICE_AUTH_BASE_URL = `${OPENAI_AUTH_ISSUER}/api/accounts`
const OPENAI_DEVICE_AUTH_VERIFICATION_URL = `${OPENAI_AUTH_ISSUER}/codex/device`
const OPENAI_LOCAL_CALLBACK_PATH = "/auth/callback"
const DEFAULT_OPENAI_LOCAL_CALLBACK_PORT = 1455
const OPENAI_OAUTH_CLIENT_ID = process.env["FanFande_OPENAI_CODEX_CLIENT_ID"]?.trim() || "app_EMoamEEZ73f0CkXaXp7hrann"
const OPENAI_OAUTH_SCOPE = "openid profile email offline_access"
const OPENAI_ORIGINATOR =
  process.env["FanFande_OPENAI_CODEX_ORIGINATOR"]?.trim() ||
  process.env["CODEX_INTERNAL_ORIGINATOR_OVERRIDE"]?.trim() ||
  "Codex Desktop"
const TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1000
const DEFAULT_TOKEN_TTL_MS = 60 * 60 * 1000
const OPENAI_FLOW_TIMEOUT_MS = 15 * 60 * 1000

const CodexAuthCache = z
  .object({
    auth_mode: z.string().optional(),
    OPENAI_API_KEY: z.string().optional().nullable(),
    tokens: z
      .object({
        access_token: z.string().optional(),
        refresh_token: z.string().optional(),
        id_token: z.string().optional(),
        account_id: z.string().optional(),
      })
      .passthrough()
      .optional(),
    last_refresh: z.number().optional(),
  })
  .passthrough()
type CodexAuthCache = z.infer<typeof CodexAuthCache>

const ProviderAuthScope = z.literal("global")
export type ProviderAuthScope = z.infer<typeof ProviderAuthScope>

export const ProviderAuthCapability = z
  .object({
    method: z.string().min(1),
    label: z.string().min(1),
    description: z.string().optional(),
    kind: z.enum(["browser_oauth", "device_code", "api_key"]),
    recommended: z.boolean().optional(),
    supportsPolling: z.boolean().optional(),
    supportsRefresh: z.boolean().optional(),
    supportsDisconnect: z.boolean().optional(),
  })
  .meta({ ref: "ProviderAuthCapability" })
export type ProviderAuthCapability = z.infer<typeof ProviderAuthCapability>

export const ProviderAuthAccountSummary = z
  .object({
    accountID: z.string().optional(),
    userID: z.string().optional(),
    email: z.string().optional(),
    planType: z.string().optional(),
    workspaceID: z.string().optional(),
    workspaceName: z.string().optional(),
    label: z.string().optional(),
  })
  .meta({ ref: "ProviderAuthAccountSummary" })
export type ProviderAuthAccountSummary = z.infer<typeof ProviderAuthAccountSummary>

export const ProviderAuthFlow = z
  .object({
    id: z.string().min(1),
    providerID: z.string().min(1),
    method: z.string().min(1),
    kind: z.enum(["browser_oauth", "device_code", "api_key"]),
    status: z.enum(["pending", "waiting_user", "authorizing", "connected", "error", "expired", "cancelled"]),
    startedAt: z.number(),
    updatedAt: z.number(),
    expiresAt: z.number().optional(),
    authorizationURL: z.string().optional(),
    verificationURI: z.string().optional(),
    userCode: z.string().optional(),
    errorMessage: z.string().optional(),
    connectionLabel: z.string().optional(),
    account: ProviderAuthAccountSummary.optional(),
  })
  .meta({ ref: "ProviderAuthFlow" })
export type ProviderAuthFlow = z.infer<typeof ProviderAuthFlow>

export const ProviderAuthState = z
  .object({
    providerID: z.string().min(1),
    scope: ProviderAuthScope,
    activeMethod: z.string().optional(),
    status: z.enum(["connected", "pending", "expired", "error", "not_connected"]),
    connectionLabel: z.string().optional(),
    lastError: z.string().optional(),
    expiresAt: z.number().optional(),
    account: ProviderAuthAccountSummary.optional(),
    capabilities: z.array(ProviderAuthCapability),
    credentials: z.array(Auth.ProviderCredentialDescriptor),
    flow: ProviderAuthFlow.optional(),
  })
  .meta({ ref: "ProviderAuthState" })
export type ProviderAuthState = z.infer<typeof ProviderAuthState>

export type ProviderRuntimeAuth = {
  credentialKind?: Auth.CredentialRecord["kind"]
  credentialSource?: Auth.ProviderCredentialDescriptor["source"]
  activeMethod?: string
  apiKey?: string
  runtimeBaseURL?: string
  runtimeHeaders?: Record<string, string>
  authMode: "api" | "codex"
  authCapabilities: ProviderAuthCapability[]
  authState: ProviderAuthState
}

type ProviderAuthFallbacks = {
  configApiKey?: string
  envApiKey?: string
}

type ProviderFlowContext = {
  providerID: string
  method: string
  serverBaseURL: string
}

type InternalFlow = ProviderAuthFlow & {
  state?: string
  redirectURI?: string
  codeVerifier?: string
  deviceAuthID?: string
  intervalSeconds?: number
  cancelSignal?: AbortController
  timeoutHandle?: ReturnType<typeof setTimeout>
}

const flowState = new Map<string, InternalFlow>()

type OpenAILocalCallbackServer = {
  server: HttpServer
  host: string
  port: number
  redirectURI: string
}

let openAILocalCallbackServer: OpenAILocalCallbackServer | undefined
let openAILocalCallbackServerPromise: Promise<OpenAILocalCallbackServer> | undefined

const apiKeyCapability: ProviderAuthCapability = {
  method: "api-key",
  label: "API key",
  description: "Usage-based access via a provider API key.",
  kind: "api_key",
  supportsDisconnect: true,
}

const openaiCapabilities: ProviderAuthCapability[] = [
  {
    method: "chatgpt-browser",
    label: "ChatGPT Pro/Plus (browser)",
    description: "Sign in with ChatGPT in your system browser.",
    kind: "browser_oauth",
    recommended: true,
    supportsPolling: true,
    supportsRefresh: true,
    supportsDisconnect: true,
  },
  {
    method: "chatgpt-headless",
    label: "ChatGPT Pro/Plus (headless)",
    description: "Use a device code on another browser or machine.",
    kind: "device_code",
    supportsPolling: true,
    supportsRefresh: true,
    supportsDisconnect: true,
  },
  apiKeyCapability,
]

function now() {
  return Date.now()
}

function normalizeString(value: unknown) {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function getCapabilities(providerID: string): ProviderAuthCapability[] {
  if (providerID === OPENAI_PROVIDER_ID) return openaiCapabilities
  return [apiKeyCapability]
}

export function getProviderAuthCapabilities(providerID: string): ProviderAuthCapability[] {
  return getCapabilities(providerID)
}

function getCapability(providerID: string, method: string) {
  return getCapabilities(providerID).find((item) => item.method === method)
}

function isOpenAIChatGPTMethod(method: string | undefined) {
  return method === "chatgpt-browser" || method === "chatgpt-headless"
}

function createFlowID() {
  return crypto.randomUUID()
}

function base64UrlEncode(input: Uint8Array) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function parseNumeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function getOpenAILocalCallbackHost() {
  return normalizeString(process.env["FanFande_OPENAI_CODEX_CALLBACK_HOST"]) ?? "localhost"
}

function getOpenAILocalCallbackBindHost() {
  return normalizeString(process.env["FanFande_OPENAI_CODEX_CALLBACK_HOST"])
}

function getOpenAILocalCallbackPort() {
  const configured = parseNumeric(process.env["FanFande_OPENAI_CODEX_CALLBACK_PORT"])
  if (configured === undefined) return DEFAULT_OPENAI_LOCAL_CALLBACK_PORT
  return Math.max(0, Math.floor(configured))
}

function resolveCodexAuthFilepath() {
  const codexHome = normalizeString(process.env["CODEX_HOME"]) ?? path.join(os.homedir(), ".codex")
  return path.join(codexHome, "auth.json")
}

async function readCodexAuthCache(): Promise<CodexAuthCache | undefined> {
  try {
    const raw = await fs.readFile(resolveCodexAuthFilepath(), "utf8")
    return CodexAuthCache.parse(JSON.parse(raw))
  } catch {
    return undefined
  }
}

async function createPkcePair() {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32))
  const codeVerifier = base64UrlEncode(verifierBytes)
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier))
  const codeChallenge = base64UrlEncode(new Uint8Array(digest))
  return {
    codeVerifier,
    codeChallenge,
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | undefined {
  const parts = token.split(".")
  if (parts.length < 2) return undefined

  try {
    const normalized = parts[1]!.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
    const text = Buffer.from(padded, "base64").toString("utf8")
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

function readJwtExpiry(token: string | undefined) {
  if (!token) return undefined
  const payload = decodeJwtPayload(token)
  const exp = parseNumeric(payload?.exp)
  return exp ? exp * 1000 : undefined
}

function summarizeOAuthAccount(credential: Auth.OAuthSessionCredential): ProviderAuthAccountSummary | undefined {
  const label = credential.email ?? credential.workspaceName ?? credential.planType
  if (
    !credential.accountID &&
    !credential.userID &&
    !credential.email &&
    !credential.planType &&
    !credential.workspaceID &&
    !credential.workspaceName &&
    !label
  ) {
    return undefined
  }

  return {
    accountID: credential.accountID,
    userID: credential.userID,
    email: credential.email,
    planType: credential.planType,
    workspaceID: credential.workspaceID,
    workspaceName: credential.workspaceName,
    label,
  }
}

function methodLabel(providerID: string, method: string | undefined) {
  if (!method) return undefined
  return getCapability(providerID, method)?.label ?? method
}

function connectionLabelForCredential(
  providerID: string,
  method: string | undefined,
  credential: Auth.CredentialRecord | undefined,
  source: Auth.ProviderCredentialDescriptor["source"] = "credential_store",
) {
  if (!credential) return undefined

  if (credential.kind === "oauth_session") {
    const planLabel = normalizeString(credential.planType)?.toUpperCase()
    const baseLabel =
      source === "external_cache" && providerID === OPENAI_PROVIDER_ID
        ? "Connected via ChatGPT login (Codex cache)"
        : `Connected via ${methodLabel(providerID, method)}`
    return planLabel ? `${baseLabel} (${planLabel})` : baseLabel
  }

  if (source === "environment") return "Connected via API key (environment)"
  if (source === "legacy_config") return "Connected via API key (legacy config)"
  if (source === "external_cache" && providerID === OPENAI_PROVIDER_ID) return "Connected via API key (Codex cache)"
  return `Connected via ${methodLabel(providerID, method)}`
}

function flowPublicView(flow: InternalFlow): ProviderAuthFlow {
  return {
    id: flow.id,
    providerID: flow.providerID,
    method: flow.method,
    kind: flow.kind,
    status: flow.status,
    startedAt: flow.startedAt,
    updatedAt: flow.updatedAt,
    expiresAt: flow.expiresAt,
    authorizationURL: flow.authorizationURL,
    verificationURI: flow.verificationURI,
    userCode: flow.userCode,
    errorMessage: flow.errorMessage,
    connectionLabel: flow.connectionLabel,
    account: flow.account,
  }
}

function isTerminalFlowStatus(status: ProviderAuthFlow["status"]) {
  return status === "connected" || status === "error" || status === "expired" || status === "cancelled"
}

function isOpenAIBrowserFlow(flow: InternalFlow) {
  return flow.providerID === OPENAI_PROVIDER_ID && flow.method === "chatgpt-browser"
}

function clearFlowTimeout(flow: InternalFlow) {
  if (!flow.timeoutHandle) return
  clearTimeout(flow.timeoutHandle)
  flow.timeoutHandle = undefined
}

function hasActiveOpenAIBrowserFlows() {
  return Array.from(flowState.values()).some((flow) => isOpenAIBrowserFlow(flow) && !isTerminalFlowStatus(flow.status))
}

function getLatestProviderFlow(providerID: string) {
  const flows = Array.from(flowState.values()).filter((flow) => flow.providerID === providerID)
  if (flows.length === 0) return undefined
  flows.sort((left, right) => right.updatedAt - left.updatedAt)
  return flows[0]
}

function upsertFlow(flow: InternalFlow) {
  flow.updatedAt = now()
  flowState.set(flow.id, flow)
  return flow
}

async function closeOpenAILocalCallbackServer() {
  const current = openAILocalCallbackServer
  openAILocalCallbackServer = undefined
  openAILocalCallbackServerPromise = undefined
  if (!current) return

  await new Promise<void>((resolve) => {
    current.server.close(() => resolve())
  })
}

async function closeOpenAILocalCallbackServerIfIdle() {
  if (hasActiveOpenAIBrowserFlows()) return
  await closeOpenAILocalCallbackServer()
}

async function settleOpenAIBrowserFlow(flow: InternalFlow, options?: { deferServerClose?: boolean }) {
  if (!isOpenAIBrowserFlow(flow)) return
  clearFlowTimeout(flow)

  if (options?.deferServerClose) {
    if (!hasActiveOpenAIBrowserFlows()) {
      setTimeout(() => {
        void closeOpenAILocalCallbackServerIfIdle()
      }, 0)
    }
    return
  }

  await closeOpenAILocalCallbackServerIfIdle()
}

async function expireOpenAIBrowserFlow(flowID: string) {
  const flow = flowState.get(flowID)
  if (!flow || !isOpenAIBrowserFlow(flow) || isTerminalFlowStatus(flow.status)) return

  flow.status = "expired"
  flow.errorMessage = "Browser sign-in timed out after 15 minutes."
  clearFlowTimeout(flow)
  upsertFlow(flow)
  await Auth.setProviderLastError(flow.providerID, flow.errorMessage)
  await settleOpenAIBrowserFlow(flow)
}

async function handleOpenAILocalCallbackRequest(req: IncomingMessage, res: ServerResponse) {
  const fallbackOrigin = openAILocalCallbackServer
    ? `http://${openAILocalCallbackServer.host}:${openAILocalCallbackServer.port}`
    : `http://${getOpenAILocalCallbackHost()}:${getOpenAILocalCallbackPort()}`
  const origin = normalizeString(req.headers.host) ? `http://${req.headers.host}` : fallbackOrigin
  const url = new URL(req.url ?? "/", origin)

  if (req.method !== "GET") {
    res.writeHead(405, { "content-type": "text/html; charset=utf-8" })
    res.end(
      renderProviderAuthCallbackPage({
        ok: false,
        title: "Sign-in failed",
        message: "This callback only accepts GET requests.",
      }),
    )
    return
  }

  if (url.pathname !== OPENAI_LOCAL_CALLBACK_PATH) {
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" })
    res.end(
      renderProviderAuthCallbackPage({
        ok: false,
        title: "Sign-in failed",
        message: "This callback URL is not recognized.",
      }),
    )
    return
  }

  try {
    const result = await completeProviderBrowserCallback({
      providerID: OPENAI_PROVIDER_ID,
      url,
    })

    res.writeHead(result.status, { "content-type": "text/html; charset=utf-8" })
    res.end(
      renderProviderAuthCallbackPage({
        ok: result.ok,
        title: result.title,
        message: result.message,
      }),
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.writeHead(500, { "content-type": "text/html; charset=utf-8" })
    res.end(
      renderProviderAuthCallbackPage({
        ok: false,
        title: "Sign-in failed",
        message,
      }),
    )
  }
}

async function ensureOpenAILocalCallbackServer() {
  if (openAILocalCallbackServer) return openAILocalCallbackServer
  if (openAILocalCallbackServerPromise) return await openAILocalCallbackServerPromise

  const requestedPort = getOpenAILocalCallbackPort()
  const requestedHost = getOpenAILocalCallbackHost()
  const bindHost = getOpenAILocalCallbackBindHost()

  openAILocalCallbackServerPromise = new Promise<OpenAILocalCallbackServer>((resolve, reject) => {
    const server = createServer((req, res) => {
      void handleOpenAILocalCallbackRequest(req, res)
    })

    const fail = (error: NodeJS.ErrnoException) => {
      server.removeAllListeners()
      const message =
        error.code === "EADDRINUSE"
          ? `OpenAI browser sign-in could not start because ${(bindHost ?? requestedHost)}:${requestedPort} is already in use.`
          : error.message
      reject(new Error(message))
    }

    server.once("error", fail)
    server.listen(bindHost ? { host: bindHost, port: requestedPort } : { port: requestedPort }, () => {
      server.off("error", fail)
      const address = server.address()
      if (!address || typeof address === "string") {
        server.close(() => {
          reject(new Error("OpenAI browser sign-in could not determine a localhost callback port."))
        })
        return
      }

      const host =
        bindHost === "0.0.0.0" || bindHost === "::" || bindHost === "[::]" ? "localhost" : requestedHost
      const serverState: OpenAILocalCallbackServer = {
        server,
        host,
        port: address.port,
        redirectURI: `http://${host}:${address.port}${OPENAI_LOCAL_CALLBACK_PATH}`,
      }

      openAILocalCallbackServer = serverState
      resolve(serverState)
    })
  })

  try {
    return await openAILocalCallbackServerPromise
  } catch (error) {
    openAILocalCallbackServerPromise = undefined
    throw error
  }
}

async function buildFallbackCredential(
  providerID: string,
  fallbacks: ProviderAuthFallbacks,
): Promise<
  | {
      method: string
      credential: Auth.CredentialRecord
      source: Auth.ProviderCredentialDescriptor["source"]
    }
  | undefined
> {
  if (fallbacks.configApiKey) {
    return {
      method: "api-key",
      credential: {
        kind: "api_key",
        apiKey: fallbacks.configApiKey,
      },
      source: "legacy_config",
    }
  }

  if (fallbacks.envApiKey) {
    return {
      method: "api-key",
      credential: {
        kind: "api_key",
        apiKey: fallbacks.envApiKey,
      },
      source: "environment",
    }
  }

  if (providerID === OPENAI_PROVIDER_ID) {
    const cache = await readCodexAuthCache()
    const authMode = normalizeString(cache?.auth_mode)?.toLowerCase()

    if (authMode === "chatgpt" || (!authMode && cache?.tokens)) {
      const accessToken = normalizeString(cache?.tokens?.access_token)
      const refreshToken = normalizeString(cache?.tokens?.refresh_token)
      const idToken = normalizeString(cache?.tokens?.id_token)

      if (accessToken && refreshToken) {
        const parsed = parseOpenAIIdToken(idToken)
        return {
          method: "chatgpt-browser",
          credential: {
            kind: "oauth_session",
            accessToken,
            refreshToken,
            expiresAt: computeTokenExpiry({
              accessToken,
              idToken,
            }),
            idToken,
            accountID: normalizeString(cache?.tokens?.account_id) ?? parsed.accountID,
            userID: parsed.userID,
            email: parsed.email,
            planType: parsed.planType,
            workspaceID: parsed.workspaceID,
            workspaceName: parsed.workspaceName,
            originator: OPENAI_ORIGINATOR,
            updatedAt: cache?.last_refresh,
          },
          source: "external_cache",
        }
      }
    }

    const codexApiKey = normalizeString(cache?.OPENAI_API_KEY)
    if (authMode === "api" && codexApiKey) {
      return {
        method: "api-key",
        credential: {
          kind: "api_key",
          apiKey: codexApiKey,
          updatedAt: cache?.last_refresh,
        },
        source: "external_cache",
      }
    }
  }

  return undefined
}

function makeDescriptor(
  method: string,
  credential: Auth.CredentialRecord,
  source: Auth.ProviderCredentialDescriptor["source"],
): Auth.ProviderCredentialDescriptor {
  if (credential.kind === "api_key") {
    return {
      method,
      kind: "api_key",
      source,
      configured: true,
      label: credential.label,
    }
  }

  return {
    method,
    kind: "oauth_session",
    source,
    configured: true,
    expiresAt: credential.expiresAt,
    email: credential.email,
    planType: credential.planType,
    workspaceID: credential.workspaceID,
    workspaceName: credential.workspaceName,
    label: credential.email ?? credential.workspaceName ?? credential.planType,
  }
}

async function buildProviderAuthState(
  providerID: string,
  fallbacks: ProviderAuthFallbacks = {},
): Promise<ProviderAuthState> {
  const capabilities = getCapabilities(providerID)
  const record = await Auth.getProviderRecord(providerID)
  const flow = getLatestProviderFlow(providerID)
  const fallback = await buildFallbackCredential(providerID, fallbacks)
  const credentials = await Auth.listCredentialDescriptors(providerID)
  if (fallback && !credentials.some((item) => item.method === fallback.method && item.source === fallback.source)) {
    credentials.push(makeDescriptor(fallback.method, fallback.credential, fallback.source))
  }

  const activeStored = record?.activeMethod ? record.credentials[record.activeMethod] : undefined
  const activeMethod = record?.activeMethod ?? fallback?.method
  const activeCredential = activeStored ?? fallback?.credential
  const activeSource: Auth.ProviderCredentialDescriptor["source"] = activeStored ? "credential_store" : fallback?.source ?? "credential_store"
  const expired =
    activeCredential?.kind === "oauth_session" ? activeCredential.expiresAt <= now() : false

  let status: ProviderAuthState["status"] = "not_connected"
  if (flow && !["connected", "cancelled", "expired", "error"].includes(flow.status)) status = "pending"
  else if (activeCredential && expired) status = "expired"
  else if (activeCredential) status = "connected"
  else if (record?.lastError) status = "error"

  const connectionLabel =
    flow && status === "pending"
      ? flow.connectionLabel ?? `Waiting for ${methodLabel(providerID, flow.method)}`
      : connectionLabelForCredential(providerID, activeMethod, activeCredential, activeSource)

  return {
    providerID,
    scope: "global",
    activeMethod: activeMethod ?? undefined,
    status,
    connectionLabel,
    lastError: record?.lastError ?? undefined,
    expiresAt: activeCredential?.kind === "oauth_session" ? activeCredential.expiresAt : undefined,
    account: activeCredential?.kind === "oauth_session" ? summarizeOAuthAccount(activeCredential) : undefined,
    capabilities,
    credentials,
    flow: flow ? flowPublicView(flow) : undefined,
  }
}

function parseOpenAIIdToken(idToken: string | undefined) {
  const payload = decodeJwtPayload(idToken ?? "")
  const auth = payload?.["https://api.openai.com/auth"]
  const profile = payload?.["https://api.openai.com/profile"]
  const authRecord = auth && typeof auth === "object" ? (auth as Record<string, unknown>) : {}
  const profileRecord = profile && typeof profile === "object" ? (profile as Record<string, unknown>) : {}

  return {
    accountID: normalizeString(authRecord.chatgpt_account_id),
    userID: normalizeString(authRecord.chatgpt_user_id) ?? normalizeString(authRecord.user_id),
    email: normalizeString(payload?.email) ?? normalizeString(profileRecord.email),
    planType: normalizeString(authRecord.chatgpt_plan_type),
    workspaceID: normalizeString(authRecord.chatgpt_workspace_id),
    workspaceName: normalizeString(authRecord.chatgpt_workspace_name),
  }
}

function computeTokenExpiry(input: { accessToken?: string; idToken?: string; expiresIn?: unknown }) {
  const explicit = parseNumeric(input.expiresIn)
  if (explicit && explicit > 0) {
    return now() + explicit * 1000
  }

  return readJwtExpiry(input.accessToken) ?? readJwtExpiry(input.idToken) ?? now() + DEFAULT_TOKEN_TTL_MS
}

async function parseJsonResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.includes("application/json")) return undefined
  return await response.json().catch(() => undefined)
}

function errorMessageFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return undefined
  const record = payload as Record<string, unknown>
  const direct = normalizeString(record.message) ?? normalizeString(record.error_description)
  if (direct) return direct

  const error = record.error
  if (typeof error === "string") return normalizeString(error)
  if (error && typeof error === "object") {
    const nested = error as Record<string, unknown>
    return normalizeString(nested.message) ?? normalizeString(nested.error)
  }

  return undefined
}

async function ensureOkResponse(response: Response, prefix: string) {
  if (response.ok) return response
  const payload = await parseJsonResponse(response)
  const detail = errorMessageFromPayload(payload) ?? normalizeString(await response.text().catch(() => "")) ?? `HTTP ${response.status}`
  throw new Error(`${prefix}: ${detail}`)
}

function buildOpenAIBrowserAuthorizeURL(input: {
  redirectURI: string
  codeChallenge: string
  state: string
}) {
  const url = new URL(`${OPENAI_AUTH_ISSUER}/oauth/authorize`)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", OPENAI_OAUTH_CLIENT_ID)
  url.searchParams.set("redirect_uri", input.redirectURI)
  url.searchParams.set("scope", OPENAI_OAUTH_SCOPE)
  url.searchParams.set("code_challenge", input.codeChallenge)
  url.searchParams.set("code_challenge_method", "S256")
  url.searchParams.set("id_token_add_organizations", "true")
  url.searchParams.set("codex_cli_simplified_flow", "true")
  url.searchParams.set("state", input.state)
  url.searchParams.set("originator", OPENAI_ORIGINATOR)
  return url.toString()
}

async function exchangeOpenAIAuthorizationCode(input: {
  authorizationCode: string
  codeVerifier: string
  redirectURI: string
}) {
  const body = new URLSearchParams()
  body.set("grant_type", "authorization_code")
  body.set("client_id", OPENAI_OAUTH_CLIENT_ID)
  body.set("redirect_uri", input.redirectURI)
  body.set("code", input.authorizationCode)
  body.set("code_verifier", input.codeVerifier)

  const response = await fetch(`${OPENAI_AUTH_ISSUER}/oauth/token`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
      originator: OPENAI_ORIGINATOR,
      "user-agent": OPENAI_ORIGINATOR,
    },
    body,
  })

  await ensureOkResponse(response, "OpenAI token exchange failed")
  return (await response.json()) as Record<string, unknown>
}

async function refreshOpenAISession(credential: Auth.OAuthSessionCredential) {
  const body = new URLSearchParams()
  body.set("grant_type", "refresh_token")
  body.set("client_id", OPENAI_OAUTH_CLIENT_ID)
  body.set("refresh_token", credential.refreshToken)

  const response = await fetch(`${OPENAI_AUTH_ISSUER}/oauth/token`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
      originator: OPENAI_ORIGINATOR,
      "user-agent": OPENAI_ORIGINATOR,
    },
    body,
  })

  await ensureOkResponse(response, "OpenAI token refresh failed")
  const payload = (await response.json()) as Record<string, unknown>
  const parsed = parseOpenAIIdToken(normalizeString(payload.id_token) ?? credential.idToken)

  return {
    kind: "oauth_session",
    accessToken: normalizeString(payload.access_token) ?? credential.accessToken,
    refreshToken: normalizeString(payload.refresh_token) ?? credential.refreshToken,
    expiresAt: computeTokenExpiry({
      accessToken: normalizeString(payload.access_token) ?? credential.accessToken,
      idToken: normalizeString(payload.id_token) ?? credential.idToken,
      expiresIn: payload.expires_in,
    }),
    tokenType: normalizeString(payload.token_type) ?? credential.tokenType,
    idToken: normalizeString(payload.id_token) ?? credential.idToken,
    scope: normalizeString(payload.scope) ?? credential.scope,
    accountID: parsed.accountID ?? credential.accountID,
    userID: parsed.userID ?? credential.userID,
    email: parsed.email ?? credential.email,
    planType: parsed.planType ?? credential.planType,
    workspaceID: parsed.workspaceID ?? credential.workspaceID,
    workspaceName: parsed.workspaceName ?? credential.workspaceName,
    originator: credential.originator ?? OPENAI_ORIGINATOR,
    createdAt: credential.createdAt,
  } satisfies Auth.OAuthSessionCredential
}

async function saveOpenAITokens(method: string, payload: Record<string, unknown>) {
  const idToken = normalizeString(payload.id_token)
  const parsed = parseOpenAIIdToken(idToken)
  const credential: Auth.OAuthSessionCredential = {
    kind: "oauth_session",
    accessToken: normalizeString(payload.access_token) ?? "",
    refreshToken: normalizeString(payload.refresh_token) ?? "",
    expiresAt: computeTokenExpiry({
      accessToken: normalizeString(payload.access_token),
      idToken,
      expiresIn: payload.expires_in,
    }),
    tokenType: normalizeString(payload.token_type),
    idToken,
    scope: normalizeString(payload.scope),
    accountID: parsed.accountID,
    userID: parsed.userID,
    email: parsed.email,
    planType: parsed.planType,
    workspaceID: parsed.workspaceID,
    workspaceName: parsed.workspaceName,
    originator: OPENAI_ORIGINATOR,
  }

  await Auth.setProviderCredential(OPENAI_PROVIDER_ID, method, credential, {
    activate: true,
    lastError: null,
  })

  return credential
}

async function startOpenAIBrowserFlow(input: ProviderFlowContext) {
  const capability = getCapability(input.providerID, input.method)
  if (!capability) throw new Error(`Provider '${input.providerID}' does not support auth method '${input.method}'`)

  const callbackServer = await ensureOpenAILocalCallbackServer()
  const id = createFlowID()
  const { codeChallenge, codeVerifier } = await createPkcePair()
  const state = createFlowID()
  const redirectURI = callbackServer.redirectURI
  const authorizationURL = buildOpenAIBrowserAuthorizeURL({
    redirectURI,
    codeChallenge,
    state,
  })

  const flow: InternalFlow = {
    id,
    providerID: input.providerID,
    method: input.method,
    kind: capability.kind,
    status: "waiting_user",
    startedAt: now(),
    updatedAt: now(),
    expiresAt: now() + OPENAI_FLOW_TIMEOUT_MS,
    authorizationURL,
    connectionLabel: `Waiting for ${capability.label}`,
    state,
    redirectURI,
    codeVerifier,
    timeoutHandle: setTimeout(() => {
      void expireOpenAIBrowserFlow(id)
    }, OPENAI_FLOW_TIMEOUT_MS),
  }

  upsertFlow(flow)
  return flowPublicView(flow)
}

async function requestOpenAIDeviceCode() {
  const response = await fetch(`${OPENAI_DEVICE_AUTH_BASE_URL}/deviceauth/usercode`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      originator: OPENAI_ORIGINATOR,
      "user-agent": OPENAI_ORIGINATOR,
    },
    body: JSON.stringify({
      client_id: OPENAI_OAUTH_CLIENT_ID,
    }),
  })

  await ensureOkResponse(response, "OpenAI device code request failed")
  const payload = (await response.json()) as Record<string, unknown>

  return {
    deviceAuthID: normalizeString(payload.device_auth_id) ?? "",
    userCode: normalizeString(payload.user_code) ?? normalizeString(payload.usercode) ?? "",
    intervalSeconds: parseNumeric(payload.interval) ?? 5,
  }
}

async function pollOpenAIDeviceCode(flowID: string) {
  const flow = flowState.get(flowID)
  if (!flow || !flow.deviceAuthID || !flow.userCode) return

  const timeoutAt = flow.expiresAt ?? now() + OPENAI_FLOW_TIMEOUT_MS

  while (now() < timeoutAt) {
    if (flow.cancelSignal?.signal.aborted) {
      flow.status = "cancelled"
      flow.errorMessage = "Authentication cancelled."
      upsertFlow(flow)
      return
    }

    const response = await fetch(`${OPENAI_DEVICE_AUTH_BASE_URL}/deviceauth/token`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        originator: OPENAI_ORIGINATOR,
        "user-agent": OPENAI_ORIGINATOR,
      },
      body: JSON.stringify({
        device_auth_id: flow.deviceAuthID,
        user_code: flow.userCode,
      }),
      signal: flow.cancelSignal?.signal,
    }).catch((error) => {
      throw error instanceof Error ? error : new Error(String(error))
    })

    if (response.ok) {
      const payload = (await response.json()) as Record<string, unknown>
      const authorizationCode = normalizeString(payload.authorization_code)
      const codeVerifier = normalizeString(payload.code_verifier)
      if (!authorizationCode || !codeVerifier) {
        flow.status = "error"
        flow.errorMessage = "Device authorization response was incomplete."
        upsertFlow(flow)
        await Auth.setProviderLastError(flow.providerID, flow.errorMessage)
        return
      }

      flow.status = "authorizing"
      upsertFlow(flow)

      try {
        const tokens = await exchangeOpenAIAuthorizationCode({
          authorizationCode,
          codeVerifier,
          redirectURI: `${OPENAI_AUTH_ISSUER}/deviceauth/callback`,
        })
        const credential = await saveOpenAITokens(flow.method, tokens)
        flow.status = "connected"
        flow.connectionLabel = connectionLabelForCredential(flow.providerID, flow.method, credential)
        flow.account = summarizeOAuthAccount(credential)
        flow.errorMessage = undefined
        upsertFlow(flow)
      } catch (error) {
        flow.status = "error"
        flow.errorMessage = error instanceof Error ? error.message : String(error)
        upsertFlow(flow)
        await Auth.setProviderLastError(flow.providerID, flow.errorMessage)
      }
      return
    }

    if (response.status !== 403 && response.status !== 404) {
      const payload = await parseJsonResponse(response)
      flow.status = "error"
      flow.errorMessage = errorMessageFromPayload(payload) ?? `Device authorization failed (${response.status}).`
      upsertFlow(flow)
      await Auth.setProviderLastError(flow.providerID, flow.errorMessage)
      return
    }

    await Bun.sleep((flow.intervalSeconds ?? 5) * 1000)
  }

  flow.status = "expired"
  flow.errorMessage = "Device authorization timed out after 15 minutes."
  upsertFlow(flow)
  await Auth.setProviderLastError(flow.providerID, flow.errorMessage)
}

async function startOpenAIDeviceCodeFlow(input: ProviderFlowContext) {
  const capability = getCapability(input.providerID, input.method)
  if (!capability) throw new Error(`Provider '${input.providerID}' does not support auth method '${input.method}'`)

  const deviceCode = await requestOpenAIDeviceCode()
  const flow: InternalFlow = {
    id: createFlowID(),
    providerID: input.providerID,
    method: input.method,
    kind: capability.kind,
    status: "waiting_user",
    startedAt: now(),
    updatedAt: now(),
    expiresAt: now() + OPENAI_FLOW_TIMEOUT_MS,
    verificationURI: OPENAI_DEVICE_AUTH_VERIFICATION_URL,
    userCode: deviceCode.userCode,
    connectionLabel: `Waiting for ${capability.label}`,
    deviceAuthID: deviceCode.deviceAuthID,
    intervalSeconds: deviceCode.intervalSeconds,
    cancelSignal: new AbortController(),
  }

  upsertFlow(flow)
  void pollOpenAIDeviceCode(flow.id).catch(async (error) => {
    const current = flowState.get(flow.id)
    if (!current) return
    current.status = "error"
    current.errorMessage = error instanceof Error ? error.message : String(error)
    upsertFlow(current)
    await Auth.setProviderLastError(current.providerID, current.errorMessage)
  })
  return flowPublicView(flow)
}

export async function startProviderAuthFlow(input: ProviderFlowContext) {
  if (input.providerID === OPENAI_PROVIDER_ID && input.method === "chatgpt-browser") {
    return await startOpenAIBrowserFlow(input)
  }

  if (input.providerID === OPENAI_PROVIDER_ID && input.method === "chatgpt-headless") {
    return await startOpenAIDeviceCodeFlow(input)
  }

  throw new Error(`Provider '${input.providerID}' does not support interactive auth flow '${input.method}'`)
}

export async function getProviderFlow(providerID: string, flowID: string) {
  const flow = flowState.get(flowID)
  if (!flow || flow.providerID !== providerID) return undefined
  return flowPublicView(flow)
}

export async function cancelProviderAuthFlow(providerID: string, flowID: string) {
  const flow = flowState.get(flowID)
  if (!flow || flow.providerID !== providerID) return undefined

  flow.cancelSignal?.abort()
  if (!["connected", "error", "expired", "cancelled"].includes(flow.status)) {
    flow.status = "cancelled"
    flow.errorMessage = "Authentication cancelled."
    clearFlowTimeout(flow)
    upsertFlow(flow)
  }

  await settleOpenAIBrowserFlow(flow)

  return flowPublicView(flow)
}

export async function completeProviderBrowserCallback(input: {
  providerID: string
  url: URL
}) {
  const state = normalizeString(input.url.searchParams.get("state"))
  const code = normalizeString(input.url.searchParams.get("code"))
  const errorCode = normalizeString(input.url.searchParams.get("error"))
  const errorDescription = normalizeString(input.url.searchParams.get("error_description"))

  const flow = Array.from(flowState.values()).find(
    (candidate) =>
      candidate.providerID === input.providerID &&
      candidate.method === "chatgpt-browser" &&
      candidate.state === state,
  )

  if (!flow) {
    return {
      ok: false,
      status: 400,
      title: "Sign-in failed",
      message: "The authentication flow could not be matched. Start the login flow again from the app.",
    }
  }

  if (errorCode) {
    flow.status = "error"
    flow.errorMessage = errorDescription ? `${errorCode}: ${errorDescription}` : errorCode
    clearFlowTimeout(flow)
    upsertFlow(flow)
    await Auth.setProviderLastError(flow.providerID, flow.errorMessage)
    await settleOpenAIBrowserFlow(flow, { deferServerClose: true })
    return {
      ok: false,
      status: 400,
      title: "Sign-in failed",
      message: flow.errorMessage,
    }
  }

  if (!code || !flow.codeVerifier || !flow.redirectURI) {
    flow.status = "error"
    flow.errorMessage = "Missing authorization code."
    clearFlowTimeout(flow)
    upsertFlow(flow)
    await Auth.setProviderLastError(flow.providerID, flow.errorMessage)
    await settleOpenAIBrowserFlow(flow, { deferServerClose: true })
    return {
      ok: false,
      status: 400,
      title: "Sign-in failed",
      message: flow.errorMessage,
    }
  }

  flow.status = "authorizing"
  upsertFlow(flow)

  try {
    const tokens = await exchangeOpenAIAuthorizationCode({
      authorizationCode: code,
      codeVerifier: flow.codeVerifier,
      redirectURI: flow.redirectURI,
    })
    const credential = await saveOpenAITokens(flow.method, tokens)
    flow.status = "connected"
    flow.errorMessage = undefined
    flow.connectionLabel = connectionLabelForCredential(flow.providerID, flow.method, credential)
    flow.account = summarizeOAuthAccount(credential)
    clearFlowTimeout(flow)
    upsertFlow(flow)
    await settleOpenAIBrowserFlow(flow, { deferServerClose: true })

    return {
      ok: true,
      status: 200,
      title: "Sign-in complete",
      message: "You can return to the app. This window can be closed.",
    }
  } catch (error) {
    flow.status = "error"
    flow.errorMessage = error instanceof Error ? error.message : String(error)
    clearFlowTimeout(flow)
    upsertFlow(flow)
    await Auth.setProviderLastError(flow.providerID, flow.errorMessage)
    await settleOpenAIBrowserFlow(flow, { deferServerClose: true })
    return {
      ok: false,
      status: 500,
      title: "Sign-in failed",
      message: flow.errorMessage,
    }
  }
}

export function renderProviderAuthCallbackPage(input: {
  ok: boolean
  title: string
  message?: string
}) {
  const escapedTitle = escapeHtml(input.title)
  const escapedMessage = escapeHtml(input.message ?? "")
  const tone = input.ok ? "#0c7c59" : "#b42318"

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapedTitle}</title>
    <style>
      :root { color-scheme: light dark; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0b1020;
        color: #f5f7fa;
        font: 15px/1.5 ui-sans-serif, system-ui, sans-serif;
      }
      article {
        width: min(480px, calc(100vw - 32px));
        padding: 28px;
        border-radius: 18px;
        background: rgba(14, 21, 40, 0.92);
        border: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: 0 18px 50px rgba(0, 0, 0, 0.28);
      }
      h1 { margin: 0 0 10px; font-size: 22px; }
      p { margin: 0; color: rgba(245, 247, 250, 0.82); }
      .status {
        display: inline-block;
        margin-bottom: 14px;
        padding: 4px 10px;
        border-radius: 999px;
        background: ${tone};
        color: white;
        font-size: 12px;
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <article>
      <span class="status">${input.ok ? "Connected" : "Error"}</span>
      <h1>${escapedTitle}</h1>
      <p>${escapedMessage}</p>
    </article>
  </body>
</html>`
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

export async function saveProviderApiKey(providerID: string, apiKey: string | null | undefined) {
  const normalized = normalizeString(apiKey)
  if (!normalized) {
    await Auth.removeProviderCredential(providerID, "api-key").catch(() => undefined)
    if ((await Auth.getProviderRecord(providerID))?.activeMethod === "api-key") {
      await Auth.setActiveMethod(providerID, null)
    }
    await Auth.setProviderLastError(providerID, null)
    return
  }

  await Auth.setProviderCredential(
    providerID,
    "api-key",
    {
      kind: "api_key",
      apiKey: normalized,
    },
    {
      activate: true,
      lastError: null,
    },
  )
}

export async function deleteProviderSession(providerID: string) {
  const removed = await Auth.removeProviderCredentials(providerID, ({ credential }) => credential.kind === "oauth_session")
  const record = await Auth.getProviderRecord(providerID)
  if (record?.activeMethod && isOpenAIChatGPTMethod(record.activeMethod)) {
    await Auth.setActiveMethod(providerID, "api-key" in record.credentials ? "api-key" : null)
  }
  await Auth.setProviderLastError(providerID, null)
  return removed
}

export async function getProviderAuthState(
  providerID: string,
  fallbacks: ProviderAuthFallbacks = {},
) {
  return await buildProviderAuthState(providerID, fallbacks)
}

export function createDisconnectedProviderAuthState(providerID: string): ProviderAuthState {
  return {
    providerID,
    scope: "global",
    status: "not_connected",
    capabilities: getCapabilities(providerID),
    credentials: [],
  }
}

export async function resolveProviderRuntimeAuth(
  providerID: string,
  fallbacks: ProviderAuthFallbacks = {},
): Promise<ProviderRuntimeAuth> {
  const capabilities = getCapabilities(providerID)
  const record = await Auth.getProviderRecord(providerID)
  const fallback = await buildFallbackCredential(providerID, fallbacks)

  let activeMethod = record?.activeMethod
  let credential = activeMethod ? record?.credentials[activeMethod] : undefined
  let credentialSource: Auth.ProviderCredentialDescriptor["source"] | undefined = credential ? "credential_store" : undefined

  if (!credential && fallback) {
    activeMethod = fallback.method
    credential = fallback.credential
    credentialSource = fallback.source
  }

  if (providerID === OPENAI_PROVIDER_ID && credential?.kind === "oauth_session" && credential.expiresAt <= now() + TOKEN_REFRESH_THRESHOLD_MS) {
    try {
      const refreshed = await refreshOpenAISession(credential)
      if (activeMethod) {
        await Auth.setProviderCredential(providerID, activeMethod, refreshed, {
          activate: true,
          lastError: null,
        })
        credentialSource = "credential_store"
      }
      credential = refreshed
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await Auth.setProviderLastError(providerID, message)
      log.warn("oauth-session-refresh-failed", {
        providerID,
        activeMethod,
        message,
      })
    }
  }

  const authState = await buildProviderAuthState(providerID, fallbacks)

  if (!credential) {
    return {
      authMode: "api",
      authCapabilities: capabilities,
      authState,
    }
  }

  if (credential.kind === "api_key") {
    return {
      credentialKind: credential.kind,
      credentialSource,
      activeMethod,
      apiKey: credential.apiKey,
      authMode: "api",
      authCapabilities: capabilities,
      authState,
    }
  }

  if (providerID === OPENAI_PROVIDER_ID && isOpenAIChatGPTMethod(activeMethod)) {
    const headers: Record<string, string> = {
      originator: credential.originator ?? OPENAI_ORIGINATOR,
      "user-agent": credential.originator ?? OPENAI_ORIGINATOR,
    }

    if (credential.accountID) {
      headers["ChatGPT-Account-ID"] = credential.accountID
    }

    return {
      credentialKind: credential.kind,
      credentialSource,
      activeMethod,
      apiKey: credential.accessToken,
      runtimeBaseURL: OPENAI_CODEX_BASE_URL,
      runtimeHeaders: headers,
      authMode: "codex",
      authCapabilities: capabilities,
      authState,
    }
  }

  return {
    credentialKind: credential.kind,
    credentialSource,
    activeMethod,
    apiKey: credential.accessToken,
    authMode: "api",
    authCapabilities: capabilities,
    authState,
  }
}
