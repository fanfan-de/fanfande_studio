#!/usr/bin/env node
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { dirname, extname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const OPEN_SOURCE_LICENSES = new Set(["MIT", "Apache-2.0"])
const VALID_CATEGORIES = new Set(["Code", "Browser", "Git", "Database", "Docs", "Automation", "Design"])
const IMAGE_MIME = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
])

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, "..")
const args = parseArgs(process.argv.slice(2))
const sourceArg = args.source ?? process.env.OPENAI_PLUGINS_SRC

if (!sourceArg) {
  fail("Usage: node scripts/convert-openai-plugins.mjs --source <openai/plugins repo or plugins dir> [--overwrite-existing]")
}

const sourceRoot = resolve(sourceArg)
const pluginsRoot = existsSync(join(sourceRoot, "plugins")) ? join(sourceRoot, "plugins") : sourceRoot
const overwriteExisting = Boolean(args["overwrite-existing"])
const stagingRoot = resolve(process.env.TEMP ?? process.env.TMP ?? repoRoot, "anybox-openai-plugin-conversion")

const converted = []
const skipped = []

await rm(stagingRoot, { recursive: true, force: true })
await mkdir(stagingRoot, { recursive: true })

try {
  const pluginDirs = (await readdir(pluginsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))

  for (const pluginName of pluginDirs) {
    const pluginRoot = join(pluginsRoot, pluginName)
    const sourceManifestPath = join(pluginRoot, ".codex-plugin", "plugin.json")
    if (!existsSync(sourceManifestPath)) continue

    const sourceManifest = JSON.parse(await readFile(sourceManifestPath, "utf8"))
    const license = String(sourceManifest.license ?? "")
    if (!OPEN_SOURCE_LICENSES.has(license)) {
      skipped.push({ name: pluginName, reason: `license ${license || "missing"} is not in ${[...OPEN_SOURCE_LICENSES].join("/")}` })
      continue
    }

    const skillRoots = await existingSkillRoots(pluginRoot, sourceManifest.skills)
    const skillPreviews = await discoverSkillPreviews(pluginRoot, skillRoots, sourceManifest.name)
    const mcpServers = await convertMcpServers(pluginRoot, sourceManifest.mcpServers, sourceManifest.description)
    if (skillPreviews.length === 0 && mcpServers.length === 0) {
      skipped.push({ name: pluginName, reason: "app-only connector metadata has no Anybox-installable local skill or MCP server" })
      continue
    }

    const pluginID = normalizePluginID(sourceManifest.name)
    const outputDir = join(repoRoot, pluginID)
    const outputMetaPath = join(outputDir, "plugin.meta.json")
    if (!overwriteExisting && existsSync(outputMetaPath)) {
      skipped.push({ name: pluginName, reason: "target plugin already exists; kept existing package" })
      continue
    }

    const version = String(sourceManifest.version ?? "0.1.0")
    const packageRootName = `${pluginID}-${version}`
    const packageRoot = join(stagingRoot, packageRootName)
    await cp(pluginRoot, packageRoot, {
      recursive: true,
      filter: (source) => !source.split(/[\\/]/).includes(".codex-plugin"),
    })

    const anyboxManifest = await buildAnyboxManifest(sourceManifest, pluginRoot, skillRoots, mcpServers, {
      embedAssets: false,
    })
    const registryManifest = await buildAnyboxManifest(sourceManifest, pluginRoot, skillRoots, mcpServers, {
      embedAssets: true,
      maxAssetBytes: 64 * 1024,
    })
    await mkdir(join(packageRoot, ".anybox-plugin"), { recursive: true })
    await writeJson(join(packageRoot, ".anybox-plugin", "plugin.json"), anyboxManifest)

    await mkdir(outputDir, { recursive: true })
    const zipName = `${pluginID}-${version}.zip`
    const zipPath = join(outputDir, zipName)
    await removeFileIfExists(zipPath)
    createZip(packageRoot, zipPath)

    const zipBytes = await readFile(zipPath)
    const meta = {
      id: pluginID,
      ...registryManifest,
      skillPreviews: skillPreviews.map(({ id: _id, ...preview }) => preview),
      package: {
        type: "zip",
        url: `https://raw.githubusercontent.com/fanfan-de/anybox/master/plugins/Anybox-Plugins/${pluginID}/${zipName}`,
        sha256: createHash("sha256").update(zipBytes).digest("hex"),
        size: zipBytes.byteLength,
      },
    }
    await writeJson(outputMetaPath, meta)
    converted.push({ name: pluginID, version, skills: skillPreviews.length, mcpServers: mcpServers.length })
  }

  await updateIndex()
} finally {
  await rm(stagingRoot, { recursive: true, force: true }).catch(() => {})
}

