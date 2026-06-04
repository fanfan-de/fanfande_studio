import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const defaultApkPath = path.join(packageRoot, "build", "anybox-mobile-debug.apk")
const defaultOutDir = path.join(packageRoot, "build", "github-release")
const defaultApkAssetName = "anybox-mobile.apk"
const defaultManifestAssetName = "anybox-mobile-release.json"

function usage() {
  return [
    "Anybox Mobile GitHub Release Prepare",
    "",
    "Usage:",
    "  pnpm --filter anybox-mobile-app run release:github:prepare",
    "  pnpm --filter anybox-mobile-app run release:github:prepare -- --notes \"Fix pairing\"",
    "",
    "Options:",
    "  --apk <path>                    APK path. Defaults to build/anybox-mobile-debug.apk.",
    "  --out-dir <path>                Output directory. Defaults to build/github-release.",
    "  --repo <owner/repo>             GitHub repository. Defaults to app.json extra setting.",
    "  --tag <tag>                     Release tag. Defaults to mobile-v<app version>.",
    "  --notes <text>                  Release note. Can be passed multiple times.",
    "  --force                         Mark this as a required update.",
    "  --minimum-version-code <value>  Minimum Android versionCode allowed.",
    "  --help                          Show this help.",
  ].join("\n")
}

function parseArgs(argv) {
  const args = {
    apk: defaultApkPath,
    force: false,
    help: false,
    minimumVersionCode: null,
    notes: [],
    outDir: defaultOutDir,
    repo: "",
    tag: "",
  }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === "--") {
      continue
    } else if (value === "--help" || value === "-h") {
      args.help = true
    } else if (value === "--apk") {
      args.apk = path.resolve(argv[index + 1] ?? args.apk)
      index += 1
    } else if (value === "--out-dir") {
      args.outDir = path.resolve(argv[index + 1] ?? args.outDir)
      index += 1
    } else if (value === "--repo") {
      args.repo = argv[index + 1] ?? ""
      index += 1
    } else if (value === "--tag") {
      args.tag = argv[index + 1] ?? ""
      index += 1
    } else if (value === "--notes") {
      args.notes.push(argv[index + 1] ?? "")
      index += 1
    } else if (value === "--force") {
      args.force = true
    } else if (value === "--minimum-version-code") {
      args.minimumVersionCode = Number.parseInt(argv[index + 1] ?? "", 10)
      index += 1
    }
  }

  return args
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"))
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex")
}

function firstNonEmpty(values) {
  for (const value of values) {
    const stringValue = value == null ? "" : String(value).trim()
    if (stringValue) return stringValue
  }
  return ""
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

  const appConfig = readJson(path.join(packageRoot, "app.json")).expo
  const version = firstNonEmpty([appConfig.version])
  const versionCode = Number.parseInt(String(appConfig.android?.versionCode ?? ""), 10)
  const repository = firstNonEmpty([args.repo, appConfig.extra?.anyboxMobileGitHubRepository])
  const tagPrefix = firstNonEmpty([appConfig.extra?.anyboxMobileGitHubReleaseTagPrefix, "mobile-v"])
  const tag = firstNonEmpty([args.tag, `${tagPrefix}${version}`])
  const apkAssetName = firstNonEmpty([appConfig.extra?.anyboxMobileGitHubApkAssetName, defaultApkAssetName])
  const manifestAssetName = firstNonEmpty([appConfig.extra?.anyboxMobileGitHubManifestAssetName, defaultManifestAssetName])

  if (!version) throw new Error("app.json is missing expo.version.")
  if (!Number.isFinite(versionCode)) throw new Error("app.json is missing expo.android.versionCode.")
  if (!repository) throw new Error("GitHub repository is missing. Set expo.extra.anyboxMobileGitHubRepository.")

  mkdirSync(args.outDir, { recursive: true })
  const apkOutputPath = path.join(args.outDir, apkAssetName)
  const manifestOutputPath = path.join(args.outDir, manifestAssetName)
  copyFileSync(args.apk, apkOutputPath)

  const stats = statSync(args.apk)
  const manifest = {
    version,
    versionCode,
    ...(Number.isFinite(args.minimumVersionCode) ? { minimumVersionCode: args.minimumVersionCode } : {}),
    apkUrl: `https://github.com/${repository}/releases/download/${tag}/${apkAssetName}`,
    sha256: sha256File(args.apk),
    sizeBytes: stats.size,
    notes: args.notes.map((note) => note.trim()).filter(Boolean),
    force: args.force,
  }
  writeFileSync(manifestOutputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")

  console.log(`Release tag: ${tag}`)
  console.log(`APK asset: ${apkOutputPath}`)
  console.log(`Manifest asset: ${manifestOutputPath}`)
  console.log("")
  console.log("Create the GitHub release with:")
  console.log(`gh release create ${tag} "${apkOutputPath}" "${manifestOutputPath}" --repo ${repository} --title "Anybox Mobile ${version}" --notes "Anybox Mobile ${version}"`)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
