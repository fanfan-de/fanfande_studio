import type { JSONValue } from "@ai-sdk/provider"
import fs from "node:fs"
import path from "node:path"
import z from "zod"
import * as Tool from "#tool/tool.ts"
import { getProcessEnvValue } from "#env/compat.ts"

const WORKSPACE_DEPENDENCIES_DIR_ENV = "ANYBOX_WORKSPACE_DEPENDENCIES_DIR"
const WORKSPACE_DEPENDENCIES_VERSION_ENV = "ANYBOX_WORKSPACE_DEPENDENCIES_VERSION"
const ANYBOX_NODE_BINARY_ENV = "ANYBOX_NODE_BINARY"
const ANYBOX_NODE_RUN_AS_NODE_ENV = "ANYBOX_NODE_RUN_AS_NODE"

export const WORKSPACE_NODE_PACKAGES = [
  "docx",
  "pptxgenjs",
  "pdfjs-dist",
  "pdf-lib",
  "sharp",
  "image-size",
  "pngjs",
  "jpeg-js",
  "pixelmatch",
  "tesseract.js",
  "jszip",
  "marked",
] as const

export const WORKSPACE_PYTHON_IMPORTS = {
  "python-docx": "docx",
  openpyxl: "openpyxl",
  pandas: "pandas",
  pillow: "PIL",
  pypdf: "pypdf",
  reportlab: "reportlab",
  lxml: "lxml",
  numpy: "numpy",
  pydantic: "pydantic",
  "python-dateutil": "dateutil",
  pdf2image: "pdf2image",
} as const

type RuntimeRef = {
  executable: string
  available: boolean
}

type NodeRuntimeRef = RuntimeRef & {
  packages: string
  env: Record<string, string>
}

type PythonRuntimeRef = RuntimeRef & {
  packages: string
}

type WorkspaceDependenciesData = {
  kind: "workspace-dependencies"
  version: 1
  bundleVersion: string
  dependenciesRoot: string
  bun: RuntimeRef
  node: NodeRuntimeRef
  python: PythonRuntimeRef
  missing: string[]
  notes: string[]
}

function pathExists(target: string | undefined) {
  return Boolean(target && fs.existsSync(target))
}

function readManifest(dependenciesRoot: string | undefined): Record<string, unknown> | undefined {
  if (!dependenciesRoot) return undefined

  try {
    return JSON.parse(fs.readFileSync(path.join(dependenciesRoot, "manifest.json"), "utf8")) as Record<string, unknown>
  } catch {
    return undefined
  }
}

function manifestBundleVersion(manifest: Record<string, unknown> | undefined) {
  const value = manifest?.bundleVersion
  if (typeof value === "string" && value.trim()) return value.trim()
  if (typeof value === "number") return String(value)
  return undefined
}

function resolveNodeExecutable() {
  const configured = getProcessEnvValue(ANYBOX_NODE_BINARY_ENV)?.trim()
  if (configured) return configured

  if (!process.versions.bun) {
    return process.execPath
  }

  return ""
}

function resolvePythonExecutable(pythonRoot: string) {
  if (process.platform === "win32") {
    return path.join(pythonRoot, "python.exe")
  }

  const python3 = path.join(pythonRoot, "bin", "python3")
  if (fs.existsSync(python3)) return python3
  return path.join(pythonRoot, "bin", "python")
}

function resolvePythonSitePackages(pythonRoot: string) {
  const direct = path.join(pythonRoot, "Lib", "site-packages")
  if (fs.existsSync(direct)) return direct

  const libRoot = path.join(pythonRoot, "lib")
  try {
    for (const entry of fs.readdirSync(libRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith("python")) continue
      const candidate = path.join(libRoot, entry.name, "site-packages")
      if (fs.existsSync(candidate)) return candidate
    }
  } catch {
    // Windows embeddable Python uses Lib/site-packages and source runtimes may be absent.
  }

  return direct
}

function formatSummary(data: WorkspaceDependenciesData) {
  const lines = [
    "Workspace dependencies",
    `Root: ${data.dependenciesRoot || "(not configured)"}`,
    `Bundle version: ${data.bundleVersion}`,
    `Bun: ${data.bun.available ? "available" : "unavailable"} (${data.bun.executable || "missing"})`,
    `Node: ${data.node.available ? "available" : "unavailable"} (${data.node.executable || "missing"})`,
    `Node packages: ${data.node.packages || "missing"}`,
    `Python: ${data.python.available ? "available" : "unavailable"} (${data.python.executable || "missing"})`,
    `Python packages: ${data.python.packages || "missing"}`,
  ]

  if (data.missing.length > 0) {
    lines.push("", "Missing:", ...data.missing.map((item) => `- ${item}`))
  }

  if (data.notes.length > 0) {
    lines.push("", "Notes:", ...data.notes.map((item) => `- ${item}`))
  }

  return lines.join("\n")
}