console.log(JSON.stringify({ converted, skipped, convertedCount: converted.length, skippedCount: skipped.length }, null, 2))

function parseArgs(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]
    if (!item.startsWith("--")) continue
    const key = item.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith("--")) {
      result[key] = true
    } else {
      result[key] = next
      index += 1
    }
  }
  return result
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

function normalizePluginID(value) {
  return String(value).trim().toLowerCase()
}

function asArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function normalizeRelativePath(value) {
  return String(value).replace(/^[.][/\\]/, "").replace(/[\\/]+$/, "")
}

async function existingSkillRoots(pluginRoot, declaration) {
  const roots = asArray(declaration ?? "skills")
    .map(normalizeRelativePath)
    .filter(Boolean)
  const existing = []
  for (const root of roots) {
    const absolute = join(pluginRoot, root)
    if (existsSync(absolute) && (await stat(absolute)).isDirectory()) existing.push(root)
  }
  return existing
}

async function discoverSkillPreviews(pluginRoot, skillRoots, pluginID) {
  const previews = []
  for (const skillRoot of skillRoots) {
    const absoluteRoot = join(pluginRoot, skillRoot)
    for (const entry of (await readdir(absoluteRoot, { withFileTypes: true })).filter((item) => item.isDirectory())) {
      const skillPath = join(absoluteRoot, entry.name, "SKILL.md")
      if (!existsSync(skillPath)) continue
      const frontmatter = parseSkillFrontmatter(await readFile(skillPath, "utf8"))
      previews.push({
        id: `plugin:${normalizePluginID(pluginID)}:${entry.name}`,
        name: frontmatter.name ?? entry.name,
        description: frontmatter.description ?? `Skill bundled with ${pluginID}.`,
        directory: entry.name,
      })
    }
  }
  return previews
}

function parseSkillFrontmatter(markdown) {
  if (!markdown.startsWith("---")) return {}
  const end = markdown.indexOf("\n---", 3)
  if (end === -1) return {}
  const header = markdown.slice(3, end).trim()
  const result = {}
  for (const line of header.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!match) continue
    result[match[1]] = match[2].replace(/^["']|["']$/g, "").trim()
  }
  return result
}

async function convertMcpServers(pluginRoot, declaration, fallbackDescription) {
  const servers = []
  for (const mcpPath of asArray(declaration).map(normalizeRelativePath)) {
    const absolute = join(pluginRoot, mcpPath)
    if (!existsSync(absolute)) continue
    const json = JSON.parse(await readFile(absolute, "utf8"))
    const sourceServers = json.mcpServers ?? json
    for (const [serverID, config] of Object.entries(sourceServers)) {
      const description = config.note ?? config.description ?? fallbackDescription
      const server = {
        id: serverID,
        name: titleFromID(serverID),
        description,
        risk: "medium",
        permissions: [],
        tools: [],
        runtime: undefined,
        installReview: config.note ? [config.note] : undefined,
      }

      if (config.command) {
        server.permissions = [`Runs ${config.command} as a bundled MCP server process.`]
        server.runtime = {
          transport: "stdio",
          command: String(config.command),
          args: Array.isArray(config.args) ? config.args.map(String) : undefined,
          env: config.env && typeof config.env === "object" ? stringifyRecord(config.env) : undefined,
          cwd: config.cwd ? String(config.cwd) : undefined,
          timeoutMs: 30000,
        }
      } else if (config.url || config.type === "http") {
        const serverUrl = String(config.url ?? "")
        server.permissions = [`Connects to the remote MCP server at ${serverUrl}.`]
        server.runtime = {
          transport: "remote",
          serverUrl,
          requireApproval: "always",
          timeoutMs: 30000,
        }
      }

      if (server.runtime) servers.push(removeUndefined(server))
    }
  }
  return servers
}

function stringifyRecord(record) {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, String(value)]))
}

