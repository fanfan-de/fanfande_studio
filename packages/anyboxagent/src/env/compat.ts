export type EnvRecord = Record<string, string | undefined>

const specialLegacyKeys: Record<string, string[]> = {
  ANYBOX_MODELS_URL: ["OPENCODE_MODELS_URL"],
  ANYBOX_TEST_HOME: ["OPENCODE_TEST_HOME"],
  ANYBOX_VERSION: ["OPENCODE_VERSION"],
  ANYBOX_CHANNEL: ["OPENCODE_CHANNEL"],
}

export function legacyEnvKeys(key: string) {
  const keys = [...(specialLegacyKeys[key] ?? [])]
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

