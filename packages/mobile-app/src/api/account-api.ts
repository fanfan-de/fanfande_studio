import Constants from "expo-constants"

export const DEFAULT_ACCOUNT_RELAY_BASE_URL = "https://anybox.com.cn"

export interface MobileAccountUser {
  id: string
  email: string
  name?: string
  role?: string
  status?: string
  emailVerifiedAt?: string
  createdAt?: number
}

export interface MobileAccountWorkspace {
  id: string
  name: string
  status?: string
}

export interface MobileAccountSession {
  baseUrl: string
  token: string
  refreshToken: string
  expiresAt?: number
  refreshExpiresAt?: number
  user: MobileAccountUser
  workspace?: MobileAccountWorkspace
  planType?: string
}

export interface MobileAccountRegistration {
  user: MobileAccountUser
  workspace?: MobileAccountWorkspace
  verificationEmailSent?: boolean
  emailVerificationRequired?: boolean
}

interface AccountAuthInput {
  baseUrl: string
  email: string
  password: string
  name?: string
}

type AccountEnvelope<T> =
  | {
      success: true
      data: T
    }
  | {
      success: false
      error?: {
        code?: string
        message?: string
      }
    }

export class AccountApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message)
    this.name = "AccountApiError"
  }
}

export function getDefaultAccountRelayBaseUrl() {
  const configured = readString(readRecord(Constants.expoConfig?.extra)?.anyboxRelayUrl)
  return configured ? normalizeAccountRelayBaseUrl(configured) : DEFAULT_ACCOUNT_RELAY_BASE_URL
}

export function normalizeAccountRelayBaseUrl(value: string) {
  const raw = value.trim()
  if (!raw) throw new Error("Relay URL is required.")
  const candidate = /^[a-z][a-z\d+\-.]*:\/\//i.test(raw) ? raw : `https://${raw}`
  const parsed = new URL(candidate)
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Relay URL must start with https:// or http://.")
  }
  return parsed.origin
}

export async function registerAccountWithEmail(input: AccountAuthInput) {
  const baseUrl = normalizeAccountRelayBaseUrl(input.baseUrl)
  const value = await requestAccount<unknown>(baseUrl, "/api/agent/password/register", {
    method: "POST",
    body: JSON.stringify({
      email: input.email.trim(),
      password: input.password,
      ...(input.name?.trim() ? { name: input.name.trim() } : {}),
    }),
  })
  return normalizeAccountRegistration(value)
}

export async function loginAccountWithEmail(input: AccountAuthInput) {
  const baseUrl = normalizeAccountRelayBaseUrl(input.baseUrl)
  const value = await requestAccount<unknown>(baseUrl, "/api/agent/password/login", {
    method: "POST",
    body: JSON.stringify({
      email: input.email.trim(),
      password: input.password,
      deviceName: "Anybox Mobile",
      clientId: "anybox-agent",
    }),
  })
  return normalizeAccountSession(baseUrl, value)
}

export async function getAccountProfile(baseUrlInput: string, token: string) {
  const baseUrl = normalizeAccountRelayBaseUrl(baseUrlInput)
  const value = await requestAccount<unknown>(baseUrl, "/api/agent/me", {
    headers: {
      authorization: `Bearer ${token}`,
    },
  })
  const record = readRecord(value)
  return {
    user: normalizeAccountUser(record?.user),
    workspace: normalizeAccountWorkspace(record?.workspace),
    planType: readString(readRecord(record?.account)?.planType) ?? readString(readRecord(record?.account)?.plan_type),
  }
}

export async function refreshAccountSession(baseUrlInput: string, refreshToken: string) {
  const baseUrl = normalizeAccountRelayBaseUrl(baseUrlInput)
  const value = await requestAccount<unknown>(baseUrl, "/api/agent/oauth/refresh", {
    method: "POST",
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: "anybox-agent",
      refresh_token: refreshToken,
    }),
  })
  return normalizeAccountSession(baseUrl, value)
}

export async function logoutAccount(baseUrlInput: string, token: string) {
  const baseUrl = normalizeAccountRelayBaseUrl(baseUrlInput)
  await requestAccount<unknown>(baseUrl, "/api/agent/oauth/revoke", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
    },
  })
}

