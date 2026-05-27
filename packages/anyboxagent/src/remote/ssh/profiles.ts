import fs from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import z from "zod"
import * as Auth from "#auth/auth.ts"
import * as Global from "#global/global.ts"
import * as Filesystem from "#util/filesystem.ts"

const STORE_VERSION = 1
const PASSPHRASE_METHOD = "private-key-passphrase"

const filepath = path.join(Global.Path.data, "ssh-profiles.json")

export const SshProfile = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  host: z.string().min(1),
  port: z.number().int().positive().max(65535).default(22),
  username: z.string().min(1),
  privateKeyPath: z.string().min(1),
  defaultRemotePath: z.string().min(1).default("/"),
  createdAt: z.number(),
  updatedAt: z.number(),
  lastConnectedAt: z.number().optional(),
})
export type SshProfile = z.infer<typeof SshProfile>

const SshProfileStore = z.object({
  version: z.literal(STORE_VERSION),
  profiles: z.array(SshProfile).default([]),
})
type SshProfileStore = z.infer<typeof SshProfileStore>

export const SshProfileInput = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  host: z.string().min(1),
  port: z.number().int().positive().max(65535).optional(),
  username: z.string().min(1),
  privateKeyPath: z.string().min(1),
  defaultRemotePath: z.string().min(1).optional(),
  passphrase: z.string().optional().nullable(),
})
export type SshProfileInput = z.infer<typeof SshProfileInput>

export interface SshProfileSummary extends SshProfile {
  hasPassphrase: boolean
}

function profileProviderID(profileID: string) {
  return `ssh:${profileID}`
}

async function readStore(): Promise<SshProfileStore> {
  const raw = await Filesystem.readJson<Record<string, unknown>>(filepath).catch(() => undefined)
  if (!raw) return { version: STORE_VERSION, profiles: [] }

  const parsed = SshProfileStore.safeParse(raw)
  if (parsed.success) return parsed.data

  return { version: STORE_VERSION, profiles: [] }
}

async function writeStore(store: SshProfileStore) {
  await fs.mkdir(path.dirname(filepath), { recursive: true })
  await Bun.write(Bun.file(filepath), JSON.stringify(store, null, 2))
  await fs.chmod(filepath, 0o600).catch(() => undefined)
}

async function withPassphraseSummary(profile: SshProfile): Promise<SshProfileSummary> {
  const credential = await Auth.getProviderCredential(profileProviderID(profile.id), PASSPHRASE_METHOD)
  return {
    ...profile,
    hasPassphrase: credential?.kind === "api_key" && Boolean(credential.apiKey),
  }
}

export async function listProfiles(): Promise<SshProfileSummary[]> {
  const store = await readStore()
  return Promise.all(store.profiles.map(withPassphraseSummary))
}

export async function getProfile(profileID: string): Promise<SshProfile | undefined> {
  const store = await readStore()
  return store.profiles.find((profile) => profile.id === profileID)
}

export async function getProfilePassphrase(profileID: string): Promise<string | undefined> {
  const credential = await Auth.getProviderCredential(profileProviderID(profileID), PASSPHRASE_METHOD)
  if (credential?.kind !== "api_key") return undefined
  return credential.apiKey
}

export async function saveProfile(input: SshProfileInput): Promise<SshProfileSummary> {
  const store = await readStore()
  const now = Date.now()
  const id = input.id ?? `ssh-${randomUUID()}`
  const existing = store.profiles.find((profile) => profile.id === id)
  const profile: SshProfile = {
    id,
    name: input.name.trim(),
    host: input.host.trim(),
    port: input.port ?? existing?.port ?? 22,
    username: input.username.trim(),
    privateKeyPath: input.privateKeyPath.trim(),
    defaultRemotePath: input.defaultRemotePath?.trim() || existing?.defaultRemotePath || "/",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastConnectedAt: existing?.lastConnectedAt,
  }

  const nextProfiles = existing
    ? store.profiles.map((candidate) => (candidate.id === id ? profile : candidate))
    : [...store.profiles, profile]
  await writeStore({ version: STORE_VERSION, profiles: nextProfiles })

  if (input.passphrase === null) {
    await Auth.removeProviderCredential(profileProviderID(id), PASSPHRASE_METHOD)
  } else if (typeof input.passphrase === "string" && input.passphrase.length > 0) {
    await Auth.setProviderCredential(
      profileProviderID(id),
      PASSPHRASE_METHOD,
      {
        kind: "api_key",
        apiKey: input.passphrase,
        label: "SSH private key passphrase",
      },
      { activate: false },
    )
  }

  return withPassphraseSummary(profile)
}

export async function deleteProfile(profileID: string) {
  const store = await readStore()
  const nextProfiles = store.profiles.filter((profile) => profile.id !== profileID)
  await writeStore({ version: STORE_VERSION, profiles: nextProfiles })
  await Auth.clearProvider(profileProviderID(profileID))
  return { profileID, removed: nextProfiles.length !== store.profiles.length }
}

export async function markProfileConnected(profileID: string) {
  const store = await readStore()
  const now = Date.now()
  const nextProfiles = store.profiles.map((profile) =>
    profile.id === profileID ? { ...profile, lastConnectedAt: now, updatedAt: now } : profile,
  )
  await writeStore({ version: STORE_VERSION, profiles: nextProfiles })
}
