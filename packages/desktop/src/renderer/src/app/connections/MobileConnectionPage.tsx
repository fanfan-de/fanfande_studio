import { useEffect, useMemo, useState } from "react"
import QRCode from "qrcode"
import type { DesktopMobileBridgeStatus, DesktopMobileDeviceSummary } from "../../../../shared/desktop-ipc-contract"
import { CopyIcon, ResetIcon, SmartphoneIcon } from "../icons"
import { writeTextToClipboard } from "../shared-ui"

function formatStartedAt(value: number | null) {
  if (!value) return "未运行"
  return new Date(value).toLocaleString()
}

function formatDeviceTime(value: number) {
  return new Date(value).toLocaleString()
}

function getPrimaryUrl(status: DesktopMobileBridgeStatus | null) {
  return status?.urls[0] ?? status?.localUrl ?? ""
}

function getPrimaryPairingUrl(status: DesktopMobileBridgeStatus | null) {
  return status?.pairingUrls[0] ?? status?.pairingLocalUrl ?? getPrimaryUrl(status)
}

function getPairingUrls(status: DesktopMobileBridgeStatus | null) {
  if (!status) return []
  if (status.pairingUrls.length) return status.pairingUrls
  return status.pairingLocalUrl ? [status.pairingLocalUrl] : []
}

function getLegacyUrls(status: DesktopMobileBridgeStatus | null) {
  if (!status) return []
  if (status.urls.length) return status.urls
  return status.localUrl ? [status.localUrl] : []
}

function createPairingDeepLink(url: string) {
  return url ? `anybox-mobile://connect?url=${encodeURIComponent(url)}` : ""
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
  return capabilities.length ? capabilities.join(", ") : "无权限记录"
}

export function MobileConnectionPage() {
  const [status, setStatus] = useState<DesktopMobileBridgeStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [isRefreshingPairing, setIsRefreshingPairing] = useState(false)
  const [isRotating, setIsRotating] = useState(false)
  const [revokingDeviceID, setRevokingDeviceID] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  async function refreshStatus() {
    try {
      if (!window.desktop?.getMobileBridgeStatus) {
        throw new Error("桌面桥接不可用。")
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

  const primaryUrl = useMemo(() => getPrimaryUrl(status), [status])
  const primaryPairingUrl = useMemo(() => getPrimaryPairingUrl(status), [status])
  const pairingUrls = useMemo(() => getPairingUrls(status), [status])
  const legacyUrls = useMemo(() => getLegacyUrls(status), [status])
  const pairingDeepLink = useMemo(() => createPairingDeepLink(primaryPairingUrl), [primaryPairingUrl])
  const androidSmokeCommand = useMemo(() => createAndroidSmokeCommand(pairingDeepLink), [pairingDeepLink])

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
        throw new Error("桌面桥接不可用。")
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
        throw new Error("桌面桥接不可用。")
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
        throw new Error("设备管理不可用。")
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
    <section className="mobile-connection-page" aria-label="手机连接">
      <div className="mobile-connection-shell">
        <header className="mobile-connection-hero">
          <span className="mobile-connection-icon" aria-hidden="true">
            <SmartphoneIcon />
          </span>
          <div>
            <h1>手机连接</h1>
            <p>在同一 Wi-Fi 下用手机打开局域网地址，即可访问项目、最近会话、聊天记录和流式回复。</p>
          </div>
        </header>

        {error ? <div className="settings-banner is-error">{error}</div> : null}

        <section className="mobile-connection-grid">
          <article className="mobile-connection-card">
            <span className="settings-field-label">桥接状态</span>
            <strong>{status?.running ? "运行中" : "已停止"}</strong>
            <small>{formatStartedAt(status?.startedAt ?? null)}</small>
          </article>
          <article className="mobile-connection-card">
            <span className="settings-field-label">监听地址</span>
            <strong>{status?.host ?? "0.0.0.0"}</strong>
            <small>{status?.port ? `端口 ${status.port}` : "端口不可用"}</small>
          </article>
          <article className="mobile-connection-card">
            <span className="settings-field-label">已配对设备</span>
            <strong>{activeDeviceCount}</strong>
            <small>{devices.length ? `${devices.length} 条记录` : "暂无设备"}</small>
          </article>
        </section>

        <section className="mobile-connection-panel">
          <div className="settings-section-header">
            <div>
              <h3>Android 配对</h3>
              <p>扫描二维码或复制深链打开 Anybox Mobile。配对地址使用短期一次性 code，成功后安卓端会换成独立设备 token。</p>
            </div>
            <div className="settings-inline-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={isRefreshingPairing}
                onClick={() => void refreshPairingCode()}
              >
                <ResetIcon />
                {isRefreshingPairing ? "刷新中" : "刷新配对码"}
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={!pairingDeepLink}
                onClick={() => void copyValue("deeplink", pairingDeepLink)}
              >
                <CopyIcon />
                {copied === "deeplink" ? "已复制" : "复制 Android 深链"}
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={!primaryPairingUrl}
                onClick={() => void copyValue("pairing-url", primaryPairingUrl)}
              >
                <CopyIcon />
                {copied === "pairing-url" ? "已复制" : "复制配对 URL"}
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={!androidSmokeCommand}
                onClick={() => void copyValue("smoke-command", androidSmokeCommand)}
              >
                <CopyIcon />
                {copied === "smoke-command" ? "已复制" : "复制验收命令"}
              </button>
            </div>
          </div>

          <div className="mobile-connection-qr" aria-label="Mobile connection QR code">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Mobile connection QR code" />
            ) : (
              <span>{primaryUrl ? "Generating" : "Unavailable"}</span>
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
            {status && pairingUrls.length === 0 ? (
              <div className="mobile-connection-empty">没有检测到局域网配对地址。请检查网络适配器、防火墙，或先用本机 localhost 调试。</div>
            ) : null}
          </div>
        </section>

        <section className="mobile-connection-panel">
          <div className="settings-section-header">
            <div>
              <h3>Legacy token 访问</h3>
              <p>仅用于旧浏览器页面或手动调试。安卓正式路径应使用上方一次性配对 code。</p>
            </div>
            <div className="settings-inline-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={!primaryUrl}
                onClick={() => void copyValue("legacy-url", primaryUrl)}
              >
                <CopyIcon />
                {copied === "legacy-url" ? "已复制" : "复制旧 URL"}
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={!status?.token}
                onClick={() => void copyValue("token", status?.token ?? "")}
              >
                <CopyIcon />
                {copied === "token" ? "已复制" : "复制 token"}
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={isRotating}
                onClick={() => void rotateToken()}
              >
                <ResetIcon />
                {isRotating ? "刷新中" : "刷新"}
              </button>
            </div>
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
        </section>

        <section className="mobile-connection-panel">
          <div className="settings-section-header">
            <div>
              <h3>已配对设备</h3>
            </div>
            <button type="button" className="secondary-button" onClick={() => void refreshStatus()}>
              刷新
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
                    <span>{revoked ? "已撤销" : `最近在线 ${formatDeviceTime(device.lastSeenAt)}`}</span>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={revoked || revokingDeviceID === device.id}
                      onClick={() => void revokeDevice(device.id)}
                    >
                      {revokingDeviceID === device.id ? "撤销中" : "撤销"}
                    </button>
                  </div>
                )
              })
            ) : (
              <div className="mobile-connection-empty">安卓端完成首次连接后会显示在这里。</div>
            )}
          </div>
        </section>
      </div>
    </section>
  )
}
