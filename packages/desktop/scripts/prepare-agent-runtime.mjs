import { spawnSync } from "node:child_process"
import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const desktopDir = path.resolve(scriptDir, "..")
const repoRoot = path.resolve(desktopDir, "..", "..")
const agentDir = path.join(repoRoot, "packages", "fanfandeagent")
const runtimeDir = path.join(desktopDir, "build", "agent-runtime")

const bunExecutableName = process.platform === "win32" ? "bun.exe" : "bun"

async function pathExists(target) {
  try {
    await fsp.access(target)
    return true
  } catch {
    return false
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    windowsHide: true,
    ...options,
  })

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`)
  }
}

function resolveBunBinary() {
  const explicit = process.env.FANFANDE_BUN_BINARY?.trim()
  if (explicit && fs.existsSync(explicit)) return explicit

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
      ? path.join(process.env.APPDATA, "npm", "node_modules", "bun", "bin", bunExecutableName)
      : undefined,
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, ".bun", "bin", bunExecutableName) : undefined,
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error(
    "Unable to locate Bun. Set FANFANDE_BUN_BINARY or ensure `bun --print process.execPath` resolves correctly.",
  )
}

async function copyNodePtyRuntime(runtimeNodeModulesDir) {
  const packageRoot = path.join(agentDir, "node_modules", "node-pty")
  if (!(await pathExists(packageRoot))) {
    throw new Error("Missing packages/fanfandeagent/node_modules/node-pty. Run `bun install` in fanfandeagent first.")
  }

  const targetRoot = path.join(runtimeNodeModulesDir, "node-pty")
  await fsp.mkdir(targetRoot, { recursive: true })

  const copyTargets = ["package.json", "LICENSE", "lib", "prebuilds", path.join("build", "Release")]

  for (const relativePath of copyTargets) {
    const from = path.join(packageRoot, relativePath)
    if (!(await pathExists(from))) continue

    const to = path.join(targetRoot, relativePath)
    await fsp.cp(from, to, { recursive: true })
  }
}

async function main() {
  const bunBinary = resolveBunBinary()
  const runtimeNodeModulesDir = path.join(runtimeDir, "node_modules")
  const bundledServerOutput = path.join(runtimeDir, "agent-server.js")

  await fsp.rm(runtimeDir, { recursive: true, force: true })
  await fsp.mkdir(runtimeNodeModulesDir, { recursive: true })

  console.log(`[desktop][build] bundling agent server with ${bunBinary}`)
  run(
    bunBinary,
    ["build", path.join(agentDir, "src", "server", "start.ts"), "--target=bun", "--outfile", bundledServerOutput],
    { cwd: repoRoot },
  )

  await fsp.copyFile(bunBinary, path.join(runtimeDir, bunExecutableName))
  await fsp.chmod(path.join(runtimeDir, bunExecutableName), 0o755).catch(() => {})
  await fsp.copyFile(path.join(agentDir, "src", "pty", "node-pty-worker.mjs"), path.join(runtimeDir, "node-pty-worker.mjs"))
  await copyNodePtyRuntime(runtimeNodeModulesDir)

  console.log(`[desktop][build] prepared managed agent runtime at ${runtimeDir}`)
}

await main()
