const appJson = require("./app.json")

function firstNonEmpty(values) {
  for (const value of values) {
    const stringValue = value == null ? "" : String(value).trim()
    if (stringValue) return stringValue
  }
  return ""
}

const baseConfig = appJson.expo
const appConfigProjectId = firstNonEmpty([baseConfig.extra?.eas?.projectId])
const easProjectId = firstNonEmpty([
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
  process.env.EAS_PROJECT_ID,
  appConfigProjectId,
])
const updateUrl = firstNonEmpty([
  process.env.EXPO_UPDATES_URL,
  baseConfig.updates?.url,
  easProjectId ? `https://u.expo.dev/${easProjectId}` : "",
])
const releaseManifestUrl = firstNonEmpty([
  process.env.EXPO_PUBLIC_ANYBOX_MOBILE_RELEASE_URL,
  baseConfig.extra?.anyboxMobileReleaseUrl,
])
const githubRepository = firstNonEmpty([
  process.env.EXPO_PUBLIC_ANYBOX_MOBILE_GITHUB_REPOSITORY,
  process.env.EXPO_PUBLIC_ANYBOX_MOBILE_GITHUB_REPO,
  baseConfig.extra?.anyboxMobileGitHubRepository,
])
const githubReleaseTagPrefix = firstNonEmpty([
  process.env.EXPO_PUBLIC_ANYBOX_MOBILE_GITHUB_TAG_PREFIX,
  baseConfig.extra?.anyboxMobileGitHubReleaseTagPrefix,
  "mobile-v",
])
const githubApkAssetName = firstNonEmpty([
  process.env.EXPO_PUBLIC_ANYBOX_MOBILE_GITHUB_APK_ASSET_NAME,
  baseConfig.extra?.anyboxMobileGitHubApkAssetName,
  "anybox-mobile.apk",
])
const githubManifestAssetName = firstNonEmpty([
  process.env.EXPO_PUBLIC_ANYBOX_MOBILE_GITHUB_MANIFEST_ASSET_NAME,
  baseConfig.extra?.anyboxMobileGitHubManifestAssetName,
  "anybox-mobile-release.json",
])
const anyboxRelayUrl = firstNonEmpty([
  process.env.EXPO_PUBLIC_ANYBOX_RELAY_URL,
  process.env.EXPO_PUBLIC_ANYBOX_PROVIDER_URL,
  baseConfig.extra?.anyboxRelayUrl,
  "https://anybox.com.cn",
])

module.exports = () => ({
  ...baseConfig,
  updates: {
    ...baseConfig.updates,
    ...(updateUrl ? { url: updateUrl } : {}),
  },
  extra: {
    ...baseConfig.extra,
    anyboxMobileReleaseUrl: releaseManifestUrl,
    anyboxMobileGitHubRepository: githubRepository,
    anyboxMobileGitHubReleaseTagPrefix: githubReleaseTagPrefix,
    anyboxMobileGitHubApkAssetName: githubApkAssetName,
    anyboxMobileGitHubManifestAssetName: githubManifestAssetName,
    anyboxRelayUrl,
    ...(easProjectId
      ? {
          eas: {
            ...(baseConfig.extra?.eas ?? {}),
            projectId: easProjectId,
          },
        }
      : {}),
  },
})
