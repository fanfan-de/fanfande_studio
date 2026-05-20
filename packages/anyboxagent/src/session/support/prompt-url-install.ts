import { createHash } from "node:crypto"
import { basename, extname } from "node:path"
import matter from "gray-matter"
import * as Config from "#config/config.ts"
import * as PromptPresets from "#session/support/prompt-presets.ts"

const PREVIEW_TTL_MS = 30 * 60 * 1000
const MAX_PROMPT_BYTES = 512 * 1024
const MAX_PROMPT_FILES = 50

export interface PromptUrlInstallCandidate {
  id: string
  label: string
  description: string
  sourcePath: string
  available: boolean
  reason?: string
}

interface PromptUrlInstallCandidateRecord extends PromptUrlInstallCandidate {
  content: string
}

export interface PromptUrlInstallPreview {
  previewID: string
  source: string
  prompts: PromptUrlInstallCandidate[]
}

export interface PromptUrlInstallResult {
  installed: PromptPresets.PromptPresetDocument[]
}

interface PreviewRecord {
  previewID: string
  source: string
  prompts: PromptUrlInstallCandidateRecord[]
  expiresAt: number
}

interface GithubRepositorySource {
  kind: "github-repository"
  source: string
  owner: string
  repo: string
  ref?: string
  subpath?: string
}

interface WebFileSource {
  kind: "web-file"
  source: string
  url: string
  sourcePath: string
}

type PromptUrlSource = GithubRepositorySource | WebFileSource

export class PromptUrlInstallError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "PromptUrlInstallError"
  }
}

const previews = new Map<string, PreviewRecord>()

function normalizeRepoName(input: string) {
  return input.replace(/\.git$/i, "")
}

function createCandidateID(sourcePath: string) {
  return createHash("sha256").update(sourcePath).digest("hex").slice(0, 16)
}

function normalizeSource(input: string) {
  let normalized = input.trim()
  if (!normalized) {
    throw new PromptUrlInstallError("PROMPT_URL_INVALID_SOURCE", "Enter a prompt resource URL.")
  }

  if (/^(?:www\.)?github\.com\//i.test(normalized)) {
    normalized = `https://${normalized}`
  }

  return normalized
}

function normalizeGithubSubpath(input: string[]) {
  const joined = input.map((segment) => decodeURIComponent(segment)).join("/").trim()
  if (!joined || joined === ".") return undefined
  if (joined.split(/[\\/]/).some((segment) => segment === "..")) {
    throw new PromptUrlInstallError("PROMPT_URL_INVALID_SOURCE", "GitHub paths must stay inside the repository.")
  }

  return joined
}

function isSupportedPromptFilePath(path: string) {
  const extension = extname(path).toLowerCase()
  return extension === ".md" || extension === ".txt"
}

function assertSupportedWebURL(rawUrl: string) {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new PromptUrlInstallError("PROMPT_URL_INVALID_SOURCE", "Enter a valid http or https URL.")
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PromptUrlInstallError("PROMPT_URL_INVALID_SOURCE", "Prompt resources must use http or https URLs.")
  }
  if (url.username || url.password) {
    throw new PromptUrlInstallError("PROMPT_URL_INVALID_SOURCE", "Prompt resource URLs must not contain credentials.")
  }

  const hostname = url.hostname.toLowerCase()
  if (
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  ) {
    throw new PromptUrlInstallError("PROMPT_URL_INVALID_SOURCE", "Prompt resource URLs must point to a public website.")
  }

  return url
}

