import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const repoRoot = path.resolve(packageRoot, "..", "..")
const defaultApkPath = path.join(packageRoot, "build", "anybox-mobile-debug.apk")
const defaultLaunchScreenshotPath = path.join(packageRoot, "build", "anybox-mobile-launch.png")
const defaultPairingScreenshotPath = path.join(packageRoot, "build", "anybox-mobile-pairing.png")
const defaultRealBridgeScreenshotPath = path.join(packageRoot, "build", "anybox-mobile-real-bridge.png")
const defaultManifestPath = path.join(packageRoot, "build", "anybox-mobile-delivery.json")
const minApkBytes = 10 * 1024 * 1024
const minScreenshotBytes = 4096

function usage() {
  return [
    "Anybox Android Delivery Check",
    "",
    "Usage:",
    "  pnpm --filter anybox-mobile-app run android:delivery-check",
    "  pnpm --filter anybox-mobile-app run android:delivery-check -- --require-real-bridge",
    "",
    "Options:",
    "  --apk <path>              APK path. Defaults to build/anybox-mobile-debug.apk.",
    "  --manifest <path>         Delivery manifest output. Defaults to build/anybox-mobile-delivery.json.",
    "  --no-manifest            Do not write the delivery manifest.",
    "  --require-real-bridge     Require the real desktop bridge smoke screenshot.",
    "  --strict                  Fail when the APK is older than mobile runtime source files.",
    "  --help                    Show this help.",
  ].join("\n")
}

function parseArgs(argv) {
  const args = {
    apk: defaultApkPath,
    help: false,
    manifest: defaultManifestPath,
    requireRealBridge: false,
    strict: false,
    writeManifest: true,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === "--help" || value === "-h") {
      args.help = true
    } else if (value === "--apk") {
      args.apk = path.resolve(argv[index + 1] ?? args.apk)
      index += 1
    } else if (value === "--manifest") {
      args.manifest = path.resolve(argv[index + 1] ?? args.manifest)
      index += 1
    } else if (value === "--no-manifest") {
      args.writeManifest = false
    } else if (value === "--require-real-bridge") {
      args.requireRealBridge = true
    } else if (value === "--strict") {
      args.strict = true
    }
  }

  return args
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"))
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function formatTime(milliseconds) {
  return new Date(milliseconds).toLocaleString()
}

function pass(label, detail) {
  console.log(`[ok] ${label}${detail ? `: ${detail}` : ""}`)
}

function warn(label, detail) {
  console.log(`[warn] ${label}${detail ? `: ${detail}` : ""}`)
}

function fail(failures, label, detail) {
  failures.push(`${label}${detail ? `: ${detail}` : ""}`)
  console.log(`[missing] ${label}${detail ? `: ${detail}` : ""}`)
}

function checkFile(failures, label, filePath, minBytes, required = true) {
  if (!existsSync(filePath)) {
    if (required) fail(failures, label, filePath)
    else warn(label, `${filePath} not found`)
    return null
  }

  const stats = statSync(filePath)
  if (stats.size < minBytes) {
    fail(failures, label, `${filePath} is too small (${formatBytes(stats.size)})`)
    return stats
  }

  pass(label, `${filePath} (${formatBytes(stats.size)}, ${formatTime(stats.mtimeMs)})`)
  return stats
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex")
}

function artifactManifest(filePath, stats) {
  if (!stats) {
    return {
      exists: false,
      path: filePath,
    }
  }

  return {
    exists: true,
    path: filePath,
    sha256: sha256File(filePath),
    size: stats.size,
    updatedAt: new Date(stats.mtimeMs).toISOString(),
  }
}

function writeDeliveryManifest(filePath, manifest) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
  pass("delivery manifest", filePath)
}

function walkFiles(directory) {
  const entries = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      entries.push(...walkFiles(entryPath))
    } else if (entry.isFile()) {
      entries.push(entryPath)
    }
  }
  return entries
}

