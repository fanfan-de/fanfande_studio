import {
  gitActivity,
  type GitCommitRecord,
  type GitActivitySnapshot,
} from "./generated/git-activity"

export type GitActivitySource = "github" | "local"

export type ActivityRecord = GitCommitRecord & {
  url?: string
}

export type ActivityDay = {
  date: string
  count: number
  level?: number
  records: ActivityRecord[]
}

export type RuntimeGitActivitySnapshot = Omit<GitActivitySnapshot, "commits"> & {
  source: GitActivitySource
  ownerLabel: string
  sourceLabel: string
  days: ActivityDay[]
}

type GitHubContribution = {
  date: string
  count: number
  level?: number
}

type GitHubContributionResponse = {
  contributions?: GitHubContribution[]
}

const defaultGitHubUsername = getGitHubOwner(gitActivity.repositoryUrl) ?? "fanfan-de"
const githubUsername =
  import.meta.env.VITE_GITHUB_USERNAME?.trim() || defaultGitHubUsername
const configuredEndpoint =
  import.meta.env.VITE_GITHUB_ACTIVITY_ENDPOINT?.trim() || ""

let liveSnapshotPromise: Promise<RuntimeGitActivitySnapshot> | undefined

function getGitHubOwner(repositoryUrl: string) {
  const match = repositoryUrl.match(/^https:\/\/github\.com\/([^/]+)/)
  return match?.[1]
}

function buildRecordUrl(date: string) {
  const profileUrl = `https://github.com/${githubUsername}`
  return `${profileUrl}?tab=overview&from=${date}&to=${date}`
}

function buildDefaultEndpoint() {
  return `https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(
    githubUsername,
  )}?y=all`
}

function buildEndpointUrl() {
  const endpoint = configuredEndpoint
    ? configuredEndpoint.replace("{username}", encodeURIComponent(githubUsername))
    : buildDefaultEndpoint()
  const url = new URL(endpoint, window.location.origin)

  url.searchParams.set("_", String(Date.now()))

  return url.toString()
}

function normalizeLevel(level: unknown) {
  if (typeof level !== "number" || !Number.isFinite(level)) {
    return undefined
  }

  return Math.max(0, Math.min(4, Math.round(level)))
}

function isValidDateKey(date: unknown): date is string {
  return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
}

function parseContributions(data: unknown) {
  const response = data as GitHubContributionResponse

  if (!Array.isArray(response.contributions)) {
    throw new Error("GitHub contribution response is missing contributions.")
  }

  return response.contributions
    .filter((item) => isValidDateKey(item.date))
    .map((item) => ({
      date: item.date,
      count: Math.max(0, Number(item.count) || 0),
      level: normalizeLevel(item.level),
    }))
}

function buildLocalDays(commits: GitCommitRecord[]) {
  const grouped = new Map<string, ActivityRecord[]>()

  for (const commit of commits) {
    const records = grouped.get(commit.date) ?? []
    const url = gitActivity.commitBaseUrl
      ? `${gitActivity.commitBaseUrl}${commit.hash}`
      : undefined

    grouped.set(commit.date, [...records, { ...commit, url }])
  }

  return Array.from(grouped.entries()).map(([date, records]) => ({
    date,
    count: records.length,
    records,
  }))
}

function buildGitHubDays(contributions: GitHubContribution[]) {
  return contributions.map(({ date, count, level }) => ({
    date,
    count,
    level,
    records:
      count > 0
        ? [
            {
              hash: `github-${date}`,
              shortHash: "GitHub",
              date,
              author: githubUsername,
              subject: `${count} 次公开贡献`,
              url: buildRecordUrl(date),
            },
          ]
        : [],
  }))
}

export const localGitActivitySnapshot: RuntimeGitActivitySnapshot = {
  ...gitActivity,
  source: "local",
  ownerLabel: gitActivity.branch,
  sourceLabel: "本地 Git 快照",
  days: buildLocalDays(gitActivity.commits),
}

export function loadGitHubActivitySnapshot() {
  liveSnapshotPromise ??= fetch(buildEndpointUrl(), {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`GitHub contribution request failed: ${response.status}`)
      }

      return response.json()
    })
    .then((data) => {
      const contributions = parseContributions(data)
      const profileUrl = `https://github.com/${githubUsername}`

      return {
        generatedAt: new Date().toISOString(),
        branch: `@${githubUsername}`,
        repositoryRoot: "",
        repositoryUrl: profileUrl,
        commitBaseUrl: "",
        source: "github" as const,
        ownerLabel: `@${githubUsername}`,
        sourceLabel: "GitHub 实时同步",
        days: buildGitHubDays(contributions),
      }
    })

  return liveSnapshotPromise
}
