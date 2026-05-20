import * as BusEvent from "#bus/bus-event.ts"
import { getProcessEnvValue } from "#env/compat.ts"
import { Flag } from "#flag/flag.ts"
import { NamedError } from "#util/error.ts"
import z from "zod"

declare global {
  const ANYBOX_VERSION: string
  const ANYBOX_CHANNEL: string
}

export type Method = Awaited<ReturnType<typeof method>>

export const Event = {
  Updated: BusEvent.define(
    "installation.updated",
    z.object({
      version: z.string(),
    }),
  ),
  UpdateAvailable: BusEvent.define(
    "installation.update-available",
    z.object({
      version: z.string(),
    }),
  ),
}

export const Info = z
  .object({
    version: z.string(),
    latest: z.string(),
  })
  .meta({
    ref: "InstallationInfo",
  })
export type Info = z.infer<typeof Info>

export async function info() {
  return {
    version: VERSION,
    latest: await latest(),
  }
}

export function isPreview() {
  return CHANNEL !== "latest"
}

export function isLocal() {
  return CHANNEL === "local"
}

export async function method() {
  return "desktop" as const
}

export const UpgradeFailedError = NamedError.create(
  "UpgradeFailedError",
  z.object({
    stderr: z.string(),
  }),
)

export async function upgrade(_method: Method, _target: string) {
  throw new UpgradeFailedError({
    stderr: "Anybox agent self-upgrade is not available in the desktop runtime. Use the desktop updater instead.",
  })
}

export const VERSION =
  getProcessEnvValue("ANYBOX_VERSION") ?? (typeof ANYBOX_VERSION === "string" ? ANYBOX_VERSION : "local")
export const CHANNEL =
  getProcessEnvValue("ANYBOX_CHANNEL") ?? (typeof ANYBOX_CHANNEL === "string" ? ANYBOX_CHANNEL : "local")
export const USER_AGENT = `anybox/${CHANNEL}/${VERSION}/${Flag.ANYBOX_CLIENT}`

export async function latest() {
  return getProcessEnvValue("ANYBOX_LATEST_VERSION") ?? VERSION
}

