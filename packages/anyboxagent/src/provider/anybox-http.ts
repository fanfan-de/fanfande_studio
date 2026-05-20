import { lookup as dnsLookup } from "node:dns/promises"
import { getEnvValue, getProcessEnvValue } from "#env/compat.ts"

function defaultAnyboxBaseURL() {
  return getProcessEnvValue("ANYBOX_BASE_URL")?.trim() || "https://anybox.com.cn"
}

export type AnyboxProxySource = "none" | "env"

export type AnyboxErrorCode =
  | "dns_fake_ip"
  | "dns_error"
  | "tcp_reset"
  | "tls_verification_failed"
  | "proxy_connection_failed"
  | "http_error"
  | "timeout"
  | "network_error"

export type AnyboxDiagnostics = {
  targetURL: string
  targetHost?: string
  proxySource: AnyboxProxySource
  proxyURL?: string
  noProxyMatched?: boolean
  noProxyPattern?: string
  dnsAddresses?: string[]
  fakeIPDetected?: boolean
  originalMessage?: string
}

type ResolvedProxy = {
  proxy?: string
  source: AnyboxProxySource
  noProxyMatched?: boolean
  noProxyPattern?: string
}

type FetchLike = typeof fetch
type AnyboxFetchInput = Parameters<typeof fetch>[0] | URL
type LookupAddress = {
  address: string
  family: number
}

type AnyboxHTTPDependencies = {
  fetch?: FetchLike
  env?: Record<string, string | undefined>
  lookup?: (hostname: string, options: { all: true }) => Promise<LookupAddress[]>
}

let anyboxHTTPDependencies: AnyboxHTTPDependencies = {}

export class AnyboxHTTPError extends Error {
  override name = "AnyboxHTTPError"
  readonly code: AnyboxErrorCode
  readonly diagnostics: AnyboxDiagnostics

  constructor(code: AnyboxErrorCode, message: string, diagnostics: AnyboxDiagnostics, options?: { cause?: unknown }) {
    super(message, options)
    this.code = code
    this.diagnostics = diagnostics
  }
}

export function setAnyboxHTTPDependenciesForTesting(overrides: AnyboxHTTPDependencies) {
  const previous = anyboxHTTPDependencies
  anyboxHTTPDependencies = {
    ...previous,
    ...overrides,
  }

  return () => {
    anyboxHTTPDependencies = previous
  }
}

function deps() {
  return {
    fetch: anyboxHTTPDependencies.fetch ?? globalThis.fetch.bind(globalThis),
  env: anyboxHTTPDependencies.env ?? process.env,
    lookup: anyboxHTTPDependencies.lookup ?? ((hostname: string, options: { all: true }) => dnsLookup(hostname, options)),
  }
}

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== "string") continue
    const trimmed = value.trim()
    if (trimmed.length > 0) return trimmed
  }
  return undefined
}

export function normalizeAnyboxRootURL(baseURL?: string) {
  const fallback = getEnvValue(deps().env, "ANYBOX_BASE_URL")?.trim() || defaultAnyboxBaseURL()
  const configured = firstNonEmptyString(baseURL, fallback) ?? fallback
  const trimmed = configured.replace(/\/+$/, "")
  return trimmed.endsWith("/v1") ? trimmed.slice(0, -"/v1".length) : trimmed
}

export function normalizeAnyboxApiURL(baseURL?: string) {
  return `${normalizeAnyboxRootURL(baseURL)}/v1`
}

export function anyboxURL(baseURL: string | undefined, pathname: string) {
  const root = normalizeAnyboxRootURL(baseURL)
  return new URL(pathname.replace(/^\/+/, ""), `${root}/`).toString()
}

export function redactProxyURL(value: string | undefined) {
  const proxyURL = firstNonEmptyString(value)
  if (!proxyURL) return undefined

  try {
    const url = new URL(proxyURL)
    if (url.username) url.username = "***"
    if (url.password) url.password = "***"
    return url.toString()
  } catch {
    return proxyURL.replace(/\/\/([^:@/\s]+):([^@/\s]+)@/, "//***:***@")
  }
}

