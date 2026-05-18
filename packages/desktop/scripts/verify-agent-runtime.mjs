import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const desktopDir = path.resolve(scriptDir, "..")
const runtimeDir = path.join(desktopDir, "build", "agent-runtime")
const dependenciesDir = path.join(runtimeDir, "dependencies")
const bunExecutableName = process.platform === "win32" ? "bun.exe" : "bun"
const pythonExecutable = process.platform === "win32"
  ? path.join(dependenciesDir, "python", "python.exe")
  : path.join(dependenciesDir, "python", "bin", "python3")

function findBuiltinPluginManifest(pluginID) {
  const pluginRoot = path.join(runtimeDir, "plugins", "builtin", pluginID)
  const legacyManifest = path.join(pluginRoot, ".fanfande-plugin", "plugin.json")
  if (fs.existsSync(legacyManifest)) return legacyManifest

  if (!fs.existsSync(pluginRoot)) return path.join(pluginRoot, "1.0.0", ".fanfande-plugin", "plugin.json")

  const versionEntries = fs
    .readdirSync(pluginRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => path.join(pluginRoot, entry.name, ".fanfande-plugin", "plugin.json"))

  return versionEntries.find((manifestPath) => fs.existsSync(manifestPath))
    ?? path.join(pluginRoot, "1.0.0", ".fanfande-plugin", "plugin.json")
}

const requiredFiles = [
  path.join(runtimeDir, "agent-server.js"),
  path.join(runtimeDir, bunExecutableName),
  path.join(runtimeDir, "node_modules", "node-pty", "package.json"),
  findBuiltinPluginManifest("build-web-apps"),
  findBuiltinPluginManifest("context7"),
  findBuiltinPluginManifest("filesystem"),
  findBuiltinPluginManifest("github"),
  findBuiltinPluginManifest("playwright"),
  findBuiltinPluginManifest("postgres"),
  path.join(dependenciesDir, "manifest.json"),
  pythonExecutable,
]

const missing = requiredFiles.filter((filePath) => !fs.existsSync(filePath))
if (missing.length > 0) {
  console.error("[desktop][build] agent runtime is incomplete:")
  for (const filePath of missing) {
    console.error(`- ${filePath}`)
  }
  process.exit(1)
}

if (process.platform === "darwin") {
  const prebuildsDir = path.join(runtimeDir, "node_modules", "node-pty", "prebuilds")
  const darwinPrebuilds = fs
    .readdirSync(prebuildsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("darwin-"))

  const invalidHelpers = darwinPrebuilds
    .map((entry) => path.join(prebuildsDir, entry.name, "spawn-helper"))
    .filter((helperPath) => !fs.existsSync(helperPath) || (fs.statSync(helperPath).mode & 0o111) === 0)

  if (darwinPrebuilds.length === 0 || invalidHelpers.length > 0) {
    console.error("[desktop][build] macOS node-pty spawn-helper is not executable:")
    if (darwinPrebuilds.length === 0) {
      console.error(`- ${prebuildsDir}/darwin-*/spawn-helper`)
    }
    for (const helperPath of invalidHelpers) {
      console.error(`- ${helperPath}`)
    }
    process.exit(1)
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(dependenciesDir, "manifest.json"), "utf8"))
if (manifest.platform !== process.platform || manifest.arch !== process.arch) {
  console.error(
    `[desktop][build] dependency manifest platform mismatch: got ${manifest.platform}/${manifest.arch}, expected ${process.platform}/${process.arch}`,
  )
  process.exit(1)
}

console.log(`[desktop][build] verified managed agent runtime at ${runtimeDir}`)