async function requestAccount<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...init?.headers,
    },
  }).catch((error: unknown) => {
    const detail = error instanceof Error && error.message ? ` ${error.message}` : ""
    throw new AccountApiError(`Unable to reach ${baseUrl}.${detail}`, 0)
  })

  const text = await response.text()
  const value = parseJson(text)

  if (!response.ok) {
    const envelope = isAccountEnvelope<unknown>(value) ? value : undefined
    const message = envelope?.success === false ? envelope.error?.message : readErrorMessage(value)
    const code = envelope?.success === false ? envelope.error?.code : readErrorCode(value)
    throw new AccountApiError(message || `Account request failed with HTTP ${response.status}.`, response.status, code)
  }

  if (isAccountEnvelope<T>(value)) {
    if (value.success) return value.data
    throw new AccountApiError(value.error?.message || "Account request failed.", response.status, value.error?.code)
  }

  return value as T
}

function normalizeAccountSession(baseUrl: string, value: unknown): MobileAccountSession {
  const record = readRecord(value)
  const session = readRecord(record?.session)
  const account = readRecord(record?.account)
  const token = readString(record?.accessToken) ?? readString(record?.access_token) ?? readString(record?.token) ?? readString(session?.token)
  const refreshToken = readString(record?.refreshToken) ?? readString(record?.refresh_token)
  const user = normalizeAccountUser(record?.user ?? account)
  const workspace = normalizeAccountWorkspace(record?.workspace ?? account)
  if (!token || !refreshToken || !user) {
    throw new AccountApiError("Account response did not include agent tokens and user.", 0, "INVALID_ACCOUNT_RESPONSE")
  }
  return {
    baseUrl,
    token,
    refreshToken,
    ...(readTimestamp(record?.expiresAt) ? { expiresAt: readTimestamp(record?.expiresAt) } : {}),
    ...(readTimestamp(record?.refreshExpiresAt) ? { refreshExpiresAt: readTimestamp(record?.refreshExpiresAt) } : {}),
    user,
    ...(workspace ? { workspace } : {}),
    ...(readString(account?.planType) ?? readString(account?.plan_type) ? { planType: readString(account?.planType) ?? readString(account?.plan_type) } : {}),
  }
}

function normalizeAccountRegistration(value: unknown): MobileAccountRegistration {
  const record = readRecord(value)
  const account = readRecord(record?.account)
  const user = normalizeAccountUser(record?.user ?? account)
  if (!user) {
    throw new AccountApiError("Registration response did not include a user.", 0, "INVALID_ACCOUNT_RESPONSE")
  }
  const workspace = normalizeAccountWorkspace(record?.workspace ?? account)
  return {
    user,
    ...(workspace ? { workspace } : {}),
    ...(typeof record?.verificationEmailSent === "boolean" ? { verificationEmailSent: record.verificationEmailSent } : {}),
    ...(typeof record?.emailVerificationRequired === "boolean" ? { emailVerificationRequired: record.emailVerificationRequired } : {}),
  }
}

export function normalizeAccountUser(value: unknown): MobileAccountUser | null {
  const record = readRecord(value)
  const email = readString(record?.email)
  if (!email) return null
  const id = readString(record?.id) ?? readString(record?.accountID) ?? readString(record?.account_id) ?? email
  const name = readString(record?.name)
  const role = readString(record?.role)
  const status = readString(record?.status)
  const emailVerifiedAt = readString(record?.emailVerifiedAt) ?? readString(record?.email_verified_at)
  const createdAt = typeof record?.createdAt === "number" ? record.createdAt : undefined
  return {
    id,
    email,
    ...(name ? { name } : {}),
    ...(role ? { role } : {}),
    ...(status ? { status } : {}),
    ...(emailVerifiedAt ? { emailVerifiedAt } : {}),
    ...(createdAt ? { createdAt } : {}),
  }
}

function normalizeAccountWorkspace(value: unknown): MobileAccountWorkspace | null {
  const record = readRecord(value)
  const id = readString(record?.id) ?? readString(record?.workspaceID) ?? readString(record?.workspace_id)
  const name = readString(record?.name) ?? readString(record?.workspaceName) ?? readString(record?.workspace_name)
  if (!id || !name) return null
  const status = readString(record?.status) ?? readString(record?.workspaceStatus) ?? readString(record?.workspace_status)
  return {
    id,
    name,
    ...(status ? { status } : {}),
  }
}

function parseJson(text: string) {
  if (!text.trim()) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function readErrorMessage(value: unknown) {
  const record = readRecord(value)
  const error = readRecord(record?.error)
  return readString(error?.message)
}

function readErrorCode(value: unknown) {
  const record = readRecord(value)
  const error = readRecord(record?.error)
  return readString(error?.code)
}

function isAccountEnvelope<T>(value: unknown): value is AccountEnvelope<T> {
  return Boolean(value && typeof value === "object" && "success" in value)
}

function readRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function readTimestamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  const stringValue = readString(value)
  if (!stringValue) return undefined
  const parsed = Date.parse(stringValue)
  return Number.isFinite(parsed) ? parsed : undefined
}
