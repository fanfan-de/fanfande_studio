import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const packageDirectory = path.resolve(scriptDirectory, "..")
const appearanceSourcePath = path.join(packageDirectory, "src", "shared", "appearance.ts")
const configFileName = "appearance-theme.json"

function getDefaultConfigCandidates() {
  const candidates = []
  const explicitPath = process.argv[2] || process.env.APPEARANCE_THEME_SOURCE
  if (explicitPath) {
    candidates.push(path.resolve(explicitPath))
  }

  const appData = process.env.APPDATA
  if (appData) {
    candidates.push(path.join(appData, "fanfande-desktop-agent", configFileName))
    candidates.push(path.join(appData, "Fanfande Studio", configFileName))
  }

  const localAppData = process.env.LOCALAPPDATA
  if (localAppData) {
    candidates.push(path.join(localAppData, "fanfande-desktop-agent", configFileName))
    candidates.push(path.join(localAppData, "Fanfande Studio", configFileName))
  }

  const homeDirectory = os.homedir()
  if (homeDirectory) {
    candidates.push(path.join(homeDirectory, "Library", "Application Support", "fanfande-desktop-agent", configFileName))
    candidates.push(path.join(homeDirectory, "Library", "Application Support", "Fanfande Studio", configFileName))
    candidates.push(path.join(homeDirectory, ".config", "fanfande-desktop-agent", configFileName))
    candidates.push(path.join(homeDirectory, ".config", "Fanfande Studio", configFileName))
  }

  return [...new Set(candidates)]
}

async function findConfigPath() {
  const candidates = getDefaultConfigCandidates()
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate)
      if (stat.isFile()) return candidate
    } catch (error) {
      if (error?.code !== "ENOENT") throw error
    }
  }

  throw new Error(
    [
      `Could not find ${configFileName}.`,
      "Pass an explicit path: pnpm run appearance:promote -- C:\\path\\to\\appearance-theme.json",
      "Or set APPEARANCE_THEME_SOURCE.",
    ].join("\n"),
  )
}

function parseTokenNames(source) {
  const match = source.match(/export const APPEARANCE_TOKEN_NAMES = \[([\s\S]*?)\] as const/)
  if (!match) {
    throw new Error("Could not find APPEARANCE_TOKEN_NAMES in src/shared/appearance.ts.")
  }

  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1])
}

function normalizeTokenMap(input, tokenNames) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {}
  }

  const normalized = {}
  for (const tokenName of tokenNames) {
    const value = input[tokenName]
    if (typeof value !== "string") continue

    const trimmed = value.trim()
    if (trimmed) {
      normalized[tokenName] = trimmed
    }
  }

  return normalized
}

function formatTokenMapConst(name, tokenMap, eol) {
  const lines = Object.entries(tokenMap).map(
    ([tokenName, value]) => `  ${JSON.stringify(tokenName)}: ${JSON.stringify(value)},`,
  )
  return `const ${name} = {${eol}${lines.join(eol)}${eol}} satisfies AppearanceTokenMap`
}

function replaceTokenMapConst(source, name, tokenMap, eol) {
  const pattern = new RegExp(`const ${name} = \\{[\\s\\S]*?\\n\\} satisfies AppearanceTokenMap`)
  const nextBlock = formatTokenMapConst(name, tokenMap, eol)
  if (!pattern.test(source)) {
    throw new Error(`Could not find ${name} in src/shared/appearance.ts.`)
  }

  return source.replace(pattern, nextBlock)
}

function replaceDefaultScalar(source, key, value, allowedValues) {
  if (!allowedValues.includes(value)) return source

  const pattern = new RegExp(`${key}: "(${allowedValues.join("|")})",`)
  if (!pattern.test(source)) {
    throw new Error(`Could not find default ${key} in src/shared/appearance.ts.`)
  }

  return source.replace(pattern, `${key}: "${value}",`)
}

const configPath = await findConfigPath()
const config = JSON.parse(await fs.readFile(configPath, "utf8"))
const source = await fs.readFile(appearanceSourcePath, "utf8")
const eol = source.includes("\r\n") ? "\r\n" : "\n"
const tokenNames = parseTokenNames(source)
const overrides = normalizeTokenMap(config.overrides, tokenNames)
const resolvedTokens = normalizeTokenMap(config.resolvedTokens, tokenNames)

if (Object.keys(overrides).length === 0) {
  throw new Error("The selected appearance config has no valid overrides.")
}

if (Object.keys(resolvedTokens).length === 0) {
  throw new Error("The selected appearance config has no valid resolvedTokens.")
}

let nextSource = replaceTokenMapConst(source, "DEFAULT_APPEARANCE_OVERRIDES", overrides, eol)
nextSource = replaceTokenMapConst(nextSource, "DEFAULT_APPEARANCE_RESOLVED_TOKENS", resolvedTokens, eol)
nextSource = replaceDefaultScalar(nextSource, "brandTheme", config.brandTheme, ["terra", "sage"])
nextSource = replaceDefaultScalar(nextSource, "colorMode", config.colorMode, ["system", "light", "dark"])

await fs.writeFile(appearanceSourcePath, nextSource, "utf8")

console.log(`Promoted appearance defaults from ${configPath}`)
console.log(`Updated ${path.relative(process.cwd(), appearanceSourcePath)}`)
console.log(`Overrides: ${Object.keys(overrides).length}`)
console.log(`Resolved tokens: ${Object.keys(resolvedTokens).length}`)