function normalizeProxyURL(proxyURL: string | undefined) {
  const normalized = firstNonEmptyString(proxyURL)
  if (!normalized) return undefined

  try {
    const withScheme = /^[a-z][a-z\d+\-.]*:\/\//i.test(normalized) ? normalized : `http://${normalized}`
    const parsed = new URL(withScheme)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined
    return parsed.toString()
  } catch {
    return undefined
  }
}

function splitNoProxy(noProxy: string | undefined) {
  return (noProxy ?? "")
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function hostMatchesNoProxyPattern(host: string, pattern: string, port?: string) {
  const normalizedHost = host.toLowerCase()
  const normalizedPattern = pattern.toLowerCase()
  if (normalizedPattern === "*") return true

  const [patternHost, patternPort] = normalizedPattern.startsWith("[")
    ? [normalizedPattern, undefined]
    : normalizedPattern.split(":", 2)
  if (patternPort && patternPort.length > 0 && patternPort !== port) return false

  if (patternHost.startsWith(".")) {
    const suffix = patternHost.slice(1)
    return normalizedHost === suffix || normalizedHost.endsWith(`.${suffix}`)
  }

  if (patternHost.startsWith("*.")) {
    const suffix = patternHost.slice(2)
    return normalizedHost === suffix || normalizedHost.endsWith(`.${suffix}`)
  }

  return normalizedHost === patternHost || normalizedHost.endsWith(`.${patternHost}`)
}

function findNoProxyMatch(target: URL, env: Record<string, string | undefined>) {
  const host = target.hostname.replace(/^\[|\]$/g, "")
  const port = target.port || (target.protocol === "https:" ? "443" : target.protocol === "http:" ? "80" : "")
  for (const pattern of splitNoProxy(env["NO_PROXY"] ?? env["no_proxy"])) {
    if (hostMatchesNoProxyPattern(host, pattern, port)) return pattern
  }
  return undefined
}

function getEnvProxyURL(env: Record<string, string | undefined>, target: URL) {
  const candidates =
    target.protocol === "https:"
      ? ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"]
      : ["HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"]

  for (const key of candidates) {
    const value = normalizeProxyURL(env[key])
    if (value) return value
  }
  return undefined
}

async function resolveProxy(target: URL): Promise<ResolvedProxy> {
  const currentDeps = deps()
  const noProxyPattern = findNoProxyMatch(target, currentDeps.env)
  if (noProxyPattern) {
    return {
      source: "none",
      noProxyMatched: true,
      noProxyPattern,
    }
  }

  const envProxy = getEnvProxyURL(currentDeps.env, target)
  if (envProxy) return { proxy: envProxy, source: "env" }

  return { source: "none" }
}

function diagnosticsFor(target: URL, resolved: ResolvedProxy): AnyboxDiagnostics {
  return {
    targetURL: target.toString(),
    targetHost: target.hostname,
    proxySource: resolved.source,
    proxyURL: redactProxyURL(resolved.proxy),
    noProxyMatched: resolved.noProxyMatched,
    noProxyPattern: resolved.noProxyPattern,
  }
}

function messageFromError(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

function codeFromError(error: unknown) {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : {}
  const code = typeof record.code === "string" ? record.code : undefined
  const cause = record.cause && typeof record.cause === "object" ? (record.cause as Record<string, unknown>) : undefined
  return code ?? (typeof cause?.code === "string" ? cause.code : undefined)
}

function isFakeIP(address: string) {
  return /^198\.(18|19)\./.test(address)
}

async function resolveTargetAddresses(target: URL) {
  try {
    const records = await deps().lookup(target.hostname, { all: true })
    return records.map((record) => record.address)
  } catch {
    return undefined
  }
}

function classifyByMessage(error: unknown, diagnostics: AnyboxDiagnostics): AnyboxErrorCode {
  const message = messageFromError(error).toLowerCase()
  const code = codeFromError(error)?.toLowerCase()

  if (
    diagnostics.proxySource !== "none" &&
    (message.includes("proxy") ||
      message.includes("tunnel") ||
      code === "econnrefused" ||
      code === "enotfound" ||
      message.includes("econnrefused") ||
      message.includes("connection refused") ||
      message.includes("connection closed") ||
      message.includes("closed unexpectedly"))
  ) {
    return "proxy_connection_failed"
  }
  if (message.includes("timeout") || code === "abort_err" || code === "timeout") return "timeout"
  if (
    message.includes("certificate") ||
    message.includes("cert_") ||
    message.includes("unable_to_verify") ||
    message.includes("self signed") ||
    message.includes("tls") ||
    message.includes("ssl") ||
    code === "err_tls_cert_altname_invalid" ||
    code === "unable_to_verify_leaf_signature" ||
    code === "self_signed_cert_in_chain"
  ) {
    return "tls_verification_failed"
  }
  if (code === "enotfound" || code === "eai_again" || message.includes("dns") || message.includes("enotfound")) {
    return "dns_error"
  }
  if (
    code === "econnreset" ||
    message.includes("econnreset") ||
    message.includes("connection reset") ||
    message.includes("socket hang up") ||
    message.includes("closed unexpectedly")
  ) {
    return "tcp_reset"
  }

  return "network_error"
}

function userFacingMessage(code: AnyboxErrorCode) {
  switch (code) {
    case "dns_fake_ip":
      return "无法连接 Anybox。系统网络可能没有完全恢复，浏览器能打开网页不代表应用后台也能访问 Anybox。请重新启动代理软件或切换网络后重试。"
    case "proxy_connection_failed":
      return "无法连接 Anybox。系统代理不可用，请确认本机网络可以访问 Anybox 后重试。"
    case "http_error":
      return "Anybox 返回了 HTTP 错误。"
    case "tls_verification_failed":
    case "tcp_reset":
    case "dns_error":
    case "timeout":
    case "network_error":
    default:
      return "无法连接 Anybox。本机网络代理或 DNS 设置可能正在影响连接，请检查代理软件或切换网络后重试。"
  }
}

async function classifyFetchError(error: unknown, target: URL, diagnostics: AnyboxDiagnostics): Promise<AnyboxHTTPError> {
  const nextDiagnostics: AnyboxDiagnostics = {
    ...diagnostics,
    originalMessage: messageFromError(error),
  }

  const addresses = diagnostics.proxySource === "none" ? await resolveTargetAddresses(target) : undefined
  if (addresses?.length) {
    nextDiagnostics.dnsAddresses = addresses
    nextDiagnostics.fakeIPDetected = addresses.some(isFakeIP)
  }

  const code: AnyboxErrorCode = nextDiagnostics.fakeIPDetected
    ? "dns_fake_ip"
    : classifyByMessage(error, nextDiagnostics)
  return new AnyboxHTTPError(code, userFacingMessage(code), nextDiagnostics, { cause: error })
}

function toURL(input: AnyboxFetchInput) {
  if (typeof input === "string") return new URL(input)
  if (input instanceof URL) return input
  return new URL(input.url)
}

export async function createAnyboxDiagnostics(input: AnyboxFetchInput) {
  const target = toURL(input)
  const resolved = await resolveProxy(target)
  return diagnosticsFor(target, resolved)
}

export async function anyboxFetch(input: AnyboxFetchInput, init: RequestInit | undefined = undefined) {
  const target = toURL(input)
  const resolved = await resolveProxy(target)
  const diagnostics = diagnosticsFor(target, resolved)
  const nextInit: RequestInit & { proxy?: string } = {
    ...(init ?? {}),
  }

  if (resolved.proxy) nextInit.proxy = resolved.proxy

  try {
    return await deps().fetch(input, nextInit)
  } catch (error) {
    throw await classifyFetchError(error, target, diagnostics)
  }
}
