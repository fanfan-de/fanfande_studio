import { existsSync, mkdirSync, statSync } from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const defaultApkPath = path.join(packageRoot, "build", "anybox-mobile-debug.apk")
const defaultScreenshotPath = path.join(packageRoot, "build", "anybox-mobile-launch.png")
const defaultPackageName = "studio.fanfande.anybox.mobile"
const remoteScreenshotPath = "/sdcard/anybox-mobile-launch-smoke.png"
const remoteWindowPath = "/sdcard/anybox-mobile-window-smoke.xml"

const fatalLogPatterns = [
  /FATAL EXCEPTION/i,
  /\bE AndroidRuntime\b.*FATAL/i,
  /Unable to load script/i,
  /Cannot find native module/i,
  /Invariant Violation/i,
  /ReactNativeJS.*(?:Error|TypeError|ReferenceError)/i,
]

function usage() {
  return [
    "Anybox Android Debug Launch Smoke Test",
    "",
    "Usage:",
    "  pnpm --filter anybox-mobile-app run android:smoke:debug",
    "  pnpm --filter anybox-mobile-app run android:smoke:debug -- --skip-install",
    "",
    "Options:",
    "  --apk <path>          APK path. Defaults to build/anybox-mobile-debug.apk.",
    "  --package <name>      Android application ID.",
    "  --screenshot <path>   Local screenshot output path.",
    "  --wait <seconds>      Max seconds to wait for the ready UI. Defaults to 20.",
    "  --skip-install        Reuse the app already installed on the connected device.",
    "  --keep-data           Do not clear app data before launch.",
    "  --help                Show this help.",
  ].join("\n")
}

function parseArgs(argv) {
  const args = {
    apk: defaultApkPath,
    help: false,
    keepData: false,
    packageName: defaultPackageName,
    screenshot: defaultScreenshotPath,
    skipInstall: false,
    waitSeconds: 20,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === "--help" || value === "-h") {
      args.help = true
    } else if (value === "--apk") {
      args.apk = path.resolve(argv[index + 1] ?? args.apk)
      index += 1
    } else if (value === "--package") {
      args.packageName = argv[index + 1] ?? args.packageName
      index += 1
    } else if (value === "--screenshot") {
      args.screenshot = path.resolve(argv[index + 1] ?? args.screenshot)
      index += 1
    } else if (value === "--wait") {
      const parsed = Number(argv[index + 1])
      args.waitSeconds = Number.isFinite(parsed) && parsed > 0 ? parsed : args.waitSeconds
      index += 1
    } else if (value === "--skip-install") {
      args.skipInstall = true
    } else if (value === "--keep-data") {
      args.keepData = true
    }
  }

  return args
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: options.encoding ?? "utf8",
    stdio: options.stdio ?? "inherit",
    windowsHide: true,
  })

  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`)
  }

  return result
}

function read(command, args, options = {}) {
  const result = run(command, args, {
    ...options,
    stdio: "pipe",
  })
  return {
    ok: result.status === 0,
    stderr: result.stderr?.toString() ?? "",
    stdout: result.stdout?.toString() ?? "",
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function requireConnectedDevice() {
  const devices = read("adb", ["devices"])
  const activeDevices = devices.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("List of devices"))
    .filter((line) => /\tdevice$/.test(line))

  if (!activeDevices.length) {
    throw new Error("No adb device is connected. Start an emulator or connect an Android device with USB debugging enabled.")
  }

  console.log(`adb device: ${activeDevices[0]?.split(/\s+/)[0]}`)
}

function prepareInteractiveDevice() {
  run("adb", ["shell", "input", "keyevent", "224"], { allowFailure: true })
  run("adb", ["shell", "wm", "dismiss-keyguard"], { allowFailure: true })
  run("adb", ["shell", "cmd", "statusbar", "collapse"], { allowFailure: true })
}

function assertApkExists(apkPath) {
  if (!existsSync(apkPath)) {
    throw new Error(`APK not found: ${apkPath}. Build it first with corepack pnpm mobile:android:build:debug`)
  }
}

function findFatalLogLines(logcat) {
  return logcat
    .split(/\r?\n/)
    .filter((line) => fatalLogPatterns.some((pattern) => pattern.test(line)))
}

function dumpWindowHierarchy() {
  const dumped = read("adb", ["shell", "uiautomator", "dump", remoteWindowPath], { allowFailure: true })
  if (!dumped.ok) return ""

  const hierarchy = read("adb", ["shell", "cat", remoteWindowPath], { allowFailure: true })
  run("adb", ["shell", "rm", remoteWindowPath], { allowFailure: true })
  return hierarchy.stdout
}

async function waitForReadyUi(packageName, timeoutSeconds) {
  const deadline = Date.now() + timeoutSeconds * 1000
  let lastHierarchy = ""

  while (Date.now() < deadline) {
    await sleep(1000)
    prepareInteractiveDevice()
    lastHierarchy = dumpWindowHierarchy()
    const isAppWindow = lastHierarchy.includes(`package="${packageName}"`)
    const hasConnectScreen = lastHierarchy.includes('text="Anybox"') && lastHierarchy.includes('text="Connect"')
    const hasAccountScreen = lastHierarchy.includes('text="Account"') && lastHierarchy.includes('text="Email sign in"')
    if (isAppWindow && (hasConnectScreen || hasAccountScreen)) return
  }

  const visibleText = [...lastHierarchy.matchAll(/text="([^"]*)"/g)]
    .map((match) => match[1])
    .filter(Boolean)
    .slice(0, 12)
    .join(", ")
  const suffix = visibleText ? ` Visible text: ${visibleText}` : ""
  throw new Error(`Ready UI was not visible within ${timeoutSeconds} seconds.${suffix}`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }

  requireConnectedDevice()
  prepareInteractiveDevice()
  if (!args.skipInstall) {
    assertApkExists(args.apk)
    run("adb", ["install", "-r", "-g", args.apk])
  }

  if (!args.keepData) {
    run("adb", ["shell", "pm", "clear", args.packageName])
  }

  run("adb", ["logcat", "-c"])
  prepareInteractiveDevice()
  run("adb", ["shell", "monkey", "-p", args.packageName, "-c", "android.intent.category.LAUNCHER", "1"])
  await waitForReadyUi(args.packageName, args.waitSeconds)

  const pid = read("adb", ["shell", "pidof", args.packageName], { allowFailure: true }).stdout.trim()
  if (!pid) {
    throw new Error(`App process is not running after launch: ${args.packageName}`)
  }

  mkdirSync(path.dirname(args.screenshot), { recursive: true })
  run("adb", ["shell", "screencap", "-p", remoteScreenshotPath])
  run("adb", ["pull", remoteScreenshotPath, args.screenshot])
  run("adb", ["shell", "rm", remoteScreenshotPath], { allowFailure: true })

  const screenshotSize = statSync(args.screenshot).size
  if (screenshotSize < 4096) {
    throw new Error(`Screenshot looks too small to be valid: ${args.screenshot} (${screenshotSize} bytes)`)
  }

  const logcat = read("adb", ["logcat", "-d", "-t", "600"], { allowFailure: true }).stdout
  const fatalLines = findFatalLogLines(logcat)
  if (fatalLines.length) {
    console.error(fatalLines.slice(0, 40).join("\n"))
    throw new Error("Android launch smoke failed: fatal startup log lines were found.")
  }

  console.log(`App process: ${pid}`)
  console.log(`Screenshot: ${args.screenshot}`)
  console.log("Android launch smoke passed.")
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
