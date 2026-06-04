import Constants from "expo-constants"
import * as Updates from "expo-updates"
import { Linking, Platform } from "react-native"

export interface CurrentAppInfo {
  version: string
  buildVersion: string | null
  platform: string
  channel: string | null
  runtimeVersion: string | null
  updateId: string | null
  updatesEnabled: boolean
  releaseManifestUrl: string | null
}

export interface OtaUpdateCheck {
  checked: boolean
  enabled: boolean
  available: boolean
  channel: string | null
  runtimeVersion: string | null
  updateId: string | null
  message: string
  error?: string
}

export interface BinaryRelease {
  version: string
  buildVersion: string | null
  minimumVersion: string | null
  minimumBuildVersion: string | null
  downloadUrl: string
  releaseNotes: string[]
  publishedAt?: string
  sha256?: string
  sizeBytes?: number
  force: boolean
}

export interface BinaryUpdateCheck {
  checked: boolean
  configured: boolean
  available: boolean
  required: boolean
  release: BinaryRelease | null
  message: string
  error?: string
}

export interface AppUpdateCheckResult {
  checkedAt: number
  current: CurrentAppInfo
  ota: OtaUpdateCheck
  binary: BinaryUpdateCheck
}

interface CheckAppUpdatesOptions {
  includeOta?: boolean
  includeBinary?: boolean
}

const DEFAULT_RELEASE_TIMEOUT_MS = 12_000

export function getCurrentAppInfo(): CurrentAppInfo {
  const constants = Constants as unknown as Record<string, unknown>
  const nativeVersion = readString(constants.nativeAppVersion)
  const nativeBuildVersion = readString(constants.nativeBuildVersion)
  const platform = readRecord(Constants.platform)
  const android = readRecord(platform?.android)
  const androidVersionCode = readNumber(android?.versionCode)
  const expoVersion = readString(Constants.expoConfig?.version)

  return {
    version: nativeVersion ?? expoVersion ?? "0.1.0",
    buildVersion: nativeBuildVersion ?? (androidVersionCode === null ? null : String(androidVersionCode)),
    platform: Platform.OS,
    channel: Updates.channel,
    runtimeVersion: Updates.runtimeVersion,
    updateId: Updates.updateId,
    updatesEnabled: Updates.isEnabled,
    releaseManifestUrl: getReleaseManifestUrl(),
  }
}

export function formatAppVersionLabel(info: CurrentAppInfo) {
  return info.buildVersion ? `${info.version} (${info.buildVersion})` : info.version
}

export async function checkAppUpdates(options: CheckAppUpdatesOptions = {}): Promise<AppUpdateCheckResult> {
  const current = getCurrentAppInfo()
  const includeOta = options.includeOta ?? true
  const includeBinary = options.includeBinary ?? true
  const [ota, binary] = await Promise.all([
    includeOta ? checkOtaUpdate() : Promise.resolve(createSkippedOtaUpdateCheck()),
    includeBinary ? checkBinaryUpdate(current) : Promise.resolve(createSkippedBinaryUpdateCheck()),
  ])

  return {
    checkedAt: Date.now(),
    current,
    ota,
    binary,
  }
}

export async function downloadOtaUpdateAndReload() {
  if (!Updates.isEnabled) {
    throw new Error("OTA updates are not enabled in this build.")
  }

  const result = await Updates.fetchUpdateAsync()
  if (!result.isNew && !result.isRollBackToEmbedded) {
    throw new Error("No downloaded update is ready to apply.")
  }

  await Updates.reloadAsync()
}

export async function openBinaryRelease(release: BinaryRelease) {
  await Linking.openURL(release.downloadUrl)
}

async function checkOtaUpdate(): Promise<OtaUpdateCheck> {
  const base = {
    checked: true,
    enabled: Updates.isEnabled,
    channel: Updates.channel,
    runtimeVersion: Updates.runtimeVersion,
    updateId: Updates.updateId,
  }

  if (!Updates.isEnabled) {
    return {
      ...base,
      available: false,
      message: "OTA updates are not enabled in this build.",
    }
  }

  try {
    const update = await Updates.checkForUpdateAsync()
    return {
      ...base,
      available: update.isAvailable,
      message: update.isAvailable ? "A JavaScript update is available." : "No OTA update is available.",
    }
  } catch (error) {
    return {
      ...base,
      available: false,
      error: error instanceof Error ? error.message : "Unable to check OTA updates.",
      message: "Unable to check OTA updates.",
    }
  }
}

async function checkBinaryUpdate(current: CurrentAppInfo): Promise<BinaryUpdateCheck> {
  const manifestUrl = current.releaseManifestUrl
  if (!manifestUrl) {
    return {
      checked: false,
      configured: false,
      available: false,
      required: false,
      release: null,
      message: "APK release manifest is not configured.",
    }
  }

  try {
    const release = await fetchBinaryRelease(manifestUrl)
    const required = isBinaryReleaseRequired(release, current)
    const available = required || isBinaryReleaseNewer(release, current)
    return {
      checked: true,
      configured: true,
      available,
      required,
      release: available ? release : null,
      message: available ? "A native app update is available." : "No native app update is available.",
    }
  } catch (error) {
    return {
      checked: true,
      configured: true,
      available: false,
      required: false,
      release: null,
      error: error instanceof Error ? error.message : "Unable to check native app updates.",
      message: "Unable to check native app updates.",
    }
  }
}

