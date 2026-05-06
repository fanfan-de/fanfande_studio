import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const electronAppMock = vi.hoisted(() => ({
  isPackaged: false,
  appPath: "",
  paths: {
    home: "",
    userData: "",
  } as Record<string, string>,
}))

vi.mock("electron", () => ({
  app: {
    get isPackaged() {
      return electronAppMock.isPackaged
    },
    getAppPath: vi.fn(() => electronAppMock.appPath),
    getPath: vi.fn((name: string) => electronAppMock.paths[name] ?? ""),
  },
}))

import { managedAgentInternals } from "./managed-agent"

const tempDirectories: string[] = []

async function createTempDirectory(prefix: string) {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix))
  tempDirectories.push(directory)
  return directory
}

async function withProcessEnv<T>(
  overrides: Record<string, string | undefined>,
  fn: () => T | Promise<T>,
): Promise<T> {
  const backup = new Map<string, string | undefined>()

  for (const [key, value] of Object.entries(overrides)) {
    backup.set(key, process.env[key])
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  try {
    return await fn()
  } finally {
    for (const [key, value] of backup.entries()) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

beforeEach(() => {
  electronAppMock.isPackaged = false
  electronAppMock.appPath = ""
  electronAppMock.paths = {
    home: "",
    userData: "",
  }
})

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

describe("managed agent workspace dependencies", () => {
  it("adds bundled workspace dependency paths and versions to launch env", async () => {
    const runtimeDir = await createTempDirectory("fanfande-managed-agent-runtime-")
    const dependenciesDir = path.join(runtimeDir, "dependencies")

    await mkdir(dependenciesDir, { recursive: true })
    await writeFile(path.join(runtimeDir, process.platform === "win32" ? "bun.exe" : "bun"), "")
    await writeFile(path.join(runtimeDir, "agent-server.js"), "")
    await writeFile(
      path.join(dependenciesDir, "manifest.json"),
      JSON.stringify({
        kind: "fanfande-workspace-dependencies",
        version: 1,
        bundleVersion: "bundle-test-version",
      }),
    )

    await withProcessEnv(
      {
        FANFANDE_AGENT_RUNTIME_DIR: runtimeDir,
      },
      () => {
        const specs = managedAgentInternals.resolveBundledAgentLaunchSpecs()
        const spec = specs.find((item) => item.args[0] === path.join(runtimeDir, "agent-server.js"))
        expect(spec).toMatchObject({
          dependenciesDir,
          sourceRuntime: false,
        })

        const env = managedAgentInternals.buildManagedAgentStartEnv(spec!, 4567)
        expect(env[managedAgentInternals.env.workspaceDependenciesDir]).toBe(dependenciesDir)
        expect(env[managedAgentInternals.env.workspaceDependenciesVersion]).toBe("bundle-test-version")
        expect(env.FanFande_SERVER_PORT).toBe("4567")
      },
    )
  })

  it("points source runtimes at the build dependency directory without requiring it to exist", async () => {
    const repoRoot = await createTempDirectory("fanfande-managed-agent-source-")
    const desktopAppPath = path.join(repoRoot, "packages", "desktop")
    const agentEntrypoint = path.join(repoRoot, "packages", "fanfandeagent", "src", "server", "start.ts")
    const bunBinary = path.join(repoRoot, process.platform === "win32" ? "bun.exe" : "bun")
    const dependenciesDir = path.join(desktopAppPath, "build", "agent-runtime", "dependencies")

    await mkdir(path.dirname(agentEntrypoint), { recursive: true })
    await mkdir(desktopAppPath, { recursive: true })
    await writeFile(agentEntrypoint, "export {}\n")
    await writeFile(bunBinary, "")
    electronAppMock.appPath = desktopAppPath

    await withProcessEnv(
      {
        FANFANDE_BUN_BINARY: bunBinary,
      },
      () => {
        const spec = managedAgentInternals.resolveSourceAgentLaunchSpec()
        expect(spec).toMatchObject({
          command: bunBinary,
          dependenciesDir,
          sourceRuntime: true,
        })

        const env = managedAgentInternals.buildManagedAgentStartEnv(spec!, 4096)
        expect(env[managedAgentInternals.env.workspaceDependenciesDir]).toBe(dependenciesDir)
        expect(env[managedAgentInternals.env.workspaceDependenciesVersion]).toBeUndefined()
      },
    )
  })
})
