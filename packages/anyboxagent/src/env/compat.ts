export type EnvRecord = Record<string, string | undefined>

const specialLegacyKeys: Record<string, string[]> = {
  ANYBOX_BASE_URL: ["FANFANDE_ANYBOX_BASE_URL", "FanFande_ANYBOX_BASE_URL"],
  ANYBOX_CLIENT_ID: ["FANFANDE_ANYBOX_CLIENT_ID", "FanFande_ANYBOX_CLIENT_ID"],
  ANYBOX_PROXY_URL: ["FANFANDE_ANYBOX_PROXY_URL", "FanFande_ANYBOX_PROXY_URL"],
  ANYBOX_MODELS_URL: ["OPENCODE_MODELS_URL"],
  ANYBOX_TEST_HOME: ["OPENCODE_TEST_HOME"],
  ANYBOX_VERSION: ["OPENCODE_VERSION"],
  ANYBOX_CHANNEL: ["OPENCODE_CHANNEL"],
}

export function legacyEnvKeys(key: string) {
  const keys = [...(specialLegacyKeys[key] ?? [])]
  if (key.startsWith("ANYBOX_")) {
    const suffix = key.slice("ANYBOX_".length)
    keys.push(`FANFANDE_${suffix}`, `FanFande_${suffix}`)
  }

  return [...new Set(keys.filter((item) => item !== key))]
}

export function getEnvValue(env: EnvRecord, key: string) {
  for (const candidate of [key, ...legacyEnvKeys(key)]) {
    const value = env[candidate]
    if (value !== undefined) return value
  }
  return undefined
}

export function getProcessEnvValue(key: string) {
  return getEnvValue(process.env, key)
}