async function fetchBinaryRelease(manifestUrl: string): Promise<BinaryRelease> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_RELEASE_TIMEOUT_MS)

  try {
    const response = await fetch(manifestUrl, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Release manifest request failed with HTTP ${response.status}.`)
    }

    return normalizeBinaryRelease(await response.json())
  } finally {
    clearTimeout(timeout)
  }
}

function normalizeBinaryRelease(value: unknown): BinaryRelease {
  const root = readRecord(value)
  if (!root) throw new Error("Release manifest must be a JSON object.")

  const platformRecord = readRecord(root[Platform.OS]) ?? readRecord(readRecord(root.platforms)?.[Platform.OS])
  const source = {
    ...root,
    ...(platformRecord ?? {}),
  }

  const version = readString(source.version)
  const versionCode = readNumber(source.versionCode)
  const buildNumber = readString(source.buildNumber)
  const buildVersion = buildNumber ?? (versionCode === null ? null : String(versionCode))
  const minimumVersion = readString(source.minimumVersion) ?? readString(source.minVersion)
  const minimumVersionCode = readNumber(source.minimumVersionCode) ?? readNumber(source.minVersionCode)
  const minimumBuildNumber = readString(source.minimumBuildNumber) ?? readString(source.minimumBuildVersion)
  const minimumBuildVersion = minimumBuildNumber ?? (minimumVersionCode === null ? null : String(minimumVersionCode))
  const downloadUrl =
    readString(source.apkUrl) ?? readString(source.downloadUrl) ?? readString(source.url) ?? readString(source.storeUrl)

  if (!version) throw new Error("Release manifest is missing version.")
  if (!downloadUrl) throw new Error("Release manifest is missing a download URL.")

  return {
    version,
    buildVersion,
    minimumVersion,
    minimumBuildVersion,
    downloadUrl,
    releaseNotes: readReleaseNotes(source.notes ?? source.releaseNotes),
    publishedAt: readString(source.publishedAt) ?? undefined,
    sha256: readString(source.sha256) ?? undefined,
    sizeBytes: readNumber(source.sizeBytes) ?? undefined,
    force: source.force === true,
  }
}

function isBinaryReleaseNewer(release: BinaryRelease, current: CurrentAppInfo) {
  const buildComparison = compareBuildVersions(release.buildVersion, current.buildVersion)
  if (buildComparison !== null) return buildComparison > 0
  return compareVersions(release.version, current.version) > 0
}

function isBinaryReleaseRequired(release: BinaryRelease, current: CurrentAppInfo) {
  if (release.force) return true

  const buildComparison = compareBuildVersions(release.minimumBuildVersion, current.buildVersion)
  if (buildComparison !== null) return buildComparison > 0

  if (!release.minimumVersion) return false
  return compareVersions(release.minimumVersion, current.version) > 0
}

function compareBuildVersions(left: string | null, right: string | null) {
  if (!left || !right) return null
  const leftNumber = Number(left)
  const rightNumber = Number(right)
  if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) return null
  return Math.sign(leftNumber - rightNumber)
}

function compareVersions(left: string, right: string) {
  const leftParts = tokenizeVersion(left)
  const rightParts = tokenizeVersion(right)
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0
    const rightPart = rightParts[index] ?? 0
    if (leftPart > rightPart) return 1
    if (leftPart < rightPart) return -1
  }

  return 0
}

function tokenizeVersion(value: string) {
  return value
    .trim()
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part))
}

function getReleaseManifestUrl() {
  const fromEnvironment = process.env.EXPO_PUBLIC_ANYBOX_MOBILE_RELEASE_URL?.trim()
  const fromConfig = readString(readRecord(Constants.expoConfig?.extra)?.anyboxMobileReleaseUrl)
  return fromEnvironment || fromConfig || null
}

function createSkippedOtaUpdateCheck(): OtaUpdateCheck {
  return {
    checked: false,
    enabled: Updates.isEnabled,
    available: false,
    channel: Updates.channel,
    runtimeVersion: Updates.runtimeVersion,
    updateId: Updates.updateId,
    message: "OTA update check was skipped.",
  }
}

function createSkippedBinaryUpdateCheck(): BinaryUpdateCheck {
  return {
    checked: false,
    configured: Boolean(getReleaseManifestUrl()),
    available: false,
    required: false,
    release: null,
    message: "Native app update check was skipped.",
  }
}

function readReleaseNotes(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => readString(item)).filter((item): item is string => Boolean(item))
  }
  const text = readString(value)
  return text ? [text] : []
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value !== "string" || !value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
