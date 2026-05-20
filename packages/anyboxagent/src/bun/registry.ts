import * as Log from "#util/log.ts"

const log = Log.create({ service: "bun.registry" })

function trimResult(value: string) {
  const trimmed = value.trim()
  return trimmed || undefined
}

function mergeEnv(overrides?: Record<string, string | undefined>) {
  const env: Record<string, string> = {}

  for (const [key, value] of Object.entries({
    ...process.env,
    ...overrides,
  })) {
    if (typeof value === "string") {
      env[key] = value
    }
  }

  return env
}

function isRange(version: string) {
  return /[\^~*xX<>=|]/.test(version)
}

export namespace PackageRegistry {
  export async function info(pkg: string, field: string) {
    const proc = Bun.spawn([process.execPath, "info", pkg, field], {
      env: mergeEnv({
        BUN_BE_BUN: "1",
      }),
      stdout: "pipe",
      stderr: "pipe",
    })

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    if (exitCode !== 0) {
      log.warn("bun info failed", {
        pkg,
        field,
        exitCode,
        stderr: trimResult(stderr),
      })
      return undefined
    }

    return trimResult(stdout)
  }

  export async function isOutdated(pkg: string, cachedVersion: string) {
    const latest = await info(pkg, "latest")
    if (!latest) return false

    if (isRange(cachedVersion)) {
      const outdated = !Bun.semver.satisfies(latest, cachedVersion)
      log.info("checked package range", {
        pkg,
        cachedVersion,
        latest,
        outdated,
      })
      return outdated
    }

    const outdated = Bun.semver.order(latest, cachedVersion) > 0
    log.info("checked package version", {
      pkg,
      cachedVersion,
      latest,
      outdated,
    })
    return outdated
  }
}
