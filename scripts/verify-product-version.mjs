import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function readPackageJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"))
}

const rootPackage = readPackageJson("package.json")
const desktopPackage = readPackageJson("packages/desktop/package.json")

if (rootPackage.version !== desktopPackage.version) {
  console.error(
    `Product version mismatch: package.json=${rootPackage.version}, packages/desktop/package.json=${desktopPackage.version}`,
  )
  process.exit(1)
}

console.log(`Product version verified: ${desktopPackage.version}`)
