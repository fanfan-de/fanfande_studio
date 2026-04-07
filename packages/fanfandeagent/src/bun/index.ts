import fs from "fs/promises"
import path from "path"
import { createRequire } from "module"
import { pathToFileURL } from "url"
import z from "zod"
import { NamedError } from "#util/error.ts"
import * as Global from "#global/global.ts"
import * as Lock from "#util/lock.ts"
import * as Log from "#util/log.ts"
import { PackageRegistry } from "#bun/registry.ts"

const log = Log.create({ service: "bun" })
const cacheDir = path.join(Global.Path.cache, "runtime-node_modules")
const packageJSONPath = path.join(cacheDir, "package.json")
const installLockKey = `bun.install:${cacheDir}`

type CachePackageJSON = {
  name: string
  private: boolean
  type: "module"
  dependencies: Record<string, string>
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

function proxied() {
  const env = process.env
  return Boolean(
    env.HTTPS_PROXY ||
      env.HTTP_PROXY ||
      env.ALL_PROXY ||
      env.https_proxy ||
      env.http_proxy ||
      env.all_proxy,
  )
}

function isRange(version: string) {
  return /[\^~*xX<>=|]/.test(version)
}

function normalizeVersion(version?: string) {
  const trimmed = version?.trim()
  return trimmed || "latest"
}

function installTarget(pkg: string, version: string) {
  return version === "latest" ? pkg : `${pkg}@${version}`
}

function packageRoot(pkg: string) {
  return path.join(cacheDir, "node_modules", ...pkg.split("/"))
}

function createCachePackageJSON(): CachePackageJSON {
  return {
    name: "fanfandeagent-runtime-cache",
    private: true,
    type: "module",
    dependencies: {},
  }
}

async function ensureCacheProject() {
  await fs.mkdir(cacheDir, { recursive: true })

  const exists = await Bun.file(packageJSONPath)
    .exists()
    .catch(() => false)

  if (!exists) {
    await Bun.write(Bun.file(packageJSONPath), JSON.stringify(createCachePackageJSON(), null, 2) + "\n")
  }
}

async function readCachePackageJSON(): Promise<CachePackageJSON> {
  await ensureCacheProject()

  const text = await Bun.file(packageJSONPath).text()
  if (!text.trim()) {
    return createCachePackageJSON()
  }

  try {
    const parsed = JSON.parse(text) as Partial<CachePackageJSON>
    return {
      ...createCachePackageJSON(),
      ...parsed,
      dependencies: {
        ...createCachePackageJSON().dependencies,
        ...(parsed.dependencies ?? {}),
      },
    }
  } catch {
    return createCachePackageJSON()
  }
}

async function writeCachePackageJSON(input: CachePackageJSON) {
  await Bun.write(Bun.file(packageJSONPath), JSON.stringify(input, null, 2) + "\n")
}

async function installedVersion(pkg: string) {
  const filepath = path.join(packageRoot(pkg), "package.json")
  const text = await Bun.file(filepath)
    .text()
    .catch(() => undefined)
  if (!text) return undefined

  try {
    const parsed = JSON.parse(text) as { version?: string }
    return parsed.version?.trim() || undefined
  } catch {
    return undefined
  }
}

function versionSatisfied(installed: string, requested: string) {
  if (requested === "latest") return false
  if (isRange(requested)) {
    return Bun.semver.satisfies(installed, requested)
  }
  return installed === requested
}

async function shouldSkipInstall(pkg: string, requestedVersion: string) {
  const currentVersion = await installedVersion(pkg)
  if (!currentVersion) return false

  if (requestedVersion === "latest") {
    const outdated = await PackageRegistry.isOutdated(pkg, currentVersion)
    log.info("checked runtime cache", {
      pkg,
      version: currentVersion,
      outdated,
    })
    return !outdated
  }

  return versionSatisfied(currentVersion, requestedVersion)
}

function createCacheRequire() {
  return createRequire(pathToFileURL(packageJSONPath).href)
}

export const BunCommandError = NamedError.create(
  "BunCommandError",
  z.object({
    args: z.array(z.string()),
    cwd: z.string(),
    exitCode: z.number(),
    stdout: z.string().optional(),
    stderr: z.string().optional(),
  }),
)

export const BunPackageResolveError = NamedError.create(
  "BunPackageResolveError",
  z.object({
    package: z.string(),
    version: z.string().optional(),
    cacheDir: z.string(),
  }),
)

export namespace BunProc {
  export type RunResult = {
    stdout: string
    stderr: string
    exitCode: number
  }

  export type InstallResult = {
    name: string
    version: string
    entry: string
    root: string
  }

  export const Cache = {
    dir: cacheDir,
    packageJSON: packageJSONPath,
  }

  export async function run(
    args: string[],
    options?: {
      cwd?: string
      env?: Record<string, string | undefined>
    },
  ): Promise<RunResult> {
    const cwd = options?.cwd ?? process.cwd()
    log.info("running", {
      args,
      cwd,
    })

    const proc = Bun.spawn([process.execPath, ...args], {
      cwd,
      env: mergeEnv({
        BUN_BE_BUN: "1",
        ...options?.env,
      }),
      stdout: "pipe",
      stderr: "pipe",
    })

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    log.info("done", {
      args,
      cwd,
      exitCode,
    })

    if (exitCode !== 0) {
      throw new BunCommandError({
        args,
        cwd,
        exitCode,
        stdout: stdout.trim() || undefined,
        stderr: stderr.trim() || undefined,
      })
    }

    return {
      stdout,
      stderr,
      exitCode,
    }
  }

  export async function resolvePackage(pkg: string): Promise<InstallResult> {
    await ensureCacheProject()

    const version = await installedVersion(pkg)
    if (!version) {
      throw new BunPackageResolveError({
        package: pkg,
        cacheDir,
      })
    }

    let entry: string
    try {
      entry = createCacheRequire().resolve(pkg)
    } catch (cause) {
      throw new BunPackageResolveError(
        {
          package: pkg,
          version,
          cacheDir,
        },
        { cause },
      )
    }

    return {
      name: pkg,
      version,
      entry,
      root: packageRoot(pkg),
    }
  }

  export async function install(pkg: string, version?: string): Promise<InstallResult> {
    const requestedVersion = normalizeVersion(version)

    using installLock = await Lock.write(installLockKey)
    void installLock

    await ensureCacheProject()

    if (await shouldSkipInstall(pkg, requestedVersion)) {
      return resolvePackage(pkg)
    }

    const args = [
      "add",
      "--cwd",
      cacheDir,
      "--force",
      "--exact",
      ...(proxied() ? ["--no-cache"] : []),
      installTarget(pkg, requestedVersion),
    ]

    await run(args, {
      cwd: cacheDir,
    })

    const resolved = await resolvePackage(pkg)

    if (requestedVersion === "latest") {
      const manifest = await readCachePackageJSON()
      manifest.dependencies[pkg] = resolved.version
      await writeCachePackageJSON(manifest)
    }

    return resolved
  }

  export async function importPackage<TModule = Record<string, unknown>>(
    pkg: string,
    version?: string,
  ): Promise<InstallResult & { module: TModule }> {
    const resolved = await install(pkg, version)
    const module = (await import(pathToFileURL(resolved.entry).href)) as TModule
    return {
      ...resolved,
      module,
    }
  }
}
