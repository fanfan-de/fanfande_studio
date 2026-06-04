import { existsSync } from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const defaultApkPath = path.join(packageRoot, "build", "anybox-mobile-debug.apk")

function usage() {
  return [
    "Anybox Android Debug APK Installer",
    "",
    "Usage:",
    "  pnpm --filter anybox-mobile-app run android:install:debug",
    "  pnpm --filter anybox-mobile-app run android:install:debug -- --apk C:\\path\\app.apk",
  ].join("\n")
}

function parseArgs(argv) {
  const args = {
    apk: defaultApkPath,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === "--help" || value === "-h") args.help = true
    else if (value === "--apk") {
      args.apk = path.resolve(argv[index + 1] ?? args.apk)
      index += 1
    }
  }

  return args
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: "inherit",
    windowsHide: true,
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`)
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }

  if (!existsSync(args.apk)) {
    throw new Error(`APK not found: ${args.apk}`)
  }

  run("adb", ["install", "-r", args.apk])
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
