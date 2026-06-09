export function readDesktopEnv(key: string, env: NodeJS.ProcessEnv = process.env) {
  return env[key]
}

export function readTrimmedDesktopEnv(key: string, env: NodeJS.ProcessEnv = process.env) {
  return readDesktopEnv(key, env)?.trim()
}
