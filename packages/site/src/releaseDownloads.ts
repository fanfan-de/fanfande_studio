import productPackage from "../../../package.json"

export type InstallerPlatform = "windows" | "mac"

export const repositoryUrl = "https://github.com/fanfan-de/fanfande_studio"

const latestReleaseApiUrl =
  "https://api.github.com/repos/fanfan-de/fanfande_studio/releases/latest"

export const installerFallbackUrls: Record<InstallerPlatform, string> = {
  windows: `${repositoryUrl}/releases/latest`,
  mac: `${repositoryUrl}/releases/latest`,
}

type GitHubReleaseAsset = {
  browser_download_url?: unknown
  name?: unknown
}

type GitHubRelease = {
  assets?: unknown
  tag_name?: unknown
}

let latestReleasePromise: Promise<GitHubRelease> | undefined

function normalizeVersionLabel(version: string) {
  const normalizedVersion = version.trim()

  if (!normalizedVersion) return undefined

  return normalizedVersion.startsWith("v")
    ? normalizedVersion
    : `v${normalizedVersion}`
}

export const currentProductVersion =
  normalizeVersionLabel(productPackage.version) ?? ""

const installerMatchers: Record<
  InstallerPlatform,
  (normalizedName: string) => boolean
> = {
  windows: (normalizedName) =>
    normalizedName.endsWith(".exe") &&
    normalizedName.includes("anybox") &&
    normalizedName.includes("x64"),
  mac: (normalizedName) =>
    normalizedName.endsWith(".dmg") &&
    normalizedName.includes("anybox") &&
    normalizedName.includes("arm64"),
}

function getInstallerUrl(release: GitHubRelease, platform: InstallerPlatform) {
  if (!Array.isArray(release.assets)) return undefined

  const installer = release.assets.find((asset): asset is GitHubReleaseAsset => {
    if (!asset || typeof asset !== "object") return false

    const { browser_download_url: downloadUrl, name } =
      asset as GitHubReleaseAsset

    if (typeof downloadUrl !== "string" || typeof name !== "string") {
      return false
    }

    return installerMatchers[platform](name.toLowerCase())
  })

  return typeof installer?.browser_download_url === "string"
    ? installer.browser_download_url
    : undefined
}

function fetchLatestRelease() {
  if (!latestReleasePromise) {
    latestReleasePromise = fetch(latestReleaseApiUrl, {
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
      },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`GitHub release request failed: ${response.status}`)
        }

        return response.json() as Promise<GitHubRelease>
      })
      .catch((error: unknown) => {
        latestReleasePromise = undefined
        throw error
      })
  }

  return latestReleasePromise
}

export async function resolveLatestReleaseVersion() {
  const release = await fetchLatestRelease()
  const tagName =
    typeof release.tag_name === "string"
      ? normalizeVersionLabel(release.tag_name)
      : undefined

  return tagName ?? currentProductVersion
}

async function resolveLatestInstallerUrl(platform: InstallerPlatform) {
  const release = await fetchLatestRelease()
  const downloadUrl = getInstallerUrl(
    release,
    platform,
  )

  if (!downloadUrl) {
    throw new Error(`No ${platform} installer asset found in latest release`)
  }

  return downloadUrl
}

export async function navigateToLatestInstaller(platform: InstallerPlatform) {
  try {
    window.location.assign(await resolveLatestInstallerUrl(platform))
  } catch {
    window.location.assign(installerFallbackUrls[platform])
  }
}
