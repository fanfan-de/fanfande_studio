import { readdir, readFile } from "node:fs/promises"
import { dirname, extname, resolve as resolvePath } from "node:path"
import { createRequire } from "node:module"
import * as Env from "#env/env.ts"
import { which } from "#util/which.ts"

const require = createRequire(import.meta.url)

export interface LanguageServerCommand {
  command: string
  args: string[]
  cwd?: string
  env?: Record<string, string>
}

export interface LanguageServerSpec {
  id: string
  label: string
  extensions: string[]
  languageIdForPath(filepath: string): string | undefined
  resolveCommand(): Promise<LanguageServerCommand>
}

const TYPESCRIPT_LANGUAGE_IDS = new Map<string, string>([
  [".ts", "typescript"],
  [".tsx", "typescriptreact"],
  [".js", "javascript"],
  [".jsx", "javascriptreact"],
  [".mts", "typescript"],
  [".cts", "typescript"],
  [".mjs", "javascript"],
  [".cjs", "javascript"],
])

const PYTHON_LANGUAGE_IDS = new Map<string, string>([
  [".py", "python"],
  [".pyi", "python"],
])

function parseArgs(value: string | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) return undefined

  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed
    }
  } catch {
    // fall back to whitespace splitting
  }

  return trimmed.split(/\s+/).filter(Boolean)
}

async function resolvePackageExecutable(
  packageName: string,
  binName: string,
  args: string[],
): Promise<LanguageServerCommand | undefined> {
  try {
    const packageJsonPath = require.resolve(`${packageName}/package.json`)
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      bin?: string | Record<string, string>
    }
    const bin = typeof packageJson.bin === "string"
      ? packageJson.bin
      : packageJson.bin?.[binName] ?? packageJson.bin?.[packageName]

    if (!bin) return undefined

    return {
      command: process.execPath,
      args: [resolvePath(dirname(packageJsonPath), bin), ...args],
    }
  } catch {
    return undefined
  }
}

async function resolveTypeScriptLanguageServerCommand(): Promise<LanguageServerCommand> {
  const env = Env.all()
  const overrideCommand = env["FanFande_LSP_TYPESCRIPT_SERVER_COMMAND"]?.trim()
  const overrideArgs = parseArgs(env["FanFande_LSP_TYPESCRIPT_SERVER_ARGS"])

  if (overrideCommand) {
    return {
      command: overrideCommand,
      args: overrideArgs ?? ["--stdio"],
    }
  }

  const bundled = await resolvePackageExecutable(
    "typescript-language-server",
    "typescript-language-server",
    ["--stdio"],
  )
  if (bundled) return bundled

  const fromPath = which("typescript-language-server", env) ?? which("typescript-language-server.cmd", env)
  if (fromPath) {
    return {
      command: fromPath,
      args: ["--stdio"],
    }
  }

  throw new Error(
    "TypeScript LSP server is unavailable. Install 'typescript-language-server' or set FanFande_LSP_TYPESCRIPT_SERVER_COMMAND/FanFande_LSP_TYPESCRIPT_SERVER_ARGS.",
  )
}

async function resolvePythonLanguageServerCommand(): Promise<LanguageServerCommand> {
  const env = Env.all()
  const overrideCommand = env["FanFande_LSP_PYTHON_SERVER_COMMAND"]?.trim()
  const overrideArgs = parseArgs(env["FanFande_LSP_PYTHON_SERVER_ARGS"])

  if (overrideCommand) {
    return {
      command: overrideCommand,
      args: overrideArgs ?? ["--stdio"],
    }
  }

  const bundled = await resolvePackageExecutable(
    "pyright",
    "pyright-langserver",
    ["--stdio"],
  )
  if (bundled) return bundled

  const fromPath = which("pyright-langserver", env) ?? which("pyright-langserver.cmd", env)
  if (fromPath) {
    return {
      command: fromPath,
      args: ["--stdio"],
    }
  }

  throw new Error(
    "Python LSP server is unavailable. Install 'pyright' or set FanFande_LSP_PYTHON_SERVER_COMMAND/FanFande_LSP_PYTHON_SERVER_ARGS.",
  )
}

