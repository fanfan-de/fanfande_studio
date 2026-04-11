const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

function findRcedit(projectDir) {
  let currentDir = projectDir

  for (;;) {
    const directCandidate = path.join(currentDir, "node_modules", "electron-winstaller", "vendor", "rcedit.exe")
    if (fs.existsSync(directCandidate)) {
      return directCandidate
    }

    const pnpmDir = path.join(currentDir, "node_modules", ".pnpm")
    if (fs.existsSync(pnpmDir)) {
      const packageDirs = fs.readdirSync(pnpmDir, { withFileTypes: true })
      for (const entry of packageDirs) {
        if (!entry.isDirectory() || !entry.name.startsWith("electron-winstaller@")) continue

        const candidate = path.join(
          pnpmDir,
          entry.name,
          "node_modules",
          "electron-winstaller",
          "vendor",
          "rcedit.exe",
        )
        if (fs.existsSync(candidate)) {
          return candidate
        }
      }
    }

    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) {
      return null
    }
    currentDir = parentDir
  }
}

module.exports = async function afterPack(context) {
  if (process.platform !== "win32") return

  const projectDir = context.packager.projectDir
  const executablePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`)
  const iconPath = path.join(projectDir, "build", "icon.ico")

  if (!fs.existsSync(executablePath)) {
    throw new Error(`[desktop][build] executable not found for icon patch: ${executablePath}`)
  }
  if (!fs.existsSync(iconPath)) {
    throw new Error(`[desktop][build] icon file not found: ${iconPath}`)
  }

  const rceditPath = findRcedit(projectDir)
  if (!rceditPath) {
    throw new Error("[desktop][build] Unable to locate rcedit.exe for Windows icon patching.")
  }

  const result = spawnSync(rceditPath, [executablePath, "--set-icon", iconPath], {
    stdio: "inherit",
    windowsHide: true,
  })

  if (result.status !== 0) {
    throw new Error(`[desktop][build] rcedit failed while patching ${executablePath}`)
  }

  console.log(`[desktop][build] patched Windows executable icon: ${executablePath}`)
}
