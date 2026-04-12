import { app } from "electron"
import { spawn, spawnSync, type ChildProcessByStdio } from "node:child_process"
import fs from "node:fs"
import fsp from "node:fs/promises"
import net from "node:net"
import path from "node:path"
import type { Readable } from "node:stream"
import { setTimeout as delay } from "node:timers/promises"

const MANAGED_AGENT_BASE_URL_ENV = "FANFANDE_AGENT_BASE_URL"
const MANAGED_AGENT_WORKDIR_ENV = "FANFANDE_AGENT_WORKDIR"
const MANAGED_AGENT_DISABLE_ENV = "FANFANDE_DISABLE_MANAGED_AGENT"
const MANAGED_AGENT_RUNTIME_ENV = "FANFANDE_AGENT_RUNTIME_DIR"
const MANAGED_AGENT_BUN_BINARY_ENV = "FANFANDE_BUN_BINARY"

const BUNDLED_AGENT_ENTRYPOINT = "agent-server.js"
const BUNDLED_BUN_BINARY = process.platform === "win32" ? "bun.exe" : "bun"

interface ManagedAgentProcess {
  readonly baseURL: string
  readonly child: ChildProcessByStdio<null, Readable, Readable>
  readonly port: number
}

interface ManagedAgentLaunchSpec {
  readonly label: string
  readonly command: string
  readonly args: string[]
}

let managedAgent: ManagedAgentProcess | undefined

function log(message: string, ...details: unknown[]) {
  console.log("[desktop][agent]", message, ...details)
}

function logError(message: string, error: unknown) {
  console.error("[desktop][agent]", message, error)
}

function resolveBundledRuntimeCandidates() {
  const candidates = []
  const explicitRuntime = process.env[MANAGED_AGENT_RUNTIME_ENV]?.trim()
  if (explicitRuntime) candidates.push(explicitRuntime)

  if (app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, "agent"))
  } else {
    candidates.push(path.join(app.getAppPath(), "build", "agent-runtime"))
  }

  return candidates
}

function resolveSystemBunBinary() {
  const explicitBinary = process.env[MANAGED_AGENT_BUN_BINARY_ENV]?.trim()
  if (explicitBinary && fs.existsSync(explicitBinary)) {
    return explicitBinary
  }

  const probe = spawnSync("bun", ["--print", "process.execPath"], {
    encoding: "utf8",
    shell: process.platform === "win32",
    windowsHide: true,
  })
  const probedPath = probe.stdout?.trim()
  if (probe.status === 0 && probedPath && fs.existsSync(probedPath)) {
    return probedPath
  }

  const candidates = [
    process.env.APPDATA
      ? path.join(process.env.APPDATA, "npm", "node_modules", "bun", "bin", BUNDLED_BUN_BINARY)
      : undefined,
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, ".bun", "bin", BUNDLED_BUN_BINARY) : undefined,
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate
    }
  }

  return undefined
}

function resolveSourceAgentLaunchSpec() {
  if (app.isPackaged) return undefined

  const desktopAppPath = app.getAppPath()
  const repoRoot = path.resolve(desktopAppPath, "..", "..")
  const entrypoint = path.join(repoRoot, "packages", "fanfandeagent", "src", "server", "start.ts")
  if (!fs.existsSync(entrypoint)) {
    return undefined
  }

  const bunBinary = resolveSystemBunBinary()
  if (!bunBinary) {
    return undefined
  }

  return {
    label: `source runtime (${entrypoint})`,
    command: bunBinary,
    args: ["run", entrypoint],
  } satisfies ManagedAgentLaunchSpec
}

function resolveBundledAgentLaunchSpecs() {
  const specs: ManagedAgentLaunchSpec[] = []

  for (const candidate of resolveBundledRuntimeCandidates()) {
    const bunBinary = path.join(candidate, BUNDLED_BUN_BINARY)
    const entrypoint = path.join(candidate, BUNDLED_AGENT_ENTRYPOINT)
    if (fs.existsSync(bunBinary) && fs.existsSync(entrypoint)) {
      specs.push({
        label: `bundled runtime (${candidate})`,
        command: bunBinary,
        args: [entrypoint],
      })
    }
  }

  return specs
}

function resolveManagedAgentLaunchSpecs() {
  const specs: ManagedAgentLaunchSpec[] = []
  const sourceSpec = resolveSourceAgentLaunchSpec()
  if (sourceSpec) specs.push(sourceSpec)

  specs.push(...resolveBundledAgentLaunchSpecs())
  return specs
}