export function parsePromptUrlSource(source: string): PromptUrlSource {
  const trimmed = normalizeSource(source)
  const shorthandMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/)
  if (shorthandMatch) {
    const owner = shorthandMatch[1]!
    const repo = shorthandMatch[2]!
    return {
      kind: "github-repository",
      source: trimmed,
      owner,
      repo: normalizeRepoName(repo),
    }
  }

  const url = assertSupportedWebURL(trimmed)
  const hostname = url.hostname.toLowerCase()
  const isGithubHost = hostname === "github.com" || hostname === "www.github.com"
  if (!isGithubHost) {
    return {
      kind: "web-file",
      source: trimmed,
      url: url.toString(),
      sourcePath: url.toString(),
    }
  }

  const segments = url.pathname.split("/").filter(Boolean)
  const [owner, rawRepo, marker, ref, ...pathSegments] = segments
  if (!owner || !rawRepo) {
    throw new PromptUrlInstallError("PROMPT_URL_INVALID_SOURCE", "GitHub URL must include owner and repository.")
  }

  const repo = normalizeRepoName(decodeURIComponent(rawRepo))
  if (!marker) {
    return {
      kind: "github-repository",
      source: trimmed,
      owner: decodeURIComponent(owner),
      repo,
    }
  }

  if (!["tree", "blob"].includes(marker) || !ref) {
    throw new PromptUrlInstallError(
      "PROMPT_URL_INVALID_SOURCE",
      "GitHub URLs must use /tree/<branch>/<path> or /blob/<branch>/<path>.",
    )
  }

  const decodedRef = decodeURIComponent(ref)
  const subpath = normalizeGithubSubpath(pathSegments)
  if (marker === "blob") {
    if (!subpath || !isSupportedPromptFilePath(subpath)) {
      throw new PromptUrlInstallError("PROMPT_URL_INVALID_SOURCE", "GitHub blob URLs must point to a .md or .txt prompt file.")
    }

    return {
      kind: "web-file",
      source: trimmed,
      sourcePath: `github.com/${decodeURIComponent(owner)}/${repo}/blob/${decodedRef}/${subpath}`,
      url: buildGithubRawURL(decodeURIComponent(owner), repo, decodedRef, subpath),
    }
  }

  return {
    kind: "github-repository",
    source: trimmed,
    owner: decodeURIComponent(owner),
    repo,
    ref: decodedRef,
    subpath,
  }
}

function buildGithubRawURL(owner: string, repo: string, ref: string, path: string) {
  const encodedPath = path.split("/").map((segment) => encodeURIComponent(segment)).join("/")
  return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(ref)}/${encodedPath}`
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      accept: "text/markdown,text/plain,*/*",
      "user-agent": "Anybox-Prompt-Installer",
    },
  })

  if (!response.ok) {
    throw new PromptUrlInstallError(
      "PROMPT_URL_FETCH_FAILED",
      `Could not download prompt resource (${response.status}).`,
    )
  }

  const contentLength = Number(response.headers.get("content-length") ?? "0")
  if (contentLength > MAX_PROMPT_BYTES) {
    throw new PromptUrlInstallError("PROMPT_URL_TOO_LARGE", "Prompt resource is too large.")
  }

  const text = await response.text()
  if (new TextEncoder().encode(text).byteLength > MAX_PROMPT_BYTES) {
    throw new PromptUrlInstallError("PROMPT_URL_TOO_LARGE", "Prompt resource is too large.")
  }

  return text
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "Anybox-Prompt-Installer",
    },
  })

  if (!response.ok) {
    throw new PromptUrlInstallError(
      "PROMPT_URL_FETCH_FAILED",
      `Could not read prompt repository (${response.status}).`,
    )
  }

  return response.json() as Promise<T>
}

function labelFromPath(path: string) {
  const name = basename(path, extname(path))
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  return name ? name.replace(/\b\w/g, (value) => value.toUpperCase()) : "Imported prompt"
}

function readFrontmatterString(data: Record<string, unknown>, key: string) {
  const value = data[key]
  return typeof value === "string" ? value.trim() : ""
}

function buildPromptCandidate(sourcePath: string, rawContent: string): PromptUrlInstallCandidateRecord {
  const parsed = matter(rawContent)
  const data = parsed.data as Record<string, unknown>
  const heading = parsed.content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? ""
  const label = readFrontmatterString(data, "label") || readFrontmatterString(data, "title") || heading || labelFromPath(sourcePath)
  const content = parsed.content
  const available = content.trim().length > 0

  return {
    id: createCandidateID(sourcePath),
    label,
    description: readFrontmatterString(data, "description") || `Imported from ${sourcePath}`,
    sourcePath,
    available,
    ...(available ? {} : { reason: "Prompt file is empty." }),
    content,
  }
}

async function discoverWebFilePrompt(source: WebFileSource) {
  if (!isSupportedPromptFilePath(new URL(source.url).pathname)) {
    throw new PromptUrlInstallError("PROMPT_URL_INVALID_SOURCE", "Direct prompt URLs must point to a .md or .txt file.")
  }

  return [buildPromptCandidate(source.sourcePath, await fetchText(source.url))]
}

async function getGithubDefaultBranch(source: GithubRepositorySource) {
  if (source.ref) return source.ref
  const data = await fetchJson<{ default_branch?: string }>(
    `https://api.github.com/repos/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repo)}`,
  )
  return data.default_branch || "main"
}