const TypeScriptLanguageServer: LanguageServerSpec = {
  id: "typescript",
  label: "TypeScript",
  extensions: [...TYPESCRIPT_LANGUAGE_IDS.keys()],
  languageIdForPath(filepath: string) {
    return TYPESCRIPT_LANGUAGE_IDS.get(extname(filepath).toLowerCase())
  },
  async resolveCommand() {
    return await resolveTypeScriptLanguageServerCommand()
  },
}

const PythonLanguageServer: LanguageServerSpec = {
  id: "python",
  label: "Python",
  extensions: [...PYTHON_LANGUAGE_IDS.keys()],
  languageIdForPath(filepath: string) {
    return PYTHON_LANGUAGE_IDS.get(extname(filepath).toLowerCase())
  },
  async resolveCommand() {
    return await resolvePythonLanguageServerCommand()
  },
}

const KNOWN_LANGUAGE_SERVERS = [
  TypeScriptLanguageServer,
  PythonLanguageServer,
] satisfies LanguageServerSpec[]

async function scoreLanguageServerForDirectory(spec: LanguageServerSpec, directory: string) {
  let score = 0

  try {
    const entries = await readdir(directory, { withFileTypes: true })
    const fileNames = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name.toLowerCase()))

    if (spec.id === "typescript") {
      if (fileNames.has("tsconfig.json")) score += 6
      if (fileNames.has("jsconfig.json")) score += 4
      if (fileNames.has("package.json")) score += 2
    }

    if (spec.id === "python") {
      if (fileNames.has("pyproject.toml")) score += 6
      if (fileNames.has("requirements.txt")) score += 3
      if (fileNames.has("setup.py")) score += 3
      if (fileNames.has("setup.cfg")) score += 2
      if (fileNames.has(".python-version")) score += 1
    }

    const queue = entries
      .filter((entry) => entry.isFile() || entry.isDirectory())
      .map((entry) => ({
        depth: 0,
        path: resolvePath(directory, entry.name),
        isDirectory: entry.isDirectory(),
        name: entry.name,
      }))

    while (queue.length > 0) {
      const current = queue.shift()!
      if (current.isDirectory) {
        if (current.depth >= 1) continue
        if (current.name.startsWith(".") || current.name === "node_modules" || current.name === "__pycache__") {
          continue
        }

        const children = await readdir(current.path, { withFileTypes: true }).catch(() => [])
        for (const child of children) {
          if (!child.isFile() && !child.isDirectory()) continue
          queue.push({
            depth: current.depth + 1,
            path: resolvePath(current.path, child.name),
            isDirectory: child.isDirectory(),
            name: child.name,
          })
        }
        continue
      }

      if (spec.languageIdForPath(current.path)) {
        score += 1
      }
    }
  } catch {
    return score
  }

  return score
}

export function languageForFile(filepath: string): LanguageServerSpec | undefined {
  for (const spec of KNOWN_LANGUAGE_SERVERS) {
    if (spec.languageIdForPath(filepath)) {
      return spec
    }
  }

  return undefined
}

export async function languageForWorkspacePath(targetPath?: string) {
  if (!targetPath) {
    return TypeScriptLanguageServer
  }

  const fromFile = languageForFile(targetPath)
  if (fromFile) return fromFile

  const scored = await Promise.all(
    KNOWN_LANGUAGE_SERVERS.map(async (spec) => ({
      spec,
      score: await scoreLanguageServerForDirectory(spec, targetPath),
    })),
  )

  scored.sort((left, right) => right.score - left.score)
  return scored[0]?.score && scored[0].score > 0 ? scored[0].spec : TypeScriptLanguageServer
}

export function supportedLanguageExtensions() {
  return KNOWN_LANGUAGE_SERVERS.flatMap((spec) => spec.extensions)
}
