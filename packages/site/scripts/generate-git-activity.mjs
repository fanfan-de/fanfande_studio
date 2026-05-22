import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(__dirname, "..")
const outputPath = resolve(packageRoot, "src/generated/git-activity.ts")
const fieldSeparator = "\u001f"
const maxCommits = process.env.GIT_ACTIVITY_MAX_COMMITS ?? "1500"

function git(args) {
  return execFileSync("git", args, {
    cwd: packageRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim()
}

function readGit(args, fallback = "") {
  try {
    return git(args)
  } catch {
    return fallback
  }
}

function normalizeGitHubRemote(remoteUrl) {
  if (!remoteUrl) {
    return ""
  }

  const sshMatch = remoteUrl.match(/^git@github\.com:(.+?)\/(.+?)(?:\.git)?$/)
  if (sshMatch) {
    return `https://github.com/${sshMatch[1]}/${sshMatch[2]}`
  }

  const httpsMatch = remoteUrl.match(
    /^https:\/\/(?:[^/@]+@)?github\.com\/(.+?)\/(.+?)(?:\.git)?$/,
  )
  if (httpsMatch) {
    return `https://github.com/${httpsMatch[1]}/${httpsMatch[2]}`
  }

  return remoteUrl.replace(/\.git$/, "")
}

const repositoryRoot = readGit(["rev-parse", "--show-toplevel"], packageRoot)
const branch = readGit(["branch", "--show-current"], "unknown")
const remoteUrl = readGit(["config", "--get", "remote.origin.url"], "")
const repositoryUrl = normalizeGitHubRemote(remoteUrl)
const generatedAt = new Date().toISOString()

const rawLog = readGit(
  [
    "log",
    `--max-count=${maxCommits}`,
    "--date=short",
    `--pretty=format:%H%x1f%h%x1f%ad%x1f%an%x1f%s`,
  ],
  "",
)

const commits = rawLog
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
    const [hash, shortHash, date, author, ...subjectParts] =
      line.split(fieldSeparator)

    return {
      hash,
      shortHash,
      date,
      author,
      subject: subjectParts.join(fieldSeparator),
    }
  })

const snapshot = {
  generatedAt,
  branch,
  repositoryRoot,
  repositoryUrl,
  commitBaseUrl: repositoryUrl.includes("github.com")
    ? `${repositoryUrl}/commit/`
    : "",
  commits,
}

const file = `export type GitCommitRecord = {
  hash: string
  shortHash: string
  date: string
  author: string
  subject: string
}

export type GitActivitySnapshot = {
  generatedAt: string
  branch: string
  repositoryRoot: string
  repositoryUrl: string
  commitBaseUrl: string
  commits: GitCommitRecord[]
}

export const gitActivity: GitActivitySnapshot = ${JSON.stringify(
  snapshot,
  null,
  2,
)}
`

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, file, "utf8")

console.log(
  `Generated ${commits.length} commits for ${branch} at src/generated/git-activity.ts`,
)
