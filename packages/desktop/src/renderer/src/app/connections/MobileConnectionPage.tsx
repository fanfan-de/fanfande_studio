import { useEffect, useMemo, useState } from "react"
import QRCode from "qrcode"
import type { DesktopMobileBridgeStatus, DesktopMobileDeviceSummary } from "../../../../shared/desktop-ipc-contract"
import { CopyIcon, ResetIcon, SmartphoneIcon } from "../icons"
import { writeTextToClipboard } from "../shared-ui"

function formatStartedAt(value: number | null) {
  if (!value) return "Not running"
  return new Date(value).toLocaleString()
}

function formatDeviceTime(value: number) {
  return new Date(value).toLocaleString()
}

function formatPairingExpiry(expiresAt: number | null, now: number) {
  if (!expiresAt) return "Unavailable"
  const remaining = Math.max(0, expiresAt - now)
  const minutes = Math.floor(remaining / 60_000)
  const seconds = Math.floor((remaining % 60_000) / 1000)
  return remaining > 0 ? `Expires in ${minutes}:${String(seconds).padStart(2, "0")}` : "Expired"
}

function isLoopbackBridgeHost(host: string) {
  const normalized = host.toLowerCase()
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1"
}

function getPrimaryUrl(status: DesktopMobileBridgeStatus | null) {
  if (!status) return ""
  if (status.publicUrl) return status.publicUrl
  return isLoopbackBridgeHost(status.host) ? (status.localUrl ?? "") : (status.urls[0] ?? "")
}

function getPrimaryPairingUrl(status: DesktopMobileBridgeStatus | null) {
  if (!status) return ""
  if (status.publicPairingUrl) return status.publicPairingUrl
  return isLoopbackBridgeHost(status.host) ? (status.pairingLocalUrl ?? "") : (status.pairingUrls[0] ?? "")
}

function uniqueUrls(urls: Array<string | null | undefined>) {
  return urls.filter((url, index): url is string => Boolean(url) && urls.indexOf(url) === index)
}

function getPairingUrls(status: DesktopMobileBridgeStatus | null) {
  if (!status) return []
  const localUrls = isLoopbackBridgeHost(status.host) ? [status.pairingLocalUrl] : status.pairingUrls
  return uniqueUrls([status.publicPairingUrl, ...localUrls])
}

function getLegacyUrls(status: DesktopMobileBridgeStatus | null) {
  if (!status) return []
  const localUrls = isLoopbackBridgeHost(status.host) ? [status.localUrl] : status.urls
  return uniqueUrls([status.publicUrl, ...localUrls])
}

function createPairingDeepLink(url: string) {
  return url ? `anybox-mobile://connect?url=${encodeURIComponent(url)}` : ""
}

function getPrimaryPairingDeepLink(status: DesktopMobileBridgeStatus | null, pairingUrl: string) {
  return status?.cloudRelay.enabled && status.cloudRelay.pairingDeepLink
    ? status.cloudRelay.pairingDeepLink
    : createPairingDeepLink(pairingUrl)
}

function quotePowerShellArgument(value: string) {
  return `"${value.replace(/`/g, "``").replace(/"/g, '`"')}"`
}

function createAndroidSmokeCommand(deepLink: string) {
  return deepLink ? `corepack pnpm mobile:android:smoke:bridge -- --url ${quotePowerShellArgument(deepLink)}` : ""
}

function getActiveDeviceCount(devices: DesktopMobileDeviceSummary[] | undefined) {
  return (devices ?? []).filter((device) => !device.revokedAt).length
}

function formatCapabilities(capabilities: string[]) {
  return capabilities.length ? capabilities.join(", ") : "No capabilities recorded"
}

function formatCloudRelayDetail(status: DesktopMobileBridgeStatus | null) {
  if (!status?.cloudRelay.enabled) return status?.cloudRelay.lastError ?? "Not configured"
  const baseUrl = status.cloudRelay.baseUrl ?? "Relay URL unavailable"
  const account = status.cloudRelay.account ?? { state: "unknown" as const }
  const accountLabel =
    account.state === "connected"
      ? account.email
        ? `Account discovery: ${account.email}`
        : "Account discovery enabled"
      : account.state === "not_connected"
        ? "Sign in to Anybox Provider for no-scan discovery"
        : account.state === "error"
          ? account.lastError ?? "Account discovery unavailable"
          : "Account discovery unknown"
  return `${baseUrl} - ${accountLabel}`
}