async function discoverGithubRepositoryPrompts(source: GithubRepositorySource) {
  const ref = await getGithubDefaultBranch(source)
  const subpath = source.subpath?.replace(/^\/+|\/+$/g, "")
  if (subpath && isSupportedPromptFilePath(subpath)) {
    return [
      buildPromptCandidate(
        `github.com/${source.owner}/${source.repo}/blob/${ref}/${subpath}`,
        await fetchText(buildGithubRawURL(source.owner, source.repo, ref, subpath)),
      ),
    ]
  }

  const tree = await fetchJson<{
    tree?: Array<{
      path?: string
      type?: string
    }>
  }>(
    `https://api.github.com/repos/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
  )

  const prefix = subpath ? `${subpath}/` : ""
  const promptPaths = (tree.tree ?? [])
    .filter((item) => item.type === "blob" && typeof item.path === "string")
    .map((item) => item.path!)
    .filter((path) => (!prefix || path === subpath || path.startsWith(prefix)) && isSupportedPromptFilePath(path))
    .filter((path) => !path.split("/").some((segment) => segment.startsWith(".")))
    .sort((left, right) => left.localeCompare(right))
    .slice(0, MAX_PROMPT_FILES)

  const prompts: PromptUrlInstallCandidateRecord[] = []
  for (const path of promptPaths) {
    prompts.push(buildPromptCandidate(
      `github.com/${source.owner}/${source.repo}/blob/${ref}/${path}`,
      await fetchText(buildGithubRawURL(source.owner, source.repo, ref, path)),
    ))
  }

  return prompts
}

async function discoverPromptCandidates(source: PromptUrlSource) {
  const prompts = source.kind === "web-file"
    ? await discoverWebFilePrompt(source)
    : await discoverGithubRepositoryPrompts(source)

  if (prompts.length === 0) {
    throw new PromptUrlInstallError("PROMPT_URL_NO_PROMPTS", "No .md or .txt prompt files were found at this URL.")
  }

  return prompts
}

function cleanupExpiredPreviews() {
  const now = Date.now()
  for (const [previewID, preview] of previews) {
    if (preview.expiresAt > now) continue
    previews.delete(previewID)
  }
}

function publicPreview(record: PreviewRecord): PromptUrlInstallPreview {
  return {
    previewID: record.previewID,
    source: record.source,
    prompts: record.prompts.map(({ content: _content, ...prompt }) => prompt),
  }
}

function requirePreview(previewID: string) {
  cleanupExpiredPreviews()
  const preview = previews.get(previewID.trim())
  if (!preview) {
    throw new PromptUrlInstallError("PROMPT_URL_PREVIEW_NOT_FOUND", "Prompt install preview was not found or has expired.")
  }

  return preview
}

export async function previewPromptUrlInstall(source: string): Promise<PromptUrlInstallPreview> {
  cleanupExpiredPreviews()
  const parsed = parsePromptUrlSource(source)
  const prompts = await discoverPromptCandidates(parsed)
  const previewID = crypto.randomUUID()
  const record: PreviewRecord = {
    previewID,
    source: parsed.source,
    prompts,
    expiresAt: Date.now() + PREVIEW_TTL_MS,
  }

  previews.set(previewID, record)
  return publicPreview(record)
}

export async function installPromptsFromUrlPreview(
  input: {
    previewID: string
    promptIDs: string[]
  },
  configID = Config.GLOBAL_CONFIG_ID,
): Promise<PromptUrlInstallResult> {
  const preview = requirePreview(input.previewID)
  const promptIDs = [...new Set(input.promptIDs.map((item) => item.trim()).filter(Boolean))]
  if (promptIDs.length === 0) {
    throw new PromptUrlInstallError("PROMPT_URL_NO_SELECTION", "Select at least one prompt to install.")
  }

  const byID = new Map(preview.prompts.map((prompt) => [prompt.id, prompt] as const))
  const selected = promptIDs.map((promptID) => {
    const candidate = byID.get(promptID)
    if (!candidate) {
      throw new PromptUrlInstallError("PROMPT_URL_INVALID_SELECTION", `Prompt '${promptID}' is not part of this preview.`)
    }
    if (!candidate.available) {
      throw new PromptUrlInstallError("PROMPT_URL_PROMPT_UNAVAILABLE", candidate.reason || `Prompt '${candidate.label}' cannot be installed.`)
    }

    return candidate
  })

  const installed: PromptPresets.PromptPresetDocument[] = []
  try {
    for (const candidate of selected) {
      installed.push(await PromptPresets.createPromptPreset({
        label: candidate.label,
        description: candidate.description,
        content: candidate.content,
      }, configID))
    }
  } finally {
    previews.delete(preview.previewID)
  }

  return { installed }
}
