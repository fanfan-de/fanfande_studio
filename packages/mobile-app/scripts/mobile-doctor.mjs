import { existsSync } from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const isWindows = process.platform === "win32"
const strict = process.argv.includes("--strict")

function packageBin(name) {
  return path.join(packageRoot, "node_modules", ".bin", `${name}${isWindows ? ".CMD" : ""}`)
}

function run(command, args = [], options = {}) {
  const useShell = options.shell ?? (isWindows && /\.cmd$/i.test(command))
  const result = spawnSync(command, args, {
    cwd: packageRoot,
    encoding: "utf8",
    shell: useShell,
    windowsHide: true,
  })
  return {
    ok: result.status === 0,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
    status: result.status,
  }
}

function checkCommand(label, command, args = ["--version"], options = {}) {
  const result = run(command, args, options)
  return {
    label,
    ok: result.ok,
    detail: result.ok ? firstLine(result.output) : "not found or not runnable",
  }
}

function firstLine(value) {
  return value.split(/\r?\n/).find(Boolean) ?? ""
}

function checkPackageBin(label, name, args = ["--version"]) {
  const bin = packageBin(name)
  if (!existsSync(bin)) {
    return {
      label,
      ok: false,
      detail: `${name} is not installed in packages/mobile-app`,
    }
  }
  const result = run(bin, args)
  return {
    label,
    ok: result.ok,
    detail: result.ok ? firstLine(result.output) : firstLine(result.output) || `${name} failed`,
  }
}

function checkEnv(name) {
  const value = process.env[name]?.trim()
  return {
    label: name,
    ok: Boolean(value),
    detail: value || "not set",
  }
}

const expo = checkPackageBin("Expo CLI", "expo", ["--version"])
const eas = checkPackageBin("EAS CLI", "eas", ["--version"])
const easLogin = existsSync(packageBin("eas"))
  ? checkPackageBin("EAS login", "eas", ["whoami", "--non-interactive"])
  : {
      label: "EAS login",
      ok: false,
      detail: "EAS CLI is not installed",
    }

const checks = [
  checkCommand("Node.js", process.execPath, ["--version"]),
  checkPackageBin("TypeScript", "tsc", ["--version"]),
  expo,
  eas,
  easLogin,
  checkCommand("Java", "java", ["-version"]),
  checkCommand("adb", "adb", ["version"]),
  checkCommand("sdkmanager", "sdkmanager", ["--version"], { shell: isWindows }),
  checkEnv("JAVA_HOME"),
  checkEnv("ANDROID_HOME"),
  checkEnv("ANDROID_SDK_ROOT"),
]

const localAndroidReady =
  checks.find((item) => item.label === "Java")?.ok &&
  checks.find((item) => item.label === "adb")?.ok &&
  (checks.find((item) => item.label === "ANDROID_HOME")?.ok || checks.find((item) => item.label === "ANDROID_SDK_ROOT")?.ok)
const easReady = eas.ok && easLogin.ok
const expoGoReady = expo.ok

console.log("Anybox Mobile Doctor")
console.log("")
for (const check of checks) {
  console.log(`${check.ok ? "[ok]" : "[missing]"} ${check.label}: ${check.detail}`)
}

console.log("")
console.log(`${expoGoReady ? "[ok]" : "[missing]"} Expo Go smoke test readiness`)
console.log(`${localAndroidReady ? "[ok]" : "[missing]"} Local Android build readiness`)
console.log(`${easReady ? "[ok]" : "[missing]"} EAS APK build readiness`)

if (!localAndroidReady) {
  console.log("")
  console.log("Local Android builds need Java, Android SDK, adb, and ANDROID_HOME or ANDROID_SDK_ROOT.")
}

if (!easReady) {
  console.log("EAS cloud builds need an Expo account login: corepack pnpm --filter anybox-mobile-app exec eas login")
}

if (strict && (!expoGoReady || !localAndroidReady || !easReady)) {
  process.exit(1)
}
