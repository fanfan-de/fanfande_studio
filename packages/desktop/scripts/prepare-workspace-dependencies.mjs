import { spawnSync } from "node:child_process"
import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const desktopDir = path.resolve(scriptDir, "..")
const runtimeDir = path.join(desktopDir, "build", "agent-runtime")
const cacheDir = path.join(desktopDir, "build", "workspace-dependencies-cache")
const dependenciesDir = path.join(runtimeDir, "dependencies")
const bundleVersion = "1.0.0"
const pythonVersion = "3.12.10"
const pythonTag = pythonVersion.replaceAll(".", "")
const pythonEmbeddedZip = `python-${pythonVersion}-embed-amd64.zip`
const pythonEmbeddedUrl = `https://www.python.org/ftp/python/${pythonVersion}/${pythonEmbeddedZip}`
const getPipUrl = "https://bootstrap.pypa.io/get-pip.py"

export const NODE_PACKAGES = {
  docx: "9.6.1",
  pptxgenjs: "4.0.1",
  "pdfjs-dist": "5.6.205",
  "pdf-lib": "1.17.1",
  sharp: "0.34.5",
  "image-size": "1.2.1",
  pngjs: "7.0.0",
  "jpeg-js": "0.4.4",
  pixelmatch: "7.1.0",
  "tesseract.js": "7.0.0",
  jszip: "3.10.1",
  marked: "17.0.5",
}

export const PYTHON_PACKAGES = {
  "python-docx": "1.2.0",
  openpyxl: "3.1.5",
  pandas: "3.0.1",
  pillow: "12.2.0",
  pypdf: "6.10.0",
  reportlab: "4.4.9",
  lxml: "6.0.2",
  numpy: "2.3.5",
  pydantic: "2.13.3",
  "python-dateutil": "2.9.0.post0",
  pdf2image: "1.17.0",
}

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

async function downloadFile(url, target) {
  if (await pathExists(target)) return

  console.log(`[desktop][build] downloading ${url}`)
  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`)
  }

  const bytes = Buffer.from(await response.arrayBuffer())
  await fsp.mkdir(path.dirname(target), { recursive: true })
  await fsp.writeFile(target, bytes)
}

function expandArchive(zipPath, targetDir) {
  run("powershell.exe", [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `Expand-Archive -LiteralPath '${zipPath.replaceAll("'", "''")}' -DestinationPath '${targetDir.replaceAll("'", "''")}' -Force`,
  ])
}

async function writeJson(filePath, data) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true })
  await fsp.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8")
}

async function prepareNodeDependencies(input) {
  const nodeDir = path.join(input.dependenciesDir, "node")
  const nodeModulesDir = path.join(nodeDir, "node_modules")

  await fsp.mkdir(nodeDir, { recursive: true })
  await writeJson(path.join(nodeDir, "package.json"), {
    name: "fanfande-workspace-node-dependencies",
    private: true,
    type: "module",
    dependencies: NODE_PACKAGES,
    trustedDependencies: ["sharp"],
  })

  console.log(`[desktop][build] installing workspace Node dependencies into ${nodeDir}`)
  run(input.bunBinary, ["install", "--cwd", nodeDir], { cwd: nodeDir })

  for (const packageName of Object.keys(NODE_PACKAGES)) {
    if (!(await pathExists(path.join(nodeModulesDir, packageName, "package.json")))) {
      throw new Error(`Workspace Node dependency was not installed: ${packageName}`)
    }
  }
}

async function updatePythonPathFile(pythonDir) {
  const pthPath = path.join(pythonDir, `python${pythonTag.slice(0, 3)}._pth`)
  let content = await fsp.readFile(pthPath, "utf8")
  if (!content.includes("Lib\\site-packages")) {
    content = content.replace(/(^|\r?\n)#?import site(\r?\n|$)/, "$1Lib\\site-packages\r\nimport site$2")
  }
  if (!content.includes("import site")) {
    content = `${content.trimEnd()}\r\nimport site\r\n`
  }
  await fsp.writeFile(pthPath, content, "utf8")
}

async function preparePythonDependencies(input) {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error("Workspace Python dependencies are currently supported only on Windows x64.")
  }

  const pythonDir = path.join(input.dependenciesDir, "python")
  const pythonExe = path.join(pythonDir, "python.exe")
  const sitePackagesDir = path.join(pythonDir, "Lib", "site-packages")
  const zipPath = path.join(cacheDir, pythonEmbeddedZip)
  const getPipPath = path.join(cacheDir, "get-pip.py")

  await fsp.rm(pythonDir, { recursive: true, force: true })
  await fsp.mkdir(pythonDir, { recursive: true })
  await downloadFile(pythonEmbeddedUrl, zipPath)
  expandArchive(zipPath, pythonDir)
  await fsp.mkdir(sitePackagesDir, { recursive: true })
  await updatePythonPathFile(pythonDir)
  await downloadFile(getPipUrl, getPipPath)

  console.log(`[desktop][build] bootstrapping pip for workspace Python at ${pythonDir}`)
  run(pythonExe, [getPipPath, "--no-warn-script-location"], { cwd: pythonDir })

  const requirementsPath = path.join(input.dependenciesDir, "python-requirements.txt")
  const requirements = Object.entries(PYTHON_PACKAGES)
    .map(([name, version]) => `${name}==${version}`)
    .join("\n")
  await fsp.writeFile(requirementsPath, `${requirements}\n`, "utf8")

  console.log(`[desktop][build] installing workspace Python dependencies into ${sitePackagesDir}`)
  run(
    pythonExe,
    [
      "-m",
      "pip",
      "install",
      "--no-warn-script-location",
      "--only-binary=:all:",
      "-r",
      requirementsPath,
    ],
    { cwd: pythonDir },
  )
}

async function writeManifest(input) {
  await writeJson(path.join(input.dependenciesDir, "manifest.json"), {
    kind: "fanfande-workspace-dependencies",
    version: 1,
    bundleVersion,
    platform: process.platform,
    arch: process.arch,
    generatedAt: new Date().toISOString(),
    nodePackages: NODE_PACKAGES,
    pythonPackages: PYTHON_PACKAGES,
  })
}

export async function prepareWorkspaceDependencies(options = {}) {
  const input = {
    bunBinary: options.bunBinary,
    dependenciesDir: options.dependenciesDir ?? dependenciesDir,
  }

  if (!input.bunBinary) {
    throw new Error("prepareWorkspaceDependencies requires a bunBinary option.")
  }

  await fsp.rm(input.dependenciesDir, { recursive: true, force: true })
  await fsp.mkdir(input.dependenciesDir, { recursive: true })

  await prepareNodeDependencies(input)
  await preparePythonDependencies(input)
  await writeManifest(input)

  console.log(`[desktop][build] prepared workspace dependencies at ${input.dependenciesDir}`)
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const explicitBunBinary = process.env.FANFANDE_BUN_BINARY?.trim()
  if (!explicitBunBinary || !fs.existsSync(explicitBunBinary)) {
    throw new Error("Set FANFANDE_BUN_BINARY to run this script directly.")
  }
  await prepareWorkspaceDependencies({ bunBinary: explicitBunBinary })
}
