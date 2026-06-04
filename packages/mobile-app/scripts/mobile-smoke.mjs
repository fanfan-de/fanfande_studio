const DEFAULT_DEVICE_NAME = "Anybox Mobile Smoke Test"

function usage() {
  return [
    "Anybox Mobile Smoke Test",
    "",
    "Usage:",
    "  pnpm --filter anybox-mobile-app run smoke -- --url \"http://192.168.1.20:4896/?code=...\"",
    "  pnpm --filter anybox-mobile-app run smoke -- --url \"anybox-mobile://connect?url=...\"",
    "",
    "Options:",
    "  --url <value>       Bridge URL or anybox-mobile://connect deep link.",
    "  --token <value>     Bridge token when the URL does not include token/code.",
    "  --keep-device       Keep the paired smoke-test device instead of revoking it.",
    "  --help              Show this help.",
    "",
    "Environment:",
    "  MOBILE_BRIDGE_URL",
    "  MOBILE_BRIDGE_TOKEN",
    "  MOBILE_SMOKE_KEEP_DEVICE=1",
  ].join("\n")
}

function readArgs(argv) {
  const result = {
    help: false,
    keepDevice: process.env.MOBILE_SMOKE_KEEP_DEVICE === "1",
    token: process.env.MOBILE_BRIDGE_TOKEN ?? "",
    url: process.env.MOBILE_BRIDGE_URL ?? "",
  }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === "--help" || value === "-h") {
      result.help = true
    } else if (value === "--keep-device") {
      result.keepDevice = true
    } else if (value === "--url") {
      result.url = argv[index + 1] ?? ""
      index += 1
    } else if (value === "--token") {
      result.token = argv[index + 1] ?? ""
      index += 1
    } else if (!value.startsWith("--") && !result.url) {
      result.url = value
    }
  }

  return result
}

function readBridgeUrlFromConnectDeepLink(value) {
  try {
    const parsed = new URL(value.trim())
    const route = parsed.hostname || parsed.pathname.replace(/^\/+/, "")
    if (parsed.protocol !== "anybox-mobile:" || route !== "connect") return null
    return parsed.searchParams.get("url")?.trim() || null
  } catch {
    return null
  }
}

function normalizeConnectionInput(endpoint, tokenInput) {
  const rawEndpoint = readBridgeUrlFromConnectDeepLink(endpoint) ?? endpoint.trim()
  if (!rawEndpoint) {
    throw new Error("Bridge URL is required.")
  }

  const candidate = /^[a-z][a-z\d+\-.]*:\/\//i.test(rawEndpoint) ? rawEndpoint : `http://${rawEndpoint}`
  const parsed = new URL(candidate)
  const tokenFromUrl = parsed.searchParams.get("token")?.trim() ?? ""
  const pairingCode = parsed.searchParams.get("code")?.trim() ?? ""
  const token = tokenInput.trim() || tokenFromUrl

  return {
    baseUrl: parsed.origin,
    pairingCode: pairingCode || undefined,
    token,
  }
}

async function requestMobile(connection, path, options = {}) {
  const headers = {
    accept: "application/json",
    "content-type": "application/json",
    ...(options.headers ?? {}),
  }
  if (connection.token) headers.authorization = `Bearer ${connection.token}`

  const response = await fetch(`${connection.baseUrl}${path}`, {
    ...options,
    headers,
  })
  const text = await response.text()
  const value = text.trim() ? JSON.parse(text) : null

  if (!response.ok) {
    const message = value?.error?.message ?? `HTTP ${response.status}`
    const code = value?.error?.code ? ` (${value.error.code})` : ""
    throw new Error(`${message}${code}`)
  }

  return value?.success === true ? value.data : value
}

async function pairDevice(connection) {
  const params = new URLSearchParams()
  if (connection.pairingCode) params.set("code", connection.pairingCode)
  const query = params.toString()
  return requestMobile(connection, `/api/mobile/pair${query ? `?${query}` : ""}`, {
    method: "POST",
    body: JSON.stringify({ name: DEFAULT_DEVICE_NAME }),
  })
}

async function run() {
  const args = readArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }

  if (!args.url.trim()) {
    console.error(usage())
    process.exit(2)
  }

  const bootstrap = normalizeConnectionInput(args.url, args.token)
  console.log(`Bridge: ${bootstrap.baseUrl}`)

  const publicStatus = await requestMobile({ baseUrl: bootstrap.baseUrl, token: "" }, "/api/mobile/status")
  console.log(`Status: ${publicStatus.online ? "online" : "unknown"} (${publicStatus.desktopName ?? "desktop"} ${publicStatus.appVersion ?? ""})`)

  if (!bootstrap.token && !bootstrap.pairingCode) {
    console.log("Secure checks skipped: provide a bridge token or pairing code to test authenticated mobile APIs.")
    return
  }

  const pairing = await pairDevice(bootstrap)
  const connection = {
    baseUrl: bootstrap.baseUrl,
    token: pairing.token,
  }

  console.log(`Paired: ${pairing.device.name} (${pairing.device.id})`)
  console.log(`Capabilities: ${pairing.device.capabilities.join(", ")}`)

  const [status, workspaces, approvals] = await Promise.all([
    requestMobile(connection, "/api/mobile/status"),
    requestMobile(connection, "/api/mobile/workspaces"),
    requestMobile(connection, "/api/mobile/approvals"),
  ])

  console.log(`Authenticated status: ${status.online ? "online" : "unknown"}`)
  console.log(`Workspaces: ${Array.isArray(workspaces) ? workspaces.length : 0}`)
  console.log(`Pending approvals: ${Array.isArray(approvals) ? approvals.length : 0}`)

  if (args.keepDevice) {
    console.log("Kept paired smoke-test device.")
    return
  }

  const revoke = await requestMobile(connection, "/api/mobile/devices/me/revoke", { method: "POST" })
  console.log(`Revoked smoke-test device: ${revoke.revoked ? "yes" : "no"}`)
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