export function loadWorkspaceDependencies(): WorkspaceDependenciesData {
  const dependenciesRoot = getProcessEnvValue(WORKSPACE_DEPENDENCIES_DIR_ENV)?.trim() ?? ""
  const manifest = readManifest(dependenciesRoot)
  const bundleVersion =
    getProcessEnvValue(WORKSPACE_DEPENDENCIES_VERSION_ENV)?.trim() ||
    manifestBundleVersion(manifest) ||
    "unavailable"
  const missing: string[] = []
  const notes: string[] = [
    "This tool only reports bundled runtime and dependency paths; it does not process workspace files.",
  ]

  if (!dependenciesRoot) {
    missing.push(WORKSPACE_DEPENDENCIES_DIR_ENV)
    notes.push(`Set ${WORKSPACE_DEPENDENCIES_DIR_ENV} to a prepared dependencies directory.`)
  } else if (!fs.existsSync(dependenciesRoot)) {
    missing.push(`dependencies root: ${dependenciesRoot}`)
  }

  const bunExecutable = process.execPath
  const bun = {
    executable: bunExecutable,
    available: pathExists(bunExecutable),
  }
  if (!process.versions.bun) {
    notes.push("The current process is not Bun; bun.executable points to the current runtime.")
  }

  const nodeExecutable = resolveNodeExecutable()
  const nodePackages = dependenciesRoot ? path.join(dependenciesRoot, "node", "node_modules") : ""
  const nodeEnv: Record<string, string> =
    getProcessEnvValue(ANYBOX_NODE_RUN_AS_NODE_ENV) === "1"
      ? { ELECTRON_RUN_AS_NODE: "1" }
      : {}
  if (nodeEnv.ELECTRON_RUN_AS_NODE === "1") {
    notes.push("Node uses the Electron executable in Node mode; pass node.env when spawning it.")
  }

  if (!nodeExecutable) {
    missing.push(ANYBOX_NODE_BINARY_ENV)
  } else if (!fs.existsSync(nodeExecutable)) {
    missing.push(`node executable: ${nodeExecutable}`)
  }

  if (!nodePackages || !fs.existsSync(nodePackages)) {
    missing.push(nodePackages ? `node packages: ${nodePackages}` : "node packages")
  }
  for (const packageName of WORKSPACE_NODE_PACKAGES) {
    const packageJson = nodePackages ? path.join(nodePackages, packageName, "package.json") : ""
    if (!packageJson || !fs.existsSync(packageJson)) {
      missing.push(`node package: ${packageName}`)
    }
  }

  const pythonRoot = dependenciesRoot ? path.join(dependenciesRoot, "python") : ""
  const pythonExecutable = pythonRoot ? resolvePythonExecutable(pythonRoot) : ""
  const pythonPackages = pythonRoot
  const pythonSitePackages = pythonRoot ? resolvePythonSitePackages(pythonRoot) : ""

  if (!pythonExecutable) {
    missing.push("python executable")
  } else if (!fs.existsSync(pythonExecutable)) {
    missing.push(`python executable: ${pythonExecutable}`)
  }

  if (!pythonPackages || !fs.existsSync(pythonPackages)) {
    missing.push(pythonPackages ? `python packages: ${pythonPackages}` : "python packages")
  }
  if (!pythonSitePackages || !fs.existsSync(pythonSitePackages)) {
    missing.push(pythonSitePackages ? `python site-packages: ${pythonSitePackages}` : "python site-packages")
  }
  for (const [packageName, importDirectory] of Object.entries(WORKSPACE_PYTHON_IMPORTS)) {
    const importPath = pythonSitePackages ? path.join(pythonSitePackages, importDirectory) : ""
    if (!importPath || !fs.existsSync(importPath)) {
      missing.push(`python package: ${packageName}`)
    }
  }

  const missingSet = new Set(missing)
  const node = {
    executable: nodeExecutable,
    packages: nodePackages,
    env: nodeEnv,
    available:
      pathExists(nodeExecutable) &&
      pathExists(nodePackages) &&
      WORKSPACE_NODE_PACKAGES.every((packageName) =>
        pathExists(path.join(nodePackages, packageName, "package.json")),
      ),
  }
  const python = {
    executable: pythonExecutable,
    packages: pythonPackages,
    available:
      pathExists(pythonExecutable) &&
      pathExists(pythonPackages) &&
      pathExists(pythonSitePackages) &&
      Object.values(WORKSPACE_PYTHON_IMPORTS).every((importDirectory) =>
        pathExists(path.join(pythonSitePackages, importDirectory)),
      ),
  }

  return {
    kind: "workspace-dependencies",
    version: 1,
    bundleVersion,
    dependenciesRoot,
    bun,
    node,
    python,
    missing: [...missingSet],
    notes,
  }
}

export const LoadWorkspaceDependenciesTool = Tool.define(
  "load_workspace_dependencies",
  async () => ({
    title: "Load Workspace Dependencies",
    description: "Return bundled Bun, Node, Python, and common document/PDF/image dependency paths for local scripts.",
    parameters: z.object({}),
    execute: async () => {
      const data = loadWorkspaceDependencies()
      return {
        title: "Workspace dependencies",
        text: formatSummary(data),
        metadata: data,
        data,
      }
    },
    toModelOutput: (output) => ({
      type: "json" as const,
      value: (output.data ?? output.metadata ?? { text: output.text }) as JSONValue,
    }),
  }),
  {
    title: "Load Workspace Dependencies",
    aliases: ["load-workspace-dependencies"],
    capabilities: {
      kind: "read",
      readOnly: true,
      destructive: false,
      concurrency: "safe",
    },
  },
)