async function reservePort(port: number) {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer()

    server.once("error", reject)
    server.listen(port, "127.0.0.1", () => {
      const address = server.address()
      const assignedPort = typeof address === "object" && address ? address.port : port
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve(assignedPort)
      })
    })
  })
}

async function findAvailablePort(preferredPort = 4096) {
  try {
    return await reservePort(preferredPort)
  } catch {
    return reservePort(0)
  }
}

function attachProcessLogging(child: ChildProcessByStdio<null, Readable, Readable>) {
  child.stdout.setEncoding("utf8")
  child.stdout.on("data", (chunk: string) => {
    for (const line of chunk.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed) continue
      log(trimmed)
    }
  })

  child.stderr.setEncoding("utf8")
  child.stderr.on("data", (chunk: string) => {
    for (const line of chunk.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed) continue
      console.error("[desktop][agent]", trimmed)
    }
  })
}

async function waitForAgentHealth(
  baseURL: string,
  child: ChildProcessByStdio<null, Readable, Readable>,
  timeoutMs = 15000,
) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`Managed agent exited before becoming healthy (exit code ${child.exitCode})`)
    }

    try {
      const response = await fetch(new URL("/healthz", baseURL))
      if (response.ok) return
    } catch {
      // The server is still starting up.
    }

    await delay(250)
  }

  throw new Error(`Managed agent did not become healthy within ${timeoutMs}ms`)
}

export async function ensureManagedAgentRunning() {
  if (managedAgent) return managedAgent.baseURL

  const externalBaseURL = process.env[MANAGED_AGENT_BASE_URL_ENV]?.trim()
  if (externalBaseURL) return externalBaseURL

  if (process.env[MANAGED_AGENT_DISABLE_ENV]?.trim() === "1") {
    return undefined
  }

  const launchSpecs = resolveManagedAgentLaunchSpecs()
  if (launchSpecs.length === 0) {
    log("managed runtime not found; falling back to external agent configuration")
    return undefined
  }

  const port = await findAvailablePort()
  const baseURL = `http://127.0.0.1:${port}`
  const dataDir = path.join(app.getPath("userData"), "agent")

  await fsp.mkdir(dataDir, { recursive: true })

  const startEnv = {
    ...process.env,
    FanFande_NODE_BINARY: process.execPath,
    FanFande_NODE_RUN_AS_NODE: "1",
    FanFande_SERVER_HOST: "127.0.0.1",
    FanFande_SERVER_PORT: String(port),
  }

  const launchErrors: Error[] = []

  for (const spec of launchSpecs) {
    log(`starting managed agent with ${spec.label}`)

    const child = spawn(spec.command, spec.args, {
      cwd: dataDir,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: startEnv,
    })

    managedAgent = {
      child,
      baseURL,
      port,
    }

    attachProcessLogging(child)
    child.once("exit", (code, signal) => {
      log(`managed agent exited (code=${code ?? "null"}, signal=${signal ?? "none"})`)
      if (managedAgent?.child === child) {
        managedAgent = undefined
      }
    })

    try {
      await waitForAgentHealth(baseURL, child)
      process.env[MANAGED_AGENT_BASE_URL_ENV] = baseURL
      if (!process.env[MANAGED_AGENT_WORKDIR_ENV]?.trim()) {
        process.env[MANAGED_AGENT_WORKDIR_ENV] = app.getPath("home")
      }
      log(`managed agent ready at ${baseURL} via ${spec.label}`)
      return baseURL
    } catch (error) {
      managedAgent = undefined
      try {
        child.kill()
      } catch {
        // The child may have already exited.
      }

      const launchError = error instanceof Error ? error : new Error(String(error))
      launchErrors.push(new Error(`Failed to start ${spec.label}: ${launchError.message}`))
      logError(`managed agent startup failed for ${spec.label}`, launchError)
    }
  }

  const message = launchErrors.map((error) => error.message).join("; ")
  throw new Error(message || "Managed agent failed to start")
}

export async function stopManagedAgent() {
  const current = managedAgent
  managedAgent = undefined
  delete process.env[MANAGED_AGENT_BASE_URL_ENV]

  if (!current || current.child.exitCode !== null) return

  current.child.kill()
  await Promise.race([
    new Promise<void>((resolve) => {
      current.child.once("exit", () => resolve())
    }),
    delay(2000).then(() => {
      if (current.child.exitCode === null) {
        current.child.kill("SIGKILL")
      }
    }),
  ]).catch(() => {
    // The app is exiting anyway.
  })
}
