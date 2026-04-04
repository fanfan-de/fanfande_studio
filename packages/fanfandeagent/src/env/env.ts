import { Instance } from "#project/instance.ts"

const globalEnv = { ...process.env } as Record<string, string | undefined>
const state = Instance.state(() => {
  // Create a shallow copy to isolate environment per instance
  // Prevents parallel tests from interfering with each other's env vars
  return { ...process.env } as Record<string, string | undefined>
})

function currentEnv() {
  try {
    return state()
  } catch {
    return globalEnv
  }
}

export function get(key: string) {
  const env = currentEnv()
  return env[key]
}

export function all() {
  return currentEnv()
}

export function set(key: string, value: string) {
  const env = currentEnv()
  env[key] = value
}

export function remove(key: string) {
  const env = currentEnv()
  delete env[key]
}

