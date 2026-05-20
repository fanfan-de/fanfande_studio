const legacyDesktopEnvAliases: Record<string, string[]> = {
  ANYBOX_AGENT_BASE_URL: ["FANFANDE_AGENT_BASE_URL"],
  ANYBOX_AGENT_WORKDIR: ["FANFANDE_AGENT_WORKDIR"],
  ANYBOX_DISABLE_MANAGED_AGENT: ["FANFANDE_DISABLE_MANAGED_AGENT"],
  ANYBOX_AGENT_RUNTIME_DIR: ["FANFANDE_AGENT_RUNTIME_DIR"],
  ANYBOX_BUN_BINARY: ["FANFANDE_BUN_BINARY"],
  ANYBOX_AGENT_DATA_DIR: ["FANFANDE_AGENT_DATA_DIR"],
  ANYBOX_WORKSPACE_DEPENDENCIES_DIR: ["FANFANDE_WORKSPACE_DEPENDENCIES_DIR"],
  ANYBOX_WORKSPACE_DEPENDENCIES_VERSION: ["FANFANDE_WORKSPACE_DEPENDENCIES_VERSION"],
  ANYBOX_MONITOR_URL: ["FANFANDE_MONITOR_URL"],
  ANYBOX_FORCE_UPDATE_CHECK: ["FANFANDE_FORCE_UPDATE_CHECK"],
}

function legacyEnvKeys(key: string) {
  const keys = [...(legacyDesktopEnvAliases[key] ?? [])]
  if (key.startsWith("ANYBOX_")) {
    keys.push(`FANFANDE_${key.slice("ANYBOX_".length)}`)
  }
  return [...new Set(keys.filter((item) => item !== key))]
}

export function readDesktopEnv(key: string, env: NodeJS.ProcessEnv = process.env) {
  for (const candidate of [key, ...legacyEnvKeys(key)]) {
    const value = env[candidate]
    if (value !== undefined) return value
  }
  return undefined
}

export function readTrimmedDesktopEnv(key: string, env: NodeJS.ProcessEnv = process.env) {
  return readDesktopEnv(key, env)?.trim()
}
