import { useEffect, useMemo, useState } from "react"
import type { DesktopMobileBridgeStatus } from "../../../../shared/desktop-ipc-contract"
import { CopyIcon, ResetIcon, SmartphoneIcon } from "../icons"
import { writeTextToClipboard } from "../shared-ui"

function formatStartedAt(value: number | null) {
  if (!value) return "未运行"
  return new Date(value).toLocaleString()
}

function getPrimaryUrl(status: DesktopMobileBridgeStatus | null) {
  return status?.urls[0] ?? status?.localUrl ?? ""
}

export function MobileConnectionPage() {
  const [status, setStatus] = useState<DesktopMobileBridgeStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [isRotating, setIsRotating] = useState(false)

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

  const primaryUrl = useMemo(() => getPrimaryUrl(status), [status])

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
        </section>

        <section className="mobile-connection-panel">
          <div className="settings-section-header">
            <div>
              <h3>手机访问地址</h3>
              <p>复制同一 Wi-Fi 下可访问的地址。复制的 URL 已包含访问 token。</p>
            </div>
            <button
              type="button"
              className="secondary-button"
              disabled={!primaryUrl}
              onClick={() => void copyValue("url", primaryUrl)}
            >
              <CopyIcon />
              {copied === "url" ? "已复制" : "复制 URL"}
            </button>
          </div>

          <div className="mobile-connection-url-list">
            {(status?.urls.length ? status.urls : status?.localUrl ? [status.localUrl] : []).map((url) => (
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
            {status && status.urls.length === 0 ? (
              <div className="mobile-connection-empty">没有检测到局域网地址。可先在本机用 localhost 访问，或检查网络适配器。</div>
            ) : null}
          </div>
        </section>

        <section className="mobile-connection-panel">
          <div className="settings-section-header">
            <div>
              <h3>访问 token</h3>
              <p>如果想让已复制的手机链接失效，可以刷新 token。</p>
            </div>
            <div className="settings-inline-actions">
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
          <code className="mobile-connection-token">{status?.token ?? ""}</code>
        </section>
      </div>
    </section>
  )
}
