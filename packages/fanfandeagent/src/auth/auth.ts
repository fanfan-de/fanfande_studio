import fs from "fs/promises"
import path from "path"
import z from "zod"
import * as Global from "#global/global.ts"
import * as Filesystem from "#util/filesystem.ts"

const filepath = path.join(Global.Path.data, "auth.json")
const STORE_VERSION = 2

export const ApiKeyCredential = z
  .object({
    kind: z.literal("api_key"),
    apiKey: z.string().min(1),
    createdAt: z.number().optional(),
    updatedAt: z.number().optional(),
    label: z.string().optional(),
  })
  .meta({ ref: "ApiKeyCredential" })
export type ApiKeyCredential = z.infer<typeof ApiKeyCredential>

export const OAuthSessionCredential = z
  .object({
    kind: z.literal("oauth_session"),
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
    expiresAt: z.number(),
    tokenType: z.string().optional(),
    idToken: z.string().optional(),
    scope: z.string().optional(),
    accountID: z.string().optional(),
    userID: z.string().optional(),
    email: z.string().optional(),
    planType: z.string().optional(),
    workspaceID: z.string().optional(),
    workspaceName: z.string().optional(),
    originator: z.string().optional(),
    createdAt: z.number().optional(),
    updatedAt: z.number().optional(),
  })
  .meta({ ref: "OAuthSessionCredential" })
export type OAuthSessionCredential = z.infer<typeof OAuthSessionCredential>

export const CredentialRecord = z.discriminatedUnion("kind", [ApiKeyCredential, OAuthSessionCredential]).meta({
  ref: "CredentialRecord",
})
export type CredentialRecord = z.infer<typeof CredentialRecord>

export const ProviderCredentialDescriptor = z
  .object({
    method: z.string().min(1),
    kind: z.enum(["api_key", "oauth_session"]),
    source: z.enum(["credential_store", "legacy_config", "environment", "external_cache"]).default("credential_store"),
    configured: z.boolean(),
    expiresAt: z.number().optional(),
    label: z.string().optional(),
    email: z.string().optional(),
    planType: z.string().optional(),
    workspaceID: z.string().optional(),
    workspaceName: z.string().optional(),
  })
  .meta({ ref: "ProviderCredentialDescriptor" })
export type ProviderCredentialDescriptor = z.infer<typeof ProviderCredentialDescriptor>

export const ProviderAuthRecord = z
  .object({
    activeMethod: z.string().min(1).nullable().optional(),
    credentials: z.record(z.string(), CredentialRecord).default({}),
    lastError: z.string().nullable().optional(),
    updatedAt: z.number().optional(),
  })
  .meta({ ref: "ProviderAuthRecord" })
export type ProviderAuthRecord = z.infer<typeof ProviderAuthRecord>

export const CredentialStoreFile = z
  .object({
    version: z.literal(STORE_VERSION),
    providers: z.record(z.string(), ProviderAuthRecord).default({}),
  })
  .meta({ ref: "CredentialStoreFile" })
export type CredentialStoreFile = z.infer<typeof CredentialStoreFile>

const LegacyOauth = z.object({
  type: z.literal("oauth"),
  refresh: z.string(),
  access: z.string(),
  expires: z.number(),
  accountId: z.string().optional(),
  enterpriseUrl: z.string().optional(),
})

const LegacyApi = z.object({
  type: z.literal("api"),
  key: z.string(),
})

const LegacyWellKnown = z.object({
  type: z.literal("wellknown"),
  key: z.string(),
  token: z.string(),
})

const LegacyInfo = z.discriminatedUnion("type", [LegacyOauth, LegacyApi, LegacyWellKnown])

function descriptorFromCredential(
  method: string,
  credential: CredentialRecord,
  source: ProviderCredentialDescriptor["source"] = "credential_store",
): ProviderCredentialDescriptor {
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
    label: credential.email ?? credential.workspaceName ?? credential.planType,
    email: credential.email,
    planType: credential.planType,
    workspaceID: credential.workspaceID,
    workspaceName: credential.workspaceName,
  }
}

function migrateLegacyStore(raw: Record<string, unknown>): CredentialStoreFile {
  const providers: Record<string, ProviderAuthRecord> = {}

  for (const [providerID, value] of Object.entries(raw)) {
    const parsed = LegacyInfo.safeParse(value)
    if (!parsed.success) continue

    if (parsed.data.type === "oauth") {
      providers[providerID] = {
        activeMethod: "oauth",
        credentials: {
          oauth: {
            kind: "oauth_session",
            accessToken: parsed.data.access,
            refreshToken: parsed.data.refresh,
            expiresAt: parsed.data.expires,
            accountID: parsed.data.accountId,
          },
        },
      }
      continue
    }

    providers[providerID] = {
      activeMethod: "api-key",
      credentials: {
        "api-key": {
          kind: "api_key",
          apiKey: parsed.data.key,
        },
      },
    }
  }

  return {
    version: STORE_VERSION,
    providers,
  }
}

async function readRawStore(): Promise<CredentialStoreFile> {
  const raw = await Filesystem.readJson<Record<string, unknown>>(filepath).catch(() => undefined)
  if (!raw) {
    return {
      version: STORE_VERSION,
      providers: {},
    }
  }

  const next = CredentialStoreFile.safeParse(raw)
  if (next.success) return next.data

  return migrateLegacyStore(raw)
}