function titleFromID(value) {
  return String(value)
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ")
}

async function buildAnyboxManifest(sourceManifest, pluginRoot, skillRoots, mcpServers, assetOptions) {
  const manifest = {}
  for (const key of ["name", "version", "description", "author", "homepage", "repository", "license", "keywords"]) {
    if (sourceManifest[key] !== undefined) manifest[key] = sourceManifest[key]
  }
  manifest.name = normalizePluginID(manifest.name)
  manifest.interface = await normalizeInterface(sourceManifest.interface ?? {}, pluginRoot, assetOptions)
  if (skillRoots.length > 0) manifest.skills = skillRoots.length === 1 ? `./${skillRoots[0]}/` : skillRoots.map((root) => `./${root}/`)
  if (mcpServers.length > 0) manifest.mcpServers = mcpServers
  return removeUndefined(manifest)
}

async function normalizeInterface(input, pluginRoot, assetOptions) {
  const output = structuredClone(input)
  if (output.category) output.category = normalizeCategory(output.category)

  for (const key of ["composerIcon", "logo", "iconUrl", "thumbnailUrl", "heroImageUrl"]) {
    if (output[key]) output[key] = await displayAsset(output[key], pluginRoot, assetOptions)
  }
  if (Array.isArray(output.screenshots)) {
    output.screenshots = (await Promise.all(output.screenshots.map((value) => displayAsset(value, pluginRoot, assetOptions)))).filter(Boolean)
  }
  return removeUndefined(output)
}

function normalizeCategory(value) {
  const raw = String(value).trim()
  if (VALID_CATEGORIES.has(raw)) return raw
  const normalized = raw.toLowerCase()
  if (normalized === "coding" || normalized === "engineering") return "Code"
  if (normalized === "productivity" || normalized === "documentation" || normalized === "research") return "Docs"
  return "Code"
}

async function displayAsset(value, pluginRoot, options = {}) {
  const raw = String(value).trim()
  if (!options.embedAssets) return raw
  if (/^(https?:\/\/|data:image\/)/i.test(raw)) return raw
  const absolute = resolve(pluginRoot, raw)
  if (!absolute.startsWith(resolve(pluginRoot)) || !existsSync(absolute)) return raw
  const mime = IMAGE_MIME.get(extname(absolute).toLowerCase())
  if (!mime) return raw
  const bytes = await readFile(absolute)
  if (options.maxAssetBytes && bytes.byteLength > options.maxAssetBytes) return raw
  return `data:${mime};base64,${bytes.toString("base64")}`
}

function removeUndefined(value) {
  if (Array.isArray(value)) return value.map(removeUndefined)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, removeUndefined(item)]),
  )
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

async function removeFileIfExists(filePath) {
  await rm(filePath, { force: true })
}

function createZip(packageRoot, zipPath) {
  const source = powershellSingleQuoted(packageRoot)
  const destination = powershellSingleQuoted(zipPath)
  const command = [
    "Add-Type -AssemblyName System.IO.Compression.FileSystem",
    `if (Test-Path -LiteralPath ${destination}) { Remove-Item -LiteralPath ${destination} -Force }`,
    `[IO.Compression.ZipFile]::CreateFromDirectory(${source}, ${destination}, [IO.Compression.CompressionLevel]::Optimal, $true)`,
  ].join("; ")
  const result = spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    { encoding: "utf8", windowsHide: true },
  )
  if (result.status !== 0) {
    throw new Error(`Could not create ${zipPath}: ${(result.stderr || result.stdout).trim()}`)
  }
}

function powershellSingleQuoted(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

async function updateIndex() {
  const dirs = (await readdir(repoRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(repoRoot, name, "plugin.meta.json")))
    .sort((left, right) => left.localeCompare(right))
  const urls = dirs.map((name) => `https://raw.githubusercontent.com/fanfan-de/anybox/master/plugins/Anybox-Plugins/${name}`)
  await writeJson(join(repoRoot, "index.json"), urls)
}
