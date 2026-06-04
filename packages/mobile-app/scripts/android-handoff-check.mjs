import { existsSync } from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const repoRoot = path.resolve(packageRoot, "..", "..")
const desktopRoot = path.join(repoRoot, "packages", "desktop")
const vitestBin = path.join(desktopRoot, "node_modules", "vitest", "vitest.mjs")

function usage() {
  return [
    "Anybox Android Handoff Check",
    "",
    "Usage:",
    "  pnpm --filter anybox-mobile-app run android:handoff-check",
    "  pnpm --filter anybox-mobile-app run android:handoff-check -- --with-device",
    "  pnpm --filter anybox-mobile-app run android:handoff-check -- --use-desktop-handoff",
    "  pnpm --filter anybox-mobile-app run android:handoff-check -- --real-bridge-url \"anybox-mobile://connect?url=...\"",
    "",
    "Options:",
    "  --skip-build              Do not rebuild the debug APK before checking artifacts.",
    "  --with-device             Run launch and mock pairing Android smoke tests.",
    "  --real-bridge-url <url>   Run the installed APK against a real desktop bridge URL/deep link.",
    "  --use-desktop-handoff     Read the desktop handoff JSON for the real bridge smoke URL.",
    "  --require-real-bridge     Require the real bridge screenshot in delivery-check.",
    "  --help                    Show this help.",
  ].join("\n")
}

function parseArgs(argv) {
  const args = {
    help: false,
    realBridgeUrl: "",
    requireRealBridge: false,
    skipBuild: false,
    useDesktopHandoff: false,
    withDevice: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === "--") {
      continue
    } else if (value === "--help" || value === "-h") {
      args.help = true
    } else if (value === "--skip-build") {
      args.skipBuild = true
    } else if (value === "--with-device") {
      args.withDevice = true
    } else if (value === "--real-bridge-url") {
      args.realBridgeUrl = argv[index + 1] ?? ""
      args.withDevice = true
      args.requireRealBridge = true
      index += 1
    } else if (value === "--use-desktop-handoff") {
      args.useDesktopHandoff = true
      args.withDevice = true
      args.requireRealBridge = true
    } else if (value === "--require-real-bridge") {
      args.requireRealBridge = true
    }
  }

  return args
}

function getPnpmRunner(args) {
  const pnpmCli = process.env.npm_execpath
  if (pnpmCli && existsSync(pnpmCli)) {
    return {
      args: [pnpmCli, ...args],
      command: process.execPath,
      shell: false,
    }
  }

  return {
    args: ["pnpm", ...args],
    command: process.platform === "win32" ? "corepack.cmd" : "corepack",
    shell: process.platform === "win32",
  }
}

function runStep(label, command, args, options = {}) {
  console.log("")
  console.log(`==> ${label}`)
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    shell: options.shell ?? false,
    stdio: "inherit",
    windowsHide: true,
  })

  if (result.status !== 0) {
    const detail = result.error ? `: ${result.error.message}` : ""
    throw new Error(`${label} failed${detail}`)
  }
}

function runPnpmStep(label, args, options = {}) {
  const runner = getPnpmRunner(args)
  runStep(label, runner.command, runner.args, {
    ...options,
    shell: runner.shell,
  })
}

function assertWorkspace() {
  if (!existsSync(path.join(repoRoot, "package.json"))) {
    throw new Error(`Unable to locate repository root from ${packageRoot}`)
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }

  assertWorkspace()
  console.log("Anybox Android Handoff Check")

  runPnpmStep("desktop typecheck", ["--filter", "anybox-desktop-agent", "typecheck"])
  runPnpmStep("mobile typecheck", ["--filter", "anybox-mobile-app", "typecheck"])
  runStep(
    "mobile bridge focused tests",
    process.execPath,
    [vitestBin, "run", "src/main/mobile-bridge-server.test.ts", "src/renderer/src/app/connections/MobileConnectionPage.test.tsx"],
    { cwd: desktopRoot },
  )

  if (!args.skipBuild) {
    runPnpmStep("Android debug APK build", ["mobile:android:build:debug"])
  }

  if (args.withDevice) {
    runPnpmStep("Android launch smoke", ["mobile:android:smoke:debug"])
    runPnpmStep("Android mock pairing smoke", ["mobile:android:smoke:pairing"])
  } else {
    console.log("")
    console.log("[skip] Android device smoke: pass --with-device to run launch and mock pairing smoke tests.")
  }

  if (args.realBridgeUrl || args.useDesktopHandoff) {
    const smokeArgs = ["mobile:android:smoke:bridge"]
    if (args.realBridgeUrl) {
      smokeArgs.push("--", "--url", args.realBridgeUrl)
    }
    runPnpmStep("Android real bridge smoke", smokeArgs)
  } else {
    console.log("")
    console.log("[skip] Android real bridge smoke: pass --real-bridge-url with the desktop Mobile Connection URL/deep link.")
  }

  const deliveryArgs = ["mobile:android:delivery-check", "--", "--strict"]
  if (args.requireRealBridge) deliveryArgs.push("--require-real-bridge")
  runPnpmStep("Android delivery check", deliveryArgs)

  console.log("")
  console.log("Android handoff check passed.")
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