async function writeStore(store: CredentialStoreFile) {
  await fs.mkdir(path.dirname(filepath), { recursive: true })
  const file = Bun.file(filepath)
  await Bun.write(file, JSON.stringify(store, null, 2))
  await fs.chmod(filepath, 0o600).catch(() => undefined)
}

export async function getStore(): Promise<CredentialStoreFile> {
  return await readRawStore()
}

export async function listProviders() {
  const store = await getStore()
  return Object.keys(store.providers)
}

export async function getProviderRecord(providerID: string): Promise<ProviderAuthRecord | undefined> {
  const store = await getStore()
  return store.providers[providerID]
}

export async function getProviderCredential(
  providerID: string,
  method: string,
): Promise<CredentialRecord | undefined> {
  const record = await getProviderRecord(providerID)
  return record?.credentials[method]
}

export async function getActiveProviderCredential(providerID: string): Promise<
  | {
      method: string
      credential: CredentialRecord
    }
  | undefined
> {
  const record = await getProviderRecord(providerID)
  if (!record?.activeMethod) return undefined

  const credential = record.credentials[record.activeMethod]
  if (!credential) return undefined

  return {
    method: record.activeMethod,
    credential,
  }
}

export async function listCredentialDescriptors(providerID: string): Promise<ProviderCredentialDescriptor[]> {
  const record = await getProviderRecord(providerID)
  if (!record) return []

  return Object.entries(record.credentials).map(([method, credential]) => descriptorFromCredential(method, credential))
}

export async function setProviderCredential(
  providerID: string,
  method: string,
  credential: CredentialRecord,
  options: {
    activate?: boolean
    lastError?: string | null
  } = {},
) {
  const store = await getStore()
  const current = store.providers[providerID] ?? {
    activeMethod: null,
    credentials: {},
  }
  const timestamp = Date.now()
  const nextCredential =
    credential.kind === "api_key"
      ? {
          ...credential,
          createdAt: credential.createdAt ?? timestamp,
          updatedAt: timestamp,
        }
      : {
          ...credential,
          createdAt: credential.createdAt ?? timestamp,
          updatedAt: timestamp,
        }

  store.providers[providerID] = {
    ...current,
    credentials: {
      ...current.credentials,
      [method]: nextCredential,
    },
    activeMethod: options.activate === false ? current.activeMethod ?? null : method,
    lastError: options.lastError ?? current.lastError ?? null,
    updatedAt: timestamp,
  }

  await writeStore(store)
  return store.providers[providerID]
}

export async function setActiveMethod(providerID: string, method: string | null) {
  const store = await getStore()
  const current = store.providers[providerID]
  if (!current) return undefined

  store.providers[providerID] = {
    ...current,
    activeMethod: method,
    updatedAt: Date.now(),
  }

  await writeStore(store)
  return store.providers[providerID]
}

export async function setProviderLastError(providerID: string, message?: string | null) {
  const store = await getStore()
  const current = store.providers[providerID] ?? {
    activeMethod: null,
    credentials: {},
  }

  store.providers[providerID] = {
    ...current,
    lastError: message ?? null,
    updatedAt: Date.now(),
  }

  await writeStore(store)
  return store.providers[providerID]
}

export async function removeProviderCredential(providerID: string, method: string) {
  const store = await getStore()
  const current = store.providers[providerID]
  if (!current) return false

  if (!(method in current.credentials)) return false

  const nextCredentials = { ...current.credentials }
  delete nextCredentials[method]

  const nextActiveMethod =
    current.activeMethod === method ? Object.keys(nextCredentials)[0] ?? null : current.activeMethod ?? null

  if (Object.keys(nextCredentials).length === 0 && !current.lastError) {
    delete store.providers[providerID]
  } else {
    store.providers[providerID] = {
      ...current,
      credentials: nextCredentials,
      activeMethod: nextActiveMethod,
      updatedAt: Date.now(),
    }
  }

  await writeStore(store)
  return true
}

export async function removeProviderCredentials(
  providerID: string,
  predicate?: (entry: { method: string; credential: CredentialRecord }) => boolean,
) {
  const store = await getStore()
  const current = store.providers[providerID]
  if (!current) return false

  const nextCredentials = Object.fromEntries(
    Object.entries(current.credentials).filter(([method, credential]) => {
      if (!predicate) return false
      return !predicate({ method, credential })
    }),
  )

  const removedCount = Object.keys(current.credentials).length - Object.keys(nextCredentials).length
  if (removedCount === 0) return false

  const nextActiveMethod =
    current.activeMethod && current.activeMethod in nextCredentials ? current.activeMethod : Object.keys(nextCredentials)[0] ?? null

  if (Object.keys(nextCredentials).length === 0 && !current.lastError) {
    delete store.providers[providerID]
  } else {
    store.providers[providerID] = {
      ...current,
      credentials: nextCredentials,
      activeMethod: nextActiveMethod,
      updatedAt: Date.now(),
    }
  }

  await writeStore(store)
  return true
}

export async function clearProvider(providerID: string) {
  const store = await getStore()
  if (!(providerID in store.providers)) return false
  delete store.providers[providerID]
  await writeStore(store)
  return true
}

export async function clearAll() {
  await writeStore({
    version: STORE_VERSION,
    providers: {},
  })
}
