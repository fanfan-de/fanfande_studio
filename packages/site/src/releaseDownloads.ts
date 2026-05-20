export type InstallerPlatform = "windows" | "mac"

export const repositoryUrl = "https://github.com/fanfan-de/anybox_studio"

const latestReleaseApiUrl =
  "https://api.github.com/repos/fanfan-de/anybox_studio/releases/latest"

export const installerFallbackUrls: Record<InstallerPlatform, string> = {
  windows: `${repositoryUrl}/releases/download/v0.1.5/Anybox-0.1.5-x64.exe`,
  mac: `${repositoryUrl}/releases/download/v0.1.5/Anybox-0.1.5-arm64.dmg`,
}

type GitHubReleaseAsset = {
  browser_download_url?: unknown
  name?: unknown
}

type GitHubRelease = {
  assets?: unknown
}

const installerMatchers: Record<
  InstallerPlatform,
  (normalizedName: string) => boolean
> = {
  windows: (normalizedName) =>
    normalizedName.endsWith(".exe") &&
    normalizedName.includes("anybox-studio") &&
    normalizedName.includes("x64"),
  mac: (normalizedName) =>
    normalizedName.endsWith(".dmg") &&
    normalizedName.includes("anybox-studio") &&
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

async function resolveLatestInstallerUrl(platform: InstallerPlatform) {
  const response = await fetch(latestReleaseApiUrl, {
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
    },
  })

  if (!response.ok) {
    throw new Error(`GitHub release request failed: ${response.status}`)
  }

  const downloadUrl = getInstallerUrl(
    (await response.json()) as GitHubRelease,
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