function getLatestRuntimeSourceTime() {
  const sourceFiles = [
    path.join(packageRoot, "app.json"),
    path.join(packageRoot, "babel.config.js"),
    ...walkFiles(path.join(packageRoot, "app")),
    ...walkFiles(path.join(packageRoot, "src")),
  ]
  return sourceFiles.reduce((latest, filePath) => Math.max(latest, statSync(filePath).mtimeMs), 0)
}

function checkScript(failures, packageJson, name, command) {
  if (packageJson.scripts?.[name] === command) {
    pass(`script ${name}`, command)
  } else {
    fail(failures, `script ${name}`, `expected ${command}`)
  }
}

function checkRootScript(failures, packageJson, name, command) {
  if (packageJson.scripts?.[name] === command) {
    pass(`root script ${name}`, command)
  } else {
    fail(failures, `root script ${name}`, `expected ${command}`)
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }

  const failures = []
  const appConfig = readJson(path.join(packageRoot, "app.json"))
  const mobilePackage = readJson(path.join(packageRoot, "package.json"))
  const rootPackage = readJson(path.join(repoRoot, "package.json"))

  console.log("Anybox Android Delivery Check")
  console.log("")

  const apkStats = checkFile(failures, "debug APK", args.apk, minApkBytes)
  const launchScreenshotStats = checkFile(failures, "launch smoke screenshot", defaultLaunchScreenshotPath, minScreenshotBytes)
  const pairingScreenshotStats = checkFile(failures, "pairing smoke screenshot", defaultPairingScreenshotPath, minScreenshotBytes)
  const realBridgeScreenshotStats = checkFile(
    failures,
    "real bridge smoke screenshot",
    defaultRealBridgeScreenshotPath,
    minScreenshotBytes,
    args.requireRealBridge,
  )

  if (appConfig.expo?.scheme === "anybox-mobile") {
    pass("deep link scheme", "anybox-mobile")
  } else {
    fail(failures, "deep link scheme", "expected expo.scheme to be anybox-mobile")
  }

  if (appConfig.expo?.android?.package === "com.anybox.mobile") {
    pass("Android package", "com.anybox.mobile")
  } else {
    fail(failures, "Android package", "expected com.anybox.mobile")
  }

  if (appConfig.expo?.android?.usesCleartextTraffic === true) {
    pass("LAN HTTP cleartext", "enabled for desktop bridge MVP")
  } else {
    fail(failures, "LAN HTTP cleartext", "expected expo.android.usesCleartextTraffic=true")
  }

  const permissions = appConfig.expo?.android?.permissions ?? []
  if (Array.isArray(permissions) && (permissions.includes("INTERNET") || permissions.includes("android.permission.INTERNET"))) {
    pass("Android INTERNET permission")
  } else {
    fail(failures, "Android INTERNET permission", "missing INTERNET")
  }

  const plugins = appConfig.expo?.plugins ?? []
  const hasSecureStorePlugin =
    Array.isArray(plugins) &&
    plugins.some((plugin) => (Array.isArray(plugin) ? plugin[0] === "expo-secure-store" : plugin === "expo-secure-store"))
  if (hasSecureStorePlugin) {
    pass("secure token storage plugin", "expo-secure-store")
  } else {
    fail(failures, "secure token storage plugin", "missing expo-secure-store in app.json plugins")
  }

  if (mobilePackage.dependencies?.["expo-secure-store"]) {
    pass("secure token storage dependency", `expo-secure-store ${mobilePackage.dependencies["expo-secure-store"]}`)
  } else {
    fail(failures, "secure token storage dependency", "missing expo-secure-store")
  }

  const connectionStateSource = readFileSync(path.join(packageRoot, "src", "state", "connection.tsx"), "utf8")
  if (connectionStateSource.includes('from "expo-secure-store"') && !connectionStateSource.includes("AsyncStorage")) {
    pass("device token persistence", "SecureStore")
  } else {
    fail(failures, "device token persistence", "expected src/state/connection.tsx to use expo-secure-store without AsyncStorage")
  }

  checkScript(failures, mobilePackage, "android:build:debug", "node ./scripts/build-android-debug.mjs")
  checkScript(failures, mobilePackage, "android:smoke:debug", "node ./scripts/android-launch-smoke.mjs")
  checkScript(failures, mobilePackage, "android:smoke:pairing", "node ./scripts/android-pairing-smoke.mjs")
  checkScript(failures, mobilePackage, "android:smoke:bridge", "node ./scripts/android-real-bridge-smoke.mjs")
  checkScript(failures, mobilePackage, "android:delivery-check", "node ./scripts/android-delivery-check.mjs")
  checkScript(failures, mobilePackage, "android:handoff-check", "node ./scripts/android-handoff-check.mjs")
  checkRootScript(failures, rootPackage, "mobile:android:build:debug", "corepack pnpm --filter anybox-mobile-app run android:build:debug")
  checkRootScript(failures, rootPackage, "mobile:android:smoke:debug", "corepack pnpm --filter anybox-mobile-app run android:smoke:debug")
  checkRootScript(failures, rootPackage, "mobile:android:smoke:pairing", "corepack pnpm --filter anybox-mobile-app run android:smoke:pairing")
  checkRootScript(failures, rootPackage, "mobile:android:smoke:bridge", "corepack pnpm --filter anybox-mobile-app run android:smoke:bridge")
  checkRootScript(failures, rootPackage, "mobile:android:delivery-check", "corepack pnpm --filter anybox-mobile-app run android:delivery-check")
  checkRootScript(failures, rootPackage, "mobile:android:handoff-check", "corepack pnpm --filter anybox-mobile-app run android:handoff-check")

  if (apkStats) {
    const latestSourceTime = getLatestRuntimeSourceTime()
    if (apkStats.mtimeMs >= latestSourceTime) {
      pass("APK freshness", "newer than mobile runtime source")
    } else if (args.strict) {
      fail(failures, "APK freshness", "APK is older than mobile runtime source; rebuild with corepack pnpm mobile:android:build:debug")
    } else {
      warn("APK freshness", "APK is older than mobile runtime source; run with --strict to fail this check")
    }
  }

  console.log("")
  if (failures.length) {
    console.log("Android delivery check failed:")
    for (const item of failures) console.log(`- ${item}`)
    process.exit(1)
  }

  if (args.writeManifest) {
    writeDeliveryManifest(args.manifest, {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      app: {
        name: mobilePackage.name,
        version: mobilePackage.version,
      },
      android: {
        package: appConfig.expo?.android?.package,
        permissions,
        scheme: appConfig.expo?.scheme,
        usesCleartextTraffic: appConfig.expo?.android?.usesCleartextTraffic === true,
      },
      artifacts: {
        debugApk: artifactManifest(args.apk, apkStats),
        launchSmokeScreenshot: artifactManifest(defaultLaunchScreenshotPath, launchScreenshotStats),
        pairingSmokeScreenshot: artifactManifest(defaultPairingScreenshotPath, pairingScreenshotStats),
        realBridgeSmokeScreenshot: artifactManifest(defaultRealBridgeScreenshotPath, realBridgeScreenshotStats),
      },
      checks: {
        apkFreshnessStrict: args.strict,
        realBridgeRequired: args.requireRealBridge,
        secureStore: true,
      },
      commands: {
        buildDebug: "corepack pnpm mobile:android:build:debug",
        launchSmoke: "corepack pnpm mobile:android:smoke:debug",
        pairingSmoke: "corepack pnpm mobile:android:smoke:pairing",
        realBridgeSmoke: "corepack pnpm mobile:android:smoke:bridge",
        strictDeliveryCheck: "corepack pnpm mobile:android:delivery-check -- --require-real-bridge --strict",
        handoffCheck: "corepack pnpm mobile:android:handoff-check -- --use-desktop-handoff",
      },
    })
  }

  console.log("Android delivery check passed.")
  if (!args.requireRealBridge) {
    console.log("Real-device proof is still separate: run mobile:android:smoke:bridge with the desktop pairing URL.")
  }
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