export function MobileConnectionPage() {
  const [status, setStatus] = useState<DesktopMobileBridgeStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [isRefreshingPairing, setIsRefreshingPairing] = useState(false)
  const [isRotating, setIsRotating] = useState(false)
  const [isLegacyOpen, setIsLegacyOpen] = useState(false)
  const [revokingDeviceID, setRevokingDeviceID] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  async function refreshStatus() {
    try {
      if (!window.desktop?.getMobileBridgeStatus) {
        throw new Error("Desktop mobile bridge is unavailable.")
      }
      setError(null)
      setStatus(await window.desktop.getMobileBridgeStatus())
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    }
  }

  useEffect(() => {
    void refreshStatus()
  }, [])

  useEffect(() => {
    if (!status?.pairingExpiresAt) return undefined
    const delay = Math.max(1000, status.pairingExpiresAt - Date.now() + 500)
    const timeout = window.setTimeout(() => {
      void refreshStatus()
    }, delay)
    return () => window.clearTimeout(timeout)
  }, [status?.pairingExpiresAt])

  useEffect(() => {
    if (!status?.pairingExpiresAt) return undefined
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [status?.pairingExpiresAt])

  const primaryUrl = useMemo(() => getPrimaryUrl(status), [status])
  const primaryPairingUrl = useMemo(() => getPrimaryPairingUrl(status), [status])
  const pairingUrls = useMemo(() => getPairingUrls(status), [status])
  const legacyUrls = useMemo(() => getLegacyUrls(status), [status])
  const pairingDeepLink = useMemo(() => getPrimaryPairingDeepLink(status, primaryPairingUrl), [primaryPairingUrl, status])
  const androidSmokeCommand = useMemo(() => createAndroidSmokeCommand(pairingDeepLink), [pairingDeepLink])
  const pairingExpiryLabel = formatPairingExpiry(status?.cloudRelay.pairingExpiresAt ?? status?.pairingExpiresAt ?? null, now)

  useEffect(() => {
    let cancelled = false
    if (!pairingDeepLink) {
      setQrDataUrl(null)
      return undefined
    }

    void QRCode.toDataURL(pairingDeepLink, {
      errorCorrectionLevel: "M",
      margin: 1,
      scale: 6,
      type: "image/png",
    })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl)
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null)
      })

    return () => {
      cancelled = true
    }
  }, [pairingDeepLink])

  async function copyValue(label: string, value: string) {
    if (!value) return
    await writeTextToClipboard(value)
    setCopied(label)
    window.setTimeout(() => setCopied((current) => current === label ? null : current), 1600)
  }

  async function rotateToken() {
    setIsRotating(true)
    try {
      if (!window.desktop?.rotateMobileBridgeToken) {
        throw new Error("Desktop mobile bridge is unavailable.")
      }
      setStatus(await window.desktop.rotateMobileBridgeToken())
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setIsRotating(false)
    }
  }

  async function refreshPairingCode() {
    setIsRefreshingPairing(true)
    try {
      if (!window.desktop?.refreshMobilePairingCode) {
        throw new Error("Desktop mobile bridge is unavailable.")
      }
      setError(null)
      setStatus(await window.desktop.refreshMobilePairingCode())
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setIsRefreshingPairing(false)
    }
  }

  async function revokeDevice(deviceID: string) {
    setRevokingDeviceID(deviceID)
    try {
      if (!window.desktop?.revokeMobileDevice) {
        throw new Error("Device management is unavailable.")
      }
      setError(null)
      setStatus(await window.desktop.revokeMobileDevice({ deviceID }))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setRevokingDeviceID(null)
    }
  }

  const devices = status?.devices ?? []
  const activeDeviceCount = getActiveDeviceCount(devices)

  return (
    <section className="mobile-connection-page" aria-label="Mobile connection">
      <div className="mobile-connection-shell">
        <header className="mobile-connection-hero">
          <span className="mobile-connection-icon" aria-hidden="true">
            <SmartphoneIcon />
          </span>
          <div>
            <h1>Mobile connection</h1>
            <p>Pair Anybox Mobile with this desktop through the cloud relay, with local bridge fallback available.</p>
          </div>
        </header>

        {error ? <div className="settings-banner is-error">{error}</div> : null}

        <section className="mobile-connection-grid">
          <article className="mobile-connection-card">
            <span className="settings-field-label">Bridge status</span>
            <strong>{status?.running ? "Running" : "Stopped"}</strong>
            <small>{formatStartedAt(status?.startedAt ?? null)}</small>
          </article>
          <article className="mobile-connection-card">
            <span className="settings-field-label">Listening address</span>
            <strong>{status?.host ?? "0.0.0.0"}</strong>
            <small>{status?.port ? `Port ${status.port}` : "Port unavailable"}</small>
          </article>
          <article className="mobile-connection-card">
            <span className="settings-field-label">Paired devices</span>
            <strong>{activeDeviceCount}</strong>
            <small>{devices.length ? `${devices.length} records` : "No devices"}</small>
          </article>
          <article className="mobile-connection-card">
            <span className="settings-field-label">Cloud relay</span>
            <strong>{status?.cloudRelay.state ?? "disabled"}</strong>
            <small>{formatCloudRelayDetail(status)}</small>
          </article>
        </section>

        <section className="mobile-connection-panel">
          <div className="settings-section-header">
            <div>
              <h3>Scan to connect Anybox Mobile</h3>
              <p>{pairingExpiryLabel}</p>
            </div>
            <div className="settings-inline-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={isRefreshingPairing}
                onClick={() => void refreshPairingCode()}
              >
                <ResetIcon />
                {isRefreshingPairing ? "Refreshing" : "Refresh QR"}
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={!pairingDeepLink}
                onClick={() => void copyValue("deeplink", pairingDeepLink)}
              >
                <CopyIcon />
                {copied === "deeplink" ? "Copied" : "Copy deep link"}
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={!androidSmokeCommand}
                onClick={() => void copyValue("smoke-command", androidSmokeCommand)}
              >
                <CopyIcon />
                {copied === "smoke-command" ? "Copied" : "Copy test command"}
              </button>
            </div>
          </div>

          <div className="mobile-connection-qr" aria-label="Mobile connection QR code">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Mobile connection QR code" />
            ) : (
              <span>{pairingDeepLink || primaryPairingUrl ? "Generating" : "Unavailable"}</span>
            )}
          </div>

          <div className="mobile-connection-url-list">
            {pairingDeepLink ? (
              <button
                type="button"
                className="mobile-connection-url-row"
                onClick={() => void copyValue("deeplink-row", pairingDeepLink)}
              >
                <span>{pairingDeepLink}</span>
                <CopyIcon />
              </button>
            ) : null}
            {pairingUrls.map((url) => (
              <button
                key={url}
                type="button"
                className="mobile-connection-url-row"
                onClick={() => void copyValue(url, url)}
              >
                <span>{url}</span>
                <CopyIcon />
              </button>
            ))}
            {androidSmokeCommand ? (
              <button
                type="button"
                className="mobile-connection-url-row"
                onClick={() => void copyValue("smoke-command-row", androidSmokeCommand)}
              >
                <span>{androidSmokeCommand}</span>
                <CopyIcon />
              </button>
            ) : null}
            {status && pairingUrls.length === 0 ? (
              <div className="mobile-connection-empty">No local pairing address is available.</div>
            ) : null}
          </div>
        </section>

        <section className="mobile-connection-panel">
          <div className="settings-section-header">
            <div>
              <h3>Advanced token access</h3>
            </div>
            <button
              type="button"
              className="secondary-button"
              aria-expanded={isLegacyOpen}
              onClick={() => setIsLegacyOpen((current) => !current)}
            >
              {isLegacyOpen ? "Hide advanced" : "Show advanced"}
            </button>
          </div>

          {isLegacyOpen ? (
            <>
              <div className="settings-inline-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!primaryUrl}
                  onClick={() => void copyValue("legacy-url", primaryUrl)}
                >
                  <CopyIcon />
                  {copied === "legacy-url" ? "Copied" : "Copy legacy URL"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!status?.token}
                  onClick={() => void copyValue("token", status?.token ?? "")}
                >
                  <CopyIcon />
                  {copied === "token" ? "Copied" : "Copy token"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={isRotating}
                  onClick={() => void rotateToken()}
                >
                  <ResetIcon />
                  {isRotating ? "Refreshing" : "Rotate token"}
                </button>
              </div>
              <div className="mobile-connection-url-list">
                {legacyUrls.map((url) => (
                  <button
                    key={url}
                    type="button"
                    className="mobile-connection-url-row"
                    onClick={() => void copyValue(`legacy-${url}`, url)}
                  >
                    <span>{url}</span>
                    <CopyIcon />
                  </button>
                ))}
              </div>
              <code className="mobile-connection-token">{status?.token ?? ""}</code>
            </>
          ) : null}
        </section>

        <section className="mobile-connection-panel">
          <div className="settings-section-header">
            <div>
              <h3>Paired devices</h3>
            </div>
            <button type="button" className="secondary-button" onClick={() => void refreshStatus()}>
              Refresh
            </button>
          </div>

          <div className="mobile-connection-device-list">
            {devices.length ? (
              devices.map((device) => {
                const revoked = Boolean(device.revokedAt)
                return (
                  <div key={device.id} className={revoked ? "mobile-connection-device-row is-revoked" : "mobile-connection-device-row"}>
                    <div className="mobile-connection-device-main">
                      <strong>{device.name}</strong>
                      <span>{formatCapabilities(device.capabilities)}</span>
                    </div>
                    <span>{revoked ? "Revoked" : `Last seen ${formatDeviceTime(device.lastSeenAt)}`}</span>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={revoked || revokingDeviceID === device.id}
                      onClick={() => void revokeDevice(device.id)}
                    >
                      {revokingDeviceID === device.id ? "Revoking" : "Revoke"}
                    </button>
                  </div>
                )
              })
            ) : (
              <div className="mobile-connection-empty">Paired Android devices will appear here.</div>
            )}
          </div>
        </section>
      </div>
    </section>
  )
}
