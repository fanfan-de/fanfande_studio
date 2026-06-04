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

module.exports = () => ({
  ...baseConfig,
  updates: {
    ...baseConfig.updates,
    ...(updateUrl ? { url: updateUrl } : {}),
  },
  extra: {
    ...baseConfig.extra,
    anyboxMobileReleaseUrl: releaseManifestUrl,
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
